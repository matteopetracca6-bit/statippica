"""
quote_totalizzatore.py — Le quote finali del totalizzatore per ogni cavallo.

PERCHE' SERVE
  Il pronostico dice "40% di arrivare nei primi tre". Da solo questo numero
  non dice se il modello e' bravo: bisogna confrontarlo con chi conosce le
  corse meglio di tutti, cioe' il pubblico che gioca. La quota finale del
  totalizzatore riassume cosa pensavano tutti gli scommettitori insieme.
  Il confronto e' un'analisi: non e' un consiglio di gioco.

DA DOVE
  Hippoweb (hippoweb.it), archivio dei risultati di trotto, dal 1/1/2025.
  Per ogni corsa la pagina scrive, accanto a ogni cavallo, la "quota
  eventuale" vincente: quanto avrebbe pagato 1 euro giocato vincente su quel
  cavallo. Scrive anche allenatore e proprietario, che si salvano gia' ora.

  1 elenco delle giornate  risultati.php?mode=ultimi20gg&t=T&start=0,20,...
  2 corse della giornata   risultati.php?mode=giornata&t=T&p=MG&d=<unix>
  3 pagina della corsa     risultati.php?mode=corsa&t=T&p=MG&d=<unix>&n=<id>

USO
  python3 scripts/quote_totalizzatore.py [percorso.db] [--tutto]
    senza --tutto legge solo le giornate degli ultimi 5 giorni; con --tutto
    tutto l'archivio, saltando le giornate gia' lette.
  Nel lavoro notturno (phase_quote_totalizzatore): le giornate recenti piu'
  al massimo 150 vecchie per notte, finche' l'archivio e' completo.
"""
from __future__ import annotations

import re
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup

BASE = "https://www.hippoweb.it/risultati.php"
TESTA = {"User-Agent": "Mozilla/5.0 (StatIppica; ricerca universitaria)"}


def _leggi(params: dict, tentativi: int = 3) -> BeautifulSoup | None:
    for i in range(tentativi):
        try:
            r = requests.get(BASE, params=params, headers=TESTA, timeout=40)
            if r.status_code == 200 and len(r.text) > 2000:
                return BeautifulSoup(r.text, "html.parser")
        except requests.RequestException:
            pass
        time.sleep(2 + 3 * i)
    return None


def crea_tabelle(conn: sqlite3.Connection) -> None:
    conn.execute("""CREATE TABLE IF NOT EXISTS quote_totalizzatore (
        race_date TEXT NOT NULL,     -- 2026-10-17
        pista TEXT NOT NULL,         -- MONTEGIORGIO (come in races.track)
        corsa INTEGER NOT NULL,      -- 1 = prima corsa della giornata
        horse_name TEXT NOT NULL,    -- scritto come nell'archivio
        numero INTEGER,              -- numero di partenza (sottosella)
        arrivo TEXT,                 -- 1, 2, ... oppure RP, RC, SQ ...
        quota REAL,                  -- quota vincente finale; NULL se non c'e'
        allenatore TEXT,
        proprietario TEXT,
        accoppiato INTEGER,          -- 1 = corre in "rapporto di scuderia"
        PRIMARY KEY (race_date, pista, corsa, horse_name))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS quote_giornate_lette (
        race_date TEXT NOT NULL, sigla TEXT NOT NULL, corse INTEGER, letta_il TEXT,
        PRIMARY KEY (race_date, sigla))""")
    conn.commit()


def nome_archivio(nome: str) -> str:
    """Hippoweb scrive la nazione cosi' "NINA CITRUS -DK-", l'archivio "(DK)"."""
    nome = re.sub(r"\s+", " ", nome.strip().upper())
    return re.sub(r"\s-([A-Z]{2,3})-$", r" (\1)", nome)


def _numero(testo: str) -> float | None:
    testo = testo.strip().replace(".", "").replace(",", ".")
    try:
        v = float(testo)
        return v if v > 0 else None
    except ValueError:
        return None


