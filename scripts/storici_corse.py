#!/usr/bin/env python3
"""
Corse una per una degli storici di un'annata dalla scheda TrottoWeb
(19/11/2026, prima annata: i nati nel 2011).

PERCHE'. Il confine fra atleti e storici sta al 2012 perche' per i nati dal
2012 l'archivio ha il 100% delle corse, per i nati nel 2011 solo il 57%: gli
mancano soprattutto le stagioni dei 3 e 4 anni (2014-2015). Il recupero
notturno legge la scheda TrottoWeb solo per gli atleti, perche' poi rifa' i
totali di carriera dalle corse in archivio, e per uno storico vorrebbe dire
sostituire i totali ufficiali con un conto parziale.

COSA FA. Per ogni cavallo dell'annata con una carriera: legge la scheda
TrottoWeb, controlla che l'anno di nascita sia quello giusto (omonimi), data
le righe gia' presenti e aggiunge le corse che mancano, con le stesse regole
del recupero notturno (niente doppioni per stesso cavallo e stesso giorno).
NON tocca i totali di carriera, il voto, l'anagrafica ne' tw_found. Ogni
cavallo letto resta segnato in storici_corse (si riprende dal punto esatto).

Uso: python3 scripts/storici_corse.py --db data.db --anno 2011 [--minuti 150] [--massimo N] [--prova]
"""
import argparse
import importlib.util
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))   # nightly_update importa i moduli che stanno nella radice


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def carica_nu():
    spec = importlib.util.spec_from_file_location("nu_corse", RADICE / "nightly_update.py")
    nu = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nu)
    return nu


def copertura(conn, anni) -> list:
    out = []
    for a in anni:
        tot, arch = conn.execute("""
            SELECT SUM(career_races),
                   (SELECT COUNT(*) FROM races r JOIN horses h2 ON h2.name = r.horse_name WHERE h2.birth_year = ?)
            FROM horses WHERE birth_year = ?""", (a, a)).fetchone()
        per_anno = conn.execute("""
            SELECT substr(r.race_date, 1, 4), COUNT(*) FROM races r JOIN horses h ON h.name = r.horse_name
            WHERE h.birth_year = ? AND r.race_date IS NOT NULL GROUP BY 1 ORDER BY 1""", (a,)).fetchall()
        out.append((a, tot, arch, per_anno[:5]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--anno", type=int, default=2011)
    ap.add_argument("--minuti", type=float, default=150)
    ap.add_argument("--massimo", type=int, default=None)
    ap.add_argument("--prova", action="store_true", help="lavora su una copia in memoria")
    a = ap.parse_args()
    nu = carica_nu()
    conn = sqlite3.connect(a.db)
    if a.prova:
        copia = sqlite3.connect(":memory:")
        conn.backup(copia)
        conn.close()
        conn = copia
    conn.execute("""CREATE TABLE IF NOT EXISTS storici_corse (nome TEXT PRIMARY KEY, anno INTEGER,
                    stato TEXT, corse_nuove INTEGER, quando TEXT)""")
    for riga in copertura(conn, [a.anno]):
        log(f"[STORICI-CORSE] prima: nati {riga[0]}: corse ufficiali {riga[1]}, in archivio {riga[2]} {riga[3]}")
    cavalli = conn.execute("""
        SELECT name FROM horses h WHERE birth_year = ? AND career_races > 0
          AND NOT EXISTS (SELECT 1 FROM storici_corse s WHERE s.nome = h.name)
        ORDER BY career_races DESC""", (a.anno,)).fetchall()
    log(f"[STORICI-CORSE] da leggere: {len(cavalli)}")
    fine = time.monotonic() + a.minuti * 60
    esiti, nuove, errori = {}, 0, 0
    for i, (nome,) in enumerate(cavalli):
        if time.monotonic() > fine or (a.massimo and i >= a.massimo):
            log("[STORICI-CORSE] tempo finito: riprendo la prossima volta")
            break
        try:
            d = nu._fetch_anagrafica(nome)
        except Exception as e:  # pagina che non arriva: si riprova la prossima volta
            errori += 1
            log(f"  {nome}: errore ({e})")
            if errori >= 15:
                log("[STORICI-CORSE] TrottoWeb non risponde: mi fermo")
                break
            continue
        if d is None:
            errori += 1
            if errori >= 15:
                log("[STORICI-CORSE] TrottoWeb non risponde: mi fermo")
                break
            continue
        errori = 0
        if d.get("birth_year") and int(d["birth_year"]) != a.anno:
            stato, n = "omonimo", 0
        elif not d.get("races"):
            stato, n = "senza_corse", 0
        else:
            corse = nu._filter_min_date(d["races"], "2012-01-01")
            for r in corse:
                r["horse_name"] = nome
            nu._assegna_date_per_gruppo(conn, nome, corse)
            n = nu._insert_races(conn, corse)
            stato = "letto"
        conn.execute("INSERT OR REPLACE INTO storici_corse VALUES (?,?,?,?,?)",
                     (nome, a.anno, stato, n, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")))
        conn.commit()
        esiti[stato] = esiti.get(stato, 0) + 1
        nuove += n
        if (i + 1) % 100 == 0:
            log(f"  ... {i + 1}/{len(cavalli)} cavalli, {nuove} corse nuove")
    log(f"[STORICI-CORSE] questo giro: {esiti}, corse nuove {nuove}")
    for riga in copertura(conn, [a.anno]):
        log(f"[STORICI-CORSE] dopo: nati {riga[0]}: corse ufficiali {riga[1]}, in archivio {riga[2]} "
            f"({100 * riga[2] / max(1, riga[1]):.0f}%) {riga[3]}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
