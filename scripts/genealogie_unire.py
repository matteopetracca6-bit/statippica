#!/usr/bin/env python3
"""
genealogie_unire.py — StatIppica (23/11/2026)

PERCHE' ESISTE. Molti stalloni (SUPERGILL, INDRO PARK, SHARIF DI IESOLO,
PARK AVENUE...) avevano l'albero quasi vuoto: l'archivio corse conosce solo i
cavalli che hanno corso in Italia di recente, e la seconda fonte solo i nati in
Italia degli ultimi anni.

COSA FA. La banca dati UNIRE ha per ogni cavallo la scheda con tre
generazioni, compresi gli antenati esteri, e ogni antenato e' un link alla sua
scheda. Per ogni stallone (dal piu' prolifico) si trova la scheda partendo da
un figlio, si leggono le tre generazioni e poi le schede degli otto bisnonni,
che danno la quarta e la quinta. Si cammina per id UNIRE, quindi niente
omonimi lungo il ramo.

Il risultato va in dati/genealogie_unire.csv: una riga per cavallo con padre,
madre e id UNIRE. Il sito lo legge all'avvio e lo usa per riempire l'albero
dove l'archivio non arriva. Il file si allunga a ogni giro: chi e' gia' fatto
si salta.

UNIRE e' un sito istituzionale: una richiesta al secondo (unire_source). Da
lanciare fuori dalle ore dei lavori notturni, che usano la stessa fonte.

Uso:
  python3 scripts/genealogie_unire.py --db data.db [--stalloni 50] [--minuti 300]
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
import time
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unire_source as u  # noqa: E402
from correggi_genealogie_stalloni import trova_id  # noqa: E402

FILE = Path(__file__).resolve().parent.parent / "dati" / "genealogie_unire.csv"
CAMPI = ["nome", "padre", "madre", "id_unire", "id_padre", "id_madre"]
# Ordine dei 14 link della scheda: catena di passi dal cavallo.
ORDINE = ["p", "pp", "pm", "ppp", "ppm", "pmp", "pmm", "m", "mp", "mm", "mpp", "mpm", "mmp", "mmm"]


def leggi() -> dict:
    out = {}
    if FILE.exists():
        with FILE.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter=";"):
                out[r["nome"]] = r
    return out


def scrivi(righe: dict) -> None:
    FILE.parent.mkdir(exist_ok=True)
    with FILE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPI, delimiter=";")
        w.writeheader()
        for k in sorted(righe):
            w.writerow({c: righe[k].get(c, "") for c in CAMPI})


def scheda(id_cav: str) -> tuple[str, dict] | None:
    """Nome del cavallo e i suoi antenati {catena: (nome, id)} dalla scheda."""
    r = u._get(u.UNIRE_LIST, params={"id_cav": id_cav})
    time.sleep(u.UNIRE_DELAY)
    soup = BeautifulSoup(r.text, "html.parser")
    testo = soup.get_text(" ", strip=True)
    if "La scheda" not in testo or "Genealogia" not in testo:
        return None
    nome = u._norm(testo.split("Banca dati Trotto", 1)[1].split("La scheda", 1)[0]) if "Banca dati Trotto" in testo else ""
    link = [(u._norm(a.get_text()), a["href"].split("id_cav=")[-1].strip())
            for a in soup.find_all("a", href=True) if "id_cav=" in a["href"] and a.get_text(strip=True)]
    if len(link) != 14:
        # Albero incompleto nella scheda: senza l'ordine pieno non si sa chi
        # e' chi, quindi la scheda non si usa.
        return nome, {}
    return nome, {c: l for c, l in zip(ORDINE, link)}


def registra(righe: dict, nome: str, id_cav: str, ant: dict, fino: int) -> list[tuple[str, str]]:
    """Scrive padre e madre per il cavallo e per gli antenati entro `fino`
    passi; restituisce i bisnonni (catena di 3 passi) con il loro id."""
    def metti(n, i, cat):
        p, m = ant.get(cat + "p"), ant.get(cat + "m")
        if not p and not m:
            return
        r = righe.get(n, {"nome": n})
        if p and not r.get("padre"):
            r["padre"], r["id_padre"] = p
        if m and not r.get("madre"):
            r["madre"], r["id_madre"] = m
        if i and not r.get("id_unire"):
            r["id_unire"] = i
        righe[n] = r
    metti(nome, id_cav, "")
    for cat in ("p", "m", "pp", "pm", "mp", "mm"):
        if len(cat) < fino and ant.get(cat):
            metti(ant[cat][0], ant[cat][1], cat)
    return [ant[c] for c in ("ppp", "ppm", "pmp", "pmm", "mpp", "mpm", "mmp", "mmm") if ant.get(c)]


def profondita(righe: dict, conn, nome: str, g: int = 0, visti=None) -> int:
    """Quante generazioni complete si conoscono (archivio + file)."""
    if g >= 5 or not nome:
        return g
    r = righe.get(nome)
    h = conn.execute("SELECT sire, dam FROM horses WHERE name = ? AND sire <> '' AND dam <> '' LIMIT 1", (nome,)).fetchone()
    p = (r or {}).get("padre") or (h[0] if h else None)
    m = (r or {}).get("madre") or (h[1] if h else None)
    if not p or not m:
        return g
    return min(profondita(righe, conn, p, g + 1), profondita(righe, conn, m, g + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--stalloni", type=int, default=50)
    ap.add_argument("--minuti", type=float, default=300)
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    righe = leggi()
    fine = time.time() + a.minuti * 60
    stalloni = [r[0] for r in conn.execute(
        "SELECT sire, COUNT(*) k FROM horses WHERE sire IS NOT NULL AND sire <> '' GROUP BY sire ORDER BY k DESC")]
    fatti = saltati = senza_id = 0
    lette: set[str] = set()
    for s in stalloni:
        if fatti >= a.stalloni or time.time() > fine:
            break
        if profondita(righe, conn, s) >= 4:
            saltati += 1
            continue
        try:
            i = (righe.get(s) or {}).get("id_unire") or trova_id(conn, s)
        except u.UnireUnavailable:
            print("[UNIRE] non raggiungibile: mi fermo.")
            break
        except Exception:
            i = None
        if not i:
            senza_id += 1
            continue
        try:
            sc = scheda(i)
            if not sc or not sc[1] or (sc[0] and sc[0] != s):
                continue
            lette.add(i)
            bis = registra(righe, s, i, sc[1], 3)
            for (bn, bi) in bis:
                if time.time() > fine:
                    break
                if not bi or bi in lette:
                    continue
                if profondita(righe, conn, bn) >= 2:
                    continue
                sb = scheda(bi)
                lette.add(bi)
                if sb and sb[1]:
                    registra(righe, bn, bi, sb[1], 2)
        except u.UnireUnavailable:
            print("[UNIRE] non raggiungibile: mi fermo.")
            break
        except Exception as e:
            print(f"[UNIRE] {s}: {e}")
            continue
        fatti += 1
        print(f"[UNIRE] {fatti:4d} {s}: ora {profondita(righe, conn, s)} generazioni complete")
        if fatti % 10 == 0:
            scrivi(righe)
    scrivi(righe)
    print(f"[UNIRE] stalloni completati {fatti}, gia' pieni {saltati}, senza scheda UNIRE {senza_id}; righe nel file {len(righe)}")


if __name__ == "__main__":
    main()
