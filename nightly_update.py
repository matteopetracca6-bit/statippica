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
import signal
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

# Senza questo, l'output può restare "bloccato" in un buffer per minuti prima
# di comparire nei log di GitHub Actions (non essendo un terminale interattivo,
# Python usa di default un buffering a blocchi, non riga-per-riga) — dando
# l'impressione che lo script sia fermo anche quando sta lavorando normalmente.
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

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

# Mappa codice ippodromo -> nome completo. Condivisa tra la FASE QA (che normalizza
# la colonna track) e la riparazione date (che confronta gare fra loro).
TRACK_CODE_MAP = {
    # Codici display -> nome completo
    'NA': 'NAPOLI', 'BO': 'BOLOGNA', 'RO': 'ROMA', 'PA': 'PALERMO',
    'AV': 'AVERSA', 'TA': 'TARANTO', 'MG': 'MONTEGIORGIO', 'TO': 'TORINO',
    'CS': 'CASTELLUCCIO', 'MI': 'MILANO', 'FI': 'FIRENZE', 'SI': 'SIRACUSA',
    'MO': 'MODENA', 'PD': 'PADOVA', 'CE': 'CESENA', 'GA': 'GARIGLIANO',
    'TV': 'TREVISO', 'MC': 'MONTECATINI', 'FO': 'FOLLONICA', 'VI': 'VILLANOVA',
    'TS': 'TRIESTE', 'PC': 'PONTECAGNANO', 'CA': 'CASARANO', 'CV': 'CIVITANOVA',
    'FE': 'FERRARA', 'PS': 'PRATO',
    # Codici ippod (cavAn.php) che differiscono dai display
    'RM': 'ROMA', 'SC': 'SIRACUSA', 'PV': 'PADOVA', 'FG': 'CASTELLUCCIO',
    'FA': 'GARIGLIANO', 'MR': 'MONTEGIORGIO', 'AL': 'VILLANOVA',
    'SG': 'PRATO', 'CN': 'CASARANO',
    'ES': 'ESTERO',
}


# ── Due popolazioni distinte (decisione di prodotto, 18/09/2026) ──
# ATLETI     : nati dal 2012 in poi. Sono i soggetti di cui il sito parla:
#              rating, leaderboard, classifiche, confronti, tendenze.
# RIPRODUTTORI: nati nel 2011 o prima (e tutti i genitori recuperati da UNIRE).
#              Servono SOLO per la genealogia e per il rating della progenie:
#              non compaiono nelle classifiche atleti e non entrano nei pool
#              di percentile, altrimenti un campione degli anni '90 sposterebbe
#              i voti di tutta la popolazione in gara oggi.
ATHLETE_MIN_BIRTH_YEAR = int(os.environ.get("ATHLETE_MIN_BIRTH_YEAR", "2012"))
CLASS_ATHLETE = "athlete"
CLASS_BREEDER = "breeder"


def horse_class_of(birth_year, source_role: Optional[str] = None) -> str:
    """Classifica un cavallo. Anno ignoto -> atleta: sono 67 soggetti che hanno
    gare nel DB, escluderli nasconderebbe dati veri; il caso va semmai risolto
    recuperando l'anno."""
    if (source_role or "") == "parent_backfill":
        return CLASS_BREEDER
    if birth_year is not None and int(birth_year) < ATHLETE_MIN_BIRTH_YEAR:
        return CLASS_BREEDER
    return CLASS_ATHLETE

# ── Copertura genitori (fattrici/stalloni citati ma assenti dal DB) ──
# Quanti genitori mancanti recuperare per esecuzione. Il collo di bottiglia del
# dataset breeding sono le madri: 5.808 fattrici su 7.719 non hanno una riga in
# `horses`, quindi nessun rating. Con batch 150 e cron bisettimanale la coda si
# esaurisce in alcuni mesi senza sovraccaricare Trottoweb.
# Quanti genitori mancanti recuperare per esecuzione, dalla banca dati UNIRE
# (vedi unire_source.py). Servono 2 richieste per genitore, con 1 secondo di
# pausa: 100 genitori = circa 4 minuti su un job che oggi dura ~23 minuti.
# NOTA: Trottoweb (cavAn.php) non puo' essere usato per questo — copre solo
# cavalli "da 2 a 14 anni (10 per le femmine)" e su 40 fattrici reali ne ha
# trovate 0. UNIRE copre gli anni di nascita dal 1900.
PARENT_COVERAGE_BATCH_SIZE = int(os.environ.get("PARENT_COVERAGE_BATCH_SIZE", "100"))
# Usato solo se in futuro si recuperassero le singole gare dei genitori: UNIRE
# fornisce i totali di carriera gia' aggregati, non l'elenco delle corse.
PARENT_MIN_RACE_DATE = os.environ.get("PARENT_MIN_RACE_DATE", "2000-01-01")

# Backfill storico: quanti cavalli "mettere in pari" per ogni esecuzione notturna.
# Il cron gira lun+gio, quindi con batch=250 ~22.000 cavalli vengono coperti in poche settimane.
BACKFILL_BATCH_SIZE = int(os.environ.get("BACKFILL_BATCH_SIZE", "250"))
# Dopo quanti giorni un cavallo già "done" viene ricontrollato (Trottoweb può correggere dati vecchi)
REBACKFILL_DAYS = int(os.environ.get("REBACKFILL_DAYS", "180"))
# Backfill storico: fase dedicata al recupero gare pre-2019 per cavalli con buchi
HISTORICAL_BATCH_SIZE = int(os.environ.get("HISTORICAL_BATCH_SIZE", "400"))
# Quanti cavalli con gare senza data ripescare ogni notte dalla pagina di carriera
UNDATED_BATCH_SIZE = int(os.environ.get("UNDATED_BATCH_SIZE", "500"))
# Per quanti giorni non riprovare un cavallo gia' tentato senza successo
UNDATED_RETRY_DAYS = int(os.environ.get("UNDATED_RETRY_DAYS", "45"))
# Quante giornate future sondare per i partenti (la fonte pubblica 2-3 giorni prima)
UPCOMING_DAYS = int(os.environ.get("UPCOMING_DAYS", "7"))
HISTORICAL_CUTOFF_YEAR = int(os.environ.get("HISTORICAL_CUTOFF_YEAR", "2018"))

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

def dam_volume_multiplier(n: int) -> float:
    """Come volume_multiplier ma tarato sulle fattrici.

    Curva diversa per un motivo biologico, non estetico: uno stallone puo'
    avere centinaia di figli, quindi un solo figlio non e' evidenza e va
    penalizzato pesantemente (0.40). Una fattrice fa circa un puledro l'anno e
    nel nostro DB il massimo osservato e' 12: penalizzarla come uno stallone
    significherebbe dire che nessuna fattrice potra' mai superare 40 punti.
    """
    if n == 1:  return 0.70
    if n == 2:  return 0.78
    if n == 3:  return 0.84
    if n == 4:  return 0.88
    if n <= 6:  return 0.92
    if n <= 9:  return 0.96
    return 1.00

# ─────────────────────────────────────────────
# GRADE MAP
# ─────────────────────────────────────────────
GRADE_WEIGHTS = {
    "SSS": 100, "SS": 85, "S": 70, "A": 55, "B": 40,
    "C": 25, "D": 15, "E": 8, "F": 2
}

# Soglie rating cavalli (performance) — calcolate dinamicamente sui percentili
# del dataset reale (sostituite a runtime da build_horse_grade_thresholds).
HORSE_GRADE_THRESHOLDS: list[tuple[float, str]] = []

# Soglie rating stalloni — calcolate dinamicamente sui percentili
# del dataset reale (sostituite a runtime da build_stallion_grade_thresholds).
STALLION_GRADE_THRESHOLDS: list[tuple[float, str]] = []

# Percentili comuni per cavalli e stalloni:
#   SSS = top 1%,  SS = top 5%,  S = top 10%, A = top 25%,
#   B   = top 40%, C  = top 60%, D = top 75%, E = top 90%, F = resto (bottom 10%)
_GRADE_PERCENTILES = [
    (99, "SSS"), (95, "SS"), (90, "S"), (75, "A"),
    (60, "B"),   (40, "C"),  (25, "D"), (10, "E"),
]

def _build_percentile_thresholds(scores: list[float]) -> list[tuple[float, str]]:
    """
    Calibra le soglie sui percentili del dataset reale.
    SSS = top 1%, SS = top 5%, S = top 10%, A = top 25%,
    B = top 40%, C = top 60%, D = top 75%, E = top 80%, F = resto (bottom 20%).
    """
    if not scores:
        return [(0, "F")]
    s = sorted(scores)
    n = len(s)
    def pv(p): return s[min(int(p / 100 * n), n - 1)]
    return [(pv(p), g) for p, g in _GRADE_PERCENTILES] + [(0, "F")]

def build_horse_grade_thresholds(scores: list[float]) -> list[tuple[float, str]]:
    return _build_percentile_thresholds(scores)

def build_stallion_grade_thresholds(scores: list[float]) -> list[tuple[float, str]]:
    return _build_percentile_thresholds(scores)

