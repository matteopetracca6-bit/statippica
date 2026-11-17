#!/usr/bin/env python3
"""
Prova a mano la ricerca di un genitore sul registro ufficiale UNIRE (novembre
2026). Per ogni nome prova tutti i figli dell'archivio con sesso e anno noti
(i nati fino al 2021: la banca dati UNIRE e' aggiornata ad aprile 2024),
dal piu' vecchio, e stampa cosa risponde UNIRE. Non scrive niente.

Uso: python3 scripts/prova_unire.py --db data.db GELBISON [ALTRO ...]
"""
import argparse
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import unire_source  # noqa: E402
import re  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402


def grezzo(nome, sesso, anno):
    """Cosa risponde la ricerca, riga per riga (prime 5 righe), per varianti del nome."""
    varianti = [nome, nome.replace("'", " "), nome.replace("'", ""), nome.split("'")[0].strip(),
                nome.replace("'", "&#39;"), nome.replace("'", "`")]
    visti = set()
    for v in varianti:
        if not v or v in visti:
            continue
        visti.add(v)
        for code in unire_source._sex_codes(sesso):
            r = unire_source._get(unire_source.UNIRE_LIST, method="POST",
                                  data={"name": v, "sex": code, "year": str(anno)})
            soup = BeautifulSoup(r.text, "html.parser")
            righe = [[td.get_text(" ", strip=True) for td in tr.find_all("td")] for tr in soup.find_all("tr")]
            righe = [x for x in righe if len(x) >= 7]
            m = re.search(r"Ho trovato\s+(\d+)", soup.get_text(" "))
            print(f"      cerca {v!r} {code} {anno}: trovati {m.group(1) if m else '?'}; "
                  f"righe {[x[0] for x in righe[:5]]}")
            if righe:
                break


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--figli", type=int, default=3)
    ap.add_argument("nomi", nargs="+")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    for nome in a.nomi:
        nome = nome.strip().upper()
        riga = conn.execute("SELECT birth_year, sex, career_races, parent_fetch_at FROM horses "
                            "WHERE name = ?", (nome,)).fetchone()
        print(f"\n=== {nome}: scheda {riga}")
        figli = conn.execute("""
            SELECT name, sex, birth_year, CASE WHEN UPPER(TRIM(dam)) = ? THEN 'dam' ELSE 'sire' END
            FROM horses WHERE (UPPER(TRIM(dam)) = ? OR UPPER(TRIM(sire)) = ?)
              AND birth_year IS NOT NULL AND birth_year <= 2021 AND COALESCE(TRIM(sex), '') <> ''
            ORDER BY birth_year LIMIT ?""", (nome, nome, nome, a.figli)).fetchall()
        if not figli:
            print("  nessun figlio con sesso e anno noti (nato fino al 2021)")
        for figlio, sesso, anno, ruolo in figli:
            try:
                r = unire_source.find_parent_ids(figlio, sesso, anno)
            except unire_source.UnireUnavailable as e:
                print(f"  {figlio} ({sesso} {anno}): UNIRE non risponde ({e})")
                continue
            if not r:
                print(f"  {figlio} ({sesso} {anno}): figlio NON trovato su UNIRE")
                grezzo(figlio, sesso, anno)
                continue
            trovato, cid = r.get(ruolo, (None, None))
            print(f"  {figlio} ({sesso} {anno}): {ruolo} su UNIRE = {trovato!r} id={cid}"
                  f" {'(nome uguale)' if trovato == nome else '(NOME DIVERSO)'}")
            if cid:
                try:
                    d = unire_source.fetch_horse(cid)
                except unire_source.UnireUnavailable as e:
                    print(f"    scheda non letta ({e})")
                    continue
                print(f"    scheda UNIRE: {d}")
                break
    return 0


if __name__ == "__main__":
    sys.exit(main())
