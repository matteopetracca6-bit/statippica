#!/usr/bin/env python3
"""
Forza e curva del voto di carriera (novembre 2026): nella scheda del cavallo
al posto del "potenziale ai 4 anni".

  * CURVA DEL VOTO: per ogni anno, il voto di carriera che il cavallo avrebbe
    avuto se la carriera si fosse chiusa quel 31 dicembre: stessa formula,
    stessi pesi, stesso confronto con tutti gli atleti e stesse lettere della
    testata della scheda (nightly_update.phase_ratings). Per l'anno in corso
    e' esattamente il voto della testata. Le stagioni future si prevedono
    (mediana e forbice 10-90%); il POTENZIALE e' il voto di fine carriera
    previsto. Una carriera ferma da piu' di sei mesi non si prevede: si
    calcola come cambiera' il suo voto senza altre corse fino ai 7 anni (la
    formula conta le stagioni che il cavallo avrebbe potuto correre).
    19/11/2026: la prima versione disegnava la velocita' con le lettere del
    voto, e TROI HOLZ risultava "picco A" con un voto di carriera SS: due
    misure diverse con le stesse lettere. Ora la curva e' il voto.
  * FORZA (forma attuale): la velocita' degli ultimi 12 mesi. Cifre di
    velocita' (tempo al km corretto per pista, distanza, mese e giornata),
    media delle migliori con le recenti che pesano di piu', letta come
    posizione fra tutte le stagioni corse dal 2016 (90 = meglio di nove
    stagioni su dieci). Si mostra come percentuale, non con le lettere del
    voto, ed entra fra i dati da cui si prevede la curva.

VERIFICA (modelli/forza_verifica.json)
  * forza: prima di ogni corsa dell'ultimo anno, la forza dei partenti
    ordinata si confronta con l'ordine d'arrivo;
  * curva: formula allenata sulle stagioni fino al 2021, provata sulle
    previsioni per il 2022-2025, contro la "crescita tipica" (il voto di oggi
    piu' quanto cresce di solito a quell'eta'), con la forbice tarata
    sull'ultimo anno che la formula non ha visto.

Tabelle: forza_cavallo (oggi), forza_stagioni (voto e forza a fine anno, per
eta'), curva_carriera (eta' future), voto_soglie (lettere del voto).

Uso: python3 forza.py [--db data.db] [--verifica]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

RADICE = Path(__file__).resolve().parent
VERIFICA = RADICE / "modelli" / "forza_verifica.json"
VERSIONE = "forza-v2"
ETA_MAX = 9
FERMO_GIORNI = 180
QUANTILI = (0.1, 0.5, 0.9)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ─────────────────────────────────────────────────────────── cifre di velocita'
def carica_corse(conn) -> pd.DataFrame:
    r = pd.read_sql_query("""
        SELECT r.horse_name AS cavallo, r.race_date AS data, r.track AS pista, r.race_number AS corsa,
               r.distance AS dist, r.time_km AS t, r.placement AS pos, r.placement_raw AS raw,
               h.birth_year AS nato, h.sex AS sesso, UPPER(TRIM(h.sire)) AS padre
        FROM races r JOIN horses h ON h.name = r.horse_name
        WHERE r.race_date IS NOT NULL AND r.track <> 'ESTERO'""", conn)
    r["d"] = pd.to_datetime(r["data"], errors="coerce")
    r = r[r["d"].notna()].copy()
    r["t"] = r["t"].where((r["t"] > 9) & (r["t"] < 25))
    r["fascia"] = pd.cut(r["dist"].fillna(1600), [0, 1700, 2150, 9999], labels=["breve", "media", "lunga"])
    return r


def cifre(r: pd.DataFrame) -> pd.DataFrame:
    """Cifra di velocita': secondi al km piu' veloci del tempo tipico di quella
    pista e distanza in quel mese, corretti per la giornata."""
    t = r[r["t"].notna()].copy()
    t["mese"] = t["d"].dt.month
    base = t.groupby(["pista", "fascia", "mese"], observed=True)["t"].transform("median")
    # Piste o mesi con poche corse: tempo tipico di pista e distanza.
    n = t.groupby(["pista", "fascia", "mese"], observed=True)["t"].transform("size")
    base2 = t.groupby(["pista", "fascia"], observed=True)["t"].transform("median")
    t["res"] = t["t"] - np.where(n >= 200, base, base2)
    # Giornata: si confronta ogni cavallo con se stesso nelle altre corse
    # (media dei suoi scarti), cosi' una giornata di soli cavalli forti non
    # sembra una pista veloce.
    media_cav = t.groupby("cavallo")["res"].transform("mean")
    t["scarto_giorno"] = t["res"] - media_cav
    giorno = t.groupby(["data", "pista"])["scarto_giorno"].transform("median")
    ng = t.groupby(["data", "pista"])["scarto_giorno"].transform("size")
    t["cifra"] = -(t["res"] - giorno * (ng / (ng + 8)))
    return t


def forma(cf: np.ndarray, pesi: np.ndarray) -> float:
    """Media pesata delle migliori tre cifre, tirata verso 0 se le corse sono poche."""
    if len(cf) == 0:
        return np.nan
    ordine = np.argsort(-cf)[:3]
    v, w = cf[ordine], pesi[ordine]
    return float((np.sum(v * w)) / (np.sum(w) + 0.5))


def stagioni(t: pd.DataFrame) -> pd.DataFrame:
    """Forma di fine anno per ogni cavallo e anno solare in cui ha corso."""
    t = t.copy()
    t["anno"] = t["d"].dt.year
    righe = []
    for (cav, anno), g in t.groupby(["cavallo", "anno"], sort=False):
        fine = pd.Timestamp(f"{anno}-12-31")
        giorni = (fine - g["d"]).dt.days.to_numpy()
        pesi = 0.5 ** (giorni / 180)
        righe.append((cav, anno, forma(g["cifra"].to_numpy(), pesi), len(g)))
    s = pd.DataFrame(righe, columns=["cavallo", "anno", "forma", "corse_t"])
    return s


def scala_da(valori: np.ndarray) -> np.ndarray:
    return np.quantile(valori[~np.isnan(valori)], np.linspace(0, 1, 101))


def in_scala(x, punti: np.ndarray):
    return np.interp(x, punti, np.arange(101), left=0, right=100)


# ─────────────────────────────────────────────────────────── voto anno per anno
def _nu():
    import importlib.util
    spec = importlib.util.spec_from_file_location("nu_forza", RADICE / "nightly_update.py")
    nu = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nu)
    return nu


def voti_per_anno(conn, anno_ora: int) -> tuple[pd.DataFrame, dict]:
    """Voto di carriera a fine di ogni anno, per gli atleti (nati dal 2012).

    Stessa formula di phase_ratings, con i confronti fatti contro gli atleti
    di oggi: guadagni, corse e vittorie fino a quell'anno (dalle gare in
    archivio, riportate ai totali ufficiali in proporzione), miglior tempo
    fino a quell'anno, stagioni corse e stagioni che avrebbe potuto correre.
    Restituisce anche la funzione per il voto futuro di una carriera ferma."""
    import bisect, math
    nu = _nu()
    cav = pd.read_sql_query("""SELECT name, birth_year, career_races, career_wins, career_earnings, record_career
                               FROM horses WHERE career_races > 0 AND birth_year >= 2012""", conn)
    g = pd.read_sql_query("""SELECT horse_name AS name, CAST(substr(race_date, 1, 4) AS INTEGER) AS anno,
                                    COUNT(*) AS corse, SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vitt,
                                    SUM(COALESCE(prize_net, 0)) AS euro,
                                    MIN(CASE WHEN time_km > 9 AND time_km < 25 THEN time_km END) AS t
                             FROM races WHERE race_date LIKE '____-%' GROUP BY 1, 2""", conn)
    stag_tot = g.groupby("name")["anno"].nunique()
    # Pool e percentili come phase_ratings (atleti).
    euro = np.sort(cav["career_earnings"].fillna(0).to_numpy())
    euro = euro[euro > 0]
    log_max = math.log1p(euro[-1]) if len(euro) else 0.0
    tempi = np.sort(np.array([x for x in (nu._time_to_seconds(r) for r in cav["record_career"]) if x]))
    ten = np.sort(np.array([stag_tot.get(n, 0) for n in cav["name"]]))
    fine = nu.ETA_FINE_CARRIERA

    def possibili(nato, anno):
        return max(1, min(anno, nato + fine) - nato - 1)

    integ = np.sort(np.array([min(1.0, stag_tot.get(n, 0) / possibili(b, anno_ora))
                              for n, b in zip(cav["name"], cav["birth_year"])]))
    media_v = cav["career_wins"].fillna(0).sum() / max(1, cav["career_races"].fillna(0).sum()) * 100

    def pct(arr, x, destra=True):
        if not len(arr):
            return 0.0
        return (np.searchsorted(arr, x, side="right" if destra else "left")) / len(arr) * 100

    def voto(euro_x, corse, vitt, sec, st, nato, anno):
        ep = pct(euro, euro_x) if euro_x > 0 else 0.0
        es = min(100.0, math.log1p(euro_x) / log_max * 100) if euro_x > 0 and log_max else 0.0
        tp = (len(tempi) - np.searchsorted(tempi, sec, side="left")) / len(tempi) * 100 if sec and len(tempi) else 0.0
        wr = (vitt + nu.RICHIAMO_VITTORIE * media_v / 100) / (corse + nu.RICHIAMO_VITTORIE) * 100 if corse else 0.0
        tn = pct(ten, st)
        it = pct(integ, min(1.0, st / possibili(nato, anno)))
        gu = nu.QUOTA_GUADAGNI_SCALA * es + (1 - nu.QUOTA_GUADAGNI_SCALA) * ep
        return min(100.0, gu * nu.PESO_GUADAGNI + tp * nu.PESO_RECORD + wr * nu.PESO_VITTORIE
                   + tn * nu.PESO_TENUTA + it * nu.PESO_INTEGRITA)

    tot = cav.set_index("name")
    righe = []
    for nome, gg in g[g["name"].isin(tot.index)].groupby("name"):
        c = tot.loc[nome]
        nato = int(c["birth_year"])
        gg = gg.sort_values("anno")
        E, R, W = gg["euro"].cumsum(), gg["corse"].cumsum(), gg["vitt"].cumsum()
        Ef, Rf, Wf = E.iloc[-1], R.iloc[-1], W.iloc[-1]
        tmin = gg["t"].cummin()
        rec_fin = nu._time_to_seconds(c["record_career"])
        anni = gg["anno"].tolist()
        # Ogni anno dal debutto a oggi, anche quelli senza corse: il voto di
        # una carriera ferma esiste e cambia (le stagioni possibili crescono).
        # Senza questi anni la curva imparerebbe solo dai cavalli che corrono
        # ancora, e prometterebbe a tutti la carriera dei piu' longevi.
        i = -1
        for anno in range(anni[0], anno_ora + 1):
            if anno < nato + 2:
                continue
            corse_qui = 0
            while i + 1 < len(anni) and anni[i + 1] <= anno:
                i += 1
                if anni[i] == anno:
                    corse_qui = int(gg["corse"].iloc[i])
            if i < 0:
                continue
            q_e = (E.iloc[i] / Ef) if Ef > 0 else (R.iloc[i] / Rf)
            ex = float(c["career_earnings"] or 0) * q_e
            rx = float(c["career_races"] or 0) * R.iloc[i] / Rf
            wx = float(c["career_wins"] or 0) * (W.iloc[i] / Wf if Wf > 0 else 0)
            sec = 60 + float(tmin.iloc[i]) if tmin.iloc[i] == tmin.iloc[i] else None
            if i == len(gg) - 1 and rec_fin:
                sec = min(sec, rec_fin) if sec else rec_fin
            righe.append((nome, int(anno), anno - nato, voto(ex, rx, wx, sec, i + 1, nato, anno), corse_qui))
    vt = pd.DataFrame(righe, columns=["cavallo", "anno", "eta", "voto", "corse_anno"])

    def futuro(nome, anno):
        """Voto di una carriera ferma in un anno futuro: niente altre corse."""
        if nome not in tot.index:
            return None
        c = tot.loc[nome]
        nato = int(c["birth_year"])
        return voto(float(c["career_earnings"] or 0), float(c["career_races"] or 0), float(c["career_wins"] or 0),
                    nu._time_to_seconds(c["record_career"]), int(stag_tot.get(nome, 0)), nato, anno)
    return vt, {"futuro": futuro}


def soglie_voto(conn) -> list:
    """Le soglie delle lettere del voto atleti, come le ha assegnate la notte."""
    righe = conn.execute("""SELECT grade, MIN(score) FROM horse_ratings
                            WHERE rating_mode = 'performance' AND grade IS NOT NULL AND score IS NOT NULL
                            GROUP BY grade""").fetchall()
    ordine = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"]
    return sorted([(g, round(float(m), 2)) for g, m in righe if g in ordine], key=lambda x: ordine.index(x[0]))


# ─────────────────────────────────────────────────────────── curva di carriera
def tabella_stagioni(r: pd.DataFrame, s: pd.DataFrame, punti) -> pd.DataFrame:
    anag = r.drop_duplicates("cavallo").set_index("cavallo")[["nato", "sesso", "padre"]]
    s = s.join(anag, on="cavallo")
    s = s[s["nato"].notna()].copy()
    s["eta"] = (s["anno"] - s["nato"]).astype(int)
    s = s[(s["eta"] >= 2) & (s["eta"] <= 14)]
    s["v"] = in_scala(s["forma"].to_numpy(), punti)
    tutte = r.groupby(["cavallo", r["d"].dt.year]).size().rename("corse_anno").reset_index()
    tutte.columns = ["cavallo", "anno", "corse_anno"]
    s = s.merge(tutte, on=["cavallo", "anno"], how="left")
    return s


def tabella_voti(vt: pd.DataFrame, s_forza: pd.DataFrame, anag: pd.DataFrame) -> pd.DataFrame:
    """Stagioni con il voto di carriera a fine anno (v) e la forza di quella
    stagione (fv), con l'anagrafica."""
    s = vt.rename(columns={"voto": "v"}).merge(
        s_forza[["cavallo", "anno", "v"]].rename(columns={"v": "fv"}), on=["cavallo", "anno"], how="left")
    s = s.join(anag, on="cavallo")
    return s[s["nato"].notna()].copy()


