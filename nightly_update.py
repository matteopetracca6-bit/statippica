#!/usr/bin/env python3
"""
nightly_update.py — StatIppica
Eseguito ogni notte su Render (cron job o trigger esterno).

Fasi:
  1. DISCOVERY  — legge homepage Trottoweb, trova cavalli nuovi, inserisce carriera completa
  2. UPDATE     — aggiorna cavalli attivi (ultimi 6 mesi) con nuove gare
  3. RATINGS    — ricalcola rating SSS..F per tutti i cavalli
  4. SYNC       — copia DB in trotto-dashboard/data.db (root del repo)
  5. GIT PUSH   — git push su GitHub → Render rideploya automaticamente
  6. NOTIFICA   — stampa JSON {new_horses, new_races, horses_updated}

Output finale su stdout (ultima riga): JSON con chiavi new_horses, new_races, horses_updated
"""

import os
import re
import json
import math
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
TROTTOWEB_BASE   = "https://www.trottoweb.it/TrottoWeb/php_resp"
TROTTOWEB_HORSE  = "https://www.trottoweb.it/TrottoWeb/php_resp/horse.php"
TROTTOWEB_RACES  = "https://www.trottoweb.it/TrottoWeb/php_resp/races.php"

DB_PATH          = Path(os.environ.get("DB_PATH", "trotto_master.db"))
REPO_DB_PATH     = Path(os.environ.get("REPO_DB_PATH", "data.db"))   # root del repo

GITHUB_TOKEN     = os.environ.get("GITHUB_TOKEN", "")
GITHUB_USER      = os.environ.get("GITHUB_USER", "matteopetracca6-bit")
GITHUB_REPO      = os.environ.get("GITHUB_REPO", "statippica")

ACTIVE_MONTHS    = 6    # cavalli con gare negli ultimi N mesi = "attivi"
REQUEST_DELAY    = 0.5  # secondi tra richieste HTTP (rispetto server)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "StatIppica-NightlyBot/1.0 (+https://github.com/matteopetracca6-bit/statippica)"
})

# ─────────────────────────────────────────────
# VOLUME MULTIPLIER per stalloni
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
# GRADE MAP (pesi per il calcolo score)
# ─────────────────────────────────────────────
GRADE_WEIGHTS = {
    "SSS": 100, "SS": 85, "S": 70, "A": 55, "B": 40,
    "C": 25, "D": 15, "E": 8, "F": 2
}

GRADE_THRESHOLDS = [
    (97,  "SSS"),
    (90,  "SS"),
    (80,  "S"),
    (65,  "A"),
    (50,  "B"),
    (35,  "C"),
    (20,  "D"),
    (10,  "E"),
    (0,   "F"),
]

def score_to_grade(score: float) -> str:
    for threshold, grade in GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "F"

