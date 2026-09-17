#!/usr/bin/env python3
"""
fetch_upcoming_races.py — Recupera i partenti delle prossime gare da Trottoweb
e li inserisce nella tabella upcoming_races del database StatIppica.

Fonte: https://www.trottoweb.it/TrottoWeb/php_resp/hPart.php
Struttura HTML:
  - <div class="ippodromo_part"><span>Bologna</span>, Giovedí <span>17 Settembre</span></div>
  - <div id="corsa_1"> con <div class="ora_corsa">15:15</div>
  - <table id="tabella_partenti"> con <td class="num_part">1</td> <td class="nome_cav">NOME</td> <td class="driver">DRIVER</td>

Uso:
  python3 fetch_upcoming_races.py            # fetch + insert
  python3 fetch_upcoming_races.py --dry-run  # stampa senza scrivere
"""

import re
import sqlite3
import urllib.request
import sys
from datetime import datetime, date
from pathlib import Path

URL = "https://www.trottoweb.it/TrottoWeb/php_resp/hPart.php"
DB_PATH = Path(__file__).parent.parent / "data.db"

MONTHS_IT = {
    "Gennaio": 1, "Febbraio": 2, "Marzo": 3, "Aprile": 4,
    "Maggio": 5, "Giugno": 6, "Luglio": 7, "Agosto": 8,
    "Settembre": 9, "Ottobre": 10, "Novembre": 11, "Dicembre": 12,
}

# Ippodromo -> codice breve (come races.track)
TRACK_CODES = {
    "BOLOGNA": "BO", "MILANO": "MI", "ROMA": "RM", "TORINO": "TO",
    "NAPOLI": "NA", "CESENA": "CE", "SIRACUSA": "SR", "TREVISO": "TV",
    "MONTECATINI": "MT", "CASARANO": "CS", "PALERMO": "PA", "MODENA": "MO",
    "FIRENZE": "FI", "BARI": "BA", "VARESE": "VA", "GARIGLIANO": "GA",
    "PONTECAGNANO": "PA", "PADOVA": "PD", "VILLANOVA": "VI",
    "CASTELLUCCIO": "CT", "ANCONA": "AN", "TRIESTE": "TS",
    "FROSINONE": "FR", "SAN SEVERO": "SS",
}


