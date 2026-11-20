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

REFUSI (20/11/2026). Quando c'e' nome_giusto, la scheda col nome storpiato si
unisce a quella giusta: i figli passano al nome giusto (e con loro il voto da
stallone), la scheda doppia sparisce. Si ripete ogni notte, perche' la fonte
dei figli puo' riscrivere il nome storpiato.
Gira ogni notte (nightly_update.py) e nel lavoro a mano.
"""
import csv
import os
import sqlite3
import sys

FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dati", "nazionalita_stalloni.csv")


def unisci_refusi(conn, righe) -> list:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import omonimi
    uniti = []
    for r in righe:
        storpiato = r["nome"].strip().upper()
        giusto = (r.get("nome_giusto") or "").strip().upper()
        if not giusto or giusto == storpiato:
            continue
        figli = conn.execute("SELECT COUNT(*) FROM horses WHERE UPPER(TRIM(sire)) = ? OR UPPER(TRIM(dam)) = ?",
                             (storpiato, storpiato)).fetchone()[0]
        scheda = conn.execute("SELECT COALESCE(career_races, 0) FROM horses WHERE name = ?", (storpiato,)).fetchone()
        try:
            figli += conn.execute("SELECT COUNT(*) FROM horse_ratings WHERE UPPER(TRIM(sire)) = ?",
                                  (storpiato,)).fetchone()[0]
            figli += conn.execute("SELECT COUNT(*) FROM stallion_rating_stats WHERE sire = ?",
                                  (storpiato,)).fetchone()[0]
        except sqlite3.Error:
            pass
        if scheda and scheda[0] > 0:
            continue   # ha corse sue: e' un cavallo vero, non un refuso
        if figli or scheda:
            omonimi.rinomina(conn, storpiato, giusto)
            uniti.append(f"{storpiato} -> {giusto} ({figli} figli)")
    conn.commit()
    return uniti


def applica(conn) -> dict:
    esito = {"righe": 0, "cavalli": 0, "genealogie": 0, "refusi_uniti": 0}
    if not os.path.exists(FILE):
        return esito
    with open(FILE, newline="", encoding="utf-8") as f:
        righe = list(csv.DictReader(f, delimiter=";"))
    uniti = unisci_refusi(conn, righe)
    esito["refusi_uniti"] = len(uniti)
    if uniti:
        print("[NAZIONALITA] refusi uniti: " + "; ".join(uniti), file=sys.stderr)
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
