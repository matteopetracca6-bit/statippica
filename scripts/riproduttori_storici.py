#!/usr/bin/env python3
"""
riproduttori_storici.py — StatIppica (24/11/2026)

PERCHE' ESISTE. Il voto da stallone e da fattrice si calcola dai figli nati
dal 2012 (gli atleti). Gli stalloni e le fattrici di prima hanno figli solo fra
gli storici, quindi restavano senza voto: WAIKIKI BEACH, padre di VARENNE, ha
129 figli nell'archivio e nessun voto da stallone; IALMAZ, la madre, nessun
voto da fattrice. Negli alberi le caselle dagli anni '90 in su erano vuote.

COSA FA. Per ogni padre e ogni madre che NON hanno gia' il voto da stallone o
da fattrice, guarda i figli con il voto storico (stessa scala per tutti gli
storici) e calcola:
  - la media dei punteggi dei figli, tirata verso la media di tutti quando i
    figli sono pochi (come si fa con poche corse): con 1 figlio conta un quarto,
    con 3 meta', con 9 tre quarti;
  - il voto in lettere sulle percentuali degli stalloni (o delle fattrici) con
    almeno 3 figli votati: stessa regola delle lettere degli altri voti.
E' un voto su un'altra scala rispetto a quello dei riproduttori di oggi:
la pagina lo chiama "voto storico da stallone/fattrice".

Tabella: riproduttori_storici (nome, ruolo, figli_votati, media_figli,
punteggio, voto, migliore, migliore_voto, affidabile).

Uso: python3 scripts/riproduttori_storici.py --db data.db
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

RICHIAMO = 3   # quanti figli "medi" si aggiungono a ognuno
PERCENTILI = [(99, "SSS"), (95, "SS"), (90, "S"), (75, "A"), (60, "B"), (40, "C"), (25, "D"), (20, "E")]


def soglie(punteggi):
    s = sorted(punteggi)
    if not s:
        return [(0, "F")]
    pv = lambda p: s[min(int(p / 100 * len(s)), len(s) - 1)]
    return [(pv(p), g) for p, g in PERCENTILI] + [(0, "F")]


def calcola(conn: sqlite3.Connection) -> dict:
    conn.execute("DROP TABLE IF EXISTS riproduttori_storici")
    conn.execute("""CREATE TABLE riproduttori_storici (nome TEXT, ruolo TEXT, figli_votati INTEGER, media_figli REAL,
                    punteggio REAL, voto TEXT, migliore TEXT, migliore_voto TEXT, affidabile INTEGER,
                    PRIMARY KEY (nome, ruolo))""")
    gia = {"sire": set(), "dam": set()}
    for (n,) in conn.execute("SELECT sire FROM stallion_rating_stats WHERE grade IS NOT NULL AND grade <> 'N/A'"):
        gia["sire"].add((n or "").upper())
    try:
        for (n,) in conn.execute("SELECT dam FROM dam_rating_stats WHERE grade IS NOT NULL AND grade <> 'N/A'"):
            gia["dam"].add((n or "").upper())
    except sqlite3.Error:
        pass
    figli = conn.execute("""SELECT h.sire, h.dam, r.name, r.score, r.grade
                              FROM horse_ratings r JOIN horses h ON h.name = r.name AND h.birth_year IS r.birth_year
                             WHERE r.rating_mode = 'storico' AND r.score IS NOT NULL""").fetchall()
    esito = {}
    for ruolo, idx in (("sire", 0), ("dam", 1)):
        per = {}
        for f in figli:
            g = (f[idx] or "").strip().upper()
            if g and g not in gia[ruolo]:
                per.setdefault(g, []).append((f[3], f[2], f[4]))
        if not per:
            continue
        tutti = [x[0] for v in per.values() for x in v]
        media_pop = sum(tutti) / len(tutti)
        righe = []
        for g, v in per.items():
            n = len(v)
            media = sum(x[0] for x in v) / n
            punteggio = (sum(x[0] for x in v) + RICHIAMO * media_pop) / (n + RICHIAMO)
            m = max(v)
            righe.append([g, ruolo, n, round(media, 2), round(punteggio, 2), None, m[1], m[2], int(n >= 3)])
        sog = soglie([r[4] for r in righe if r[2] >= 3])
        for r in righe:
            r[5] = next(gr for lim, gr in sog if r[4] >= lim)
        conn.executemany("INSERT OR REPLACE INTO riproduttori_storici VALUES (?,?,?,?,?,?,?,?,?)", righe)
        esito[ruolo] = len(righe)
    conn.commit()
    print(f"[RIPRODUTTORI STORICI] {esito}", file=sys.stderr)
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    calcola(sqlite3.connect(ap.parse_args().db))