# ─────────────────────────────────────────────
# DB INIT
# ─────────────────────────────────────────────
def init_db(conn: sqlite3.Connection):
    """Crea le tabelle se non esistono."""
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS horses (
        name           TEXT NOT NULL,
        birth_year     INTEGER,
        sex            TEXT,
        country        TEXT,
        sire           TEXT,
        dam            TEXT,
        unire_sire     TEXT,
        unire_dam      TEXT,
        career_races   INTEGER DEFAULT 0,
        career_wins    INTEGER DEFAULT 0,
        career_places  INTEGER DEFAULT 0,
        career_earnings REAL DEFAULT 0,
        record_career  TEXT,
        record_short   TEXT,
        record_long    TEXT,
        last_updated   TEXT,
        PRIMARY KEY (name, birth_year)
    );

    CREATE TABLE IF NOT EXISTS races (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        horse_name     TEXT NOT NULL,
        race_date      TEXT,
        track          TEXT,
        placement      INTEGER,
        placement_raw  TEXT,
        time_km        TEXT,
        distance       INTEGER,
        driver         TEXT,
        prize_net      REAL,
        prize_gross    REAL,
        race_code      TEXT,
        UNIQUE(horse_name, race_date, race_code)
    );

    CREATE TABLE IF NOT EXISTS horse_ratings (
        name             TEXT NOT NULL,
        birth_year       INTEGER,
        sire             TEXT,
        grade            TEXT,
        score            REAL,
        earn_percentile  REAL,
        time_percentile  REAL,
        sire_percentile  REAL,
        career_races     INTEGER,
        career_wins      INTEGER,
        career_earnings  REAL,
        record_career    TEXT,
        win_rate         REAL,
        rating_mode      TEXT DEFAULT 'performance',
        last_updated     TEXT,
        PRIMARY KEY (name, birth_year, rating_mode)
    );

    CREATE TABLE IF NOT EXISTS stallion_rating_stats (
        sire              TEXT PRIMARY KEY,
        n_figli_totali    INTEGER,
        n_in_corsa        INTEGER,
        avg_score         REAL,
        n_SSS             INTEGER DEFAULT 0,
        n_SS              INTEGER DEFAULT 0,
        n_S               INTEGER DEFAULT 0,
        pct_top_S         REAL,
        avg_earnings      REAL,
        last_updated      TEXT
    );

    CREATE TABLE IF NOT EXISTS stallions (
        name                    TEXT PRIMARY KEY,
        stud_fee_eur            REAL,
        stud_farm               TEXT,
        stud_status             TEXT DEFAULT 'active',
        country                 TEXT,
        progeny_earnings_2024   REAL,
        media_in_corsa          REAL,
        tot_prod                INTEGER,
        tot_in_corsa            INTEGER,
        perc_in_corsa           REAL,
        tot_vitt                INTEGER,
        perc_vitt               REAL,
        last_updated            TEXT
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
    """)
    conn.commit()

# ─────────────────────────────────────────────
# TROTTOWEB HELPERS
# ─────────────────────────────────────────────
def fetch_trottoweb(url: str, params: dict = None, retries: int = 3) -> Optional[BeautifulSoup]:
    """Fetch con retry e parsing HTML."""
    for attempt in range(retries):
        try:
            resp = SESSION.get(url, params=params, timeout=20)
            resp.raise_for_status()
            time.sleep(REQUEST_DELAY)
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            print(f"  [WARN] fetch {url} tentativo {attempt+1}/{retries}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt)
    return None

def parse_horse_list_from_homepage(soup: BeautifulSoup) -> list[dict]:
    """
    Estrae lista cavalli dalla homepage Trottoweb.
    Adatta il selettore alla struttura reale della pagina.
    Restituisce lista di {name, birth_year, url_detail}.
    """
    horses = []
    # Cerca link a schede cavallo — pattern tipico Trottoweb
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        # URL tipo: horse.php?id=XXXX o ?cavallo=NAME&anno=YYYY
        if "horse.php" in href or "cavallo" in href.lower():
            text = a_tag.get_text(strip=True).upper()
            # Prova a estrarre anno dal href o dal testo
            year_match = re.search(r"anno=(\d{4})|birth_year=(\d{4})|[(\[](\d{4})[)\]]", href + " " + text)
            year = int(year_match.group(1) or year_match.group(2) or year_match.group(3)) if year_match else None
            if text and len(text) >= 2:
                horses.append({
                    "name": text,
                    "birth_year": year,
                    "url_detail": href if href.startswith("http") else TROTTOWEB_BASE.rstrip("/") + "/" + href.lstrip("/")
                })
    # Deduplica per nome+anno
    seen = set()
    unique = []
    for h in horses:
        key = (h["name"], h["birth_year"])
        if key not in seen:
            seen.add(key)
            unique.append(h)
    return unique

def parse_horse_detail(soup: BeautifulSoup, name: str) -> dict:
    """
    Estrae dati anagrafica cavallo dalla pagina dettaglio.
    Ritorna dict con campi horses table.
    """
    data = {"name": name}
    text = soup.get_text(" ", strip=True)

    # Anno nascita
    m = re.search(r"Nato(?:a)?\s+nel\s+(\d{4})|Anno\s+di\s+nascita[:\s]+(\d{4})|(\d{4})", text)
    if m:
        data["birth_year"] = int(m.group(1) or m.group(2) or m.group(3))

    # Sesso
    if re.search(r"\bmaschio\b|\bstallone\b|\bgeldone\b", text, re.I):
        data["sex"] = "M"
    elif re.search(r"\bfemmina\b|\bfattrice\b|\bpuledra\b", text, re.I):
        data["sex"] = "F"

    # Paese
    m = re.search(r"Paese[:\s]+([A-Z]{2,3})|Nazionalit[aà][:\s]+([A-Z]{2,3})", text)
    if m:
        data["country"] = (m.group(1) or m.group(2)).strip()

    # Padre / Madre
    m = re.search(r"Padre[:\s]+([A-Z\s']+?)(?:\s+Madre|\s+Anno|\n)", text)
    if m:
        data["sire"] = m.group(1).strip()
    m = re.search(r"Madre[:\s]+([A-Z\s']+?)(?:\s+Padre|\s+Anno|\n)", text)
    if m:
        data["dam"] = m.group(1).strip()

    # Record career (formato tipico: 1'10"5)
    m = re.search(r"Record[:\s]+(1'\d+\"\d+|\d+'\d+\"\d+)", text)
    if m:
        data["record_career"] = m.group(1)

    return data

def parse_races(soup: BeautifulSoup, horse_name: str) -> list[dict]:
    """
    Estrae lista gare dalla pagina carriera cavallo.
    Ritorna lista di dict per tabella races.
    """
    races = []
    # Cerca tabella gare — pattern generico
    table = soup.find("table")
    if not table:
        return races

    rows = table.find_all("tr")
    header = []
    for i, row in enumerate(rows):
        cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
        if i == 0:
            # Riga header
            header = [c.lower() for c in cells]
            continue
        if len(cells) < 3:
            continue

        race = {"horse_name": horse_name.upper()}

        # Mappa celle per header
        cell_map = {}
        for j, h in enumerate(header):
            if j < len(cells):
                cell_map[h] = cells[j]

        # Data gara
        date_val = cell_map.get("data") or cell_map.get("date") or (cells[0] if cells else "")
        race["race_date"] = _parse_date(date_val)

        # Pista
        race["track"] = cell_map.get("ippodromo") or cell_map.get("pista") or cell_map.get("track") or ""

        # Piazzamento
        place_raw = cell_map.get("pos") or cell_map.get("piazzamento") or cell_map.get("placement") or ""
        race["placement_raw"] = place_raw
        m = re.match(r"(\d+)", place_raw)
        race["placement"] = int(m.group(1)) if m else None

        # Tempo al km
        race["time_km"] = cell_map.get("tempo") or cell_map.get("t/km") or cell_map.get("time") or ""

        # Distanza
        dist_val = cell_map.get("dist") or cell_map.get("distanza") or cell_map.get("distance") or ""
        m = re.match(r"(\d+)", str(dist_val))
        race["distance"] = int(m.group(1)) if m else None

        # Driver
        race["driver"] = cell_map.get("driver") or cell_map.get("guidatore") or ""

        # Montepremi
        prize_val = cell_map.get("montepremi") or cell_map.get("premio") or cell_map.get("prize") or "0"
        race["prize_net"] = _parse_float(prize_val)
        race["prize_gross"] = race["prize_net"]

        # Codice gara
        race["race_code"] = cell_map.get("codice") or cell_map.get("code") or cell_map.get("id") or ""

        if race.get("race_date"):
            races.append(race)

    return races

def _parse_date(val: str) -> Optional[str]:
    """Converte vari formati data in YYYY-MM-DD."""
    if not val:
        return None
    val = val.strip()
    # GG/MM/YYYY o GG-MM-YYYY
    m = re.match(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", val)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # YYYY-MM-DD già corretto
    m = re.match(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", val)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return None

def _parse_float(val: str) -> float:
    """Rimuove separatori migliaia e converte in float."""
    if not val:
        return 0.0
    val = re.sub(r"[^\d,.]", "", str(val))
    val = val.replace(",", ".")
    try:
        return float(val)
    except ValueError:
        return 0.0

# ─────────────────────────────────────────────
# FASE 1 — DISCOVERY
# ─────────────────────────────────────────────
def phase_discovery(conn: sqlite3.Connection) -> int:
    """Trova cavalli nuovi e inserisce carriera completa. Ritorna n. cavalli nuovi."""
    print("[DISCOVERY] Lettura homepage Trottoweb...", file=sys.stderr)
    soup = fetch_trottoweb(TROTTOWEB_BASE)
    if not soup:
        print("[DISCOVERY] Homepage non raggiungibile, skip.", file=sys.stderr)
        return 0

    horse_list = parse_horse_list_from_homepage(soup)
    print(f"[DISCOVERY] Trovati {len(horse_list)} cavalli in homepage.", file=sys.stderr)

    new_count = 0
    for h in horse_list:
        name = h["name"]
        birth_year = h["birth_year"]

        # Controlla se già in DB
        existing = conn.execute(
            "SELECT 1 FROM horses WHERE name=? AND (birth_year=? OR birth_year IS NULL)",
            (name, birth_year)
        ).fetchone()
        if existing:
            continue

        # Scarica dettaglio cavallo
        detail_soup = fetch_trottoweb(h["url_detail"])
        if not detail_soup:
            continue

        horse_data = parse_horse_detail(detail_soup, name)
        if birth_year and not horse_data.get("birth_year"):
            horse_data["birth_year"] = birth_year

        # Inserisce cavallo
        try:
            conn.execute("""
                INSERT OR IGNORE INTO horses
                    (name, birth_year, sex, country, sire, dam, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                horse_data.get("name"),
                horse_data.get("birth_year"),
                horse_data.get("sex"),
                horse_data.get("country"),
                horse_data.get("sire"),
                horse_data.get("dam"),
                datetime.utcnow().isoformat()
            ))
            conn.commit()
        except sqlite3.Error as e:
            print(f"  [WARN] Insert horse {name}: {e}", file=sys.stderr)
            continue

        # Scarica carriera completa
        races_soup = fetch_trottoweb(TROTTOWEB_RACES, params={"cavallo": name, "anno": birth_year})
        if races_soup:
            races = parse_races(races_soup, name)
            _insert_races(conn, races)

        # Aggiorna statistiche career
        _update_horse_career_stats(conn, name)

        new_count += 1
        print(f"  [NEW] {name} ({birth_year})", file=sys.stderr)

    print(f"[DISCOVERY] Nuovi cavalli inseriti: {new_count}", file=sys.stderr)
    return new_count

