#!/usr/bin/env python3
"""
ripara_corse.py — StatIppica (23/11/2026)

PERCHE' ESISTE. Il codice della corsa nell'archivio e' scritto in quattro modi:
  "RO"                (fino a giugno 2026: sigla della pista, numero in race_number)
  "2021-12-27_PA_4"   (dalla scheda del cavallo)
  "2026-11-20_FI_R1"  (dalle pagine ufficiali dei risultati, da luglio 2026)
  "2026-07-01_130926" (codice interno della fonte)
Le pagine che cercavano una corsa per codice ("RO") prendevano tutte le corse
di Roma; quelle che leggevano il numero dal codice perdevano le gare fino a
giugno 2026. Il codice NON si riscrive: dice anche da quale fonte e' arrivata
la gara, e il notturno lo usa per non duplicarle. Si completa invece il
NUMERO della corsa (race_number) dove manca, leggendolo dal codice, cosi' ogni
corsa si riconosce da data + pista + numero.

In piu': 2.134 gare senza data hanno la data scritta nel codice
("2021-12-27_PA_4"). Si mette, se quel giorno il cavallo non ha gia' un'altra
gara (niente doppioni).

Uso:
  python3 scripts/ripara_corse.py --db data.db [--prova]
"""
from __future__ import annotations

import argparse
import re
import sqlite3
from datetime import date

NUMERO_DAL_CODICE = """CASE WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_R[0-9]*' THEN CAST(substr(race_code, 16) AS INTEGER)
  WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_[0-9]*' THEN CAST(substr(race_code, 15) AS INTEGER) END"""


def _data_valida(s: str) -> bool:
    try:
        d = date.fromisoformat(s)
        return date(2010, 1, 1) <= d <= date.today()
    except ValueError:
        return False


def ripara(conn: sqlite3.Connection, prova: bool = False) -> dict:
    esito = {}
    esito["numeri_mancanti"] = conn.execute(
        f"SELECT COUNT(*) FROM races WHERE race_number IS NULL AND ({NUMERO_DAL_CODICE}) IS NOT NULL").fetchone()[0]
    if not prova:
        conn.execute(f"""UPDATE races SET race_number = ({NUMERO_DAL_CODICE})
                         WHERE race_number IS NULL AND ({NUMERO_DAL_CODICE}) IS NOT NULL""")
    date_messe = 0
    righe = conn.execute("""SELECT id, horse_name, race_code FROM races
                            WHERE (race_date IS NULL OR TRIM(race_date) = '') AND race_code GLOB '????-??-??_*'""").fetchall()
    for rid, nome, codice in righe:
        d = codice[:10]
        if not _data_valida(d):
            continue
        if conn.execute("SELECT 1 FROM races WHERE horse_name = ? AND race_date = ? LIMIT 1", (nome, d)).fetchone():
            continue
        date_messe += 1
        if not prova:
            conn.execute("UPDATE races SET race_date = ? WHERE id = ?", (d, rid))
    esito["date_dal_codice"] = date_messe
    if not prova:
        conn.commit()
    print(f"[CORSE] numero della corsa completato: {esito['numeri_mancanti']}; date prese dal codice: {date_messe}")
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--prova", action="store_true")
    a = ap.parse_args()
    ripara(sqlite3.connect(a.db), a.prova)
