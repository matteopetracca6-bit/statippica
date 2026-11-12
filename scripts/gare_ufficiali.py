#!/usr/bin/env python3
"""
GARE UFFICIALI: recupera dalla fonte ufficiale le corse che in archivio mancano,
soprattutto quelle dei cavalli nati prima del 2012.

DESTINAZIONE NEL PROGETTO: scripts/gare_ufficiali.py (accanto ad allenatori.py,
di cui riusa la lettura di rete e la chiave dei nomi). Solo libreria standard.

IL PROBLEMA. L'archivio nasce dalle schede dei cavalli di TrottoWeb, che ha la
carriera gara per gara solo dei nati dal 2011. Chi e' nato prima non entra, e
le stagioni 2016-2019 restano a meta': nel 2016 mancano circa 33.000 partenze
su 73.000. Abbassare l'anno minimo non serve: per quei cavalli TrottoWeb
risponde con zero gare (vedi carriere_fattrici.py).

LA FONTE. I risultati ufficiali MASAF / Grande Ippica Italiana, una pagina per
giornata e ippodromo, dal 2016: /risultati/giornata/T/<codice>/<data>. E' la
stessa pagina che allenatori.py legge gia' ogni notte, ma di ogni cavallo oggi
si tengono solo allenatore e proprietario. La riga completa contiene, in
quest'ordine:
    arrivo (numero, oppure una sigla: RP, RC, RI...)   numero di partenza
    nome del cavallo + sigla "cb3" (sesso, mantello, eta')
    distanza   tempo al km   quota   guidatore   [allenatore] [proprietario]
    padre  "e"  madre
e l'intestazione della corsa riporta la dotazione ("Euro 8.030") e i metri.
Dall'eta' si ricava l'anno di nascita (anno della corsa meno eta').
Verificato a mano su Taranto 17/05/2016, corsa 1: arrivo, numero, distanza e
tempo di URLO DI POGGIO, UPSET GRIF, UNICA DEL COLLE e ULSTER OP coincidono con
l'archivio, e cosi' sesso, anno, padre e madre.

Il premio vinto dal singolo cavallo NON c'e' (c'e' solo la dotazione della
corsa). Non si inventa: dal sesto posto in giu' e per gli squalificati si
scrive 0 (in archivio e' cosi' nel 99% dei casi), per i primi cinque resta
vuoto, che vuol dire "non lo so". La dotazione si conserva nella tabella di
attesa.

PREMIO CALCOLATO DALLA REGOLA (12/11/2026). Il regolamento delle corse al trotto
(allegato 2, tabella "ripartizione premi al traguardo") divide la dotazione:
al cavallo arrivato 1-2-3-4-5 vanno il 46-22-12-6-4% di (dotazione / 1,1),
perche' la cifra scritta sulla pagina comprende anche la parte degli
allevatori; di questa somma l'85% e' del proprietario (il "netto" dell'archivio),
il 10% dell'allenatore e il 5% del guidatore. Prova su 1.685 piazzamenti gia'
in archivio con il premio vero (2016, 2019, 2022, 2024, 2025, 2026): il netto
calcolato coincide entro il 2% in 1.609 casi (95%), senza differenze fra gli
anni. Le eccezioni sono corse con una ripartizione speciale. (Una prima prova
sembrava peggiore nel 2025-2026: era l'archivio, dove in parte di quelle gare
il "lordo" e' uguale al netto.) Si usa la stima SOLO se il premio vero manca: il
premio calcolato e' segnato (races.prize_calc = 1) e quando la scheda del
cavallo su TrottoWeb porta il premio vero, lo sostituisce.

Le schede "Prestazioni del cavallo" della stessa fonte NON si leggono: il sito
le esclude ai programmi automatici (robots.txt).

QUANTO C'E' DA PRENDERE (misurato sull'archivio del 10/11/2026, abbinando per
data e nome senza punteggiatura). Partenze ufficiali 2016-2026 senza una gara
datata in archivio: 120.968, di cui
    80.808  cavallo del tutto assente dall'archivio (2.813 cavalli)
    15.321  cavallo presente come riproduttore (596 fattrici e stalloni)
    10.534  atleta che ha gare SENZA DATA: sono con ogni probabilita' le
            stesse gare, a cui questa fonte puo' dare la data
    14.305  atleta senza gare senza data: buchi veri o nomi scritti diversi
Le giornate da rileggere sono 9.505 su 9.620: una mezz'ora di rete in tutto.

COME LAVORA, in due tempi separati.
  1. RACCOLTA (rete). Rilegge le giornate che hanno partenti non abbinati.
     Ogni pagina si mette alla prova da sola: i cavalli che in archivio hanno
     gia' quella gara devono tornare con lo stesso arrivo, distanza, tempo e
     numero. Se concorda meno del 90% delle righe confrontabili, la pagina si
     scarta per intero (il lettore ha capito male, o la pagina e' diversa).
     Dalle righe che concordano si IMPARA come l'archivio scrive le cose: il
     guidatore ("Fiore Cosimo" -> "C.Fiore"), l'esito ("RP" -> "r.p."),
     l'ippodromo ("IT43" -> TARANTO, sigla TA). Le righe che in archivio
     mancano finiscono in gare_ufficiali_attesa, non ancora fra le gare.
  2. INSERIMENTO (senza rete, ripetibile). Dalla tabella di attesa:
     - gara senza data dello stesso cavallo con stesso ippodromo, distanza e
       tempo, se e' una sola: le si da' la data (nessuna riga nuova);
     - cavallo gia' in archivio come riproduttore: si aggiunge la gara e i
       totali di carriera del registro ufficiale NON si toccano;
     - cavallo assente nato prima del 2012: si crea la scheda come
       riproduttore (la regola del progetto: horse_class='breeder' per i nati
       prima di ATHLETE_MIN_BIRTH_YEAR) con source_role='gare_ufficiali', e si
       aggiunge la gara. I totali di carriera restano VUOTI: sarebbero
       parziali (solo dal 2016) e con career_races > 0 il cavallo entrerebbe
       nella classifica storica spostandone i percentili;
     - atleti (nati dal 2012) con gare mancanti o del tutto assenti: di base
       NON si toccano, perche' una gara in piu' cambia il loro voto. Si
       abilitano con --atleti dopo aver guardato il rapporto.
     Padre e madre dei cavalli nuovi restano nella tabella di attesa e non
     vanno sulla scheda (--genitori li scrive): sulla scheda farebbero partire
     la ricerca dei genitori mancanti (phase_parents_coverage) per migliaia
     di fattrici degli anni '90 e cambierebbero il numero di figli degli
     stalloni.

COSA NON CAMBIA: voti e classifiche degli atleti (i nuovi sono riproduttori,
fuori dai percentili), classifica storica, totali di carriera esistenti.
COSA CAMBIA, ed e' voluto: le corse 2016-2019 tornano con il campo completo,
quindi statistiche di guidatori, ippodromi, numeri di partenza, allenatori e
proprietari contano anche quelle partenze. Chi riaddestra i modelli che
leggono le corse (primi tre, galoppo) trovera' piu' righe in quegli anni: i
file *_verifica.json vanno rifatti solo di proposito.

CAUTELE.
  - Omonimi: se l'anno di nascita della pagina e' diverso da quello della
    scheda in archivio, e' un altro cavallo: la riga si salta.
  - Nome che corrisponde a due schede: si salta.
  - Esito o ippodromo che non si e' imparato a tradurre: si salta, non si
    indovina. Guidatore mai visto: si scrive "I.Cognome" come fa l'archivio.
  - Un cavallo non corre due volte lo stesso giorno: se la gara c'e', non si
    duplica.
  - --prova fa tutto e poi annulla: stampa solo i conti.

PER CHI LO INTEGRA.
  1. Copiare questo file in scripts/gare_ufficiali.py.
  2. PRIMA di tutto lanciare la sonda su GitHub Actions (da li' la fonte
     risponde): python3 scripts/gare_ufficiali.py --db data.db --sonda 20
     Non scrive nulla. Deve dare concordanza sopra il 95%. Il lettore e' stato
     scritto sull'ordine dei campi descritto sopra e provato su pagine
     ricostruite, NON sull'HTML vero: se la sonda da' meno, va corretto
     leggi_giornata() guardando una pagina reale (--mostra <codice> <data>).
  3. Poi: --prova per vedere i conti, infine senza --prova.
  4. Nel lavoro notturno degli allenatori (archivio-allenatori.yml) va PRIMA
     di allenatori.py, cosi' la stessa notte le gare nuove ricevono allenatore
     e proprietario:  python3 scripts/gare_ufficiali.py --db data.db --minuti 40
  5. In nightly_update.py, _parent_candidates(): escludere le schede con
     source_role='gare_ufficiali' se si usa --genitori.
  6. Controlli dopo il primo giro: voti degli atleti identici a prima; nessun
     doppione (cavallo, data); scripts/prepara_archivio.sh passa; il file
     cresce di circa 50 MB aperto (0,5 KB a gara) piu' la tabella di attesa,
     che a lavoro finito si svuota con --pulisci.

Uso:
  python3 scripts/gare_ufficiali.py --db data.db --rapporto      # solo conti, niente rete
  python3 scripts/gare_ufficiali.py --db data.db --sonda 20      # prova il lettore, non scrive
  python3 scripts/gare_ufficiali.py --db data.db --mostra IT43 2016-05-17
  python3 scripts/gare_ufficiali.py --db data.db --minuti 40 --prova
  python3 scripts/gare_ufficiali.py --db data.db --minuti 40
  python3 scripts/gare_ufficiali.py --db data.db --solo-inserimento [--atleti] [--genitori]
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:                                   # nel progetto: stessa rete e stessa chiave degli allenatori
    from allenatori import scarica, chiave_nome, LETTORI
except Exception:                      # da solo (prove): stesse regole, copiate
    import html as _html
    LETTORI = 10

    def scarica(percorso: str):        # pragma: no cover - serve solo fuori dal progetto
        import urllib.request
        req = urllib.request.Request("https://database.grandeippicaitaliana.it" + percorso,
                                     headers={"User-Agent": "Mozilla/5.0 (StatIppica)"})
        try:
            return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
        except Exception:
            return None

    def chiave_nome(nome: str) -> str:
        n = _html.unescape(nome).upper()
        n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
        return re.sub(r"[^A-Z0-9]", "", n)

PRIMA_DATA = "2016-01-01"              # da qui la fonte ufficiale ha le giornate
ANNO_ATLETI = int(os.environ.get("ATHLETE_MIN_BIRTH_YEAR", "2012"))
SOGLIA_CONCORDANZA = 0.90              # sotto, la pagina si scarta
MIN_CONFRONTI = 5                      # righe confrontabili per fidarsi della soglia
QUOTA_MAPPA = 0.60                     # una traduzione vale se vince con almeno il 60%
ERRORI_DI_FILA = 6
ORIGINE = "gare_ufficiali"

# Esiti: la traduzione si impara dalle righe che concordano; questi sono i
# due sicuri, per le prime pagine. Gli altri (RC, RI, ...) solo se imparati.
ESITI_NOTI = {"RP": "r.p.", "RA": "r.a."}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def adesso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def nome_archivio(nome: str) -> str:
    """Come l'archivio scrive i nomi: maiuscolo, spazi singoli."""
    return re.sub(r"\s+", " ", (nome or "").strip().upper())