def esempi(s: pd.DataFrame, anag: pd.DataFrame, fino_al: int, padri: pd.Series | None = None):
    """Righe di allenamento/prova: dalla situazione a fine anno A (eta' a),
    la forza a fine anno A+h. Anche la situazione 'prima di correre' (a=1)."""
    madri = media_madri(s, fino_al) if PEDIGREE_CURVA else None
    s = s[s["anno"] <= fino_al]
    per_cav = {c: g.set_index("eta") for c, g in s.groupby("cavallo")}
    righe = []
    for cav, g in per_cav.items():
        nato = int(g["nato"].iloc[0])
        sesso = g["sesso"].iloc[0]
        padre = g["padre"].iloc[0]
        madre = g["madre"].iloc[0] if "madre" in g else None
        pm = g["padre_madre"].iloc[0] if "padre_madre" in g else None
        for a in range(1, ETA_MAX):
            anno = nato + a
            if anno > fino_al:
                break
            passato = g[g.index <= a]
            f = situazione(a, passato, sesso, padre, padri, madre, pm, madri)
            for h in range(1, ETA_MAX - a + 1):
                if nato + a + h > fino_al:
                    break
                if (a + h) in g.index:
                    righe.append({**f, "h": h, "eta_obiettivo": a + h, "y": float(g.loc[a + h, "v"]),
                                  "cavallo": cav, "anno_base": anno})
    return pd.DataFrame(righe)


