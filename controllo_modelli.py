"""
controllo_modelli.py — Controllo automatico, mese per mese, dei modelli XGBoost.

Gira ogni notte dentro il lavoro notturno (FASE 3i) e riscrive la tabella
`controllo_modelli`, una riga per mese e per modello.

PRIMI TRE
  Usa solo le stime "del giorno", cioe' quelle mostrate nel calendario prima
  della gara, confrontate con l'arrivo vero. Per ogni mese conta quante volte
  i tre favoriti sono arrivati nei primi tre, e lo confronta con:
   - la scelta a caso (in una corsa da N cavalli, 3 su N);
   - il risultato della prova fatta all'allenamento.
  Se il modello scende sotto la prova di oltre 8 punti, o non batte il caso di
  almeno 5 punti, il mese e' segnato "attenzione" e il lavoro notturno lo
  scrive come avviso nel registro di GitHub.

PREMI DEI PROSSIMI 12 MESI
  Una stima a 12 mesi si puo' controllare solo dopo 12 mesi. Per questo il
  primo giorno di ogni mese si mette da parte una copia delle stime
  (`stima_premi_storico`); quando una copia ha compiuto un anno, si confronta
  con i premi vinti davvero, e con il metodo "quanto l'anno prima".
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent / "modelli"
MARGINE_PROVA = 0.08
MARGINE_CASO = 0.05
MINIMO_CORSE = 40


def _riferimento_top3():
    try:
        v = json.loads((CARTELLA / "top3_verifica.json").read_text())
        return float(v["campo_completo"]["modello_normalizzato"]["tre_scelti_a_segno"])
    except Exception:
        return None


def _tabelle(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS controllo_modelli (
        mese TEXT, modello TEXT, corse INTEGER, quota_favoriti REAL, quota_a_caso REAL,
        riferimento REAL, errore_medio REAL, errore_anno_prima REAL, stato TEXT, nota TEXT,
        calcolato_il TEXT, PRIMARY KEY (mese, modello))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS stima_premi_storico (
        mese TEXT, horse_name TEXT, premi_attesi REAL, premi_ultimo_anno REAL, giorno TEXT,
        PRIMARY KEY (mese, horse_name))""")


def _controlla_top3(conn, ora, rif):
    righe = conn.execute("""
        SELECT s.race_date, s.pista, s.corsa, s.horse_name, s.prob,
               r.placement, r.placement_raw
          FROM pronostico_top3_storico s
          LEFT JOIN races r ON r.horse_name = s.horse_name AND r.race_date = s.race_date AND r.track = s.pista
         WHERE s.tipo = 'del_giorno' AND s.race_date < date('now')""").fetchall()
    corse = {}
    for d, p, c, h, prob, pl, praw in righe:
        corse.setdefault((d, p, c), []).append((prob, pl, praw))
    mesi = {}
    for (d, _, _), v in corse.items():
        noti = [x for x in v if x[1] is not None or x[2] is not None]
        if not noti or len(v) <= 3:
            continue
        v.sort(key=lambda x: -x[0])
        fav = [x for x in v[:3] if x[1] is not None or x[2] is not None]
        if not fav:
            continue
        m = mesi.setdefault(d[:7], {"corse": 0, "fav": 0, "segno": 0, "caso": 0.0})
        m["corse"] += 1
        m["fav"] += len(fav)
        m["segno"] += sum(1 for x in fav if x[1] is not None and 1 <= x[1] <= 3)
        m["caso"] += 3 / len(v)
    out = []
    for mese, m in mesi.items():
        q = m["segno"] / m["fav"]
        caso = m["caso"] / m["corse"]
        if m["corse"] < MINIMO_CORSE:
            stato, nota = "pochi dati", f"servono almeno {MINIMO_CORSE} corse per giudicare"
        elif (rif is not None and q < rif - MARGINE_PROVA) or q < caso + MARGINE_CASO:
            stato, nota = "attenzione", "il pronostico va peggio di quanto promesso dalla prova"
        else:
            stato, nota = "in linea", "in linea con la prova"
        out.append((mese, "primi_tre", m["corse"], round(q, 4), round(caso, 4), rif, None, None, stato, nota, ora))
    return out


