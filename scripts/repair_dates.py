#!/usr/bin/env python3
"""Ridà la data alle gare che l'hanno persa.

Perché serve. Nell'archivio 142.963 gare su 612.811 sono senza data, quasi una
su quattro. Non sono gare vecchie arrivate incomplete: la data esiste alla
fonte, sulla scheda di carriera del cavallo. Si erano perse perché l'indirizzo
che la notte interrogava — cavAn.php — è stato dismesso e risponde una pagina
vuota: la riparazione notturna girava a vuoto senza accorgersene.

Il danno non è distribuito a caso. Colpisce in massa i cavalli nati fra il 2012
e il 2018, cioè quelli con la carriera conclusa, che sono la base su cui è
costruita la stima del valore residuo. Senza date non si sa in quale anno un
cavallo abbia guadagnato, e la tavola di sopravvivenza poggia su carriere
mutilate proprio dove dovrebbe essere più solida.

Cosa fa. Scorre i cavalli che hanno gare senza data, dal più colpito al meno,
scarica la scheda di carriera e riscrive le date sulle righe già presenti. Non
crea gare nuove: riconosce quelle che ci sono e completa quello che manca.

La notte fa lo stesso lavoro, ma a lotti di poche centinaia di cavalli per non
occupare l'aggiornamento. Questo script serve a smaltire l'arretrato in una
volta sola. È interrompibile e ripartibile: rilanciandolo riprende dai cavalli
ancora da sistemare.

    python3 scripts/repair_dates.py                 # tutti
    python3 scripts/repair_dates.py --limite 100    # solo i primi 100
"""

import argparse
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import nightly_update as N  # noqa: E402

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data.db")


def cavalli_da_sistemare(conn: sqlite3.Connection, limite: int | None) -> list:
    sql = """
        SELECT horse_name, COUNT(*) n
        FROM races
        WHERE race_date IS NULL OR TRIM(race_date) = ''
        GROUP BY horse_name
        ORDER BY n DESC
    """
    if limite:
        sql += f" LIMIT {int(limite)}"
    return conn.execute(sql).fetchall()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limite", type=int, default=None,
                    help="tratta solo i primi N cavalli, dal più colpito")
    ap.add_argument("--db", default=DB)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db, timeout=60)
    conn.execute("PRAGMA journal_mode=WAL")

    partenza = conn.execute(
        "SELECT COUNT(*) FROM races WHERE race_date IS NULL OR TRIM(race_date)=''"
    ).fetchone()[0]
    totale_gare = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    elenco = cavalli_da_sistemare(conn, args.limite)

    print(f"Gare senza data: {partenza:,} su {totale_gare:,} "
          f"({partenza / totale_gare * 100:.1f}%)", flush=True)
    print(f"Cavalli da trattare: {len(elenco):,}\n", flush=True)

    t0 = time.time()
    recuperate = falliti = 0

    for i, (nome, prima) in enumerate(elenco, 1):
        try:
            N._fetch_and_insert_full_career(conn, nome)
        except Exception as e:
            falliti += 1
            print(f"  [salto] {nome}: {e}", file=sys.stderr, flush=True)
            continue
        dopo = conn.execute(
            "SELECT COUNT(*) FROM races WHERE horse_name=? "
            "AND (race_date IS NULL OR TRIM(race_date)='')", (nome,)
        ).fetchone()[0]
        recuperate += max(0, prima - dopo)

        if i % 25 == 0:
            conn.commit()
            passati = time.time() - t0
            rimasti = (passati / i) * (len(elenco) - i)
            print(f"{i:>5}/{len(elenco)} cavalli | {recuperate:>7,} date recuperate "
                  f"| {passati / 60:.0f} min trascorsi, ~{rimasti / 60:.0f} min rimanenti",
                  flush=True)

    conn.commit()
    residuo = conn.execute(
        "SELECT COUNT(*) FROM races WHERE race_date IS NULL OR TRIM(race_date)=''"
    ).fetchone()[0]
    print(f"\nFinito in {(time.time() - t0) / 60:.0f} minuti.", flush=True)
    print(f"Date recuperate: {recuperate:,} | cavalli saltati: {falliti}", flush=True)
    print(f"Gare ancora senza data: {residuo:,} "
          f"(erano {partenza:,})", flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
