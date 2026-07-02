#!/usr/bin/env python3
"""
nightly_update.py — StatIppica
Eseguito ogni notte su Render (cron job o trigger esterno).

Fasi:
  0. RESULTS    — legge hRis.php per ogni ippodromo degli ultimi 2 gg,
                  inserisce gare nuove e aggiunge cavalli sconosciuti al DB
                  (i cavalli nuovi vengono messi subito in pari con la carriera completa)
  1. DISCOVERY  — legge homepage Trottoweb, trova cavalli nuovi, inserisce carriera completa
  2. UPDATE     — aggiorna cavalli attivi (ultimi 6 mesi) con nuove gare
  2b. BACKFILL  — ricontrolla a rotazione i cavalli esistenti (dal 2012 in poi) per colmare
                  eventuali buchi nello storico gare, un batch per notte
  3. RATINGS    — ricalcola rating SSS..F per tutti i cavalli
                  + rating stalloni con volume multiplier + boost vendopuledri
  4. SYNC       — copia DB in data.db (root del repo)
  5. GIT PUSH   — git push su GitHub → Render rideploya automaticamente
  6. NOTIFICA   — stampa JSON {new_horses, new_races, horses_updated, horses_backfilled}

Output finale su stdout (ultima riga): JSON con chiavi new_horses, new_races, horses_updated, horses_backfilled
"""

import os
import re
import json
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
TROTTOWEB_BASE  = "https://www.trottoweb.it/TrottoWeb/php_resp"
TROTTOWEB_HORSE = "https://www.trottoweb.it/TrottoWeb/php_resp/horse.php"
# ATTENZIONE: hCav.php e races.php (sotto www.trottoweb.it/.../php_resp/) NON ESISTONO —
# erano endpoint mai verificati. L'endpoint reale che restituisce profilo + storico gare
# completo (senza bisogno di JavaScript) vive sul dominio legacy trottoweb.com:
TROTTOWEB_CAVAN = "http://www.trottoweb.com/Sviluppo/php/cavAn.php"

DB_PATH       = Path(os.environ.get("DB_PATH", "trotto_master.db"))
REPO_DB_PATH  = Path(os.environ.get("REPO_DB_PATH", "data.db"))  # root repo

GITHUB_TOKEN  = os.environ.get("GITHUB_TOKEN", "")
GITHUB_USER   = os.environ.get("GITHUB_USER", "matteopetracca6-bit")
GITHUB_REPO   = os.environ.get("GITHUB_REPO", "statippica")

ACTIVE_MONTHS = 6
# Anche i cavalli "attivi" possono essere tanti (migliaia): limitiamo quanti
# riscaricare per notte, dando priorità a quelli aggiornati meno di recente,
# così ogni run fa progressi garantiti senza rischiare timeout illimitati.
ACTIVE_UPDATE_BATCH_SIZE = int(os.environ.get("ACTIVE_UPDATE_BATCH_SIZE", "3000"))
REQUEST_DELAY = 0.5

# Lavoriamo solo con gare dal 2012 in avanti (storico precedente non tracciato)
MIN_RACE_DATE = os.environ.get("MIN_RACE_DATE", "2012-01-01")

# Backfill storico: quanti cavalli "mettere in pari" per ogni esecuzione notturna.
# Il cron gira lun+gio, quindi con batch=250 ~22.000 cavalli vengono coperti in poche settimane.
BACKFILL_BATCH_SIZE = int(os.environ.get("BACKFILL_BATCH_SIZE", "250"))
# Dopo quanti giorni un cavallo già "done" viene ricontrollato (Trottoweb può correggere dati vecchi)
REBACKFILL_DAYS = int(os.environ.get("REBACKFILL_DAYS", "180"))

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "StatIppica-NightlyBot/1.0 (+https://github.com/matteopetracca6-bit/statippica)"
})

# ─────────────────────────────────────────────
# VOLUME MULTIPLIER — stalloni
# ─────────────────────────────────────────────
def volume_multiplier(n: int) -> float:
    if n == 1:   return 0.40
    if n == 2:   return 0.55
    if n == 3:   return 0.65
    if n == 4:   return 0.75
    if n <= 9:   return 0.85
    if n <= 19:  return 0.92
    if n <= 49:  return 0.97
    return 1.00

# ─────────────────────────────────────────────
# GRADE MAP
# ─────────────────────────────────────────────
GRADE_WEIGHTS = {
    "SSS": 100, "SS": 85, "S": 70, "A": 55, "B": 40,
    "C": 25, "D": 15, "E": 8, "F": 2
}

# Soglie rating cavalli (performance)
HORSE_GRADE_THRESHOLDS = [
    (97, "SSS"), (90, "SS"), (80, "S"), (65, "A"),
    (50, "B"),  (35, "C"),  (20, "D"), (10, "E"), (0, "F"),
]

# Soglie rating stalloni
# Soglie stalloni: calcolate dinamicamente sui percentili del dataset reale
# (sostituite a runtime da build_stallion_grade_thresholds)
STALLION_GRADE_THRESHOLDS: list[tuple[float, str]] = []

def build_stallion_grade_thresholds(scores: list[float]) -> list[tuple[float, str]]:
    """
    Calibra le soglie sui percentili del dataset reale.
    SSS = top 3%, SS = top 8%, S = top 18%, A = top 35%,
    B = top 55%, C = top 72%, D = top 85%, E = top 93%, F = resto
    """
    if not scores:
        return [(0, "F")]
    s = sorted(scores)
    n = len(s)
    def pv(p): return s[min(int(p / 100 * n), n - 1)]
    return [
        (pv(97), "SSS"), (pv(92), "SS"), (pv(82), "S"), (pv(65), "A"),
        (pv(45), "B"),   (pv(28), "C"),  (pv(15), "D"), (pv(7),  "E"),
        (0,      "F"),
    ]

def score_to_horse_grade(score: float) -> str:
    for threshold, grade in HORSE_GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "F"

def score_to_stallion_grade(score: float, thresholds: list[tuple[float, str]] | None = None) -> str:
    thr = thresholds or STALLION_GRADE_THRESHOLDS
    for threshold, grade in thr:
        if score >= threshold:
            return grade
    return "F"