# ─────────────────────────────────────────────
# FASE 2 — UPDATE
# ─────────────────────────────────────────────
def phase_update(conn: sqlite3.Connection) -> tuple[int, int]:
    """
    Aggiorna cavalli attivi (ultima gara negli ultimi ACTIVE_MONTHS mesi).
    Ritorna (n. cavalli aggiornati, n. gare nuove).
    """
    print("[UPDATE] Ricerca cavalli attivi...", file=sys.stderr)
    cutoff = (datetime.utcnow() - timedelta(days=ACTIVE_MONTHS * 30)).strftime("%Y-%m-%d")

    active_horses = conn.execute("""
        SELECT DISTINCT h.name, h.birth_year
        FROM horses h
        JOIN races r ON r.horse_name = h.name
        WHERE r.race_date >= ?
        ORDER BY h.name
    """, (cutoff,)).fetchall()

    print(f"[UPDATE] Cavalli attivi trovati: {len(active_horses)}", file=sys.stderr)

    updated_count = 0
    new_races_total = 0

    for name, birth_year in active_horses:
        races_soup = fetch_trottoweb(TROTTOWEB_RACES, params={"cavallo": name, "anno": birth_year})
        if not races_soup:
            continue

        races = parse_races(races_soup, name)
        inserted = _insert_races(conn, races)
        if inserted > 0:
            _update_horse_career_stats(conn, name)
            updated_count += 1
            new_races_total += inserted
            print(f"  [UPD] {name}: +{inserted} gare", file=sys.stderr)

    print(f"[UPDATE] Cavalli aggiornati: {updated_count}, gare nuove: {new_races_total}", file=sys.stderr)
    return updated_count, new_races_total

