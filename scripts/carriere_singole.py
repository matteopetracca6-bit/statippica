#!/usr/bin/env python3
"""
Carriera di singoli cavalli da UNIRE, su richiesta (20/11/2026).

Per i cavalli che servono subito e che il recupero degli storici, annata per
annata, non ha ancora raggiunto (per esempio LEMON DRA, 1986: gli storici
vanno dal 2011 al 1990). Per ognuno si cerca su UNIRE per nome esatto, sesso
e anno, e la scheda si completa come nel recupero degli storici
(storici_unire.leggi_cavallo): totali di carriera in Italia, record, genitori.
Una scheda che ha gia' delle corse non si tocca.

Uso: python3 scripts/carriere_singole.py --db data.db "LEMON DRA:1986:M" ...
"""
import argparse
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import unire_source as u  # noqa: E402
import storici_unire as su  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("cavalli", nargs="+", help="NOME:ANNO:SESSO (sesso M o F)")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    su.crea_tabelle(conn)
    for voce in a.cavalli:
        pezzi = [x.strip() for x in voce.split(":")]
        nome, anno = pezzi[0].upper(), int(pezzi[1])
        sessi = [pezzi[2].upper()] if len(pezzi) > 2 and pezzi[2] else ["M", "F"]
        esito = "non_trovato"
        for sesso in sessi:
            _, righe = su.cerca(nome, sesso, anno)
            giusta = next((r for r in righe if r[1] == u._norm(nome)), None)
            if giusta:
                cid, n, p, m = giusta
                esito = su.leggi_cavallo(conn, cid, n, sesso, anno, p, m)
                break
        conn.commit()
        r = conn.execute("SELECT birth_year, career_races, career_wins, career_earnings, record_career, horse_class "
                         "FROM horses WHERE name = ?", (nome,)).fetchone()
        print(f"[CARRIERE] {nome} ({anno}): {esito} -> {r}", file=sys.stderr, flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