# ── Lettura della pagina di una giornata ────────────────────────────────────

RE_CORSA = re.compile(r"Corsa\s+(\d+)\s+delle")
RE_SIGLA = re.compile(r"^([mfc])([a-z]{0,3})(\d{1,2})$")
RE_TEMPO = re.compile(r"^(?:\d\.)?(\d{1,2}\.\d)$")
RE_QUOTA = re.compile(r"^\d{1,4},\d{1,2}$")
RE_EURO = re.compile(r"Euro\s+([\d.]+)")
RE_METRI = re.compile(r"Metri\s+(\d{3,4})")
RE_ESITO = re.compile(r"^[A-Z]{1,4}$")


class _Eventi(HTMLParser):
    """Riduce la pagina a una fila di eventi nell'ordine in cui si leggono:
    ('corsa', n) - ('cavallo', nome, testo del collegamento) - ('testo', t).
    Non dipende da tabelle, classi o grassetti: solo dall'ordine dei campi."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.eventi: list[tuple] = []
        self._muto = 0
        self._cavallo = None
        self._pezzi: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._muto += 1
            return
        a = dict(attrs)
        titolo = a.get("title") or ""
        m = RE_CORSA.search(titolo)
        if m:
            self.eventi.append(("corsa", int(m.group(1))))
        if tag == "a" and titolo.startswith("Prestazioni del cavallo "):
            self._cavallo = titolo[len("Prestazioni del cavallo "):].strip()
            self._pezzi = []

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._muto:
            self._muto -= 1
        elif tag == "a" and self._cavallo is not None:
            self.eventi.append(("cavallo", self._cavallo, " ".join(self._pezzi)))
            self._cavallo = None

    def handle_data(self, data):
        if self._muto:
            return
        t = re.sub(r"\s+", " ", data).strip()
        if not t:
            return
        if self._cavallo is not None:
            self._pezzi.append(t)
            return
        m = RE_CORSA.search(t)
        if m:
            self.eventi.append(("corsa", int(m.group(1))))
        self.eventi.append(("testo", t))


def _numero(t: str):
    t = re.sub(r"[°ºª.]+$", "", t)
    return int(t) if t.isdigit() and 0 < int(t) < 40 else None


def _testa(testi: list[str]) -> tuple:
    """Arrivo e numero di partenza: i due ultimi pezzi prima del nome.
    Ritorna (arrivo, sigla_esito, numero, quanti testi ha consumato)."""
    pezzi, usati = [], 0
    for t in reversed(testi):
        pezzi = t.split() + pezzi
        usati += 1
        if len(pezzi) >= 2 or usati >= 2:
            break
    if len(pezzi) < 2:
        return None, None, None, 0
    primo, numero = pezzi[-2], _numero(pezzi[-1])
    if numero is None:
        return None, None, None, 0
    if _numero(primo) is not None:
        return _numero(primo), None, numero, usati
    if RE_ESITO.match(primo):
        return None, primo, numero, usati
    return None, None, None, 0


def _coda(testi: list[str]) -> dict:
    """Quel che segue il nome: distanza, tempo, quota, guidatore, padre e madre."""
    r = {"distanza": None, "tempo": None, "guidatore": None, "padre": None, "madre": None,
         "sigla": None}
    nomi: list[str] = []
    for n, t in enumerate(testi):
        if n == 0 and RE_SIGLA.match(t.lower()):     # sigla fuori dal collegamento
            r["sigla"] = t.lower()
            continue
        pezzi = t.split()
        numerici = all(p.isdigit() or RE_TEMPO.match(p) or RE_QUOTA.match(p)
                       or re.fullmatch(r"[A-Z]{1,2}", p) for p in pezzi)
        if numerici and not nomi:
            for p in pezzi:
                if p.isdigit() and 800 <= int(p) <= 4500 and r["distanza"] is None:
                    r["distanza"] = int(p)
                elif RE_TEMPO.match(p) and r["tempo"] is None:
                    r["tempo"] = float(RE_TEMPO.match(p).group(1))
            continue
        if " e " in t and t != "e":            # "Varenne e Easy Bee" in un pezzo solo
            a, b = t.split(" e ", 1)
            nomi += [a.strip(), "e", b.strip()]
        else:
            nomi.append(t)
    i = nomi.index("e") if "e" in nomi else None
    if i is not None and i >= 1 and i + 1 < len(nomi):
        r["padre"], r["madre"] = nomi[i - 1], nomi[i + 1]
    # Il guidatore e' il primo nome, purche' non sia gia' il padre.
    if nomi and nomi[0] != "e" and i != 1:
        r["guidatore"] = nomi[0]
    return r


def leggi_giornata(testo: str) -> list[dict]:
    """Una riga per ogni cavallo della pagina, con tutti i campi."""
    p = _Eventi()
    p.feed(testo)
    ev = p.eventi

    righe: list[dict] = []
    corsa, intestazione = 0, ""
    in_attesa: list[str] = []      # testi dopo l'ultimo cavallo (o dopo l'inizio corsa)
    aperta = None                  # riga del cavallo precedente, la coda e' ancora da leggere

    def chiudi(coda: list[str]):
        if aperta is None:
            return
        c = _coda(coda)
        sigla = c.pop("sigla")
        aperta.update(c)
        if sigla and aperta.get("eta") is None:
            m = RE_SIGLA.match(sigla)
            aperta.update(sesso=m.group(1).upper(), mantello=m.group(2) or None,
                          eta=int(m.group(3)))

    for e in ev:
        if e[0] == "corsa":
            chiudi(in_attesa)
            aperta, in_attesa = None, []
            corsa, intestazione = e[1], ""
        elif e[0] == "testo":
            in_attesa.append(e[1])
            if aperta is None and corsa:
                intestazione += " " + e[1]
        elif e[0] == "cavallo" and corsa:
            arrivo, esito, numero, usati = _testa(in_attesa)
            chiudi(in_attesa[:len(in_attesa) - usati] if usati else in_attesa)
            nome, etichetta = e[1], e[2]
            m = None
            pezzi = etichetta.split()
            if pezzi:
                m = RE_SIGLA.match(pezzi[-1].lower())
            euro = RE_EURO.search(intestazione)
            metri = RE_METRI.search(intestazione)
            aperta = {
                "corsa": corsa, "cavallo": nome, "chiave": chiave_nome(nome),
                "arrivo": arrivo, "esito": esito, "numero": numero,
                "sesso": m.group(1).upper() if m else None,
                "mantello": (m.group(2) or None) if m else None,
                "eta": int(m.group(3)) if m else None,
                "dotazione": float(euro.group(1).replace(".", "")) if euro else None,
                "metri_corsa": int(metri.group(1)) if metri else None,
            }
            righe.append(aperta)
            in_attesa = []
    chiudi(in_attesa)

    partenti = Counter(r["corsa"] for r in righe)
    for r in righe:
        r["partenti"] = partenti[r["corsa"]]
        if r.get("distanza") is None:
            r["distanza"] = r.get("metri_corsa")
    return righe


# ── Tabelle ─────────────────────────────────────────────────────────────────

def crea_tabelle(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS gare_ufficiali_lette (
            data TEXT, codice TEXT, letta_il TEXT, righe INTEGER,
            confronti INTEGER, concordi INTEGER, in_attesa INTEGER,
            esito TEXT,            -- ok / senza_confronto / scartata / vuota
            PRIMARY KEY (data, codice));
        CREATE TABLE IF NOT EXISTS gare_ufficiali_attesa (
            data TEXT, codice TEXT, corsa INTEGER, cavallo TEXT, chiave TEXT,
            sesso TEXT, mantello TEXT, anno_nascita INTEGER, padre TEXT, madre TEXT,
            arrivo INTEGER, esito TEXT, numero INTEGER, partenti INTEGER,
            distanza INTEGER, tempo REAL, guidatore TEXT, dotazione REAL,
            stato TEXT DEFAULT 'attesa',   -- attesa / inserita / data_assegnata / saltata
            motivo TEXT,
            PRIMARY KEY (data, codice, corsa, chiave));
        CREATE INDEX IF NOT EXISTS idx_gare_uff_attesa_stato ON gare_ufficiali_attesa(stato);
        CREATE TABLE IF NOT EXISTS gare_ufficiali_mappa (
            tipo TEXT,             -- guidatore / esito / ippodromo
            ufficiale TEXT, archivio TEXT, n INTEGER,
            PRIMARY KEY (tipo, ufficiale, archivio));
    """)
    conn.commit()