def fetch_page() -> str:
    req = urllib.request.Request(URL, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_date(text: str) -> str:
    """Converte '17 Settembre' in '2026-09-17' (ISO)."""
    text = text.strip()
    parts = text.split()
    if len(parts) < 2:
        return ""
    try:
        day = int(parts[0])
    except ValueError:
        return ""
    month_name = parts[1]
    month = MONTHS_IT.get(month_name, 0)
    if month == 0:
        return ""
    year = datetime.now().year
    race_date = date(year, month, day)
    if race_date < date.today():
        race_date = date(year + 1, month, day)
    return race_date.isoformat()


def track_code(name: str) -> str:
    name = name.upper().strip()
    return TRACK_CODES.get(name, name[:3] if name else "???")


def strip_tags(html: str) -> str:
    """Remove HTML tags and decode entities."""
    html = html.replace("&iacute;", "ì").replace("&euro;", "€")
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    html = re.sub(r"<[^>]+>", "", html)
    return html.strip()


def parse_entries(html: str) -> list:
    """Parse hPart.php HTML and return list of entry dicts."""
    entries = []

    # Split by ippodromo_part sections
    # Pattern: <div class="ippodromo_part"><span>TrackName</span>, DayName <span>DD Month</span></div>
    track_pattern = re.compile(
        r'<div class="ippodromo_part">\s*<span>([^<]+)</span>\s*,\s*[^<]+\s*<span>([^<]+)</span>',
        re.IGNORECASE
    )

    # Find all track+date sections and their positions
    sections = []
    for m in track_pattern.finditer(html):
        track_name = m.group(1).strip()
        date_str = m.group(2).strip()
        parsed_date = parse_date(date_str)
        code = track_code(track_name)
        sections.append({
            "track": code,
            "date": parsed_date,
            "start": m.end(),
        })

    # For each section, find the end (next section or end of page)
    for i, section in enumerate(sections):
        end = sections[i + 1]["start"] if i + 1 < len(sections) else len(html)
        section_html = html[section["start"]:end]

        # Find all race blocks: <div id="corsa_N"> ... </div id="dati_corsa">
        # Each has <div class="ora_corsa">HH:MM</div> and <table id="tabella_partenti">
        race_pattern = re.compile(
            r'<div class="(?:ora_corsa|ora_corsa_beige)">([^<]+)</div>',
            re.IGNORECASE
        )

        # Find all race times in this section
        race_times = race_pattern.findall(section_html)

        # Find all tables with partenti
        table_pattern = re.compile(
            r'<table id="tabella_partenti">(.*?)</table>',
            re.DOTALL | re.IGNORECASE
        )
        tables = table_pattern.findall(section_html)

        # Match race times with tables
        for j, table_html in enumerate(tables):
            race_time = race_times[j].strip() if j < len(race_times) else ""

            # Parse rows: <td class="num_part">N</td> ... <td class="nome_cav"><a>NOME</a></td> ... <td class="driver">...<span>DRIVER</span>...
            row_pattern = re.compile(
                r'<td class="num_part">(\d+)</td>.*?<td class="nome_cav"><a[^>]*>([^<]+)</a></td>.*?<td class="driver">.*?<span>([^<]+)</span>',
                re.DOTALL | re.IGNORECASE
            )
            # Also try simpler pattern for nome_cav without <a> tag
            row_pattern2 = re.compile(
                r'<td class="num_part">(\d+)</td>.*?<td class="nome_cav[^"]*">[^<]*<a[^>]*>([^<]+)</a>',
                re.DOTALL | re.IGNORECASE
            )

            rows = row_pattern.findall(table_html)
            if not rows:
                rows = row_pattern2.findall(table_html)

            for row in rows:
                start_pos = int(row[0])
                horse_name = strip_tags(row[1]).upper().strip()
                driver = strip_tags(row[2]).strip() if len(row) > 2 else None

                if horse_name and section["date"] and section["track"]:
                    entries.append({
                        "track": section["track"],
                        "race_date": section["date"],
                        "race_time": race_time,
                        "horse_name": horse_name,
                        "driver": driver,
                        "start_pos": start_pos,
                        "distance": None,
                    })

    return entries


def create_table(conn):
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


def insert_entries(conn, entries, dry_run=False):
    now = datetime.now().isoformat()
    inserted = 0
    updated = 0

    for e in entries:
        if dry_run:
            print(f"  {e['track']} {e['race_date']} {e['race_time']} | #{e['start_pos']} {e['horse_name']} ({e['driver']})")
            continue

        cur = conn.execute(
            """INSERT INTO upcoming_races (track, race_date, race_time, horse_name, driver, start_pos, distance, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(track, race_date, race_time, horse_name) DO UPDATE SET
                 driver=excluded.driver, start_pos=excluded.start_pos,
                 distance=excluded.distance, fetched_at=excluded.fetched_at""",
            (e["track"], e["race_date"], e["race_time"], e["horse_name"],
             e["driver"], e["start_pos"], e["distance"], now)
        )
        if cur.rowcount == 1:
            inserted += 1
        else:
            updated += 1

    if not dry_run:
        conn.commit()
    return inserted, updated


def cleanup_old(conn):
    conn.execute("DELETE FROM upcoming_races WHERE race_date < date('now', '-1 day')")
    conn.commit()


def main():
    dry_run = "--dry-run" in sys.argv

    print("Fetching upcoming races from Trottoweb...")
    html = fetch_page()
    print(f"  Page size: {len(html)} bytes")

    entries = parse_entries(html)
    print(f"  Parsed {len(entries)} entries")

    if not entries:
        print("  WARNING: No entries parsed. Check page structure.")
        return

    if dry_run:
        print("\n--- DRY RUN (no write) ---")
        for e in entries[:20]:
            print(f"  {e['track']} {e['race_date']} {e['race_time']} | #{e['start_pos']} {e['horse_name']} ({e['driver']})")
        if len(entries) > 20:
            print(f"  ... and {len(entries) - 20} more")
        print(f"\nTotal: {len(entries)} entries")
        return

    conn = sqlite3.connect(str(DB_PATH))
    create_table(conn)
    cleanup_old(conn)

    inserted, updated = insert_entries(conn, entries)
    print(f"  Inserted: {inserted}")
    print(f"  Updated: {updated}")

    # Stats
    try:
        rated = conn.execute("""
            SELECT COUNT(*) FROM upcoming_races ur
            JOIN horse_ratings hr ON hr.name = ur.horse_name AND hr.rating_mode = 'performance'
        """).fetchone()[0]
    except Exception:
        rated = 0
    total = conn.execute("SELECT COUNT(*) FROM upcoming_races").fetchone()[0]
    print(f"  Rated horses: {rated}/{total}")

    events = conn.execute("SELECT COUNT(DISTINCT track || race_date || race_time) FROM upcoming_races").fetchone()[0]
    print(f"  Race events: {events}")

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
