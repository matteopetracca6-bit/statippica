#!/usr/bin/env python3
"""
Raccoglie i risultati delle aste yearling di trotto italiane e li salva in un
file verificabile: aste_yearling.csv.

PERCHE' ESISTE QUESTO SCRIPT. La stima di rivendita usata dal sito era
costruita su 401 lotti d'asta che stavano in un file creato a mano, e nessuno
script li ricostruiva. Un numero che nessuno puo' rifare non e' verificabile:
non si sa da dove viene, non si puo' aggiornare l'anno dopo, e in una tesi non
si puo' difendere. Questo script rifa' la raccolta da zero ogni volta, dalle
pagine ufficiali degli organizzatori.

COSA CONTA COME VENDITA. Il prezzo battuto non e' un prezzo di mercato se il
lotto non ha cambiato proprietario: nelle aste italiane una quota consistente
di lotti viene "ricomprata" dal venditore stesso, cioe' non venduta. Quei lotti
sono registrati ma marcati come non venduti, e le fasce di prezzo si calcolano
solo sulle vendite vere. Chi li contasse otterrebbe prezzi piu' alti di quelli
che il mercato paga davvero.

Fonti: ITS (Asta Selezionata Yearling Trottatori, tabella strutturata con
compratore e prezzo) e ANACT tramite il resoconto ufficiale su GAET.
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from html import unescape
from pathlib import Path

import requests

USCITA = Path(__file__).resolve().parent.parent / "aste_yearling.csv"

INTESTAZIONI = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) StatIppica/1.0 (ricerca statistica)",
    "Accept-Language": "it-IT,it;q=0.9",
}

# Le aste ITS hanno tutte la stessa tabella: si aggiunge un anno mettendo
# l'indirizzo qui.
# Le pagine ITS rifiutano le richieste automatiche (rispondono 202 con una
# pagina vuota), quindi le copie sono conservate in data_aste/ accanto al
# codice. Non e' un ripiego: e' la garanzia che i numeri della tesi restino
# verificabili anche se un domani il sito cambia o sparisce. Se una copia manca,
# lo script prova comunque a scaricarla e lo dice.
ASTE_ITS = [
    ("ITS Asta Selezionata Yearling Trottatori 2025",
     "https://www.its-aste.com/aste/asta-selezionata-yearling-trottatori/",
     "its_2025.html"),
    ("ITS Asta Selezionata Yearlings Trottatori 2024",
     "https://www.its-aste.com/aste/asta-selezionata-yearlings-trottatori-5/",
     "its_2024.html"),
]

CARTELLA_COPIE = Path(__file__).resolve().parent.parent / "data_aste"

ASTA_ANACT = (
    "Asta ANACT yearlings, risultati ufficiali",
    "https://www.gaet.it/notizie/daily/asta-anact-risultati-ufficiali",
)


def pulisci(t: str) -> str:
    """Toglie i tag, normalizza gli accenti e gli spazi."""
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"\s+", " ", t).strip()


def normalizza_nome(n: str) -> str:
    """
    Porta il nome nella forma usata nell'archivio: maiuscolo, senza le sigle
    di nazionalita' che le aste aggiungono al padre, come "(usa)" o "(fr)".
    Senza questo passaggio "Trolley (usa)" non si incontrerebbe mai con
    "TROLLEY" dell'archivio e lo stallone risulterebbe senza dati.
    """
    n = pulisci(n).upper()
    n = re.sub(r"\((?:USA|FR|SWE|IT|GER|NL|DK|FIN|NO|CAN|AUS)\)", " ", n)
    n = re.sub(r"[^A-Z0-9' ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def prezzo_da_testo(t: str) -> int | None:
    """Estrae gli euro. I punti sono separatori di migliaia, non decimali."""
    t = pulisci(t).replace(".", "").replace("\u00a0", " ")
    m = re.search(r"(\d{3,7})", t)
    return int(m.group(1)) if m else None


def scarica(url: str) -> str:
    r = requests.get(url, headers=INTESTAZIONI, timeout=60)
    r.raise_for_status()
    return r.text


def leggi_its(nome_asta: str, url: str, copia: str = "") -> list[dict]:
    """
    La tabella ITS ha una riga per lotto con classi esplicite: horse_name,
    buyer, price, father. Il compratore e' la chiave per capire se la vendita
    e' avvenuta davvero.
    """
    percorso = CARTELLA_COPIE / copia if copia else None
    if percorso and percorso.exists():
        html = percorso.read_text(encoding="utf-8")
    else:
        print(f"    (nessuna copia salvata: provo a scaricare {url})")
        html = scarica(url)

    righe: list[dict] = []
    for blocco in re.findall(r"<tr[^>]*class=\"row\"[^>]*>(.*?)</tr>", html, re.S):
        def cella(classe: str) -> str:
            m = re.search(
                r"<td[^>]*class=\"[^\"]*\b" + classe + r"\b[^\"]*\"[^>]*>(.*?)</td>",
                blocco, re.S)
            return pulisci(m.group(1)) if m else ""

        puledro = cella("horse_name")
        padre = cella("father")
        if not puledro or not padre:
            continue

        compratore = cella("buyer")
        presentatore = cella("owner")
        prezzo = prezzo_da_testo(cella("price"))

        # COSA CONTA COME VENDITA. La colonna del compratore non contiene solo
        # nomi: quando il lotto non passa di mano, ITS ci scrive l'esito
        # ("Ricomprato", "Ritirato", "Invenduto"). Leggere quelle parole come se
        # fossero il nome dell'acquirente e' l'errore che gonfia tutto: la prima
        # versione di questo script contava 396 vendite su 407 lotti, cioe' il
        # 97%, quando la realta' delle aste italiane sta intorno all'80%. Con i
        # ricomprati dentro, i prezzi risultano piu' alti di quelli che il
        # mercato paga davvero, perche' un allevatore che ricompra il proprio
        # puledro lo fa per non svenderlo.
        c_norm = normalizza_nome(compratore)
        # Attenzione alle due grafie: le aste scrivono sia "Ricomprato" sia
        # "Ricomperato" (con la E), e a volte nella stessa pagina. Cercando solo
        # la prima forma sfuggivano decine di lotti e la quota di vendite
        # risultava dell'88% invece dell'80% reale. Si taglia su "RICOMP", che
        # prende entrambe.
        esito_non_vendita = any(k in c_norm for k in
                                ("RICOMP", "RITIRAT", "INVENDUT", "NON VENDUT"))

        # Puo' anche capitare che il compratore sia scritto per esteso ma sia la
        # stessa azienda del presentatore. Il confronto e' sulle parole
        # significative, perche' la stessa societa' compare in forme diverse
        # nelle due colonne ("BIASUZZI AZ AGR" e "Az. Agr. Biasuzzi").
        def sigla(s: str) -> set[str]:
            return {p for p in normalizza_nome(s).split()
                    if len(p) > 3 and p not in {
                        "AGRICOLA", "SOCIETA", "ALLEV", "SCUD", "SEMP", "SRL"}}

        stesso = bool(sigla(compratore) & sigla(presentatore))
        ricomprato = esito_non_vendita or (bool(compratore) and stesso)
        venduto = bool(compratore) and prezzo is not None and not ricomprato

        righe.append({
            "asta": nome_asta,
            "lotto": cella("catalog"),
            "puledro": normalizza_nome(puledro),
            "padre": normalizza_nome(padre),
            "prezzo_eur": prezzo if prezzo else "",
            "venduto": "si" if venduto else "no",
            "motivo_non_venduto": ("" if venduto else
                                   "ricomprato dal venditore" if ricomprato else
                                   "nessun compratore" if not compratore else
                                   "prezzo assente"),
            "fonte": url,
        })
    return righe


def leggi_anact(nome_asta: str, url: str) -> list[dict]:
    """
    La pagina ANACT ha anch'essa una tabella, ma scritta all'antica: le celle
    non hanno classi, si riconoscono dall'ordine. Le colonne sono
    numero, nome, sesso, nascita, padre, madre, venditore, prezzo, (vuota),
    acquirente.

    Qui non esiste la parola "Ricomprato": il segnale che il lotto non e'
    passato di mano e' l'acquirente vuoto, oppure un acquirente che coincide
    col venditore. Sono entrambi trattati come non vendite, per la stessa
    ragione dell'altra asta.
    """
    html = scarica(url)
    righe: list[dict] = []

    for blocco in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        celle = [pulisci(c) for c in
                 re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", blocco, re.S | re.I)]
        if len(celle) < 10:
            continue

        lotto, puledro, _sesso, _nato, padre = celle[0], celle[1], celle[2], celle[3], celle[4]
        venditore, prezzo_txt, acquirente = celle[6], celle[7], celle[9]

        if not lotto.isdigit() or not puledro or not padre:
            continue

        prezzo = prezzo_da_testo(prezzo_txt)

        def sigla(t: str) -> set[str]:
            return {w for w in normalizza_nome(t).split()
                    if len(w) > 3 and w not in {
                        "AGRICOLA", "SOCIETA", "ALLEV", "SCUD", "SEMP", "SRL"}}

        stesso = bool(sigla(acquirente) & sigla(venditore))
        venduto = bool(acquirente) and prezzo is not None and not stesso

        righe.append({
            "asta": nome_asta,
            "lotto": lotto,
            "puledro": normalizza_nome(puledro),
            "padre": normalizza_nome(padre),
            "prezzo_eur": prezzo if prezzo else "",
            "venduto": "si" if venduto else "no",
            "motivo_non_venduto": ("" if venduto else
                                   "acquirente uguale al venditore" if stesso else
                                   "nessun acquirente" if not acquirente else
                                   "prezzo assente"),
            "fonte": url,
        })
    return righe


def main() -> int:
    tutte: list[dict] = []
    for nome, url, copia in ASTE_ITS:
        try:
            r = leggi_its(nome, url, copia)
            print(f"  {nome}: {len(r)} lotti")
            tutte += r
        except Exception as e:
            print(f"  ATTENZIONE {nome}: {e}")

    try:
        r = leggi_anact(*ASTA_ANACT)
        print(f"  {ASTA_ANACT[0]}: {len(r)} lotti")
        tutte += r
    except Exception as e:
        print(f"  ATTENZIONE ANACT: {e}")

    # Lo stesso puledro non puo' comparire due volte.
    visti, uniche = set(), []
    for r in tutte:
        chiave = (r["puledro"], r["padre"])
        if chiave in visti:
            continue
        visti.add(chiave)
        uniche.append(r)

    if len(uniche) < 200:
        print(f"ERRORE: solo {len(uniche)} lotti raccolti, troppo pochi. "
              "Probabilmente una pagina ha cambiato struttura.")
        return 1

    with USCITA.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[
            "asta", "lotto", "puledro", "padre", "prezzo_eur",
            "venduto", "motivo_non_venduto", "fonte"])
        w.writeheader()
        w.writerows(uniche)

    venduti = [r for r in uniche if r["venduto"] == "si"]
    print(f"\n  {len(uniche)} lotti totali, {len(venduti)} venduti "
          f"({100 * len(venduti) / len(uniche):.1f}%)")
    print(f"  stalloni distinti: {len({r['padre'] for r in uniche})}")
    print(f"  salvato in {USCITA.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