# ── Premio dei primi cinque dalla regola ufficiale ──────────────────────────

QUOTE_PREMIO = {1: 0.46, 2: 0.22, 3: 0.12, 4: 0.06, 5: 0.04}
QUOTA_PROPRIETARIO = 0.85


def premio_da_regola(arrivo, dotazione, data) -> tuple | None:
    """(netto, lordo) del cavallo, o None se la regola non si applica."""
    if not arrivo or arrivo not in QUOTE_PREMIO or not dotazione or dotazione <= 0:
        return None
    if not data:
        return None
    lordo = round(dotazione / 1.1 * QUOTE_PREMIO[arrivo], 2)
    return round(lordo * QUOTA_PROPRIETARIO, 2), lordo


def colonna_premio_calcolato(conn: sqlite3.Connection) -> None:
    if "prize_calc" not in {r[1] for r in conn.execute("PRAGMA table_info(races)")}:
        conn.execute("ALTER TABLE races ADD COLUMN prize_calc INTEGER")


def calcola_premi(conn: sqlite3.Connection) -> int:
    """Completa le gare gia' inserite dalla fonte ufficiale rimaste senza premio
    (inserite prima che il calcolo esistesse)."""
    n = 0
    ippodromi = {k: tuple(v.split("|", 1)) for k, v in _mappa(conn, "ippodromo", minimo=5).items()}
    for data, codice, corsa, arrivo, dotazione in conn.execute("""
            SELECT data, codice, corsa, arrivo, dotazione FROM gare_ufficiali_attesa
            WHERE stato = 'inserita' AND arrivo BETWEEN 1 AND 5 AND dotazione > 0""").fetchall():
        premio = premio_da_regola(arrivo, dotazione, data)
        if not premio or codice not in ippodromi:
            continue
        n += conn.execute("""UPDATE races SET prize_net = ?, prize_gross = ?, prize_calc = 1
                             WHERE race_code = ? AND race_date = ? AND placement = ?
                               AND prize_net IS NULL""",
                          (premio[0], premio[1], f"{data}_{ippodromi[codice][1]}_{corsa}",
                           data, arrivo)).rowcount
    return n