# ─────────────────────────────────────────────
# FASE 3 — RATINGS
# ─────────────────────────────────────────────
def phase_ratings(conn: sqlite3.Connection):
    """Ricalcola rating SSS..F per tutti i cavalli e statistiche stalloni."""
    print("[RATINGS] Calcolo rating...", file=sys.stderr)

    # Raccoglie tutti i cavalli con dati carriera
    horses = conn.execute("""
        SELECT h.name, h.birth_year, h.sire,
               h.career_races, h.career_wins, h.career_earnings, h.record_career
        FROM horses h
        WHERE h.career_races > 0
    """).fetchall()

    # Calcola percentili su tutto il dataset
    all_earnings = [r[5] for r in horses if r[5]]
    all_earnings_sorted = sorted(all_earnings)
    n_total = len(all_earnings_sorted)

    def earn_pct(earnings: float) -> float:
        if n_total == 0 or not earnings:
            return 0.0
        pos = sum(1 for e in all_earnings_sorted if e <= earnings)
        return round(pos / n_total * 100, 2)

    def time_to_seconds(time_str: str) -> Optional[float]:
        """Converte '1\'10\"5' in secondi per km."""
        if not time_str:
            return None
        m = re.match(r"(\d+)'(\d+)\"(\d+)", time_str)
        if m:
            return int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 10
        return None

    all_times = []
    for h in horses:
        t = time_to_seconds(h[6] or "")
        if t:
            all_times.append(t)
    all_times_sorted = sorted(all_times)
    n_times = len(all_times_sorted)

    def time_pct(record: str) -> float:
        """Percentile tempo: tempi più bassi = migliori = percentile più alto."""
        t = time_to_seconds(record or "")
        if not t or n_times == 0:
            return 0.0
        # Inverso: più basso il tempo, più alto il percentile
        pos = sum(1 for x in all_times_sorted if x >= t)
        return round(pos / n_times * 100, 2)

    # Calcola score base per ogni cavallo
    scores = {}
    for row in horses:
        name, birth_year, sire, career_races, career_wins, career_earnings, record_career = row
        if not career_races or career_races == 0:
            continue

        ep = earn_pct(career_earnings or 0)
        tp = time_pct(record_career or "")
        win_rate = (career_wins / career_races * 100) if career_races else 0

        # Score composto (performance mode):
        # 50% earnings percentile + 30% time percentile + 20% win rate
        score = ep * 0.50 + tp * 0.30 + win_rate * 0.20
        score = round(min(score, 100.0), 2)
        grade = score_to_grade(score)

        scores[(name, birth_year)] = {
            "score": score,
            "grade": grade,
            "earn_percentile": ep,
            "time_percentile": tp,
            "win_rate": round(win_rate, 2),
        }

    # Percentile per sire (tra figli dello stesso stallone)
    sire_groups: dict[str, list[float]] = {}
    for (name, birth_year), data in scores.items():
        sire = conn.execute("SELECT sire FROM horses WHERE name=? AND birth_year=?", (name, birth_year)).fetchone()
        if sire and sire[0]:
            sire_name = sire[0].upper()
            sire_groups.setdefault(sire_name, []).append(data["score"])

    def sire_pct(sire_name: str, score: float) -> float:
        if not sire_name or sire_name not in sire_groups:
            return 0.0
        grp = sorted(sire_groups[sire_name])
        pos = sum(1 for s in grp if s <= score)
        return round(pos / len(grp) * 100, 2)

    # Upsert horse_ratings (performance)
    now_iso = datetime.utcnow().isoformat()
    for (name, birth_year), data in scores.items():
        sire = conn.execute("SELECT sire FROM horses WHERE name=? AND birth_year=?", (name, birth_year)).fetchone()
        sire_name = (sire[0] or "").upper() if sire else ""
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

    # ── Rating stalloni (volume multiplier) ──
    print("[RATINGS] Calcolo rating stalloni...", file=sys.stderr)

    stallions = conn.execute("""
        SELECT DISTINCT sire FROM horse_ratings
        WHERE sire IS NOT NULL AND sire != '' AND rating_mode='performance'
    """).fetchall()

    for (sire_name,) in stallions:
        children = conn.execute("""
            SELECT grade, score FROM horse_ratings
            WHERE UPPER(TRIM(sire))=UPPER(TRIM(?)) AND rating_mode='performance'
        """, (sire_name,)).fetchall()

        if not children:
            continue

        n = len(children)
        vm = volume_multiplier(n)

        # base_score formula da specifiche
        grade_counts = {g: 0 for g in GRADE_WEIGHTS}
        for (grade, score) in children:
            if grade in grade_counts:
                grade_counts[grade] += 1

        weighted_sum = sum(GRADE_WEIGHTS[g] * c for g, c in grade_counts.items())
        base_score = (weighted_sum / n * vm) if n > 0 else 0.0

        avg_score = round(base_score, 2)
        n_SSS = grade_counts.get("SSS", 0)
        n_SS  = grade_counts.get("SS", 0)
        n_S   = grade_counts.get("S", 0)
        pct_top_S = round((n_SSS + n_SS + n_S) / n * 100, 2) if n > 0 else 0.0

        avg_earnings = conn.execute("""
            SELECT AVG(career_earnings) FROM horse_ratings
            WHERE UPPER(TRIM(sire))=UPPER(TRIM(?)) AND rating_mode='performance'
        """, (sire_name,)).fetchone()[0] or 0.0

        # Stima n_in_corsa (cavalli con almeno 1 gara negli ultimi 6 mesi)
        cutoff = (datetime.utcnow() - timedelta(days=ACTIVE_MONTHS * 30)).strftime("%Y-%m-%d")
        n_in_corsa = conn.execute("""
            SELECT COUNT(DISTINCT h.name)
            FROM horses h
            JOIN races r ON r.horse_name = h.name
            WHERE UPPER(TRIM(h.sire))=UPPER(TRIM(?)) AND r.race_date >= ?
        """, (sire_name, cutoff)).fetchone()[0] or 0

        conn.execute("""
            INSERT OR REPLACE INTO stallion_rating_stats
                (sire, n_figli_totali, n_in_corsa, avg_score,
                 n_SSS, n_SS, n_S, pct_top_S, avg_earnings, last_updated)
            VALUES (?,?,?,?, ?,?,?,?,?,?)
        """, (
            sire_name, n, n_in_corsa, avg_score,
            n_SSS, n_SS, n_S, pct_top_S, round(avg_earnings, 2), now_iso
        ))

    conn.commit()
    print(f"[RATINGS] Rating calcolati: {len(scores)} cavalli, {len(stallions)} stalloni.", file=sys.stderr)

