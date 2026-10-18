#!/usr/bin/env python3
"""
Simula una generazione intera di puledri trottatori: i nati di un anno, che
corrono a 2 e a 3 anni due e tre anni dopo. Pensato per la generazione M (nati
nel 2025, a 2 anni nel 2027 e a 3 anni nel 2028), con la prova sul passato
sulla generazione I (nati nel 2023, venduti all'asta nel 2024).

STATO: SPERIMENTALE. Non e' il modello di allevamento del sito e non lo
sostituisce. Serve a rispondere a domande di gruppo (quanti correranno, quanti
premi si divideranno, quanto rende in media un puledro comprato all'asta) e a
dare per ogni lotto d'asta un intervallo onesto, non una previsione puntuale.

L'IDEA, IN PAROLE SEMPLICI.
1. I premi per i cavalli di 2 e di 3 anni sono quasi una torta fissa: in
   Italia ogni anno si distribuiscono circa 3,1-3,5 milioni netti fra i 2 anni
   e 9,7-11,8 milioni fra i 3 anni, che la generazione sia grande o piccola.
   Per questo ogni cavallo del passato non e' descritto da "quanti euro ha
   vinto", ma da "che fetta della torta della sua generazione ha preso".
2. Un puledro nuovo pesca il suo destino da cavalli del passato simili: i figli
   dello stesso padre, i fratelli della stessa madre, e per il resto tutti i
   cavalli. Quanto pesa ciascun gruppo dipende da quanti casi ci sono: un padre
   con 300 figli pesa molto, uno con 5 figli quasi niente.
3. La fetta si trasforma in euro con la torta prevista (media degli ultimi tre
   anni conosciuti) e con la dimensione della generazione: se i nati sono meno,
   ognuno ha meno concorrenti.
4. Si ripete migliaia di volte e si guardano i risultati: quota di chi corre,
   premi tipici, e quanto spesso un puledro d'asta ripaga prezzo e allenamento
   entro i 3 anni.

COSA NON C'E'. La rivendita, il valore da fattrice o da stallone, i premi
all'allevatore, le corse dopo i 3 anni: e' un conto prudente. Le corse estere
contano solo se sono nell'archivio.

Uso:  python3 scripts/simula_generazione.py [percorso data.db]
Scrive generazione_m.json nella cartella principale del progetto.
"""

from __future__ import annotations

import csv
import json
import math
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

import numpy as np

RADICE = Path(__file__).resolve().parent.parent
CSV_ASTE = RADICE / "aste_yearling.csv"
USCITA = RADICE / "generazione_m.json"

# Nati ufficiali (Grande Ippica Italiana / MASAF, settembre 2026; 2019 da ANACT).
NATI_UFFICIALI = {2019: 2004, 2021: 2192, 2022: 2368, 2023: 2235, 2024: 2178, 2025: 1861}
LETTERE = {2021: "G", 2022: "H", 2023: "I", 2024: "L", 2025: "M"}

# Costi per il conto "ripaga o no", gli stessi della pagina Pareggio:
# allenamento e mantenimento circa 1.200 euro al mese. I premi "netti"
# dell'archivio sono GIA' la parte del proprietario (circa 42,5 su 50 del
# lordo: il rapporto netto/lordo in archivio e' 0,87-0,89 dal 2019): non si
# riducono una seconda volta. Dall'asta di settembre alla fine della
# stagione dei 3 anni passano circa 27 mesi.
COSTO_MESE = 1200
MESI_FINO_A_3_ANNI = 27
QUOTA_PROPRIETARIO = 1.0   # correzione 18/10/2026: prima 42,5/50 applicato due volte

# Quanto "pesa" un gruppo di parenti: con n casi il peso e' n / (n + K).
# Scelti prima della prova e non ritoccati per farla tornare.
K_PADRE = 30
K_MADRE = 3
PESO_MAX_MADRE = 0.4     # la madre conta, ma i suoi figli sono pochi

N_SIMULAZIONI = 4000
SEME = 2025


