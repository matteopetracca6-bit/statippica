#!/usr/bin/env python3
"""
Misure del radar della scheda cavallo, calcolate di notte (21/11/2026).

PERCHE'. Il radar mette ogni cavallo a confronto con i coetanei su
rendimento, classe, costanza e frequenza. Le misure di tutti i cavalli si
ottengono con un giro su tutte le 800.000 gare: 2,5 secondi qui, molti di piu'
sul server del sito, che li rifaceva a ogni avvio e a ogni archivio nuovo
mentre i visitatori aspettavano. Ora il giro si fa una volta di notte e il
sito legge questa tabella (server/routes.ts, prendiListeRadar), che ha una
riga per cavallo. Se la tabella manca, il sito fa ancora il giro da solo.

Il conto deve restare UGUALE a quello di routes.ts (stessa formula del
livello della corsa e degli arrivi): se si cambia uno, si cambia l'altro.
"""
import sqlite3
import sys

QUOTA_POSTO = ("CASE placement WHEN 1 THEN 1.0 WHEN 2 THEN 0.475 WHEN 3 THEN 0.259 "
               "WHEN 4 THEN 0.13 WHEN 5 THEN 0.087 END")

SQL = f"""
    WITH liv AS (SELECT race_date d, track t, race_number n, MAX(prize_net / {QUOTA_POSTO}) l
                 FROM races WHERE placement BETWEEN 1 AND 5 AND prize_net > 0 AND race_number IS NOT NULL
                   AND track <> 'ESTERO'
                 GROUP BY 1, 2, 3),
         lv AS (SELECT r.*, CASE WHEN r.track = 'ESTERO'
                                 THEN CASE WHEN r.placement BETWEEN 1 AND 5 AND r.prize_net > 0
                                           THEN r.prize_net / {QUOTA_POSTO.replace("placement", "r.placement")} END
                                 ELSE liv.l END AS l
                FROM races r LEFT JOIN liv ON liv.d = r.race_date AND liv.t = r.track AND liv.n = r.race_number),
         g AS (SELECT r.horse_name h, COUNT(*) c, SUM(COALESCE(r.prize_net, 0)) p, AVG(r.l) cl, COUNT(r.l) nl,
                      SUM(CASE WHEN r.placement BETWEEN 1 AND 3 THEN 1 ELSE 0 END) t3,
                      COUNT(DISTINCT substr(r.race_date, 1, 4)) st
               FROM lv r
               GROUP BY r.horse_name HAVING COUNT(*) >= 5)
    SELECT g.h, g.c, g.p, g.cl, g.nl, g.t3, g.st, hr.birth_year
      FROM g JOIN horse_ratings hr ON hr.name = g.h AND hr.rating_mode = 'performance'"""


def phase_radar_misure(conn) -> int:
    righe = conn.execute(SQL).fetchall()
    conn.execute("DROP TABLE IF EXISTS radar_misure")
    conn.execute("""CREATE TABLE radar_misure (h TEXT, c INTEGER, p REAL, cl REAL, nl INTEGER, t3 INTEGER,
                    st INTEGER, y INTEGER)""")
    conn.executemany("INSERT INTO radar_misure VALUES (?,?,?,?,?,?,?,?)", righe)
    conn.commit()
    print(f"[RADAR] {len(righe)} cavalli", file=sys.stderr)
    return len(righe)


if __name__ == "__main__":
    import argparse, os
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    phase_radar_misure(sqlite3.connect(ap.parse_args().db))