# ── Cosa manca (senza rete) ─────────────────────────────────────────────────

def _archivio_in_memoria(conn: sqlite3.Connection) -> dict:
    cavalli: dict[str, tuple] = {}
    doppi: set[str] = set()
    for nome, anno, classe in conn.execute(
            "SELECT name, birth_year, COALESCE(horse_class, 'athlete') FROM horses"):
        k = chiave_nome(nome or "")
        if not k:
            continue
        if k in cavalli and cavalli[k][0] != nome:
            doppi.add(k)
        cavalli[k] = (nome, anno, classe)
    datate: set[tuple] = set()
    senza_data: dict[str, int] = Counter()
    for nome, data in conn.execute("SELECT horse_name, race_date FROM races"):
        k = chiave_nome(nome or "")
        if data and data.strip():
            datate.add((k, data))
        else:
            senza_data[k] += 1
    return {"cavalli": cavalli, "doppi": doppi, "datate": datate, "senza_data": senza_data}


def rapporto(conn: sqlite3.Connection) -> dict:
    """Quante partenze ufficiali mancano in archivio, per tipo. Niente rete."""
    a = _archivio_in_memoria(conn)
    tipi, giornate, per_anno = Counter(), set(), defaultdict(Counter)
    for data, codice, k in conn.execute(
            "SELECT data, codice, chiave FROM allenatori_corse WHERE data >= ?", (PRIMA_DATA,)):
        if (k, data) in a["datate"]:
            continue
        if k not in a["cavalli"]:
            t = "cavallo_assente"
        elif a["cavalli"][k][2] == "breeder":
            t = "riproduttore"
        elif a["senza_data"].get(k):
            t = "atleta_con_gare_senza_data"
        else:
            t = "atleta"
        tipi[t] += 1
        per_anno[data[:4]][t] += 1
        giornate.add((data, codice))
    return {"partenze_mancanti": sum(tipi.values()), "per_tipo": dict(tipi),
            "giornate_da_rileggere": len(giornate),
            "per_anno": {y: dict(per_anno[y]) for y in sorted(per_anno)}}


