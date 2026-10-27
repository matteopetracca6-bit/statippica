#!/usr/bin/env python3
"""
ALLENATORI: raccoglie chi allena ogni cavallo in ogni corsa e ne calcola le
statistiche.

DA DOVE VIENE IL DATO. La fonte dei risultati usata dal lavoro notturno
(Trottoweb) non riporta l'allenatore. Lo riportano invece i risultati ufficiali
MASAF / Grande Ippica Italiana, una pagina per ogni giornata di corse in ogni
ippodromo, con accanto a ogni cavallo guidatore, allenatore e proprietario. La
fonte ufficiale parte dal 2016: per il 2013-2015 l'allenatore resta vuoto.

COME FA A ESSERE VELOCE. Per ogni data si legge l'indice delle giornate del
trotto, poi ogni giornata. Le pagine si chiedono dieci alla volta (circa dieci
al secondo). Ogni giornata letta resta segnata nell'archivio e non si rilegge,
tranne quelle degli ultimi giorni, che la fonte puo' ancora correggere. La
prima volta legge circa 14.000 pagine in una mezz'ora; le notti successive
solo le giornate nuove, in un paio di minuti.

ABBINAMENTO. Le corse dell'archivio si abbinano per data e nome del cavallo
(senza punteggiatura e senza la sigla del paese fra parentesi): in un giorno un
cavallo corre una volta sola. Se lo stesso nome compare con due allenatori
diversi nello stesso giorno, la riga si lascia vuota invece di indovinare.

STATISTICHE. Oltre ai conti semplici (corse, vittorie, premi) si calcola un
rendimento A PARITA' DI CAVALLO, con lo stesso metodo dei guidatori: quanto i
cavalli arrivano meglio o peggio della loro media quando li allena questa
persona. Si usano solo i cavalli passati per almeno due allenatori, perche'
solo li' il confronto esiste; per chi ha avuto sempre gli stessi cavalli il
giudizio resta "non giudicabile" invece di uscire nella media per finta.

Uso:
  python3 scripts/allenatori.py                 # raccoglie e calcola
  python3 scripts/allenatori.py --minuti 60     # si ferma entro un'ora
  python3 scripts/allenatori.py --solo-calcolo  # niente rete, solo statistiche
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import html
import os
import re
import sqlite3
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

BASE = "https://database.grandeippicaitaliana.it"
UA = {"User-Agent": "Mozilla/5.0 (StatIppica; matteopetracca9@gmail.com)"}
PRIMA_DATA = "2016-01-01"     # da qui la fonte ufficiale ha le giornate
GIORNI_DA_RILEGGERE = 7       # le giornate recenti si rileggono: la fonte le corregge
LETTORI = 10                  # pagine chieste insieme
MIN_CORSE_SCHEDA = 20         # sotto, l'allenatore non ha una scheda
K_AFFIDABILITA = 100.0        # come per i guidatori: con 100 confronti vale mezzo
MIN_PARTENTI = 4


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ── Rete ────────────────────────────────────────────────────────────────────

def scarica(percorso: str) -> str | None:
    for tentativo in range(4):
        try:
            req = urllib.request.Request(BASE + percorso, headers=UA)
            return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ""
            time.sleep(2 + 3 * tentativo)
        except Exception:
            time.sleep(2 + 3 * tentativo)
    return None


# ── Lettura della pagina di una giornata ────────────────────────────────────

RE_PEZZI = re.compile(
    r'Corsa\s+(\d+)\s+delle'                                   # inizio corsa
    r'|title="Prestazioni del cavallo ([^"]+)"'                # cavallo
    r'|title="Statistiche dell(?:&#039;|\')allenatore ([^"]+)"'  # allenatore
)


def chiave_nome(nome: str) -> str:
    """Nome del cavallo ridotto all'osso, per abbinare le due fonti."""
    n = html.unescape(nome).upper()
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
    return re.sub(r"[^A-Z0-9]", "", n)


