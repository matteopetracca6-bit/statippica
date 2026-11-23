#!/usr/bin/env python3
"""
carriere_mondiali.py — StatIppica (23/11/2026)

PERCHE' ESISTE. I campioni storici italiani hanno i totali del registro UNIRE,
che conta solo le corse in Italia: VARENNE risultava con 46 corse e
2.344.173 euro, mentre la sua carriera in tutto il mondo e' di 73 corse, 62
vittorie e 6.035.666 euro (Prix d'Amerique, Elitloppet, Breeders Crown). Gli
stalloni esteri con la carriera completa (carriere_complete.py) avevano invece
i totali mondiali: la classifica storica metteva a confronto cose diverse.

COSA FA. Costruisce la tabella carriere_mondiali con i totali di tutta la
carriera dei cavalli storici che non sono gia' fra le carriere complete:
  - dalle schede di Wikipedia lette ogni notte da totali_mondiali.py
    (totali_mondiali.json: stesso anno di nascita e stesso padre);
  - dalla scheda ufficiale francese LeTrot (dati/totali_letrot.json,
    scripts/totali_letrot.py), per chi ha corso in Francia e non e' su
    Wikipedia: i guadagni di LeTrot sono quelli di tutta la carriera, le corse
    sono quelle italiane piu' quelle francesi (le altre non si sanno: lo si
    segna).
Si tiene solo se la carriera mondiale ha almeno le corse e le vittorie gia'
contate in Italia. I guadagni in corone o dollari si convertono in euro al
cambio medio annuo BCE dei 2-7 anni del cavallo (dati/cambi_bce.json; prima
del 1999 il cambio del 1999), come per le carriere complete.

I totali italiani restano nella scheda (horses): la classifica storica li
mostra nella vista "solo in Italia", e il voto storico usa quelli mondiali.

Uso: python3 scripts/carriere_mondiali.py --db data.db
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
TM = RADICE / "totali_mondiali.json"
LT = RADICE / "dati" / "totali_letrot.json"
CAMBI = RADICE / "dati" / "cambi_bce.json"


def cambio(cambi: dict, valuta: str, anno: int | None):
    if valuta == "EUR":
        return 1.0
    tab = cambi.get(valuta) or {}
    if not tab or not anno:
        return None
    anni = [max(1999, a) for a in range(anno + 2, anno + 8)]
    v = [tab.get(str(a)) for a in anni if tab.get(str(a))]
    return round(sum(v) / len(v), 4) if v else None


def record_km(r):
    """"1.09.1" -> 1'09"1 (gia' al km nelle fonti europee)."""
    m = re.match(r"^\s*(\d)[.:'](\d\d)[.\"](\d)\s*$", str(r or ""))
    return f"{m.group(1)}'{m.group(2)}\"{m.group(3)}" if m else None


def costruisci(conn: sqlite3.Connection) -> dict:
    conn.execute("DROP TABLE IF EXISTS carriere_mondiali")
    conn.execute("""CREATE TABLE carriere_mondiali (nome TEXT PRIMARY KEY, anno INTEGER, corse INTEGER, vittorie INTEGER,
                    guadagni_eur REAL, record TEXT, fonte TEXT, url TEXT, valuta_originale TEXT, importo_originale REAL,
                    cambio REAL, corse_solo_italia_francia INTEGER)""")
    esito = {"wikipedia": 0, "letrot": 0, "scartati": 0}
    cambi = json.loads(CAMBI.read_text()) if CAMBI.exists() else {}
    complete = set()
    try:
        complete = {n for (n,) in conn.execute("SELECT nome FROM carriere_complete")}
    except sqlite3.Error:
        pass
    italia = {(n, y): (c or 0, v or 0, e or 0) for n, y, c, v, e in conn.execute(
        "SELECT name, birth_year, career_races, career_wins, career_earnings FROM horses WHERE horse_class = 'breeder'")}

    def metti(nome, anno, corse, vitt, eur, rec, fonte, url, valuta, importo, cb, parz):
        it = italia.get((nome, anno))
        if not it or nome in complete:
            return False
        if corse < it[0] or vitt < it[1] or eur < it[2] * 0.98 or corse <= 0:
            esito["scartati"] += 1
            return False
        conn.execute("INSERT OR REPLACE INTO carriere_mondiali VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                     (nome, anno, corse, vitt, round(eur), rec, fonte, url, valuta, importo, cb, parz))
        return True

    if TM.exists():
        for v in json.loads(TM.read_text()).get("cavalli", {}).values():
            if v.get("esito") != "trovato" or not v.get("corse") or v.get("vittorie") is None or not v.get("guadagni"):
                continue
            g = v["guadagni"]
            cb = cambio(cambi, g.get("valuta"), v.get("anno"))
            if cb is None:
                esito["scartati"] += 1
                continue
            fonti = v.get("fonti") or []
            url = fonti[0]["url"] if fonti else None
            if metti(v["nome"], v["anno"], int(v["corse"]), int(v["vittorie"]), float(g["importo"]) / cb,
                     record_km(v.get("record")), "Wikipedia (" + ", ".join(f["wiki"] for f in fonti) + ")", url,
                     g.get("valuta"), float(g["importo"]), cb, 0):
                esito["wikipedia"] += 1
    if LT.exists():
        gia = {n for (n,) in conn.execute("SELECT nome FROM carriere_mondiali")}
        for v in json.loads(LT.read_text()).get("cavalli", {}).values():
            if v.get("esito") != "trovato" or v["nome"] in gia:
                continue
            it = italia.get((v["nome"], v["anno"]))
            if not it:
                continue
            corse = it[0] + int(v.get("corse_francia") or 0)
            vitt = it[1] + int(v.get("vittorie_francia") or 0)
            if metti(v["nome"], v["anno"], corse, vitt, float(v["guadagni_totali"]), record_km(v.get("record")),
                     "LeTrot (guadagni di tutta la carriera; corse: Italia + Francia)", v.get("url"), "EUR",
                     float(v["guadagni_totali"]), 1.0, 1):
                esito["letrot"] += 1
    conn.commit()
    print(f"[CARRIERE MONDIALI] {esito}", file=sys.stderr)
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    costruisci(sqlite3.connect(ap.parse_args().db))
