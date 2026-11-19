#!/usr/bin/env python3
"""
Previsione dei puledri, versione 3: conta anche chi non arriva alle corse.

Perche' serve
-------------
Il consiglio precedente era verificato solo sui cavalli che hanno corso: chi
non e' mai arrivato in pista spariva dal conto, e il quadro sembrava migliore
di com'e'. Qui la domanda e' quella vera di un allevatore, per OGNI puledro
nato:

  1. arriva alle corse?                      (probabilita')
  2. diventa un buon cavallo?                (probabilita')
     "buono" = fra il 25% migliore di TUTTI i nati del suo anno,
     contando come ultimi quelli che non hanno mai corso.

Dati
----
Nati in Italia (nome senza sigla estera) dal 2012 al 2022, padre e madre noti.
Per i nati 2021 e 2022 l'archivio contiene quasi tutti i puledri ufficiali
(confronto con i nati dichiarati: 2.166 su 2.192 e 2.328 su 2.368), quindi la
prova su quegli anni conta davvero anche chi non corre. Per gli anni piu'
vecchi chi non ha mai corso potrebbe mancare in parte: lo si dice nella
verifica.

Regole fissate PRIMA di vedere la prova finale
----------------------------------------------
  * Scelta delle informazioni: si impara sui nati fino al 2016 e si misura sui
    nati 2017-2019. Un'informazione resta solo se migliora la capacita' di
    ordinare (AUC) di almeno 0,003. La prova finale non decide nulla.
  * Prova finale, una volta sola: si impara sui nati fino al 2019 e si
    verifica sui nati 2020-2022.
  * La scritta "sperimentale" si toglie solo se valgono TUTTE e tre:
      A. batte "solo il padre" con vantaggio sicuro (intervallo al 95% > 0);
      B. le fasce sono vere: per ogni quinto di previsione la quota reale di
         buoni cavalli dista al massimo 5 punti da quella prevista;
      C. regge anno per anno: batte "solo il padre" in ciascuno dei tre anni.

Uscite: puledri_model.json (pesi per il sito) e puledri_verifica.json.
"""

import json
import math
import os
import random
import sqlite3
import sys
from collections import defaultdict

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data.db")
MODEL_OUT = os.path.join(ROOT, "puledri_model.json")
VERIFICA_OUT = os.path.join(ROOT, "puledri_verifica.json")

ANNO_MIN, ANNO_MAX = 2012, 2022       # nati considerati (i 2022 hanno 4 anni)
TAGLIO_SCELTA = 2016                  # scelta delle informazioni: impara <= 2016
VALIDA_SCELTA = (2017, 2019)          # ... e misura qui
TAGLIO_FINALE = 2019                  # prova finale: impara <= 2019
PROVA_FINALE = (2020, 2022)           # ... e verifica qui
QUOTA_BUONI = 0.25                    # "buono" = 25% migliore dei nati
SOGLIA_AGGIUNTA = 0.003               # miglioramento minimo per tenere un'informazione
ORIZZONTE = 4                         # in prova si usano solo parenti nati almeno 4 anni prima
MAX_SCARTO_COPERTURA = 0.10           # dato presente soprattutto per chi corre = escluso
TOLLERANZA_FASCE = 0.05               # regola B
NATI_UFFICIALI = {2021: 2192, 2022: 2368, 2023: 2235, 2025: 1861}
# Informazioni che il sito sa calcolare dal vivo (server/advisorEngine.ts).
# Se la scelta automatica ne tiene un'altra, la verifica notturna si ferma.
CALCOLABILI_DAL_SITO = {"madre", "nonna", "padre_madre", "eta_madre", "parto"}

# La prova finale e' gia' stata guardata una volta (ottobre 2026): la prima
# versione, senza taratura, sbagliava le fasce di 5,6 punti (regola B non
# superata). La taratura e' stata aggiunta DOPO, stimata sui nati 2017-2019 e
# non sulla prova, ma la decisione di aggiungerla e' venuta dal risultato.
# Per questo anche con le tre regole superate il modello resta "sperimentale"
# finche' non si conferma su un'annata mai guardata: i nati 2023, che a fine
# 2027 avranno 4 anni.
PROVA_GIA_GUARDATA = True
ANNATA_DI_CONFERMA = 2023

