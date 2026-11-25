#!/usr/bin/env python3
"""
Recupero in blocco degli storici nati dal 1990 al 2011 dal registro ufficiale
UNIRE (novembre 2026).

PERCHE'. Un cavallo nato prima del 2012 che ha smesso di correre prima del 2012
entrava nell'archivio solo se aveva figli nell'archivio: GIL DEL ROERO (2003,
113 corse, 63.129 euro) non c'era. UNIRE ha anagrafica e totali di carriera di
tutti i trottatori registrati in Italia.

COME. La ricerca UNIRE vuole nome, sesso e anno, cerca "contiene" e mostra
l'elenco solo fino a 100 cavalli (oltre dice solo quanti sono). Nel trotto
italiano l'iniziale del nome segue l'anno di nascita (1997 A, 2001 E, 2011 S;
19 lettere, niente H, J, K, Q, W, X, Y), quindi per ogni annata e sesso si
cerca la lettera dell'anno seguita da una lettera ("EA", "EB", ...): se i
risultati sono piu' di 100 si aggiunge una lettera ("EAA", ...), finche'
l'elenco si vede. Poi, per ogni cavallo dell'elenco, la scheda con i totali.

QUALI ENTRANO. Chi ha corso, con la carriera completa del registro. Dal
19/11/2026 anche chi non ha mai corso, con anagrafica e genitori: sta solo
nella classifica pedigree e collega le famiglie delle fattrici. Chi c'e'
gia' con una carriera non si tocca; chi c'e' come scheda vuota (un genitore non
trovato, uno storico con le sole gare dal 2016) riceve i totali. Ogni scheda
toccata da qui ha source = 'unire_blocco': la scala storica non la usa per le
soglie (vedi phase_historic_ratings). Un omonimo di un altro anno entra con
l'anno nel nome ("SALSA PICCANTE (2011)") e i figli vanno al genitore giusto
(omonimi.py).

PRIMA I PARZIALI (18/11/2026). Gli storici con la "carriera parziale" (scheda
senza totali ma con le gare dal 2016 nell'archivio, es. POP HEART e MAN DI
CASEI) si cercano per primi, uno per uno, per nome esatto, sesso e anno: anche
quelli il cui nome non comincia con la lettera dell'annata. Trovati, ricevono
i totali e perdono l'avviso di carriera parziale. Ogni tentativo resta segnato
in storici_unire_parziali (trovato / non_trovato).

QUANTO. Si lavora una notte alla volta per CHI_MINUTI minuti, a una richiesta
al secondo come il resto della ricerca su UNIRE; tutto il lavoro fatto resta
segnato nelle tabelle storici_unire_ricerche e storici_unire_cavalli, quindi la
notte dopo si riprende dal punto esatto. Si parte dalle annate piu' recenti.

Uso: python3 scripts/storici_unire.py --db data.db [--minuti 150] [--prova]
"""
import argparse
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import unire_source as u  # noqa: E402
import omonimi  # noqa: E402

ANNI = range(2011, 1989, -1)
SESSI = ("M", "F", "C")
LETTERE_ANNO = "ABCDEFGILMNOPRSTUVZ"     # 1997 = A, ciclo di 19 anni
ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ "
SOGLIA = 100                              # oltre, UNIRE non mostra l'elenco
CHI_MINUTI = float(os.environ.get("STORICI_UNIRE_MINUTI", "150"))
ERRORI_DI_FILA = 8


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def adesso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def lettera(anno: int) -> str:
    return LETTERE_ANNO[(anno - 1997) % len(LETTERE_ANNO)]