def score_to_horse_grade(score: float, thresholds: list[tuple[float, str]] | None = None) -> str:
    thr = thresholds or HORSE_GRADE_THRESHOLDS
    for threshold, grade in thr:
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

    -- Rating FATTRICI: stesso impianto degli stalloni, tabella separata perche'
    -- la chiave e' la madre e le fonti sono diverse (nessun dato VendoPuledri).
    CREATE TABLE IF NOT EXISTS dam_rating_stats (
        dam              TEXT PRIMARY KEY,
        n_figli_totali   INTEGER,   -- figli citati nel DB
        n_valutati       INTEGER,   -- figli con un rating performance
        n_in_corsa       INTEGER,   -- figli con almeno una gara negli ultimi mesi
        avg_score        REAL,      -- media pesata dei voti dei figli, x volume
        grade            TEXT,
        n_SSS            INTEGER DEFAULT 0,
        n_SS             INTEGER DEFAULT 0,
        n_S              INTEGER DEFAULT 0,
        pct_top_S        REAL,
        avg_earnings     REAL,
        -- carriera PROPRIA della fattrice (totali da UNIRE, non gara per gara):
        -- serve a leggere la progenie alla luce di quanto valeva la madre
        own_races        INTEGER,
        own_wins         INTEGER,
        own_earnings     REAL,
        own_record       TEXT,
        own_grade        TEXT,
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
        # Cavalli aggiunti dalla fase di copertura genitori (fattrici e stalloni
        # citati come padre/madre ma non presenti nella popolazione scrapata).
        # Servono al modello breeding, ma NON devono entrare nei pool di
        # percentile: altrimenti tutti i voti già pubblicati cambierebbero.
        ("source_role",      "TEXT"),
        ("parent_fetch_at",  "TEXT"),
        # 'athlete' | 'breeder' — vedi horse_class_of()
        ("horse_class",      "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE horses ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass  # colonna già esistente

    # Cavalli inseriti prima di questa modifica non hanno backfill_status -> pending
    conn.execute("UPDATE horses SET backfill_status='pending' WHERE backfill_status IS NULL")

    # Riparazione una tantum (bug FASE QA del 17/09/2026): la FASE QA ricalcolava
    # career_stats dalla tabella `races` anche per i genitori presi da UNIRE, che
    # in quella tabella non hanno righe, azzerando i 300 gia' recuperati. Avendo
    # parent_fetch_at valorizzato non sarebbero mai stati ritentati, restando a
    # zero per sempre: lo azzeriamo per rimetterli in coda.
    # La condizione si auto-esaurisce, perche' al nuovo tentativo la fase
    # riscrive parent_fetch_at.
    conn.execute("""
        UPDATE horses SET parent_fetch_at = NULL
        WHERE COALESCE(source_role, '') = 'parent_backfill'
          AND COALESCE(career_races, 0) = 0
          AND parent_fetch_at IS NOT NULL
          AND parent_fetch_at < '2026-09-18'
    """)

    # Classificazione atleti / riproduttori: ricalcolata a ogni avvio, cosi'
    # un cavallo che acquisisce l'anno di nascita finisce subito nel gruppo
    # giusto. E' un UPDATE su due colonne indicizzabili, costa millisecondi.
    conn.execute(f"""
        UPDATE horses SET horse_class = CASE
            WHEN COALESCE(source_role, '') = 'parent_backfill' THEN '{CLASS_BREEDER}'
            WHEN birth_year IS NOT NULL AND birth_year < {ATHLETE_MIN_BIRTH_YEAR} THEN '{CLASS_BREEDER}'
            ELSE '{CLASS_ATHLETE}'
        END
        WHERE horse_class IS NULL OR horse_class <> CASE
            WHEN COALESCE(source_role, '') = 'parent_backfill' THEN '{CLASS_BREEDER}'
            WHEN birth_year IS NOT NULL AND birth_year < {ATHLETE_MIN_BIRTH_YEAR} THEN '{CLASS_BREEDER}'
            ELSE '{CLASS_ATHLETE}'
        END
    """)

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
        # 'athlete' | 'breeder': il sito filtra le classifiche su questa colonna
        ("horse_class",      "TEXT"),
        ("last_updated",     "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE horse_ratings ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass

    # Allinea la classe sulle righe di rating gia' presenti: senza questo le
    # classifiche mostrerebbero ancora i riproduttori valutati nelle notti
    # precedenti (215 righe al 18/09/2026), perche' con carriera azzerata non
    # vengono piu' ricalcolati e resterebbero con horse_class NULL.
    conn.execute("""
        UPDATE horse_ratings SET horse_class = COALESCE((
            SELECT h.horse_class FROM horses h
            WHERE h.name = horse_ratings.name
              AND (h.birth_year IS horse_ratings.birth_year OR h.birth_year = horse_ratings.birth_year)
        ), 'athlete')
        WHERE horse_class IS NULL
    """)

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

    # Unisce cavalli duplicati per varianti di nome (stesso cavallo, spazi/maiuscole
    # diverse) PRIMA di normalizzare sire/dam, così i riferimenti dei figli ai genitori
    # duplicati vengono ripuntati insieme alla riga del cavallo stesso.
    _merge_duplicate_horses(conn)

    # Normalizzazione completa una tantum (idempotente, si ripete ogni notte ma è
    # economica): allinea sire/dam esistenti allo stesso formato canonico usato dalle
    # nuove scritture. Fatta in Python (non solo SQL TRIM/UPPER) perché intercetta
    # anche spazi doppi interni ("MUSCLE  HILL"), che TRIM() non tocca essendo un
    # comando che agisce solo sui bordi della stringa.
    to_fix_horses = []
    for rowid, sire, dam in conn.execute(
        "SELECT rowid, sire, dam FROM horses WHERE sire IS NOT NULL OR dam IS NOT NULL"
    ).fetchall():
        new_sire, new_dam = _normalize_name(sire), _normalize_name(dam)
        if new_sire != sire or new_dam != dam:
            to_fix_horses.append((new_sire, new_dam, rowid))
    if to_fix_horses:
        conn.executemany("UPDATE horses SET sire=?, dam=? WHERE rowid=?", to_fix_horses)
        print(f"[INIT] Normalizzati sire/dam di {len(to_fix_horses)} cavalli esistenti.", file=sys.stderr)

    to_fix_ratings = []
    for rowid, sire in conn.execute(
        "SELECT rowid, sire FROM horse_ratings WHERE sire IS NOT NULL"
    ).fetchall():
        new_sire = _normalize_name(sire)
        if new_sire != sire:
            to_fix_ratings.append((new_sire, rowid))
    if to_fix_ratings:
        conn.executemany("UPDATE horse_ratings SET sire=? WHERE rowid=?", to_fix_ratings)
        print(f"[INIT] Normalizzati sire di {len(to_fix_ratings)} righe horse_ratings.", file=sys.stderr)

    # BUG CRITICO scoperto: la PRIMARY KEY dichiarata nel CREATE TABLE per
    # horse_ratings (name, birth_year, rating_mode) non è mai stata applicata
    # davvero sullo schema di produzione (stesso tipo di schema-drift già visto
    # per la colonna last_updated mancante). Senza un vincolo di unicità reale,
    # "INSERT OR REPLACE" si comporta come un semplice INSERT: ogni notte che
    # phase_ratings gira crea una riga duplicata in più per OGNI cavallo, invece
    # di sovrascrivere quella esistente. Deduplica (tiene lo score più alto per
    # gruppo) e poi crea un indice univoco reale — SQLite può aggiungerlo a una
    # tabella già esistente, a differenza della PRIMARY KEY.
    dupe_groups = conn.execute("""
        SELECT name, birth_year, rating_mode, COUNT(*) c
        FROM horse_ratings
        GROUP BY name, birth_year, rating_mode
        HAVING c > 1
    """).fetchall()
    dupe_rows_removed = 0
    for name, birth_year, rating_mode, cnt in dupe_groups:
        rowids = conn.execute("""
            SELECT rowid FROM horse_ratings
            WHERE name=? AND birth_year IS ? AND rating_mode IS ?
            ORDER BY score DESC, rowid DESC
        """, (name, birth_year, rating_mode)).fetchall()
        for (rowid,) in rowids[1:]:
            conn.execute("DELETE FROM horse_ratings WHERE rowid=?", (rowid,))
            dupe_rows_removed += 1
    if dupe_rows_removed:
        print(f"[INIT] Rimosse {dupe_rows_removed} righe duplicate in horse_ratings "
              f"(mancava un indice univoco reale).", file=sys.stderr)

    try:
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_horse_ratings_unique
            ON horse_ratings(name, birth_year, rating_mode)
        """)
    except sqlite3.IntegrityError as e:
        print(f"[WARN] Impossibile creare indice univoco horse_ratings (duplicati residui?): {e}", file=sys.stderr)

    # Stessa protezione difensiva su horses: dopo il merge dei duplicati sopra
    # non dovrebbero più essercene, ma aggiungiamo comunque l'indice per essere
    # sicuri che eventuali INSERT futuri rispettino davvero l'unicità.
    try:
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_horses_unique
            ON horses(name, birth_year)
        """)
    except sqlite3.IntegrityError as e:
        print(f"[WARN] Impossibile creare indice univoco horses (duplicati residui?): {e}", file=sys.stderr)

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

def _time_to_seconds(time_val) -> Optional[float]:
    """
    Converte un tempo sul km in secondi totali. Tollerante a più formati
    presenti nel DB (dati legacy + fonti diverse nel tempo):
      - "1'14\"6"    (apostrofo/virgolette — quello che lo script produceva finora)
      - "1.14.6"     (punti, minuto esplicito — presente in alcuni record legacy)
      - "13.3" / 13.3 (numero o stringa a un solo punto — il formato standard
                       "record al km" del trotto italiano: SS.T con il minuto
                       implicito (quasi tutti i tempi al km sono "1'xx"y"),
                       quindi si sommano 60s. Confermato sui dati reali: valori
                       come 13.3-18.7 diventano 73.3-78.7s, un range plausibile
                       per il trotto — ERA la causa del bug "Miglior tempo 0.0°",
                       la vecchia regex non riconosceva affatto questo formato)
    """
    if time_val is None:
        return None
    time_str = str(time_val).strip()
    if not time_str:
        return None
    m = re.match(r"(\d+)'(\d+)\"(\d+)", time_str)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 10
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", time_str)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 10
    # Numero puro o stringa a un solo punto (es. 13.3, "13.3"): formato standard
    # "record al km", minuto implicito -> sommiamo 60s.
    m = re.match(r"^(\d+)(?:\.(\d+))?$", time_str)
    if m:
        try:
            return 60.0 + float(time_str)
        except ValueError:
            return None
    return None

_INVISIBLE_CHARS = re.compile(
    "[\u200b\u200c\u200d\u200e\u200f\ufeff\u2060\u00ad]"  # zero-width space/joiner/mark, BOM, word-joiner, soft hyphen
)

def _normalize_name(s: Optional[str]) -> Optional[str]:
    """
    Normalizza un nome (cavallo/padre/madre) in forma canonica: maiuscolo,
    spazi iniziali/finali rimossi, spazi interni multipli collassati in uno solo,
    caratteri invisibili (zero-width space e simili, che \\s non intercetta ma sono
    presenti in alcune pagine scrapate) rimossi del tutto.
    Senza questo, varianti come "NOME  COGNOME" (doppio spazio), "nome cognome"
    (minuscolo), o "NOME\u200bCOGNOME" (zero-width space invisibile) risultano
    stringhe diverse pur essendo lo stesso cavallo/stallone, causando join duplicati
    e genealogie non trovate.
    """
    if not s:
        return s
    s = _INVISIBLE_CHARS.sub(" ", s)
    return re.sub(r"\s+", " ", s.strip()).upper()

class _HardTimeout(Exception):
    pass

def _hard_timeout(seconds: int):
    """Context manager: uccide l'operazione in corso dopo N secondi, qualunque sia
    la causa del blocco (rete che non chiude la connessione, regex pathologica,
    ecc.) — il timeout di requests da solo non basta a coprire tutti i casi."""
    class _Ctx:
        def __enter__(self):
            def _handler(signum, frame):
                raise _HardTimeout(f"operazione bloccata oltre {seconds}s")
            self._old = signal.signal(signal.SIGALRM, _handler)
            signal.alarm(seconds)
            return self
        def __exit__(self, *exc):
            signal.alarm(0)
            signal.signal(signal.SIGALRM, self._old)
            return False
    return _Ctx()

def _fetch_and_insert_full_career(conn: sqlite3.Connection, name: str, birth_year: Optional[int] = None,
                                  min_race_date: str = MIN_RACE_DATE) -> int:
    """
    Recupera profilo + intera carriera di un cavallo da cavAn.php (endpoint reale,
    dominio legacy trottoweb.com) e li inserisce/aggiorna nel DB.
    Le gare vengono inserite con INSERT OR IGNORE -> colma solo i buchi, non duplica.
    Filtra le gare precedenti a MIN_RACE_DATE.
    Ritorna il numero di gare effettivamente inserite (nuove).
    """
    try:
        with _hard_timeout(90):
            data = _fetch_cavan(name)
    except _HardTimeout:
        print(f"  [TIMEOUT] {name}: operazione bloccata oltre 90s, salto e proseguo.", file=sys.stderr)
        return 0
    if not data:
        return 0

    sire_norm = _normalize_name(data.get("sire"))
    dam_norm  = _normalize_name(data.get("dam"))

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
              sire_norm, dam_norm, name))
        conn.commit()

    races = _filter_min_date(data.get("races", []), min_race_date)
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