K = {"padre": 30.0, "madre": 3.0, "nonna": 6.0, "padre_madre": 30.0, "incrocio": 10.0}


# ─────────────────────────────── dati ────────────────────────────────

def carica(conn):
    q = """
        SELECT h.name, h.birth_year, UPPER(TRIM(h.sire)), UPPER(TRIM(h.dam)),
               COALESCE(h.career_races, 0), r.score
        FROM horses h
        LEFT JOIN horse_ratings r ON r.name = h.name AND r.birth_year = h.birth_year
                                 AND r.rating_mode = 'performance'
        WHERE h.birth_year BETWEEN ? AND ?
          AND COALESCE(h.horse_class, 'athlete') <> 'breeder'
          AND h.name NOT GLOB '* ([A-Z]*)'
          AND COALESCE(TRIM(h.sire), '') <> '' AND COALESCE(TRIM(h.dam), '') <> ''
    """
    righe = []
    for nome, anno, padre, madre, corse, voto in conn.execute(q, (ANNO_MIN, ANNO_MAX)):
        righe.append({"nome": nome, "anno": anno, "padre": padre, "madre": madre,
                      "corre": 1 if corse > 0 else 0,
                      "voto": float(voto) if (voto is not None and corse > 0) else None})

    # madre: anno di nascita, suo padre (nonno materno), sua madre (nonna)
    info_madre = {}
    for nome, anno, padre, madre in conn.execute(
            "SELECT UPPER(TRIM(name)), birth_year, UPPER(TRIM(sire)), UPPER(TRIM(dam)) FROM horses"):
        if nome not in info_madre or (anno and not info_madre[nome][0]):
            info_madre[nome] = (anno, padre or "", madre or "")

    # consanguineita' (solo per i cavalli schedati dalla fonte delle aste)
    inbr = {}
    try:
        for nome, nascita, n_inb in conn.execute(
                "SELECT UPPER(TRIM(horse_name)), birth_date, n_inbreeding FROM vp_horse_profile"):
            try:
                anno = int(str(nascita)[:4])
            except Exception:
                continue
            if n_inb is not None:
                inbr[(nome, anno)] = int(n_inb)
    except sqlite3.Error:
        pass

    # soglia del "buono" per ogni annata: 25% migliore di TUTTI i nati
    per_anno = defaultdict(list)
    for r in righe:
        per_anno[r["anno"]].append(r["voto"] if r["voto"] is not None else -1.0)
    soglie = {}
    for anno, v in per_anno.items():
        v = sorted(v, reverse=True)
        k = max(1, int(round(len(v) * QUOTA_BUONI)))
        soglie[anno] = v[k - 1]
    for r in righe:
        r["buono"] = 1 if (r["voto"] is not None and r["voto"] >= soglie[r["anno"]]) else 0
        a, ps, ms = info_madre.get(r["madre"], (None, "", ""))
        r["eta_madre"] = (r["anno"] - a) if a and 2 <= r["anno"] - a <= 30 else None
        r["padre_madre"] = ps
        r["nonna"] = ms
        r["inbreeding"] = inbr.get((r["nome"].upper(), r["anno"]))
    # numero del parto: quanti fratelli piu' vecchi in archivio
    per_madre = defaultdict(list)
    for r in righe:
        per_madre[r["madre"]].append(r["anno"])
    for r in righe:
        r["parto"] = 1 + sum(1 for a in per_madre[r["madre"]] if a < r["anno"])
    return righe, soglie


# ─────────────────────── indizi dai parenti ──────────────────────────

class Conti:
    """Per ogni chiave (padre, madre, ...) quanti nati, quanti corrono, quanti buoni."""

    def __init__(self, righe, chiave):
        self.n = defaultdict(int)
        self.c = defaultdict(int)
        self.b = defaultdict(int)
        for r in righe:
            k = chiave(r)
            if not k:
                continue
            self.n[k] += 1
            self.c[k] += r["corre"]
            self.b[k] += r["buono"]

    def quota(self, k, campo, base, kk, togli=None):
        n = self.n.get(k, 0)
        s = (self.c if campo == "corre" else self.b).get(k, 0)
        if togli is not None:
            n -= 1
            s -= togli[campo]
        if n <= 0:
            return base, 0
        w = n / (n + kk)
        return base + w * (s / n - base), n


