#!/usr/bin/env python3
"""
cavalli_mancanti.py — StatIppica

Recupera di notte i cavalli che TrottoWeb conosce e il nostro archivio no.

PERCHE'. L'archivio nasce dalle corse: un cavallo entra quando corre (o quando
fa una qualifica). Chi non ha mai corso — per esempio LAGINNI, femmina del
2024 di VICTOR FERM e ZELINDA ROC — restava fuori, e con lui spariva un pezzo
della produzione di stalloni e fattrici (quanti figli hanno, quanti corrono).

COME. TrottoWeb ha una pagina "produzione dello stallone" per eta':
    hProdStalloni.php?stallone=VICTOR FERM&eta_lettera=2
che elenca in una sola richiesta tutti i figli di quell'eta', anche quelli
mai partiti, con sesso, madre e numero di corse. Per ogni coppia
(stallone, eta') la si legge una volta; i nomi che non abbiamo si aggiungono
con padre, madre, sesso e anno di nascita (anno in corso meno eta': nel
trotto l'eta' cambia il 1 gennaio). TrottoWeb copre le eta' da 2 a 14 anni.

  - Chi ha gia' corso entra come "da completare": la fase che colma i buchi
    (phase_backfill_gaps) gli scarica la carriera nelle notti successive.
  - Chi non ha mai corso entra gia' completo; viene ricontrollato a
    rotazione come tutti gli altri.
  - A un cavallo gia' presente senza madre si aggiunge la madre, nient'altro.

QUALI STALLONI. Quelli che nel nostro archivio hanno figli nati entro 4 anni
dall'annata cercata (circa 300-450 per annata), dai piu' prolifici. Si parte
dalle eta' giovani, dove mancano piu' cavalli. Una coppia gia' letta si
rilegge dopo 30 giorni per 2 e 3 anni (i puledri vengono registrati e
battezzati in ritardo), dopo 180 giorni per gli altri.

QUANTO. Al massimo CAVALLI_MANCANTI_MINUTI minuti (30) e
CAVALLI_MANCANTI_RICHIESTE richieste (900) a notte, con una pausa fra una
richiesta e l'altra. Un giro completo (circa 5.000 coppie) richiede una
decina di notti, poi restano solo i ricontrolli.

Uso a mano (prova su una copia):
  DB_PATH=/tmp/prova.db python3 cavalli_mancanti.py --richieste 20
"""

import argparse
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from typing import Optional

import requests
from bs4 import BeautifulSoup

URL_PRODUZIONE = "https://www.trottoweb.it/TrottoWeb/php_resp/hProdStalloni.php"
ETA_MIN, ETA_MAX = 2, 14                 # eta' coperte da TrottoWeb
ANNI_VICINI = 4                          # stalloni con figli entro +-4 anni
GIORNI_RICONTROLLO_GIOVANI = 30          # 2 e 3 anni
GIORNI_RICONTROLLO = 180                 # dai 4 anni in su
PAUSA = float(os.environ.get("CAVALLI_MANCANTI_PAUSA", "0.6"))
MINUTI = float(os.environ.get("CAVALLI_MANCANTI_MINUTI", "30"))
RICHIESTE = int(os.environ.get("CAVALLI_MANCANTI_RICHIESTE", "900"))
ERRORI_DI_FILA = 6                       # poi ci si ferma: il sito non risponde

_SESSIONE = requests.Session()
_SESSIONE.headers.update({
    "User-Agent": "Mozilla/5.0 (StatIppica; archivio statistico del trotto)",
    "Accept-Language": "it-IT,it;q=0.9",
})


def norm(s: Optional[str]) -> Optional[str]:
    """Maiuscolo, spazi uniformi, senza caratteri invisibili."""
    if not s:
        return None
    s = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", str(s))
    s = re.sub(r"\s+", " ", s).strip().upper()
    return s or None