def norm(n: str | None) -> str:
    n = (n or "").upper()
    n = re.sub(r"\s*\((?:[A-Z]{2,3})\)\s*$", "", n)
    return re.sub(r"\s+", " ", n).strip()


# --------------------------------------------------------------------------
# Dati dall'archivio
# --------------------------------------------------------------------------

def carica_archivio(conn: sqlite3.Connection):
    """Per ogni cavallo da corsa nato fra il 2012 e il 2024: padre, madre,
    premi netti e corse a 2 e a 3 anni."""
    cavalli = {}
    for nome, by, sire, dam in conn.execute("""
        SELECT name, birth_year, sire, dam FROM horses
         WHERE birth_year BETWEEN 2012 AND 2025
           AND COALESCE(horse_class, 'athlete') = 'athlete'"""):
        cavalli[(nome, by)] = {"nome": nome, "anno": by, "padre": norm(sire),
                               "madre": norm(dam), "p2": 0.0, "p3": 0.0,
                               "c2": 0, "c3": 0}
    per_nome = defaultdict(list)
    for k in cavalli:
        per_nome[k[0]].append(k)
    for nome, anno, premi, n in conn.execute("""
        SELECT horse_name, CAST(substr(race_date, 1, 4) AS INT), SUM(COALESCE(prize_net, 0)), COUNT(*)
          FROM races WHERE race_date IS NOT NULL GROUP BY 1, 2"""):
        if anno is None:
            continue
        for k in per_nome.get(nome, ()):
            eta = anno - k[1]
            if eta == 2:
                cavalli[k]["p2"] += premi; cavalli[k]["c2"] += n
            elif eta == 3:
                cavalli[k]["p3"] += premi; cavalli[k]["c3"] += n
    return cavalli


def torte(cavalli) -> dict:
    """Premi netti vinti da ogni generazione a 2 e a 3 anni, e quanti nati."""
    t = defaultdict(lambda: {"nati": 0, "t2": 0.0, "t3": 0.0, "corsi2": 0, "corsi3": 0})
    for c in cavalli.values():
        x = t[c["anno"]]
        x["nati"] += 1
        x["t2"] += c["p2"]; x["t3"] += c["p3"]
        x["corsi2"] += c["c2"] > 0; x["corsi3"] += c["c3"] > 0
    return dict(t)


# --------------------------------------------------------------------------
# Il simulatore
# --------------------------------------------------------------------------