def crea_tabelle(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS storici_unire_ricerche (
        anno INTEGER, sesso TEXT, testo TEXT, stato TEXT, trovati INTEGER, quando TEXT,
        PRIMARY KEY (anno, sesso, testo))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS storici_unire_cavalli (
        id_cav TEXT PRIMARY KEY, nome TEXT, sesso TEXT, anno INTEGER, padre TEXT, madre TEXT,
        stato TEXT, corse INTEGER, quando TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS storici_unire_parziali (
        nome TEXT PRIMARY KEY, anno INTEGER, stato TEXT, quando TEXT)""")
    for anno in ANNI:
        for s in SESSI:
            if not conn.execute("SELECT 1 FROM storici_unire_ricerche WHERE anno = ? AND sesso = ? LIMIT 1",
                                (anno, s)).fetchone():
                conn.executemany("INSERT OR IGNORE INTO storici_unire_ricerche VALUES (?,?,?,?,?,?)",
                                 [(anno, s, lettera(anno) + c, "da_fare", None, None)
                                  for c in ALFABETO if c != " "])
    conn.commit()


def cerca(testo: str, sesso: str, anno: int):
    """(quanti dice UNIRE, righe dell'elenco). Righe: id, nome, padre, madre."""
    from bs4 import BeautifulSoup
    r = u._get(u.UNIRE_LIST, method="POST", data={"name": testo, "sex": sesso, "year": str(anno)})
    time.sleep(u.UNIRE_DELAY)
    soup = BeautifulSoup(r.text, "html.parser")
    m = re.search(r"Ho trovato\s+(\d+)", soup.get_text(" ", strip=True))
    righe = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        nome = u._norm(tds[0].get_text(" ", strip=True))
        a = tds[0].find("a", href=True)
        cid = a["href"].split("id_cav=")[-1].strip() if a and "id_cav=" in a["href"] else ""
        if not nome or nome == "NOME" or not cid:
            continue
        righe.append((cid, nome, u._norm(tds[5].get_text(" ", strip=True)) or None,
                      u._norm(tds[6].get_text(" ", strip=True)) or None))
    return (int(m.group(1)) if m else len(righe)), righe


def fai_ricerca(conn, anno, sesso, testo) -> int:
    n, righe = cerca(testo, sesso, anno)
    if n > SOGLIA and len(testo) < 8:
        conn.executemany("INSERT OR IGNORE INTO storici_unire_ricerche VALUES (?,?,?,?,?,?)",
                         [(anno, sesso, testo + c, "da_fare", None, None) for c in ALFABETO
                          if not (c == " " and testo.endswith(" "))])
        stato = "divisa"
    else:
        conn.executemany("INSERT OR IGNORE INTO storici_unire_cavalli VALUES (?,?,?,?,?,?,?,?,?)",
                         [(cid, nome, sesso, anno, p, m, "da_leggere", None, None)
                          for cid, nome, p, m in righe])
        stato = "fatta"
    conn.execute("UPDATE storici_unire_ricerche SET stato = ?, trovati = ?, quando = ? "
                 "WHERE anno = ? AND sesso = ? AND testo = ?", (stato, n, adesso(), anno, sesso, testo))
    return len(righe) if stato == "fatta" else 0


def prossimo_parziale(conn):
    """Il prossimo storico con la carriera parziale da cercare (come la
    scheda del sito: nessun totale, gare dall'anno dopo i due di eta')."""
    return conn.execute("""
        SELECT h.name, h.birth_year, h.sex FROM horses h
        WHERE COALESCE(h.career_races, 0) = 0 AND h.birth_year IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM storici_unire_parziali p WHERE p.nome = h.name)
          AND EXISTS (SELECT 1 FROM races r WHERE r.horse_name = h.name
                      AND r.race_date >= (h.birth_year + 2) || '-01-01')
        ORDER BY h.birth_year DESC, h.name LIMIT 1""").fetchone()


def cerca_parziale(conn, nome, anno, sesso) -> str:
    """Cerca il cavallo per nome esatto; se c'e', la sua scheda va in lettura."""
    testo = nome
    if "'" in nome:
        # Con l'apostrofo UNIRE non trova niente: si cerca il pezzo piu' lungo.
        pezzi = [x.strip() for x in nome.split("'") if x.strip()]
        testo = pezzi[0] if pezzi and len(pezzi[0]) >= 3 else max(pezzi, key=len, default=nome)
    for codice in u._sex_codes(sesso):
        _, righe = cerca(testo, codice, int(anno))
        for cid, n, p, m in righe:
            if n == u._norm(nome):
                conn.execute("INSERT OR REPLACE INTO storici_unire_cavalli VALUES (?,?,?,?,?,?,?,?,?)",
                             (cid, nome, codice, int(anno), p, m, "da_leggere", None, None))
                return "trovato"
    return "non_trovato"


PAESI = {"ITALIA": "ITA", "FRANCIA": "FRA", "SVEZIA": "SWE", "STATI UNITI": "USA", "U.S.A.": "USA",
         "GERMANIA": "GER", "CANADA": "CAN", "DANIMARCA": "DEN", "NORVEGIA": "NOR", "FINLANDIA": "FIN",
         "OLANDA": "NED", "BELGIO": "BEL", "AUSTRIA": "AUT", "SVIZZERA": "SUI"}


def inserisci_mai_corso(conn, nome, sesso, anno, padre, madre, paese=None) -> str:
    """Un cavallo registrato su UNIRE che non ha mai corso: anagrafica e
    genitori, nessuna carriera. Non tocca chi c'e' gia' (completa solo i
    genitori mancanti dello stesso cavallo); salta gli omonimi."""
    if not nome or not anno:
        return "saltato"
    gia = conn.execute("SELECT birth_year FROM horses WHERE name = ?", (nome,)).fetchone()
    if gia and gia[0] is not None and int(gia[0]) != int(anno):
        nome_om = omonimi.nome_con_anno(nome, anno)
        omonimi.registra(conn, nome, gia[0], nome_om, anno)
        nome = nome_om
        gia = conn.execute("SELECT birth_year FROM horses WHERE name = ?", (nome,)).fetchone()
        if gia:
            return "omonimo"
    if gia:
        conn.execute("""UPDATE horses SET sire = COALESCE(NULLIF(sire, ''), ?), dam = COALESCE(NULLIF(dam, ''), ?),
                            sex = COALESCE(NULLIF(sex, ''), ?), birth_year = COALESCE(birth_year, ?)
                        WHERE name = ?""", (padre, madre, sesso, int(anno), nome))
        return "gia_presente"
    conn.execute("""INSERT INTO horses (name, birth_year, sex, country, sire, dam, career_races, career_wins,
                        career_places, career_earnings, source, source_role, horse_class, backfill_status,
                        tw_found, last_updated)
                    VALUES (?,?,?,?,?,?, 0, 0, 0, 0, 'unire_blocco', 'unire_storici', ?, 'done', 0, ?)""",
                 (nome, int(anno), sesso, paese, padre, madre,
                  "breeder" if int(anno) < 2012 else "athlete", adesso()))
    return "inserito"


def aggiungi_mai_corsi(conn) -> dict:
    """I mai corsi gia' letti nei giri precedenti (prima del 19/11/2026 non si
    inserivano): nome, sesso, anno e genitori sono gia' in storici_unire_cavalli."""
    esiti: dict = {}
    for nome, sesso, anno, padre, madre in conn.execute(
            "SELECT nome, sesso, anno, padre, madre FROM storici_unire_cavalli WHERE stato = 'mai_corso'").fetchall():
        e = inserisci_mai_corso(conn, nome, sesso, anno, padre, madre)
        esiti[e] = esiti.get(e, 0) + 1
    conn.commit()
    return esiti


def leggi_cavallo(conn, cid, nome_elenco, sesso, anno, padre, madre, aggiorna: bool = False) -> str:
    """aggiorna=True (carriere_singole): una carriera gia' presente ma piu' corta
    di quella di UNIRE prende i totali di UNIRE."""
    d = u.fetch_horse(cid)
    if not d:
        return "errore"
    esito = _leggi_cavallo(conn, d, nome_elenco, sesso, anno, padre, madre, aggiorna)
    # Il manto della scheda UNIRE (25/11/2026): solo dove manca, sempre con
    # nome e anno della scheda, cosi' un omonimo non lo prende per errore.
    try:
        coat, anno_d = d.get("coat"), d.get("birth_year") or anno
        if coat and anno_d:
            for n in {d.get("name") or nome_elenco, nome_elenco, omonimi.nome_con_anno(d.get("name") or nome_elenco, anno_d)}:
                conn.execute("""UPDATE horses SET coat_color = ? WHERE name = ? AND birth_year = ?
                                AND (coat_color IS NULL OR coat_color = '' OR coat_color = 'n/d')""", (coat, n, anno_d))
    except Exception:  # noqa: BLE001  il manto non deve fermare il recupero
        pass
    return esito


def _leggi_cavallo(conn, d, nome_elenco, sesso, anno, padre, madre, aggiorna: bool = False) -> str:
    corse = int(d.get("career_races") or 0)
    nome = d.get("name") or nome_elenco
    # Una carriera parziale cercata per nome resta sulla sua scheda, anche se
    # UNIRE scrive il nome in un altro modo: niente doppioni.
    if conn.execute("SELECT 1 FROM storici_unire_parziali WHERE nome = ? AND stato = 'trovato'",
                    (nome_elenco,)).fetchone():
        nome = nome_elenco
    if corse <= 0:
        # Mai corso: entra lo stesso, con anagrafica e genitori, solo per la
        # classifica pedigree e per collegare le famiglie (19/11/2026).
        inserisci_mai_corso(conn, nome, d.get("sex") or sesso, d.get("birth_year") or anno,
                            d.get("sire") or padre, d.get("dam") or madre,
                            PAESI.get((d.get("country") or "").upper()))
        return "mai_corso"
    anno_d = d.get("birth_year") or anno
    gia = conn.execute("SELECT birth_year, COALESCE(career_races, 0) FROM horses WHERE name = ?",
                       (nome,)).fetchone()
    valori = dict(sex=d.get("sex") or sesso, country=PAESI.get((d.get("country") or "").upper()),
                  sire=d.get("sire") or padre, dam=d.get("dam") or madre,
                  career_races=corse, career_wins=int(d.get("career_wins") or 0),
                  career_places=int(d.get("career_places") or 0),
                  career_earnings=float(d.get("career_earnings") or 0.0),
                  record_career=d.get("record_career"))
    if gia and gia[0] is not None and int(gia[0]) != int(anno_d):
        # Omonimo di un altro anno: entra con l'anno nel nome e la coppia si
        # registra, cosi' i figli vanno al genitore giusto (omonimi.py).
        nome_om = omonimi.nome_con_anno(nome, anno_d)
        omonimi.registra(conn, nome, gia[0], nome_om, anno_d)
        if conn.execute("SELECT 1 FROM horses WHERE name = ?", (nome_om,)).fetchone():
            return "omonimo"
        nome, gia = nome_om, None
    if gia:
        if gia[1] > 0 and not (aggiorna and corse > gia[1]):
            return "gia_presente"
        # Scheda vuota dello stesso cavallo (per esempio un genitore non
        # trovato): riceve anagrafica mancante e totali.
        conn.execute("""UPDATE horses SET birth_year = COALESCE(birth_year, ?), sex = COALESCE(NULLIF(sex, ''), ?),
                            country = COALESCE(country, ?), sire = COALESCE(NULLIF(sire, ''), ?),
                            dam = COALESCE(NULLIF(dam, ''), ?), career_races = ?, career_wins = ?,
                            career_places = ?, career_earnings = ?, record_career = COALESCE(record_career, ?),
                            source = 'unire_blocco', last_updated = ?,
                            horse_class = CASE WHEN COALESCE(birth_year, ?) < 2012 THEN 'breeder' ELSE 'athlete' END
                        WHERE name = ?""",
                     (anno_d, valori["sex"], valori["country"], valori["sire"], valori["dam"], corse,
                      valori["career_wins"], valori["career_places"], valori["career_earnings"],
                      valori["record_career"], adesso(), anno_d, nome))
        return "aggiornato"
    conn.execute("""INSERT INTO horses (name, birth_year, sex, country, sire, dam, career_races, career_wins,
                        career_places, career_earnings, record_career, source, source_role, horse_class,
                        backfill_status, tw_found, last_updated)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'unire_blocco', 'unire_storici', ?, 'done', 0, ?)""",
                 (nome, anno_d, valori["sex"], valori["country"], valori["sire"], valori["dam"], corse,
                  valori["career_wins"], valori["career_places"], valori["career_earnings"],
                  valori["record_career"], "breeder" if int(anno_d) < 2012 else "athlete", adesso()))
    return "inserito"


def lavora(conn, minuti: float, massimo: int | None = None) -> dict:
    fine = time.monotonic() + minuti * 60
    fatti = {"ricerche": 0, "schede": 0}
    esiti: dict = {}
    errori = 0
    while time.monotonic() < fine and (massimo is None or fatti["ricerche"] + fatti["schede"] < massimo):
        # Prima le schede gia' trovate, poi le ricerche: i cavalli entrano subito.
        c = conn.execute("""SELECT id_cav, nome, sesso, anno, padre, madre FROM storici_unire_cavalli
                            WHERE stato = 'da_leggere' ORDER BY anno DESC LIMIT 1""").fetchone()
        try:
            if c:
                esito = leggi_cavallo(conn, *c)
                conn.execute("UPDATE storici_unire_cavalli SET stato = ?, quando = ? WHERE id_cav = ?",
                             (esito, adesso(), c[0]))
                esiti[esito] = esiti.get(esito, 0) + 1
                fatti["schede"] += 1
            elif (pz := prossimo_parziale(conn)):
                esito = cerca_parziale(conn, *pz)
                conn.execute("INSERT OR REPLACE INTO storici_unire_parziali VALUES (?,?,?,?)",
                             (pz[0], pz[1], esito, adesso()))
                esiti["parziale_" + esito] = esiti.get("parziale_" + esito, 0) + 1
                fatti["ricerche"] += 1
            else:
                r = conn.execute("""SELECT anno, sesso, testo FROM storici_unire_ricerche WHERE stato = 'da_fare'
                                    ORDER BY anno DESC, sesso, testo LIMIT 1""").fetchone()
                if not r:
                    log("[STORICI-UNIRE] lavoro finito: tutte le annate lette.")
                    break
                fai_ricerca(conn, *r)
                fatti["ricerche"] += 1
            errori = 0
        except u.UnireUnavailable as e:
            errori += 1
            log(f"  [STORICI-UNIRE] UNIRE non risponde ({e})")
            if errori >= ERRORI_DI_FILA:
                log("[STORICI-UNIRE] la fonte non risponde: riprendo la prossima volta.")
                break
            time.sleep(10)
        if (fatti["ricerche"] + fatti["schede"]) % 50 == 0:
            conn.commit()
    conn.commit()
    return dict(fatti, **esiti)


def rapporto(conn) -> str:
    righe = []
    for anno, fatte, totali in conn.execute("""
            SELECT anno, SUM(stato <> 'da_fare'), COUNT(*) FROM storici_unire_ricerche GROUP BY anno ORDER BY anno DESC"""):
        cav = dict(conn.execute("SELECT stato, COUNT(*) FROM storici_unire_cavalli WHERE anno = ? GROUP BY 1",
                                (anno,)).fetchall())
        if fatte or cav:
            righe.append(f"  {anno}: ricerche {fatte}/{totali}; cavalli {sum(cav.values())} {cav}")
    return "\n".join(righe)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--minuti", type=float, default=CHI_MINUTI)
    ap.add_argument("--massimo", type=int, default=None, help="al massimo tante richieste (prove)")
    ap.add_argument("--prova", action="store_true", help="lavora su una copia in memoria, non salva")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    if a.prova:
        copia = sqlite3.connect(":memory:")
        conn.backup(copia)
        conn.close()
        conn = copia
    crea_tabelle(conn)
    # 19/11/2026: gli omonimi saltati nei giri precedenti si rileggono ed
    # entrano con l'anno nel nome.
    conn.execute("UPDATE storici_unire_cavalli SET stato = 'da_leggere' WHERE stato = 'omonimo'")
    log(f"[STORICI-UNIRE] mai corsi dei giri precedenti: {aggiungi_mai_corsi(conn)}")
    prima = conn.execute("SELECT COUNT(*) FROM horses WHERE source = 'unire_blocco'").fetchone()[0]
    esito = lavora(conn, a.minuti, a.massimo)
    log(f"[STORICI-UNIRE] omonimi, nome pulito al piu' giovane: {omonimi.ordina(conn)}")
    log(f"[STORICI-UNIRE] omonimi, figli al genitore giusto: {omonimi.riassegna(conn)}")
    dopo = conn.execute("SELECT COUNT(*) FROM horses WHERE source = 'unire_blocco'").fetchone()[0]
    log(f"[STORICI-UNIRE] {esito}; storici dal registro: {prima} -> {dopo}"
        + ("  [PROVA: niente e' stato salvato]" if a.prova else ""))
    log(rapporto(conn))
    restano = conn.execute("""SELECT COUNT(*) FROM horses h WHERE COALESCE(h.career_races, 0) = 0
        AND h.birth_year IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM storici_unire_parziali p WHERE p.nome = h.name)
        AND EXISTS (SELECT 1 FROM races r WHERE r.horse_name = h.name
                    AND r.race_date >= (h.birth_year + 2) || '-01-01')""").fetchone()[0]
    pz = dict(conn.execute("SELECT stato, COUNT(*) FROM storici_unire_parziali GROUP BY 1").fetchall())
    log(f"[STORICI-UNIRE] carriere parziali: cercate {pz}, da cercare ancora {restano}")
    if a.prova:
        for r in conn.execute("""SELECT name, birth_year, sex, sire, dam, career_races, career_wins, career_earnings,
                                        record_career FROM horses WHERE source = 'unire_blocco' LIMIT 8"""):
            log("   ", r)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
