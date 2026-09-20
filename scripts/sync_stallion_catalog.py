#!/usr/bin/env python3
"""Aggiorna i dati degli stalloni leggendo il catalogo Trot Stallions Directory.

Fonte: https://www.trotstallionsdirectory.com/catalogo (stagione di monta 2026)

Lo script legge la scheda di ogni stallone e aggiorna nel database:
  - tassa di monta (in euro; le tariffe in dollari vengono convertite)
  - stato della monta (attiva / da concordare / gratuita)
  - paese, anno di nascita, padre, madre e nonno materno indicati dal catalogo
  - record sul chilometro e vincite di carriera
  - dove funziona lo stallone (allevamento e indirizzo)
  - i recapiti telefonici, che restano SOLO nel database:
    nessuna rotta del sito li espone e la colonna non viene mai selezionata.

Uso:
    python scripts/sync_stallion_catalog.py            # aggiorna tutto
    python scripts/sync_stallion_catalog.py --dry-run  # mostra cosa cambierebbe
    python scripts/sync_stallion_catalog.py --limit 10 # prova su pochi nomi
"""

from __future__ import annotations

import argparse
import html as html_mod
import re
import json
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone

DB_PATH = "data.db"
BASE = "https://www.trotstallionsdirectory.com"
CATALOG_URL = f"{BASE}/catalogo"
SEASON = "2026"
FEE_SOURCE = "Trot Stallions Directory 2026"
USD_TO_EUR = 0.92
# La fonte usa sigle italiane: le riportiamo ai codici usati dal sito.
COUNTRY_FIX = {"SVE": "SWE", "DAN": "DEN", "OLA": "NED", "SPA": "ESP", "GB": "GBR"}
SLUG_MAP_FILE = "scripts/catalog_slugs.json"
NAMES_FILE = "scripts/catalog_names.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; StatIppica/1.0)"}
PAUSE_S = 0.6

NEW_COLUMNS = {
    "stud_farm_address": "TEXT",
    "stud_contacts": "TEXT",          # riservato: mai esposto dalle rotte
    "record_1600": "TEXT",
    "record_2000": "TEXT",
    "catalog_earnings_eur": "REAL",
    "catalog_birth_year": "INTEGER",
    "catalog_sire": "TEXT",
    "catalog_dam": "TEXT",
    "catalog_dam_sire": "TEXT",
    "catalog_notes": "TEXT",
    "catalog_url": "TEXT",
    "catalog_synced_at": "TEXT",
}


