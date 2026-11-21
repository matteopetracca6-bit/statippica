#!/usr/bin/env python3
"""
Puledri trovati sul web, a mano (21/11/2026).

I puledri della generazione M (nati 2025) che non arrivano dalle aste ne'
dalla pagina "Puledri nati 2025" di vendopuledri: siti degli allevamenti e
annunci del Mercato ANACT, in dati/puledri_web.csv con la fonte. Entrano
nell'archivio come cavalli nati in quell'anno, senza corse (voto da
pedigree come gli altri puledri); chi c'e' gia' riceve solo i dati mancanti.
Gira ogni notte (nightly_update.py) e nel lavoro a mano archivio-puledri-vp.
"""
import csv
import os
import sqlite3
import sys
from datetime import datetime

FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dati", "puledri_web.csv")


def applica(conn) -> dict:
    esito = {"righe": 0, "nuovi": 0, "completati": 0, "omonimi": 0}
    if not os.path.exists(FILE):
        return esito
    with open(FILE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter=";"):
            esito["righe"] += 1
            nome = r["nome"].strip().upper()
            anno = int(r["anno"])
            sesso = (r.get("sesso") or "").strip().upper() or None
            padre, madre = r["padre"].strip().upper() or None, r["madre"].strip().upper() or None
            gia = conn.execute("SELECT birth_year FROM horses WHERE name = ?", (nome,)).fetchone()
            if gia and gia[0] is not None and int(gia[0]) != anno:
                esito["omonimi"] += 1
                continue
            if gia:
                c = conn.execute("""UPDATE horses SET birth_year = COALESCE(birth_year, ?), sex = COALESCE(NULLIF(sex, ''), ?),
                                        sire = COALESCE(NULLIF(sire, ''), ?), dam = COALESCE(NULLIF(dam, ''), ?),
                                        country = COALESCE(NULLIF(country, ''), ?)
                                    WHERE name = ? AND (birth_year IS NULL OR sex IS NULL OR sire IS NULL OR dam IS NULL OR country IS NULL)""",
                                 (anno, sesso, padre, madre, r.get("paese") or None, nome))
                esito["completati"] += c.rowcount
                continue
            conn.execute("""INSERT INTO horses (name, birth_year, sex, country, sire, dam, career_races, career_wins, career_places,
                                career_earnings, source, source_role, horse_class, backfill_status, tw_found, last_updated)
                            VALUES (?,?,?,?,?,?, 0, 0, 0, 0, 'web', 'puledri_web', 'athlete', 'done', 0, ?)""",
                         (nome, anno, sesso, r.get("paese") or "ITA", padre, madre, datetime.utcnow().isoformat(timespec="seconds")))
            esito["nuovi"] += 1
    conn.commit()
    return esito


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    a = ap.parse_args()
    print(f"[PULEDRI-WEB] {applica(sqlite3.connect(a.db))}", file=sys.stderr)
