"""
Fonte UNIRE (ex ASSI / Masaf) — banca dati ufficiale del trotto italiano.

Perche' serve: Trottoweb (cavAn.php) copre solo i cavalli "da 2 a 14 anni
(10 per le femmine)", quindi non restituisce le fattrici, che hanno la carriera
conclusa. UNIRE copre invece gli anni di nascita dal 1900 in avanti e per ogni
cavallo espone anagrafica, genealogia su 3 generazioni e i totali di carriera
(corse, vittorie, piazzamenti, record al km, vincite).

Due endpoint, entrambi su https://www.unire.it/index.php/ita/trotto/list :
  1) POST {name, sex, year}  -> elenco risultati; ogni riga contiene i link
     `list?id_cav=<id>` dello stallone e della fattrice.
     ATTENZIONE: la ricerca richiede TUTTI E TRE i campi. Con il solo nome
     risponde "Ho trovato 0 cavalli".
  2) GET  {id_cav}           -> scheda completa del cavallo.

Di conseguenza una fattrice, di cui non conosciamo l'anno di nascita, non e'
cercabile direttamente: la si raggiunge partendo da un FIGLIO (di cui sappiamo
nome, sesso e anno) e seguendo il link della fattrice. Una sola ricerca sblocca
la madre per tutti i suoi figli.

Dati aggiornati dalla fonte al 17-04-2024: adeguato per cavalli a carriera
conclusa, non per la forma recente (che continua ad arrivare da Trottoweb).
"""

from __future__ import annotations

import re
import sys
import time
from typing import Optional

import requests
from bs4 import BeautifulSoup

UNIRE_LIST = "https://www.unire.it/index.php/ita/trotto/list"
UNIRE_DELAY = 1.0  # sito istituzionale: una richiesta al secondo, non di piu'

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "StatIppica-NightlyBot/1.0 (+https://github.com/matteopetracca6-bit/statippica)"
})


def _norm(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s.strip()).upper()


def _sex_codes(sex: Optional[str]) -> list[str]:
    """UNIRE usa M/F/C. Un castrone nel nostro DB puo' essere registrato come M
    alla nascita, quindi proviamo entrambi prima di dichiarare il cavallo assente."""
    s = (sex or "").upper()
    if s == "F":
        return ["F"]
    if s == "C":
        return ["C", "M"]
    if s == "M":
        return ["M", "C"]
    return ["M", "F", "C"]


class UnireUnavailable(Exception):
    """La fonte non risponde (timeout, 502, connessione rifiutata).

    E' fondamentale distinguerla dal caso "cavallo non presente in banca dati":
    se li trattassimo allo stesso modo, un'indisponibilita' temporanea del sito
    marcherebbe come 'gia' tentati' centinaia di genitori, escludendoli per
    sempre dalla coda di recupero.
    """


RETRIES = 3
BACKOFF = 5  # secondi, moltiplicati per il numero di tentativo


def _get(url: str, **kwargs) -> requests.Response:
    method = kwargs.pop("method", "GET")
    last = ""
    for attempt in range(1, RETRIES + 1):
        try:
            resp = SESSION.request(method, url, timeout=30, **kwargs)
        except requests.exceptions.RequestException as e:
            last = f"{type(e).__name__}"
        else:
            if resp.status_code == 200:
                return resp
            last = f"HTTP {resp.status_code}"
        if attempt < RETRIES:
            time.sleep(BACKOFF * attempt)
    print(f"    [UNIRE WARN] {last} dopo {RETRIES} tentativi", file=sys.stderr)
    raise UnireUnavailable(last)


def find_parent_ids(name: str, sex: Optional[str], birth_year: int) -> Optional[dict]:
    """Cerca un cavallo per nome+sesso+anno e restituisce
    {'sire': (nome, id), 'dam': (nome, id)} della riga che corrisponde esattamente al nome.

    Il match sul nome e' necessario: la ricerca e' "contiene", quindi cercando
    FALENA si ottengono anche EDNA BROLINE ecc., e prendere la prima riga
    assegnerebbe al cavallo i genitori di un altro.
    """
    target = _norm(name)
    for code in _sex_codes(sex):
        resp = _get(UNIRE_LIST, method="POST",
                    data={"name": name, "sex": code, "year": str(birth_year)})
        time.sleep(UNIRE_DELAY)
        soup = BeautifulSoup(resp.text, "html.parser")
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 7:
                continue
            if _norm(tds[0].get_text()) != target:
                continue
            out: dict = {}
            for key, cell in (("sire", tds[5]), ("dam", tds[6])):
                link = cell.find("a", href=True)
                cid = None
                if link and "id_cav=" in link["href"]:
                    cid = link["href"].split("id_cav=")[-1].strip() or None
                out[key] = (_norm(cell.get_text()), cid)
            return out
    return None


_CAREER_RE = re.compile(
    r"carriera\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9.']+)\s+([\d.,]+)\s+ultimi", re.IGNORECASE
)
_HEADER_RE = re.compile(
    r"(maschio|femmina|castrone)\s+([A-Za-z ]+?)\s+(\d{4})\s+(.+?)\s+Passaporto", re.IGNORECASE
)


def fetch_horse(id_cav: str) -> Optional[dict]:
    """Scheda completa di un cavallo dato l'id UNIRE.
    Ritorna nome, sesso, anno, paese, genitori e totali di carriera."""
    resp = _get(UNIRE_LIST, params={"id_cav": id_cav})
    time.sleep(UNIRE_DELAY)
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(" ", strip=True)
    if "La scheda" not in text:
        return None

    out: dict = {"id_cav": str(id_cav)}
    out["name"] = _norm(text.split("Banca dati Trotto", 1)[1].split("La scheda", 1)[0])

    m = _HEADER_RE.search(text)
    if m:
        out["sex"] = {"maschio": "M", "femmina": "F", "castrone": "C"}[m.group(1).lower()]
        out["birth_year"] = int(m.group(3))
        out["country"] = m.group(4).strip()

    # Genealogia: i due link di primo livello nella scheda sono stallone e fattrice
    for label, key in (("Stallone", "sire"), ("Fattrice", "dam")):
        mm = re.search(rf"{label}\s+([A-Z0-9À-ÖØ-öø-ÿ'\.\- ]+?)\s+[a-zA-Z]+\s+\d{{4}}", text)
        if mm:
            out[key] = _norm(mm.group(1))

    mc = _CAREER_RE.search(text)
    if mc:
        out["career_races"] = int(mc.group(1))
        out["career_wins"] = int(mc.group(2))
        out["career_places"] = int(mc.group(3))
        rec = mc.group(4)
        # UNIRE scrive il record come 01.10.8 -> lo convertiamo nel formato
        # gia' usato nel DB (1'10"8), altrimenti _time_to_seconds non lo legge.
        rm = re.match(r"0?(\d+)\.(\d+)\.(\d+)$", rec)
        out["record_career"] = f"{int(rm.group(1))}'{rm.group(2)}\"{rm.group(3)}" if rm else None
        out["career_earnings"] = float(mc.group(5).replace(".", "").replace(",", "."))
    else:
        # "carriera 0 0 0 0" (mai corso): la fonte non stampa record ne' vincite
        out["career_races"] = out["career_wins"] = out["career_places"] = 0
        out["career_earnings"] = 0.0
        out["record_career"] = None
    return out