# ─────────────────────────────────────────────
# DB INIT
# ─────────────────────────────────────────────
def init_db(conn: sqlite3.Connection):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS horses (
        name            TEXT NOT NULL,
        birth_year      INTEGER,
        sex             TEXT,
        country         TEXT,
        sire            TEXT,
        dam             TEXT,
        unire_sire      TEXT,
        unire_dam       TEXT,
        career_races    INTEGER DEFAULT 0,
        career_wins     INTEGER DEFAULT 0,
        career_places   INTEGER DEFAULT 0,
        career_earnings REAL DEFAULT 0,
        record_career   TEXT,
        record_short    TEXT,
        record_long     TEXT,
        last_updated    TEXT,
        PRIMARY KEY (name, birth_year)
    );

    CREATE TABLE IF NOT EXISTS races (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        horse_name    TEXT NOT NULL,
        race_date     TEXT,
        track         TEXT,
        placement     INTEGER,
        placement_raw TEXT,
        time_km       TEXT,
        distance      INTEGER,
        driver        TEXT,
        prize_net     REAL,
        prize_gross   REAL,
        race_code     TEXT,
        UNIQUE(horse_name, race_date, race_code)
    );

    CREATE TABLE IF NOT EXISTS horse_ratings (
        name            TEXT NOT NULL,
        birth_year      INTEGER,
        sire            TEXT,
        grade           TEXT,
        score           REAL,
        earn_percentile REAL,
        time_percentile REAL,
        sire_percentile REAL,
        career_races    INTEGER,
        career_wins     INTEGER,
        career_earnings REAL,
        record_career   TEXT,
        win_rate        REAL,
        rating_mode     TEXT DEFAULT 'performance',
        last_updated    TEXT,
        PRIMARY KEY (name, birth_year, rating_mode)
    );

    CREATE TABLE IF NOT EXISTS stallion_rating_stats (
        sire             TEXT PRIMARY KEY,
        n_figli_totali   INTEGER,
        n_in_corsa       INTEGER,
        avg_score        REAL,
        grade            TEXT,
        n_SSS            INTEGER DEFAULT 0,
        n_SS             INTEGER DEFAULT 0,
        n_S              INTEGER DEFAULT 0,
        pct_top_S        REAL,
        avg_earnings     REAL,
        vp_boost         REAL DEFAULT 0,
        final_score      REAL,
        last_updated     TEXT
    );

    CREATE TABLE IF NOT EXISTS stallions (
        name                  TEXT PRIMARY KEY,
        stud_fee_eur          REAL,
        stud_farm             TEXT,
        stud_status           TEXT DEFAULT 'active',
        country               TEXT,
        progeny_earnings_2024 REAL,
        media_in_corsa        REAL,
        tot_prod              INTEGER,
        tot_in_corsa          INTEGER,
        perc_in_corsa         REAL,
        tot_vitt              INTEGER,
        perc_vitt             REAL,
        last_updated          TEXT
    );

    CREATE TABLE IF NOT EXISTS stallion_pedigree (
        name        TEXT PRIMARY KEY,
        sire        TEXT,
        dam         TEXT,
        sire_sire   TEXT,
        sire_dam    TEXT,
        dam_sire    TEXT,
        dam_dam     TEXT,
        nationality TEXT
    );

    CREATE TABLE IF NOT EXISTS vendopuledri_stalloni_rankings (
        name                  TEXT PRIMARY KEY,
        age                   INTEGER,
        letter                TEXT,
        vp_rank               INTEGER,
        vp_total_offspring    INTEGER,
        vp_total_earnings_eur REAL,
        vp_avg_earnings_eur   REAL,
        vp_top_offspring      TEXT,
        vp_scraped_at         TEXT
    );

    -- Aggiunge colonne vp_* a stallions se non esistono
    -- (SQLite non supporta IF NOT EXISTS per colonne, usiamo try/ignore)
    """)

    # Aggiungi colonne vp_* a stallions senza errori se già presenti
    for col, typ in [
        ("vp_total_offspring",    "INTEGER"),
        ("vp_total_earnings_eur", "REAL"),
        ("vp_avg_earnings_eur",   "REAL"),
        ("vp_rank",               "INTEGER"),
    ]:
        try:
            conn.execute(f"ALTER TABLE stallions ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass  # colonna già esistente

    # Migrazione difensiva: il data.db di produzione può essere stato creato con uno
    # schema più vecchio/ridotto di "horses" (CREATE TABLE IF NOT EXISTS non aggiunge
    # colonne mancanti a una tabella già esistente). Aggiungiamo qui TUTTE le colonne
    # attese, comprese quelle di tracking del backfill storico (gap-filling).
    for col, typ in [
        ("sex",              "TEXT"),
        ("country",          "TEXT"),
        ("sire",             "TEXT"),
        ("dam",              "TEXT"),
        ("unire_sire",       "TEXT"),
        ("unire_dam",        "TEXT"),
        ("career_races",     "INTEGER DEFAULT 0"),
        ("career_wins",      "INTEGER DEFAULT 0"),
        ("career_places",    "INTEGER DEFAULT 0"),
        ("career_earnings",  "REAL DEFAULT 0"),
        ("record_career",    "TEXT"),
        ("record_short",     "TEXT"),
        ("record_long",      "TEXT"),
        ("last_updated",     "TEXT"),
        ("backfill_status",  "TEXT DEFAULT 'pending'"),
        ("last_backfill_at", "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE horses ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass  # colonna già esistente

    # Cavalli inseriti prima di questa modifica non hanno backfill_status -> pending
    conn.execute("UPDATE horses SET backfill_status='pending' WHERE backfill_status IS NULL")

    # Stessa migrazione difensiva anche per horse_ratings e stallion_rating_stats:
    # il data.db di produzione può avere uno schema più vecchio anche qui.
    for col, typ in [
        ("sire",            "TEXT"),
        ("grade",            "TEXT"),
        ("score",            "REAL"),
        ("earn_percentile",  "REAL"),
        ("time_percentile",  "REAL"),
        ("sire_percentile",  "REAL"),
        ("career_races",     "INTEGER"),
        ("career_wins",      "INTEGER"),
        ("career_earnings",  "REAL"),
        ("record_career",    "TEXT"),
        ("win_rate",         "REAL"),
        ("rating_mode",      "TEXT DEFAULT 'performance'"),
        ("last_updated",     "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE horse_ratings ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass

    for col, typ in [
        ("n_figli_totali",  "INTEGER"),
        ("n_in_corsa",      "INTEGER"),
        ("avg_score",       "REAL"),
        ("grade",           "TEXT"),
        ("n_SSS",           "INTEGER DEFAULT 0"),
        ("n_SS",            "INTEGER DEFAULT 0"),
        ("n_S",             "INTEGER DEFAULT 0"),
        ("pct_top_S",       "REAL"),
        ("avg_earnings",    "REAL"),
        ("vp_boost",        "REAL DEFAULT 0"),
        ("final_score",     "REAL"),
        ("last_updated",    "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE stallion_rating_stats ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass

    conn.commit()

# ─────────────────────────────────────────────
# TROTTOWEB HELPERS
# ─────────────────────────────────────────────

# Circuit breaker: se un host rifiuta la connessione troppe volte di fila
# (server giù, blocco temporaneo, ecc.) smettiamo di insistere per il resto
# della run invece di ritentare 3 volte per OGNI richiesta successiva,
# il che sprecherebbe ore su migliaia di cavalli senza recuperare nulla.
_CONSECUTIVE_FAILURES: dict[str, int] = {}
_CIRCUIT_OPEN: set[str] = set()
CIRCUIT_BREAKER_THRESHOLD = int(os.environ.get("CIRCUIT_BREAKER_THRESHOLD", "8"))

def fetch_url(url: str, params: dict = None, retries: int = 3) -> Optional[BeautifulSoup]:
    host = urllib.parse.urlparse(url).netloc

    if host in _CIRCUIT_OPEN:
        return None  # host segnato come irraggiungibile, non ritentiamo nemmeno

    for attempt in range(retries):
        try:
            resp = SESSION.get(url, params=params, timeout=20)
            if resp.status_code == 404:
                # 404 non si risolve ritentando: niente backoff, fallisce subito.
                print(f"  [INFO] fetch {url} -> 404 (pagina inesistente, skip)", file=sys.stderr)
                time.sleep(REQUEST_DELAY)
                _CONSECUTIVE_FAILURES[host] = 0
                return None
            resp.raise_for_status()
            time.sleep(REQUEST_DELAY)
            _CONSECUTIVE_FAILURES[host] = 0
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            print(f"  [WARN] fetch {url} tentativo {attempt+1}/{retries}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt)

    # Tutti i tentativi falliti: conta come UN fallimento verso l'host (non uno per retry)
    _CONSECUTIVE_FAILURES[host] = _CONSECUTIVE_FAILURES.get(host, 0) + 1
    if _CONSECUTIVE_FAILURES[host] >= CIRCUIT_BREAKER_THRESHOLD:
        _CIRCUIT_OPEN.add(host)
        print(f"  [CIRCUIT-BREAKER] {host} irraggiungibile per {CIRCUIT_BREAKER_THRESHOLD} richieste consecutive "
              f"-> smetto di ritentare per il resto di questa run.", file=sys.stderr)
    return None

def parse_horse_list_from_homepage(soup: BeautifulSoup) -> list[dict]:
    horses = []
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if "horse.php" in href or "cavallo" in href.lower():
            text = a_tag.get_text(strip=True).upper()
            year_match = re.search(r"anno=(\d{4})|birth_year=(\d{4})|[(\[](\d{4})[)\]]", href + " " + text)
            year = int(year_match.group(1) or year_match.group(2) or year_match.group(3)) if year_match else None
            if text and len(text) >= 2:
                horses.append({
                    "name": text,
                    "birth_year": year,
                    "url_detail": href if href.startswith("http") else TROTTOWEB_BASE.rstrip("/") + "/" + href.lstrip("/")
                })
    seen = set()
    unique = []
    for h in horses:
        key = (h["name"], h["birth_year"])
        if key not in seen:
            seen.add(key)
            unique.append(h)
    return unique

def parse_horse_detail(soup: BeautifulSoup, name: str) -> dict:
    data = {"name": name}
    text = soup.get_text(" ", strip=True)

    m = re.search(r"Nato(?:a)?\s+nel\s+(\d{4})|Anno\s+di\s+nascita[:\s]+(\d{4})", text)
    if m:
        data["birth_year"] = int(m.group(1) or m.group(2))

    if re.search(r"\bmaschio\b|\bstallone\b|\bgeldone\b", text, re.I):
        data["sex"] = "M"
    elif re.search(r"\bfemmina\b|\bfattrice\b|\bpuledra\b", text, re.I):
        data["sex"] = "F"

    m = re.search(r"Paese[:\s]+([A-Z]{2,3})|Nazionalit[aà][:\s]+([A-Z]{2,3})", text)
    if m:
        data["country"] = (m.group(1) or m.group(2)).strip()

    m = re.search(r"Padre[:\s]+([A-Z\s']+?)(?:\s+Madre|\s+Anno|\n)", text)
    if m:
        data["sire"] = m.group(1).strip()
    m = re.search(r"Madre[:\s]+([A-Z\s']+?)(?:\s+Padre|\s+Anno|\n)", text)
    if m:
        data["dam"] = m.group(1).strip()

    m = re.search(r"Record[:\s]+(1'\d+\"\d+|\d+'\d+\"\d+)", text)
    if m:
        data["record_career"] = m.group(1)

    return data

def parse_races(soup: BeautifulSoup, horse_name: str) -> list[dict]:
    races = []
    table = soup.find("table")
    if not table:
        return races

    rows = table.find_all("tr")
    header = []
    for i, row in enumerate(rows):
        cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
        if i == 0:
            header = [c.lower() for c in cells]
            continue
        if len(cells) < 3:
            continue

        race = {"horse_name": horse_name.upper()}
        cell_map = {h: cells[j] for j, h in enumerate(header) if j < len(cells)}

        date_val = cell_map.get("data") or cell_map.get("date") or (cells[0] if cells else "")
        race["race_date"] = _parse_date(date_val)

        race["track"] = cell_map.get("ippodromo") or cell_map.get("pista") or cell_map.get("track") or ""

        place_raw = cell_map.get("pos") or cell_map.get("piazzamento") or cell_map.get("placement") or ""
        race["placement_raw"] = place_raw
        m = re.match(r"(\d+)", place_raw)
        race["placement"] = int(m.group(1)) if m else None

        race["time_km"] = cell_map.get("tempo") or cell_map.get("t/km") or cell_map.get("time") or ""

        dist_val = cell_map.get("dist") or cell_map.get("distanza") or cell_map.get("distance") or ""
        m = re.match(r"(\d+)", str(dist_val))
        race["distance"] = int(m.group(1)) if m else None

        race["driver"] = cell_map.get("driver") or cell_map.get("guidatore") or ""

        prize_val = cell_map.get("montepremi") or cell_map.get("premio") or cell_map.get("prize") or "0"
        race["prize_net"] = _parse_float(prize_val)
        race["prize_gross"] = race["prize_net"]

        race["race_code"] = cell_map.get("codice") or cell_map.get("code") or cell_map.get("id") or ""

        if race.get("race_date"):
            races.append(race)

    return races

def _filter_min_date(races: list[dict], min_date: str = MIN_RACE_DATE) -> list[dict]:
    """Scarta le gare precedenti a MIN_RACE_DATE (lavoriamo solo dal 2012 in avanti)."""
    return [r for r in races if r.get("race_date") and r["race_date"] >= min_date]

def _parse_date(val: str) -> Optional[str]:
    if not val:
        return None
    val = val.strip()
    m = re.match(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", val)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    m = re.match(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", val)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return None

def _parse_float(val: str) -> float:
    if not val:
        return 0.0
    val = re.sub(r"[^\d,.]", "", str(val))
    val = val.replace(",", ".")
    try:
        return float(val)
    except ValueError:
        return 0.0

def _fetch_and_insert_full_career(conn: sqlite3.Connection, name: str, birth_year: Optional[int] = None) -> int:
    """
    Recupera profilo + intera carriera di un cavallo da cavAn.php (endpoint reale,
    dominio legacy trottoweb.com) e li inserisce/aggiorna nel DB.
    Le gare vengono inserite con INSERT OR IGNORE -> colma solo i buchi, non duplica.
    Filtra le gare precedenti a MIN_RACE_DATE.
    Ritorna il numero di gare effettivamente inserite (nuove).
    """
    data = _fetch_cavan(name)
    if not data:
        return 0

    # Aggiorna il profilo solo per i campi che abbiamo effettivamente recuperato
    # (COALESCE mantiene il valore esistente se il nuovo è NULL)
    if any(k in data for k in ("sex", "country", "birth_year", "sire", "dam")):
        conn.execute("""
            UPDATE horses SET
                sex        = COALESCE(?, sex),
                country    = COALESCE(?, country),
                birth_year = COALESCE(?, birth_year),
                sire       = COALESCE(?, sire),
                dam        = COALESCE(?, dam)
            WHERE name = ?
        """, (data.get("sex"), data.get("country"), data.get("birth_year"),
              data.get("sire"), data.get("dam"), name))
        conn.commit()

    races = _filter_min_date(data.get("races", []))
    inserted = _insert_races(conn, races)
    # Aggiorniamo last_updated sempre (anche con 0 gare nuove trovate) — serve alla
    # rotazione di phase_update, che dà priorità ai cavalli controllati meno di recente.
    _update_horse_career_stats(conn, name)
    return inserted

def _mark_backfilled(conn: sqlite3.Connection, name: str):
    conn.execute("""
        UPDATE horses SET backfill_status='done', last_backfill_at=?
        WHERE name=?
    """, (datetime.utcnow().isoformat(), name))
    conn.commit()

def _parse_cavan_page(soup: BeautifulSoup, horse_name: str) -> dict:
    """
    Parsa cavAn.php (trottoweb.com) — contiene sia il profilo del cavallo
    (sesso/età/padre/madre) sia lo storico gare COMPLETO, in un'unica richiesta.
    Formato osservato:
      "FABIO BI m.i.5"  ->  m/f . i(ndigeno)/e(stero) . età
      "MANOFMANYMISSIONS / ROUGE BI"  ->  PADRE / MADRE (a volte con codice in mezzo)
      righe tabella: data(link con data=/ippod=/codice=/n_corsa=) | Ngara^track | piazz. | dist | tempo | note | premio | video
    Ritorna dict con: sex, country, birth_year (stimato da età), sire, dam, races (list).
    """
    result: dict = {"races": []}
    text = soup.get_text(" ", strip=True)

    m = re.search(r"\b([mf])\.([ie])\.(\d{1,2})\b", text)
    if m:
        result["sex"] = "M" if m.group(1) == "m" else "F"
        result["country"] = "ITA" if m.group(2) == "i" else "EST"
        # L'età è "anni compiuti nella stagione corrente": approssimiamo l'anno di nascita
        # come anno_corrente - età. Può sbagliare di ±1 rispetto al vero anno solare di nascita.
        age = int(m.group(3))
        result["birth_year"] = datetime.utcnow().year - age

    m2 = re.search(
        r"\b([A-Z][A-Z0-9À-ÖØ-öø-ÿ'.\- ]{1,40}?)\s*/\s*[a-zA-Z]\d*\s*/\s*([A-Z][A-Z0-9À-ÖØ-öø-ÿ'.\- ]{1,40}?)\s+cat\.mc",
        text
    )
    if m2:
        result["sire"] = m2.group(1).strip()
        result["dam"]  = m2.group(2).strip()

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue

        link = tds[0].find("a", href=True)
        href = link["href"] if link else ""
        m_date  = re.search(r"data=(\d{4}-\d{2}-\d{2})", href)
        m_ippod = re.search(r"ippod=([A-Za-z]{2,4})", href)
        m_cod   = re.search(r"codice=(\d+)", href)
        m_nc    = re.search(r"n_corsa=(\d+)", href)
        if not m_date:
            continue  # riga non è una gara (es. header, paginazione)

        race_date = m_date.group(1)
        track     = (m_ippod.group(1) if m_ippod else "").upper()
        codice    = m_cod.group(1) if m_cod else ""
        n_corsa   = m_nc.group(1) if m_nc else ""

        placement_raw = tds[2].get_text(strip=True) if len(tds) > 2 else ""
        m_pos = re.match(r"(\d+)", placement_raw)
        placement = int(m_pos.group(1)) if (m_pos and "\u00b0" in placement_raw) else None

        dist_raw = tds[3].get_text(strip=True) if len(tds) > 3 else ""
        m_dist = re.match(r"(\d+)", dist_raw)
        distance = int(m_dist.group(1)) if m_dist else None

        time_raw = tds[4].get_text(strip=True) if len(tds) > 4 else ""
        time_km = None
        m_time = re.match(r"(\d+)\.(\d+)\.(\d+)", time_raw)
        if m_time:
            time_km = f"{m_time.group(1)}'{m_time.group(2)}\"{m_time.group(3)}"

        prize_raw = tds[6].get_text(strip=True) if len(tds) > 6 else "0"
        prize = _parse_float(prize_raw) if prize_raw not in ("---", "") else 0.0

        result["races"].append({
            "horse_name":    horse_name.upper(),
            "race_date":     race_date,
            "track":         track,
            "placement":     placement,
            "placement_raw": placement_raw,
            "time_km":       time_km,
            "distance":      distance,
            "driver":        "",
            "prize_net":     prize,
            "prize_gross":   prize,
            "race_code":     f"{race_date}_{codice}" if codice else f"{race_date}_{track}_{n_corsa}",
        })

    return result


def _fetch_cavan(name: str) -> Optional[dict]:
    """Fetch + parse di cavAn.php per un cavallo. Ritorna None se il fetch è fallito
    (host irraggiungibile ecc.) — diverso da una pagina raggiunta ma senza gare."""
    soup = fetch_url(TROTTOWEB_CAVAN, params={"nome": name})
    if not soup:
        return None
    return _parse_cavan_page(soup, name)




def _parse_hris_page(soup: BeautifulSoup, race_date: str, track: str, sigla: str) -> list[dict]:
    """
    Parser basato su classi CSS delle <td> — funziona per flag_ris_u=0 (senza premi)
    e flag_ris_u=1 (con premi). Ogni div#dati_corsa è una gara separata.
    """
    results = []
    race_num = 0

    for div_corsa in soup.find_all("div", id="dati_corsa"):
        race_num += 1
        race_code = f"{race_date}_{sigla}_R{race_num}"
        table = div_corsa.find("table", id="tabella_risultati")
        if not table:
            continue

        for tr in table.find_all("tr"):
            def td(cls: str) -> str:
                el = tr.find("td", class_=cls)
                return el.get_text(strip=True) if el else ""

            # nome_cav_u = con premi | nome_cav = senza premi
            horse_name = (td("nome_cav_u") or td("nome_cav")).upper().strip()
            pos_raw    = td("piaz_u") or td("piaz")
            time_raw   = td("tempo_u") or td("tempo")
            dist_raw   = td("dist_cav_u") or td("dist_cav")
            driver     = td("driver_u") or td("driver")
            prize_raw  = td("premio_u")

            if not horse_name or len(horse_name) < 2:
                continue

            is_classified = "\u00ba" in pos_raw
            pos_match = re.match(r"(\d+)", pos_raw)
            placement = int(pos_match.group(1)) if (pos_match and is_classified) else None

            prize = 0.0
            if prize_raw:
                try:
                    prize = float(prize_raw.replace(".", "").replace(",", "."))
                except ValueError:
                    pass

            time_km = None if (not time_raw or time_raw in NON_CLASSIF
                               or not re.match(r"\d", time_raw)) else time_raw
            dist_m  = re.match(r"(\d+)", str(dist_raw))
            distance = int(dist_m.group(1)) if dist_m else None

            results.append({
                "name": horse_name, "placement": placement,
                "time_km": time_km, "distance": distance,
                "driver": driver, "prize": prize,
                "race_code": race_code, "race_date": race_date, "track": track,
            })

    return results


def _fetch_all_hris_convegni() -> list[dict]:
    """Legge la homepage risultati e restituisce tutti i convegni disponibili."""
    soup = fetch_url(TROTTOWEB_RESULTS_HOME)
    if not soup:
        return []

    convegni = []
    for a_tag in soup.find_all("a", id="link_risultati"):
        href = a_tag.get("href", "")
        m = re.search(r"data=(\d{4}-\d{2}-\d{2})", href)
        if not m:
            continue
        data = m.group(1)
        m_sigla = re.search(r"sigla=([A-Z]+)", href)
        m_ippo  = re.search(r"ippodromo=([^&]+)", href)
        m_note  = re.search(r"note_giorno=([^&]*)", href)

        sigla     = m_sigla.group(1) if m_sigla else ""
        ippodromo = requests.utils.unquote(m_ippo.group(1)).replace("+", " ") if m_ippo else ""
        note      = requests.utils.unquote(m_note.group(1)).replace("+", " ") if m_note else ""
        full_url  = ("https://www.trottoweb.it/TrottoWeb/php_resp/hRis.php?" +
                     href.split("?", 1)[-1]) if "?" in href else (
                    "https://www.trottoweb.it/TrottoWeb/php_resp/" + href)

        convegni.append({
            "data": data, "sigla": sigla, "ippodromo": ippodromo,
            "note_giorno": note, "url": full_url,
        })
    return convegni


def _get_missing_convegni(conn: sqlite3.Connection) -> list[dict]:
    """
    Confronta convegni disponibili su Trottoweb con quelli nel DB.
    Un convegno è "completo" se ha >= 3 gare nel DB per quel track+data.
    Restituisce solo i convegni assenti o incompleti.
    """
    all_convegni = _fetch_all_hris_convegni()
    if not all_convegni:
        return []

    print(f"[RESULTS] Convegni su Trottoweb: {len(all_convegni)}", file=sys.stderr)
    missing = []
    for conv in all_convegni:
        count = conn.execute("""
            SELECT COUNT(*) FROM races
            WHERE race_date = ? AND UPPER(TRIM(track)) = UPPER(TRIM(?))
        """, (conv["data"], conv["ippodromo"])).fetchone()[0]

        if count < 3:
            label = f"ASSENTE" if count == 0 else f"incompleto ({count} gare)"
            print(f"  -> {conv['data']} {conv['ippodromo']} ({conv['sigla']}): {label}", file=sys.stderr)
            missing.append(conv)
        else:
            print(f"  ok {conv['data']} {conv['ippodromo']}: {count} gare", file=sys.stderr)

    print(f"[RESULTS] Convegni mancanti: {len(missing)}", file=sys.stderr)
    return missing


def _ensure_horse_in_db(conn: sqlite3.Connection, horse_name: str) -> tuple[bool, Optional[int]]:
    """
    Aggiunge il cavallo al DB se non esiste (come stub minimo — nome soltanto).
    Il profilo completo (sesso/età/padre/madre) e la carriera arrivano subito dopo
    tramite _fetch_and_insert_full_career(), che usa l'endpoint reale cavAn.php.
    Ritorna (is_new, birth_year) — birth_year è None qui, verrà popolato dal catch-up.
    """
    existing = conn.execute(
        "SELECT birth_year FROM horses WHERE name = ?", (horse_name,)
    ).fetchone()
    if existing:
        return False, existing[0]

    try:
        conn.execute("""
            INSERT OR IGNORE INTO horses
                (name, last_updated, backfill_status)
            VALUES (?, ?, 'pending')
        """, (horse_name, datetime.utcnow().isoformat()))
        conn.commit()
        return True, None
    except sqlite3.Error as e:
        print(f"  [WARN] Insert horse {horse_name}: {e}", file=sys.stderr)
        return False, None


def phase_results(conn: sqlite3.Connection) -> tuple[int, int]:
    """
    FASE 0 — Scarica i convegni mancanti da Trottoweb e li inserisce nel DB.
    Usa gap detection: confronta convegni disponibili vs presenti nel DB.
    Parser CSS-based: funziona per gare con e senza premi.
    I cavalli nuovi vengono messi subito in pari con l'intera carriera storica
    (dal 2012 in avanti), non solo con la gara del convegno corrente.
    Ritorna (new_horses, new_races).
    """
    print("[RESULTS] Controllo convegni mancanti...", file=sys.stderr)
    missing = _get_missing_convegni(conn)
    if not missing:
        print("[RESULTS] Nessun convegno mancante.", file=sys.stderr)
        return 0, 0

    total_new_races  = 0
    total_new_horses = 0

    for conv in missing:
        print(f"[RESULTS] Scarico {conv['ippodromo']} {conv['data']}...", file=sys.stderr)
        soup = fetch_url(conv["url"])
        if not soup:
            print(f"  [WARN] Non raggiungibile: {conv['url']}", file=sys.stderr)
            continue

        rows = _parse_hris_page(soup, conv["data"], conv["ippodromo"], conv["sigla"])
        print(f"  Righe parsate: {len(rows)}", file=sys.stderr)

        conv_races = 0
        conv_horses = 0
        for h in rows:
            name = h["name"]
            is_new, birth_year = _ensure_horse_in_db(conn, name)
            if is_new:
                total_new_horses += 1
                conv_horses += 1
                print(f"    [NEW] {name} -> recupero carriera completa...", file=sys.stderr)
                caught_up = _fetch_and_insert_full_career(conn, name, birth_year)
                print(f"      +{caught_up} gare storiche recuperate", file=sys.stderr)
                _mark_backfilled(conn, name)

            race_dict = {
                "horse_name":    name,
                "race_date":     h["race_date"],
                "track":         h["track"],
                "placement":     h["placement"],
                "placement_raw": str(h["placement"]) if h["placement"] else "nr",
                "time_km":       h["time_km"],
                "distance":      h["distance"],
                "driver":        h["driver"],
                "prize_net":     h["prize"],
                "prize_gross":   h["prize"],
                "race_code":     h["race_code"],
            }
            n_inserted = _insert_races(conn, [race_dict])
            if n_inserted > 0:
                total_new_races += 1
                conv_races += 1
                _update_horse_career_stats(conn, name)

        conn.commit()
        print(f"  -> {conv['ippodromo']} {conv['data']}: +{conv_races} gare, +{conv_horses} cavalli nuovi", file=sys.stderr)

    print(f"[RESULTS] TOTALE: {total_new_races} gare nuove, {total_new_horses} cavalli nuovi", file=sys.stderr)
    return total_new_horses, total_new_races


# FASE 1 — DISCOVERY
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
# FASE 0 — RESULTS (hRis.php per ippodromo)
# ─────────────────────────────────────────────

TROTTOWEB_RESULTS_HOME = "https://www.trottoweb.it/TrottoWeb/php_resp/hRis.php"
TROTTOWEB_HORSE_DETAIL = "https://www.trottoweb.it/TrottoWeb/php_resp/hCav.php"
NON_CLASSIF = {"r.p.", "r.c.", "r.a.", "rit.", "tnc", "cad.", "disq."}


def _parse_prize(val: str) -> float:
    """Restituisce il valore del premio se la stringa è numerica, altrimenti 0."""
    v = val.strip()
    if re.match(r"^\d[\d.,]+$", v):
        return float(v.replace(".", "").replace(",", "."))
    return 0.0


def _is_prize_col(val: str) -> bool:
    """True se col[6] contiene un montepremi (es. "2.150,50"), False se è il sesso ("A","F","P","AP")."""
    v = val.strip()
    return bool(re.match(r"^\d[\d.,]+$", v))


def _parse_hris_row(row: str) -> Optional[dict]:
    """
    Parsa una riga di hRis.php.

    Formato classificati senza premi (8 celle):
      pos° | num | nome+driver | nome | tempo | dist | sesso | driver

    Formato classificati con premi (8 celle):
      pos° | num | nome+driver | nome | tempo | dist | premio | driver

    Formato ritirati senza premi (7 celle):
      num | nome+driver | nome | motivo | dist | sesso | driver | (vuoto opz.)

    Formato ritirati con premi (6 celle):
      num | nome+driver | nome | motivo | dist | driver
    """
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    while cells and not cells[-1]:
        cells.pop()
    if len(cells) < 4:
        return None
    if cells[0].startswith("--"):
        return None

    pos_raw = cells[0]
    is_classified = "\u00ba" in pos_raw
    pos_match = re.match(r"(\d+)", pos_raw)
    placement = int(pos_match.group(1)) if (pos_match and is_classified) else None

    if is_classified:
        # Classificati: 8 celle sempre
        horse_name = cells[3].upper().strip() if len(cells) > 3 else ""
        time_raw   = cells[4] if len(cells) > 4 else ""
        dist_raw   = cells[5] if len(cells) > 5 else ""
        col6       = cells[6] if len(cells) > 6 else ""
        driver     = cells[7].strip() if len(cells) > 7 else ""
        prize      = _parse_prize(col6) if _is_prize_col(col6) else 0.0
    else:
        # Ritirati: no col pos → colonne shiftate
        horse_name = cells[2].upper().strip() if len(cells) > 2 else ""
        time_raw   = cells[3] if len(cells) > 3 else ""
        dist_raw   = cells[4] if len(cells) > 4 else ""
        col5       = cells[5] if len(cells) > 5 else ""
        col6       = cells[6] if len(cells) > 6 else ""
        prize      = 0.0
        placement  = None
        # driver: se col5 ha forma "X.Cognome" è il driver (con premi, 6 celle)
        # se col5 è sesso ("A","F","P","AP") il driver è col6
        if col5 and not re.match(r"^(A|F|P|AP|M)$", col5):
            driver = col5
        else:
            driver = col6

    time_km = None if (not time_raw or time_raw in NON_CLASSIF or not re.match(r"\d", time_raw)) else time_raw
    dist_match = re.match(r"(\d+)", str(dist_raw))
    distance = int(dist_match.group(1)) if dist_match else None

    if not horse_name or len(horse_name) < 2:
        return None

    return {
        "name": horse_name,
        "placement": placement,
        "time_km": time_km,
        "distance": distance,
        "driver": driver,
        "prize": prize,
        "is_classified": is_classified,
    }
def phase_discovery(conn: sqlite3.Connection) -> int:
    print("[DISCOVERY] Lettura homepage Trottoweb...", file=sys.stderr)
    soup = fetch_url(TROTTOWEB_BASE)
    if not soup:
        print("[DISCOVERY] Homepage non raggiungibile, skip.", file=sys.stderr)
        return 0

    horse_list = parse_horse_list_from_homepage(soup)
    print(f"[DISCOVERY] Trovati {len(horse_list)} cavalli in homepage.", file=sys.stderr)

    new_count = 0
    for h in horse_list:
        name = h["name"]
        is_new, _ = _ensure_horse_in_db(conn, name)
        if not is_new:
            continue

        caught_up = _fetch_and_insert_full_career(conn, name)
        _mark_backfilled(conn, name)
        new_count += 1
        print(f"  [NEW] {name} -> +{caught_up} gare storiche", file=sys.stderr)

    print(f"[DISCOVERY] Nuovi cavalli inseriti: {new_count}", file=sys.stderr)
    return new_count

# ─────────────────────────────────────────────
# FASE 2 — UPDATE
# ─────────────────────────────────────────────
def phase_update(conn: sqlite3.Connection) -> tuple[int, int]:
    print("[UPDATE] Ricerca cavalli attivi...", file=sys.stderr)
    cutoff = (datetime.utcnow() - timedelta(days=ACTIVE_MONTHS * 30)).strftime("%Y-%m-%d")

    active_horses = conn.execute("""
        SELECT DISTINCT h.name, h.birth_year
        FROM horses h
        JOIN races r ON r.horse_name = h.name
        WHERE r.race_date >= ?
        ORDER BY h.last_updated IS NOT NULL, h.last_updated ASC, h.name ASC
        LIMIT ?
    """, (cutoff, ACTIVE_UPDATE_BATCH_SIZE)).fetchall()

    print(f"[UPDATE] Cavalli attivi in questo batch: {len(active_horses)} (batch size: {ACTIVE_UPDATE_BATCH_SIZE})", file=sys.stderr)

    updated_count = 0
    new_races_total = 0

    for name, birth_year in active_horses:
        inserted = _fetch_and_insert_full_career(conn, name, birth_year)
        if inserted > 0:
            updated_count += 1
            new_races_total += inserted
            print(f"  [UPD] {name}: +{inserted} gare", file=sys.stderr)

    print(f"[UPDATE] Cavalli aggiornati: {updated_count}, gare nuove: {new_races_total}", file=sys.stderr)
    return updated_count, new_races_total

# ─────────────────────────────────────────────
# FASE 2b — BACKFILL GAP (cavalli esistenti con buchi nello storico)
# ─────────────────────────────────────────────
def phase_backfill_gaps(conn: sqlite3.Connection, batch_size: int = BACKFILL_BATCH_SIZE) -> tuple[int, int]:
    """
    Ricontrolla a rotazione i cavalli già presenti nel DB per colmare eventuali buchi
    nello storico gare (dal 2012 in avanti). Un batch per esecuzione, per non sovraccaricare
    Trottoweb né far scadere il timeout del cron. Ogni cavallo viene rivisitato al massimo
    ogni REBACKFILL_DAYS giorni.

    Ritorna (horses_backfilled, new_races_found).
    """
    print(f"[BACKFILL] Batch size: {batch_size}", file=sys.stderr)

    # Rimetti in 'pending' i cavalli il cui ultimo controllo è troppo vecchio
    rebackfill_cutoff = (datetime.utcnow() - timedelta(days=REBACKFILL_DAYS)).isoformat()
    conn.execute("""
        UPDATE horses SET backfill_status='pending'
        WHERE backfill_status='done' AND (last_backfill_at IS NULL OR last_backfill_at < ?)
    """, (rebackfill_cutoff,))
    conn.commit()

    pending = conn.execute("""
        SELECT name, birth_year FROM horses
        WHERE backfill_status IS NULL OR backfill_status = 'pending'
        ORDER BY last_backfill_at IS NOT NULL, last_backfill_at ASC, name ASC
        LIMIT ?
    """, (batch_size,)).fetchall()

    print(f"[BACKFILL] Cavalli da controllare in questo batch: {len(pending)}", file=sys.stderr)

    horses_backfilled = 0
    new_races_found = 0

    for name, birth_year in pending:
        inserted = _fetch_and_insert_full_career(conn, name, birth_year)
        _mark_backfilled(conn, name)
        horses_backfilled += 1
        if inserted > 0:
            new_races_found += inserted
            print(f"  [GAP] {name}: +{inserted} gare recuperate", file=sys.stderr)

    print(f"[BACKFILL] Cavalli controllati: {horses_backfilled}, gare colmate: {new_races_found}", file=sys.stderr)
    return horses_backfilled, new_races_found

# ─────────────────────────────────────────────
# FASE 3 — RATINGS cavalli
# ─────────────────────────────────────────────
def phase_ratings(conn: sqlite3.Connection):
    print("[RATINGS] Calcolo rating cavalli...", file=sys.stderr)

    horses = conn.execute("""
        SELECT h.name, h.birth_year, h.sire,
               h.career_races, h.career_wins, h.career_earnings, h.record_career
        FROM horses h
        WHERE h.career_races > 0
    """).fetchall()

    # Percentili earnings
    all_earnings = sorted([r[5] for r in horses if r[5]])
    n_earn = len(all_earnings)

    def earn_pct(earnings: float) -> float:
        if n_earn == 0 or not earnings:
            return 0.0
        pos = sum(1 for e in all_earnings if e <= earnings)
        return round(pos / n_earn * 100, 2)

    def time_to_seconds(time_str: str) -> Optional[float]:
        if not time_str:
            return None
        m = re.match(r"(\d+)'(\d+)\"(\d+)", time_str)
        if m:
            return int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 10
        return None

    all_times = sorted([t for r in horses if (t := time_to_seconds(r[6] or ""))])
    n_times = len(all_times)

    def time_pct(record: str) -> float:
        t = time_to_seconds(record or "")
        if not t or n_times == 0:
            return 0.0
        pos = sum(1 for x in all_times if x >= t)
        return round(pos / n_times * 100, 2)

    scores = {}
    for row in horses:
        name, birth_year, sire, career_races, career_wins, career_earnings, record_career = row
        if not career_races:
            continue
        ep = earn_pct(career_earnings or 0)
        tp = time_pct(record_career or "")
        win_rate = (career_wins / career_races * 100) if career_races else 0
        score = round(min(ep * 0.50 + tp * 0.30 + win_rate * 0.20, 100.0), 2)
        grade = score_to_horse_grade(score)
        scores[(name, birth_year)] = {
            "score": score, "grade": grade,
            "earn_percentile": ep, "time_percentile": tp,
            "win_rate": round(win_rate, 2),
        }

    # Percentili per sire
    sire_groups: dict[str, list[float]] = {}
    for (name, birth_year), data in scores.items():
        row = conn.execute("SELECT sire FROM horses WHERE name=? AND birth_year=?", (name, birth_year)).fetchone()
        if row and row[0]:
            sire_groups.setdefault(row[0].upper(), []).append(data["score"])

    def sire_pct(sire_name: str, score: float) -> float:
        if not sire_name or sire_name not in sire_groups:
            return 0.0
        grp = sorted(sire_groups[sire_name])
        pos = sum(1 for s in grp if s <= score)
        return round(pos / len(grp) * 100, 2)

    now_iso = datetime.utcnow().isoformat()
    for (name, birth_year), data in scores.items():
        sire_row = conn.execute("SELECT sire FROM horses WHERE name=? AND birth_year=?", (name, birth_year)).fetchone()
        sire_name = (sire_row[0] or "").upper() if sire_row else ""
        sp = sire_pct(sire_name, data["score"])
        horse_row = conn.execute(
            "SELECT career_races, career_wins, career_earnings, record_career FROM horses WHERE name=? AND birth_year=?",
            (name, birth_year)
        ).fetchone()
        if not horse_row:
            continue
        conn.execute("""
            INSERT OR REPLACE INTO horse_ratings
                (name, birth_year, sire, grade, score,
                 earn_percentile, time_percentile, sire_percentile,
                 career_races, career_wins, career_earnings, record_career,
                 win_rate, rating_mode, last_updated)
            VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?)
        """, (
            name, birth_year, sire_name or None,
            data["grade"], data["score"],
            data["earn_percentile"], data["time_percentile"], sp,
            horse_row[0], horse_row[1], horse_row[2], horse_row[3],
            data["win_rate"], "performance", now_iso
        ))

    conn.commit()
    print(f"[RATINGS] Rating cavalli: {len(scores)}", file=sys.stderr)

# ─────────────────────────────────────────────
# FASE 3b — RATINGS STALLONI
# Formula: base_score = (SSS×100+SS×85+...+F×2) / n_figli_totali
#          stallion_score = base_score × volume_multiplier
#          + boost vendopuledri (max +5 punti, normalizzato)
# ─────────────────────────────────────────────
def phase_stallion_ratings(conn: sqlite3.Connection):
    """
    Calcola rating stalloni.
    n_figli_totali = MAX(vp_total_offspring, figli_nel_db) — usa VP quando disponibile.
    n_in_corsa     = figli con almeno una gara negli ultimi ACTIVE_MONTHS.
    volume_multiplier usa n_figli_totali (il numero reale, non solo quelli nel DB).
    """
    print("[RATINGS] Calcolo rating stalloni...", file=sys.stderr)

    stallions = conn.execute("""
        SELECT DISTINCT sire FROM horse_ratings
        WHERE sire IS NOT NULL AND sire != \'\' AND rating_mode=\'performance\'
    """).fetchall()

    # Leggi dati VP: offspring reale + earnings per boost
    vp_data: dict[str, dict] = {}
    try:
        vp_rows = conn.execute("""
            SELECT name, vp_total_offspring, vp_total_earnings_eur
            FROM vendopuledri_stalloni_rankings
        """).fetchall()
        for row in vp_rows:
            if row[0]:
                vp_data[row[0].upper()] = {
                    "offspring": row[1] or 0,
                    "earnings":  row[2] or 0.0,
                }
    except sqlite3.OperationalError:
        pass

    max_vp_earnings = max((v["earnings"] for v in vp_data.values()), default=1.0) or 1.0
    now_iso = datetime.utcnow().isoformat()
    cutoff  = (datetime.utcnow() - timedelta(days=ACTIVE_MONTHS * 30)).strftime("%Y-%m-%d")

    all_final_scores: list[float] = []
    row_buffer: list[tuple] = []

    for (sire_name,) in stallions:
        children = conn.execute("""
            SELECT grade FROM horse_ratings
            WHERE UPPER(TRIM(sire))=UPPER(TRIM(?)) AND rating_mode=\'performance\'
        """, (sire_name,)).fetchall()

        if not children:
            continue

        n_db   = len(children)
        sire_key = sire_name.upper()

        # n_figli_totali: usa vp_total_offspring se >= n_db (fonte più autorevole)
        vp_offspring   = vp_data.get(sire_key, {}).get("offspring", 0)
        n_figli_totali = max(vp_offspring, n_db)

        # volume_multiplier sul numero reale di figli (non solo quelli nel DB)
        vm = volume_multiplier(n_figli_totali)

        grade_counts = {g: 0 for g in GRADE_WEIGHTS}
        for (grade,) in children:
            if grade in grade_counts:
                grade_counts[grade] += 1

        n_SSS = grade_counts.get("SSS", 0)
        n_SS  = grade_counts.get("SS", 0)
        n_S   = grade_counts.get("S", 0)
        pct_top_S = round((n_SSS + n_SS + n_S) / n_db * 100, 2) if n_db > 0 else 0.0

        weighted_sum  = sum(GRADE_WEIGHTS[g] * c for g, c in grade_counts.items())
        base_score    = weighted_sum / n_db if n_db > 0 else 0.0
        stallion_score = round(base_score * vm, 2)

        vp_boost = 0.0
        if sire_key in vp_data and max_vp_earnings > 0:
            vp_boost = round((vp_data[sire_key]["earnings"] / max_vp_earnings) * 5.0, 2)

        final_score = round(min(stallion_score + vp_boost, 100.0), 2)

        avg_earnings = conn.execute("""
            SELECT AVG(career_earnings) FROM horse_ratings
            WHERE UPPER(TRIM(sire))=UPPER(TRIM(?)) AND rating_mode=\'performance\'
        """, (sire_name,)).fetchone()[0] or 0.0

        n_in_corsa = conn.execute("""
            SELECT COUNT(DISTINCT h.name)
            FROM horses h
            JOIN races r ON r.horse_name = h.name
            WHERE UPPER(TRIM(h.sire))=UPPER(TRIM(?)) AND r.race_date >= ?
        """, (sire_name, cutoff)).fetchone()[0] or 0

        all_final_scores.append(final_score)
        row_buffer.append((
            sire_name, n_figli_totali, n_in_corsa, stallion_score,
            n_SSS, n_SS, n_S, pct_top_S, round(avg_earnings, 2),
            vp_boost, final_score, now_iso
        ))

    dyn_thresholds = build_stallion_grade_thresholds(all_final_scores)
    print(f"[RATINGS] Soglie stalloni: {[(round(t,1),g) for t,g in dyn_thresholds]}", file=sys.stderr)

    for (sire_name, n_figli_totali, n_in_corsa, stallion_score,
         n_SSS, n_SS, n_S, pct_top_S, avg_earn,
         vp_boost, final_score, ts) in row_buffer:
        grade = score_to_stallion_grade(final_score, dyn_thresholds) if final_score > 0 else "N/A"
        conn.execute("""
            INSERT OR REPLACE INTO stallion_rating_stats
                (sire, n_figli_totali, n_in_corsa, avg_score, grade,
                 n_SSS, n_SS, n_S, pct_top_S, avg_earnings,
                 vp_boost, final_score, last_updated)
            VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?)
        """, (
            sire_name, n_figli_totali, n_in_corsa, stallion_score, grade,
            n_SSS, n_SS, n_S, pct_top_S, avg_earn,
            vp_boost, final_score, ts
        ))

    conn.commit()
    print(f"[RATINGS] Rating stalloni: {len(row_buffer)} (VP data: {len(vp_data)} stalloni)", file=sys.stderr)


def _insert_races(conn: sqlite3.Connection, races: list[dict]) -> int:
    inserted = 0
    for r in races:
        try:
            # Un cavallo non corre due volte lo stesso giorno: se esiste già una gara
            # per (cavallo, data) — anche con race_code diverso, perché arrivata da
            # un'altra fonte (hRis.php vs cavAn.php) — non duplichiamo.
            already = conn.execute(
                "SELECT 1 FROM races WHERE horse_name=? AND race_date=?",
                (r.get("horse_name"), r.get("race_date"))
            ).fetchone()
            if already:
                continue

            cursor = conn.execute("""
                INSERT OR IGNORE INTO races
                    (horse_name, race_date, track, placement, placement_raw,
                     time_km, distance, driver, prize_net, prize_gross, race_code)
                VALUES (?,?,?,?,?, ?,?,?,?,?,?)
            """, (
                r.get("horse_name"), r.get("race_date"), r.get("track"),
                r.get("placement"), r.get("placement_raw"),
                r.get("time_km"), r.get("distance"), r.get("driver"),
                r.get("prize_net", 0), r.get("prize_gross", 0), r.get("race_code", "")
            ))
            if cursor.rowcount > 0:
                inserted += 1
        except sqlite3.Error as e:
            print(f"  [WARN] Insert race {r.get('horse_name')} {r.get('race_date')}: {e}", file=sys.stderr)
    conn.commit()
    return inserted

def _update_horse_career_stats(conn: sqlite3.Connection, horse_name: str):
    stats = conn.execute("""
        SELECT
            COUNT(*) as n_races,
            SUM(CASE WHEN placement=1 THEN 1 ELSE 0 END) as wins,
            SUM(COALESCE(prize_net, 0)) as earnings,
            MIN(time_km) as best_time
        FROM races
        WHERE horse_name=? AND placement IS NOT NULL
    """, (horse_name,)).fetchone()
    if stats:
        conn.execute("""
            UPDATE horses SET
                career_races=?, career_wins=?, career_earnings=?,
                record_career=?, last_updated=?
            WHERE name=?
        """, (
            stats[0] or 0, stats[1] or 0, stats[2] or 0.0,
            stats[3], datetime.utcnow().isoformat(), horse_name
        ))
        conn.commit()

# ─────────────────────────────────────────────
# FASE 4 — SYNC
# ─────────────────────────────────────────────
def phase_sync():
    print(f"[SYNC] Copio {DB_PATH} → {REPO_DB_PATH}", file=sys.stderr)
    if not DB_PATH.exists():
        print(f"[SYNC] WARN: {DB_PATH} non trovato, skip.", file=sys.stderr)
        return
    try:
        if DB_PATH.resolve() == REPO_DB_PATH.resolve():
            print("[SYNC] DB_PATH e REPO_DB_PATH coincidono, nessuna copia necessaria.", file=sys.stderr)
            return
    except OSError:
        pass  # se resolve() fallisce per qualche motivo, proviamo comunque la copia
    shutil.copy2(str(DB_PATH), str(REPO_DB_PATH))
    print("[SYNC] OK.", file=sys.stderr)

# ─────────────────────────────────────────────
# FASE 5 — GIT PUSH
# ─────────────────────────────────────────────
def phase_git_push():
    print("[GIT] Eseguo git push...", file=sys.stderr)
    token = GITHUB_TOKEN
    if not token:
        print("[GIT] WARN: GITHUB_TOKEN non impostato, skip push.", file=sys.stderr)
        return
    try:
        subprocess.run(["git", "config", "user.email", "nightly@statippica.bot"],  check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name",  "StatIppica Nightly"],      check=True, capture_output=True)

        remote_url = f"https://{GITHUB_USER}:{token}@github.com/{GITHUB_USER}/{GITHUB_REPO}.git"
        subprocess.run(["git", "remote", "set-url", "origin", remote_url], check=True, capture_output=True)

        subprocess.run(["git", "add", "data.db"], check=True, capture_output=True)

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        result  = subprocess.run(
            ["git", "commit", "-m", f"nightly update {now_str}"],
            capture_output=True, text=True
        )
        if "nothing to commit" in result.stdout + result.stderr:
            print("[GIT] Nessuna modifica da committare.", file=sys.stderr)
            return

        subprocess.run(["git", "push", "origin", "main"], check=True, capture_output=True)
        print("[GIT] Push completato.", file=sys.stderr)

    except subprocess.CalledProcessError as e:
        print(f"[GIT] ERROR: {e.stderr}", file=sys.stderr)

# ─────────────────────────────────────────────
# FASE 6 — NOTIFICA
# ─────────────────────────────────────────────
def phase_notify(new_horses: int, new_races: int, horses_updated: int, horses_backfilled: int = 0):
    payload = {
        "new_horses":        new_horses,
        "new_races":         new_races,
        "horses_updated":    horses_updated,
        "horses_backfilled": horses_backfilled,
        "timestamp":         datetime.utcnow().isoformat() + "Z"
    }
    print(json.dumps(payload))

    render_hook = os.environ.get("RENDER_DEPLOY_HOOK_URL")
    if render_hook:
        try:
            resp = SESSION.post(render_hook, timeout=10)
            print(f"[NOTIFY] Render deploy hook: {resp.status_code}", file=sys.stderr)
        except Exception as e:
            print(f"[NOTIFY] WARN deploy hook: {e}", file=sys.stderr)

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def phase_seed_vp(conn: sqlite3.Connection):
    """Popola vendopuledri_stalloni_rankings dai dati hardcoded se la tabella è vuota."""
    try:
        count = conn.execute("SELECT COUNT(*) FROM vendopuledri_stalloni_rankings").fetchone()[0]
        if count > 0:
            print(f"[SEED_VP] Tabella già popolata ({count} righe), skip.", file=sys.stderr)
            return
    except sqlite3.OperationalError:
        pass  # tabella non esiste ancora, procediamo

    print("[SEED_VP] Tabella vuota — eseguo seed da dati hardcoded...", file=sys.stderr)
    try:
        # Importa seed_vp_data se disponibile nella stessa directory
        import importlib.util, os as _os
        seed_path = _os.path.join(_os.path.dirname(__file__), "seed_vp_data.py")
        spec = importlib.util.spec_from_file_location("seed_vp_data", seed_path)
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.seed(str(DB_PATH))
        print("[SEED_VP] Seed completato.", file=sys.stderr)
    except Exception as e:
        print(f"[SEED_VP] WARN: seed fallito: {e}", file=sys.stderr)


def main():
    # NIGHTLY_MODE: "results" (gare mancanti + cavalli nuovi trovati lì),
    #               "maintenance" (aggiorna/backfilla cavalli già esistenti),
    #               "full" (tutto insieme, comportamento originale — default)
    mode = os.environ.get("NIGHTLY_MODE", "full").strip().lower()
    if mode not in ("results", "maintenance", "full"):
        print(f"[WARN] NIGHTLY_MODE='{mode}' non riconosciuto, uso 'full'.", file=sys.stderr)
        mode = "full"

    print(f"[START] {datetime.utcnow().isoformat()} — StatIppica nightly_update.py (mode={mode})", file=sys.stderr)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    init_db(conn)

    new_horses = new_races = horses_updated = horses_backfilled = 0

    try:
        phase_seed_vp(conn)  # seed VP hardcoded se tabella vuota

        if mode in ("results", "full"):
            r_horses, r_races = phase_results(conn)   # FASE 0: risultati hRis.php (+ catch-up cavalli nuovi)
            d_horses          = phase_discovery(conn)  # FASE 1: cavalli nuovi da homepage (+ catch-up)
            new_horses += r_horses + d_horses
            new_races  += r_races

        if mode in ("maintenance", "full"):
            u_updated, u_races = phase_update(conn)         # FASE 2: aggiorna cavalli attivi
            b_horses, b_races  = phase_backfill_gaps(conn)  # FASE 2b: colma buchi storici cavalli esistenti
            new_races          += u_races + b_races
            horses_updated      = u_updated
            horses_backfilled   = b_horses

        # Il rating va ricalcolato in ogni caso: qualunque modalità può aver
        # cambiato dati che influenzano i punteggi.
        phase_ratings(conn)             # FASE 3: rating cavalli
        phase_stallion_ratings(conn)    # FASE 3b: rating stalloni
    finally:
        conn.close()

    phase_sync()
    phase_git_push()
    phase_notify(new_horses, new_races, horses_updated, horses_backfilled)

    print(f"[END] {datetime.utcnow().isoformat()}", file=sys.stderr)


if __name__ == "__main__":
    main()
