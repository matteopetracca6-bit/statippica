#!/usr/bin/env python3
"""
Schede da cavallo per gli stalloni del sito (19/11/2026).

PERCHE'. Dei 711 stalloni con il voto da stallone, 152 non avevano nessuna
scheda da cavallo (stalloni piccoli, quasi tutti esteri: ODESSA SANTANA,
GUSTAV DIAMANT...) e 244 non avevano l'anno di nascita, senza il quale la
scheda non si apre. Qui, per ognuno, si cerca il cavallo su UNIRE per nome
esatto, sesso maschile (gli stalloni non sono castroni) e anno: l'anno non si sa, quindi si provano gli anni
da 3 a 12 prima del primo figlio in archivio, dal piu' probabile. Trovato, la
scheda riceve anno, paese, genitori e totali delle corse in Italia (quasi
sempre pochi o nessuno: hanno corso all'estero).

Cio' che non si trova resta com'e' e si annota in stalloni_schede (stato
non_trovato): niente anni inventati.

Uso: python3 scripts/stalloni_schede.py --db data.db [--minuti 60]
"""
import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import unire_source as u  # noqa: E402
import storici_unire as su  # noqa: E402


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def adesso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def da_fare(conn):
    return conn.execute("""
        SELECT s.sire,
               (SELECT MIN(f.birth_year) FROM horses f WHERE UPPER(TRIM(f.sire)) = s.sire) AS primo_figlio,
               h.name IS NOT NULL AS c_e
        FROM stallion_rating_stats s
        LEFT JOIN horses h ON h.name = s.sire
        WHERE (h.name IS NULL OR h.birth_year IS NULL)
          AND NOT EXISTS (SELECT 1 FROM stalloni_schede x WHERE x.nome = s.sire)
        ORDER BY s.n_figli_totali DESC""").fetchall()


def cerca_anno(nome, primo_figlio):
    testo = nome
    if "'" in nome:
        pezzi = [x.strip() for x in nome.split("'") if x.strip()]
        testo = pezzi[0] if pezzi and len(pezzi[0]) >= 3 else max(pezzi, key=len, default=nome)
    anni = [primo_figlio - d for d in (4, 5, 3, 6, 7, 8, 9, 10, 11, 12)] if primo_figlio else []
    for anno in anni:
        for sesso in ("M",):
            _, righe = su.cerca(testo, sesso, int(anno))
            for cid, n, p, m in righe:
                if n == u._norm(nome):
                    return cid, int(anno), p, m
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--minuti", type=float, default=60)
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    conn.execute("""CREATE TABLE IF NOT EXISTS stalloni_schede (nome TEXT PRIMARY KEY, stato TEXT,
                    anno INTEGER, corse INTEGER, quando TEXT)""")
    fine = time.monotonic() + a.minuti * 60
    esiti: dict = {}
    errori = 0
    for nome, primo, c_e in da_fare(conn):
        if time.monotonic() > fine:
            log("[STALLONI] tempo finito: riprendo la prossima volta")
            break
        try:
            t = cerca_anno(nome, primo)
            errori = 0
        except u.UnireUnavailable as e:
            # Una risposta lenta non ferma il giro (19/11/2026: un solo
            # ReadTimeout aveva chiuso il lavoro dopo 38 stalloni su 244):
            # si salta lo stallone, che resta da fare, e ci si ferma solo dopo
            # 8 errori di fila.
            errori += 1
            log(f"  UNIRE non risponde ({e}) su {nome}: lo riprovo la prossima volta")
            if errori >= 8:
                log("[STALLONI] la fonte non risponde: mi fermo")
                break
            time.sleep(15)
            continue
        if not t:
            stato, anno, corse = "non_trovato", None, None
        else:
            cid, anno, p, m = t
            d = u.fetch_horse(cid) or {}
            anno = int(d.get("birth_year") or anno)
            corse = int(d.get("career_races") or 0)
            paese = su.PAESI.get((d.get("country") or "").upper())
            valori = (anno, d.get("sex") or "M", paese, d.get("sire") or p, d.get("dam") or m, corse,
                      int(d.get("career_wins") or 0), int(d.get("career_places") or 0),
                      float(d.get("career_earnings") or 0.0), d.get("record_career"))
            classe = "breeder" if anno < 2012 else "athlete"
            if c_e:
                conn.execute("""UPDATE horses SET birth_year = ?, sex = COALESCE(NULLIF(sex, ''), ?),
                                    country = COALESCE(country, ?), sire = COALESCE(NULLIF(sire, ''), ?),
                                    dam = COALESCE(NULLIF(dam, ''), ?),
                                    career_races = CASE WHEN COALESCE(career_races, 0) = 0 THEN ? ELSE career_races END,
                                    career_wins = CASE WHEN COALESCE(career_races, 0) = 0 THEN ? ELSE career_wins END,
                                    career_places = CASE WHEN COALESCE(career_races, 0) = 0 THEN ? ELSE career_places END,
                                    career_earnings = CASE WHEN COALESCE(career_races, 0) = 0 THEN ? ELSE career_earnings END,
                                    record_career = COALESCE(record_career, ?), horse_class = ?, last_updated = ?
                                WHERE name = ?""", (*valori, classe, adesso(), nome))
                stato = "aggiornato"
            else:
                conn.execute("""INSERT INTO horses (name, birth_year, sex, country, sire, dam, career_races,
                                    career_wins, career_places, career_earnings, record_career, source,
                                    source_role, horse_class, backfill_status, tw_found, last_updated)
                                VALUES (?,?,?,?,?,?,?,?,?,?,?, 'unire_stalloni', 'parent_backfill', ?, 'done', 0, ?)""",
                             (nome, *valori, classe, adesso()))
                stato = "inserito"
        conn.execute("INSERT OR REPLACE INTO stalloni_schede VALUES (?,?,?,?,?)", (nome, stato, anno, corse, adesso()))
        conn.commit()
        esiti[stato] = esiti.get(stato, 0) + 1
    tot = dict(conn.execute("SELECT stato, COUNT(*) FROM stalloni_schede GROUP BY 1").fetchall())
    log(f"[STALLONI] questo giro {esiti}; in tutto {tot}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