def giornate(pagine: int | None = None, fino_a: str | None = None) -> list[dict]:
    """Elenco delle giornate dell'archivio, dalla piu' recente."""
    trovate, start = [], 0
    while True:
        s = _leggi({"mode": "ultimi20gg", "t": "T", "p": "", "a": 1, "start": start})
        if s is None:
            break
        righe = 0
        for item in s.select("div.list-group-item"):
            d = item.find(attrs={"data-label": "Data"})
            a = item.select_one('[data-label="Ippodromo"] a')
            if not d or not a:
                continue
            m = re.search(r"p=([A-Z]+)&(?:amp;)?d=(\d+)", a.get("href", ""))
            data = datetime.strptime(d.get_text(strip=True), "%d/%m/%Y").strftime("%Y-%m-%d")
            if m:
                trovate.append({"data": data, "sigla": m.group(1), "unix": m.group(2),
                                "pista": a.get_text(strip=True).upper()})
                righe += 1
        if not righe:
            break
        start += 20
        if pagine and start >= 20 * pagine:
            break
        if fino_a and trovate and trovate[-1]["data"] < fino_a:
            break
    return trovate


def corse_della_giornata(g: dict) -> list[str]:
    s = _leggi({"mode": "giornata", "t": "T", "p": g["sigla"], "d": g["unix"], "a": 1})
    if s is None:
        return []
    ids = []
    for a in s.find_all("a", href=True):
        m = re.search(r"mode=corsa&(?:amp;)?t=T&(?:amp;)?p=[A-Z]+&(?:amp;)?d=\d+&(?:amp;)?n=(\d+)", a["href"])
        if m and m.group(1) not in ids:
            ids.append(m.group(1))
    return ids


def leggi_corsa(g: dict, n: str) -> tuple[int | None, list[dict]]:
    s = _leggi({"mode": "corsa", "t": "T", "p": g["sigla"], "d": g["unix"], "n": n, "a": 1})
    if s is None:
        return None, []
    titolo = s.find("h4", string=re.compile(r"Corsa \d+ di"))
    if titolo is None:
        titolo = next((h for h in s.find_all("h4") if re.match(r"\s*Corsa \d+ di", h.get_text())), None)
    m = re.match(r"\s*Corsa (\d+)", titolo.get_text()) if titolo else None
    if not m:
        return None, []
    corsa = int(m.group(1))
    righe = []
    for item in s.select("div.list-group-item"):
        if "list-group-item-head" in (item.get("class") or []):
            continue
        h4 = item.find("h4")
        nome_a = item.find("a", title=re.compile(r"^prestazioni di "))
        if not h4 or not nome_a:
            continue
        sotto = h4.find("small")
        numero = int(sotto.get_text(strip=True)) if sotto and sotto.get_text(strip=True).isdigit() else None
        if sotto:
            sotto.extract()
        arrivo = h4.get_text(strip=True)
        nome = nome_a.find("span").get_text(strip=True) if nome_a.find("span") else nome_a.get_text(strip=True)
        q = item.find("span", title="quota eventuale")
        al = item.find("span", title="allenatore")
        pr = item.find("span", title="proprietario")
        # Cavalli dello stesso proprietario possono correre accoppiati: si
        # gioca la coppia, e la quota e' la stessa per tutti e due.
        acc = item.find("span", title="rapporto di scuderia")
        righe.append({"corsa": corsa, "horse_name": nome_archivio(nome), "numero": numero,
                      "arrivo": arrivo, "quota": _numero(q.get_text()) if q else None,
                      "allenatore": al.get_text(strip=True) if al else None,
                      "proprietario": pr.get_text(strip=True) if pr else None,
                      "accoppiato": 1 if acc else 0})
    return corsa, righe


# Hippoweb chiama alcune piste in modo diverso dall'archivio.
NOMI_PISTE = {
    "SS.COSMA-DAMIANO": "GARIGLIANO",
    "FOGGIA": "CASTELLUCCIO",          # ippodromo di Castelluccio dei Sauri
    "VILLANOVA D'ALBENGA": "VILLANOVA",
    "CASTELLUCCIO DEI SAURI": "CASTELLUCCIO",
    "TRIESTE-MONTEBELLO": "TRIESTE",
    "MONTEBELLO": "TRIESTE",
}


