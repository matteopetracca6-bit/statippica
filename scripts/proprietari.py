#!/usr/bin/env python3
"""
PROPRIETARI: chi possiede ogni cavallo in ogni corsa, e le schede dei
proprietari.

DA DOVE VIENE IL DATO. Dai risultati ufficiali MASAF / Grande Ippica Italiana,
gli stessi da cui arriva l'allenatore (scripts/allenatori.py): accanto a ogni
cavallo c'e' anche il proprietario. La raccolta e' quella degli allenatori,
che salva il proprietario in allenatori_corse.proprietario. Si parte dal 2016.

ABBINAMENTO. Come per gli allenatori: data + nome del cavallo ridotto
all'osso. Se lo stesso nome ha due proprietari diversi nello stesso giorno, la
corsa resta senza proprietario invece di indovinare.

NOMI. Una scuderia compare scritta in modi diversi ("SC SANTESE SRL",
"SCUDERIA SANTESE S.R.L."): si uniscono togliendo le parole della forma
societaria e confrontando le parole che restano, con lo stesso metodo degli
allenatori, piu' le parole tipiche dei proprietari (AZ, AGR, AGRICOLA,
SCUDERIA, ...). Il nome mostrato e' la variante usata piu' spesso.

STATISTICHE. Conti semplici: corse, vittorie, premi, cavalli. In piu' i
PREMI A CAVALLO ALL'ANNO (premi divisi per le coppie cavallo-anno in cui il
cavallo ha corso per quel proprietario): dice quanto rende in media un cavallo
di quella scuderia in una stagione, il numero che conta per i conti di
pareggio. Non c'e' un confronto "a parita' di cavallo" come per guidatori e
allenatori: il proprietario non guida e non allena, sceglie i cavalli e chi li
segue. I premi dicono soprattutto quanto ha speso bene e quanto ha investito.

Uso (di solito lo chiama scripts/allenatori.py alla fine):
  python3 scripts/proprietari.py --db data.db
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from allenatori import (PRIMA_DATA, chiave_nome, log, nome_visibile,  # noqa: E402
                        unisci_nomi)

MIN_CORSE_SCHEDA = 20      # come gli allenatori: sotto, niente scheda
# Parole che nei nomi dei proprietari indicano la forma, non chi e'.
PAROLE_PROPRIETARI = {"AZ", "AZIENDA", "AG", "AGR", "AGRICOLA", "AGRIC", "SCUDERIA",
                      "SOC", "SOCIETA'", "SOCIETA", "SEMPLICE", "AGRICOLA'"}


def crea_tabelle(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS owner_stats (
            proprietario TEXT PRIMARY KEY, nome TEXT,
            n_corse INTEGER, n_corse_recenti INTEGER, n_cavalli INTEGER,
            n_cavalli_recenti INTEGER, n_vittorie INTEGER, n_primi_tre INTEGER,
            pct_vittorie REAL, pct_primi_tre REAL, premi_totali REAL,
            premi_per_corsa REAL, premi_12_mesi REAL, vittorie_12_mesi INTEGER,
            prima_corsa TEXT, ultima_corsa TEXT, ippodromo_top TEXT,
            allenatore_top TEXT, guidatore_top TEXT, attivo INTEGER,
            premi_cavallo_anno REAL, n_allenatori INTEGER);
    """)
    colonne = {r[1] for r in conn.execute("PRAGMA table_info(races)")}
    if "owner" not in colonne:
        conn.execute("ALTER TABLE races ADD COLUMN owner TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_races_owner ON races(owner)")
    col_ac = {r[1] for r in conn.execute("PRAGMA table_info(allenatori_corse)")}
    if "proprietario" not in col_ac:
        conn.execute("ALTER TABLE allenatori_corse ADD COLUMN proprietario TEXT")
    conn.commit()


def _senza_forma(raw: str) -> str:
    """SC SANTESE SRL -> SANTESE SRL (la forma societaria la toglie poi
    unisci_nomi): qui si tolgono solo le parole tipiche dei proprietari."""
    t = re.sub(r"[.,]", " ", raw.upper())
    parole = [p for p in t.split() if p not in PAROLE_PROPRIETARI]
    return " ".join(parole) or raw.upper()


def mappa_nomi(conteggi: dict[str, int]) -> tuple[dict[str, str], dict[str, str]]:
    """{nome ufficiale: chiave unica}, {chiave unica: nome da mostrare}."""
    ridotti: dict[str, int] = defaultdict(int)
    for raw, n in conteggi.items():
        ridotti[_senza_forma(raw)] += n
    unione = unisci_nomi(dict(ridotti))
    mappa = {raw: unione[_senza_forma(raw)] for raw in conteggi}
    migliore: dict[str, tuple[int, str]] = {}
    for raw, n in conteggi.items():
        k = mappa[raw]
        if k not in migliore or (n, raw) > migliore[k]:
            migliore[k] = (n, raw)
    return mappa, {k: nome_visibile(raw) for k, (_, raw) in migliore.items()}