class Simulatore:
    """
    Costruito "come se fossimo" in un certo momento: usa solo le generazioni
    gia' concluse a 3 anni in quel momento. `anno_target` e' l'anno di nascita
    della generazione da simulare; le generazioni usate sono quelle nate fra
    anno_target - 9 e anno_target - 3 (per la M: 2016-2022; per la I: 2014-2020).
    """

    def __init__(self, cavalli, anno_target: int, nati_target: int):
        self.anno = anno_target
        da, a = anno_target - 9, anno_target - 3
        tt = torte(cavalli)
        self.tt = tt
        self.pool = [c for c in cavalli.values() if da <= c["anno"] <= a]
        # fetta della torta della propria generazione (x nati: cosi' 1 = media)
        self.s2 = np.array([c["p2"] / tt[c["anno"]]["t2"] * tt[c["anno"]]["nati"] for c in self.pool])
        self.s3 = np.array([c["p3"] / tt[c["anno"]]["t3"] * tt[c["anno"]]["nati"] for c in self.pool])
        self.r2 = np.array([c["c2"] > 0 for c in self.pool])
        self.r3 = np.array([c["c3"] > 0 for c in self.pool])
        self.per_padre = defaultdict(list)
        self.per_madre = defaultdict(list)
        for i, c in enumerate(self.pool):
            if c["padre"]:
                self.per_padre[c["padre"]].append(i)
            if c["madre"]:
                self.per_madre[c["madre"]].append(i)
        # Torta prevista: media degli ultimi tre anni conosciuti al momento.
        # Al momento della simulazione si conoscono le stagioni fino
        # all'anno anno_target + 0 (asta = settembre dell'anno dopo la nascita,
        # quindi stagioni complete fino a anno_target).
        ultimo = anno_target            # ultima stagione completa
        anni_t2 = [y for y in range(ultimo - 2, ultimo + 1)]
        self.torta2 = float(np.mean([tt[y - 2]["t2"] for y in anni_t2]))
        self.torta3 = float(np.mean([tt[y - 3]["t3"] for y in anni_t2]))
        self.torte_usate = {"2_anni": {y: round(tt[y - 2]["t2"]) for y in anni_t2},
                            "3_anni": {y: round(tt[y - 3]["t3"]) for y in anni_t2}}
        # La generazione in archivio e' quasi completa (2021: 2.169 su 2.192
        # ufficiali): si usa il numero ufficiale con la stessa copertura.
        self.nati = nati_target * 0.99
        self.euro2_per_fetta = self.torta2 / self.nati
        self.euro3_per_fetta = self.torta3 / self.nati
        self.rng = np.random.default_rng(SEME)

    def pesi(self, padre: str, madre: str):
        ip = self.per_padre.get(norm(padre), [])
        im = self.per_madre.get(norm(madre), [])
        w_m = PESO_MAX_MADRE * len(im) / (len(im) + K_MADRE) if im else 0.0
        w_p = (1 - w_m) * len(ip) / (len(ip) + K_PADRE) if ip else 0.0
        return ip, im, w_m, w_p, 1 - w_m - w_p

    def pesca(self, padre: str, madre: str, n: int = N_SIMULAZIONI):
        """Indici di n cavalli del passato pescati per questo puledro."""
        ip, im, w_m, w_p, w_t = self.pesi(padre, madre)
        scelta = self.rng.choice(3, size=n, p=[w_m, w_p, w_t])
        idx = self.rng.integers(0, len(self.pool), size=n)
        if im:
            k = scelta == 0
            idx[k] = np.array(im)[self.rng.integers(0, len(im), size=k.sum())]
        if ip:
            k = scelta == 1
            idx[k] = np.array(ip)[self.rng.integers(0, len(ip), size=k.sum())]
        return idx, {"figli_padre": len(ip), "fratelli": len(im),
                     "peso_padre": round(w_p, 2), "peso_madre": round(w_m, 2),
                     "peso_tutti": round(w_t, 2)}

    def atteso(self, padre: str, madre: str) -> dict:
        """Valori attesi esatti (senza pescare) per la prova sul passato."""
        ip, im, w_m, w_p, w_t = self.pesi(padre, madre)
        def m(a):
            v = w_t * a.mean()
            if ip: v += w_p * a[ip].mean()
            if im: v += w_m * a[im].mean()
            return float(v)
        return {"r2": m(self.r2), "e2": m(self.s2) * self.euro2_per_fetta,
                "r3": m(self.r3), "e3": m(self.s3) * self.euro3_per_fetta}


def quota_corsi(tt, anno_target: int, eta: int):
    """
    Quota dei nati che corre almeno una volta a 2 (o a 3) anni, misurata sui
    nati UFFICIALI delle ultime generazioni gia' concluse a quell'eta'.
    Non si usa la quota dell'archivio: nelle generazioni vecchie l'archivio
    tende a perdere chi non ha mai corso, e la quota verrebbe troppo alta
    (prima versione: 1.051 puledri I a 2 anni previsti, 847 veri).
    La quota scende da anni (2019: 44%, 2023: 38% a 2 anni): il numero di chi
    corre cresce meno delle nascite.
    """
    ultimo = anno_target - eta + 0      # stagione eta' completa: anno_nascita + eta <= anno_target
    q = []
    for by in sorted(NATI_UFFICIALI):
        if by + eta <= anno_target and by in tt and by >= anno_target - 6:
            q.append(tt[by]["corsi2" if eta == 2 else "corsi3"] / NATI_UFFICIALI[by])
    q = q[-3:]
    return (float(np.mean(q)), float(min(q)), float(max(q))) if q else (float("nan"),) * 3