def leggi_giornata(testo: str) -> list[tuple[int, str, str]]:
    """(numero corsa, cavallo, allenatore) per ogni cavallo della pagina."""
    out, corsa, cavallo = [], 0, None
    for m in RE_PEZZI.finditer(testo):
        if m.group(1):
            corsa, cavallo = int(m.group(1)), None
        elif m.group(2):
            cavallo = html.unescape(m.group(2)).strip()
        elif m.group(3) and cavallo:
            allenatore = re.sub(r"\s+", " ", html.unescape(m.group(3))).strip().upper()
            if allenatore:
                out.append((corsa, cavallo, allenatore))
            cavallo = None
    return out


def nome_visibile(a: str) -> str:
    """GOCCIADORO ALESSANDRO -> Gocciadoro Alessandro (sigle societarie in maiuscolo)."""
    sigle = {"SRL", "SAS", "SNC", "SS", "SPA", "SRLS", "AB", "AS", "OY", "SA", "II", "III", "JR"}
    parole = []
    for p in a.split():
        pulita = re.sub(r"[^A-Z]", "", p)
        if pulita in sigle:
            parole.append(p)
        else:
            parole.append("-".join(x.capitalize() for x in p.lower().split("-")))
    return " ".join(parole).replace("Societa'", "Società")


# Una stessa scuderia compare nei risultati ufficiali con nomi scritti in modi
# diversi negli anni: "GOCCIADORO ALESSANDRO", "GOCCIADORO ALESSANDRO SRL SOC AL",
# "GOCCIADORO ALESSANDRO SRL SOC.DI ALL.TO"... Per il sito sono lo stesso
# allenatore: si tolgono le parole della forma societaria e si confrontano le
# parole rimaste, in qualunque ordine (MATTEINI MANUELE = MANUELE MATTEINI).
PAROLE_SOCIETA = {"SRL", "SRLS", "RLS", "SR", "SAS", "SNC", "SPA", "SS", "SOC", "SOCIETA",
                  "ALL", "ALLTO", "TO", "ALLEN", "ALLENAMENTO", "ALLE", "AL", "C", "&",
                  "SC", "SCUD", "ERRATO"}
NON_DISTINTIVE = {"TEAM", "RACING"}


def parole_base(raw: str) -> list[str]:
    """Le parole del nome senza la forma societaria, nell'ordine originale."""
    t = raw.upper().replace("S.A.S", "SAS").replace("S.R.L", "SRL").replace("S.N.C", "SNC")
    t = re.sub(r"[.\-,()]", " ", t)
    parole = t.split()
    out: list[str] = []
    for i, p in enumerate(parole):
        q = p.replace("'", "")
        if q in PAROLE_SOCIETA:
            continue
        if q == "DI":
            prima = parole[i - 1].replace("'", "") if i else ""
            dopo = parole[i + 1].replace("'", "") if i + 1 < len(parole) else ""
            if prima in {"SAS", "SRL", "SRLS", "SNC"}:
                break            # "TEAM EHLERT SAS DI EHLERT HOLGER": il resto e' il titolare
            if prima in PAROLE_SOCIETA or dopo in PAROLE_SOCIETA or not dopo:
                continue
        if p not in out:
            out.append(p)
    return out


def unisci_nomi(nomi: dict[str, int]) -> dict[str, str]:
    """{nome ufficiale: numero di corse} -> {nome ufficiale: nome unico}."""
    gruppi: dict[frozenset, list[str]] = defaultdict(list)
    base: dict[str, list[str]] = {}
    for raw in nomi:
        b = parole_base(raw)
        chiave = frozenset(x for x in b if x not in NON_DISTINTIVE)
        if len(b) < 1 or all(len(x.strip("'")) <= 1 for x in chiave) or not chiave:
            b, chiave = raw.split(), frozenset([raw])
        base[raw] = b
        gruppi[chiave].append(raw)
    mappa: dict[str, str] = {}
    for membri in gruppi.values():
        # Il nome mostrato e' quello della variante usata piu' spesso.
        migliore = max(membri, key=lambda r: (nomi[r], r))
        unico = " ".join(base[migliore])
        for r in membri:
            mappa[r] = unico
    return mappa