def _merge_duplicate_horses(conn: sqlite3.Connection):
    """
    Prima che sire/dam venissero normalizzati, anche il NOME del cavallo stesso
    poteva essere salvato con varianti di spazi/maiuscole (es. "IN SCREAM GIO" vs
    "IN SCREAM  GIO" con doppio spazio interno, invisibile a schermo). Siccome la
    chiave primaria di 'horses' è (name, birth_year), ogni variante crea una riga
    fisicamente diversa: stesso cavallo mostrato più volte in UI, gare/statistiche
    frammentate tra le copie.

    Uniamo qui in modo conservativo: solo cavalli con lo STESSO anno di nascita
    NON NULLO vengono uniti automaticamente (per non rischiare di fondere per errore
    due cavalli realmente diversi che condividono nome ma hanno anno sconosciuto).
    Le gare della copia vengono ripuntate al nome canonico (quello con più gare),
    evitando duplicati per (cavallo, data); le righe superflue vengono eliminate.
    """
    rows = conn.execute(
        "SELECT rowid, name, birth_year FROM horses WHERE birth_year IS NOT NULL"
    ).fetchall()

    groups: dict[tuple, list] = {}
    for rowid, name, birth_year in rows:
        groups.setdefault((_normalize_name(name), birth_year), []).append((rowid, name))

    merged_count = 0
    for (norm_name, birth_year), variants in groups.items():
        raw_names = {v[1] for v in variants}
        if len(raw_names) <= 1 and norm_name in raw_names:
            continue  # nessun duplicato, nome già canonico

        def race_count(nm: str) -> int:
            return conn.execute("SELECT COUNT(*) FROM races WHERE horse_name=?", (nm,)).fetchone()[0]

        # Se una delle varianti è già esattamente nella forma canonica, usiamola
        # direttamente come riga canonica (rinominare una riga diversa in quel nome
        # scontrerebbe la chiave primaria, visto che esiste già).
        exact = [v for v in variants if v[1] == norm_name]
        if exact:
            canonical_rowid, canonical_raw = exact[0]
            other_variants = [v for v in variants if v[0] != canonical_rowid]
        else:
            variants_sorted = sorted(variants, key=lambda v: -race_count(v[1]))
            canonical_rowid, canonical_raw = variants_sorted[0]
            other_variants = variants_sorted[1:]
            try:
                conn.execute("UPDATE horses SET name=? WHERE rowid=?", (norm_name, canonical_rowid))
            except sqlite3.IntegrityError:
                continue  # collisione imprevista: si autorisolve al prossimo giro

        for rowid, raw_name in other_variants:
            if raw_name == norm_name:
                continue
            for race_id, race_date in conn.execute(
                "SELECT id, race_date FROM races WHERE horse_name=?", (raw_name,)
            ).fetchall():
                exists = conn.execute(
                    "SELECT 1 FROM races WHERE horse_name=? AND race_date=?", (norm_name, race_date)
                ).fetchone()
                if exists:
                    conn.execute("DELETE FROM races WHERE id=?", (race_id,))
                else:
                    conn.execute("UPDATE races SET horse_name=? WHERE id=?", (norm_name, race_id))

            # Eventuali cavalli che avessero questa variante come padre/madre
            conn.execute("UPDATE horses SET sire=? WHERE sire=?", (norm_name, raw_name))
            conn.execute("UPDATE horses SET dam=? WHERE dam=?", (norm_name, raw_name))
            conn.execute("UPDATE horse_ratings SET sire=? WHERE sire=?", (norm_name, raw_name))

            conn.execute("DELETE FROM horse_ratings WHERE name=?", (raw_name,))
            conn.execute("DELETE FROM horses WHERE rowid=?", (rowid,))
            merged_count += 1

        _update_horse_career_stats(conn, norm_name)

    if merged_count:
        conn.commit()
        print(f"[INIT] Uniti {merged_count} cavalli duplicati (varianti di nome).", file=sys.stderr)

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
    horse_name = _normalize_name(horse_name)
    text = soup.get_text(" ", strip=True)

    m = re.search(r"\b([mf])\.([ie])\.(\d{1,2})\b", text)
    if m:
        result["sex"] = "M" if m.group(1) == "m" else "F"
        result["country"] = "ITA" if m.group(2) == "i" else "EST"
        # L'età è "anni compiuti nella stagione corrente": approssimiamo l'anno di nascita
        # come anno_corrente - età. Può sbagliare di ±1 rispetto al vero anno solare di nascita.
        age = int(m.group(3))
        result["birth_year"] = datetime.utcnow().year - age

    # Formato reale confermato: subito dopo il marcatore sesso/età compare
    # "PADRE / MADRE" (due parti, non tre) seguito da "carriera...", es:
    # "INCREDIBLE RUN f.i.3 UP FRONT LARRY / ANGELIQUE carriera1004972,40..."
    m2 = None
    if m:
        tail = text[m.end():m.end() + 200]
        m2 = re.search(
            r"^\s*([A-Z][A-Za-z0-9À-ÖØ-öø-ÿ'.\- ]*?)\s*/\s*([A-Z][A-Za-z0-9À-ÖØ-öø-ÿ'.\- ]*?)\s+[a-z]",
            tail
        )
    if not m2:
        # Fallback per eventuali pagine con formato diverso (padre / codice / madre)
        m2 = re.search(
            r"\b([A-Z][A-Z0-9À-ÖØ-öø-ÿ'.\- ]{1,40}?)\s*/\s*[a-zA-Z]\d*\s*/\s*([A-Z][A-Z0-9À-ÖØ-öø-ÿ'.\- ]{1,40}?)(?:\s+cat\.mc|\s+[a-z]|\s*$)",
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
        # Preferisci il codice track dal testo display (es. "3^ RO") invece del
        # parametro ippod= (che a volte e' un codice provincia diverso, es. RM invece di RO)
        track_text = tds[1].get_text(strip=True) if len(tds) > 1 else ""
        m_track = re.search(r"\^\s*([A-Z]{2,3})\s*$", track_text)
        if m_track:
            track = m_track.group(1)
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
        # Formato Trottoweb: M.SS.T (es. 1.14.8) -> decimale 14.8 (minuto implicito)
        m_time = re.match(r"(\d+)\.(\d+)\.(\d+)", time_raw)
        if m_time:
            minutes = int(m_time.group(1))
            seconds = int(m_time.group(2))
            tenths = int(m_time.group(3))
            if minutes == 1:
                time_km = seconds + tenths / 10.0
            else:
                time_km = (minutes * 60 + seconds + tenths / 10.0) - 60.0
        else:
            # Formato SS.T (es. 15.7) -> decimale diretto
            m_time2 = re.match(r"^(\d+\.\d+)$", time_raw)
            if m_time2:
                time_km = float(time_raw)

        prize_raw = tds[6].get_text(strip=True) if len(tds) > 6 else "0"
        prize = _parse_float(prize_raw) if prize_raw not in ("---", "") else 0.0

        result["races"].append({
            "horse_name":    horse_name,
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
            horse_name = _normalize_name(td("nome_cav_u") or td("nome_cav"))
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
    horse_name = _normalize_name(horse_name)
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

    for i, (name, birth_year) in enumerate(active_horses, 1):
        inserted = _fetch_and_insert_full_career(conn, name, birth_year)
        if inserted > 0:
            updated_count += 1
            new_races_total += inserted
            print(f"  [UPD] {name}: +{inserted} gare", file=sys.stderr)
        if i % 25 == 0:
            print(f"  ... {i}/{len(active_horses)} cavalli controllati "
                  f"({updated_count} con gare nuove finora)", file=sys.stderr)

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
          AND COALESCE(horse_class, 'athlete') <> 'breeder'
    """, (rebackfill_cutoff,))
    conn.commit()

    # I genitori recuperati da UNIRE (source_role='parent_backfill') non vanno
    # ricercati su Trottoweb: non esistono in quel perimetro e il tentativo, oltre
    # a essere sprecato, azzererebbe i loro totali di carriera via
    # _update_horse_career_stats (che li ricalcola dalla tabella `races`, vuota per loro).
    pending = conn.execute("""
        SELECT name, birth_year FROM horses
        WHERE (backfill_status IS NULL OR backfill_status = 'pending')
          AND COALESCE(horse_class, 'athlete') <> 'breeder'
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
        if horses_backfilled % 25 == 0:
            print(f"  ... {horses_backfilled}/{len(pending)} cavalli controllati "
                  f"({new_races_found} gare colmate finora)", file=sys.stderr)

    print(f"[BACKFILL] Cavalli controllati: {horses_backfilled}, gare colmate: {new_races_found}", file=sys.stderr)
    return horses_backfilled, new_races_found

# ─────────────────────────────────────────────
# FASE 2b2 — BACKFILL STORICO (gare pre-2019)
# ─────────────────────────────────────────────
def phase_historical_backfill(conn: sqlite3.Connection) -> tuple[int, int]:
    """
    Recupera le gare storiche (pre-2019) mancanti per cavalli nati prima del 2018.
    cavAn.php restituisce fino a ~200 gare per cavallo, quindi per i cavalli
    attivi con carriere lunghe, le gare piu' vecchie potrebbero non essere mai
    state scaricate. Questa fase priorizza proprio quei cavalli.
    """
    print("[HISTORICAL] Ricerca cavalli con buchi pre-2019...", file=sys.stderr)

    # Trova cavalli nati prima del 2018 con poche gare pre-2019
    # che non sono gia' stati controllati di recente
    cutoff_date = f"{HISTORICAL_CUTOFF_YEAR + 1}-01-01"  # es. 2019-01-01
    horses = conn.execute("""
        SELECT h.name, h.birth_year,
               (SELECT COUNT(*) FROM races r WHERE r.horse_name = h.name AND r.race_date < ?) as old_races
        FROM horses h
        WHERE h.birth_year IS NOT NULL AND h.birth_year <= ?
          AND h.birth_year >= ?
          AND COALESCE(h.horse_class, 'athlete') <> 'breeder'
          AND (h.backfill_status IS NULL OR h.backfill_status = 'pending')
        ORDER BY old_races ASC, h.name ASC
        LIMIT ?
    """, (cutoff_date, HISTORICAL_CUTOFF_YEAR, ATHLETE_MIN_BIRTH_YEAR, HISTORICAL_BATCH_SIZE)).fetchall()

    print(f"[HISTORICAL] Cavalli da controllare: {len(horses)} (batch: {HISTORICAL_BATCH_SIZE})", file=sys.stderr)

    total_new = 0
    horses_updated = 0

    for i, (name, birth_year, old_count) in enumerate(horses, 1):
        inserted = _fetch_and_insert_full_career(conn, name, birth_year)
        _mark_backfilled(conn, name)
        if inserted > 0:
            total_new += inserted
            horses_updated += 1
            print(f"  [HIST] {name} (nato {birth_year}): +{inserted} gare (aveva {old_count} pre-{HISTORICAL_CUTOFF_YEAR+1})", file=sys.stderr)
        if i % 50 == 0:
            print(f"  ... {i}/{len(horses)} cavalli controllati ({total_new} gare recuperate)", file=sys.stderr)

    print(f"[HISTORICAL] Cavalli aggiornati: {horses_updated}, gare recuperate: {total_new}", file=sys.stderr)
    return horses_updated, total_new

# ─────────────────────────────────────────────
# FASE 2c — COPERTURA GENITORI
# Fattrici e stalloni citati come padre/madre di cavalli presenti nel DB, ma
# senza una propria riga in `horses` (o senza carriera): finché mancano, non
# hanno rating e l'accoppiamento non è utilizzabile dal modello breeding.
# ─────────────────────────────────────────────
def _parent_candidates(conn: sqlite3.Connection) -> tuple[list[tuple[str, str, int]], int]:
    """
    Calcola in memoria (NON con una JOIN SQL) i genitori citati come sire/dam che
    non hanno ancora una carriera nel DB.

    Il confronto va fatto su nome normalizzato (maiuscolo, spazi collassati): una
    JOIN del tipo `ON UPPER(TRIM(h.name)) = p.pname` non puo' usare l'indice su
    `horses(name)` e degenera in una scansione completa per ogni riga — su ~23.000
    cavalli il job resta bloccato per ore. Caricare due colonne in Python e usare
    dizionari costa pochi secondi.

    Ritorna (candidati ordinati per numero di figli, totale candidati).
    """
    known: dict[str, tuple[int, Optional[str]]] = {}
    for name, races, fetched in conn.execute(
        "SELECT name, COALESCE(career_races, 0), parent_fetch_at FROM horses"
    ):
        key = _normalize_name(name)
        if not key:
            continue
        prev = known.get(key)
        # A parita' di nome tiene la versione con piu' corse (difensivo: i duplicati
        # dovrebbero gia' essere stati uniti da _merge_duplicate_horses).
        if prev is None or races > prev[0]:
            known[key] = (races, fetched)

    counts: dict[tuple[str, str], int] = {}
    for sire, dam in conn.execute("SELECT sire, dam FROM horses"):
        for raw, role in ((dam, "dam"), (sire, "sire")):
            pname = _normalize_name(raw)
            if not pname:
                continue
            row = known.get(pname)
            # Gia' coperto: ha corse note, oppure e' gia' stato tentato senza esito
            # (parent_fetch_at valorizzato) e non va richiesto a ogni esecuzione.
            if row is not None and (row[0] > 0 or row[1] is not None):
                continue
            counts[(pname, role)] = counts.get((pname, role), 0) + 1

    ordered = sorted(
        ((n, role, c) for (n, role), c in counts.items()),
        key=lambda t: (-t[2], t[0]),
    )
    return ordered, len({n for n, _, _ in ordered})


def _missing_parents(conn: sqlite3.Connection, limit: int) -> list[tuple[str, str, int]]:
    """Genitori da recuperare, ordinati per numero di figli nel DB (piu' figli =
    piu' accoppiamenti sbloccati per ogni pagina scaricata).

    Meta' della quota e' riservata alle fattrici: gli stalloni hanno centinaia di
    figli a testa e monopolizzerebbero ogni batch, mentre il buco di copertura
    piu' grave (e il lato che pesa di piu' nel modello breeding) sono le madri,
    che hanno 1-3 figli ciascuna.
    """
    ordered, _ = _parent_candidates(conn)
    return _split_quota(ordered, limit)


def _split_quota(ordered: list[tuple[str, str, int]], limit: int) -> list[tuple[str, str, int]]:
    half = max(1, limit // 2)
    out: list[tuple[str, str, int]] = []
    seen: set[str] = set()
    for role, quota in (("dam", half), ("sire", limit - half)):
        taken = 0
        for row in ordered:
            if taken >= quota:
                break
            if row[1] == role and row[0] not in seen:
                out.append(row)
                seen.add(row[0])
                taken += 1
    if len(out) < limit:  # un ruolo e' esaurito: riempi con l'altro
        for row in ordered:
            if len(out) >= limit:
                break
            if row[0] not in seen:
                out.append(row)
                seen.add(row[0])
    return out[:limit]


def _upsert_unire_parent(conn: sqlite3.Connection, data: dict) -> bool:
    """Scrive (o aggiorna) un genitore recuperato da UNIRE.

    I totali di carriera arrivano gia' aggregati dalla fonte: non abbiamo le
    singole gare, quindi NON va chiamato _update_horse_career_stats(), che li
    ricalcolerebbe dalla tabella `races` azzerandoli.
    backfill_status='done' tiene questi soggetti fuori da phase_backfill_gaps,
    che altrimenti li cercherebbe ogni notte su Trottoweb (dove non esistono).
    """
    name = _normalize_name(data.get("name"))
    if not name:
        return False
    now_iso = datetime.utcnow().isoformat()
    exists = conn.execute("SELECT 1 FROM horses WHERE name=?", (name,)).fetchone()
    if exists:
        conn.execute("""
            UPDATE horses SET
                birth_year      = COALESCE(?, birth_year),
                sex             = COALESCE(?, sex),
                country         = COALESCE(?, country),
                sire            = COALESCE(?, sire),
                dam             = COALESCE(?, dam),
                career_races    = ?,
                career_wins     = ?,
                career_places   = ?,
                career_earnings = ?,
                record_career   = COALESCE(?, record_career),
                source_role     = COALESCE(source_role, 'parent_backfill'),
                horse_class     = 'breeder',
                backfill_status = 'done',
                last_updated    = ?
            WHERE name = ?
        """, (data.get("birth_year"), data.get("sex"), data.get("country"),
              _normalize_name(data.get("sire")), _normalize_name(data.get("dam")),
              data.get("career_races", 0), data.get("career_wins", 0),
              data.get("career_places", 0), data.get("career_earnings", 0.0),
              data.get("record_career"), now_iso, name))
    else:
        conn.execute("""
            INSERT INTO horses
                (name, birth_year, sex, country, sire, dam,
                 career_races, career_wins, career_places, career_earnings,
                 record_career, source_role, horse_class, backfill_status, last_updated)
            VALUES (?,?,?,?,?,?, ?,?,?,?, ?, 'parent_backfill', 'breeder', 'done', ?)
        """, (name, data.get("birth_year"), data.get("sex"), data.get("country"),
              _normalize_name(data.get("sire")), _normalize_name(data.get("dam")),
              data.get("career_races", 0), data.get("career_wins", 0),
              data.get("career_places", 0), data.get("career_earnings", 0.0),
              data.get("record_career"), now_iso))
    conn.commit()
    return True


def _child_lookup_key(conn: sqlite3.Connection, parent_name: str, role: str) -> Optional[tuple]:
    """Un figlio (nome, sesso, anno) da cui raggiungere il genitore su UNIRE.

    La ricerca UNIRE richiede nome+sesso+anno tutti e tre, e dell'anno di
    nascita di una fattrice non sappiamo nulla: si parte quindi dal figlio,
    di cui conosciamo tutto, e si segue il link della madre nella riga.
    Scegliamo il figlio piu' vecchio con dati completi: i nati nell'ultimo anno
    possono non essere ancora presenti nella banca dati (aggiornata al 2024).
    """
    col = "dam" if role == "dam" else "sire"
    return conn.execute(f"""
        SELECT name, sex, birth_year FROM horses
        WHERE UPPER(TRIM({col})) = ?
          AND birth_year IS NOT NULL AND sex IS NOT NULL AND TRIM(COALESCE(sex,'')) <> ''
        ORDER BY birth_year ASC
        LIMIT 1
    """, (parent_name,)).fetchone()


def phase_parents_coverage(conn: sqlite3.Connection,
                           batch_size: int = PARENT_COVERAGE_BATCH_SIZE) -> tuple[int, int]:
    """
    FASE 2c — recupera da UNIRE (banca dati ufficiale del trotto, vedi
    unire_source.py) le fattrici e gli stalloni citati come genitori ma assenti
    dal DB, cosi' che phase_ratings possa calcolarne il rating.

    Trottoweb NON puo' servire a questo scopo: copre solo i cavalli da 2 a 14
    anni (10 per le femmine), quindi ignora per costruzione i riproduttori a
    carriera conclusa (verifica: 0 fattrici trovate su 40).

    I soggetti recuperati sono marcati source_role='parent_backfill': entrano
    nei rating ma NON nei pool di percentile, quindi i voti gia' pubblicati
    restano invariati.

    Ritorna (genitori_recuperati, genitori_con_carriera).
    """
    if batch_size <= 0:
        print("[PARENTS] Fase disattivata (batch_size=0).", file=sys.stderr)
        return 0, 0

    try:
        import unire_source
    except ImportError as e:
        print(f"[PARENTS] unire_source non disponibile ({e}): salto la fase.", file=sys.stderr)
        return 0, 0

    ordered, total_missing = _parent_candidates(conn)
    todo = _split_quota(ordered, batch_size)
    print(f"[PARENTS] Genitori senza carriera nel DB: {total_missing}; "
          f"in questo batch: {len(todo)} (fonte: UNIRE)", file=sys.stderr)

    recovered = 0
    with_career = 0
    not_found = 0
    unavailable = False
    now_iso = datetime.utcnow().isoformat()

    for processed, (pname, role, n_figli) in enumerate(todo, 1):
        child = _child_lookup_key(conn, pname, role)
        if not child:
            # Nessun figlio con sesso+anno noti: non c'e' modo di interrogare UNIRE.
            _ensure_horse_in_db(conn, pname)
            conn.execute("UPDATE horses SET parent_fetch_at=?, source_role=COALESCE(source_role,'parent_backfill'), "
                         "backfill_status='done' WHERE UPPER(TRIM(name))=?", (now_iso, pname))
            conn.commit()
            not_found += 1
            continue

        child_name, child_sex, child_year = child
        parents = None
        data = None
        try:
            with _hard_timeout(180):
                parents = unire_source.find_parent_ids(child_name, child_sex, child_year)
                if parents:
                    found_name, cid = parents.get(role, (None, None))
                    # Guardia sull'omonimia/disallineamento: procediamo solo se il
                    # nome del genitore su UNIRE coincide con quello che abbiamo.
                    if cid and found_name == pname:
                        data = unire_source.fetch_horse(cid)
        except unire_source.UnireUnavailable as e:
            # La fonte e' giu': interrompiamo la fase SENZA marcare i genitori
            # come gia' tentati, altrimenti un disservizio temporaneo li
            # escluderebbe per sempre dalla coda. Riprendiamo la notte dopo.
            print(f"[PARENTS] Fonte UNIRE non raggiungibile ({e}): interrompo la fase "
                  f"dopo {processed - 1} genitori, la coda resta intatta.", file=sys.stderr)
            unavailable = True
            break
        except _HardTimeout:
            print(f"  [TIMEOUT] UNIRE bloccata su {child_name}, salto.", file=sys.stderr)

        if data and _upsert_unire_parent(conn, data):
            recovered += 1
            if data.get("career_races", 0) > 0:
                with_career += 1
                print(f"  [PARENT] {pname} ({role}, {n_figli} figli): "
                      f"{data['career_races']} corse, {data.get('career_earnings', 0):.0f} EUR",
                      file=sys.stderr)
        else:
            _ensure_horse_in_db(conn, pname)
            conn.execute("UPDATE horses SET source_role=COALESCE(source_role,'parent_backfill'), "
                         "backfill_status='done' WHERE UPPER(TRIM(name))=?", (pname,))
            not_found += 1

        # parent_fetch_at marca il tentativo: la coda avanza sempre e un genitore
        # irrecuperabile non viene richiesto a ogni esecuzione successiva.
        conn.execute("UPDATE horses SET parent_fetch_at=? WHERE UPPER(TRIM(name))=?",
                     (now_iso, pname))
        conn.commit()

        if processed % 25 == 0:
            print(f"  ... {processed}/{len(todo)} genitori ({recovered} recuperati)", file=sys.stderr)

    attempted = recovered + not_found
    hit = (recovered / attempted * 100) if attempted else 0.0
    print(f"[PARENTS] Recuperati: {recovered}/{attempted} (resa {hit:.0f}%), "
          f"di cui con carriera: {with_career}; non trovati: {not_found}; "
          f"coda residua stimata: {max(0, total_missing - recovered)}", file=sys.stderr)
    if not unavailable and attempted >= 20 and hit < 20:
        print("[PARENTS] ATTENZIONE: resa sotto il 20%, la fonte potrebbe aver cambiato "
              "formato o perimetro. Controllare unire_source.py.", file=sys.stderr)
    return recovered, with_career


# ─────────────────────────────────────────────
# FASE 3 — RATINGS cavalli
# ─────────────────────────────────────────────
def phase_ratings(conn: sqlite3.Connection):
    print("[RATINGS] Calcolo rating cavalli...", file=sys.stderr)

    horses = conn.execute("""
        SELECT h.name, h.birth_year, h.sire,
               h.career_races, h.career_wins, h.career_earnings, h.record_career,
               COALESCE(h.horse_class, '') AS horse_class
        FROM horses h
        WHERE h.career_races > 0
    """).fetchall()

    # POOL DI RIFERIMENTO: solo gli ATLETI (nati dal 2012). I riproduttori
    # ricevono un punteggio calcolato CONTRO questo pool, ma non lo modificano:
    # servono per valutare la progenie, non per competere in classifica. Senza
    # questa separazione un campione degli anni '90 alzerebbe l'asticella a
    # tutta la popolazione in gara oggi.
    pool = [r for r in horses if r[7] != CLASS_BREEDER]
    n_breeder = len(horses) - len(pool)
    if n_breeder:
        print(f"[RATINGS] {n_breeder} riproduttori: valutati contro il pool atleti "
              f"di {len(pool)} cavalli, esclusi dal calcolo dei percentili.",
              file=sys.stderr)

    # Percentili earnings
    all_earnings = sorted([r[5] for r in pool if r[5]])
    n_earn = len(all_earnings)

    def earn_pct(earnings: float) -> float:
        if n_earn == 0 or not earnings:
            return 0.0
        pos = sum(1 for e in all_earnings if e <= earnings)
        return round(pos / n_earn * 100, 2)

    all_times = sorted([t for r in pool if (t := _time_to_seconds(r[6] or ""))])
    n_times = len(all_times)

    def time_pct(record: str) -> float:
        t = _time_to_seconds(record or "")
        if not t or n_times == 0:
            return 0.0
        pos = sum(1 for x in all_times if x >= t)
        return round(pos / n_times * 100, 2)

    scores = {}
    for row in horses:
        (name, birth_year, sire, career_races, career_wins,
         career_earnings, record_career, _source_role) = row
        if not career_races:
            continue
        ep = earn_pct(career_earnings or 0)
        tp = time_pct(record_career or "")
        win_rate = (career_wins / career_races * 100) if career_races else 0
        score = round(min(ep * 0.50 + tp * 0.30 + win_rate * 0.20, 100.0), 2)
        scores[(name, birth_year)] = {
            "score": score,
            "earn_percentile": ep, "time_percentile": tp,
            "win_rate": round(win_rate, 2),
        }

    # Soglie dinamiche: calcolate sui percentili del pool di riferimento
    # (popolazione corsa storica, esclusi i genitori recuperati) — così
    # aumentare la copertura non sposta i confini dei voti già pubblicati.
    backfill_keys = {(r[0], r[1]) for r in horses if r[7] == CLASS_BREEDER}
    pool_scores = [d["score"] for key, d in scores.items() if key not in backfill_keys]
    horse_thresholds = build_horse_grade_thresholds(pool_scores)
    print(f"[RATINGS] Soglie cavalli: {[(round(t,1),g) for t,g in horse_thresholds]}", file=sys.stderr)

    # Assegna i voti con le soglie dinamiche
    for key, data in scores.items():
        data["grade"] = score_to_horse_grade(data["score"], horse_thresholds)

    # Percentili per sire — anche qui il gruppo di confronto resta la popolazione
    # storica: i genitori recuperati non spostano il percentile dei figli.
    sire_groups: dict[str, list[float]] = {}
    for (name, birth_year), data in scores.items():
        if (name, birth_year) in backfill_keys:
            continue
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
        sire_name = _normalize_name(sire_row[0]) if (sire_row and sire_row[0]) else ""
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
                 win_rate, rating_mode, horse_class, last_updated)
            VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?)
        """, (
            name, birth_year, sire_name or None,
            data["grade"], data["score"],
            data["earn_percentile"], data["time_percentile"], sp,
            horse_row[0], horse_row[1], horse_row[2], horse_row[3],
            data["win_rate"], "performance",
            # Denormalizzata qui perche' il sito filtra le classifiche su questa
            # tabella: senza, ogni endpoint dovrebbe fare una JOIN su horses.
            CLASS_BREEDER if (name, birth_year) in backfill_keys else CLASS_ATHLETE,
            now_iso
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

    # stallion_rating_stats è dato interamente derivato: lo svuotiamo QUI (non in
    # init_db) perché questa è l'UNICA funzione che lo ripopola subito dopo.
    # Se lo svuotamento stesse in init_db, qualsiasi altro script che chiama
    # init_db() senza poi richiamare questa funzione (es. fill_pedigree.py)
    # lascerebbe la tabella vuota — bug reale successo in produzione.
    conn.execute("DELETE FROM stallion_rating_stats")

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


# ---------------------------------------------------------------------------
# Riparazione date gare
#
# Storia del problema: la tabella races e' stata riempita da due fonti diverse.
# La fonte "risultati di giornata" (hRis.php) da' driver, numero di corsa,
# ferratura e posizione al via, ma nelle righe piu' vecchie la data non e' mai
# finita in colonna. La fonte "carriera del cavallo" (cavAn.php) da' sempre la
# data, perche' la legge dal link della corsa, ma non ha driver ne' ferratura.
# Risultato: la stessa gara puo' esistere due volte, una volta datata e povera,
# una volta ricca e senza data. Il vincolo UNIQUE(horse_name, race_date,
# race_code) non se ne accorge perche' in SQL NULL non e' uguale a NULL, quindi
# ogni riga senza data passa come nuova.
#
# La chiave di confronto qui sotto identifica una gara senza usare la data:
# lo stesso cavallo, nello stesso ippodromo, sulla stessa distanza, con lo
# stesso tempo al chilometro, lo stesso piazzamento e lo stesso premio non e'
# una seconda gara, e' la stessa gara vista da due fonti.
# ---------------------------------------------------------------------------

def _norm_track(track: str) -> str:
    """Nome ippodromo confrontabile: i codici brevi diventano nomi completi."""
    t = (track or "").strip().upper()
    return TRACK_CODE_MAP.get(t, t)


def _norm_placement(raw: str) -> str:
    """Piazzamento confrontabile. Le due fonti usano due caratteri diversi per
    l'ordinale ('3º' contro '3°'), che a occhio sono identici."""
    return re.sub(r"[\u00ba\u00b0]", "", str(raw or "")).strip().lower()


def _race_identity(track, distance, time_km, prize_net, placement_raw, with_prize: bool = True) -> tuple:
    """Chiave che identifica una gara senza usare la data.

    Con `with_prize=False` il premio viene ignorato. Serve perche' la pagina di
    carriera spesso lascia la colonna montepremi vuota anche per gare pagate:
    la stessa gara risulta da 2.431 euro nei risultati di giornata e da zero
    nella carriera. Pretendere che coincidano fa scartare abbinamenti giusti.
    Il confronto senza premio resta prudente perche' viene accettato solo
    quando l'abbinamento e' univoco.
    """
    try:
        prize = round(float(prize_net or 0), 2)
    except (TypeError, ValueError):
        prize = 0.0
    try:
        tkm = round(float(time_km), 1) if time_km not in (None, "") else None
    except (TypeError, ValueError):
        tkm = None
    base = (_norm_track(track), distance, tkm, _norm_placement(placement_raw))
    return base + (prize,) if with_prize else base


def _richness(row: dict) -> int:
    """Quanti campi di dettaglio porta una riga. A parita' di gara teniamo la
    riga piu' ricca e le regaliamo la data dell'altra."""
    return sum(1 for k in ("driver", "race_number", "shoes", "start_pos", "total_starters")
               if row.get(k) not in (None, "", 0))


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

            # Stessa gara gia' presente ma senza data, arrivata dai risultati di
            # giornata? Allora non e' una gara nuova: le diamo la data che ci
            # mancava invece di creare un doppione. E' cosi' che sono nate le
            # 325.731 righe senza data, e il controllo qui sopra non poteva
            # vederle perche' cerca per data.
            cands = conn.execute(
                """SELECT id, track, distance, time_km, prize_net, placement_raw
                   FROM races WHERE horse_name=? AND (race_date IS NULL OR TRIM(race_date)='')""",
                (r.get("horse_name"),)
            ).fetchall()
            merged = False
            for with_prize in (True, False):
                ident = _race_identity(r.get("track"), r.get("distance"), r.get("time_km"),
                                       r.get("prize_net", 0), r.get("placement_raw"),
                                       with_prize=with_prize)
                hits = [c for c in cands
                        if _race_identity(c[1], c[2], c[3], c[4], c[5],
                                          with_prize=with_prize) == ident]
                # Solo se l'abbinamento e' univoco: con due candidati non
                # sapremmo a quale delle due gare appartiene questa data.
                if len(hits) == 1:
                    conn.execute("UPDATE races SET race_date=? WHERE id=?",
                                 (r.get("race_date"), hits[0][0]))
                    merged = True
                    break
            if merged:
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
            SUM(COALESCE(prize_net, 0)) as earnings
        FROM races
        WHERE horse_name=? AND placement IS NOT NULL
    """, (horse_name,)).fetchone()

    # Record km: va calcolato come minimo NUMERICO reale (secondi totali), non
    # con MIN(time_km) SQL, che confronta le stringhe carattere per carattere
    # e può scegliere un tempo che "sembra" più piccolo da leggere ma non è
    # realmente il più veloce (es. testo con formati misti apostrofo/punti).
    best_time_str = None
    best_seconds = None
    for (t,) in conn.execute(
        "SELECT time_km FROM races WHERE horse_name=? AND time_km IS NOT NULL", (horse_name,)
    ).fetchall():
        secs = _time_to_seconds(t)
        if secs is not None and (best_seconds is None or secs < best_seconds):
            best_seconds = secs
            best_time_str = t

    if stats:
        conn.execute("""
            UPDATE horses SET
                career_races=?, career_wins=?, career_earnings=?,
                record_career=?, last_updated=?
            WHERE name=?
        """, (
            stats[0] or 0, stats[1] or 0, stats[2] or 0.0,
            best_time_str, datetime.utcnow().isoformat(), horse_name
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


# ─────────────────────────────────────────────
# FASE 0b: GARE FUTURE (hPart.php) — partenti + recupero cavalli nuovi
# ─────────────────────────────────────────────
HPART_URL = "https://www.trottoweb.it/TrottoWeb/php_resp/hPart.php"
HNUM_URL  = "https://www.trottoweb.it/TrottoWeb/php_resp/hNum.php"

_MONTHS_IT = {
    "Gennaio": 1, "Febbraio": 2, "Marzo": 3, "Aprile": 4,
    "Maggio": 5, "Giugno": 6, "Luglio": 7, "Agosto": 8,
    "Settembre": 9, "Ottobre": 10, "Novembre": 11, "Dicembre": 12,
}
_TRACK_CODES = {
    "BOLOGNA": "BO", "MILANO": "MI", "ROMA": "RM", "TORINO": "TO",
    "NAPOLI": "NA", "CESENA": "CE", "SIRACUSA": "SR", "TREVISO": "TV",
    "MONTECATINI": "MT", "CASARANO": "CS", "PALERMO": "PA", "MODENA": "MO",
    "FIRENZE": "FI", "BARI": "BA", "VARESE": "VA", "GARIGLIANO": "GA",
    "PONTECAGNANO": "PA", "PADOVA": "PD", "VILLANOVA": "VI",
    "CASTELLUCCIO": "CT", "ANCONA": "AN", "TRIESTE": "TS",
    "FROSINONE": "FR", "SAN SEVERO": "SS",
}


def _parse_date_it(text: str) -> str:
    text = text.strip()
    parts = text.split()
    if len(parts) < 2:
        return ""
    try:
        day = int(parts[0])
    except ValueError:
        return ""
    month = _MONTHS_IT.get(parts[1], 0)
    if month == 0:
        return ""
    year = datetime.now().year
    from datetime import date as _date
    rd = _date(year, month, day)
    if rd < _date.today():
        rd = _date(year + 1, month, day)
    return rd.isoformat()


def _track_code(name: str) -> str:
    name = name.upper().strip()
    return _TRACK_CODES.get(name, name[:3] if name else "???")


def _fetch_meetings_list() -> list:
    """Legge hNum.php e restituisce [(date, track_name), ...] per i meeting futuri."""
    soup = fetch_url(HNUM_URL)
    if not soup:
        return []
    meetings = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"data=(\d{4}-\d{2}-\d{2})&ippodromo=([^&\"]+)", href)
        if m:
            date_str = m.group(1).strip()
            track_name = m.group(2).strip()
            if date_str >= datetime.now().strftime("%Y-%m-%d"):
                meetings.append((date_str, track_name))
    seen = set()
    unique = []
    for d, t in meetings:
        key = f"{d}_{t}"
        if key not in seen:
            seen.add(key)
            unique.append((d, t))
    return unique


def _parse_hpart_soup(soup: BeautifulSoup, track: str, race_date: str) -> list:
    """Parse hPart.php per un ippodromo+data. Restituisce lista di entry dict."""
    entries = []

    # Se track/race_date non sono passati, proviamo a recuperarli dalla pagina
    if not track or not race_date:
        for div in soup.find_all("div", class_="ippodromo_part"):
            spans = div.find_all("span")
            if len(spans) >= 2:
                track = _track_code(spans[0].get_text(strip=True))
                race_date = _parse_date_it(spans[1].get_text(strip=True))
                break

    if not track or not race_date:
        return []

    for table in soup.find_all("table", id="tabella_partenti"):
        # Trova l'ora della gara: cercha il div ora_corsa piu vicino
        race_time = ""
        parent = table.find_parent("div", id=True)
        if parent:
            ora_div = parent.find("div", class_=["ora_corsa", "ora_corsa_beige"])
            if ora_div:
                race_time = ora_div.get_text(strip=True)

        for tr in table.find_all("tr"):
            td_num = tr.find("td", class_="num_part")
            td_name = tr.find("td", class_="nome_cav")
            if not td_num or not td_name:
                continue
            a = td_name.find("a")
            if not a:
                continue
            horse_name = _normalize_name(a.get_text(strip=True))
            start_pos = None
            try:
                start_pos = int(td_num.get_text(strip=True))
            except ValueError:
                pass
            if not horse_name or horse_name == "NON PARTENTE":
                continue
            entries.append({
                "track": track,
                "race_date": race_date,
                "race_time": race_time,
                "horse_name": horse_name,
                "start_pos": start_pos,
            })
    return entries


def phase_fetch_upcoming_races(conn: sqlite3.Connection) -> tuple:
    """
    FASE 0b: Recupera i partenti delle prossime gare da Trottoweb (hPart.php).
    Per ogni cavallo non presente nel DB, recupera carriera + genealogia da cavAn.php.
    Popola la tabella upcoming_races.
    """
    print("\n[FASE 0b] Recupero partenti gare future...", file=sys.stderr)

    # Crea la tabella se non esiste
    conn.execute("""
        CREATE TABLE IF NOT EXISTS upcoming_races (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track TEXT NOT NULL,
            race_date TEXT NOT NULL,
            race_time TEXT NOT NULL,
            horse_name TEXT NOT NULL,
            driver TEXT,
            start_pos INTEGER,
            distance INTEGER,
            fetched_at TEXT NOT NULL,
            UNIQUE(track, race_date, race_time, horse_name)
        )
    """)
    conn.commit()

    # Pulisci gare passate
    conn.execute("DELETE FROM upcoming_races WHERE race_date < date('now')")
    conn.commit()

    all_entries = []

    # 1) Pagina principale di hPart.php (gare piu vicine, gia pubblicate)
    print("  [hPart] Recupero pagina principale...", file=sys.stderr)
    soup = fetch_url(HPART_URL)
    if soup:
        main_entries = _parse_hpart_soup(soup, "", "")
        print(f"  [hPart] {len(main_entries)} partenti dalla pagina principale", file=sys.stderr)
        all_entries.extend(main_entries)

    # 2) Meeting futuri da hNum.php
    meetings = _fetch_meetings_list()
    print(f"  [hNum] {len(meetings)} meeting futuri trovati", file=sys.stderr)
    for date_str, track_name in meetings:
        track = _track_code(track_name)
        # Salta se abbiamo gia gli entry per questo track+date dalla pagina principale
        already = any(e["track"] == track and e["race_date"] == date_str for e in all_entries)
        if already:
            continue
        soup = fetch_url(HPART_URL, params={"data": date_str, "ippodromo": track_name})
        if soup:
            entries = _parse_hpart_soup(soup, track, date_str)
            if entries:
                print(f"  [hPart] {date_str} {track_name}: {len(entries)} partenti", file=sys.stderr)
                all_entries.extend(entries)
            else:
                print(f"  [hPart] {date_str} {track_name}: partenti non ancora pubblicati", file=sys.stderr)

    # 2b) Giornate imminenti: hNum.php elenca i convegni da qualche giorno in
    # avanti, ma non le giornate piu' vicine, e la pagina principale di
    # hPart.php ne mostra una sola. Risultato: con i partenti gia' pubblicati
    # per tre giornate, ne vedevamo una. Qui chiediamo esplicitamente giorno per
    # giorno e ippodromo per ippodromo, perche' hPart.php senza ippodromo non
    # risponde nulla.
    today = datetime.now().date()
    known_tracks = sorted(set(TRACK_CODE_MAP.values()) - {"ESTERO"})
    covered = {(e["race_date"], e["track"]) for e in all_entries}
    probed = found_days = 0
    for day_offset in range(0, UPCOMING_DAYS):
        date_str = (today + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        day_entries = 0
        for track_name in known_tracks:
            code = _track_code(track_name)
            if (date_str, code) in covered:
                continue
            soup = fetch_url(HPART_URL, params={"data": date_str, "ippodromo": track_name})
            probed += 1
            if not soup:
                continue
            entries = _parse_hpart_soup(soup, code, date_str)
            if entries:
                all_entries.extend(entries)
                covered.add((date_str, code))
                day_entries += len(entries)
                print(f"  [hPart] {date_str} {track_name}: {len(entries)} partenti", file=sys.stderr)
        if day_entries:
            found_days += 1
    print(f"  [hPart] Giornate imminenti controllate: {UPCOMING_DAYS} "
          f"({probed} richieste, {found_days} con partenti pubblicati)", file=sys.stderr)

    if not all_entries:
        print("  [FASE 0b] Nessun partente trovato.", file=sys.stderr)
        return 0, 0

    # 3) Controlla quali cavalli non sono nel DB e recuperane carriera + genealogia
    unknown = set()
    for e in all_entries:
        exists = conn.execute(
            "SELECT 1 FROM horses WHERE name = ? LIMIT 1", (e["horse_name"],)
        ).fetchone()
        if not exists:
            unknown.add(e["horse_name"])

    print(f"  [FASE 0b] {len(unknown)} cavalli nuovi da recuperare su {len(all_entries)} partenti", file=sys.stderr)

    new_horses = 0
    for name in unknown:
        print(f"    [cavAn] Recupero carriera: {name}", file=sys.stderr)
        inserted = _fetch_and_insert_full_career(conn, name)
        if inserted > 0:
            new_horses += 1
            print(f"    [cavAn] {name}: {inserted} gare inserite", file=sys.stderr)
        time.sleep(0.5)  # rispetto per la fonte

    # 4) Inserisci i partenti in upcoming_races
    now = datetime.utcnow().isoformat()
    inserted_races = 0
    for e in all_entries:
        cur = conn.execute(
            """INSERT INTO upcoming_races (track, race_date, race_time, horse_name, start_pos, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(track, race_date, race_time, horse_name) DO UPDATE SET
                 start_pos=excluded.start_pos, fetched_at=excluded.fetched_at""",
            (e["track"], e["race_date"], e["race_time"], e["horse_name"],
             e.get("start_pos"), now)
        )
        if cur.rowcount == 1:
            inserted_races += 1
    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM upcoming_races").fetchone()[0]
    events = conn.execute(
        "SELECT COUNT(DISTINCT track || race_date || race_time) FROM upcoming_races"
    ).fetchone()[0]
    print(f"  [FASE 0b] {inserted_races} partenti inseriti, {new_horses} cavalli nuovi recuperati", file=sys.stderr)
    print(f"  [FASE 0b] Totale DB: {total} partenti, {events} eventi gara", file=sys.stderr)

    return new_horses, inserted_races


def phase_dam_ratings(conn: sqlite3.Connection):
    """FASE 3c — rating FATTRICI, valutate sulla progenie.

    Specchio di phase_stallion_ratings, con tre differenze volute:
      * nessun boost VendoPuledri: quella fonte copre solo gli stalloni;
      * curva di volume dedicata (vedi dam_volume_multiplier);
      * accanto alla progenie salviamo la carriera PROPRIA della fattrice, cioe'
        i totali recuperati da UNIRE, per poter leggere i figli alla luce di
        quanto valeva la madre.

    Tutto il raggruppamento avviene in Python con dizionari: in questo DB i nomi
    hanno spaziature e maiuscole incoerenti e una JOIN su UPPER(TRIM(...)) non
    usa gli indici, rendendo la query inutilizzabile su 23.000 cavalli.
    """
    print("[RATINGS] Calcolo rating fattrici...", file=sys.stderr)

    # Derivato al 100%: svuotato qui, nella sola funzione che lo ripopola
    # subito dopo (stessa ragione documentata per stallion_rating_stats).
    conn.execute("DELETE FROM dam_rating_stats")

    # Figli: solo ATLETI. Un riproduttore non e' progenie da valutare.
    children = conn.execute("""
        SELECT name, birth_year, dam FROM horses
        WHERE dam IS NOT NULL AND TRIM(dam) <> ''
          AND COALESCE(horse_class, 'athlete') = 'athlete'
    """).fetchall()

    ratings: dict[tuple, tuple] = {}
    for name, birth_year, grade, score, earn in conn.execute("""
        SELECT name, birth_year, grade, score, career_earnings
        FROM horse_ratings
        WHERE rating_mode = 'performance'
          AND COALESCE(horse_class, 'athlete') = 'athlete'
    """):
        ratings[(name, birth_year)] = (grade, score or 0.0, earn or 0.0)

    cutoff = (datetime.utcnow() - timedelta(days=ACTIVE_MONTHS * 30)).strftime("%Y-%m-%d")
    active_names = {r[0] for r in conn.execute(
        "SELECT DISTINCT horse_name FROM races WHERE race_date >= ?", (cutoff,))}

    # Carriera propria delle madri, per nome normalizzato
    own: dict[str, tuple] = {}
    for name, races, wins, earn, rec in conn.execute(
        "SELECT name, career_races, career_wins, career_earnings, record_career FROM horses"
    ):
        if name:
            own[name.strip().upper()] = (races or 0, wins or 0, earn or 0.0, rec)
    own_grades: dict[str, str] = {}
    for name, grade in conn.execute(
        "SELECT name, grade FROM horse_ratings WHERE rating_mode = 'performance'"
    ):
        if name:
            own_grades.setdefault(name.strip().upper(), grade)

    groups: dict[str, list] = {}
    display: dict[str, str] = {}
    for name, birth_year, dam in children:
        key = dam.strip().upper()
        groups.setdefault(key, []).append((name, birth_year))
        display.setdefault(key, dam.strip())

    now_iso = datetime.utcnow().isoformat()
    buffer: list[tuple] = []
    all_scores: list[float] = []

    for key, kids in groups.items():
        rated = [ratings[k] for k in kids if k in ratings]
        n_tot = len(kids)
        n_val = len(rated)
        if not n_val:
            # Nessun figlio valutato: la riga esisterebbe senza informazione.
            continue

        counts = {g: 0 for g in GRADE_WEIGHTS}
        for grade, _score, _earn in rated:
            if grade in counts:
                counts[grade] += 1

        n_SSS, n_SS, n_S = counts["SSS"], counts["SS"], counts["S"]
        pct_top_S = round((n_SSS + n_SS + n_S) / n_val * 100, 2)
        base = sum(GRADE_WEIGHTS[g] * c for g, c in counts.items()) / n_val
        # Il volume guarda i figli VALUTATI, non quelli citati: un figlio senza
        # rating non e' evidenza di nulla.
        score = round(min(base * dam_volume_multiplier(n_val), 100.0), 2)
        avg_earn = round(sum(e for _g, _s, e in rated) / n_val, 2)
        n_in_corsa = sum(1 for (nm, _by) in kids if nm in active_names)

        o_races, o_wins, o_earn, o_rec = own.get(key, (0, 0, 0.0, None))
        buffer.append((
            display[key], n_tot, n_val, n_in_corsa, score,
            n_SSS, n_SS, n_S, pct_top_S, avg_earn,
            o_races, o_wins, o_earn, o_rec, own_grades.get(key),
            now_iso,
        ))
        all_scores.append(score)

    thresholds = build_stallion_grade_thresholds(all_scores)
    print(f"[RATINGS] Soglie fattrici: {[(round(t, 1), g) for t, g in thresholds]}",
          file=sys.stderr)

    for row in buffer:
        grade = score_to_stallion_grade(row[4], thresholds) if row[4] > 0 else "N/A"
        conn.execute("""
            INSERT OR REPLACE INTO dam_rating_stats
                (dam, n_figli_totali, n_valutati, n_in_corsa, avg_score, grade,
                 n_SSS, n_SS, n_S, pct_top_S, avg_earnings,
                 own_races, own_wins, own_earnings, own_record, own_grade,
                 final_score, last_updated)
            VALUES (?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?)
        """, (
            row[0], row[1], row[2], row[3], row[4], grade,
            row[5], row[6], row[7], row[8], row[9],
            row[10], row[11], row[12], row[13], row[14],
            row[4], row[15],
        ))
    conn.commit()
    print(f"[RATINGS] Rating fattrici: {len(buffer)}", file=sys.stderr)
    return len(buffer)


def phase_recover_undated(conn: sqlite3.Connection, batch_size: int = UNDATED_BATCH_SIZE) -> tuple:
    """FASE 2e - Ripesca dalla fonte le date che ci mancano ancora.

    La FASE 2d recupera una data solo quando la stessa gara esiste gia' due
    volte nel database. Per le gare rimaste, la data esiste comunque: sta sulla
    pagina di carriera del cavallo, che la porta nel link di ogni corsa. Qui
    scarichiamo quelle pagine per i cavalli che hanno ancora gare senza data,
    partendo da chi ne ha di piu'. L'inserimento riconosce la gara gia'
    presente e le scrive la data invece di creare un doppione.

    Va a lotti: sono migliaia di cavalli e non ha senso occupare una notte
    intera. Chi viene tentato senza risultato non viene riprovato per settimane.
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS undated_repair_log (
            horse_name    TEXT PRIMARY KEY,
            tried_at      TEXT,
            attempts      INTEGER DEFAULT 0,
            last_remaining INTEGER
        )
    """)
    conn.commit()

    cutoff = (datetime.utcnow() - timedelta(days=UNDATED_RETRY_DAYS)).strftime("%Y-%m-%d")
    pending = conn.execute("""
        SELECT r.horse_name, COUNT(*) n
        FROM races r
        LEFT JOIN undated_repair_log l ON l.horse_name = r.horse_name
        WHERE (r.race_date IS NULL OR TRIM(r.race_date)='')
          AND (l.tried_at IS NULL OR l.tried_at < ?)
        GROUP BY r.horse_name
        ORDER BY n DESC
        LIMIT ?
    """, (cutoff, batch_size)).fetchall()

    print(f"\n[UNDATED] FASE 2e: {len(pending)} cavalli da ripescare "
          f"(lotto max {batch_size})", file=sys.stderr)

    horses_done = dates_filled = 0
    for i, (name, n_before) in enumerate(pending, 1):
        try:
            _fetch_and_insert_full_career(conn, name)
        except Exception as e:  # una pagina rotta non deve fermare la notte
            print(f"  [UNDATED] {name}: {e}", file=sys.stderr)
        n_after = conn.execute(
            "SELECT COUNT(*) FROM races WHERE horse_name=? AND (race_date IS NULL OR TRIM(race_date)='')",
            (name,)
        ).fetchone()[0]
        filled = max(0, n_before - n_after)
        dates_filled += filled
        horses_done += 1
        conn.execute("""
            INSERT INTO undated_repair_log (horse_name, tried_at, attempts, last_remaining)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(horse_name) DO UPDATE SET
                tried_at = excluded.tried_at,
                attempts = undated_repair_log.attempts + 1,
                last_remaining = excluded.last_remaining
        """, (name, datetime.utcnow().strftime("%Y-%m-%d"), n_after))
        if filled:
            _update_horse_career_stats(conn, name)
        if i % 50 == 0:
            conn.commit()
            print(f"  ... {i}/{len(pending)} cavalli ({dates_filled} date recuperate)", file=sys.stderr)
    conn.commit()

    residue = conn.execute(
        "SELECT COUNT(*) FROM races WHERE race_date IS NULL OR TRIM(race_date)=''"
    ).fetchone()[0]
    print(f"[UNDATED] Cavalli trattati: {horses_done}, date recuperate: {dates_filled}, "
          f"restano senza data: {residue}", file=sys.stderr)
    return horses_done, dates_filled


def phase_repair_race_dates(conn: sqlite3.Connection) -> dict:
    """FASE 2d - Ripara le gare senza data e rimuove i doppioni che ne derivano.

    Tre passaggi, dal piu' sicuro al piu' cauto:
      1. date scritte in formato italiano (31/12/2025) convertite in ISO;
      2. gare senza data abbinate a una gemella datata dello stesso cavallo:
         la data passa alla riga piu' ricca e la gemella povera viene eliminata;
      3. conteggio di cio' che resta, che sara' riparato nelle notti successive
         man mano che il recupero storico copre altri cavalli.

    L'abbinamento avviene solo quando e' univoco: se nel gruppo ci sono piu'
    righe senza data, oppure piu' date candidate diverse, la riga viene lasciata
    com'e'. Meglio una data mancante che una data sbagliata.
    """
    print("\n[REPAIR] FASE 2d: riparazione date gare", file=sys.stderr)
    report = {"iso_fixed": 0, "dates_recovered": 0, "duplicates_removed": 0, "still_undated": 0}

    # 1) formato italiano -> ISO
    it_rows = conn.execute(
        "SELECT id, race_date FROM races WHERE race_date LIKE '__/__/____'"
    ).fetchall()
    for rid, val in it_rows:
        iso = _parse_date_it(val) if "_parse_date_it" in globals() else None
        if not iso:
            try:
                d, m, y = str(val).split("/")
                iso = f"{y}-{m}-{d}"
            except ValueError:
                iso = None
        if iso:
            conn.execute("UPDATE races SET race_date=? WHERE id=?", (iso, rid))
            report["iso_fixed"] += 1
    if report["iso_fixed"]:
        conn.commit()
    print(f"  [REPAIR] Date in formato italiano convertite: {report['iso_fixed']}", file=sys.stderr)

    # 2) abbinamento gare senza data <-> gemella datata
    # Caricamento in Python: in questo DB i confronti vanno fatti su valori
    # normalizzati, e una JOIN su UPPER(TRIM(...)) non userebbe gli indici.
    cols = "id, horse_name, race_date, track, distance, time_km, prize_net, placement_raw, driver, race_number, shoes, start_pos, total_starters"
    undated: dict = {}
    dated: dict = {}
    for row in conn.execute(f"SELECT {cols} FROM races"):
        r = dict(zip([c.strip() for c in cols.split(",")], row))
        key = (str(r["horse_name"] or "").strip().upper(),) + _race_identity(
            r["track"], r["distance"], r["time_km"], r["prize_net"], r["placement_raw"])
        (undated if not r["race_date"] else dated).setdefault(key, []).append(r)

    to_update: list = []   # (id, data)
    to_delete: list = []   # id
    ambiguous = 0
    touched_horses: set = set()
    resolved_ids: set = set()

    def _pair_up(undated_map: dict, dated_map: dict) -> int:
        nonlocal ambiguous
        done = 0
        for key, u_rows in undated_map.items():
            u_rows = [r for r in u_rows if r["id"] not in resolved_ids]
            if not u_rows:
                continue
            d_rows = [r for r in dated_map.get(key, []) if r["id"] not in resolved_ids]
            if not d_rows:
                continue
            candidate_dates = {r["race_date"] for r in d_rows}
            if len(u_rows) != 1 or len(candidate_dates) != 1:
                ambiguous += len(u_rows)
                continue
            u = u_rows[0]
            the_date = candidate_dates.pop()
        # La riga senza data e' quasi sempre la piu' ricca (viene dai risultati
        # di giornata). Se per una volta non lo fosse, teniamo comunque quella
        # ricca e buttiamo l'altra.
            best_dated = max(d_rows, key=_richness)
            if _richness(u) >= _richness(best_dated):
                to_update.append((u["id"], the_date))
                to_delete.extend(r["id"] for r in d_rows)
            else:
                to_delete.append(u["id"])
            resolved_ids.add(u["id"])
            resolved_ids.update(r["id"] for r in d_rows)
            touched_horses.add(u["horse_name"])
            done += 1
        return done

    # Primo passaggio: chiave completa, premio incluso. Secondo passaggio, solo
    # su cio' che e' avanzato: stessa chiave senza il premio.
    strict_pairs = _pair_up(undated, dated)
    undated_np: dict = {}
    dated_np: dict = {}
    for src_map, dst_map in ((undated, undated_np), (dated, dated_np)):
        for rows in src_map.values():
            for r in rows:
                if r["id"] in resolved_ids:
                    continue
                k = (str(r["horse_name"] or "").strip().upper(),) + _race_identity(
                    r["track"], r["distance"], r["time_km"], r["prize_net"],
                    r["placement_raw"], with_prize=False)
                dst_map.setdefault(k, []).append(r)
    loose_pairs = _pair_up(undated_np, dated_np)
    print(f"  [REPAIR] Abbinamenti: {strict_pairs} con premio identico, "
          f"{loose_pairs} ignorando il premio", file=sys.stderr)

    for rid, the_date in to_update:
        conn.execute("UPDATE races SET race_date=? WHERE id=?", (the_date, rid))
    for chunk_start in range(0, len(to_delete), 500):
        chunk = to_delete[chunk_start:chunk_start + 500]
        conn.execute(f"DELETE FROM races WHERE id IN ({','.join('?' * len(chunk))})", chunk)
    conn.commit()
    report["dates_recovered"] = len(to_update)
    report["duplicates_removed"] = len(to_delete)
    print(f"  [REPAIR] Date recuperate da gara gemella: {report['dates_recovered']}", file=sys.stderr)
    print(f"  [REPAIR] Doppioni rimossi: {report['duplicates_removed']}", file=sys.stderr)
    print(f"  [REPAIR] Lasciate stare perche' ambigue: {ambiguous}", file=sys.stderr)

    # 3) le carriere dei cavalli toccati vanno ricalcolate: finora contavano
    # la stessa gara due volte, quindi anche i guadagni erano doppi
    for name in touched_horses:
        try:
            _update_horse_career_stats(conn, name)
        except sqlite3.Error:
            pass
    conn.commit()
    print(f"  [REPAIR] Carriere ricalcolate: {len(touched_horses)} cavalli", file=sys.stderr)

    report["still_undated"] = conn.execute(
        "SELECT COUNT(*) FROM races WHERE race_date IS NULL OR TRIM(race_date)=''"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    pct = (report["still_undated"] / total * 100) if total else 0
    print(f"  [REPAIR] Restano senza data: {report['still_undated']} su {total} ({pct:.1f}%)", file=sys.stderr)
    return report


def phase_data_quality(conn: sqlite3.Connection) -> dict:
    """
    FASE QA: Controlla e corregge la qualita dei dati ad ogni esecuzione notturna.
    - Ricalcola career_stats (races, wins, places, earnings) dalla tabella races
    - Conta e logga le anomalie (orphan races, mismatch, duplicati)
    """
    print("\n[FASE QA] Controllo qualita dati...", file=sys.stderr)
    report = {"stats_fixed": 0, "orphans": 0, "duplicates": 0, "no_rating": 0, "tracks_fixed": 0, "times_normalized": 0}

    # 1) Ricalcola career_stats per i cavalli dove non combaciano
    # ATTENZIONE: i RIPRODUTTORI (horse_class='breeder': nati <2012 o recuperati
    # da UNIRE) vanno esclusi da tutto il blocco. Per loro la fonte fornisce i TOTALI di
    # carriera gia' aggregati e non le singole corse, quindi la tabella `races` e'
    # vuota: ricalcolare da li' azzera i dati appena scaricati. E' esattamente
    # quello che e' successo il 17/09/2026 (300 genitori recuperati, tutti con
    # career_races=0 e nessun rating).
    mismatch = conn.execute("""
        SELECT COUNT(*) FROM (
            SELECT h.name, h.career_races, COUNT(r.id) as actual
            FROM horses h
            LEFT JOIN races r ON r.horse_name = h.name
            WHERE COALESCE(h.horse_class, 'athlete') <> 'breeder'
            GROUP BY h.name, h.birth_year
            HAVING COALESCE(h.career_races, 0) != COUNT(r.id)
        )
    """).fetchone()[0]

    if mismatch > 0:
        print(f"  [QA] {mismatch} cavalli con career_stats non allineate, ricalcolo...", file=sys.stderr)
        conn.execute("""
            UPDATE horses SET
                career_races   = sub.actual_races,
                career_wins    = sub.actual_wins,
                career_places   = sub.actual_places,
                career_earnings = sub.actual_earnings
            FROM (
                SELECT
                    r.horse_name,
                    COUNT(*) as actual_races,
                    SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) as actual_wins,
                    SUM(CASE WHEN r.placement IN (2,3) THEN 1 ELSE 0 END) as actual_places,
                    SUM(COALESCE(r.prize_net, 0)) as actual_earnings
                FROM races r
                GROUP BY r.horse_name
            ) sub
            WHERE horses.name = sub.horse_name
              AND COALESCE(horses.career_races, 0) != sub.actual_races
              AND COALESCE(horses.horse_class, 'athlete') <> 'breeder'
        """)
        # Also reset horses that had stats but have 0 races in the table
        conn.execute("""
            UPDATE horses SET career_races = 0, career_wins = 0, career_places = 0, career_earnings = 0
            WHERE name NOT IN (SELECT DISTINCT horse_name FROM races)
              AND COALESCE(career_races, 0) > 0
              AND COALESCE(horse_class, 'athlete') <> 'breeder'
        """)
        conn.commit()
        report["stats_fixed"] = mismatch
        print(f"  [QA] Career stats ricalcolate per {mismatch} cavalli", file=sys.stderr)
    else:
        print("  [QA] Career_stats allineate, nessuna correzione necessaria", file=sys.stderr)

    # 2) Conta gare orfane (cavallo non in tabella horses)
    orphans = conn.execute("""
        SELECT COUNT(*) FROM races r
        WHERE NOT EXISTS (SELECT 1 FROM horses h WHERE h.name = r.horse_name)
    """).fetchone()[0]
    report["orphans"] = orphans
    if orphans > 0:
        print(f"  [QA] ATTENZIONE: {orphans} gare orfane (cavallo non in DB)", file=sys.stderr)

    # 3) Conta cavalli con gare ma senza rating
    no_rating = conn.execute("""
        SELECT COUNT(*) FROM horses h
        WHERE h.career_races > 0
        AND NOT EXISTS (SELECT 1 FROM horse_ratings hr WHERE hr.name = h.name AND hr.rating_mode='performance')
    """).fetchone()[0]
    report["no_rating"] = no_rating
    if no_rating > 0:
        print(f"  [QA] {no_rating} cavalli con gare ma senza rating (birth_year mancante?)", file=sys.stderr)

    # 4) Verifica duplicati
    dups = conn.execute("""
        SELECT COUNT(*) FROM (
            SELECT name, COUNT(*) as cnt FROM horses GROUP BY name HAVING cnt > 1
        )
    """).fetchone()[0]
    report["duplicates"] = dups
    if dups > 0:
        print(f"  [QA] ATTENZIONE: {dups} nomi cavallo duplicati", file=sys.stderr)

    # 5) Verifica wins > races (impossibile)
    impossible = conn.execute("SELECT COUNT(*) FROM horses WHERE career_wins > career_races").fetchone()[0]
    if impossible > 0:
        print(f"  [QA] ATTENZIONE: {impossible} cavalli con wins > races", file=sys.stderr)

    # 6) Normalizza i track (mappa condivisa a livello modulo)
    _TRACK_CODE_MAP = TRACK_CODE_MAP


    # Conta track da normalizzare
    short_tracks = conn.execute("""
        SELECT COUNT(*) FROM races 
        WHERE length(track) <= 3 AND track != ''
    """).fetchone()[0]
    empty_tracks = conn.execute("""
        SELECT COUNT(*) FROM races WHERE track = '' OR track IS NULL
    """).fetchone()[0]
    print(f"  [QA] Track da normalizzare: {short_tracks} codici brevi, {empty_tracks} vuoti", file=sys.stderr)

    if short_tracks > 0 or empty_tracks > 0:
        # 1. Converte codici 2-lettere in nomi completi
        for code, full_name in _TRACK_CODE_MAP.items():
            conn.execute("UPDATE races SET track = ? WHERE track = ?", (full_name, code))
        
        # 2. Riempie track vuoti dal race_code (che contiene il codice ippod)
        for code, full_name in _TRACK_CODE_MAP.items():
            conn.execute("UPDATE races SET track = ? WHERE (track = '' OR track IS NULL) AND race_code = ?", (full_name, code))
        
        conn.commit()
        
        # Verifica residui
        still_empty = conn.execute("SELECT COUNT(*) FROM races WHERE track = '' OR track IS NULL").fetchone()[0]
        still_short = conn.execute("SELECT COUNT(*) FROM races WHERE length(track) <= 3 AND track != ''").fetchone()[0]
        report["tracks_fixed"] = short_tracks + empty_tracks - still_empty - still_short
        print(f"  [QA] Track normalizzati. Residui: {still_empty} vuoti, {still_short} codici brevi", file=sys.stderr)
        if still_empty > 0:
            # Mostra quali race_code non sono mappati
            unknown = conn.execute("""
                SELECT race_code, COUNT(*) as cnt FROM races 
                WHERE track = '' OR track IS NULL
                GROUP BY race_code ORDER BY cnt DESC LIMIT 10
            """).fetchall()
            for u in unknown:
                print(f"    race_code non mappato: {u[0]!r} ({u[1]} gare)", file=sys.stderr)
    else:
        print("  [QA] Tutti i track sono nomi completi", file=sys.stderr)

    # 7) Normalizza time_km: converte formato stringa (1'14"8) in decimale (14.8)
    # Tutti i valori diventano REAL con formato SS.T (minuto implicito = 1')
    string_times = conn.execute("""
        SELECT COUNT(*) FROM races 
        WHERE time_km LIKE "%'%"
    """).fetchone()[0]
    if string_times > 0:
        print(f"  [QA] Normalizzazione time_km: {string_times} tempi in formato stringa", file=sys.stderr)
        # Converte 1'14"8 -> 14.8 (secondi.tenthi con minuto implicito)
        import re as _re
        rows = conn.execute("SELECT rowid, time_km FROM races WHERE time_km LIKE \"%'%\"").fetchall()
        fixed = 0
        for rowid, t in rows:
            t = str(t)
            m = _re.match(r"(\d+)'(\d+)\"(\d+)", t)
            if m:
                # M'SS"T -> SS.T (minuto sempre 1, ignora M se > 1)
                minutes = int(m.group(1))
                seconds = int(m.group(2))
                tenths = int(m.group(3))
                if minutes == 1:
                    decimal_val = seconds + tenths / 10.0
                else:
                    # Per minuti > 1, converti in secondi totali - 60 (formato SS.T)
                    total_sec = minutes * 60 + seconds + tenths / 10.0
                    decimal_val = total_sec - 60.0
                conn.execute("UPDATE races SET time_km = ? WHERE rowid = ?", (decimal_val, rowid))
                fixed += 1
        conn.commit()
        report["times_normalized"] = fixed
        print(f"  [QA] {fixed} tempi normalizzati da stringa a decimale", file=sys.stderr)
    else:
        print("  [QA] Tutti i time_km sono in formato decimale", file=sys.stderr)
        report["times_normalized"] = 0

    print(f"  [QA] Report: {report}", file=sys.stderr)
    return report


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

        # FASE 0b: partenti gare future + recupero cavalli nuovi (sempre)
        up_horses, up_races = phase_fetch_upcoming_races(conn)
        new_horses += up_horses
        new_races  += up_races

        if mode in ("results", "full"):
            r_horses, r_races = phase_results(conn)   # FASE 0: risultati hRis.php (+ catch-up cavalli nuovi)
            d_horses          = phase_discovery(conn)  # FASE 1: cavalli nuovi da homepage (+ catch-up)
            new_horses += r_horses + d_horses
            new_races  += r_races

        if mode in ("maintenance", "full"):
            u_updated, u_races = phase_update(conn)         # FASE 2: aggiorna cavalli attivi
            b_horses, b_races  = phase_backfill_gaps(conn)  # FASE 2b: colma buchi storici cavalli esistenti
            h_horses, h_races  = phase_historical_backfill(conn)  # FASE 2b2: recupera gare pre-2019
            p_parents, p_races = phase_parents_coverage(conn)  # FASE 2c: fattrici/stalloni mancanti
            new_races          += u_races + b_races + h_races + p_races
            new_horses         += p_parents
            horses_updated      = u_updated
            horses_backfilled   = b_horses

        # Il rating va ricalcolato in ogni caso: qualunque modalità può aver
        # cambiato dati che influenzano i punteggi.
        phase_repair_race_dates(conn)   # FASE 2d: ripara date mancanti e doppioni
        phase_recover_undated(conn)     # FASE 2e: ripesca le date residue dalla fonte
        phase_ratings(conn)             # FASE 3: rating cavalli
        phase_stallion_ratings(conn)    # FASE 3b: rating stalloni
        phase_dam_ratings(conn)         # FASE 3c: rating fattrici (sulla progenie)
        phase_data_quality(conn)        # FASE QA: controlla e corregge career_stats
    finally:
        conn.close()

    phase_sync()
    phase_git_push()
    phase_notify(new_horses, new_races, horses_updated, horses_backfilled)

    print(f"[END] {datetime.utcnow().isoformat()}", file=sys.stderr)


if __name__ == "__main__":
    main()
