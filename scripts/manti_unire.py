#!/usr/bin/env python3
"""
Manti dal registro UNIRE, di notte a tappe (25/11/2026).

PERCHE'. Il manto (baio, baio oscuro, sauro...) arrivava solo dalle schede
TrottoWeb: quasi nessuno storico e pochi nati dal 2023 lo avevano. manti.py
prende di notte quello che c'e' gia' nell'archivio (VendoPuledri, risultati
ufficiali); qui si prende il resto dalla scheda UNIRE, dove sta accanto al
sesso ("maschio baio oscuro 2005 ITA").

COME. Due giri, a una richiesta al secondo come tutto il lavoro su UNIRE:
  1. cavalli senza manto che hanno gia' l'id UNIRE (recuperati dal registro,
     tabella storici_unire_cavalli): una richiesta ciascuno, la scheda;
  2. gli altri senza manto (nati dal 2023 non ancora sul registro di
     TrottoWeb, schede vuote dei genitori): prima la ricerca per nome, sesso e
     anno, poi la scheda. Due richieste ciascuno.
Prima chi ha corso, poi i riproduttori, poi gli altri. Il manto si scrive solo
dove manca e solo se nome e anno della scheda coincidono. Ogni tentativo
resta segnato in manti_unire_letti: la notte dopo si riprende da dove si era
rimasti, e un cavallo non trovato non si richiede.

Uso: python3 scripts/manti_unire.py --db data.db [--minuti 100] [--prova N]
"""
import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import unire_source as u  # noqa: E402


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def adesso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def crea_tabella(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS manti_unire_letti (
        nome TEXT, anno INTEGER, id_cav TEXT, esito TEXT, manto TEXT, quando TEXT,
        PRIMARY KEY (nome, anno))""")


def senza_manto(conn, con_id: bool):
    """Cavalli senza manto non ancora tentati, in ordine di importanza.
    con_id: solo quelli con l'id UNIRE gia' noto (e l'id)."""
    ids = {}
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='storici_unire_cavalli'").fetchone():
        for cid, nome, anno in conn.execute("SELECT id_cav, nome, anno FROM storici_unire_cavalli WHERE id_cav IS NOT NULL"):
            ids.setdefault((str(nome).upper(), anno), cid)
    genitori = {r[0] for r in conn.execute("SELECT sire FROM horses WHERE sire IS NOT NULL UNION SELECT dam FROM horses WHERE dam IS NOT NULL")}
    fatti = {(n, a) for n, a in conn.execute("SELECT nome, anno FROM manti_unire_letti")}
    righe = []
    for nome, anno, sesso, corse in conn.execute("""SELECT name, birth_year, sex, COALESCE(career_races, 0) FROM horses
            WHERE (coat_color IS NULL OR coat_color = '' OR coat_color = 'n/d') AND birth_year IS NOT NULL"""):
        if (nome, anno) in fatti:
            continue
        cid = ids.get((nome.upper(), anno))
        if (cid is not None) != con_id:
            continue
        righe.append((-(corse > 0), -(nome in genitori), -int(anno), nome, anno, sesso, cid))
    righe.sort()
    return [(r[3], r[4], r[5], r[6]) for r in righe]


def cerca_id(nome: str, sesso, anno: int):
    """L'id UNIRE del cavallo, dalla ricerca per nome, sesso e anno (riga con il nome esatto)."""
    from bs4 import BeautifulSoup
    target = u._norm(nome.split(" (")[0])
    cerca = target
    if "'" in cerca:
        pezzi = [x.strip() for x in cerca.split("'") if x.strip()]
        cerca = pezzi[0] if pezzi and len(pezzi[0]) >= 3 else max(pezzi, key=len, default=cerca)
    for code in u._sex_codes(sesso):
        resp = u._get(u.UNIRE_LIST, method="POST", data={"name": cerca, "sex": code, "year": str(anno)})
        time.sleep(u.UNIRE_DELAY)
        soup = BeautifulSoup(resp.text, "html.parser")
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 7 or u._norm(tds[0].get_text()) != target:
                continue
            link = tds[0].find("a", href=True)
            if link and "id_cav=" in link["href"]:
                return link["href"].split("id_cav=")[-1].strip() or None
    return None


def lavora(conn, minuti: float, massimo=None) -> dict:
    crea_tabella(conn)
    fine = time.time() + 60 * minuti
    conta = {"letti": 0, "manti": 0, "senza_manto_in_unire": 0, "non_trovati": 0, "errori": 0}
    for con_id in (True, False):
        for nome, anno, sesso, cid in senza_manto(conn, con_id):
            if time.time() > fine or (massimo and conta["letti"] >= massimo):
                return conta
            esito, manto = "errore", None
            try:
                if not cid:
                    cid = cerca_id(nome, sesso, int(anno))
                if not cid:
                    esito = "non_trovato"
                else:
                    d = u.fetch_horse(cid)
                    if d and d.get("birth_year") and int(d["birth_year"]) != int(anno):
                        esito = "anno_diverso"
                    elif d and d.get("coat"):
                        manto, esito = d["coat"], "manto"
                        conn.execute("""UPDATE horses SET coat_color = ? WHERE name = ? AND birth_year = ?
                                        AND (coat_color IS NULL OR coat_color = '' OR coat_color = 'n/d')""", (manto, nome, anno))
                    elif d:
                        esito = "senza_manto"
            except Exception as e:  # noqa: BLE001  una scheda storta non ferma il giro
                log(f"[MANTI UNIRE] {nome} {anno}: {e!r}")
            conn.execute("INSERT OR REPLACE INTO manti_unire_letti VALUES (?,?,?,?,?,?)", (nome, anno, cid, esito, manto, adesso()))
            conta["letti"] += 1
            conta["manti" if esito == "manto" else "senza_manto_in_unire" if esito == "senza_manto"
                  else "non_trovati" if esito in ("non_trovato", "anno_diverso") else "errori"] += 1
            if conta["letti"] % 50 == 0:
                conn.commit()
                log(f"[MANTI UNIRE] {conta}")
    conn.commit()
    return conta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--minuti", type=float, default=100)
    ap.add_argument("--prova", type=int, default=None, help="solo N cavalli, per provare")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    crea_tabella(conn)
    restano = conn.execute("""SELECT COUNT(*) FROM horses h LEFT JOIN manti_unire_letti l ON l.nome = h.name AND l.anno = h.birth_year
                              WHERE (h.coat_color IS NULL OR h.coat_color = '' OR h.coat_color = 'n/d') AND h.birth_year IS NOT NULL
                              AND l.nome IS NULL""").fetchone()[0]
    log(f"[MANTI UNIRE] da leggere: {restano}")
    conta = lavora(conn, a.minuti, a.prova)
    log(f"[MANTI UNIRE] fatto: {conta}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