# ── Tabelle ─────────────────────────────────────────────────────────────────

def crea_tabelle(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS allenatori_date_lette (
            data TEXT PRIMARY KEY, n_giornate INTEGER, letta_il TEXT);
        CREATE TABLE IF NOT EXISTS allenatori_giornate_lette (
            data TEXT, codice TEXT, n_righe INTEGER, letta_il TEXT,
            PRIMARY KEY (data, codice));
        CREATE TABLE IF NOT EXISTS allenatori_corse (
            data TEXT, codice TEXT, corsa INTEGER, cavallo TEXT, chiave TEXT,
            allenatore TEXT, PRIMARY KEY (data, codice, corsa, chiave));
        CREATE INDEX IF NOT EXISTS idx_allenatori_corse_dc ON allenatori_corse(data, chiave);
        CREATE TABLE IF NOT EXISTS trainer_stats (
            allenatore TEXT PRIMARY KEY, nome TEXT,
            n_corse INTEGER, n_corse_recenti INTEGER, n_cavalli INTEGER,
            n_cavalli_recenti INTEGER, n_vittorie INTEGER, n_primi_tre INTEGER,
            pct_vittorie REAL, pct_primi_tre REAL, premi_totali REAL,
            premi_per_corsa REAL, premi_12_mesi REAL, vittorie_12_mesi INTEGER,
            prima_corsa TEXT, ultima_corsa TEXT, ippodromo_top TEXT,
            guidatore_top TEXT, attivo INTEGER,
            effetto REAL, n_confronti INTEGER, affidabilita REAL, affidabilita_txt TEXT);
    """)
    colonne = {r[1] for r in conn.execute("PRAGMA table_info(races)")}
    if "trainer" not in colonne:
        conn.execute("ALTER TABLE races ADD COLUMN trainer TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_races_trainer ON races(trainer)")
    conn.commit()


# ── Raccolta ────────────────────────────────────────────────────────────────

def raccogli(conn: sqlite3.Connection, minuti: float) -> dict:
    inizio = time.time()
    scadenza = inizio + minuti * 60
    oggi = date.today()
    soglia_recente = (oggi - timedelta(days=GIORNI_DA_RILEGGERE)).isoformat()
    adesso = datetime.now().isoformat(timespec="seconds")

    date_archivio = [r[0] for r in conn.execute("""
        SELECT DISTINCT race_date FROM races
        WHERE race_date >= ? AND race_date <= ? AND track != 'ESTERO'
        ORDER BY race_date DESC""", (PRIMA_DATA, oggi.isoformat()))]
    gia_lette = {r[0] for r in conn.execute(
        "SELECT data FROM allenatori_date_lette WHERE data < ?", (soglia_recente,))}
    da_leggere = [d for d in date_archivio if d not in gia_lette]
    giornate_lette = {(d, c) for d, c in conn.execute(
        "SELECT data, codice FROM allenatori_giornate_lette WHERE data < ?", (soglia_recente,))}
    log(f"[ALLENATORI] date in archivio dal 2016: {len(date_archivio)}, da leggere: {len(da_leggere)}")

    stat = {"date": 0, "giornate": 0, "righe": 0, "errori": 0, "interrotto": False}
    # Le date si lavorano a blocchi: a ogni blocco si salva, cosi' se il
    # tempo finisce o qualcosa si rompe il lavoro fatto resta.
    BLOCCO = 60
    with cf.ThreadPoolExecutor(LETTORI) as ex:
        for i in range(0, len(da_leggere), BLOCCO):
            if time.time() > scadenza:
                stat["interrotto"] = True
                log("[ALLENATORI] tempo finito: riprendo la prossima volta.")
                break
            blocco = da_leggere[i:i + BLOCCO]
            indici = list(ex.map(lambda d: scarica(f"/risultati/{d}"), blocco))
            lavori, date_ok = [], []
            for d, s in zip(blocco, indici):
                if s is None:
                    stat["errori"] += 1
                    continue
                codici = sorted(set(re.findall(r"/risultati/giornata/T/(IT\d+)/" + re.escape(d), s)))
                date_ok.append((d, len(codici)))
                lavori += [(d, c) for c in codici if (d, c) not in giornate_lette]
            pagine = list(ex.map(lambda dc: scarica(f"/risultati/giornata/T/{dc[1]}/{dc[0]}"), lavori))
            date_fallite = set()
            for (d, c), s in zip(lavori, pagine):
                if s is None:
                    stat["errori"] += 1
                    date_fallite.add(d)
                    continue
                righe = leggi_giornata(s)
                conn.execute("DELETE FROM allenatori_corse WHERE data = ? AND codice = ?", (d, c))
                conn.executemany("""INSERT OR REPLACE INTO allenatori_corse
                    (data, codice, corsa, cavallo, chiave, allenatore) VALUES (?,?,?,?,?,?)""",
                    [(d, c, n, cav, chiave_nome(cav), al) for n, cav, al in righe])
                conn.execute("INSERT OR REPLACE INTO allenatori_giornate_lette VALUES (?,?,?,?)",
                             (d, c, len(righe), adesso))
                stat["giornate"] += 1
                stat["righe"] += len(righe)
            # Una data e' "letta" solo se tutte le sue giornate sono arrivate.
            conn.executemany("INSERT OR REPLACE INTO allenatori_date_lette VALUES (?,?,?)",
                             [(d, n, adesso) for d, n in date_ok if d not in date_fallite])
            stat["date"] += len(date_ok) - len(date_fallite)
            conn.commit()
            fatti = min(i + BLOCCO, len(da_leggere))
            log(f"  {fatti}/{len(da_leggere)} date, {stat['giornate']} giornate, "
                f"{stat['righe']} cavalli, {stat['errori']} errori, {time.time() - inizio:.0f}s")
    stat["secondi"] = round(time.time() - inizio)
    return stat


def abbina(conn: sqlite3.Connection) -> dict:
    """Scrive l'allenatore sulle corse dell'archivio."""
    conteggi = dict(conn.execute(
        "SELECT allenatore, COUNT(*) FROM allenatori_corse GROUP BY allenatore").fetchall())
    mappa = unisci_nomi(conteggi)
    log(f"[ALLENATORI] nomi ufficiali: {len(conteggi)}, allenatori dopo l'unione: {len(set(mappa.values()))}")
    per_giorno: dict[tuple[str, str], set] = defaultdict(set)
    for d, k, a in conn.execute("SELECT data, chiave, allenatore FROM allenatori_corse"):
        per_giorno[(d, k)].add(mappa.get(a, a))

    aggiornamenti, ambigui, senza = [], 0, 0
    for rid, d, nome, attuale in conn.execute("""
        SELECT id, race_date, horse_name, trainer FROM races
        WHERE race_date >= ? AND track != 'ESTERO'""", (PRIMA_DATA,)):
        trovati = per_giorno.get((d, chiave_nome(nome or "")))
        if not trovati:
            senza += 1
            continue
        if len(trovati) > 1:
            ambigui += 1
            continue
        a = next(iter(trovati))
        if a != attuale:
            aggiornamenti.append((a, rid))
    conn.executemany("UPDATE races SET trainer = ? WHERE id = ?", aggiornamenti)
    conn.commit()
    tot, con = conn.execute("""SELECT COUNT(*), COUNT(trainer) FROM races
                               WHERE race_date >= ? AND track != 'ESTERO'""", (PRIMA_DATA,)).fetchone()
    return {"scritte": len(aggiornamenti), "ambigue": ambigui, "senza": senza,
            "copertura": round(100 * con / tot, 1) if tot else 0, "corse": tot}


# ── Statistiche ─────────────────────────────────────────────────────────────

def etichetta(a: float) -> str:
    if a >= 0.80: return "molto alta"
    if a >= 0.60: return "alta"
    if a >= 0.40: return "media"
    if a >= 0.20: return "bassa"
    return "molto bassa"


def calcola(conn: sqlite3.Connection) -> int:
    conn.execute("DELETE FROM trainer_stats")
    recente = (date.today() - timedelta(days=548)).isoformat()   # 18 mesi
    anno = (date.today() - timedelta(days=365)).isoformat()

    righe = conn.execute("""
        SELECT trainer, horse_name, race_date, track, driver, placement,
               total_starters, COALESCE(prize_net, 0)
        FROM races WHERE trainer IS NOT NULL""").fetchall()

    # Rendimento a parita' di cavallo: media di ogni cavallo sulle corse con
    # allenatore noto, solo per i cavalli passati per almeno due allenatori.
    allenatori_cav: dict[str, set] = defaultdict(set)
    quote_cav: dict[str, list] = defaultdict(list)
    for t, h, d, tr, dr, p, n, pr in righe:
        allenatori_cav[h].add(t)
        if p is not None and n and n > MIN_PARTENTI:
            quote_cav[h].append(p / n)
    media_cav = {h: sum(q) / len(q) for h, q in quote_cav.items()
                 if len(q) >= 5 and len(allenatori_cav[h]) >= 2}

    acc = defaultdict(lambda: {"n": 0, "nr": 0, "v": 0, "t": 0, "pr": 0.0, "pr12": 0.0, "v12": 0,
                               "cav": set(), "cavr": set(), "prima": None, "ultima": None,
                               "piste": defaultdict(int), "guid": defaultdict(int), "sc": []})
    for t, h, d, tr, dr, p, n, pr in righe:
        a = acc[t]
        a["n"] += 1
        a["cav"].add(h)
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
        if dr: a["guid"][dr] += 1
        m = media_cav.get(h)
        if m is not None and p is not None and n and n > MIN_PARTENTI:
            a["sc"].append(p / n - m)

    out = []
    for t, a in acc.items():
        if a["n"] < MIN_CORSE_SCHEDA:
            continue
        nc = len(a["sc"])
        eff = round(sum(a["sc"]) / nc, 4) if nc >= 30 else None
        aff = nc / (nc + K_AFFIDABILITA) if nc else 0.0
        out.append((
            t, nome_visibile(t), a["n"], a["nr"], len(a["cav"]), len(a["cavr"]),
            a["v"], a["t"], round(100 * a["v"] / a["n"], 2), round(100 * a["t"] / a["n"], 2),
            round(a["pr"], 2), round(a["pr"] / a["n"], 2), round(a["pr12"], 2), a["v12"],
            a["prima"], a["ultima"],
            max(a["piste"].items(), key=lambda x: x[1])[0] if a["piste"] else None,
            max(a["guid"].items(), key=lambda x: x[1])[0] if a["guid"] else None,
            1 if a["nr"] >= 10 else 0,
            eff, nc, round(aff, 3), etichetta(aff) if eff is not None else "non giudicabile",
        ))
    conn.executemany(f"INSERT INTO trainer_stats VALUES ({','.join('?' * 23)})", out)
    conn.commit()
    log(f"[ALLENATORI] schede: {len(out)}, in attivita': {sum(1 for r in out if r[18])}")
    return len(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--minuti", type=float, default=300)
    ap.add_argument("--solo-calcolo", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    crea_tabelle(conn)
    if not args.solo_calcolo:
        log("[ALLENATORI] raccolta:", raccogli(conn, args.minuti))
    log("[ALLENATORI] abbinamento:", abbina(conn))
    calcola(conn)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
