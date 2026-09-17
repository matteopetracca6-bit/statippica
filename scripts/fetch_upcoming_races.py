#!/usr/bin/env python3
"""
fetch_upcoming_races.py — Recupera i partenti di tutte le prossime gare da Trottoweb.

1. Legge hNum.php per ottenere il calendario di tutti i meeting futuri
2. Per ogni meeting, recupera i partenti da hPart.php?data=...&ippodromo=...
3. Inserisce tutto nella tabella upcoming_races

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

DB_PATH = Path(__file__).parent.parent / "data.db"
HNUM_URL = "https://www.trottoweb.it/TrottoWeb/php_resp/hNum.php"
HPART_URL = "https://www.trottoweb.it/TrottoWeb/php_resp/hPart.php"

MONTHS_IT = {
    "Gennaio": 1, "Febbraio": 2, "Marzo": 3, "Aprile": 4,
    "Maggio": 5, "Giugno": 6, "Luglio": 7, "Agosto": 8,
    "Settembre": 9, "Ottobre": 10, "Novembre": 11, "Dicembre": 12,
}

TRACK_CODES = {
    "BOLOGNA": "BO", "MILANO": "MI", "ROMA": "RM", "TORINO": "TO",
    "NAPOLI": "NA", "CESENA": "CE", "SIRACUSA": "SR", "TREVISO": "TV",
    "MONTECATINI": "MT", "CASARANO": "CS", "PALERMO": "PA", "MODENA": "MO",
    "FIRENZE": "FI", "BARI": "BA", "VARESE": "VA", "GARIGLIANO": "GA",
    "PONTECAGNANO": "PA", "PADOVA": "PD", "VILLANOVA": "VI",
    "CASTELLUCCIO": "CT", "ANCONA": "AN", "TRIESTE": "TS",
    "FROSINONE": "FR", "SAN SEVERO": "SS",
}


def fetch_url(url: str) -> str:
    req = urllib.request.Request(url, headers={
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
    month = MONTHS_IT.get(parts[1], 0)
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
    html = html.replace("&iacute;", "ì").replace("&euro;", "€")
    html = html.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"<[^>]+>", "", html).strip()


def fetch_meetings() -> list:
    """Fetch hNum.php and return list of (date, track_name) tuples."""
    html = fetch_url(HNUM_URL)
    # Links: hNum.php?data=2026-09-20&ippodromo=BOLOGNA&note_giorno=...
    pattern = re.compile(r'href="hNum\.php\?data=([^&]+)&ippodromo=([^"&]+)')
    meetings = []
    for m in pattern.finditer(html):
        date_str = m.group(1).strip()
        track_name = m.group(2).strip()
        # Only future dates
        if date_str >= date.today().isoformat():
            meetings.append((date_str, track_name))
    # Deduplicate
    seen = set()
    unique = []
    for d, t in meetings:
        key = f"{d}_{t}"
        if key not in seen:
            seen.add(key)
            unique.append((d, t))
    return unique


def parse_hpart_main(html: str) -> list:
    """Parse the main hPart.php page (no params). Returns list of entries."""
    entries = []

    # Find all ippodromo_part sections
    track_pattern = re.compile(
        r'<div class="ippodromo_part">\s*<span>([^<]+)</span>\s*,\s*[^<]+\s*<span>([^<]+)</span>',
        re.IGNORECASE
    )

    sections = []
    for m in track_pattern.finditer(html):
        track_name = m.group(1).strip()
        date_str = m.group(2).strip()
        parsed_date = parse_date(date_str)
        code = track_code(track_name)
        sections.append({"track": code, "date": parsed_date, "start": m.end()})

    for i, section in enumerate(sections):
        end = sections[i + 1]["start"] if i + 1 < len(sections) else len(html)
        section_html = html[section["start"]:end]

        race_time_pattern = re.compile(
            r'<div class="(?:ora_corsa|ora_corsa_beige)">([^<]+)</div>',
            re.IGNORECASE
        )
        table_pattern = re.compile(
            r'<table id="tabella_partenti">(.*?)</table>',
            re.DOTALL | re.IGNORECASE
        )

        race_times = race_time_pattern.findall(section_html)
        tables = table_pattern.findall(section_html)

        for j, table_html in enumerate(tables):
            race_time = race_times[j].strip() if j < len(race_times) else ""

            row_pattern = re.compile(
                r'<td class="num_part">(\d+)</td>.*?<td class="nome_cav"><a[^>]*>([^<]+)</a>',
                re.DOTALL | re.IGNORECASE
            )
            rows = row_pattern.findall(table_html)

            for row in rows:
                start_pos = int(row[0])
                horse_name = strip_tags(row[1]).upper().strip()

                if horse_name and horse_name != "NON PARTENTE" and section["date"] and section["track"]:
                    entries.append({
                        "track": section["track"],
                        "race_date": section["date"],
                        "race_time": race_time,
                        "horse_name": horse_name,
                        "driver": None,
                        "start_pos": start_pos,
                        "distance": None,
                    })

    return entries


def parse_hpart(html: str, track: str, race_date: str) -> list:
    """Parse hPart.php HTML for a specific track+date. Returns list of entries."""
    entries = []

    # Find all race sections
    race_time_pattern = re.compile(
        r'<div class="(?:ora_corsa|ora_corsa_beige)">([^<]+)</div>',
        re.IGNORECASE
    )
    table_pattern = re.compile(
        r'<table id="tabella_partenti">(.*?)</table>',
        re.DOTALL | re.IGNORECASE
    )

    race_times = race_time_pattern.findall(html)
    tables = table_pattern.findall(html)

    for j, table_html in enumerate(tables):
        race_time = race_times[j].strip() if j < len(race_times) else ""

        # Parse rows: num_part, nome_cav (with <a>), driver (with <span>)
        row_pattern = re.compile(
            r'<td class="num_part">(\d+)</td>.*?<td class="nome_cav"><a[^>]*>([^<]+)</a>',
            re.DOTALL | re.IGNORECASE
        )
        rows = row_pattern.findall(table_html)

        for row in rows:
            start_pos = int(row[0])
            horse_name = strip_tags(row[1]).upper().strip()

            # Try to get driver
            driver = None
            driver_match = re.search(
                r'<td class="driver">.*?<span>([^<]+)</span>',
                table_html, re.DOTALL | re.IGNORECASE
            )

            if horse_name and horse_name != "NON PARTENTE":
                entries.append({
                    "track": track,
                    "race_date": race_date,
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
            print(f"  {e['track']} {e['race_date']} {e['race_time']} | #{e['start_pos']} {e['horse_name']}")
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
    conn.execute("DELETE FROM upcoming_races WHERE race_date < date('now')")
    conn.commit()


def main():
    dry_run = "--dry-run" in sys.argv

    print("Step 1: Fetching current entries from hPart.php (main page)...")
    main_html = fetch_url(HPART_URL)

    # Parse the main page - it has all currently published entries
    main_entries = parse_hpart_main(main_html)
    print(f"  Found {len(main_entries)} entries on main page")
    all_entries = list(main_entries)

    print("\nStep 2: Fetching meeting calendar from hNum.php...")
    meetings = fetch_meetings()
    print(f"  Found {len(meetings)} upcoming meetings")

    print("\nStep 3: Fetching entries for each future meeting...")
    for date_str, track_name in meetings:
        track = track_code(track_name)
        # Skip if we already have entries for this track+date from the main page
        already = any(e['track'] == track and e['race_date'] == date_str for e in all_entries)
        if already:
            continue
        url = f"{HPART_URL}?data={date_str}&ippodromo={track_name}"
        try:
            html = fetch_url(url)
            entries = parse_hpart(html, track, date_str)
            if entries:
                print(f"  {date_str} {track_name} ({track}): {len(entries)} entries")
                all_entries.extend(entries)
            else:
                print(f"  {date_str} {track_name} ({track}): no entries yet")
        except Exception as e:
            print(f"  {date_str} {track_name}: ERROR - {e}")

    print(f"\nTotal entries: {len(all_entries)}")

    if dry_run:
        print("\n--- DRY RUN (no write) ---")
        for e in all_entries[:20]:
            print(f"  {e['track']} {e['race_date']} {e['race_time']} | #{e['start_pos']} {e['horse_name']}")
        if len(all_entries) > 20:
            print(f"  ... and {len(all_entries) - 20} more")
        return

    conn = sqlite3.connect(str(DB_PATH))
    create_table(conn)
    cleanup_old(conn)

    inserted, updated = insert_entries(conn, all_entries)
    print(f"\nInserted: {inserted}")
    print(f"Updated: {updated}")

    try:
        rated = conn.execute("""
            SELECT COUNT(*) FROM upcoming_races ur
            JOIN horse_ratings hr ON hr.name = ur.horse_name AND hr.rating_mode = 'performance'
        """).fetchone()[0]
    except Exception:
        rated = 0
    total = conn.execute("SELECT COUNT(*) FROM upcoming_races").fetchone()[0]
    print(f"Rated horses: {rated}/{total}")

    events = conn.execute("SELECT COUNT(DISTINCT track || race_date || race_time) FROM upcoming_races").fetchone()[0]
    print(f"Race events: {events}")

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