# ─────────────────────────────────────────────
# HELPERS DB interni
# ─────────────────────────────────────────────
def _insert_races(conn: sqlite3.Connection, races: list[dict]) -> int:
    """Inserisce gare con IGNORE su duplicati. Ritorna n. inserite."""
    inserted = 0
    for r in races:
        try:
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
    """Ricalcola career_races, career_wins, career_earnings, record_career dal DB."""
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
            stats[0] or 0,
            stats[1] or 0,
            stats[2] or 0.0,
            stats[3],
            datetime.utcnow().isoformat(),
            horse_name
        ))
        conn.commit()

# ─────────────────────────────────────────────
# FASE 4 — SYNC
# ─────────────────────────────────────────────
def phase_sync():
    """Copia trotto_master.db → data.db (root repo)."""
    print(f"[SYNC] Copio {DB_PATH} → {REPO_DB_PATH}", file=sys.stderr)
    if not DB_PATH.exists():
        print(f"[SYNC] WARN: {DB_PATH} non trovato, skip.", file=sys.stderr)
        return
    shutil.copy2(str(DB_PATH), str(REPO_DB_PATH))
    print("[SYNC] OK.", file=sys.stderr)

# ─────────────────────────────────────────────
# FASE 5 — GIT PUSH
# ─────────────────────────────────────────────
def phase_git_push():
    """Esegue git add data.db && git commit && git push su GitHub."""
    print("[GIT] Eseguo git push...", file=sys.stderr)
    token = GITHUB_TOKEN
    if not token:
        print("[GIT] WARN: GITHUB_TOKEN non impostato, skip push.", file=sys.stderr)
        return

    try:
        # Config git (necessaria in ambienti CI/container)
        subprocess.run(["git", "config", "user.email", "nightly@statippica.bot"], check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "StatIppica Nightly"], check=True, capture_output=True)

        # Imposta remote con token
        remote_url = f"https://{GITHUB_USER}:{token}@github.com/{GITHUB_USER}/{GITHUB_REPO}.git"
        subprocess.run(["git", "remote", "set-url", "origin", remote_url], check=True, capture_output=True)

        # Stage data.db
        subprocess.run(["git", "add", "data.db"], check=True, capture_output=True)

        # Commit (--allow-empty per sicurezza se non ci sono modifiche)
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        result = subprocess.run(
            ["git", "commit", "-m", f"nightly update {now_str}"],
            capture_output=True, text=True
        )
        if "nothing to commit" in result.stdout + result.stderr:
            print("[GIT] Nessuna modifica da committare.", file=sys.stderr)
            return

        # Push
        subprocess.run(["git", "push", "origin", "main"], check=True, capture_output=True)
        print("[GIT] Push completato.", file=sys.stderr)

    except subprocess.CalledProcessError as e:
        print(f"[GIT] ERROR: {e.stderr}", file=sys.stderr)

# ─────────────────────────────────────────────
# FASE 6 — NOTIFICA
# ─────────────────────────────────────────────
def phase_notify(new_horses: int, new_races: int, horses_updated: int):
    """Stampa output JSON e invia notifica Render (opzionale via env)."""
    payload = {
        "new_horses": new_horses,
        "new_races": new_races,
        "horses_updated": horses_updated,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    # Output JSON su stdout (ultima riga — leggibile da Render)
    print(json.dumps(payload))

    # Notifica Render tramite deploy hook (opzionale)
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
def main():
    print(f"[START] {datetime.utcnow().isoformat()} — StatIppica nightly_update.py", file=sys.stderr)

    # Apri/crea DB
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    init_db(conn)

    try:
        # 1. Discovery
        new_horses = phase_discovery(conn)

        # 2. Update
        horses_updated, new_races = phase_update(conn)

        # 3. Ratings
        phase_ratings(conn)

    finally:
        conn.close()

    # 4. Sync
    phase_sync()

    # 5. Git push
    phase_git_push()

    # 6. Notifica + output JSON
    phase_notify(new_horses, new_races, horses_updated)

    print(f"[END] {datetime.utcnow().isoformat()}", file=sys.stderr)


if __name__ == "__main__":
    main()