def logit(p):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


GRUPPI = [
    # (nome, descrizione) in ordine di prova
    ("madre", "Produzione della madre: quanti suoi figli corrono e quanti diventano buoni"),
    ("nonna", "Linea materna: produzione della nonna quando la madre non ha figli noti"),
    ("padre_madre", "Padre della madre: quanto rendono le figlie di quello stallone come fattrici"),
    ("eta_madre", "Eta' della madre al parto"),
    ("parto", "Numero del parto (primo figlio, secondo, ...)"),
    ("incrocio", "Incrocio fra la linea del padre e il padre della madre"),
    ("inbreeding", "Consanguineita' (antenati in comune)"),
]


def costruisci(righe_x, rif, base, gruppi, togli_se_stesso):
    """Matrice delle informazioni per righe_x usando i conti di rif.

    In addestramento (togli_se_stesso) si usano tutti i parenti tranne il
    cavallo stesso. In prova si usano solo i parenti nati almeno ORIZZONTE
    anni prima del puledro: quando si decide l'accoppiamento, l'anno prima
    della nascita, dei fratelli piu' giovani non si sa ancora come andranno.
    """
    if not togli_se_stesso:
        out = {"corre": [None] * len(righe_x), "buono": [None] * len(righe_x)}
        per_anno = defaultdict(list)
        for i, r in enumerate(righe_x):
            per_anno[r["anno"]].append(i)
        for anno, idx in per_anno.items():
            rif_a = [q for q in rif if q["anno"] <= anno - ORIZZONTE]
            Xa = _costruisci([righe_x[i] for i in idx], rif_a, base, gruppi, False)
            for j, i in enumerate(idx):
                out["corre"][i] = Xa["corre"][j]
                out["buono"][i] = Xa["buono"][j]
        return {c: np.array(out[c]) for c in out}
    return _costruisci(righe_x, rif, base, gruppi, True)


def _costruisci(righe_x, rif, base, gruppi, togli_se_stesso):
    cp = Conti(rif, lambda r: r["padre"])
    cm = Conti(rif, lambda r: r["madre"])
    cpm = Conti(rif, lambda r: r["padre_madre"])
    cinc = Conti(rif, lambda r: (r["padre"] + "|" + r["padre_madre"]) if r["padre_madre"] else "")
    X = {"corre": [], "buono": []}
    for r in righe_x:
        t = r if togli_se_stesso else None
        riga = {}
        for campo in ("corre", "buono"):
            b = base[campo]
            v = [1.0]
            qp, _ = cp.quota(r["padre"], campo, b, K["padre"], t)
            v.append(logit(qp))
            if "madre" in gruppi or "nonna" in gruppi:
                qm, nm = cm.quota(r["madre"], campo, b, K["madre"], t)
                if "madre" in gruppi:
                    v.append(logit(qm))
                if "nonna" in gruppi:
                    # la nonna conta solo se della madre non si sa nulla
                    if nm == 0 and r["nonna"]:
                        qn, _ = cm.quota(r["nonna"], campo, b, K["nonna"])
                    else:
                        qn = b
                    v.append(logit(qn))
            if "padre_madre" in gruppi:
                qpm, _ = cpm.quota(r["padre_madre"], campo, b, K["padre_madre"],
                                   t if r["padre_madre"] else None)
                v.append(logit(qpm))
            if "eta_madre" in gruppi:
                e = r["eta_madre"]
                v += [1.0 if e is None else 0.0,
                      1.0 if (e is not None and e <= 5) else 0.0,
                      1.0 if (e is not None and e >= 15) else 0.0,
                      0.0 if e is None else (e - 10) / 5.0]
            if "parto" in gruppi:
                v += [1.0 if r["parto"] == 1 else 0.0, min(r["parto"], 8) / 8.0]
            if "incrocio" in gruppi:
                chiave = (r["padre"] + "|" + r["padre_madre"]) if r["padre_madre"] else ""
                if chiave:
                    qi, _ = cinc.quota(chiave, campo, qp, K["incrocio"], t)
                    v.append(logit(qi) - logit(qp))
                else:
                    v.append(0.0)
            if "inbreeding" in gruppi:
                ib = r["inbreeding"]
                v += [1.0 if ib is None else 0.0, 0.0 if ib is None else min(ib, 10) / 10.0]
            riga[campo] = v
        X["corre"].append(riga["corre"])
        X["buono"].append(riga["buono"])
    return {c: np.array(X[c]) for c in X}


