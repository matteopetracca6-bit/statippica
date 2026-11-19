#!/usr/bin/env python3
"""Ripulisce il nome dell'allevamento mostrato sul sito.

Alcuni nomi arrivati dalle vecchie liste contenevano dentro anche indirizzo,
telefono ed email: il sito mostra il nome dell'allevamento, quindi quei
recapiti finivano pubblicati. Qui il nome viene ridotto alla sola ragione
sociale, l'indirizzo completo resta nel campo indirizzo e i recapiti vengono
spostati nel campo riservato che nessuna pagina espone.

Uso:
    python scripts/clean_stud_farm.py            # applica
    python scripts/clean_stud_farm.py --dry-run  # mostra soltanto
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys

# Parole che segnano l'inizio della parte "indirizzo" dentro al nome.
ADDRESS_SPLIT = re.compile(
    r"\s*(?:,\s*)?\b("
    r"via|viale|v\.le|loc\.|localita|località|strada|s\.da|piazza|p\.zza|"
    r"corso|c\.so|contrada|c\.da|\d+a?\s+traversa|fraz\.|frazione|"
    r"tel\.?|telefono|cell\.?|fax|e-?mail|mail"
    r")(?=\s|\d|$)",
    re.I,
)
CONTACT_RE = re.compile(
    r"([\w\.\-]+@[\w\.\-]+\.\w+)"                       # email
    r"|((?:tel\.?|cell\.?|fax)[\s:\.]*[\d\s\./\-]{6,})"  # tel/cell/fax
    r"|(\b\d{2,4}[\./\-]\d{5,8}\b)"                     # 338/9936886
    r"|(\b\d{9,11}\b)",                                  # 0771674487
    re.I,
)
# Doppioni noti: stesso allevamento scritto in modi diversi.
CANONICAL = {
    "allevamento folli": "Allevamento Folli",
    "allevamenti toniatti": "Allevamento Toniatti",
    "allevamento toniatti": "Allevamento Toniatti",
    "il canf": "Allevamento Il Canf di Cesarano Aniello",
    "allevamento il canf di cesarano aniello": "Allevamento Il Canf di Cesarano Aniello",
    "la piaggia s.r.l.": "La Piaggia",
    "stazione di monta la piaggia": "La Piaggia",
    "la piaggia": "La Piaggia",
    "az.agr la corte dei miracoli": "Az. Agr. La Corte dei Miracoli",
    "piandarca breeding horses": "Piandarca Breeding Horses",
}


def short_name(value: str) -> str:
    """Tiene la sola ragione sociale, togliendo indirizzo e recapiti."""
    text = value.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    # "LA PIAGGIA S.R.L.Via Baldacci" — manca lo spazio prima di Via
    text = re.sub(r"(?<=[a-z\.])(Via|Viale|Loc\.|Piazza)\b", r" \1", text)
    cut = ADDRESS_SPLIT.search(text)
    if cut:
        text = text[: cut.start()]
    text = CONTACT_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" ,;-–·")
    if text.isupper() and len(text) > 3:
        text = text.title().replace("S.R.L.", "S.r.l.")
    key = re.sub(r"\b(s\.?r\.?l\.?|s\.?s\.?|snc|spa)\b", "", text.lower()).strip(" .,")
    key = re.sub(r"\s+", " ", key)
    return CANONICAL.get(key, text)


def contacts_in(value: str) -> str | None:
    found = [m.group(0).strip(" :.") for m in CONTACT_RE.finditer(value.replace("\xa0", " "))]
    joined = " | ".join(dict.fromkeys(f for f in found if f))
    return joined or None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT name, stud_farm, stud_farm_address, stud_contacts FROM stallions "
        "WHERE stud_farm IS NOT NULL AND stud_farm <> ''"
    ).fetchall()

    changed = 0
    for row in rows:
        clean = short_name(row["stud_farm"]) or row["stud_farm"]
        addr_has_contacts = bool(row["stud_farm_address"] and CONTACT_RE.search(row["stud_farm_address"]))
        if clean == row["stud_farm"] and not addr_has_contacts:
            continue
        # L'indirizzo completo non va perso: se manca, ci mettiamo il testo lungo.
        address = row["stud_farm_address"] or row["stud_farm"].replace("\xa0", " ").strip()
        address = CONTACT_RE.sub(" ", address)
        address = re.sub(r"\s+", " ", address).strip(" ,;-")
        extra = contacts_in(row["stud_farm"])
        contacts = row["stud_contacts"]
        if extra and (not contacts or extra not in contacts):
            contacts = f"{contacts} | {extra}" if contacts else extra
        print(f"  {row['name']}: '{row['stud_farm'][:60]}' -> '{clean}'")
        if not args.dry_run:
            conn.execute(
                "UPDATE stallions SET stud_farm = ?, stud_farm_address = ?, stud_contacts = ? "
                "WHERE name = ?",
                (clean, address or None, contacts, row["name"]),
            )
        changed += 1

    if not args.dry_run:
        conn.commit()
    print(f"Nomi allevamento ripuliti: {changed}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