def giornate_da_leggere(conn: sqlite3.Connection, a: dict) -> list[tuple]:
    """Giornate con almeno un partente non abbinato e non ancora rilette,
    prima quelle dove manca di piu'."""
    try:
        lette = {(d, c) for d, c in conn.execute("SELECT data, codice FROM gare_ufficiali_lette")}
    except sqlite3.OperationalError:       # prima volta, o archivio aperto in sola lettura
        lette = set()
    mancanti: Counter = Counter()
    for data, codice, k in conn.execute(
            "SELECT data, codice, chiave FROM allenatori_corse WHERE data >= ?", (PRIMA_DATA,)):
        if (k, data) not in a["datate"] and (data, codice) not in lette:
            mancanti[(data, codice)] += 1
    return [g for g, _ in mancanti.most_common()]


# ── Raccolta (rete) ─────────────────────────────────────────────────────────

def _sigla_da_codice(codice_gara: str):
    m = re.match(r"\d{4}-\d\d-\d\d_([A-Z]+)_", codice_gara or "")
    if m:
        return m.group(1)
    return codice_gara if re.fullmatch(r"[A-Z]{2,3}", codice_gara or "") else None


def confronta(conn: sqlite3.Connection, data: str, righe: list[dict]) -> dict:
    """Mette la pagina alla prova contro le gare che l'archivio ha gia'."""
    in_archivio: dict[str, tuple] = {}
    for nome, arrivo, esito, tempo, dist, numero, guid, pista, cod in conn.execute("""
            SELECT horse_name, placement, placement_raw, time_km, distance, start_pos,
                   driver, track, race_code
            FROM races WHERE race_date = ? AND track != 'ESTERO'""", (data,)):
        in_archivio[chiave_nome(nome or "")] = (arrivo, esito, tempo, dist, numero, guid, pista, cod)

    confronti = concordi = 0
    mancanti, impara = [], []
    for r in righe:
        g = in_archivio.get(r["chiave"])
        if g is None:
            mancanti.append(r)
            continue
        arrivo, esito, tempo, dist, numero, guid, pista, cod = g
        prove = []
        if arrivo is not None or r["arrivo"] is not None:
            prove.append(arrivo == r["arrivo"])
        if dist and r.get("distanza"):
            prove.append(int(dist) == int(r["distanza"]))
        if tempo is not None and r.get("tempo") is not None:
            try:
                prove.append(abs(float(tempo) - float(r["tempo"])) < 0.05)
            except (TypeError, ValueError):
                pass
        if numero and r.get("numero"):
            prove.append(int(numero) == int(r["numero"]))
        if len(prove) < 2:
            continue
        confronti += 1
        if all(prove):
            concordi += 1
            impara.append((r, esito, guid, pista, cod))
    return {"confronti": confronti, "concordi": concordi, "mancanti": mancanti, "impara": impara}


def _impara(conn: sqlite3.Connection, codice: str, impara: list) -> None:
    conti: Counter = Counter()
    for r, esito, guid, pista, cod in impara:
        if r.get("guidatore") and guid:
            conti[("guidatore", r["guidatore"], guid)] += 1
        if r.get("esito") and r["arrivo"] is None and esito:
            conti[("esito", r["esito"], esito)] += 1
        sigla = _sigla_da_codice(cod)
        if pista and sigla:
            conti[("ippodromo", codice, f"{pista}|{sigla}")] += 1
    conn.executemany("""
        INSERT INTO gare_ufficiali_mappa (tipo, ufficiale, archivio, n) VALUES (?,?,?,?)
        ON CONFLICT(tipo, ufficiale, archivio) DO UPDATE SET n = n + excluded.n""",
        [(t, u, a, n) for (t, u, a), n in conti.items()])


