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
Con --totali, alla fine aggiorna i totali di carriera tenendo per ogni voce
il piu' completo fra ufficiale e corse in archivio (mai piu' basso). Non
tocca anagrafica ne' tw_found. Ogni cavallo letto resta segnato in
storici_corse (si riprende dal punto esatto).

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


def aggiorna_totali(conn, anno: int) -> dict:
    """Totali di carriera degli storici dell'annata, dopo il recupero delle
    corse: per ogni voce si tiene il piu' completo fra il totale ufficiale e
    il conto delle corse in archivio (mai un numero piu' basso di quello che
    c'era). Il record resta quello ufficiale: i tempi al km dei piazzati in
    archivio sono a volte stimati e lo batterebbero di qualche decimo senza
    che sia vero. Ogni cambio resta in storici_totali_cambi, con il valore di
    prima."""
    # Tabella a parte: anomalie_corrette la conta la sentinella (soglia di
    # correzioni automatiche al giorno) e questo e' un recupero una tantum.
    conn.execute("""CREATE TABLE IF NOT EXISTS storici_totali_cambi (nome TEXT, campo TEXT, prima TEXT,
                    dopo TEXT, quando TEXT)""")
    ora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    righe = conn.execute("""
        SELECT h.name, COALESCE(h.career_races, 0), COALESCE(h.career_wins, 0), COALESCE(h.career_places, 0),
               COALESCE(h.career_earnings, 0), h.record_career,
               COUNT(r.id), SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END),
               SUM(CASE WHEN r.placement IN (2, 3) THEN 1 ELSE 0 END), SUM(COALESCE(r.prize_net, 0)),
               MIN(CASE WHEN r.time_km > 9 AND r.time_km < 25 THEN r.time_km END)
        FROM horses h JOIN races r ON r.horse_name = h.name
        WHERE h.birth_year = ? AND r.race_date >= (h.birth_year + 2) || '-01-01'
        GROUP BY h.name""", (anno,)).fetchall()
    esito = {"cavalli": len(righe), "corse": 0, "vittorie": 0, "piazzamenti": 0, "guadagni": 0, "record": 0}
    for (nome, cr, cw, cp, ce, rec, ar, aw, ap_, ae, at) in righe:
        nuovo = {}
        if cr == 0:
            # Senza totale ufficiale (non trovato su UNIRE, quasi sempre nato
            # all'estero): resta "carriera parziale", calcolata dalle corse.
            continue
        if ar > cr:
            nuovo["career_races"] = ar
        if (aw or 0) > cw:
            nuovo["career_wins"] = aw
        if (ap_ or 0) > cp:
            nuovo["career_places"] = ap_
        if (ae or 0) > ce + 1:
            nuovo["career_earnings"] = round(ae, 2)
        for campo, valore in nuovo.items():
            prima = {"career_races": cr, "career_wins": cw, "career_places": cp,
                     "career_earnings": ce, "record_career": rec}[campo]
            conn.execute(f"UPDATE horses SET {campo} = ? WHERE name = ?", (valore, nome))
            conn.execute("INSERT INTO storici_totali_cambi VALUES (?, ?, ?, ?, ?)",
                         (nome, campo, None if prima is None else str(prima), str(valore), ora))
            esito[{"career_races": "corse", "career_wins": "vittorie", "career_places": "piazzamenti",
                   "career_earnings": "guadagni", "record_career": "record"}[campo]] += 1
    conn.commit()
    return esito


def ripristina(conn, fino_al: int) -> int:
    """Annulla i cambi di totale per i nati fino a fino_al: torna il valore di
    prima (UNIRE), registrato in storici_totali_cambi."""
    try:
        cambi = conn.execute("""SELECT c.rowid, c.nome, c.campo, c.prima FROM storici_totali_cambi c
                                JOIN horses h ON h.name = c.nome WHERE h.birth_year <= ?
                                ORDER BY c.rowid DESC""", (fino_al,)).fetchall()
    except sqlite3.OperationalError:
        return 0
    for rid, nome, campo, prima in cambi:
        if campo not in ("career_races", "career_wins", "career_places", "career_earnings", "record_career"):
            continue
        conn.execute(f"UPDATE horses SET {campo} = ? WHERE name = ?", (prima, nome))
        conn.execute("DELETE FROM storici_totali_cambi WHERE rowid = ?", (rid,))
    conn.commit()
    return len(cambi)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--anno", default="2011", help="un'annata (2011) o un intervallo (2010-2003)")
    ap.add_argument("--minuti", type=float, default=150)
    ap.add_argument("--massimo", type=int, default=None)
    ap.add_argument("--prova", action="store_true", help="lavora su una copia in memoria")
    ap.add_argument("--totali", action="store_true", help="alla fine aggiorna i totali di carriera (solo 2011)")
    ap.add_argument("--ripristina", type=int, default=None,
                    help="rimette i totali UNIRE ai nati fino a quest'anno (annulla storici_totali_cambi)")
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
    if "-" in str(a.anno):
        x, y = (int(v) for v in str(a.anno).split("-"))
        anni = list(range(max(x, y), min(x, y) - 1, -1))
    else:
        anni = [int(a.anno)]
    anni = [x for x in anni if x <= 2011]          # solo storici: gli atleti li legge la notte
    for riga in copertura(conn, anni):
        log(f"[STORICI-CORSE] prima: nati {riga[0]}: corse ufficiali {riga[1]}, in archivio {riga[2]} {riga[3]}")
    cavalli = conn.execute(f"""
        SELECT name, birth_year FROM horses h WHERE birth_year IN ({",".join("?" * len(anni))}) AND career_races > 0
          AND NOT EXISTS (SELECT 1 FROM storici_corse s WHERE s.nome = h.name)
        ORDER BY birth_year DESC, career_races DESC""", anni).fetchall()
    log(f"[STORICI-CORSE] da leggere: {len(cavalli)}")
    fine = time.monotonic() + a.minuti * 60
    esiti, nuove, errori = {}, 0, 0
    for i, (nome, anno_cav) in enumerate(cavalli):
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
        if d.get("birth_year") and int(d["birth_year"]) != int(anno_cav):
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
                     (nome, int(anno_cav), stato, n, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")))
        conn.commit()
        esiti[stato] = esiti.get(stato, 0) + 1
        nuove += n
        if (i + 1) % 100 == 0:
            log(f"  ... {i + 1}/{len(cavalli)} cavalli, {nuove} corse nuove")
    log(f"[STORICI-CORSE] questo giro: {esiti}, corse nuove {nuove}")
    if a.ripristina:
        log(f"[STORICI-CORSE] totali rimessi come da UNIRE (nati fino al {a.ripristina}): {ripristina(conn, a.ripristina)}")
    if a.totali:
        # Totali dalle corse solo per il 2011, l'ultima annata con la carriera
        # intera in archivio (TrottoWeb + UNIRE per quel che manca). Dal 2010
        # in giu' le corse partono da meta' 2013: i totali restano quelli
        # UNIRE (decisione del 19/11/2026).
        for x in [y for y in anni if y >= 2011]:
            log(f"[STORICI-CORSE] totali di carriera {x} aggiornati (voci cambiate): {aggiorna_totali(conn, x)}")
    for riga in copertura(conn, anni):
        log(f"[STORICI-CORSE] dopo: nati {riga[0]}: corse ufficiali {riga[1]}, in archivio {riga[2]} "
            f"({100 * riga[2] / max(1, riga[1]):.0f}%) {riga[3]}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
