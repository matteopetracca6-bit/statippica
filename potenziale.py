"""
potenziale.py — Il potenziale dinamico di ogni cavallo giovane (novembre 2026).

CHE COS'E'
  La posizione attesa del cavallo a fine anno dei 4 anni, da 0 a 100, contro
  TUTTI i nati del suo anno (chi non ha mai corso conta fra gli ultimi), con un
  intervallo che dovrebbe contenere il vero 8 volte su 10. Si legge con le
  lettere del sito (SSS primo 1% ... F).

  Lo stesso modello usa tutto quello che e' noto in quel giorno e niente di piu':
    1. nascita   — padre, madre e padre della madre (come vanno i loro figli e
                   nipoti GIA' maturi), eta' e carriera della madre;
    2. qualifiche — in piu' tempo, eta' e numero delle qualifiche;
    3. corse      — in piu' le corse fatte fin li' (le stesse variabili del
                   voto previsto, voto_previsto.py).
  Mano a mano che arrivano informazioni l'intervallo si stringe da solo.

IL REGISTRO
  Ogni stima si scrive in potenziale_storico e non si cambia piu'. Con il
  registro si controlla, cavallo per cavallo, cosa il sito diceva prima che il
  cavallo maturasse. Le righe "ricostruita" sono calcolate a ritroso con una
  formula allenata solo sui nati di almeno cinque anni prima (il loro
  traguardo era gia' noto quel giorno), e con solo i dati di quel giorno.

LA VERIFICA (regole fissate prima di guardare, una per stadio)
  A. batte il riferimento semplice (alla nascita e alle qualifiche: il solo
     padre; dopo le corse: il voto attuale fra i coetanei) con vantaggio sicuro:
     intervallo al 95% della differenza di errore sopra zero;
  B. l'intervallo contiene il vero fra il 75% e l'85% delle volte;
  C. A e B valgono in ciascuna delle ultime due annate verificate.
  Lo stadio che passa e' "affidabile", gli altri "in verifica", con il motivo.

USO
  python3 potenziale.py --prova [--salva]   ricostruzione, verifica e (con
                                            --salva) modello di oggi in modelli/
  phase_potenziale(conn)                    di notte: registro + controllo
  python3 potenziale.py --ricostruisci      scrive nel registro le righe
                                            ricostruite (una volta, a mano)
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import voto_previsto as vp

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "potenziale_modello.json"
FILE_VERIFICA = CARTELLA / "potenziale_verifica.json"
VERSIONE = "potenziale-v1"

PRIMO_NATO = 2012          # prima annata con le corse nell'archivio fin dai 2 anni
K_PARENTI = {"padre": 15.0, "madre": 2.0, "padre_madre": 15.0}   # richiamo verso 50
RICHIAMO = 50.0
QUANTILI = (10, 50, 90)
STADI = ["nascita", "qualifiche", "corse 1-2", "corse 3-5", "corse 6-10", "corse 11+"]

VARIABILI = [
    "eta_mesi", "femmina",
    "padre_m", "padre_n", "madre_m", "madre_n", "pm_m", "pm_n", "eta_madre", "madre_corse", "madre_premi_log",
    "q_n", "q_best", "q_eta",
    "gare", "vitt", "r_vitt", "r_top3", "premi_log", "premi365_log", "gare365", "t_best", "t_best365",
    "t_med5", "giorni_ultima", "giorni_prima", "liv_medio", "liv365", "liv_top3_migl", "pct_corridori",
]
RACE_COLS = ["gare", "vitt", "r_vitt", "r_top3", "premi", "premi365", "gare365", "t_best", "t_best365",
             "t_med5", "giorni_ultima", "giorni_prima", "liv_medio", "liv365", "liv_top3_migl", "pct_attuale"]

# early_stopping=False: con tanti dati sklearn si ferma da solo usando un
# pezzo dei dati come controllo, e per il quantile del 10% si fermava al primo
# giro (il limite basso restava lo stesso per tutti).
PARAMETRI = dict(learning_rate=0.06, max_iter=250, max_leaf_nodes=15, min_samples_leaf=60,
                 l2_regularization=1.0, early_stopping=False, random_state=7)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def chiave(nome) -> str:
    n = str(nome or "").upper()
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
    return re.sub(r"[^A-Z0-9]", "", n)


# ───────────────────────── dati ─────────────────────────

def carica(conn):
    """Corse (come il voto previsto), popolazione dei nati con i genitori,
    qualifiche abbinate al cavallo."""
    r, _ = vp.carica(conn)
    h = pd.read_sql_query("""
        SELECT UPPER(TRIM(h.name)) AS cavallo, h.birth_year AS nato, h.sex,
               UPPER(TRIM(h.sire)) AS padre, UPPER(TRIM(h.dam)) AS madre,
               UPPER(TRIM(d.sire)) AS padre_madre, d.birth_year AS anno_madre,
               COALESCE(d.career_races, 0) AS madre_corse, COALESCE(d.career_earnings, 0) AS madre_premi
        FROM horses h
        LEFT JOIN horses d ON d.name = h.dam
        WHERE h.birth_year >= 2008 AND COALESCE(h.horse_class, 'athlete') = 'athlete'""", conn)
    h = h.drop_duplicates("cavallo").reset_index(drop=True)
    h["femmina"] = (h["sex"].astype(str).str.upper().str[:1] == "F").astype(float)
    h["k"] = h["cavallo"].map(chiave)
    q = pd.read_sql_query("SELECT horse_name, qual_date, time_km, annata FROM vp_qualifiche "
                          "WHERE qual_date LIKE '____-__-__'", conn)
    q["k"] = q["horse_name"].map(chiave)
    # abbinamento per nome ridotto all'osso + anno di nascita (annata)
    idx = h.drop_duplicates(["k", "nato"]).set_index(["k", "nato"])["cavallo"]
    q["cavallo"] = [idx.get((k, a)) for k, a in zip(q["k"], q["annata"])]
    q = q[q["cavallo"].notna()].copy()
    q["d"] = pd.to_datetime(q["qual_date"])
    q["t"] = q["time_km"].where(q["time_km"] > 5)
    return r, h, q[["cavallo", "d", "t"]].sort_values(["cavallo", "d"])


def traguardi(r, h) -> pd.Series:
    """Posizione a fine anno dei 4 anni contro tutti i nati dell'anno (0-100),
    per ogni annata il cui traguardo e' gia' passato. Chi non ha corso entro
    quel giorno sta in fondo (a pari merito: meta' della sua quota)."""
    out = {}
    oggi = pd.Timestamp(date.today())
    for anno in sorted(h["nato"].unique()):
        giorno = pd.Timestamp(int(anno) + 4, 12, 31)
        if giorno >= oggi or anno < PRIMO_NATO:
            continue
        f = vp.fotografia(r, h[["cavallo", "nato", "sex", "padre"]], giorno)
        pop = h[h["nato"] == anno]["cavallo"]
        corr = f[f["nato"] == anno].set_index("cavallo")["punti"]
        n = len(pop)
        n_fermi = int((~pop.isin(corr.index)).sum())
        rango = corr.rank(method="average")
        for c in pop:
            if c in rango.index:
                out[c] = (n_fermi + rango[c]) / n * 100
            else:
                out[c] = (n_fermi / 2) / n * 100
    return pd.Series(out, name="y")


def _parenti(h: pd.DataFrame, y: pd.Series, giorno: pd.Timestamp) -> pd.DataFrame:
    """Per ogni cavallo: media del traguardo (con richiamo verso 50) dei figli
    maturi del padre, della madre e dei nipoti del padre della madre, contando
    solo chi aveva gia' raggiunto il traguardo quel giorno."""
    maturi = h[(h["nato"] + 4 < giorno.year) & h["cavallo"].isin(y.index)].copy()
    maturi["y"] = maturi["cavallo"].map(y)
    out = pd.DataFrame(index=h.index)
    for col, k in K_PARENTI.items():
        g = maturi.groupby(col)["y"].agg(["sum", "count"])
        s = h[col].map(g["sum"]).fillna(0)
        n = h[col].map(g["count"]).fillna(0)
        nome = {"padre": "padre", "madre": "madre", "padre_madre": "pm"}[col]
        out[f"{nome}_m"] = np.where(h[col].fillna("") != "", (s + k * RICHIAMO) / (n + k), np.nan)
        out[f"{nome}_n"] = n
    return out


def foto(r, h, q, y, giorno: pd.Timestamp, anni) -> pd.DataFrame:
    """Tutti i nati degli anni `anni`, con le variabili note `giorno`."""
    pop = h[h["nato"].isin(anni)].copy()
    if pop.empty:
        return pop
    pop = pd.concat([pop, _parenti(h, y, giorno).loc[pop.index]], axis=1)
    pop["eta_madre"] = pop["nato"] - pop["anno_madre"]
    pop["madre_premi_log"] = np.log1p(pop["madre_premi"].clip(lower=0))
    pop["eta_mesi"] = ((giorno - pd.to_datetime(pop["nato"].astype(int).astype(str) + "-01-01")).dt.days / 30.44).round(1)
    # qualifiche fino a quel giorno
    qq = q[q["d"] <= giorno]
    gq = qq.groupby("cavallo")
    pop["q_n"] = pop["cavallo"].map(gq.size()).fillna(0)
    pop["q_best"] = pop["cavallo"].map(gq["t"].min())
    prima_q = pd.to_datetime(pop["cavallo"].map(gq["d"].min().to_dict()))
    pop["q_eta"] = ((prima_q - pd.to_datetime(pop["nato"].astype(int).astype(str) + "-01-01")).dt.days / 30.44).round(1)
    # corse fino a quel giorno (stesse variabili del voto previsto)
    f = vp.fotografia(r, h[["cavallo", "nato", "sex", "padre"]], giorno)
    if not f.empty:
        f = f[f["nato"].isin(anni)].set_index("cavallo")
        for c in RACE_COLS:
            pop[c] = pop["cavallo"].map(f[c]) if c in f else np.nan
    else:
        for c in RACE_COLS:
            pop[c] = np.nan
    pop["gare"] = pop["gare"].fillna(0)
    pop["premi_log"] = np.log1p(pop["premi"].clip(lower=0))
    pop["premi365_log"] = np.log1p(pop["premi365"].clip(lower=0))
    pop["pct_corridori"] = pop["pct_attuale"]
    pop["giorno"] = giorno
    pop["stadio"] = [stadio(g, n) for g, n in zip(pop["gare"], pop["q_n"])]
    return pop


def stadio(gare, q_n) -> str:
    if gare <= 0:
        return "qualifiche" if q_n > 0 else "nascita"
    if gare <= 2:
        return "corse 1-2"
    if gare <= 5:
        return "corse 3-5"
    if gare <= 10:
        return "corse 6-10"
    return "corse 11+"


def date_annata(anno: int) -> list:
    """Le fotografie di un'annata: fine anno di nascita, fine del primo anno,
    poi ogni trimestre dei 2, 3 e 4 anni (il traguardo escluso)."""
    d = [pd.Timestamp(anno, 12, 31), pd.Timestamp(anno + 1, 12, 31)]
    for a in (anno + 2, anno + 3, anno + 4):
        for m in (3, 6, 9, 12):
            d.append(pd.Timestamp(a, m, 1) + pd.offsets.MonthEnd(0))
    return [x for x in d if x < pd.Timestamp(anno + 4, 12, 31)]


def fotografie(r, h, q, y, annate) -> pd.DataFrame:
    per_giorno: dict = {}
    for a in annate:
        for g in date_annata(a):
            per_giorno.setdefault(g, []).append(a)
    oggi = pd.Timestamp(date.today())
    righe = []
    for g in sorted(per_giorno):
        if g > oggi:
            continue
        righe.append(foto(r, h, q, y, g, per_giorno[g]))
    df = pd.concat(righe, ignore_index=True)
    log(f"  fotografie: {len(df)} righe, annate {min(annate)}-{max(annate)}")
    return df


# ───────────────────────── modello ─────────────────────────

def allena(df: pd.DataFrame) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor
    X = df[VARIABILI].to_numpy("float64")
    # Chi non corre mai ha tutto lo stesso traguardo (pari merito in fondo): con
    # un terzo dei nati allo stesso valore il quantile del 10% resta incollato
    # li' per tutti, anche per chi ha gia' trenta corse. Solo per allenare, quei
    # pari merito si spostano di pochi decimi a caso; il traguardo non cambia.
    y = df["y"].to_numpy("float64").copy()
    rng = np.random.default_rng(3)
    pari = pd.Series(y).duplicated(keep=False).to_numpy()
    y[pari] = y[pari] + rng.uniform(-0.75, 0.75, pari.sum())
    m = {}
    for qt in QUANTILI:
        mod = HistGradientBoostingRegressor(loss="quantile", quantile=qt / 100, **PARAMETRI).fit(X, y)
        m[qt] = esporta(mod)
    return m


def esporta(mod) -> dict:
    """Gli alberi di sklearn in un formato che numpy sa percorrere da solo."""
    alberi = []
    for (p,) in mod._predictors:
        n = p.nodes
        alberi.append({
            "v": [round(float(x), 6) for x in n["value"]],
            "f": [int(x) for x in n["feature_idx"]],
            "t": [float(x) for x in n["num_threshold"]],
            "m": [int(x) for x in n["missing_go_to_left"]],
            "l": [int(x) for x in n["left"]],
            "r": [int(x) for x in n["right"]],
            "x": [int(x) for x in n["is_leaf"]],
        })
    return {"base": float(np.ravel(mod._baseline_prediction)[0]), "alberi": alberi}


def prevedi(modello: dict, X: np.ndarray) -> np.ndarray:
    out = np.full(len(X), modello["base"], dtype=float)
    for a in modello["alberi"]:
        v = np.asarray(a["v"]); f = np.asarray(a["f"]); t = np.asarray(a["t"])
        mg = np.asarray(a["m"], dtype=bool); L = np.asarray(a["l"]); R = np.asarray(a["r"])
        foglia = np.asarray(a["x"], dtype=bool)
        nodo = np.zeros(len(X), dtype=int)
        attivi = ~foglia[nodo]
        while attivi.any():
            i = np.nonzero(attivi)[0]
            nd = nodo[i]
            x = X[i, f[nd]]
            sx = np.where(np.isnan(x), mg[nd], x <= t[nd])
            nodo[i] = np.where(sx, L[nd], R[nd])
            attivi = ~foglia[nodo]
        out += v[nodo]
    return out


def stima(m: dict, df: pd.DataFrame, taratura: dict | None = None) -> tuple:
    X = df[VARIABILI].to_numpy("float64")
    p50 = np.clip(prevedi(m[50], X), 0, 100)
    p10 = np.minimum(prevedi(m[10], X), p50)
    p90 = np.maximum(prevedi(m[90], X), p50)
    if taratura:
        k = df["stadio"].map(taratura).fillna(1.0).to_numpy()
        p10 = p50 - k * (p50 - p10)
        p90 = p50 + k * (p90 - p50)
    return np.clip(p10, 0, 100), p50, np.clip(p90, 0, 100)


def tara(m: dict, cal: pd.DataFrame) -> dict:
    """Quanto allargare (o stringere) l'intervallo di ogni stadio perche'
    contenga il vero 8 volte su 10, misurato su un'annata matura che la formula
    non ha visto (taratura "conforme"). Si stima PRIMA, su dati gia' noti, e si
    applica poi all'annata da prevedere."""
    p10, p50, p90 = stima(m, cal)
    y = cal["y"].to_numpy()
    eps = 0.5
    s = np.where(y < p50, (p50 - y) / (p50 - p10 + eps), (y - p50) / (p90 - p50 + eps))
    out = {}
    for st in STADI:
        k = (cal["stadio"] == st).to_numpy()
        if k.sum() >= 100:
            out[st] = round(float(np.quantile(s[k], 0.80)), 3)
    return out


# ───────────────────────── verifica ─────────────────────────

def _boot_vantaggio(err_rif, err_mod, cavalli, giri=1000, seme=11):
    """Intervallo al 95% di (errore riferimento - errore modello), ricampionando
    i cavalli (non le righe: le fotografie dello stesso cavallo si somigliano)."""
    d = pd.DataFrame({"c": cavalli, "a": err_rif, "b": err_mod}).groupby("c")[["a", "b"]].mean()
    diff = (d["a"] - d["b"]).to_numpy()
    rng = np.random.default_rng(seme)
    medie = [diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(giri)]
    return float(diff.mean()), float(np.percentile(medie, 2.5)), float(np.percentile(medie, 97.5))


def quota_fermi(df: pd.DataFrame) -> float:
    """Quota media di chi non ha mai corso entro i 4 anni, nelle annate gia'
    mature di `df` (chi non corre ha traguardo = meta' della sua quota)."""
    m = df[df["y"].notna()].groupby("nato")["y"].min() * 2 / 100
    return float(m.mean()) if len(m) else 0.25


def riferimento(df: pd.DataFrame, fermi: float) -> np.ndarray:
    """Il confronto semplice. Prima delle corse: il solo padre (figli maturi,
    con richiamo). Dopo: il voto attuale fra i coetanei che corrono, riportato
    sulla scala di tutti i nati con la quota di chi non corre mai, presa dalle
    sole annate di allenamento."""
    padre = df["padre_m"].fillna(RICHIAMO).to_numpy()
    voto = fermi * 100 + (1 - fermi) * np.nan_to_num(df["pct_corridori"].to_numpy(), nan=50.0)
    return np.where(df["gare"].to_numpy() > 0, voto, padre)


def misura(df: pd.DataFrame, p10, p50, p90) -> dict:
    y = df["y"].to_numpy()
    rif = df["rif"].to_numpy()
    e_mod = np.abs(p50 - y)
    e_rif = np.abs(rif - y)
    v, lo, hi = _boot_vantaggio(e_rif, e_mod, df["cavallo"].to_numpy())
    cop = float(((y >= p10) & (y <= p90)).mean())
    gr_vero = vp._gradino(y); gr_mod = vp._gradino(p50); gr_rif = vp._gradino(rif)
    return {
        "n": int(len(df)), "cavalli": int(df["cavallo"].nunique()),
        "errore_modello": round(float(e_mod.mean()), 2), "errore_riferimento": round(float(e_rif.mean()), 2),
        "vantaggio": round(v, 2), "intervallo95": [round(lo, 2), round(hi, 2)],
        "copertura": round(cop, 3), "larghezza": round(float((p90 - p10).mean()), 1),
        "lettera_giusta_o_accanto": round(float((np.abs(gr_mod - gr_vero) <= 1).mean()), 3),
        "lettera_giusta_o_accanto_rif": round(float((np.abs(gr_rif - gr_vero) <= 1).mean()), 3),
        "A": bool(lo > 0), "B": bool(0.75 <= cop <= 0.85),
    }


def prova(conn) -> tuple:
    """Ricostruzione a finestre: per ogni annata T dal 2017 il modello e'
    allenato sulle annate fino a T-5 (il loro traguardo era noto alla fine
    dell'anno di nascita di T). Poi le regole A, B, C per stadio."""
    r, h, q = carica(conn)
    y = traguardi(r, h)
    ultimo_nato = int(h["nato"].max())
    annate = list(range(PRIMO_NATO, ultimo_nato + 1))
    df = fotografie(r, h, q, y, annate)
    df["y"] = df["cavallo"].map(y)
    ricostruite = []
    # Si parte dal 2018: per tarare l'intervallo serve almeno un'annata matura
    # in piu' di quelle su cui si allena.
    for T in range(PRIMO_NATO + 6, ultimo_nato + 1):
        tr = df[(df["nato"] <= T - 5) & df["y"].notna()]
        te = df[df["nato"] == T].copy()
        if tr.empty or te.empty:
            continue
        k = tara(allena(df[(df["nato"] <= T - 6) & df["y"].notna()]), df[(df["nato"] == T - 5) & df["y"].notna()])
        m = allena(tr)
        te["p10"], te["p50"], te["p90"] = stima(m, te, k)
        te["rif"] = riferimento(te, quota_fermi(tr))
        te["allenato_fino_a"] = T - 5
        ricostruite.append(te)
        log(f"  annata {T}: allenata su {tr['nato'].min()}-{T - 5} ({len(tr)} righe)")
    rc = pd.concat(ricostruite, ignore_index=True)
    verificate = rc[rc["y"].notna()]
    anni_ver = sorted(verificate["nato"].unique())
    ris = {"versione": VERSIONE, "calcolato_il": date.today().isoformat(),
           "traguardo": "posizione a fine anno dei 4 anni contro tutti i nati dell'anno (0-100)",
           "regole": {"A": "batte il riferimento con vantaggio sicuro (intervallo al 95% > 0)",
                      "B": "l'intervallo all'80% contiene il vero fra il 75% e l'85% delle volte",
                      "C": "A e B in ciascuna delle ultime due annate verificate"},
           "riferimento": {"prima delle corse": "solo il padre (figli maturi, con richiamo)",
                           "dopo le corse": "voto attuale fra i coetanei che corrono, sulla scala di tutti i nati "
                                            "(quota di chi non corre mai presa dalle annate di allenamento)"},
           "note": ["Prima prova (17/11/2026): il riferimento dopo le corse usava la quota di chi aveva gia' corso "
                    "quel giorno, che a 2 anni metteva ogni debuttante vicino a 100 e gonfiava il vantaggio del "
                    "modello. Sostituito con un riferimento piu' forte: la prova e' diventata piu' dura.",
                    "Prima prova: sklearn fermava da solo l'allenamento del quantile del 10% al primo giro "
                    "(limite basso uguale per tutti). Corretto togliendo l'arresto automatico.",
                    "Prima prova: con un terzo dei nati a pari merito in fondo (chi non corre mai) il quantile "
                    "del 10% restava incollato a quel valore per tutti. Corretto spostando di pochi decimi a caso, "
                    "solo in allenamento, i traguardi a pari merito.",
                    "Seconda prova: corretti i due difetti, il modello batteva il riferimento in ogni stadio ma "
                    "gli intervalli contenevano il vero solo 62-68 volte su 100. Aggiunta una taratura conforme: "
                    "per ogni annata il fattore che allarga l'intervallo si misura sull'ultima annata matura, "
                    "con una formula che non l'ha vista, e si applica poi all'annata da prevedere. La taratura e' "
                    "venuta dopo aver visto la seconda prova: le etichette ricavate dalla ricostruzione sono "
                    "provvisorie, quelle definitive verranno dal registro scritto ogni notte."],
           "annate_verificate": [int(a) for a in anni_ver], "stadi": {}}
    ultime = anni_ver[-2:]
    for s in STADI:
        k = verificate["stadio"] == s
        if k.sum() < 200:
            ris["stadi"][s] = {"n": int(k.sum()), "esito": "in verifica", "motivo": "troppo pochi casi"}
            continue
        sub = verificate[k]
        tot = misura(sub, sub["p10"].to_numpy(), sub["p50"].to_numpy(), sub["p90"].to_numpy())
        per_anno = {}
        for a in ultime:
            ss = sub[sub["nato"] == a]
            if len(ss) >= 100:
                per_anno[str(a)] = misura(ss, ss["p10"].to_numpy(), ss["p50"].to_numpy(), ss["p90"].to_numpy())
        C = len(per_anno) == len(ultime) and all(x["A"] and x["B"] for x in per_anno.values())
        ok = tot["A"] and tot["B"] and C
        motivo = []
        if not tot["A"]:
            motivo.append(f"non batte il riferimento con sicurezza (vantaggio {tot['vantaggio']}, "
                          f"intervallo {tot['intervallo95'][0]} / {tot['intervallo95'][1]})")
        if not tot["B"]:
            motivo.append(f"l'intervallo contiene il vero {round(tot['copertura'] * 100)} volte su 100")
        if not C:
            motivo.append("non regge in ciascuna delle ultime due annate")
        ris["stadi"][s] = dict(tot, C=bool(C), per_anno=per_anno,
                               esito="affidabile" if ok else "in verifica", motivo="; ".join(motivo) or None)
    return ris, df, rc


def salva_modello(df: pd.DataFrame) -> dict:
    """Il modello di oggi: tutte le annate con il traguardo gia' noto. La
    taratura si misura sull'ultima annata matura con una formula allenata
    sulle precedenti."""
    tr = df[df["y"].notna()]
    ultima = int(tr["nato"].max())
    k = tara(allena(tr[tr["nato"] < ultima]), tr[tr["nato"] == ultima])
    m = allena(tr)
    CARTELLA.mkdir(exist_ok=True)
    FILE_MODELLO.write_text(json.dumps({
        "versione": VERSIONE, "allenato_il": date.today().isoformat(),
        "annate": [int(tr["nato"].min()), int(tr["nato"].max())], "variabili": VARIABILI, "taratura": k,
        "quantili": {str(k): v for k, v in m.items()}}, separators=(",", ":")))
    return m


# ───────────────────────── registro ─────────────────────────

SCHEMA = """CREATE TABLE IF NOT EXISTS potenziale_storico (
    horse_name TEXT, birth_year INTEGER, data TEXT, eta_mesi REAL, stadio TEXT, n_corse INTEGER,
    potenziale REAL, basso REAL, alto REAL, versione TEXT, origine TEXT,
    PRIMARY KEY (horse_name, data, versione))"""


SCHEMA_TRAGUARDO = """CREATE TABLE IF NOT EXISTS potenziale_traguardo (
    horse_name TEXT PRIMARY KEY, birth_year INTEGER, posizione REAL)"""


def scrivi_traguardi(conn, h: pd.DataFrame, y: pd.Series) -> None:
    """La posizione vera raggiunta a fine anno dei 4 anni, per mostrarla
    accanto a quello che il registro aveva previsto."""
    conn.execute(SCHEMA_TRAGUARDO)
    nati = h.set_index("cavallo")["nato"]
    conn.executemany("INSERT OR REPLACE INTO potenziale_traguardo VALUES (?,?,?)",
                     [(c, int(nati.get(c)), round(float(v), 1)) for c, v in y.items() if c in nati.index])
    conn.commit()


def _righe(df, p10, p50, p90, origine):
    return [(c, int(n), g.strftime("%Y-%m-%d"), float(e), s, int(gare), round(float(b), 1),
             round(float(lo), 1), round(float(hi), 1), VERSIONE, origine)
            for c, n, g, e, s, gare, lo, b, hi in zip(df["cavallo"], df["nato"], df["giorno"], df["eta_mesi"],
                                                      df["stadio"], df["gare"], p10, p50, p90)]


def ricostruisci(conn, rc: pd.DataFrame) -> int:
    conn.execute(SCHEMA)
    righe = _righe(rc, rc["p10"], rc["p50"], rc["p90"], "ricostruita")
    conn.executemany("INSERT OR IGNORE INTO potenziale_storico VALUES (?,?,?,?,?,?,?,?,?,?,?)", righe)
    conn.commit()
    return len(righe)


def _carica_modello():
    try:
        d = json.loads(FILE_MODELLO.read_text())
    except Exception:
        return None
    if d.get("variabili") != VARIABILI:
        return None
    m = {int(k): v for k, v in d["quantili"].items()}
    m["taratura"] = d.get("taratura") or {}
    return m


def phase_potenziale(conn) -> int:
    """Di notte. Il primo del mese scrive il potenziale di tutti i nati che non
    hanno ancora raggiunto il traguardo; gli altri giorni solo di chi ha avuto
    una novita' (una corsa o una qualifica dall'ultima riga). Poi il controllo
    mensile sui cavalli appena maturati."""
    m = _carica_modello()
    if m is None:
        log("[POTENZIALE] modello assente o vecchio: salto")
        return 0
    conn.execute(SCHEMA)
    r, h, q = carica(conn)
    y = traguardi(r, h)
    oggi = pd.Timestamp(date.today())
    giorno = min(oggi, r["d"].max())
    anni = [a for a in h["nato"].unique() if a + 4 >= oggi.year and a <= oggi.year]
    f = foto(r, h, q, y, giorno, anni)
    if f.empty:
        return 0
    # novita': numero di corse o di qualifiche diverso dall'ultima riga scritta
    ultime = pd.read_sql_query("""
        SELECT horse_name AS cavallo, n_corse, stadio FROM potenziale_storico p
        WHERE versione = ? AND data = (SELECT MAX(data) FROM potenziale_storico x
                                       WHERE x.horse_name = p.horse_name AND x.versione = p.versione)""",
                               conn, params=(VERSIONE,)).set_index("cavallo")
    primo_del_mese = oggi.day == 1 or ultime.empty
    if not primo_del_mese:
        prima = f["cavallo"].map(ultime["n_corse"])
        st = f["cavallo"].map(ultime["stadio"])
        f = f[prima.isna() | (prima != f["gare"]) | (st != f["stadio"])]
    if f.empty:
        n = 0
    else:
        p10, p50, p90 = stima(m, f, m.get("taratura"))
        righe = _righe(f.assign(giorno=oggi), p10, p50, p90, "notte")
        conn.executemany("INSERT OR REPLACE INTO potenziale_storico VALUES (?,?,?,?,?,?,?,?,?,?,?)", righe)
        n = len(righe)
    conn.commit()
    scrivi_traguardi(conn, h, y)
    controlla(conn, y)
    log(f"[POTENZIALE] {n} righe nel registro ({'tutti' if primo_del_mese else 'solo le novita'})")
    return n


def controlla(conn, y: pd.Series) -> None:
    """Controllo mensile, nella tabella dei controlli del sito: le righe del
    registro scritte di notte per i cavalli che hanno appena raggiunto il
    traguardo. Finche' nessuno ci e' arrivato, resta 'in attesa'."""
    try:
        conn.execute("SELECT 1 FROM controllo_modelli LIMIT 1")
    except sqlite3.Error:
        return
    mese = date.today().strftime("%Y-%m")
    reg = pd.read_sql_query("SELECT horse_name AS cavallo, birth_year, potenziale, basso, alto "
                            "FROM potenziale_storico WHERE versione = ? AND origine = 'notte'",
                            conn, params=(VERSIONE,))
    reg["y"] = reg["cavallo"].map(y)
    reg = reg[reg["y"].notna()]
    if reg.empty:
        prossimo = conn.execute("SELECT MIN(birth_year) FROM potenziale_storico WHERE origine = 'notte' "
                                "AND versione = ?", (VERSIONE,)).fetchone()[0]
        nota = f"si potrà controllare dal 01/01/{int(prossimo) + 5}" if prossimo else "registro vuoto"
        riga = (mese, "potenziale", 0, None, None, None, None, None, "in attesa", nota,
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    else:
        err = float((reg["potenziale"] - reg["y"]).abs().mean())
        cop = float(((reg["y"] >= reg["basso"]) & (reg["y"] <= reg["alto"])).mean())
        stato = "in linea" if 0.75 <= cop <= 0.85 else "da guardare"
        riga = (mese, "potenziale", int(len(reg)), round(cop, 4), None, 0.8, round(err, 2), None, stato,
                f"intervallo giusto {round(cop * 100)} volte su 100",
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    conn.execute("DELETE FROM controllo_modelli WHERE mese = ? AND modello = 'potenziale'", (mese,))
    conn.execute("INSERT INTO controllo_modelli VALUES (?,?,?,?,?,?,?,?,?,?,?)", riga)
    conn.commit()


if __name__ == "__main__":
    import os
    conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    if "--prova" in sys.argv or "--ricostruisci" in sys.argv:
        ris, df, rc = prova(conn)
        if "--prova" in sys.argv:
            print(json.dumps(ris, ensure_ascii=False, indent=1))
        if "--salva" in sys.argv:
            salva_modello(df)
            FILE_VERIFICA.write_text(json.dumps(ris, ensure_ascii=False, indent=1))
            log("salvato")
        if "--ricostruisci" in sys.argv:
            log(f"righe ricostruite: {ricostruisci(conn, rc)}")
    else:
        print(phase_potenziale(conn))