def crea_tabella(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tw_produzione_letta (
            stallone       TEXT NOT NULL,
            anno_nascita   INTEGER NOT NULL,
            letta_il       TEXT NOT NULL,
            figli          INTEGER,
            nuovi          INTEGER,
            PRIMARY KEY (stallone, anno_nascita)
        )""")
    conn.commit()


def leggi_produzione(stallone: str, eta: int) -> Optional[list]:
    """Figli di `stallone` che quest'anno hanno `eta` anni, come li elenca
    TrottoWeb. None se la pagina non risponde (diverso da lista vuota)."""
    try:
        r = _SESSIONE.get(URL_PRODUZIONE, params={"stallone": stallone, "eta_lettera": eta}, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"  [MANCANTI] {stallone} {eta} anni: pagina non raggiungibile ({e})", file=sys.stderr)
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    figli = []
    for td in soup.select("td.cavallo_R"):
        tr = td.find_parent("tr")
        a = td.find("a")
        nome = norm(a.get_text()) if a else None
        if not nome or tr is None:
            continue
        madre = td.select_one("div.madre")
        sesso = tr.select_one("td.sesso")
        corse = tr.select_one("td#prest_c") or tr.select_one("td.corse")
        try:
            n_corse = int((corse.get_text() if corse else "0").strip() or 0)
        except ValueError:
            n_corse = 0
        s = norm(sesso.get_text()) if sesso else None
        figli.append({
            "nome": nome,
            "madre": norm(madre.get_text()) if madre else None,
            "sesso": s if s in ("M", "F", "C") else None,
            "corse": n_corse,
        })
    return figli


def coppie_da_leggere(conn: sqlite3.Connection, anno: int) -> list:
    """(stallone, anno_nascita, eta') ancora da leggere o da rileggere,
    dalle eta' giovani e dagli stalloni con piu' figli."""
    ora = datetime.utcnow()
    lette = {(s, a): l for s, a, l in conn.execute(
        "SELECT stallone, anno_nascita, letta_il FROM tw_produzione_letta")}
    coppie = []
    for eta in range(ETA_MIN, ETA_MAX + 1):
        nascita = anno - eta
        giorni = GIORNI_RICONTROLLO_GIOVANI if eta <= 3 else GIORNI_RICONTROLLO
        limite = (ora - timedelta(days=giorni)).isoformat()
        righe = conn.execute("""
            SELECT sire, COUNT(*) AS n FROM horses
            WHERE sire IS NOT NULL AND TRIM(sire) <> ''
              AND birth_year BETWEEN ? AND ?
            GROUP BY sire ORDER BY n DESC, sire
        """, (nascita - ANNI_VICINI, nascita + ANNI_VICINI)).fetchall()
        for sire, _n in righe:
            s = norm(sire)
            ultima = lette.get((s, nascita))
            if ultima is None or ultima < limite:
                coppie.append((s, nascita, eta, ultima is None))
    # prima le coppie mai lette, poi i ricontrolli; dentro, l'ordine sopra
    coppie.sort(key=lambda c: (not c[3],))
    return [(s, n, e) for s, n, e, _ in coppie]


def aggiungi_figli(conn: sqlite3.Connection, stallone: str, nascita: int, figli: list) -> tuple:
    """Aggiunge i figli che mancano; ritorna (nuovi, madri_aggiunte)."""
    ora = datetime.utcnow().isoformat()
    nuovi = madri = 0
    for f in figli:
        c = conn.execute("SELECT dam FROM horses WHERE name = ?", (f["nome"],)).fetchone()
        if c is not None:
            if not (c[0] or "").strip() and f["madre"]:
                conn.execute("UPDATE horses SET dam = ? WHERE name = ? AND (dam IS NULL OR TRIM(dam) = '')",
                             (f["madre"], f["nome"]))
                madri += 1
            continue
        ha_corso = f["corse"] > 0
        cur = conn.execute("""
            INSERT OR IGNORE INTO horses
                (name, birth_year, sex, sire, dam, source, tw_found, horse_class,
                 source_role, backfill_status, last_backfill_at, last_updated,
                 career_races)
            VALUES (?, ?, ?, ?, ?, 'trottoweb', 1, 'athlete',
                    'tw_produzione', ?, ?, ?, 0)
        """, (f["nome"], nascita, f["sesso"], stallone, f["madre"],
              "pending" if ha_corso else "done", None if ha_corso else ora, ora))
        nuovi += cur.rowcount or 0
    return nuovi, madri


def phase_cavalli_mancanti(conn: sqlite3.Connection, minuti: float = MINUTI,
                           richieste: int = RICHIESTE) -> int:
    """Fase notturna. Ritorna quanti cavalli nuovi ha aggiunto."""
    crea_tabella(conn)
    anno = datetime.utcnow().year
    coppie = coppie_da_leggere(conn, anno)
    print(f"[MANCANTI] Coppie stallone/annata da leggere: {len(coppie)} "
          f"(stanotte al massimo {richieste} in {minuti:.0f} minuti)", file=sys.stderr)
    fine = time.monotonic() + minuti * 60
    fatte = nuovi_tot = madri_tot = errori = 0
    for stallone, nascita, eta in coppie:
        if fatte >= richieste or time.monotonic() > fine:
            break
        figli = leggi_produzione(stallone, eta)
        fatte += 1
        time.sleep(PAUSA)
        if figli is None:
            errori += 1
            if errori >= ERRORI_DI_FILA:
                print("[MANCANTI] TrottoWeb non risponde: mi fermo e riprendo la prossima notte.", file=sys.stderr)
                break
            continue
        errori = 0
        nuovi, madri = aggiungi_figli(conn, stallone, nascita, figli)
        conn.execute("""
            INSERT INTO tw_produzione_letta (stallone, anno_nascita, letta_il, figli, nuovi)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(stallone, anno_nascita) DO UPDATE SET
                letta_il = excluded.letta_il, figli = excluded.figli,
                nuovi = COALESCE(tw_produzione_letta.nuovi, 0) + excluded.nuovi
        """, (stallone, nascita, datetime.utcnow().isoformat(), len(figli), nuovi))
        conn.commit()
        nuovi_tot += nuovi
        madri_tot += madri
        if nuovi:
            print(f"  [MANCANTI] {stallone}, nati {nascita}: {len(figli)} figli, {nuovi} nuovi", file=sys.stderr)
    rimaste = max(0, len(coppie) - fatte)
    print(f"[MANCANTI] Lette {fatte} pagine: {nuovi_tot} cavalli nuovi, {madri_tot} madri aggiunte; "
          f"restano {rimaste} coppie per le prossime notti.", file=sys.stderr)
    return nuovi_tot


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Recupera da TrottoWeb i cavalli che mancano all'archivio.")
    ap.add_argument("--richieste", type=int, default=RICHIESTE)
    ap.add_argument("--minuti", type=float, default=MINUTI)
    a = ap.parse_args()
    db = os.environ.get("DB_PATH", "data.db")
    con = sqlite3.connect(db, timeout=60)
    try:
        phase_cavalli_mancanti(con, minuti=a.minuti, richieste=a.richieste)
    finally:
        con.close()