def logistica(X, y, l2=1.0, giri=50):
    """Regressione logistica con Newton e una piccola penalita' (non sull'intercetta)."""
    w = np.zeros(X.shape[1])
    P = np.eye(X.shape[1]) * l2
    P[0, 0] = 0.0
    for _ in range(giri):
        z = X @ w
        p = 1 / (1 + np.exp(-z))
        g = X.T @ (p - y) + P @ w
        H = (X * (p * (1 - p))[:, None]).T @ X + P
        passo = np.linalg.solve(H, g)
        w -= passo
        if np.max(np.abs(passo)) < 1e-8:
            break
    return w


def prevedi(X, w):
    return 1 / (1 + np.exp(-(X @ w)))


def taratura(p, y):
    """Correzione a due numeri (a + b * logit p), stimata su anni a parte.

    In addestramento il modello vede tutti i fratelli; al momento vero
    dell'accoppiamento se ne conoscono meno, e le probabilita' escono troppo
    sicure. La taratura le riporta alla realta' osservata.
    """
    z = np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
    X = np.column_stack([np.ones(len(z)), z])
    return [float(v) for v in logistica(X, np.asarray(y, float), l2=0.0)]


def applica_taratura(p, t):
    z = np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
    return 1 / (1 + np.exp(-(t[0] + t[1] * z)))


