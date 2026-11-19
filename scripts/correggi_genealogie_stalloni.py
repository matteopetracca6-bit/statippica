#!/usr/bin/env python3
"""
correggi_genealogie_stalloni.py — StatIppica

PERCHE' ESISTE. In `stallion_pedigree` alcune righe non vengono da una banca
dati ufficiale ma da ricerche sul web o da inserimenti a mano (colonna
`source`: "Web search", "Wikipedia", "Manual"...). Alcune erano sbagliate:
FILIPP ROC risultava figlio di VARENNE, mentre il registro ufficiale dice
URONOMETRO e ROSELL ROC; lo stesso per FATHER PATRICK, DONATO HANOVER,
PINE CHIP, WISHING STONE, GANYMEDE e altri.

COSA FA. Per ogni riga non verificata cerca il cavallo nella banca dati
ufficiale UNIRE del trotto (la stessa usata dal notturno per i genitori),
legge padre, madre e i quattro nonni dalla scheda e li SOSTITUISCE, segnando
la riga come source='UNIRE'. Una volta corretta, la riga non viene piu'
toccata: il lavoro costa qualche secondo a notte.

Se UNIRE non ha il cavallo (succede per qualche stallone estero) ma l'archivio
corse ha gia' padre e madre ufficiali, e la riga web li contraddice, la riga
viene allineata all'archivio e i nonni non confermati vengono svuotati:
meglio una casella vuota che un nonno inventato.

Uso:
  python3 scripts/correggi_genealogie_stalloni.py            # corregge
  python3 scripts/correggi_genealogie_stalloni.py --prova    # mostra soltanto
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Optional

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import unire_source as u  # noqa: E402

FONTI_UFFICIALI = ("", "UNIRE", "ANACT", "Trottoweb")

# Stalloni esteri che UNIRE non ha, controllati a mano su una fonte
# ufficiale o di stud book. Ogni voce dice da dove viene. Le caselle che la
# fonte non riporta restano vuote (None), non si indovinano.
VERIFICATE_A_MANO = {
    # La vecchia riga diceva DONERAIL: sbagliato.
    "SJ'S PHOTO": dict(
        sire="PHOTO MAKER", dam="SASSY JANE",
        sire_sire="YANKEE BAMBINO", sire_dam=None,
        dam_sire="KAWARTHA MON AMI", dam_dam=None,
        fonte="Verificata: USTA (trav.dk/media/1661/sjsphotoafkomus.pdf), Standardbred Canada"),
    # La vecchia riga era giusta ma senza nonni.
    "INDY DE VIVE": dict(
        sire="VIKING'S WAY", dam="TEKIFLORE",
        sire_sire="MICKEY VIKING", sire_dam="JOSUBIE",
        dam_sire="KEPI VERT", dam_dam="MORGAFLORE",
        fonte="Verificata: province-courses.fr/fiche_etalon.php?id=96067432C"),
}


def _n(s: Optional[str]) -> Optional[str]:
    s = re.sub(r"\s+", " ", (s or "").strip()).upper()
    return s or None


def genealogia_da_scheda(id_cav: str) -> Optional[dict]:
    """Padre, madre e quattro nonni dalla scheda UNIRE del cavallo."""
    resp = u._get(u.UNIRE_LIST, params={"id_cav": id_cav})
    time.sleep(u.UNIRE_DELAY)
    soup = BeautifulSoup(resp.text, "html.parser")
    titolo = soup.find(string=lambda t: t and "Genealogia" in t)
    if not titolo:
        return None
    tab = titolo.find_parent().find_next("table", class_="tableholder")
    if not tab:
        return None
    out: dict = {}
    for etichetta, chiave in (("Stallone", "sire"), ("Fattrice", "dam")):
        cella = tab.find(lambda t: t.name == "td" and t.get("width") == "150"
                         and t.get_text(" ", strip=True).startswith(etichetta))
        if not cella:
            return None
        riga = cella.find_parent("tr")
        nomi = [_n(a.get_text()) for a in riga.find_all("a")]
        if len(nomi) < 3:
            return None
        out[chiave] = nomi[0]
        out[f"{chiave}_sire"] = nomi[1]
        out[f"{chiave}_dam"] = nomi[2]
    return out


def trova_id(conn: sqlite3.Connection, nome: str) -> Optional[str]:
    """L'id UNIRE dello stallone, raggiunto da un suo figlio: la ricerca UNIRE
    vuole nome, sesso e anno, e degli stalloni l'anno spesso non c'e'."""
    figli = conn.execute("""
        SELECT name, sex, birth_year FROM horses
        WHERE sire = ? AND birth_year IS NOT NULL AND COALESCE(TRIM(sex), '') <> ''
          AND birth_year <= 2023
        ORDER BY birth_year ASC LIMIT 3
    """, (nome,)).fetchall()
    for f in figli:
        try:
            ids = u.find_parent_ids(*f)
        except u.UnireUnavailable:
            raise
        except Exception:
            ids = None
        if ids and ids.get("sire") and ids["sire"][0] == nome and ids["sire"][1]:
            return ids["sire"][1]
    proprio = conn.execute("SELECT sex, birth_year FROM horses WHERE name = ? AND birth_year IS NOT NULL",
                           (nome,)).fetchone()
    if proprio:
        try:
            r = u.SESSION.post(u.UNIRE_LIST, data={"name": nome, "sex": proprio[0] or "M",
                                                   "year": str(proprio[1])}, timeout=30)
            time.sleep(u.UNIRE_DELAY)
            soup = BeautifulSoup(r.text, "html.parser")
            for tr in soup.find_all("tr"):
                tds = tr.find_all("td")
                if tds and _n(tds[0].get_text()) == nome:
                    a = tds[0].find("a", href=True)
                    if a and "id_cav=" in a["href"]:
                        return a["href"].split("id_cav=")[-1].strip()
        except Exception:
            pass
    return None