def nome_pista(pista: str) -> str:
    return NOMI_PISTE.get(pista.upper().strip(), pista.upper().strip())


def _pista_archivio(conn: sqlite3.Connection, g: dict) -> str:
    """Il nome della pista com'e' scritto in races (ROMA, MONTEGIORGIO...)."""
    return nome_pista(g["pista"])


def leggi_giornata(g: dict) -> list[dict]:
    righe = []
    for n in corse_della_giornata(g):
        _, rr = leggi_corsa(g, n)
        righe.extend(rr)
        time.sleep(0.15)
    return righe


def raccogli(conn: sqlite3.Connection, tutto: bool = False, giorni: int = 5,
             fili: int = 4, arretrati: int | None = None) -> int:
    """Legge le giornate che mancano. `arretrati`: quante giornate vecchie
    (oltre a quelle recenti) leggere al massimo; None = tutte."""
    crea_tabelle(conn)
    for vecchio, nuovo in NOMI_PISTE.items():
        conn.execute("UPDATE OR IGNORE quote_totalizzatore SET pista = ? WHERE pista = ?", (nuovo, vecchio))
    if tutto:
        elenco = giornate()
    else:
        limite = (datetime.now() - timedelta(days=giorni)).strftime("%Y-%m-%d")
        elenco = [g for g in giornate(pagine=3, fino_a=limite) if g["data"] >= limite]
    lette = {(d, s) for d, s in conn.execute("SELECT race_date, sigla FROM quote_giornate_lette")}
    oggi = datetime.now().strftime("%Y-%m-%d")
    # Le giornate gia' lette si saltano; quelle di oggi e di ieri si rileggono
    # (i risultati possono arrivare in ritardo).
    ieri = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    recenti = [g for g in elenco if g["data"] >= ieri]
    vecchie = [g for g in elenco if g["data"] < ieri and (g["data"], g["sigla"]) not in lette]
    if arretrati is not None:
        vecchie = vecchie[:arretrati]
    da_fare = recenti + vecchie
    print(f"[QUOTE] giornate in elenco {len(elenco)}, da leggere {len(da_fare)}", file=sys.stderr)
    salvate = 0
    with ThreadPoolExecutor(max_workers=fili) as ex:
        for i, (g, righe) in enumerate(zip(da_fare, ex.map(leggi_giornata, da_fare))):
            pista = _pista_archivio(conn, g)
            for r in righe:
                conn.execute("""INSERT INTO quote_totalizzatore
                    (race_date, pista, corsa, horse_name, numero, arrivo, quota, allenatore,
                     proprietario, accoppiato)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(race_date, pista, corsa, horse_name) DO UPDATE SET
                      numero=excluded.numero, arrivo=excluded.arrivo, quota=excluded.quota,
                      allenatore=excluded.allenatore, proprietario=excluded.proprietario,
                      accoppiato=excluded.accoppiato""",
                    (g["data"], pista, r["corsa"], r["horse_name"], r["numero"], r["arrivo"],
                     r["quota"], r["allenatore"], r["proprietario"], r["accoppiato"]))
            if righe:
                conn.execute("""INSERT OR REPLACE INTO quote_giornate_lette VALUES (?,?,?,?)""",
                             (g["data"], g["sigla"], len({r["corsa"] for r in righe}), oggi))
            salvate += len(righe)
            if i % 20 == 0:
                conn.commit()
                print(f"  {i+1}/{len(da_fare)} {g['data']} {g['pista']}: {len(righe)} cavalli",
                      file=sys.stderr)
    conn.commit()
    print(f"[QUOTE] {salvate} righe salvate", file=sys.stderr)
    return salvate


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    percorso = args[0] if args else "data.db"
    c = sqlite3.connect(percorso, timeout=60)
    raccogli(c, tutto="--tutto" in sys.argv)


def phase_quote_totalizzatore(conn: sqlite3.Connection, arretrati: int = 150) -> int:
    """Fase del lavoro notturno. Non lo fa mai fallire."""
    try:
        return raccogli(conn, tutto=True, arretrati=arretrati)
    except Exception as e:  # noqa: BLE001
        print(f"[QUOTE] saltato: {e}", file=sys.stderr)
        return 0