def _salva_pagina(conn: sqlite3.Connection, data: str, codice: str, righe: list[dict]) -> str:
    if not righe:
        esito, c = "vuota", {"confronti": 0, "concordi": 0, "mancanti": []}
    else:
        c = confronta(conn, data, righe)
        if c["confronti"] >= MIN_CONFRONTI:
            esito = "ok" if c["concordi"] / c["confronti"] >= SOGLIA_CONCORDANZA else "scartata"
        elif c["confronti"] == c["concordi"]:
            esito = "ok" if c["confronti"] else "senza_confronto"
        else:
            esito = "scartata"
    messe = 0
    if esito in ("ok", "senza_confronto"):
        if esito == "ok":
            _impara(conn, codice, c["impara"])
        anno = int(data[:4])
        for r in c["mancanti"]:
            if not r["chiave"] or r.get("numero") is None:
                continue
            conn.execute("""
                INSERT OR IGNORE INTO gare_ufficiali_attesa
                    (data, codice, corsa, cavallo, chiave, sesso, mantello, anno_nascita,
                     padre, madre, arrivo, esito, numero, partenti, distanza, tempo,
                     guidatore, dotazione)
                VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?)""",
                (data, codice, r["corsa"], r["cavallo"], r["chiave"], r["sesso"], r["mantello"],
                 anno - r["eta"] if r.get("eta") else None,
                 nome_archivio(r.get("padre") or "") or None,
                 nome_archivio(r.get("madre") or "") or None,
                 r["arrivo"], r["esito"], r["numero"], r["partenti"], r.get("distanza"),
                 r.get("tempo"), r.get("guidatore"), r.get("dotazione")))
            messe += 1
    conn.execute("""
        INSERT OR REPLACE INTO gare_ufficiali_lette
            (data, codice, letta_il, righe, confronti, concordi, in_attesa, esito)
        VALUES (?,?,?,?,?,?,?,?)""",
        (data, codice, adesso(), len(righe), c["confronti"], c["concordi"], messe, esito))
    return esito


