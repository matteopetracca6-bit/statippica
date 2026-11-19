#!/usr/bin/env python3
"""Porta le date recuperate su un altro database, senza toccare nulla d'altro.

Serve quando la riparazione gira in locale mentre l'aggiornamento notturno
lavora sulla propria copia: le due copie divergono, e scegliere una delle due
significa buttare via il lavoro dell'altra. La riparazione pero' ha fatto una
cosa sola, scrivere la data su righe che esistevano gia': e' un'informazione
che si puo' travasare.

Il travaso e' prudente. Ogni riga viene riconosciuta dal suo identificativo
interno e accettata solo se nell'altro database descrive la stessa gara —
stesso cavallo, stesso ippodromo, stessa distanza, stesso piazzamento. Se
qualcosa non torna la riga viene contata e lasciata come sta. E la data viene
scritta solo dove manca: non sovrascrive mai una data esistente.

    python3 scripts/transfer_dates.py --da riparato.db --a notturno.db
"""

import argparse
import shutil
import sqlite3
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--da", required=True, help="database con le date recuperate")
    ap.add_argument("--a", required=True, help="database da completare")
    ap.add_argument("--prova", action="store_true",
                    help="conta cosa farebbe senza scrivere")
    args = ap.parse_args()

    if not args.prova:
        shutil.copy2(args.a, args.a + ".prima_del_travaso")
        print(f"copia di sicurezza: {args.a}.prima_del_travaso", flush=True)

    src = sqlite3.connect(f"file:{args.da}?mode=ro", uri=True)
    dst = sqlite3.connect(args.a, timeout=120)

    def firma(r):
        """Le colonne che devono coincidere perche' sia la stessa gara."""
        return (str(r[0] or "").strip().upper(), str(r[1] or "").strip().upper(),
                r[2], str(r[3] or "").strip())

    print("leggo le righe datate dal database riparato...", flush=True)
    datate = {}
    for rid, hn, tr, di, pl, dd in src.execute(
        """SELECT id, horse_name, track, distance, placement_raw, race_date
           FROM races WHERE race_date IS NOT NULL AND TRIM(race_date) <> ''"""
    ):
        datate[rid] = (firma((hn, tr, di, pl)), dd)
    print(f"  {len(datate):,} righe con data", flush=True)

    print("cerco le righe da completare nell'altro database...", flush=True)
    da_fare = dst.execute(
        """SELECT id, horse_name, track, distance, placement_raw
           FROM races WHERE race_date IS NULL OR TRIM(race_date) = ''"""
    ).fetchall()
    print(f"  {len(da_fare):,} righe senza data", flush=True)

    scritte = non_trovate = discordanti = 0
    for rid, hn, tr, di, pl in da_fare:
        voce = datate.get(rid)
        if not voce:
            non_trovate += 1
            continue
        if voce[0] != firma((hn, tr, di, pl)):
            # Lo stesso numero identifica due gare diverse: non e' la nostra.
            discordanti += 1
            continue
        if not args.prova:
            dst.execute("UPDATE races SET race_date=? WHERE id=?", (voce[1], rid))
        scritte += 1

    if not args.prova:
        dst.commit()

    residuo = dst.execute(
        "SELECT COUNT(*) FROM races WHERE race_date IS NULL OR TRIM(race_date)=''"
    ).fetchone()[0]
    print(f"\ndate {'da scrivere' if args.prova else 'scritte'}: {scritte:,}", flush=True)
    print(f"righe senza corrispondenza: {non_trovate:,} | "
          f"righe che descrivono un'altra gara: {discordanti:,}", flush=True)
    print(f"restano senza data: {residuo:,}", flush=True)
    dst.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