def situazione(a, passato: pd.DataFrame, sesso, padre, padri, madre=None, pm=None, madri=None) -> dict:
    ult = passato.loc[a] if a in passato.index else None
    prec = passato.loc[a - 1] if (a - 1) in passato.index else None
    extra = {}
    if PEDIGREE_CURVA:
        # 27/11/2026: il pedigree intero, non solo il padre: come rendono i
        # figli della madre e quelli del padre della madre (nonno materno).
        extra = {"madre_m": float(madri.get(madre, np.nan)) if madri is not None and madre else np.nan,
                 "pm_m": float(padri.get(pm, np.nan)) if padri is not None and pm else np.nan}
    return {**extra,
        "eta": a,
        "femmina": 1.0 if str(sesso or "").upper().startswith("F") else 0.0,
        "v_ora": float(ult["v"]) if ult is not None else np.nan,
        "v_prima": float(prec["v"]) if prec is not None else np.nan,
        "v_migliore": float(passato["v"].max()) if len(passato) else np.nan,
        "stagioni": float(len(passato)),
        "corse_anno": float(ult["corse_anno"]) if ult is not None else 0.0,
        "corse_tot": float(passato["corse_anno"].sum()) if len(passato) else 0.0,
        "padre_m": float(padri.get(padre, np.nan)) if padri is not None else np.nan,
        "f_ora": float(ult["fv"]) if ult is not None and "fv" in passato and ult["fv"] == ult["fv"] else np.nan,
        "f_migliore": float(passato["fv"].max()) if "fv" in passato and len(passato) else np.nan,
    }


