#!/usr/bin/env python3
"""Riallinea i totali di carriera dei cavalli alle loro gare.

IL DIFETTO. I totali di carriera (corse, vittorie, guadagni) stanno nella
tabella dei cavalli, calcolati a parte dalle singole gare. La funzione che li
rifaceva contava solo le gare CLASSIFICATE, cioe' quelle con un piazzamento,
escludendo le partenze in cui il cavallo e' stato squalificato, si e' ritirato
o e' stato distanziato. Ma quelle sono partenze vere, e la fonte le conta fra
le corse: un cavallo con 99 partenze ne mostrava 37.

E quelle partenze possono aver fruttato: nelle gare senza piazzamento ci sono
304.744 euro di premi che finivano fuori dai guadagni di carriera.

Nell'archivio convivevano quindi due definizioni diverse: 13.395 cavalli
contati su tutte le partenze (giusto) e 3.043 contati solo sulle classificate
(sbagliato). Il confronto fra due cavalli poteva essere falsato senza che nulla
lo segnalasse, perche' entrambi i numeri erano plausibili.

CAUTELA IMPORTANTE. I cavalli senza NESSUNA gara in archivio non si toccano.
I campioni storici (VARENNE, MACK GRACE SM, LOONEY TUNES...) hanno i totali
presi dalla fonte ma nessuna gara dettagliata, perche' correvano prima
dell'inizio dell'archivio. Ricalcolarli azzererebbe le 41 vittorie di Varenne.
Sono 447 cavalli e vanno lasciati in pace.

Uso:
    python3 scripts/allinea_totali.py --prova    # mostra, non scrive
    python3 scripts/allinea_totali.py            # esegue
"""
import argparse
import importlib.util
import os
import sqlite3
import sys
import time

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# I totali corretti si calcolano su TUTTE le gare del cavallo.
CORRETTI = """
    SELECT h.name,
           h.career_races, h.career_wins, h.career_earnings,
           x.n_gare, x.n_vittorie, x.guadagni
      FROM horses h
      JOIN (SELECT horse_name AS nm,
                   COUNT(*) AS n_gare,
                   SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS n_vittorie,
                   COALESCE(SUM(prize_net), 0) AS guadagni
              FROM races
          GROUP BY horse_name) x ON x.nm = h.name
     WHERE COALESCE(h.career_races, 0) <> x.n_gare
        OR COALESCE(h.career_wins, 0) <> x.n_vittorie
        OR ABS(COALESCE(h.career_earnings, 0) - x.guadagni) > 1
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(RADICE, "data.db"))
    ap.add_argument("--prova", action="store_true",
                    help="mostra cosa farebbe senza scrivere niente")
    a = ap.parse_args()

    if not os.path.exists(a.db):
        print(f"ERRORE: archivio non trovato in {a.db}", file=sys.stderr)
        return 1

    spec = importlib.util.spec_from_file_location(
        "nu", os.path.join(RADICE, "nightly_update.py"))
    nu = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nu)

    conn = sqlite3.connect(a.db)
    conn.row_factory = sqlite3.Row

    protetti = conn.execute("""
        SELECT COUNT(*) FROM horses h
         WHERE NOT EXISTS (SELECT 1 FROM races WHERE horse_name = h.name)
           AND COALESCE(h.career_races, 0) > 0""").fetchone()[0]
    print(f"Cavalli senza gare in archivio, lasciati intatti: {protetti}")
    print("  (campioni storici: i loro totali vengono dalla fonte e "
          "ricalcolarli li azzererebbe)")
    print()

    da_fare = list(conn.execute(CORRETTI))
    print(f"Cavalli da riallineare: {len(da_fare)}")
    if a.prova:
        print("MODALITA' PROVA: non scrivo niente.\n")
        print("Primi 12, per farsi un'idea:")
        for r in da_fare[:12]:
            print(f"  {r['name'][:22]:24} corse {r['career_races']:>4} -> {r['n_gare']:<4}"
                  f"  vittorie {r['career_wins']:>3} -> {r['n_vittorie']:<3}"
                  f"  guadagni {r['career_earnings'] or 0:>10.0f} -> {r['guadagni']:<10.0f}")
        print("\nMODALITA' PROVA: nessuna modifica scritta.")
        return 0

    print()
    t0 = time.time()
    for i, r in enumerate(da_fare, 1):
        nu._update_horse_career_stats(conn, r["name"])
        if i % 500 == 0:
            conn.commit()
            print(f"  {i}/{len(da_fare)}  ({time.time() - t0:.0f}s)", flush=True)
    conn.commit()
    print(f"Riallineati {len(da_fare)} cavalli in {time.time() - t0:.0f}s")
    print()

    # Controllo finale: non basta dire "fatto", va verificato.
    resti = len(list(conn.execute(CORRETTI)))
    print(f"Cavalli ancora disallineati: {resti}")

    ancora_protetti = conn.execute("""
        SELECT COUNT(*) FROM horses h
         WHERE NOT EXISTS (SELECT 1 FROM races WHERE horse_name = h.name)
           AND COALESCE(h.career_races, 0) > 0""").fetchone()[0]
    print(f"Cavalli storici ancora intatti: {ancora_protetti} (erano {protetti})")

    if resti:
        print("::error::restano cavalli disallineati.", file=sys.stderr)
        return 1
    if ancora_protetti != protetti:
        print("::error::ho azzerato dei campioni storici. Non va bene.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
