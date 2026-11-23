#!/usr/bin/env python3
"""
ripara_corse.py — StatIppica (23/11/2026)

PERCHE' ESISTE. Il codice della corsa nell'archivio e' scritto in quattro modi:
  "RO"                (fino a giugno 2026: sigla della pista, numero in race_number)
  "2021-12-27_PA_4"   (dalla scheda del cavallo)
  "2026-11-20_FI_R1"  (dalle pagine ufficiali dei risultati, da luglio 2026)
  "2026-07-01_130926" (codice interno della fonte)
Le pagine che cercavano una corsa per codice ("RO") prendevano tutte le corse
di Roma; quelle che leggevano il numero dal codice perdevano le gare fino a
giugno 2026. Il codice NON si riscrive: dice anche da quale fonte e' arrivata
la gara, e il notturno lo usa per non duplicarle. Si completa invece il
NUMERO della corsa (race_number) dove manca, leggendolo dal codice, cosi' ogni
corsa si riconosce da data + pista + numero.

In piu': 2.134 gare senza data hanno la data scritta nel codice
("2021-12-27_PA_4"). Si mette, se quel giorno il cavallo non ha gia' un'altra
gara (niente doppioni).

Uso:
  python3 scripts/ripara_corse.py --db data.db [--prova]
"""
from __future__ import annotations

import argparse
import re
import sqlite3
from collections import defaultdict
from datetime import date

NUMERO_DAL_CODICE = """CASE WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_R[0-9]*' THEN CAST(substr(race_code, 16) AS INTEGER)
  WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_[0-9]*' THEN CAST(substr(race_code, 15) AS INTEGER) END"""


def _data_valida(s: str) -> bool:
    try:
        d = date.fromisoformat(s)
        return date(2010, 1, 1) <= d <= date.today()
    except ValueError:
        return False


def ripara(conn: sqlite3.Connection, prova: bool = False, max_copie: int | None = None) -> dict:
    esito = {}
    esito["numeri_mancanti"] = conn.execute(
        f"SELECT COUNT(*) FROM races WHERE race_number IS NULL AND ({NUMERO_DAL_CODICE}) IS NOT NULL").fetchone()[0]
    if not prova:
        conn.execute(f"""UPDATE races SET race_number = ({NUMERO_DAL_CODICE})
                         WHERE race_number IS NULL AND ({NUMERO_DAL_CODICE}) IS NOT NULL""")
    date_messe = 0
    righe = conn.execute("""SELECT id, horse_name, race_code FROM races
                            WHERE (race_date IS NULL OR TRIM(race_date) = '') AND race_code GLOB '????-??-??_*'""").fetchall()
    for rid, nome, codice in righe:
        d = codice[:10]
        if not _data_valida(d):
            continue
        if conn.execute("SELECT 1 FROM races WHERE horse_name = ? AND race_date = ? LIMIT 1", (nome, d)).fetchone():
            continue
        date_messe += 1
        if not prova:
            conn.execute("UPDATE races SET race_date = ? WHERE id = ?", (d, rid))
    esito["date_dal_codice"] = date_messe
    if not prova:
        conn.commit()
    print(f"[CORSE] numero della corsa completato: {esito['numeri_mancanti']}; date prese dal codice: {date_messe}")
    esito.update(gare_senza_data(conn, prova, max_copie))
    return esito


def _chiave(n: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (n or "").upper())