VARIABILI = ["eta", "h", "femmina", "v_ora", "v_prima", "v_migliore", "stagioni", "corse_anno",
             "corse_tot", "padre_m", "f_ora", "f_migliore"]
# 27/11/2026: anche madre e nonno materno nella previsione della curva
# (spento con FORZA_PEDIGREE=0, per confrontare).
PEDIGREE_CURVA = os.environ.get("FORZA_PEDIGREE", "1") != "0"
if PEDIGREE_CURVA:
    VARIABILI = VARIABILI + ["madre_m", "pm_m"]


def media_madri(s: pd.DataFrame, fino_al: int) -> pd.Series:
    """Per ogni madre: miglior stagione media dei figli, con un richiamo forte
    alla media (una fattrice ha pochi figli)."""
    if "madre" not in s:
        return pd.Series(dtype=float)
    best = s[(s["anno"] <= fino_al) & s["madre"].notna()].groupby(["madre", "cavallo"])["v"].max().reset_index()
    g = best.groupby("madre")["v"].agg(["sum", "count"])
    m = best["v"].mean()
    return (g["sum"] + 3 * m) / (g["count"] + 3)


def media_padri(s: pd.DataFrame, fino_al: int) -> pd.Series:
    """Per ogni padre: miglior stagione media dei figli, con richiamo alla media."""
    best = s[s["anno"] <= fino_al].groupby(["padre", "cavallo"])["v"].max().reset_index()
    g = best.groupby("padre")["v"].agg(["sum", "count"])
    m = best["v"].mean()
    return (g["sum"] + 10 * m) / (g["count"] + 10)


def allena(df: pd.DataFrame) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor
    X = df[VARIABILI].to_numpy(float)
    y = df["y"].to_numpy(float)
    mod = {}
    for q in QUANTILI:
        m = HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=300, learning_rate=0.06,
                                          max_leaf_nodes=31, min_samples_leaf=40, early_stopping=False,
                                          random_state=7)
        m.fit(X, y)
        mod[q] = m
    return mod