def auc(p, y):
    """Probabilita' che un buono a caso abbia previsione piu' alta di un non buono a caso."""
    p = np.asarray(p, float)
    y = np.asarray(y, int)
    ordine = np.argsort(p, kind="mergesort")
    ranghi = np.empty(len(p))
    ps = p[ordine]
    i = 0
    while i < len(ps):
        j = i
        while j + 1 < len(ps) and ps[j + 1] == ps[i]:
            j += 1
        ranghi[ordine[i:j + 1]] = (i + j) / 2.0 + 1
        i = j + 1
    n1 = y.sum()
    n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        return 0.5
    return float((ranghi[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def brier(p, y):
    return float(np.mean((np.asarray(p) - np.asarray(y)) ** 2))


def bootstrap_auc(pa, pb, y, giri=2000, seme=7):
    rnd = np.random.default_rng(seme)
    pa, pb, y = np.asarray(pa), np.asarray(pb), np.asarray(y)
    oss = auc(pa, y) - auc(pb, y)
    diff = []
    for _ in range(giri):
        idx = rnd.integers(0, len(y), len(y))
        diff.append(auc(pa[idx], y[idx]) - auc(pb[idx], y[idx]))
    diff.sort()
    return {"vantaggio": round(oss, 4),
            "intervallo95": [round(diff[int(0.025 * giri)], 4), round(diff[int(0.975 * giri) - 1], 4)],
            "significativo": bool(diff[int(0.025 * giri)] > 0), "giri": giri}


def fasce(p, y, n_fasce=5):
    p, y = np.asarray(p), np.asarray(y)
    ordine = np.argsort(p)
    pezzi = np.array_split(ordine, n_fasce)
    out = []
    for i, idx in enumerate(pezzi):
        out.append({"quinto": i + 1, "n": int(len(idx)),
                    "previsto": round(float(p[idx].mean()), 4),
                    "reale": round(float(y[idx].mean()), 4),
                    "scarto": round(float(y[idx].mean() - p[idx].mean()), 4)})
    return out


def base_rates(righe):
    n = len(righe)
    return {"corre": sum(r["corre"] for r in righe) / n, "buono": sum(r["buono"] for r in righe) / n}


# ─────────────────────────────── main ────────────────────────────────

def main():
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    righe, soglie = carica(conn)
    conn.close()
    if len(righe) < 5000:
        print("troppo pochi puledri:", len(righe))
        return 1

    # ── 1. scelta delle informazioni (solo anni <= 2019) ──────────────
    imp = [r for r in righe if r["anno"] <= TAGLIO_SCELTA]
    val = [r for r in righe if VALIDA_SCELTA[0] <= r["anno"] <= VALIDA_SCELTA[1]]
    base_imp = base_rates(imp)
    scelte, storia = [], []

    def misura(gruppi):
        Xi = costruisci(imp, imp, base_imp, gruppi, True)
        Xv = costruisci(val, imp, base_imp, gruppi, False)
        w = logistica(Xi["buono"], np.array([r["buono"] for r in imp], float))
        return auc(prevedi(Xv["buono"], w), [r["buono"] for r in val])

    a_corrente = misura([])
    storia.append({"informazione": "Solo il padre (punto di partenza)", "auc": round(a_corrente, 4), "tenuta": True})
    # Un dato che c'e' soprattutto per chi ha corso "sbircia" il risultato:
    # la sua sola presenza dice gia' come e' andata. Si esclude prima di provarlo.
    presenza = {"eta_madre": lambda r: r["eta_madre"] is not None,
                "inbreeding": lambda r: r["inbreeding"] is not None}
    for g, descr in GRUPPI:
        if g in presenza:
            si = [r for r in imp if r["corre"]]
            no = [r for r in imp if not r["corre"]]
            c_si = sum(presenza[g](r) for r in si) / max(1, len(si))
            c_no = sum(presenza[g](r) for r in no) / max(1, len(no))
            if abs(c_si - c_no) > MAX_SCARTO_COPERTURA:
                storia.append({"informazione": descr, "chiave": g, "tenuta": False,
                               "esclusa_perche": f"dato presente per il {c_si:.0%} di chi corre e "
                                                 f"per il {c_no:.0%} di chi non corre: la sua "
                                                 f"presenza rivela gia' il risultato"})
                continue
        a = misura(scelte + [g])
        tenuta = a - a_corrente >= SOGLIA_AGGIUNTA
        storia.append({"informazione": descr, "chiave": g, "auc": round(a, 4),
                       "guadagno": round(a - a_corrente, 4), "tenuta": tenuta})
        if tenuta:
            scelte.append(g)
            a_corrente = a

    # ── 2. prova finale, una volta sola ──────────────────────────────
    # Pesi imparati sui nati fino al 2016, taratura sui nati 2017-2019 (con
    # i soli parenti noti all'epoca), prova sui nati 2020-2022. I parenti
    # usati in prova sono tutti i nati fino al 2019 che rispettano l'orizzonte.
    tr = [r for r in righe if r["anno"] <= TAGLIO_FINALE]
    te = [r for r in righe if PROVA_FINALE[0] <= r["anno"] <= PROVA_FINALE[1]]
    base_tr = base_rates(tr)
    Xw = costruisci(imp, imp, base_imp, scelte, True)
    Xw0 = costruisci(imp, imp, base_imp, [], True)
    Xc = costruisci(val, imp, base_imp, scelte, False)
    Xc0 = costruisci(val, imp, base_imp, [], False)
    Xte = costruisci(te, tr, base_imp, scelte, False)
    Xte0 = costruisci(te, tr, base_imp, [], False)
    y_imp = {c: np.array([r[c] for r in imp], float) for c in ("corre", "buono")}
    y_val = {c: np.array([r[c] for r in val], float) for c in ("corre", "buono")}
    y_tr = {c: np.array([r[c] for r in tr], float) for c in ("corre", "buono")}
    y_te = {c: np.array([r[c] for r in te], float) for c in ("corre", "buono")}

    risultati = {}
    pesi_finali_prova = {}
    for c in ("corre", "buono"):
        w = logistica(Xw[c], y_imp[c])
        w0 = logistica(Xw0[c], y_imp[c])
        t = taratura(prevedi(Xc[c], w), y_val[c])
        t0 = taratura(prevedi(Xc0[c], w0), y_val[c])
        p = applica_taratura(prevedi(Xte[c], w), t)
        p0 = applica_taratura(prevedi(Xte0[c], w0), t0)
        costante = np.full(len(te), y_tr[c].mean())
        per_anno = []
        for anno in range(PROVA_FINALE[0], PROVA_FINALE[1] + 1):
            m = np.array([r["anno"] == anno for r in te])
            per_anno.append({"anno": anno, "n": int(m.sum()),
                             "quota_reale": round(float(y_te[c][m].mean()), 4),
                             "quota_prevista": round(float(p[m].mean()), 4),
                             "auc_modello": round(auc(p[m], y_te[c][m]), 4),
                             "auc_solo_padre": round(auc(p0[m], y_te[c][m]), 4)})
        risultati[c] = {
            "auc_modello": round(auc(p, y_te[c]), 4),
            "auc_solo_padre": round(auc(p0, y_te[c]), 4),
            "brier_modello": round(brier(p, y_te[c]), 4),
            "brier_costante": round(brier(costante, y_te[c]), 4),
            "quota_reale": round(float(y_te[c].mean()), 4),
            "quota_prevista": round(float(p.mean()), 4),
            "contro_solo_padre": bootstrap_auc(p, p0, y_te[c]),
            "fasce": fasce(p, y_te[c]),
            "per_anno": per_anno,
        }
        pesi_finali_prova[c] = p

    # confronto con il consiglio di oggi (voto atteso fra chi corre) su TUTTI i nati
    st = defaultdict(list)
    dm = defaultdict(list)
    vt = [r["voto"] for r in tr if r["voto"] is not None]
    media_v = sum(vt) / len(vt)
    for r in tr:
        if r["voto"] is not None:
            st[r["padre"]].append(r["voto"])
            dm[r["madre"]].append(r["voto"])

    def shr(lst, k):
        if not lst:
            return media_v
        return media_v + len(lst) / (len(lst) + k) * (sum(lst) / len(lst) - media_v)

    try:
        coef = json.load(open(os.path.join(ROOT, "advisor_backtest.json")))["coefficients"]
        # stesso orizzonte del nuovo metodo: solo parenti nati 4 anni prima
        cache = {}
        for anno in range(PROVA_FINALE[0], PROVA_FINALE[1] + 1):
            st_a, dm_a = defaultdict(list), defaultdict(list)
            for q in tr:
                if q["voto"] is not None and q["anno"] <= anno - ORIZZONTE:
                    st_a[q["padre"]].append(q["voto"])
                    dm_a[q["madre"]].append(q["voto"])
            cache[anno] = (st_a, dm_a)
        p_oggi = [coef["intercept"] + coef["sire"] * shr(cache[r["anno"]][0][r["padre"]], 8)
                  + coef["dam"] * shr(cache[r["anno"]][1][r["madre"]], 2) for r in te]
        risultati["buono"]["auc_consiglio_di_oggi"] = round(auc(p_oggi, y_te["buono"]), 4)
        risultati["buono"]["contro_consiglio_di_oggi"] = bootstrap_auc(pesi_finali_prova["buono"], p_oggi, y_te["buono"])
    except Exception as e:  # il confronto e' un di piu'
        risultati["buono"]["auc_consiglio_di_oggi"] = None
        print("confronto con il consiglio di oggi non riuscito:", e)

    # ── 3. le tre regole ─────────────────────────────────────────────
    rb = risultati["buono"]
    regola_a = rb["contro_solo_padre"]["significativo"]
    regola_b = all(abs(f["scarto"]) <= TOLLERANZA_FASCE for f in rb["fasce"])
    regola_c = all(a["auc_modello"] > a["auc_solo_padre"] for a in rb["per_anno"])
    superato = bool(regola_a and regola_b and regola_c)
    if superato and PROVA_GIA_GUARDATA:
        stato = "regole superate con riserva"
    elif superato:
        stato = "regole superate"
    else:
        stato = "regole non superate"

    copertura = []
    for anno in range(PROVA_FINALE[0], PROVA_FINALE[1] + 1):
        n = sum(1 for r in righe if r["anno"] == anno)
        uff = NATI_UFFICIALI.get(anno)
        copertura.append({"anno": anno, "in_archivio": n, "nati_ufficiali": uff,
                          "quota": round(n / uff, 3) if uff else None})

    verifica = {
        "versione": 3,
        "domanda": "Per ogni puledro nato: arriva alle corse? diventa un buon cavallo?",
        "definizione_buono": "Fra il 25% migliore di tutti i nati del suo anno, "
                             "contando come ultimi quelli che non hanno mai corso.",
        "anni_scelta": {"impara_fino_a": TAGLIO_SCELTA, "misura": list(VALIDA_SCELTA)},
        "anni_prova": {"impara_fino_a": TAGLIO_FINALE, "verifica": list(PROVA_FINALE)},
        "n_impara": len(tr), "n_prova": len(te),
        "copertura_prova": copertura,
        "scelta_informazioni": storia,
        "informazioni_usate": scelte,
        "corre": risultati["corre"],
        "buono": risultati["buono"],
        "regole": {
            "A": {"testo": "Batte 'solo il padre' con vantaggio sicuro", "superata": bool(regola_a)},
            "B": {"testo": f"Fasce vere: scarto massimo {int(TOLLERANZA_FASCE * 100)} punti per quinto",
                  "superata": bool(regola_b)},
            "C": {"testo": "Batte 'solo il padre' in ciascun anno di prova", "superata": bool(regola_c)},
        },
        "stato": stato,
        "sperimentale": (not superato) or PROVA_GIA_GUARDATA,
        "riserva": ("La prima prova, senza taratura, sbagliava le fasce di 5,6 punti. La "
                    "taratura e' stata aggiunta dopo, stimata sui nati 2017-2019 e non sulla "
                    "prova, ma l'idea e' venuta guardando il risultato. Per togliere la scritta "
                    f"'sperimentale' serve una conferma sui nati {ANNATA_DI_CONFERMA}, mai "
                    "guardati, quando avranno 4 anni.") if PROVA_GIA_GUARDATA else None,
        "annata_di_conferma": ANNATA_DI_CONFERMA,
        "nota": "Le regole sono state fissate prima della prova finale e non si cambiano dopo.",
        "come_leggere_auc": ("Prendi due puledri a caso, uno diventato buono e uno no: e' la quota "
                             "di volte in cui il metodo mette piu' in alto quello giusto. 0,50 e' "
                             "tirare a sorte, 1 e' indovinare sempre."),
    }

    # ── 4. modello per il sito: impara su tutti gli anni ─────────────
    base_all = base_rates(righe)
    Xall = costruisci(righe, righe, base_all, scelte, True)
    ult = [r for r in righe if r["anno"] >= ANNO_MAX - 2]
    Xult = costruisci(ult, righe, base_all, scelte, False)
    pesi, tarature = {}, {}
    for c in ("corre", "buono"):
        w = logistica(Xall[c], np.array([r[c] for r in righe], float))
        pesi[c] = [round(float(v), 6) for v in w]
        tarature[c] = [round(v, 6) for v in taratura(prevedi(Xult[c], w), [r[c] for r in ult])]
    modello = {
        "versione": 3,
        "addestrato_su": len(righe),
        "anni": [ANNO_MIN, ANNO_MAX],
        "quota_buoni": QUOTA_BUONI,
        "base": {c: round(v, 6) for c, v in base_all.items()},
        "k": K,
        "informazioni": scelte,
        "pesi": pesi,
        "taratura": tarature,
        "orizzonte_anni": ORIZZONTE,
        "soglie_buono": {str(a): round(v, 4) for a, v in sorted(soglie.items())},
        "sperimentale": verifica["sperimentale"],
        "stato": stato,
        "riassunto": {"auc_buono": rb["auc_modello"], "auc_solo_padre": rb["auc_solo_padre"],
                      "auc_corre": risultati["corre"]["auc_modello"]},
    }
    fuori = [g for g in scelte if g not in CALCOLABILI_DAL_SITO]
    if fuori:
        print("::error::informazioni scelte che il sito non sa calcolare:", fuori)
        return 2
    json.dump(verifica, open(VERIFICA_OUT, "w"), ensure_ascii=False, indent=1)
    json.dump(modello, open(MODEL_OUT, "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"scelta": storia, "usate": scelte,
                      "corre": {k: v for k, v in risultati["corre"].items() if k != "fasce"},
                      "buono": {k: v for k, v in risultati["buono"].items()},
                      "regole": verifica["regole"], "copertura": copertura},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