def get_page(url: str, tries: int = 3) -> str | None:
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read().decode("utf-8", "replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            if attempt == tries - 1:
                print(f"    ! non raggiungibile ({exc})")
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def to_text(raw_html: str) -> str:
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw_html, flags=re.S | re.I)
    body = html_mod.unescape(re.sub(r"<[^>]+>", "\n", body))
    return "\n".join(line.strip() for line in body.split("\n") if line.strip())


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower().replace("'", "").replace("`", "").replace(".", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def load_slug_map() -> dict[str, str]:
    """Mappa nome -> indirizzo della scheda, raccolta dai link del catalogo."""
    try:
        with open(SLUG_MAP_FILE, encoding="utf-8") as fh:
            return {k.upper(): v for k, v in json.load(fh).items()}
    except (OSError, ValueError):
        return {}


def parse_fee(line: str) -> tuple[float | None, str]:
    """Ritorna (tassa in euro, stato)."""
    low = line.lower()
    if "gratuit" in low:
        return 0.0, "free"
    if "concordare" in low:
        return None, "da_concordare"
    # Tre forme viste sul catalogo: "2.000 euro", "€ 8.500", "3.000 + iva"
    # (senza valuta, che sul catalogo italiano significa comunque euro).
    m = re.search(r"([\d][\d\.\s]*)\s*(euro|dollari|\$|€)", line, re.I)
    unit = (m.group(2).lower() if m else "euro")
    if not m:
        m = re.search(r"(?:euro|€|\$)\s*([\d][\d\.\s]*)", line, re.I)
        if m:
            unit = "$" if "$" in line else "euro"
    if not m:
        after = re.search(r"tasso di monta\s*:\s*(?:da\s+)?([\d][\d\.\s]*)", line, re.I)
        if not after:
            return None, "active"
        m, unit = after, "euro"
    value = float(re.sub(r"[^\d]", "", m.group(1)) or 0)
    if unit in ("dollari", "$"):
        value = round(value * USD_TO_EUR, 2)
    return (value or None), "active"


def _block(lines: list[str], start_kw: str, stop_kws: tuple[str, ...]) -> str | None:
    """Righe che seguono `start_kw` fino alla prima riga di stop."""
    for i, line in enumerate(lines):
        if line.lower().startswith(start_kw):
            out = []
            for nxt in lines[i + 1:]:
                if any(nxt.lower().startswith(k) for k in stop_kws) or nxt.startswith("___"):
                    break
                out.append(nxt)
            joined = " ".join(out).strip(" -|")
            return joined or None
    return None


def parse_detail(text: str, name: str) -> dict:
    """Estrae i campi dalla scheda di uno stallone."""
    out: dict = {}
    idx = text.rfind("HOME\nCATALOGO\n" + name.upper())
    body = text[idx:] if idx >= 0 else text
    body = body.split("CATALOGO STALLONI ON LINE")[0]
    lines = [l.strip() for l in body.split("\n") if l.strip()]

    fee_line = next((l for l in lines if "tasso di monta" in l.lower()), "")
    if fee_line:
        fee, status = parse_fee(fee_line)
        out["stud_fee_eur"] = fee
        out["stud_status"] = status
        country = re.search(r"\(([A-Z]{3})\)", fee_line)
        if country:
            out["country"] = country.group(1)

    # "2011 - (FRA) - da Ready Cash e Belisha (Reethi Rah jet)"
    gen_line = next(
        (l for l in lines if re.match(r"^\d{4}\s*-\s*\([A-Z]{3}\)\s*-\s*da\s", l)), None
    )
    if gen_line:
        m = re.match(r"^(\d{4})\s*-\s*\(([A-Z]{3})\)\s*-\s*da\s+(.+)$", gen_line)
        out["catalog_birth_year"] = int(m.group(1))
        code = m.group(2)
        out.setdefault("country", COUNTRY_FIX.get(code, code))
        parents = m.group(3)
        if " e " in parents:
            sire, dam_part = parents.split(" e ", 1)
        else:
            sire, dam_part = parents, ""
        out["catalog_sire"] = sire.strip().upper() or None
        dam_sire = re.search(r"\(([^)]+)\)\s*$", dam_part)
        if dam_sire:
            out["catalog_dam_sire"] = dam_sire.group(1).strip().upper()
            dam_part = dam_part[: dam_sire.start()]
        dam_part = re.sub(r"\brec(?:ord)?\.?\s*[\d\.]+.*$", "", dam_part, flags=re.I)
        out["catalog_dam"] = dam_part.strip(" ,-").upper() or None

    # record del soggetto: solo dalle righe che iniziano con rec/record
    for line in lines:
        if not re.match(r"^rec(?:ord)?\b|^rec\.", line, re.I):
            continue
        for value, distance in re.findall(r"([\d]\.[\d]{2}\.[\d])\s*\(?\s*(\d{4})", line):
            if distance.startswith("16"):
                out.setdefault("record_1600", value)
            elif distance.startswith(("20", "21")):
                out.setdefault("record_2000", value)

    win = re.search(r"vincite per\s*([\d\.]+)\s*(euro|\u20ac|\$|dollari)?", body, re.I)
    if win:
        value = float(win.group(1).replace(".", "")) or None
        if value and (win.group(2) or "").lower() in ("$", "dollari"):
            value = round(value * USD_TO_EUR, 2)
        out["catalog_earnings_eur"] = value

    farm = _block(lines, "funziona presso", ("per informazioni", "per info", "contatti"))
    if farm:
        out["stud_farm_address"] = farm
        short = re.split(
            r"\s+(?:Via|Viale|Loc\.|Localita|Strada|Piazza|S\.da|\d+a? Traversa)\b", farm
        )[0]
        out["stud_farm"] = short.strip(" ,-") or farm

    contacts = _block(lines, "per informazioni", ("funziona presso", "home", "catalogo"))
    if contacts:
        # a volte l'indirizzo email arriva spezzato a meta' riga
        contacts = re.sub(r"([\w\.\-]+@[\w\.\-]+?)\s+([a-z]{1,4})\b", r"\1\2", contacts)
        out["stud_contacts"] = contacts

    notes = [l for l in lines if re.search(r"seme (fresco|refrigerato|congelato)", l, re.I)]
    if notes:
        out["catalog_notes"] = " | ".join(notes)
    return out


def official_names() -> set[str]:
    """Elenco ufficiale dei nomi del catalogo, aggiornato a mano quando cambia
    la stagione. Serve per capire chi e' USCITO dal catalogo: la pagina letta
    senza browser mostra solo una parte dei nomi e da sola non basta."""
    try:
        with open(NAMES_FILE, encoding="utf-8") as fh:
            return {str(n).strip().upper() for n in json.load(fh) if str(n).strip()}
    except (OSError, ValueError):
        return set()


def catalog_names(known: list[str]) -> list[str]:
    """Nomi del catalogo: quelli già in archivio più quelli nuovi visibili nella pagina."""
    names = {n.upper() for n in known} | official_names()
    page = get_page(CATALOG_URL)
    if page:
        text = to_text(page)
        lines = text.split("\n")
        for i, line in enumerate(lines):
            if "tasso di monta" in line.lower():
                for j in range(i - 1, max(-1, i - 5), -1):
                    cand = lines[j].strip()
                    if re.fullmatch(r"[A-Z][A-Z' `\.\-]{2,32}", cand) and "CATALOGO" not in cand:
                        names.add(cand.upper())
                        break
    return sorted(names)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    existing = {r[1] for r in conn.execute("PRAGMA table_info(stallions)")}
    for column, ctype in NEW_COLUMNS.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE stallions ADD COLUMN {column} {ctype}")
    conn.commit()

    known = [
        r["name"]
        for r in conn.execute(
            "SELECT name FROM stallions WHERE fee_source LIKE 'Trot%' OR fee_source LIKE 'trotstallions%'"
        )
    ]
    names = catalog_names(known)
    if args.limit:
        names = names[: args.limit]
    print(f"Stalloni da controllare: {len(names)}")

    now = datetime.now(timezone.utc).isoformat()
    updated = inserted = skipped = 0

    slug_map = load_slug_map()
    for pos, name in enumerate(names, 1):
        stored = conn.execute(
            "SELECT catalog_url FROM stallions WHERE name = ?", (name,)
        ).fetchone()
        slug = slug_map.get(name.upper()) or slugify(name)
        url = (stored["catalog_url"] if stored and stored["catalog_url"] else f"{BASE}/catalogo/{slug}")
        page = get_page(url)
        time.sleep(PAUSE_S)
        if not page or "tasso di monta" not in page.lower():
            skipped += 1
            continue
        data = parse_detail(to_text(page), name)
        if not data:
            skipped += 1
            continue
        data["season"] = SEASON
        data["fee_source"] = FEE_SOURCE
        data["catalog_url"] = url
        data["catalog_synced_at"] = now

        row = conn.execute("SELECT name FROM stallions WHERE name = ?", (name,)).fetchone()
        if args.dry_run:
            print(f"  [{pos}/{len(names)}] {name}: {data}")
            continue
        if row:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE stallions SET {sets} WHERE name = ?", (*data.values(), name))
            updated += 1
        else:
            cols = ", ".join(["name", *data.keys()])
            marks = ", ".join(["?"] * (len(data) + 1))
            conn.execute(f"INSERT INTO stallions ({cols}) VALUES ({marks})", (name, *data.values()))
            inserted += 1
        if pos % 25 == 0:
            conn.commit()
            print(f"  ... {pos}/{len(names)}")

    retired = 0
    if not args.dry_run:
        # Ritiro solo sulla base dell'elenco ufficiale completo: chi risulta in
        # archivio con una tassa di questa fonte ma non e' piu' nel catalogo
        # tiene un prezzo vecchio, quindi va marcato e la tassa azzerata.
        # Senza elenco ufficiale non si ritira nulla: la pagina letta senza
        # browser mostra solo una parte dei nomi.
        official = official_names()
        if official:
            for row in conn.execute(
                "SELECT name FROM stallions "
                "WHERE stud_fee_eur > 0 OR stud_status IN ('active','da_concordare','free')"
            ).fetchall():
                if row["name"].strip().upper() not in official:
                    conn.execute(
                        "UPDATE stallions SET stud_status = 'non_in_catalogo', "
                        "stud_fee_eur = NULL WHERE name = ?",
                        (row["name"],),
                    )
                    retired += 1
            # Chi e' nel catalogo con una tassa ma senza stato resta invisibile
            # ai filtri della pagina: lo stato va allineato alla tassa.
            conn.execute(
                "UPDATE stallions SET stud_status = 'active' "
                "WHERE stud_status IS NULL AND stud_fee_eur > 0"
            )
            for wrong, right in COUNTRY_FIX.items():
                conn.execute(
                    "UPDATE stallions SET country = ? WHERE country = ?", (right, wrong)
                )
        conn.commit()
    print(f"Usciti dal catalogo: {retired}")
    print(f"Aggiornati: {updated} | nuovi: {inserted} | schede non lette: {skipped}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
