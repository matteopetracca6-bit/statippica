#!/usr/bin/env python3
"""
totali_letrot.py — StatIppica (23/11/2026)

Per i campioni storici che hanno corso anche in Francia e che non sono su
Wikipedia (totali_mondiali.py), legge la scheda ufficiale francese LeTrot:
corse, vittorie e piazzamenti in Francia, guadagni e record. Si accetta la
scheda solo se anno di nascita e padre coincidono con l'archivio.

Prova su VARENNE (23/11/2026): LeTrot da' 8 corse in Francia con 7
vittorie e 4.561.388 euro di guadagni, cioe' Italia piu' Francia (il registro
italiano ne conta 2.344.173): NON e' il totale mondiale (6.035.666 con
Elitloppet e Breeders Crown). Per questo carriere_mondiali.py somma le corse
italiane e quelle francesi e prende questi guadagni, e lo segna come
"Italia + Francia".

Scrive dati/totali_letrot.json (si riprende dal punto in cui si era fermato).
Scrive anche dati/cambi_bce.json con i cambi medi annui BCE.

Uso: python3 scripts/totali_letrot.py --db data.db [--minuti 90]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sqlite3
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path

import requests

RADICE = Path(__file__).resolve().parent.parent
FILE = RADICE / "dati" / "totali_letrot.json"
CAMBI = RADICE / "dati" / "cambi_bce.json"
TM = RADICE / "totali_mondiali.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9"})


def norm(x: str) -> str:
    x = unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", x)


def slug(nome: str) -> str:
    x = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", x).strip("-")


def cambi_bce() -> None:
    out = {}
    for v in ("SEK", "USD", "NOK", "DKK", "CAD"):
        try:
            t = S.get(f"https://data-api.ecb.europa.eu/service/data/EXR/A.{v}.EUR.SP00.A?format=csvdata", timeout=30).text
        except Exception:
            continue
        anni = {}
        for l in t.splitlines()[1:]:
            c = l.split(",")
            if len(c) > 7 and re.fullmatch(r"\d{4}", c[6] or ""):
                try:
                    anni[c[6]] = float(c[7])
                except ValueError:
                    pass
        if anni:
            out[v] = anni
    if out:
        CAMBI.write_text(json.dumps(out, indent=1, sort_keys=True))
        print(f"[LETROT] cambi BCE: {', '.join(f'{k} {min(v)}-{max(v)}' for k, v in out.items())}")


def leggi_scheda(nome: str, anno: int, padre: str | None) -> dict:
    r = S.get(f"https://www.letrot.com/v1/api/search/horse/{requests.utils.quote(nome)}", timeout=20)
    if r.status_code == 403:
        raise PermissionError("403")
    try:
        items = (r.json().get("horse") or {}).get("items") or []
    except Exception:
        items = []
    it = next((i for i in items if i.get("ANNEE_NAISSANCE") == anno and norm(i.get("horseName", "").split("[")[0]) == norm(nome)), None)
    if not it:
        return {"esito": "non_trovato"}
    time.sleep(3)
    url = f"https://www.letrot.com/stats/chevaux/{slug(nome)}/{it['id']}/courses"
    p = S.get(url, timeout=20)
    if p.status_code == 403:
        raise PermissionError("403")
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p.text)))
    g = re.search(r"Gains Totaux\s+(\d+)", t)
    f = re.search(r"Total courses France Victoires (\d+) 3 premiers (\d+) 5 premiers (\d+) Total courses (\d+)", t)
    pa = re.search(r"Père\s+(.+?)\s+Mère\s+(.+?)\s+Entraineur", t)
    rec = re.search(r"Record absolu\s+(\d)'(\d\d)''(\d)", t)
    if not g or not f:
        return {"esito": "scheda_illeggibile", "url": url}
    if padre and pa and norm(pa.group(1)) != norm(padre):
        return {"esito": "padre_diverso", "url": url, "padre_letrot": pa.group(1)}
    return {"esito": "trovato", "url": url, "guadagni_totali": int(g.group(1)),
            "vittorie_francia": int(f.group(1)), "primi_tre_francia": int(f.group(2)), "corse_francia": int(f.group(4)),
            "record": f"{rec.group(1)}.{rec.group(2)}.{rec.group(3)}" if rec else None,
            "padre": pa.group(1) if pa else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--minuti", type=float, default=90)
    a = ap.parse_args()
    cambi_bce()
    conn = sqlite3.connect(a.db)
    dati = json.loads(FILE.read_text()) if FILE.exists() else {"spiegazione": __doc__.strip().split("\n\n")[1], "cavalli": {}}
    wiki = set()
    if TM.exists():
        wiki = {k for k, v in json.loads(TM.read_text()).get("cavalli", {}).items() if v.get("esito") == "trovato"}
    try:
        complete = {n for (n,) in conn.execute("SELECT nome FROM carriere_complete")}
    except sqlite3.Error:
        complete = set()
    # I campioni storici: i 1.000 storici con piu' guadagni in Italia.
    righe = conn.execute("""SELECT name, birth_year, sire FROM horses
                            WHERE horse_class = 'breeder' AND career_races > 0 AND birth_year IS NOT NULL
                            ORDER BY career_earnings DESC LIMIT 1000""").fetchall()
    fine = time.time() + a.minuti * 60
    fatti = rifiuti = 0
    oggi = date.today().isoformat()
    try:
        S.get("https://www.letrot.com/", timeout=20)
    except Exception:
        pass
    for nome, anno, padre in righe:
        k = f"{nome}|{anno}"
        if k in wiki or nome in complete or k in dati["cavalli"]:
            continue
        if time.time() > fine:
            break
        try:
            e = leggi_scheda(re.sub(r"\s*\(\d{4}\)$", "", nome), anno, padre)
            rifiuti = 0
        except PermissionError:
            rifiuti += 1
            print(f"[LETROT] rifiuto della fonte ({rifiuti})")
            if rifiuti >= 3:
                print("[LETROT] la fonte rifiuta: mi fermo e riprendo la prossima volta.")
                break
            time.sleep(60)
            continue
        except Exception as ex:
            e = {"esito": "errore", "errore": str(ex)[:120]}
        e.update(nome=nome, anno=anno, letto_il=oggi)
        dati["cavalli"][k] = e
        fatti += 1
        if fatti % 20 == 0:
            FILE.write_text(json.dumps(dati, ensure_ascii=False, indent=1, sort_keys=True))
            print(f"[LETROT] {fatti} schede lette")
        time.sleep(3)
    FILE.write_text(json.dumps(dati, ensure_ascii=False, indent=1, sort_keys=True))
    from collections import Counter
    print(f"[LETROT] lette {fatti}; in tutto: {dict(Counter(v['esito'] for v in dati['cavalli'].values()))}")


if __name__ == "__main__":
    main()