# --------------------------------------------------------------------------
# Aste
# --------------------------------------------------------------------------

def leggi_aste():
    if not CSV_ASTE.exists():
        return []
    return list(csv.DictReader(CSV_ASTE.open(encoding="utf-8")))


def abbina_archivio(lotti, cavalli, anno_nascita: int):
    """Ritrova i lotti nell'archivio: per nome, poi per madre e anno (una
    fattrice ha un solo puledro l'anno). Chi non si ritrova di solito e' stato
    esportato o ha cambiato nome."""
    per_nome = {norm(k[0]): v for k, v in cavalli.items() if k[1] == anno_nascita}
    per_madre = {}
    for k, v in cavalli.items():
        if k[1] == anno_nascita and v["madre"]:
            per_madre.setdefault(v["madre"], v)
    out = []
    for l in lotti:
        c = per_nome.get(norm(l["puledro"])) or (per_madre.get(norm(l["madre"])) if l.get("madre") else None)
        out.append((l, c))
    return out


# --------------------------------------------------------------------------
# Prova sul passato
# --------------------------------------------------------------------------

def spearman(a, b) -> float:
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def prova_generazione_i(cavalli, aste) -> dict:
    """
    Generazione I (nati 2023): si simula come se fossimo a settembre 2024,
    usando solo le generazioni 2014-2020, e si confronta con la stagione vera
    dei 2 anni (2025). I 3 anni (2026) non sono ancora finiti: si riportano a
    parte, solo come quota di chi ha gia' corso.
    """
    sim = Simulatore(cavalli, 2023, NATI_UFFICIALI[2023])
    gen = [c for c in cavalli.values() if c["anno"] == 2023]
    vero_tot2 = sum(c["p2"] for c in gen)
    vero_corsi2 = sum(c["c2"] > 0 for c in gen)

    # Livello di gruppo: la torta prevista e la quota di chi corre.
    pred_corsi2 = quota_corsi(sim.tt, 2023, 2)[0] * NATI_UFFICIALI[2023]
    gruppo = {
        "torta_2_anni_prevista": round(sim.torta2),
        "torta_2_anni_vera": round(vero_tot2),
        "corsi_a_2_anni_previsti": round(pred_corsi2),
        "corsi_a_2_anni_veri": vero_corsi2,
        "nota_corsi": ("I veri sono contati sui nati presenti in archivio "
                       f"({len(gen)}); i previsti sui nati ufficiali "
                       f"({NATI_UFFICIALI[2023]})."),
    }

    # Livello del singolo: chi conosce padre e madre ordina meglio dei
    # cavalli presi a caso? Si misura su tutti i nati 2023 in archivio.
    pr = np.array([sim.atteso(c["padre"], c["madre"])["e2"] for c in gen])
    ve = np.array([c["p2"] for c in gen])
    decili = []
    ordine = np.argsort(pr)
    for q in range(5):
        sel = ordine[q * len(gen) // 5:(q + 1) * len(gen) // 5]
        decili.append({"quinto": q + 1, "previsto_medio": round(float(pr[sel].mean())),
                       "vero_medio": round(float(ve[sel].mean())),
                       "corsi_veri": round(float((ve[sel] > 0).mean()), 2)})
    singolo = {"cavalli": len(gen), "correlazione_ordine": round(spearman(pr, ve), 3),
               "per_quinti": decili}

    # Lotti d'asta 2024: prezzo, previsione e realta' a 2 anni.
    lotti = [l for l in aste if l.get("generazione") == "I"]
    abb = abbina_archivio(lotti, cavalli, 2023)
    trovati = [(l, c) for l, c in abb if c]
    righe = []
    for l, c in trovati:
        a = sim.atteso(l["padre"], l.get("madre", ""))
        righe.append({"prezzo": int(l["prezzo_eur"] or 0), "venduto": l["venduto"] == "si",
                      "previsto2": a["e2"], "vero2": c["p2"], "vero3_finora": c["p3"],
                      "corso2": c["c2"] > 0, "corso3": c["c3"] > 0})
    p = np.array([r["previsto2"] for r in righe]); v = np.array([r["vero2"] for r in righe])
    prezzi = np.array([r["prezzo"] for r in righe])
    fasce = []
    for lo, hi, et in ((0, 15000, "fino a 15.000"), (15000, 30000, "15.000-30.000"),
                       (30000, 60000, "30.000-60.000"), (60000, 10**9, "oltre 60.000")):
        sel = [r for r in righe if lo <= r["prezzo"] < hi and r["prezzo"] > 0]
        if not sel:
            continue
        fasce.append({
            "fascia": et, "lotti": len(sel),
            "prezzo_medio": round(np.mean([r["prezzo"] for r in sel])),
            "corsi_a_2_anni": round(np.mean([r["corso2"] for r in sel]), 2),
            "premi_2_anni_medi": round(np.mean([r["vero2"] for r in sel])),
            "premi_2_anni_mediana": round(float(np.median([r["vero2"] for r in sel]))),
            "previsti_2_anni_medi": round(np.mean([r["previsto2"] for r in sel])),
            "corsi_a_3_anni_finora": round(np.mean([r["corso3"] for r in sel]), 2),
            "premi_3_anni_finora_medi": round(np.mean([r["vero3_finora"] for r in sel])),
        })
    rapporto = float(v.sum() / p.sum()) if p.sum() else None
    v23 = np.array([r["vero2"] + r["vero3_finora"] for r in righe])
    vend = [r for r in righe if r["venduto"] and r["prezzo"]]
    # Chi ha gia' ripagato prezzo e allenamento (25 mesi da settembre 2024 a
    # ottobre 2026) con la sua quota dei premi vinti finora.
    ripagati = [r for r in vend
                if (r["vero2"] + r["vero3_finora"]) * QUOTA_PROPRIETARIO >= r["prezzo"] + 25 * COSTO_MESE]
    asta = {
        "lotti": len(lotti), "ritrovati_in_archivio": len(trovati),
        "non_ritrovati": len(lotti) - len(trovati),
        "nota_non_ritrovati": ("Di solito esportati o mai iscritti a una corsa in "
                               "Italia: nella prova non entrano, quindi i risultati "
                               "dei lotti sono un po' ottimisti."),
        "vero_su_previsto": round(rapporto, 2) if rapporto else None,
        "correlazione_previsione": round(spearman(p, v), 3),
        "correlazione_prezzo": round(spearman(prezzi, v), 3),
        "correlazione_prezzo_2_e_3_anni_finora": round(spearman(prezzi, v23), 3),
        "correlazione_previsione_2_e_3_anni_finora": round(spearman(
            np.array([sim.atteso(l["padre"], l.get("madre", ""))["e2"] + sim.atteso(l["padre"], l.get("madre", ""))["e3"]
                      for l, c in trovati]), v23), 3),
        "venduti_ritrovati": len(vend),
        "gia_ripagati_a_ottobre_2026": len(ripagati),
        "prezzo_medio_venduti": round(np.mean([r["prezzo"] for r in vend])) if vend else None,
        "premi_2_e_3_anni_finora_medi_venduti": round(np.mean([r["vero2"] + r["vero3_finora"] for r in vend])) if vend else None,
        "per_fascia_di_prezzo": fasce,
    }
    return {"descrizione": ("Generazione I (nati 2023) simulata con i soli dati "
                            "disponibili a settembre 2024 e confrontata con la "
                            "stagione vera dei 2 anni (2025)."),
            "gruppo": gruppo, "singolo": singolo, "lotti_asta_2024": asta,
            "_sim": sim}


# --------------------------------------------------------------------------
# Generazione M
# --------------------------------------------------------------------------

def verifica_generazione_l(cavalli, aste) -> dict:
    """
    Verifica indipendente della correzione d'asta: i lotti dell'asta 2025
    (generazione L, nati 2024) stanno correndo adesso a 2 anni. Si confronta
    quanto hanno vinto finora con quanto il pedigree prevedeva, riportando la
    previsione alla parte di stagione gia' corsa (premi distribuiti finora ai 2
    anni / premi previsti per l'anno intero). I lotti non ancora in archivio
    non hanno ancora corso e contano zero.
    """
    sim = Simulatore(cavalli, 2024, NATI_UFFICIALI[2024])
    lotti = [l for l in aste if l.get("generazione") == "L"]
    if not lotti:
        return {}
    abb = abbina_archivio(lotti, cavalli, 2024)
    previsto = sum(sim.atteso(l["padre"], l.get("madre", ""))["e2"] for l, _ in abb)
    vero = sum(c["p2"] for _, c in abb if c)
    frazione = sim.tt.get(2024, {}).get("t2", 0) / sim.torta2
    corsi_lotti = sum(1 for _, c in abb if c and c["c2"] > 0) / len(lotti)
    corsi_tutti = sim.tt.get(2024, {}).get("corsi2", 0) / NATI_UFFICIALI[2024]
    return {"lotti": len(lotti), "frazione_stagione_corsa": round(frazione, 2),
            "vero_su_previsto": round(vero / (previsto * frazione), 2) if previsto and frazione else None,
            "hanno_gia_corso_lotti": round(corsi_lotti, 2),
            "hanno_gia_corso_tutti_i_nati": round(corsi_tutti, 2)}


def simula_generazione_m(cavalli, aste, fattore_asta: float) -> dict:
    sim = Simulatore(cavalli, 2025, NATI_UFFICIALI[2025])
    nati = NATI_UFFICIALI[2025]
    rng = np.random.default_rng(SEME + 1)

    # 1. La generazione intera. I nomi non sono pubblici (il sito delle corse
    # elenca solo i cavalli dai 2 anni), quindi si pescano nati 2025 dal
    # passato recente. La torta si divide fra meno puledri.
    giri = 400
    corsi2, corsi3, mediana2, sopra10k, sopra50k = [], [], [], [], []
    for _ in range(giri):
        idx = rng.integers(0, len(sim.pool), size=nati)
        corsi2.append(sim.r2[idx].sum()); corsi3.append(sim.r3[idx].sum())
        e = sim.s2[idx] * sim.euro2_per_fetta + sim.s3[idx] * sim.euro3_per_fetta
        sopra10k.append((e >= 10_000).sum()); sopra50k.append((e >= 50_000).sum())
        mediana2.append(np.median(e[sim.r2[idx] | sim.r3[idx]]))
    q = lambda a: [int(np.percentile(a, 10)), int(np.percentile(a, 50)), int(np.percentile(a, 90))]

    confronto = []
    for by in (2021, 2022, 2023):
        t = sim.tt.get(by)
        if t and by in NATI_UFFICIALI:
            confronto.append({"generazione": LETTERE[by], "nati": NATI_UFFICIALI[by],
                              "premi_2_anni_per_nato": round(t["t2"] / NATI_UFFICIALI[by]),
                              "premi_3_anni_per_nato": (round(t["t3"] / NATI_UFFICIALI[by])
                                                        if by <= 2022 else None)})
    intera = {
        "nati_ufficiali": nati,
        "torta_2_anni_prevista_2027": round(sim.torta2),
        "torta_3_anni_prevista_2028": round(sim.torta3),
        "torte_usate": sim.torte_usate,
        "premi_2_anni_per_nato": round(sim.torta2 / nati),
        "premi_3_anni_per_nato": round(sim.torta3 / nati),
        "confronto_generazioni": confronto,
        "corrono_a_2_anni": [round(x * nati) for x in sorted(quota_corsi(sim.tt, 2025, 2))],
        "corrono_a_3_anni": [round(x * nati) for x in sorted(quota_corsi(sim.tt, 2025, 3))],
        "quota_corrono_2_anni": round(quota_corsi(sim.tt, 2025, 2)[0], 3),
        "quota_corrono_3_anni": round(quota_corsi(sim.tt, 2025, 3)[0], 3),
        "premi_2_e_3_anni_mediana_di_chi_corre": int(np.median(mediana2)),
        "almeno_10000_euro_in_due_stagioni": q(sopra10k),
        "almeno_50000_euro_in_due_stagioni": q(sopra50k),
        "nota_corrono": ("Chi corre: quota delle ultime generazioni concluse "
                         "(minimo, media, massimo) sui nati ufficiali."),
        "nota": ("Intervalli dal 10 al 90 per cento: 8 volte su 10 il numero vero "
                 "dovrebbe cadere dentro, se la torta dei premi resta quella "
                 "degli ultimi tre anni. Se il ministero taglia o aumenta i premi "
                 "per i giovani, i numeri in euro cambiano in proporzione."),
    }

    # 2. I puledri M passati in asta, uno per uno.
    lotti = [l for l in aste if l.get("generazione") == "M"]
    elenco = []
    for l in lotti:
        idx, info = sim.pesca(l["padre"], l.get("madre", ""))
        e2 = sim.s2[idx] * sim.euro2_per_fetta * fattore_asta
        e3 = sim.s3[idx] * sim.euro3_per_fetta * fattore_asta
        tot = e2 + e3
        prezzo = int(l["prezzo_eur"]) if l["prezzo_eur"] else None
        venduto = l["venduto"] == "si"
        ripaga = None
        if prezzo and venduto:
            costo = prezzo + COSTO_MESE * MESI_FINO_A_3_ANNI
            ripaga = round(float((tot * QUOTA_PROPRIETARIO >= costo).mean()), 3)
        elenco.append({
            "puledro": l["puledro"], "sesso": l.get("sesso", ""), "padre": l["padre"],
            "madre": l.get("madre", ""), "nonno_materno": l.get("nonno_materno", ""),
            "asta": l["asta"], "lotto": l["lotto"],
            "prezzo": prezzo, "venduto": venduto,
            "corre_a_2_anni": round(float(sim.r2[idx].mean()), 2),
            "corre_a_3_anni": round(float(sim.r3[idx].mean()), 2),
            "premi_2_3_anni": {"p25": int(np.percentile(tot, 25)),
                               "mediana": int(np.median(tot)),
                               "p75": int(np.percentile(tot, 75)),
                               "media": int(tot.mean())},
            "ripaga_entro_3_anni": ripaga,
            **info,
        })
    elenco.sort(key=lambda r: -(r["prezzo"] or 0))

    venduti = [r for r in elenco if r["venduto"] and r["prezzo"]]
    spesa = sum(r["prezzo"] for r in venduti)
    premi_attesi = sum(r["premi_2_3_anni"]["media"] for r in venduti)
    costi = spesa + len(venduti) * COSTO_MESE * MESI_FINO_A_3_ANNI
    per_asta = []
    for a in sorted({r["asta"] for r in elenco}):
        x = [r for r in venduti if r["asta"] == a]
        if not x:
            continue
        per_asta.append({
            "asta": a, "venduti": len(x), "lotti": sum(r["asta"] == a for r in elenco),
            "prezzo_medio": round(np.mean([r["prezzo"] for r in x])),
            "premi_2_3_anni_medi_attesi": round(np.mean([r["premi_2_3_anni"]["media"] for r in x])),
            "ripaga_entro_3_anni_medio": round(float(np.mean([r["ripaga_entro_3_anni"] for r in x])), 2),
        })
    asta = {
        "lotti": len(elenco), "venduti": len(venduti), "spesa_totale": spesa,
        "premi_lordi_2_3_anni_attesi": premi_attesi,
        "premi_al_proprietario_attesi": round(premi_attesi * QUOTA_PROPRIETARIO),
        "costo_totale_fino_a_3_anni": costi,
        "ripaga_entro_3_anni_medio": round(float(np.mean([r["ripaga_entro_3_anni"] for r in venduti])), 3)
                                     if venduti else None,
        "fattore_asta": round(fattore_asta, 2),
        "per_asta": per_asta,
        "lotti_elenco": elenco,
    }
    return {"generazione_intera": intera, "puledri_in_asta": asta}


def main() -> int:
    db = Path(sys.argv[1]) if len(sys.argv) > 1 else RADICE / "data.db"
    conn = sqlite3.connect(db)
    cavalli = carica_archivio(conn)
    aste = leggi_aste()

    prova = prova_generazione_i(cavalli, aste)
    prova.pop("_sim")
    # Correzione per i puledri d'asta: i lotti d'asta sono scelti, e a parita'
    # di padre e madre vincono di piu' della media. Si usa il rapporto vero /
    # previsto misurato sulla generazione I (unico anno con i 2 anni completi).
    # E' l'unico numero ricavato dalla prova: lo si dichiara.
    fattore = prova["lotti_asta_2024"]["vero_su_previsto"] or 1.0
    prova["verifica_asta_2025"] = verifica_generazione_l(cavalli, aste)
    m = simula_generazione_m(cavalli, aste, fattore)

    out = {
        "titolo": "Generazione M: i nati del 2025, in pista nel 2027",
        "stato": "sperimentale",
        "aggiornato": datetime.now(ZoneInfo("Europe/Rome")).date().isoformat(),
        "metodo": ("Ogni puledro pesca il suo destino da cavalli nati fra il 2016 e il "
                   "2022: figli dello stesso padre, fratelli della stessa madre e, per "
                   "il resto, tutti. Ogni cavallo del passato porta con se' la fetta "
                   "dei premi della sua generazione presa a 2 e a 3 anni; la fetta "
                   "diventa euro con la media dei premi degli ultimi tre anni e con il "
                   "numero dei nati del 2025 (1.861, il piu' basso degli ultimi anni). "
                   "Non e' il modello di allevamento del sito e non va usato per "
                   "decidere un singolo acquisto."),
        "ipotesi": {"costo_al_mese": COSTO_MESE, "mesi_dall_asta_a_fine_3_anni": MESI_FINO_A_3_ANNI,
                    "quota_premi_al_proprietario": round(QUOTA_PROPRIETARIO, 3),
                    "k_padre": K_PADRE, "k_madre": K_MADRE, "peso_max_madre": PESO_MAX_MADRE,
                    "simulazioni_per_puledro": N_SIMULAZIONI},
        "fonti": [
            {"nome": "Nati 2021-2025, Grande Ippica Italiana",
             "url": "https://www.grandeippicaitaliana.it/news/allevamento-cavallo-italiano-il-quadro-delle-nascite-tra-conferme-e-nuove-sfide/"},
            {"nome": "Asta ITS 2026, risultati (GAET)", "url": "https://www.gaet.it/notizie/daily/its-risultati-definitivi"},
            {"nome": "Asta Face Time Bourbon 2026 (GAET)", "url": "https://www.gaet.it/asta_FTB/"},
            {"nome": "Asta ANACT 2026, risultati (GAET)", "url": "https://www.gaet.it/notizie/daily/asta-anact-risultati-ufficiali"},
        ],
        "prova_sul_passato": prova,
        **m,
    }
    USCITA.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    g = m["generazione_intera"]; a = m["puledri_in_asta"]
    print(f"[GENERAZIONE M] nati {g['nati_ufficiali']}, corrono a 2 anni {g['corrono_a_2_anni']}, "
          f"a 3 anni {g['corrono_a_3_anni']}")
    print(f"  premi per nato: 2 anni {g['premi_2_anni_per_nato']} euro, 3 anni {g['premi_3_anni_per_nato']} euro")
    print(f"  asta: {a['venduti']} venduti, spesa {a['spesa_totale']:,} euro, "
          f"ripaga entro 3 anni in media {a['ripaga_entro_3_anni_medio']}")
    p = prova["lotti_asta_2024"]
    print(f"  prova I: vero/previsto {p['vero_su_previsto']}, corr. previsione {p['correlazione_previsione']}, "
          f"corr. prezzo {p['correlazione_prezzo']}, singolo {prova['singolo']['correlazione_ordine']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
