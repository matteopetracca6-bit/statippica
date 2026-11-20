#!/usr/bin/env python3
"""
Nazionalita' degli stalloni cercata a mano (20/11/2026).

Gli stalloni con un voto ma senza bandiera (nessun paese da UNIRE, dal
catalogo o dalla seconda fonte) hanno il paese in dati/nazionalita_stalloni.csv,
cercato uno per uno dai piu' alti in classifica. Colonna fonte: "verificato"
(trovato sul web), "conoscenza" (stallone noto), "nome" (nome francese con
"du/de/d'" o di un allevamento francese). nome_giusto: il nome scritto bene
quando la fonte dei figli lo storpia (KEN WARKETIN = KEN WARKENTIN).

Si scrive solo dove il paese manca: un paese gia' presente non si tocca.
Gira ogni notte (nightly_update.py) e nel lavoro a mano.
"""
import csv
import os
import sqlite3
import sys

FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dati", "nazionalita_stalloni.csv")


def applica(conn) -> dict:
    esito = {"righe": 0, "cavalli": 0, "genealogie": 0}
    if not os.path.exists(FILE):
        return esito
    with open(FILE, newline="", encoding="utf-8") as f:
        righe = list(csv.DictReader(f, delimiter=";"))
    for r in righe:
        esito["righe"] += 1
        nome, paese = r["nome"].strip().upper(), r["paese"].strip().upper()
        if not nome or not paese:
            continue
        for n in {nome, (r.get("nome_giusto") or "").strip().upper()} - {""}:
            c = conn.execute("""UPDATE horses SET country = ? WHERE name = ?
                                AND COALESCE(TRIM(country), '') IN ('', 'EST')""", (paese, n))
            esito["cavalli"] += c.rowcount
            try:
                c = conn.execute("""UPDATE stallion_pedigree SET nationality = ? WHERE name = ?
                                    AND COALESCE(TRIM(nationality), '') = ''""", (paese, n))
                esito["genealogie"] += c.rowcount
            except sqlite3.Error:
                pass
    conn.commit()
    return esito


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    a = ap.parse_args()
    print(f"[NAZIONALITA] {applica(sqlite3.connect(a.db))}", file=sys.stderr)