def prevedi(mod, df: pd.DataFrame, k: float = 1.0):
    """Mediana e forbice; k allarga la forbice (taratura)."""
    X = df[VARIABILI].to_numpy(float)
    p = {q: np.clip(mod[q].predict(X), 0, 100) for q in QUANTILI}
    m = p[0.5]
    lo = np.clip(m - k * (m - np.minimum(p[0.1], m)), 0, 100)
    hi = np.clip(m + k * (np.maximum(p[0.9], m) - m), 0, 100)
    return lo, m, hi


def taratura(s: pd.DataFrame, anag, fino_al: int) -> float:
    """Fattore che porta la forbice a contenere il vero 80 volte su 100:
    formula allenata fino all'anno prima, misurata sulle stagioni di fino_al."""
    padri = media_padri(s, fino_al - 1)
    mod = allena(esempi(s, anag, fino_al - 1, padri))
    tutto = esempi(s, anag, fino_al, padri)
    cal = tutto[tutto["anno_base"] + tutto["h"] == fino_al]
    lo, m, hi = prevedi(mod, cal)
    y = cal["y"].to_numpy()
    for k in np.arange(1.0, 2.01, 0.02):
        l2 = np.clip(m - k * (m - lo), 0, 100)
        h2 = np.clip(m + k * (hi - m), 0, 100)
        if np.mean((y >= l2) & (y <= h2)) >= 0.80:
            return round(float(k), 2)
    return 2.0


# ─────────────────────────────────────────────────────────── verifica
def verifica_forza(t: pd.DataFrame, oggi: pd.Timestamp) -> dict:
    """Ordine d'arrivo contro la forza di prima della corsa, nell'ultimo anno."""
    inizio = oggi - pd.Timedelta(days=365)
    t = t.sort_values("d")
    giuste = tot = 0
    corse = 0
    storia: dict = {}
    recenti = t[t["d"] >= inizio - pd.Timedelta(days=365)]
    for (dt, pista, corsa), g in recenti.groupby(["d", "pista", "corsa"], sort=True):
        if dt >= inizio and g["pos"].notna().sum() >= 4:
            vals = []
            for cav, pos in zip(g["cavallo"], g["pos"]):
                h = storia.get(cav)
                if h and pos == pos:
                    cf = np.array([x for d0, x in h if (dt - d0).days <= 365])
                    if len(cf) >= 2:
                        pesi = np.array([0.5 ** ((dt - d0).days / 180) for d0, x in h if (dt - d0).days <= 365])
                        vals.append((forma(cf, pesi), pos))
            if len(vals) >= 4:
                corse += 1
                for i in range(len(vals)):
                    for j in range(i + 1, len(vals)):
                        if vals[i][0] == vals[j][0] or vals[i][1] == vals[j][1]:
                            continue
                        tot += 1
                        giuste += (vals[i][0] > vals[j][0]) == (vals[i][1] < vals[j][1])
        for cav, c in zip(g["cavallo"], g["cifra"]):
            storia.setdefault(cav, []).append((dt, c))
    return {"corse": corse, "coppie": tot, "ordine_giusto": round(giuste / tot, 3) if tot else None}


def verifica_curva(s: pd.DataFrame, anag, fino_al=2021, prova=(2022, 2025)) -> dict:
    k = taratura(s, anag, fino_al)
    padri = media_padri(s, fino_al)
    tr = esempi(s, anag, fino_al, padri)
    mod = allena(tr)
    tutto = esempi(s, anag, prova[1], padri)
    te = tutto[(tutto["anno_base"] >= fino_al) & (tutto["anno_base"] + tutto["h"] >= prova[0])
               & (tutto["anno_base"] + tutto["h"] <= prova[1]) & (tutto["anno_base"] <= fino_al)]
    # Solo previsioni fatte con i dati fino al 2021 (anno_base <= 2021) per il 2022-2025.
    lo, p50, hi = prevedi(mod, te, k)
    y = te["y"].to_numpy()
    # Riferimento: "crescita tipica", il voto di oggi piu' quanto cresce di
    # solito il voto a quell'eta' in quel numero di anni (dalle stagioni di
    # allenamento). Per chi non ha ancora un voto, la mediana dell'eta'.
    cresc = (tr["y"] - tr["v_ora"]).groupby([tr["eta"], tr["h"]]).median()
    med_eta = tr.groupby("eta_obiettivo")["y"].median()
    base = np.array([
        (vo + cresc.get((e, hh), 0.0)) if vo == vo else med_eta.get(e + hh, np.nanmedian(tr["y"]))
        for vo, e, hh in zip(te["v_ora"], te["eta"], te["h"])])
    out = {"taratura": k, "esempi_prova": int(len(te)), "errore_modello": round(float(np.mean(np.abs(p50 - y))), 2),
           "errore_crescita_tipica": round(float(np.mean(np.abs(base - y))), 2),
           "copertura_80": round(float(np.mean((y >= lo) & (y <= hi))), 3),
           "per_anni_avanti": {}}
    # 27/11/2026: anche per eta' del momento della previsione (i giovani con
    # poche corse sono quelli per cui conta di piu' il pedigree).
    out["per_eta_base"] = {}
    for e in sorted(te["eta"].unique()):
        k = te["eta"].to_numpy() == e
        if k.sum() >= 200:
            out["per_eta_base"][int(e)] = {"n": int(k.sum()), "errore_modello": round(float(np.mean(np.abs(p50[k] - y[k]))), 2),
                                           "errore_crescita_tipica": round(float(np.mean(np.abs(base[k] - y[k]))), 2),
                                           "copertura_80": round(float(np.mean((y[k] >= lo[k]) & (y[k] <= hi[k]))), 3)}
    for h in sorted(te["h"].unique()):
        k = te["h"].to_numpy() == h
        out["per_anni_avanti"][int(h)] = {
            "n": int(k.sum()), "errore_modello": round(float(np.mean(np.abs(p50[k] - y[k]))), 2),
            "errore_crescita_tipica": round(float(np.mean(np.abs(base[k] - y[k]))), 2),
            "copertura_80": round(float(np.mean((y[k] >= lo[k]) & (y[k] <= hi[k]))), 3)}
    return out