def _controlla_premi(conn, ora):
    import pandas as pd
    oggi = datetime.now(timezone.utc).date()
    mese = oggi.strftime("%Y-%m")
    # Copia del mese, la prima notte in cui c'e' una stima.
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stima_premi'").fetchone():
        if not conn.execute("SELECT 1 FROM stima_premi_storico WHERE mese = ? LIMIT 1", (mese,)).fetchone():
            conn.execute("""INSERT OR IGNORE INTO stima_premi_storico
                            SELECT ?, horse_name, premi_attesi, premi_ultimo_anno, ? FROM stima_premi""",
                         (mese, oggi.isoformat()))
    out = []
    copie = conn.execute("SELECT mese, MIN(giorno), COUNT(*) FROM stima_premi_storico GROUP BY mese").fetchall()
    for m, giorno, n in copie:
        g = pd.Timestamp(giorno)
        fine = g + pd.Timedelta(days=365)
        if fine.date() > oggi:
            out.append((m, "premi_12_mesi", n, None, None, None, None, None, "in attesa",
                        f"si potrà controllare dal {fine.strftime('%d/%m/%Y')}", ora))
            continue
        df = pd.read_sql_query("""
            SELECT s.horse_name, s.premi_attesi, s.premi_ultimo_anno,
                   COALESCE((SELECT SUM(prize_net) FROM races r WHERE r.horse_name = s.horse_name
                              AND r.race_date >= ? AND r.race_date < ?), 0) vero
              FROM stima_premi_storico s WHERE s.mese = ?""", conn,
            params=(g.strftime("%Y-%m-%d"), fine.strftime("%Y-%m-%d"), m))
        em = float((df["vero"] - df["premi_attesi"]).abs().mean())
        ea = float((df["vero"] - df["premi_ultimo_anno"]).abs().mean())
        stato = "in linea" if em < ea else "attenzione"
        nota = "sbaglia meno di «quanto l'anno prima»" if em < ea else "non batte più «quanto l'anno prima»"
        out.append((m, "premi_12_mesi", n, None, None, None, round(em), round(ea), stato, nota, ora))
    return out


def phase_controllo_modelli(conn: sqlite3.Connection) -> int:
    try:
        _tabelle(conn)
        ora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        righe = []
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pronostico_top3_storico'").fetchone():
            righe += _controlla_top3(conn, ora, _riferimento_top3())
        righe += _controlla_premi(conn, ora)
        conn.execute("DELETE FROM controllo_modelli")
        conn.executemany("INSERT OR REPLACE INTO controllo_modelli VALUES (?,?,?,?,?,?,?,?,?,?,?)", righe)
        conn.commit()
        oggi = datetime.now(timezone.utc)
        recenti = {oggi.strftime("%Y-%m"), (oggi.replace(day=1) - __import__("datetime").timedelta(days=1)).strftime("%Y-%m")}
        for r in righe:
            if r[8] == "attenzione" and (r[1] == "premi_12_mesi" or r[0] in recenti):
                # Riga speciale: GitHub la mostra come avviso nel riepilogo del lavoro.
                print(f"::warning title=Controllo modelli::{r[1]} {r[0]}: {r[9]}")
        print(f"[CONTROLLO] {len(righe)} righe", file=sys.stderr)
        return len(righe)
    except Exception as e:
        print(f"[CONTROLLO] errore, salto: {e!r}", file=sys.stderr)
        try:
            conn.rollback()
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    import os
    print(phase_controllo_modelli(sqlite3.connect(os.environ.get("DB_PATH", "data.db"))))
