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

# Ottobre 2026: aggiunte le aste del settembre 2026 (generazione M, nati nel
# 2025). Le pagine ITS rispondono ancora vuote alle richieste automatiche, ma
# GAET pubblica i risultati ufficiali di tutte e tre le sessioni con madre,
# nonno materno, sesso e data di nascita. Le copie sono in data_aste/.
#
# La pagina ANACT di GAET ha sempre lo stesso indirizzo e viene sovrascritta
# ogni anno: i 132 lotti raccolti a settembre 2026 erano gia' quelli del 2026,
# non del 2025. Per questo ora si legge solo dalla copia datata.
ASTE_GAET = [
    # (nome, url, copia, anno, tipo tabella)
    ("ITS Asta Selezionata Yearlings Trottatori 2026",
     "https://www.gaet.it/notizie/daily/its-risultati-definitivi",
     "gaet_its_2026.html", 2026, "gaet"),
    ("ITS Asta evento Face Time Bourbon 2026",
     "https://www.gaet.it/asta_FTB/",
     "gaet_ftb_2026.html", 2026, "ftb"),
    ("Asta ANACT yearlings 2026",
     "https://www.gaet.it/notizie/daily/asta-anact-risultati-ufficiali",
     "gaet_anact_2026.html", 2026, "gaet"),
]

# Ogni anno di nascita ha la sua lettera: chi nasce nel 2025 si chiama con la M.
LETTERE = {2021: "G", 2022: "H", 2023: "I", 2024: "L", 2025: "M", 2026: "N"}

COLONNE = ["asta", "lotto", "puledro", "padre", "prezzo_eur", "venduto",
           "motivo_non_venduto", "fonte",
           # aggiunte a ottobre 2026, in coda per non spostare le colonne lette
           # dal sito
           "anno_asta", "generazione", "sesso", "nato", "madre",
           "nonno_materno", "venditore", "acquirente"]


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


def leggi_its(nome_asta: str, url: str, copia: str = "", anno: int = 0) -> list[dict]:
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
            "anno_asta": anno,
            "generazione": LETTERE.get(anno - 1, ""),
            "sesso": cella("sexcolor")[:1],
            "nato": cella("born"),
            "madre": normalizza_nome(cella("mother")),
            "nonno_materno": "",
            "venditore": presentatore,
            "acquirente": "" if ricomprato else compratore,
        })
    return righe


def _sigla(t: str) -> set[str]:
    return {w for w in normalizza_nome(t).split()
            if len(w) > 3 and w not in {
                "AGRICOLA", "SOCIETA", "ALLEV", "SCUD", "SEMP", "SRL"}}