# ─────────────────────────────────────────────────────────── notte
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS forza_cavallo (horse_name TEXT PRIMARY KEY, birth_year INTEGER,
        forza REAL, tendenza REAL, corse_12_mesi INTEGER, ultima_corsa TEXT, ferma INTEGER,
        potenziale REAL, potenziale_basso REAL, potenziale_alto REAL, potenziale_eta INTEGER,
        picco REAL, picco_eta INTEGER, versione TEXT, calcolato_il TEXT)""",
    """CREATE TABLE IF NOT EXISTS forza_stagioni (horse_name TEXT, eta INTEGER, anno INTEGER,
        voto REAL, corse INTEGER, forza REAL, PRIMARY KEY (horse_name, eta))""",
    """CREATE TABLE IF NOT EXISTS voto_soglie (grado TEXT, soglia REAL)""",
    """CREATE TABLE IF NOT EXISTS curva_carriera (horse_name TEXT, eta INTEGER, mediana REAL,
        basso REAL, alto REAL, PRIMARY KEY (horse_name, eta))""",
    """CREATE TABLE IF NOT EXISTS forza_controllo (horse_name TEXT PRIMARY KEY, birth_year INTEGER, voto TEXT,
        potenziale REAL, lettera_potenziale TEXT, lettere_sotto INTEGER, calcolato_il TEXT)""",
]


def controllo(conn, righe_fc, ora) -> int:
    """Ogni notte (25/11/2026): cavalli fino a 5 anni, in corsa, con il
    potenziale di fine carriera due lettere o piu' sotto il voto di oggi.
    Il voto di carriera puo' scendere davvero, ma non cosi' tanto per un
    giovane che corre: di solito e' un dato che il calcolo non ha visto
    (come le corse all'estero di IN THE WIND GAR, potenziale E con voto S)."""
    ordine = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"]
    soglie = soglie_voto(conn)
    def lettera(x):
        for g, m in soglie:
            if x >= m:
                return g
        return "F"
    voti = dict(conn.execute("SELECT name, grade FROM horse_ratings WHERE rating_mode = 'performance' AND grade IS NOT NULL").fetchall())
    anno = date.today().year
    sospetti = []
    for r in righe_fc:
        cav, nato, ferma, pot = r[0], r[1], r[6], r[7]
        v = voti.get(cav)
        if pot is None or v not in ordine or ferma or anno - nato > 5:
            continue
        lp = lettera(pot)
        d = ordine.index(lp) - ordine.index(v)
        if d >= 2:
            sospetti.append((cav, nato, v, round(float(pot), 1), lp, d, ora))
    conn.execute("DELETE FROM forza_controllo")
    conn.executemany("INSERT OR REPLACE INTO forza_controllo VALUES (?,?,?,?,?,?,?)", sospetti)
    conn.commit()
    esempi = ", ".join(f"{x[0]} ({x[2]} -> {x[4]})" for x in sorted(sospetti, key=lambda x: -x[5])[:8])
    log(f"[FORZA] controllo: {len(sospetti)} giovani in corsa con il potenziale due lettere o piu' sotto il voto" + (f": {esempi}" if esempi else ""))
    return len(sospetti)


def calcola(conn, con_verifica: bool = False) -> dict:
    oggi = pd.Timestamp(date.today())
    anno_ora = oggi.year
    r = carica_corse(conn)
    t = cifre(r)
    s0 = stagioni(t)
    punti = scala_da(s0["forma"].to_numpy())
    # 25/11/2026: l'anagrafica viene dai cavalli, non dalle corse in Italia.
    # Prima chi correva solo all'estero (IN THE WIND GAR, S fra tutti e SSS
    # nella sua annata) non aveva anagrafica: le sue stagioni sparivano e la
    # curva lo prevedeva come un cavallo mai corso, dal solo padre (E). Le
    # corse all'estero restano fuori solo dalla FORZA (velocita' confrontata
    # pista per pista), non dal voto, che le ha sempre contate.
    anag = pd.read_sql_query("""SELECT h.name AS cavallo, h.birth_year AS nato, h.sex AS sesso, UPPER(TRIM(h.sire)) AS padre,
                                       UPPER(TRIM(h.dam)) AS madre,
                                       (SELECT UPPER(TRIM(m.sire)) FROM horses m WHERE m.name = h.dam LIMIT 1) AS padre_madre
                                FROM horses h WHERE h.birth_year IS NOT NULL""", conn).drop_duplicates("cavallo").set_index("cavallo")
    s_forza = tabella_stagioni(r, s0, punti)
    vt, extra = voti_per_anno(conn, anno_ora)
    # L'anno in corso: il voto della testata, cosi' la curva arriva li'.
    attuali = dict(conn.execute("""SELECT name, score FROM horse_ratings
                                   WHERE rating_mode = 'performance' AND score IS NOT NULL""").fetchall())
    oggi_mask = vt["anno"] == anno_ora
    vt.loc[oggi_mask, "voto"] = [attuali.get(c, v) for c, v in zip(vt.loc[oggi_mask, "cavallo"], vt.loc[oggi_mask, "voto"])]
    s = tabella_voti(vt, s_forza, anag)
    completo = anno_ora - 1
    padri = media_padri(s, completo)
    madri_ora = media_madri(s, completo) if PEDIGREE_CURVA else None
    tr = esempi(s, anag, completo, padri)
    log(f"[FORZA] {len(t)} corse con il tempo, {len(s)} stagioni con il voto, {len(tr)} esempi per la curva")
    mod = allena(tr)
    k = taratura(s, anag, completo)
    log(f"[FORZA] taratura della forbice: {k}")

    # Forza di oggi (velocita' degli ultimi 12 mesi).
    ult12 = t[t["d"] > oggi - pd.Timedelta(days=365)]
    righe_f = {}
    for cav, g in ult12.groupby("cavallo"):
        giorni = (oggi - g["d"]).dt.days.to_numpy()
        f_ora = forma(g["cifra"].to_numpy(), 0.5 ** (giorni / 180))
        recenti, vecchie = g[giorni <= 180], g[giorni > 180]
        tend = np.nan
        if len(recenti) >= 2 and len(vecchie) >= 2:
            tend = forma(recenti["cifra"].to_numpy(), np.ones(len(recenti))) - \
                forma(vecchie["cifra"].to_numpy(), np.ones(len(vecchie)))
        righe_f[cav] = (f_ora, tend, len(g))
    # Ultima corsa ovunque, estero compreso: chi corre all'estero non e' fermo.
    ultima = pd.read_sql_query("SELECT horse_name AS cavallo, MAX(race_date) AS d FROM races WHERE race_date IS NOT NULL GROUP BY 1", conn)
    ultima = pd.to_datetime(ultima.set_index("cavallo")["d"], errors="coerce").dropna()
    futuro = extra["futuro"]

    h = pd.read_sql_query("""SELECT name AS cavallo, birth_year AS nato, sex AS sesso, UPPER(TRIM(sire)) AS padre
                             FROM horses WHERE birth_year >= 2012""", conn)
    per_cav = {c: g.set_index("eta") for c, g in s.groupby("cavallo")}
    stag, curve, righe_prev, fc = [], [], [], []
    ora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    for cav, nato, sesso, padre in h.itertuples(index=False):
        nato = int(nato)
        a = anno_ora - nato
        if a < 0:
            continue
        passato = per_cav.get(cav)
        passato = (passato[["v", "fv", "corse_anno", "anno"]].astype(float).copy() if passato is not None
                   else pd.DataFrame(columns=["v", "fv", "corse_anno", "anno"], dtype=float))
        f = righe_f.get(cav)
        if f is not None and not np.isnan(f[0]) and a in passato.index:
            passato.loc[a, "fv"] = float(in_scala(f[0], punti))   # forza di oggi per l'anno in corso
        u = ultima.get(cav)
        ferma = bool(u is not None and (oggi - u).days > FERMO_GIORNI)
        if u is None and a > 4:
            continue
        for eta, row in passato.iterrows():
            stag.append((cav, int(eta), int(row["anno"]), round(float(row["v"]), 1),
                         int(row["corse_anno"]) if row["corse_anno"] == row["corse_anno"] else None,
                         round(float(row["fv"]), 1) if row["fv"] == row["fv"] else None))
        if ferma:
            # Carriera ferma: niente previsione, il voto cambia solo perche'
            # crescono le stagioni che avrebbe potuto correre (fino ai 7 anni).
            for e in range(a if a not in passato.index else a + 1, 8):
                v = attuali.get(cav) if e == a else futuro(cav, nato + e)
                if v is not None:
                    curve.append((cav, e, round(v, 1), round(v, 1), round(v, 1)))
        elif a < ETA_MAX:
            mm = anag["madre"].get(cav) if "madre" in anag else None
            pmm = anag["padre_madre"].get(cav) if "padre_madre" in anag else None
            sit = situazione(a, passato, sesso, padre, padri, mm, pmm, madri_ora)
            for hh in range(1, ETA_MAX - a + 1):
                righe_prev.append({**sit, "h": hh, "cavallo": cav, "eta_obiettivo": a + hh})
        fc.append((cav, nato, f, u, ferma, passato))
    prev = pd.DataFrame(righe_prev)
    if len(prev):
        lo, p50, hi = prevedi(mod, prev, k)
        prev["basso"], prev["mediana"], prev["alto"] = lo, p50, hi
        curve += [(c, int(e), round(float(m), 1), round(float(b), 1), round(float(al), 1))
                  for c, e, m, b, al in prev[["cavallo", "eta_obiettivo", "mediana", "basso", "alto"]]
                  .itertuples(index=False)]
    per_curva: dict = {}
    for c, e, m, b, al in curve:
        per_curva.setdefault(c, []).append((e, m, b, al))
    righe_fc = []
    for cav, nato, f, u, ferma, passato in fc:
        picco = picco_eta = None
        if len(passato):
            idx = passato["v"].idxmax()
            picco, picco_eta = round(float(passato.loc[idx, "v"]), 1), int(idx)
        # Potenziale: il voto a fine carriera (l'ultima eta' della curva), o
        # quello di oggi se la curva non va oltre.
        cv = sorted(per_curva.get(cav, []))
        if cv:
            e, m, b, al = max(cv, key=lambda x: x[1]) if not ferma else cv[-1]
            pot = (m, None if ferma else b, None if ferma else al, e)
        elif len(passato):
            ult = passato.index.max()
            pot = (round(float(passato.loc[ult, "v"]), 1), None, None, int(ult))
        else:
            pot = (None, None, None, None)
        forza_ora = round(float(in_scala(f[0], punti)), 1) if f is not None and not np.isnan(f[0]) else None
        tend = None
        if f is not None and not np.isnan(f[1]):
            tend = round(float(in_scala(f[0], punti) - in_scala(f[0] - f[1], punti)), 1)
        righe_fc.append((cav, nato, forza_ora, tend, f[2] if f is not None else 0,
                         u.strftime("%Y-%m-%d") if u is not None else None, int(ferma),
                         pot[0], pot[1], pot[2], pot[3], picco, picco_eta, VERSIONE, ora))
    conn.execute("DROP TABLE IF EXISTS forza_stagioni")
    for q in SCHEMA:
        conn.execute(q)
    conn.execute("DELETE FROM forza_cavallo")
    conn.execute("DELETE FROM curva_carriera")
    conn.execute("DELETE FROM voto_soglie")
    conn.executemany("INSERT OR REPLACE INTO forza_cavallo VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", righe_fc)
    conn.executemany("INSERT OR REPLACE INTO forza_stagioni VALUES (?,?,?,?,?,?)", stag)
    conn.executemany("INSERT OR REPLACE INTO curva_carriera VALUES (?,?,?,?,?)", curve)
    conn.executemany("INSERT INTO voto_soglie VALUES (?,?)", soglie_voto(conn))
    conn.commit()
    try:
        n_sospetti = controllo(conn, righe_fc, ora)
    except Exception as e:  # noqa: BLE001  il controllo non deve fermare la notte
        log(f"[FORZA] controllo non riuscito: {e!r}")
        n_sospetti = None
    esito = {"cavalli": len(righe_fc), "stagioni": len(stag), "curve": len(curve), "sospetti": n_sospetti}
    log(f"[FORZA] {esito}")
    if con_verifica:
        v = {"versione": VERSIONE, "calcolato_il": oggi.strftime("%Y-%m-%d"),
             "forza": verifica_forza(t, oggi), "curva": verifica_curva(s, anag)}
        c = v["curva"]
        c["esito"] = ("affidabile" if c["errore_modello"] < c["errore_crescita_tipica"]
                      and 0.75 <= c["copertura_80"] <= 0.85 else "in verifica")
        fz = v["forza"]
        fz["esito"] = "affidabile" if (fz["ordine_giusto"] or 0) >= 0.6 else "in verifica"
        VERIFICA.parent.mkdir(exist_ok=True)
        VERIFICA.write_text(json.dumps(v, ensure_ascii=False, indent=1))
        log(f"[FORZA] verifica: {json.dumps(v, ensure_ascii=False)}")
        esito["verifica"] = v
    return esito


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--verifica", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    calcola(conn, a.verifica)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