def correggi(conn: sqlite3.Connection, prova: bool = False) -> int:
    """Corregge le righe non verificate. Usata anche dal notturno, sulla sua
    stessa connessione all'archivio."""
    a = argparse.Namespace(prova=prova)
    righe = conn.execute(f"""
        SELECT p.name, p.sire, p.dam, p.sire_sire, p.sire_dam, p.dam_sire, p.dam_dam, p.source,
               h.sire, h.dam
        FROM stallion_pedigree p LEFT JOIN horses h ON h.name = p.name
        WHERE COALESCE(p.source, '') NOT IN ({",".join("?" * len(FONTI_UFFICIALI))})
          AND COALESCE(p.source, '') NOT LIKE 'Verificata:%'
          AND COALESCE(p.source, '') <> 'Archivio corse'
        ORDER BY p.name
    """, FONTI_UFFICIALI).fetchall()
    print(f"[GENEALOGIE] righe non verificate: {len(righe)}", file=sys.stderr)

    corrette = allineate = invariate = 0
    for (nome, ps, pd, pss, psd, pds, pdd, fonte, hs, hd) in righe:
        vecchio = dict(sire=ps, dam=pd, sire_sire=pss, sire_dam=psd, dam_sire=pds, dam_dam=pdd)
        nuovo = None
        if nome in VERIFICATE_A_MANO:
            v = VERIFICATE_A_MANO[nome]
            print(f"  {nome} ({fonte}) -> verificata a mano: {v['sire']} x {v['dam']} ({v['fonte']})",
                  file=sys.stderr)
            if not a.prova:
                conn.execute("""
                    UPDATE stallion_pedigree SET sire=?, dam=?, sire_sire=?, sire_dam=?,
                           dam_sire=?, dam_dam=?, source=?, updated_at=datetime('now')
                    WHERE name=?""", (v["sire"], v["dam"], v["sire_sire"], v["sire_dam"],
                                      v["dam_sire"], v["dam_dam"], v["fonte"], nome))
                conn.execute("""UPDATE horses SET sire = COALESCE(NULLIF(TRIM(sire), ''), ?),
                                                  dam  = COALESCE(NULLIF(TRIM(dam), ''), ?)
                                WHERE name = ?""", (v["sire"], v["dam"], nome))
            corrette += 1
            continue
        try:
            cid = trova_id(conn, nome)
            if cid:
                nuovo = genealogia_da_scheda(cid)
        except u.UnireUnavailable as e:
            print(f"[GENEALOGIE] UNIRE non raggiungibile ({e}): riprovo la prossima notte.",
                  file=sys.stderr)
            break

        if nuovo:
            cambi = [k for k in vecchio if _n(vecchio[k]) != nuovo[k]]
            print(f"  {nome} ({fonte}) -> UNIRE: " +
                  (", ".join(f"{k} {vecchio[k] or '—'} => {nuovo[k]}" for k in cambi) or "gia' giusta"),
                  file=sys.stderr)
            if not a.prova:
                conn.execute("""
                    UPDATE stallion_pedigree SET sire=?, dam=?, sire_sire=?, sire_dam=?,
                           dam_sire=?, dam_dam=?, source='UNIRE', updated_at=datetime('now')
                    WHERE name=?""", (nuovo["sire"], nuovo["dam"], nuovo["sire_sire"], nuovo["sire_dam"],
                                      nuovo["dam_sire"], nuovo["dam_dam"], nome))
                # Nell'archivio corse lo stallone a volte c'e' senza genitori
                # (scheda da "riproduttore"): li si completa, senza toccare
                # quelli gia' presenti.
                conn.execute("""UPDATE horses SET sire = COALESCE(NULLIF(TRIM(sire), ''), ?),
                                                  dam  = COALESCE(NULLIF(TRIM(dam), ''), ?)
                                WHERE name = ?""", (nuovo["sire"], nuovo["dam"], nome))
            corrette += 1
        elif hs and _n(hs) != _n(ps):
            print(f"  {nome} ({fonte}) -> non trovato su UNIRE; l'archivio corse dice "
                  f"{hs} x {hd or '—'}, la riga diceva {ps} x {pd or '—'}: allineo e svuoto i nonni",
                  file=sys.stderr)
            if not a.prova:
                conn.execute("""
                    UPDATE stallion_pedigree SET sire=?, dam=?, sire_sire=NULL, sire_dam=NULL,
                           dam_sire=NULL, dam_dam=NULL, source='Archivio corse', updated_at=datetime('now')
                    WHERE name=?""", (_n(hs), _n(hd), nome))
            allineate += 1
        else:
            print(f"  {nome} ({fonte}) -> non trovato su UNIRE, nessuna contraddizione: resta com'e'",
                  file=sys.stderr)
            invariate += 1

    if not a.prova:
        conn.commit()
    print(f"[GENEALOGIE] corrette da UNIRE: {corrette}, allineate all'archivio: {allineate}, "
          f"lasciate: {invariate}" + (" (solo prova, nulla scritto)" if a.prova else ""), file=sys.stderr)
    return corrette + allineate


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prova", action="store_true", help="mostra le correzioni senza scriverle")
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    correggi(conn, prova=a.prova)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