def raccogli(conn: sqlite3.Connection, minuti: float, massimo: int | None = None) -> dict:
    a = _archivio_in_memoria(conn)
    lista = giornate_da_leggere(conn, a)
    if massimo:
        lista = lista[:massimo]
    log(f"[GARE-UFFICIALI] giornate da rileggere: {len(lista)} (al massimo {minuti:.0f} minuti)")
    fine = time.monotonic() + minuti * 60
    esiti: Counter = Counter()
    errori = 0
    with cf.ThreadPoolExecutor(max_workers=LETTORI) as ex:
        for i in range(0, len(lista), 50):
            if time.monotonic() > fine:
                log("[GARE-UFFICIALI] tempo finito: riprendo la prossima volta.")
                break
            blocco = lista[i:i + 50]
            pagine = list(ex.map(lambda g: scarica(f"/risultati/giornata/T/{g[1]}/{g[0]}"), blocco))
            for (data, codice), testo in zip(blocco, pagine):
                if testo is None:
                    errori += 1
                    esiti["errore_rete"] += 1
                    continue
                errori = 0
                try:
                    righe = leggi_giornata(testo)
                except Exception as e:           # una pagina strana non ferma la notte
                    log(f"  [GARE-UFFICIALI] {codice} {data}: {e}")
                    righe = []
                esiti[_salva_pagina(conn, data, codice, righe)] += 1
            conn.commit()
            if errori >= ERRORI_DI_FILA:
                log("[GARE-UFFICIALI] la fonte non risponde: riprendo la prossima volta.")
                break
            if (i // 50) % 10 == 0:
                log(f"  {i + len(blocco)}/{len(lista)} giornate: {dict(esiti)}")
    return dict(esiti)


# ── Inserimento (senza rete) ────────────────────────────────────────────────

def _mappa(conn: sqlite3.Connection, tipo: str, minimo: int = 1) -> dict:
    per: dict[str, Counter] = defaultdict(Counter)
    for u, a, n in conn.execute(
            "SELECT ufficiale, archivio, n FROM gare_ufficiali_mappa WHERE tipo = ?", (tipo,)):
        per[u][a] += n
    out = {}
    for u, c in per.items():
        a, n = c.most_common(1)[0]
        if n >= minimo and n / sum(c.values()) >= QUOTA_MAPPA:
            out[u] = a
    return out


def guidatore_alla_maniera_dell_archivio(nome: str) -> str:
    """"Fiore Cosimo" -> "C.Fiore". Solo per i guidatori mai visti in archivio."""
    pulito = re.sub(r"\s*\([^)]*\)\s*", " ", nome).strip()
    pezzi = pulito.split()
    if len(pezzi) < 2:
        return pulito
    particelle = {"DI", "DE", "DEL", "DELLA", "D'", "LO", "LA", "LE", "LI", "VAN", "VON"}
    i = 1
    while i < len(pezzi) - 1 and pezzi[i - 1].upper() in particelle:
        i += 1
    cognome, resto = " ".join(pezzi[:i]), pezzi[i:]
    coda = " " + " ".join(resto[1:]) if len(resto) > 1 else ""
    return f"{resto[0][0].upper()}.{cognome}{coda}"


def inserisci(conn: sqlite3.Connection, atleti: bool = False, genitori: bool = False,
              date: bool = True) -> dict:
    a = _archivio_in_memoria(conn)
    cavalli, doppi, datate = a["cavalli"], a["doppi"], a["datate"]
    guidatori = _mappa(conn, "guidatore", minimo=2)
    esiti = {**ESITI_NOTI, **_mappa(conn, "esito", minimo=3)}
    ippodromi = {k: tuple(v.split("|", 1)) for k, v in _mappa(conn, "ippodromo", minimo=5).items()}

    conti: Counter = Counter()
    colonne = {r[1] for r in conn.execute("PRAGMA table_info(horses)")}

    def segna(riga, stato, motivo=None):
        conn.execute("""UPDATE gare_ufficiali_attesa SET stato = ?, motivo = ?
                        WHERE data = ? AND codice = ? AND corsa = ? AND chiave = ?""",
                     (stato, motivo, riga[0], riga[1], riga[2], riga[4]))
        conti[motivo or stato] += 1

    # Si lavora solo sulle giornate che hanno superato la prova.
    attesa = conn.execute("""
        SELECT t.data, t.codice, t.corsa, t.cavallo, t.chiave, t.sesso, t.mantello,
               t.anno_nascita, t.padre, t.madre, t.arrivo, t.esito, t.numero, t.partenti,
               t.distanza, t.tempo, t.guidatore, t.dotazione
        FROM gare_ufficiali_attesa t
        JOIN gare_ufficiali_lette l ON l.data = t.data AND l.codice = t.codice
        WHERE l.esito = 'ok' AND (t.stato = 'attesa' OR t.stato = 'saltata')
        ORDER BY t.data""").fetchall()

    for riga in attesa:
        (data, codice, corsa, cavallo, k, sesso, mantello, anno, padre, madre,
         arrivo, esito, numero, partenti, distanza, tempo, guid_uff, dotazione) = riga

        if (k, data) in datate:
            segna(riga, "saltata", "gia_presente")
            continue
        if k in doppi:
            segna(riga, "saltata", "nome_di_due_schede")
            continue
        if codice not in ippodromi:
            segna(riga, "saltata", "ippodromo_non_imparato")
            continue
        pista, sigla = ippodromi[codice]
        if arrivo is not None:
            esito_arch = f"{arrivo}º"
        elif esito in esiti:
            esito_arch = esiti[esito]
        else:
            segna(riga, "saltata", "esito_non_imparato")
            continue
        guidatore = guidatori.get(guid_uff) or (
            guidatore_alla_maniera_dell_archivio(guid_uff) if guid_uff else None)
        codice_gara = f"{data}_{sigla}_{corsa}"

        scheda = cavalli.get(k)
        if scheda is not None:
            nome, anno_arch, classe = scheda
            if anno and anno_arch and int(anno) != int(anno_arch):
                segna(riga, "saltata", "omonimo_altro_anno")
                continue
            # Una gara senza data dello stesso cavallo e' con ogni probabilita' questa.
            if date:
                candidate = conn.execute("""
                    SELECT id FROM races
                    WHERE horse_name = ? AND (race_date IS NULL OR TRIM(race_date) = '')
                      AND track = ? AND distance = ?
                      AND ((time_km IS NULL AND ? IS NULL) OR ABS(time_km - ?) < 0.05)
                      AND COALESCE(placement, -1) = COALESCE(?, -1)""",
                    (nome, pista, distanza, tempo, tempo, arrivo)).fetchall()
                if len(candidate) == 1:
                    conn.execute("""
                        UPDATE races SET race_date = ?,
                               race_number = COALESCE(race_number, ?),
                               start_pos = COALESCE(start_pos, ?),
                               total_starters = COALESCE(total_starters, ?)
                        WHERE id = ?""", (data, corsa, numero, partenti, candidate[0][0]))
                    datate.add((k, data))
                    segna(riga, "data_assegnata")
                    continue
            if classe != "breeder" and not atleti:
                segna(riga, "saltata", "atleta_non_abilitato")
                continue
        else:
            if anno is None:
                segna(riga, "saltata", "eta_non_letta")
                continue
            classe = "breeder" if int(anno) < ANNO_ATLETI else "athlete"
            if classe == "athlete" and not atleti:
                segna(riga, "saltata", "atleta_assente_non_abilitato")
                continue
            nome = nome_archivio(re.sub(r"\s*\([^)]*\)\s*$", "", cavallo))
            paese = re.search(r"\(([A-Z]{2,3})\)\s*$", cavallo.upper())
            valori = {
                "name": nome, "birth_year": int(anno), "sex": sesso,
                "country": paese.group(1) if paese else None,
                "sire": padre if genitori else None, "dam": madre if genitori else None,
                "source": ORIGINE, "source_role": ORIGINE, "horse_class": classe,
                # i riproduttori non passano dal controllo dei buchi su TrottoWeb,
                # che per loro non ha nulla; un atleta nuovo invece si completa li'
                "backfill_status": "done" if classe == "breeder" else "pending",
                "last_updated": adesso(),
            }
            valori = {c: v for c, v in valori.items() if c in colonne}
            conn.execute(f"INSERT OR IGNORE INTO horses ({', '.join(valori)}) "
                         f"VALUES ({', '.join('?' * len(valori))})", list(valori.values()))
            cavalli[k] = (nome, int(anno), classe)
            conti["schede_create"] += 1

        # Premio del singolo cavallo: la fonte non lo da'. Dal sesto in giu' e
        # per chi non e' classificato e' zero; per i primi cinque si calcola
        # dalla regola ufficiale (vedi in cima), e resta vuoto se non si puo'.
        calcolato = premio_da_regola(arrivo, dotazione, data)
        if calcolato:
            netto, lordo, segno = calcolato[0], calcolato[1], 1
        elif arrivo is not None and arrivo <= 5:
            netto, lordo, segno = None, None, None
        else:
            netto, lordo, segno = 0.0, None, None
        cur = conn.execute("""
            INSERT OR IGNORE INTO races
                (horse_name, race_date, track, placement, placement_raw, time_km, distance,
                 driver, prize_net, prize_gross, race_code, race_number, start_pos,
                 total_starters, prize_calc)
            VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?)""",
            (nome, data, pista, arrivo, esito_arch, tempo, distanza, guidatore,
             netto, lordo, codice_gara, corsa, numero, partenti, segno))
        if cur.rowcount:
            datate.add((k, data))
            segna(riga, "inserita")
        else:
            segna(riga, "saltata", "gia_presente")
    return dict(conti)


# ── Sonda e comandi ─────────────────────────────────────────────────────────

def sonda(conn: sqlite3.Connection, quante: int) -> int:
    """Legge alcune giornate e dice quanto il lettore concorda con l'archivio.
    Non scrive nulla. Da lanciare dove la fonte risponde (GitHub Actions)."""
    a = _archivio_in_memoria(conn)
    lista = giornate_da_leggere(conn, a)
    passo = max(1, len(lista) // max(1, quante))
    scelte = lista[::passo][:quante]
    tot_c = tot_ok = tot_m = 0
    for data, codice in scelte:
        testo = scarica(f"/risultati/giornata/T/{codice}/{data}")
        if not testo:
            log(f"  {codice} {data}: nessuna risposta")
            continue
        righe = leggi_giornata(testo)
        c = confronta(conn, data, righe)
        tot_c += c["confronti"]
        tot_ok += c["concordi"]
        tot_m += len(c["mancanti"])
        senza_eta = sum(1 for r in c["mancanti"] if not r.get("eta"))
        log(f"  {codice} {data}: {len(righe)} righe, concordano {c['concordi']}/{c['confronti']}, "
            f"mancanti in archivio {len(c['mancanti'])} (senza eta' {senza_eta})")
    quota = tot_ok / tot_c if tot_c else 0.0
    log(f"[SONDA] concordanza {tot_ok}/{tot_c} = {quota:.1%}; righe mancanti trovate {tot_m}")
    log("[SONDA] " + ("BENE: si puo' procedere." if quota >= 0.95 and tot_c >= 50
                      else "NON BASTA: guardare una pagina con --mostra e correggere leggi_giornata()."))
    return 0 if quota >= 0.95 and tot_c >= 50 else 2


def main() -> int:
    ap = argparse.ArgumentParser(description="Gare mancanti dalla fonte ufficiale (dal 2016)")
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--minuti", type=float, default=float(os.environ.get("GARE_UFFICIALI_MINUTI", "40")))
    ap.add_argument("--giornate", type=int, default=None, help="al massimo N giornate")
    ap.add_argument("--rapporto", action="store_true", help="solo conti, niente rete")
    ap.add_argument("--sonda", type=int, default=0, metavar="N", help="prova il lettore su N giornate")
    ap.add_argument("--mostra", nargs=2, metavar=("CODICE", "DATA"), help="stampa le righe lette")
    ap.add_argument("--solo-inserimento", action="store_true")
    ap.add_argument("--atleti", action="store_true",
                    default=os.environ.get("GARE_UFFICIALI_ATLETI", "0") == "1",
                    help="aggiunge le gare anche ai nati dal 2012 (cambia i loro voti)")
    ap.add_argument("--genitori", action="store_true",
                    default=os.environ.get("GARE_UFFICIALI_GENITORI", "0") == "1",
                    help="scrive padre e madre sulle schede nuove")
    ap.add_argument("--senza-date", action="store_true", help="non assegna le date mancanti")
    ap.add_argument("--prova", action="store_true", help="fa tutto e poi annulla")
    ap.add_argument("--pulisci", action="store_true", help="svuota la tabella di attesa lavorata")
    a = ap.parse_args()

    if a.mostra:
        testo = scarica(f"/risultati/giornata/T/{a.mostra[0]}/{a.mostra[1]}")
        for r in leggi_giornata(testo or ""):
            print(r)
        return 0

    if a.rapporto or a.sonda:              # sola lettura: non si crea nemmeno una tabella
        conn = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
        if a.rapporto:
            log("[GARE-UFFICIALI] rapporto:", rapporto(conn))
            return 0
        return sonda(conn, a.sonda)
    conn = sqlite3.connect(a.db)
    crea_tabelle(conn)
    colonna_premio_calcolato(conn)
    if a.pulisci:
        n = conn.execute("DELETE FROM gare_ufficiali_attesa WHERE stato IN ('inserita','data_assegnata')").rowcount
        conn.commit()
        log(f"[GARE-UFFICIALI] tolte dall'attesa {n} righe gia' lavorate")
        return 0

    if a.prova:
        # In prova nulla deve restare: si lavora su una copia in memoria.
        copia = sqlite3.connect(":memory:")
        conn.backup(copia)
        conn.close()
        conn = copia
    if not a.solo_inserimento:
        log("[GARE-UFFICIALI] raccolta:", raccogli(conn, a.minuti, a.giornate))
    prima = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    esito = inserisci(conn, atleti=a.atleti, genitori=a.genitori, date=not a.senza_date)
    esito["premi_completati"] = calcola_premi(conn)
    conn.commit()
    dopo = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    log("[GARE-UFFICIALI] inserimento:", esito)
    log(f"[GARE-UFFICIALI] gare in archivio: {prima} -> {dopo} (+{dopo - prima})"
        + ("  [PROVA: niente e' stato salvato]" if a.prova else ""))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