def gare_senza_data(conn: sqlite3.Connection, prova: bool = False, max_copie: int | None = None) -> dict:
    """23/11/2026. Le gare senza data (26.000, quasi tutte rotture "r.p.") sono
    per lo piu' COPIE di gare gia' in archivio con la data: la scheda del
    cavallo le ripete senza data. D DAY NOF: 22 corse in archivio, 20 nella
    fonte ufficiale; le due in piu' sono le rotture del 24/09 e del 12/11/2021
    ripetute senza data. Contavano nella carriera: corse, rotture e premi in
    piu', e percentuale di vittorie piu' bassa.

    Per ogni gara senza data di un cavallo, con i partenti ufficiali MASAF
    (allenatori_corse, dal 2016):
      - se fra le corse ufficiali del cavallo che in archivio NON hanno ancora
        una gara datata ce n'e' UNA sola con la stessa pista e lo stesso numero
        di corsa, la gara prende quella data;
      - altrimenti, se e' identica a una gara gia' datata (pista, numero di
        corsa, esito, numero di partenza, partenti, distanza), e' una copia e
        si toglie;
      - altrimenti resta com'e'.
    Le gare all'estero non si toccano (la fonte ufficiale e' solo italiana).
    Poi si rifanno i totali di carriera dei cavalli toccati (non degli storici,
    i cui totali vengono dal registro)."""
    esito = {"senza_data_datate": 0, "senza_data_copie": 0, "senza_data_restano": 0}
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='allenatori_corse'").fetchone() or \
       not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gare_ufficiali_mappa'").fetchone():
        return esito
    pista = {}
    for uff, arch, _n in conn.execute("SELECT ufficiale, archivio, n FROM gare_ufficiali_mappa WHERE tipo='ippodromo' ORDER BY n DESC"):
        pista.setdefault(uff, arch.split("|")[0])
    und = conn.execute("""SELECT id, horse_name, track, race_number, placement_raw, start_pos, total_starters, distance
                          FROM races WHERE (race_date IS NULL OR TRIM(race_date) = '') AND track <> 'ESTERO'""").fetchall()
    if not und:
        return esito
    per_cavallo = defaultdict(list)
    for r in und:
        per_cavallo[r[1]].append(r)
    chiavi = {_chiave(h): h for h in per_cavallo}
    uff = defaultdict(set)
    for d, cod, corsa, ch in conn.execute("SELECT data, codice, corsa, chiave FROM allenatori_corse"):
        if ch in chiavi and cod in pista:
            uff[chiavi[ch]].add((d, pista[cod], corsa))
    toccati = set()
    # Nel notturno le copie da togliere sono poche (la pulizia grande si fa a
    # mano, archivio-genitori.yml): se fossero tante, la pubblicazione si
    # fermerebbe per il calo di gare. Oltre il limite si mettono solo le date.
    togli_copie = True
    if max_copie is not None:
        stima = gare_senza_data(conn, True)["senza_data_copie"] if not prova else 0
        if stima > max_copie:
            print(f"[CORSE] {stima} copie senza data: troppe per il notturno, le toglie il lavoro a mano")
            togli_copie = False
    for h, rs in per_cavallo.items():
        O = uff.get(h)
        if not O:
            esito["senza_data_restano"] += len(rs)
            continue
        datate = conn.execute("""SELECT race_date, track, race_number, placement_raw, start_pos, total_starters, distance
                                 FROM races WHERE horse_name = ? AND race_date IS NOT NULL AND TRIM(race_date) <> ''""", (h,)).fetchall()
        giorni = {x[0] for x in datate}
        identita = {(x[1], x[2], x[3], x[4], x[5], x[6]) for x in datate}
        libere = [o for o in O if o[0] not in giorni]
        usate = set()
        for rid, _h, t, n, raw, sp, ts, dist in rs:
            cand = [o for o in libere if o[1] == t and o[2] == n and o not in usate]
            if len(cand) == 1:
                usate.add(cand[0]); toccati.add(h); esito["senza_data_datate"] += 1
                if not prova:
                    conn.execute("UPDATE races SET race_date = ? WHERE id = ?", (cand[0][0], rid))
                continue
            if not cand and togli_copie and (t, n, raw, sp, ts, dist) in identita:
                toccati.add(h); esito["senza_data_copie"] += 1
                if not prova:
                    conn.execute("DELETE FROM races WHERE id = ?", (rid,))
                continue
            esito["senza_data_restano"] += 1
    if not prova and toccati:
        conn.commit()
        try:
            import importlib.util
            import sys
            from pathlib import Path
            radice = Path(__file__).resolve().parent.parent
            for x in (str(radice), str(radice / "scripts")):
                if x not in sys.path:
                    sys.path.insert(0, x)
            spec = importlib.util.spec_from_file_location("nu_rc", Path(__file__).resolve().parent.parent / "nightly_update.py")
            nu = importlib.util.module_from_spec(spec); spec.loader.exec_module(nu)
            storici = {x for (x,) in conn.execute("SELECT name FROM horses WHERE birth_year < 2012")}
            for h in toccati:
                if h not in storici:
                    nu._update_horse_career_stats(conn, h)
        except Exception as e:
            print(f"[CORSE] totali di carriera non rifatti ({e}): li rifa' il notturno")
        conn.commit()
    esito["cavalli_toccati"] = len(toccati)
    print(f"[CORSE] gare senza data: {esito}")
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--prova", action="store_true")
    a = ap.parse_args()
    ripara(sqlite3.connect(a.db), a.prova)