def leggi_gaet(nome_asta: str, url: str, copia: str, anno: int, tipo: str) -> list[dict]:
    """
    Le pagine di risultati di GAET. Le celle non hanno classi utili (la pagina
    ITS/ANACT) oppure hanno un id per colonna (la sessione Face Time Bourbon).

    Tabella ITS/ANACT: numero, nome, sesso, nascita, padre, madre (con il nonno
    materno in un riquadro sotto), venditore, prezzo, segno "ricompr.",
    acquirente.
    Tabella FTB: numero, nome, video, foto, nascita, sesso, padre, madre,
    presentatore, acquirente (o "ricomprato"), prezzo.

    Non vendita = scritta "ricompr.", acquirente vuoto o acquirente uguale al
    venditore. La regola e' la stessa delle altre aste.
    """
    percorso = CARTELLA_COPIE / copia
    if percorso.exists():
        html = percorso.read_text(encoding="utf-8", errors="replace")
    else:
        print(f"    (nessuna copia salvata: provo a scaricare {url})")
        html = scarica(url)
        percorso.write_text(html, encoding="utf-8")

    righe: list[dict] = []
    for blocco in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        grezze = re.findall(r"<td[^>]*>(.*?)</td>", blocco, re.S | re.I)
        if len(grezze) < 10:
            continue
        celle = [pulisci(c) for c in grezze]
        if tipo == "ftb":
            lotto, puledro, nato, sesso = celle[0], celle[1], celle[4], celle[5]
            # "FTB Face Time Bourbon": sigla breve e nome lungo nella stessa cella
            m = re.search(r'class="hide_900">(.*?)</span>', grezze[6], re.S)
            padre = pulisci(m.group(1)) if m else celle[6]
            # se la sigla breve resta attaccata ("FTB Face Time Bourbon") si toglie
            padre = re.sub(r"^FTB\s+", "", padre)
            madre, nonno = celle[7], ""
            venditore, acquirente, prezzo_txt = celle[8], celle[9], celle[10]
            segno = acquirente
        else:
            lotto, puledro, sesso, nato, padre = celle[0], celle[1], celle[2], celle[3], celle[4]
            mm = re.match(r"(.*?)<div[^>]*>(.*?)</div>", grezze[5], re.S | re.I)
            madre, nonno = ((pulisci(mm.group(1)), pulisci(mm.group(2))) if mm
                            else (celle[5], ""))
            venditore, prezzo_txt, segno, acquirente = celle[6], celle[7], celle[8], celle[9]

        if not lotto.isdigit() or not puledro or not padre:
            continue
        prezzo = prezzo_da_testo(prezzo_txt)
        s_norm = normalizza_nome(segno + " " + acquirente)
        ricomprato = "RICOMP" in s_norm
        stesso = bool(_sigla(acquirente) & _sigla(venditore))
        if ricomprato:
            acquirente = ""
        venduto = bool(acquirente) and prezzo is not None and not stesso
        if len(nato) <= 5 and nato:          # "19/4": manca l'anno
            nato = f"{nato}/{anno - 1}"

        righe.append({
            "asta": nome_asta,
            "lotto": lotto,
            "puledro": normalizza_nome(puledro),
            "padre": normalizza_nome(padre),
            "prezzo_eur": prezzo if prezzo else "",
            "venduto": "si" if venduto else "no",
            "motivo_non_venduto": ("" if venduto else
                                   "ricomprato dal venditore" if ricomprato else
                                   "acquirente uguale al venditore" if stesso else
                                   "nessun acquirente" if not acquirente else
                                   "prezzo assente"),
            "fonte": url,
            "anno_asta": anno,
            "generazione": LETTERE.get(anno - 1, ""),
            "sesso": sesso[:1].upper(),
            "nato": nato,
            "madre": normalizza_nome(madre),
            "nonno_materno": normalizza_nome(nonno),
            "venditore": venditore,
            "acquirente": acquirente,
        })
    return righe


def main() -> int:
    tutte: list[dict] = []
    for nome, url, copia in ASTE_ITS:
        anno = int(nome[-4:])
        try:
            r = leggi_its(nome, url, copia, anno)
            print(f"  {nome}: {len(r)} lotti")
            tutte += r
        except Exception as e:
            print(f"  ATTENZIONE {nome}: {e}")

    for nome, url, copia, anno, tipo in ASTE_GAET:
        try:
            r = leggi_gaet(nome, url, copia, anno, tipo)
            print(f"  {nome}: {len(r)} lotti")
            tutte += r
        except Exception as e:
            print(f"  ATTENZIONE {nome}: {e}")

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
        w = csv.DictWriter(f, fieldnames=COLONNE)
        w.writeheader()
        w.writerows(uniche)

    venduti = [r for r in uniche if r["venduto"] == "si"]
    print(f"\n  {len(uniche)} lotti totali, {len(venduti)} venduti "
          f"({100 * len(venduti) / len(uniche):.1f}%)")
    print(f"  stalloni distinti: {len({r['padre'] for r in uniche})}")
    for g in sorted({r["generazione"] for r in uniche}):
        x = [r for r in uniche if r["generazione"] == g]
        v = [int(r["prezzo_eur"]) for r in x if r["venduto"] == "si"]
        print(f"  generazione {g}: {len(x)} lotti, {len(v)} venduti, "
              f"media {sum(v) / max(len(v), 1):,.0f} euro")
    print(f"  salvato in {USCITA.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