def abbina(conn: sqlite3.Connection) -> dict:
    """Scrive il proprietario sulle corse dell'archivio."""
    conteggi = dict(conn.execute("""SELECT proprietario, COUNT(*) FROM allenatori_corse
                                    WHERE proprietario IS NOT NULL GROUP BY proprietario""").fetchall())
    mappa, _ = mappa_nomi(conteggi)
    log(f"[PROPRIETARI] nomi ufficiali: {len(conteggi)}, dopo l'unione: {len(set(mappa.values()))}")
    per_giorno: dict[tuple[str, str], set] = defaultdict(set)
    for d, k, p in conn.execute(
            "SELECT data, chiave, proprietario FROM allenatori_corse WHERE proprietario IS NOT NULL"):
        per_giorno[(d, k)].add(mappa.get(p, p))

    aggiornamenti, ambigui, senza = [], 0, 0
    for rid, d, nome, attuale in conn.execute("""
        SELECT id, race_date, horse_name, owner FROM races
        WHERE race_date >= ? AND track != 'ESTERO'""", (PRIMA_DATA,)):
        trovati = per_giorno.get((d, chiave_nome(nome or "")))
        if not trovati:
            senza += 1
            continue
        if len(trovati) > 1:
            ambigui += 1
            continue
        p = next(iter(trovati))
        if p != attuale:
            aggiornamenti.append((p, rid))
    conn.executemany("UPDATE races SET owner = ? WHERE id = ?", aggiornamenti)
    conn.commit()
    tot, con = conn.execute("""SELECT COUNT(*), COUNT(owner) FROM races
                               WHERE race_date >= ? AND track != 'ESTERO'""", (PRIMA_DATA,)).fetchone()
    return {"scritte": len(aggiornamenti), "ambigue": ambigui, "senza": senza,
            "copertura": round(100 * con / tot, 1) if tot else 0, "corse": tot}


def calcola(conn: sqlite3.Connection) -> int:
    conn.execute("DELETE FROM owner_stats")
    recente = (date.today() - timedelta(days=548)).isoformat()   # 18 mesi
    anno = (date.today() - timedelta(days=365)).isoformat()

    conteggi = dict(conn.execute("""SELECT proprietario, COUNT(*) FROM allenatori_corse
                                    WHERE proprietario IS NOT NULL GROUP BY proprietario""").fetchall())
    _, visibili = mappa_nomi(conteggi)

    acc = defaultdict(lambda: {"n": 0, "nr": 0, "v": 0, "t": 0, "pr": 0.0, "pr12": 0.0, "v12": 0,
                               "cav": set(), "cavr": set(), "cav_anno": set(), "prima": None,
                               "ultima": None, "piste": defaultdict(int), "all": defaultdict(int),
                               "guid": defaultdict(int)})
    for o, h, d, tr, dr, t, p, pr in conn.execute("""
        SELECT owner, horse_name, race_date, track, driver, trainer, placement,
               COALESCE(prize_net, 0)
        FROM races WHERE owner IS NOT NULL"""):
        a = acc[o]
        a["n"] += 1
        a["cav"].add(h)
        a["cav_anno"].add((h, d[:4]))
        a["pr"] += pr
        if p == 1: a["v"] += 1
        if p is not None and p <= 3: a["t"] += 1
        if d >= recente:
            a["nr"] += 1
            a["cavr"].add(h)
        if d >= anno:
            a["pr12"] += pr
            if p == 1: a["v12"] += 1
        a["prima"] = d if a["prima"] is None or d < a["prima"] else a["prima"]
        a["ultima"] = d if a["ultima"] is None or d > a["ultima"] else a["ultima"]
        if tr: a["piste"][tr] += 1
        if t: a["all"][t] += 1
        if dr: a["guid"][dr] += 1

    top = lambda dd: max(dd.items(), key=lambda x: x[1])[0] if dd else None  # noqa: E731
    out = []
    for o, a in acc.items():
        if a["n"] < MIN_CORSE_SCHEDA:
            continue
        out.append((
            o, visibili.get(o, nome_visibile(o)), a["n"], a["nr"], len(a["cav"]), len(a["cavr"]),
            a["v"], a["t"], round(100 * a["v"] / a["n"], 2), round(100 * a["t"] / a["n"], 2),
            round(a["pr"], 2), round(a["pr"] / a["n"], 2), round(a["pr12"], 2), a["v12"],
            a["prima"], a["ultima"], top(a["piste"]), top(a["all"]), top(a["guid"]),
            1 if a["nr"] >= 10 else 0,
            round(a["pr"] / len(a["cav_anno"]), 2), len(a["all"]),
        ))
    conn.executemany(f"INSERT INTO owner_stats VALUES ({','.join('?' * 22)})", out)
    conn.commit()
    log(f"[PROPRIETARI] schede: {len(out)}, in attivita': {sum(1 for r in out if r[19])}")
    return len(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    args = ap.parse_args()
    conn = sqlite3.connect(args.db)
    crea_tabelle(conn)
    log("[PROPRIETARI] abbinamento:", abbina(conn))
    calcola(conn)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
