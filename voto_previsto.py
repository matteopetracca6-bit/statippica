"""
voto_previsto.py — Il voto che un cavallo giovane avra' probabilmente a fine
carriera (ottobre 2026).

PERCHE'
  Il voto racconta la carriera fatta finora. Per un cavallo di due o tre anni
  quella carriera e' una manciata di corse: lo studio sulla stabilita' del
  voto (scripts/grade_stability.py, tesi par. 5) mostra che a due anni solo un
  SSS su dieci resta SSS a fine carriera. Il voto resta com'e' (descrive il
  passato); accanto, per i cavalli dai 2 ai 5 anni, si mostra una stima del
  voto a fine carriera con un intervallo.

IL CONFRONTO
  Come nello studio sulla stabilita', il voto e' calcolato contro i nati
  nello stesso anno: 60% premi, 20% miglior tempo, 20% vittorie (con un
  aggiustamento per chi ha corso poco). La tenuta non entra, perche' a due
  anni non si misura. Le lettere seguono le soglie del sito: SSS primo 1%,
  SS primo 5%, S 10%, A 25%, B 40%, C 60%, D 75%, E 90%, F il resto.

COSA FA
  Fotografa i cavalli a fine gennaio, aprile, luglio e ottobre di ogni anno,
  con solo le corse fino a quel giorno: eta', sesso, corse, vittorie,
  piazzamenti, premi, tempi, livello delle corse, giorni dall'ultima corsa, il
  voto di oggi contro i coetanei e la media dei fratelli piu' vecchi per
  parte di padre (anche quella misurata a quel giorno). Tre modelli XGBoost
  stimano la posizione finale fra i coetanei (da 0 a 100): il valore centrale
  e i due estremi di un intervallo che dovrebbe contenere il vero 8 volte su
  10.

PROVA (a mano):  python3 voto_previsto.py --prova
  Allena sui nati 2012-2014 e prova sui nati 2015-2016 (carriere quasi
  chiuse: 10-11 anni). La regola e' fissata PRIMA della prova (ADOZIONE): per
  ogni eta' dai 2 ai 5 anni il modello deve sbagliare di meno lettere in media
  del voto attuale e indovinare la lettera, o quella accanto, almeno altrettanto
  spesso; l'intervallo deve contenere il vero fra il 75% e l'85% delle volte.
  Si mostra solo per le eta' che passano. Se passa, si riallena sui nati
  2012-2016 e si salva.

USO NOTTURNO
  phase_voto_previsto(conn) scrive la tabella voto_previsto. Nessun bisogno di
  XGBoost: gli alberi si leggono con numpy (pronostico_top3.Alberi).
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_Q = {q: CARTELLA / f"voto_previsto_q{q}.json" for q in (10, 50, 90)}
FILE_VERIFICA = CARTELLA / "voto_previsto_verifica.json"
NOME_MODELLO = "voto-previsto-xgb-v1"

ORDINE = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"]
SCALA = [(99, "SSS"), (95, "SS"), (90, "S"), (75, "A"), (60, "B"), (40, "C"), (25, "D"), (10, "E")]
ETA_MOSTRATE = (2, 3, 4, 5)
ETA_ALLENAMENTO = (2, 3, 4, 5, 6)
MESI = (1, 4, 7, 10)
QUOTE = [1.0, 0.475, 0.259, 0.13, 0.087]   # quote dei piazzati sul premio del vincitore

# Regola di adozione, fissata prima della prova.
ADOZIONE = {
    "per_ogni_eta": "errore medio in lettere piu' basso del voto attuale E lettera giusta o accanto almeno altrettanto spesso",
    "copertura_intervallo": [0.75, 0.85],
}

VARIABILI = [
    "eta", "mese", "femmina", "gare", "vitt", "r_vitt", "r_top3", "premi", "premi365",
    "gare365", "t_best", "t_best365", "t_med5", "giorni_ultima", "giorni_prima",
    "liv_medio", "liv365", "liv_top3_migl", "pg", "pr", "pw", "pct_attuale",
    "quota_premi_365", "padre_media", "padre_n",
]


def lettera(pct: float) -> str:
    for p, g in SCALA:
        if pct > p:
            return g
    return "F"


def _gradino(pct) -> np.ndarray:
    pct = np.asarray(pct, dtype=float)
    out = np.full(pct.shape, 8, dtype=int)
    for i, (p, _) in reversed(list(enumerate(SCALA))):
        out[pct > p] = i
    return out


# ───────────────────────── dati ─────────────────────────

def carica(conn) -> tuple[pd.DataFrame, pd.DataFrame]:
    h = pd.read_sql_query("""
        SELECT UPPER(TRIM(name)) AS cavallo, birth_year AS nato, sex, UPPER(TRIM(sire)) AS padre
        FROM horses WHERE birth_year >= 2012 AND COALESCE(horse_class,'athlete') = 'athlete'""", conn)
    h = h.drop_duplicates("cavallo")
    r = pd.read_sql_query("""
        SELECT UPPER(TRIM(horse_name)) AS cavallo, race_date AS d, track, race_number,
               placement AS pos, COALESCE(prize_net, 0) AS premio, time_km AS t
        FROM races WHERE race_date LIKE '____-__-__'""", conn)
    r = r[r["cavallo"].isin(set(h["cavallo"]))].copy()
    r["d"] = pd.to_datetime(r["d"])
    # Livello della corsa: premio del vincitore, stimato dai premi dei piazzati.
    q = r["pos"].map(lambda p: QUOTE[int(p) - 1] if p == p and p is not None and 1 <= p <= 5 else np.nan)
    r["_vinc"] = np.where((r["premio"] > 0) & q.notna(), r["premio"] / q, np.nan)
    chiave = ["d", "track", "race_number"]
    r["liv"] = np.log1p(r.groupby(chiave)["_vinc"].transform("max"))
    r = r.drop(columns="_vinc")
    r["t"] = r["t"].where(r["t"] > 1)
    r = r.merge(h[["cavallo", "nato"]], on="cavallo")
    return r.sort_values(["cavallo", "d"]).reset_index(drop=True), h


def _percentili_coorte(df: pd.DataFrame) -> pd.DataFrame:
    """pg, pr, pw, punti e posizione (0-100) contro i nati nello stesso anno,
    con le stesse formule dello studio sulla stabilita' del voto."""
    g = df.groupby("nato")
    n = g["cavallo"].transform("count")
    df["pg"] = g["premi"].rank(method="max") / n * 100
    nt = g["t_best"].transform("count")
    # quota di coetanei con un tempo uguale o peggiore (piu' alto)
    df["pr"] = g["t_best"].rank(method="max", ascending=False) / nt * 100
    df["pr"] = df["pr"].fillna(df["pg"])
    media_v = g["vitt"].transform("sum") / g["gare"].transform("sum")
    df["pw"] = (df["vitt"] + 20 * media_v) / (df["gare"] + 20) * 100
    df["punti"] = df["pg"] * 0.6 + df["pr"] * 0.2 + df["pw"] * 0.2
    df["pct_attuale"] = df.groupby("nato")["punti"].rank(method="max") / n * 100
    return df


def fotografia(r: pd.DataFrame, h: pd.DataFrame, giorno: pd.Timestamp) -> pd.DataFrame:
    """Tutti i cavalli nati dal 2012 che hanno corso almeno una volta entro
    `giorno`, con le variabili calcolate solo sulle corse fino a quel giorno."""
    x = r[r["d"] <= giorno]
    if x.empty:
        return pd.DataFrame()
    anno = x["d"] > giorno - pd.Timedelta(days=365)
    g = x.groupby("cavallo")
    f = pd.DataFrame({
        "gare": g.size(),
        "vitt": g["pos"].apply(lambda s: (s == 1).sum()),
        "top3": g["pos"].apply(lambda s: ((s >= 1) & (s <= 3)).sum()),
        "premi": g["premio"].sum(),
        "t_best": g["t"].min(),
        "t_med5": g["t"].apply(lambda s: s.dropna().tail(5).mean()),
        "ultima": g["d"].max(),
        "prima": g["d"].min(),
        "liv_medio": g["liv"].mean(),
    })
    xa = x[anno].groupby("cavallo")
    f["premi365"] = xa["premio"].sum()
    f["gare365"] = xa.size()
    f["t_best365"] = xa["t"].min()
    f["liv365"] = xa["liv"].mean()
    f["liv_top3_migl"] = x[(x["pos"] >= 1) & (x["pos"] <= 3)].groupby("cavallo")["liv"].max()
    f = f.reset_index().merge(h, on="cavallo")
    f[["premi365", "gare365"]] = f[["premi365", "gare365"]].fillna(0)
    f["giorni_ultima"] = (giorno - f["ultima"]).dt.days
    f["giorni_prima"] = (giorno - f["prima"]).dt.days
    f["r_vitt"] = (f["vitt"] + 1) / (f["gare"] + 10)
    f["r_top3"] = (f["top3"] + 3) / (f["gare"] + 10)
    f["quota_premi_365"] = np.where(f["premi"] > 0, f["premi365"] / f["premi"].clip(lower=1), np.nan)
    f["eta"] = giorno.year - f["nato"]
    f["mese"] = giorno.month
    f["femmina"] = (f["sex"].astype(str).str.upper().str[:1] == "F").astype(float)
    f = _percentili_coorte(f)
    # Fratelli piu' vecchi per parte di padre: posizione media contro i loro
    # coetanei, misurata allo stesso giorno (niente dati dal futuro).
    pad = f[f["padre"].notna() & (f["padre"] != "")][["padre", "nato", "pct_attuale"]]
    agg = pad.groupby(["padre", "nato"])["pct_attuale"].agg(["sum", "count"]).reset_index().sort_values("nato")
    agg["s_cum"] = agg.groupby("padre")["sum"].cumsum() - agg["sum"]
    agg["n_cum"] = agg.groupby("padre")["count"].cumsum() - agg["count"]
    f = f.merge(agg[["padre", "nato", "s_cum", "n_cum"]], on=["padre", "nato"], how="left")
    f["padre_n"] = f["n_cum"].fillna(0)
    f["padre_media"] = np.where(f["padre_n"] > 0, f["s_cum"] / f["padre_n"].clip(lower=1), np.nan)
    f["giorno"] = giorno
    return f.drop(columns=["s_cum", "n_cum"])


def finale(r: pd.DataFrame, h: pd.DataFrame) -> pd.Series:
    """Posizione a fine carriera (o a oggi) contro i coetanei, 0-100."""
    f = fotografia(r, h, r["d"].max())
    return f.set_index("cavallo")["pct_attuale"]


def fotografie(r, h, coorti, eta=ETA_ALLENAMENTO) -> pd.DataFrame:
    righe = []
    ultimo = r["d"].max()
    for anno in range(min(coorti) + min(eta), max(coorti) + max(eta) + 1):
        for mese in MESI:
            giorno = pd.Timestamp(anno, mese, 1) + pd.offsets.MonthEnd(0)
            if giorno > ultimo:
                continue
            f = fotografia(r, h, giorno)
            if f.empty:
                continue
            f = f[f["nato"].isin(coorti) & f["eta"].isin(eta)]
            righe.append(f)
            print(f"  fotografia {giorno.date()}: {len(f)}", file=sys.stderr, flush=True)
    return pd.concat(righe, ignore_index=True)


# ───────────────────────── modello ─────────────────────────

PARAMETRI = {"tree_method": "hist", "max_depth": 5, "eta": 0.05, "subsample": 0.8,
             "colsample_bytree": 0.8, "min_child_weight": 20, "objective": "reg:quantileerror"}


def _allena(df: pd.DataFrame, q: int, n_alberi: int | None = None, va: pd.DataFrame | None = None):
    import xgboost as xgb
    p = dict(PARAMETRI, quantile_alpha=q / 100)
    d = xgb.DMatrix(df[VARIABILI].to_numpy("float32"), label=df["y"], feature_names=VARIABILI)
    if n_alberi is None:
        dv = xgb.DMatrix(va[VARIABILI].to_numpy("float32"), label=va["y"], feature_names=VARIABILI)
        b = xgb.train(p, d, 2000, evals=[(dv, "va")], early_stopping_rounds=60, verbose_eval=False)
        return b, b.best_iteration + 1
    return xgb.train(p, d, n_alberi), n_alberi


def _misure(df: pd.DataFrame, q10, q50, q90) -> dict:
    vero = _gradino(df["y"])
    att = _gradino(df["pct_attuale"])
    mod = _gradino(q50)
    out = {"n": int(len(df)), "cavalli": int(df["cavallo"].nunique())}
    for nome, g in (("voto_attuale", att), ("modello", mod)):
        out[nome] = {
            "lettera_giusta": round(float((g == vero).mean()), 4),
            "giusta_o_accanto": round(float((abs(g - vero) <= 1).mean()), 4),
            "errore_lettere": round(float(abs(g - vero).mean()), 4),
        }
    out["copertura_intervallo"] = round(float(((df["y"] >= q10) & (df["y"] <= q90)).mean()), 4)
    out["larghezza_lettere"] = round(float((_gradino(q10) - _gradino(q90)).mean()), 2)
    return out


def _supera(m: dict) -> bool:
    return (m["modello"]["errore_lettere"] < m["voto_attuale"]["errore_lettere"]
            and m["modello"]["giusta_o_accanto"] >= m["voto_attuale"]["giusta_o_accanto"])


def prova(conn) -> dict:
    r, h = carica(conn)
    fin = finale(r, h)
    df = fotografie(r, h, range(2012, 2017))
    df["y"] = df["cavallo"].map(fin)
    df = df[df["y"].notna()].reset_index(drop=True)
    tr = df[df["nato"] <= 2014]
    te = df[df["nato"] >= 2015]
    # Numero di alberi: il nato 2014 fa da controllo, poi si riallena su 2012-2014.
    alberi, pred = {}, {}
    for q in (10, 50, 90):
        _, n = _allena(tr[tr["nato"] <= 2013], q, va=tr[tr["nato"] == 2014])
        b, _ = _allena(tr, q, n)
        alberi[q] = n
        import xgboost as xgb
        pred[q] = b.predict(xgb.DMatrix(te[VARIABILI].to_numpy("float32"), feature_names=VARIABILI))
    q10, q50, q90 = (np.minimum(pred[10], pred[50]), pred[50], np.maximum(pred[90], pred[50]))
    ris = {"periodo_allenamento": "nati 2012-2014", "periodo_prova": "nati 2015-2016",
           "alberi": alberi, "regola": ADOZIONE, "tutte": _misure(te, q10, q50, q90), "per_eta": {}}
    for e in ETA_ALLENAMENTO:
        k = (te["eta"] == e).to_numpy()
        m = _misure(te[k], q10[k], q50[k], q90[k])
        m["supera"] = _supera(m)
        ris["per_eta"][str(e)] = m
    # Per voto attuale (eta' 2-3): dove il modello cambia di piu' la lettura
    ris["per_voto_2_3_anni"] = {}
    k = te["eta"].isin([2, 3]).to_numpy()
    att = np.array([lettera(v) for v in te["pct_attuale"]])
    for g in ORDINE:
        kk = k & (att == g)
        if kk.sum() >= 30:
            vero = _gradino(te["y"].to_numpy()[kk])
            ris["per_voto_2_3_anni"][g] = {
                "n": int(kk.sum()),
                "resta": round(float((vero == ORDINE.index(g)).mean()), 3),
                "lettera_media_vera": round(float(vero.mean()), 2),
                "lettera_media_modello": round(float(_gradino(q50[kk]).mean()), 2),
                "modello_giusta": round(float((_gradino(q50[kk]) == vero).mean()), 3),
            }
    eta_ok = [e for e in ETA_MOSTRATE if ris["per_eta"][str(e)]["supera"]]
    cop = ris["tutte"]["copertura_intervallo"]
    ris["eta_adottate"] = eta_ok if ADOZIONE["copertura_intervallo"][0] <= cop <= ADOZIONE["copertura_intervallo"][1] else []
    ris["adottato"] = bool(ris["eta_adottate"])
    return ris, df


def allena_e_salva(conn, df: pd.DataFrame, ris: dict) -> None:
    import xgboost as xgb  # noqa: F401
    for q in (10, 50, 90):
        b, _ = _allena(df, q, ris["alberi"][q])
        b.save_model(str(FILE_Q[q]))
    ris["nome"] = NOME_MODELLO
    ris["allenato_il"] = date.today().isoformat()
    ris["allenato_su"] = "nati 2012-2016, fotografie trimestrali dai 2 ai 6 anni"
    FILE_VERIFICA.write_text(json.dumps(ris, ensure_ascii=False, indent=1))


# ───────────────────────── notte ─────────────────────────

def phase_voto_previsto(conn) -> int:
    try:
        ver = json.loads(FILE_VERIFICA.read_text())
    except Exception:
        print("[VOTO PREVISTO] modello assente: salto", file=sys.stderr)
        return 0
    eta_ok = ver.get("eta_adottate") or []
    conn.execute("""CREATE TABLE IF NOT EXISTS voto_previsto (
        horse_name TEXT PRIMARY KEY, eta INTEGER, voto_coetanei TEXT, voto_previsto TEXT,
        voto_basso TEXT, voto_alto TEXT, posizione REAL, modello TEXT, calcolato_il TEXT)""")
    conn.execute("DELETE FROM voto_previsto")
    if not eta_ok:
        conn.commit()
        return 0
    from pronostico_top3 import Alberi
    r, h = carica(conn)
    oggi = pd.Timestamp(date.today())
    giorno = min(oggi, r["d"].max() + pd.Timedelta(days=1))
    f = fotografia(r, h, giorno)
    f = f[f["eta"].isin(eta_ok)]
    # mese: il trimestre di allenamento piu' vicino
    f["mese"] = min(MESI, key=lambda m: abs(m - giorno.month))
    X = f[VARIABILI].to_numpy("float32")
    p = {q: Alberi(FILE_Q[q]).margine(X) for q in (10, 50, 90)}
    q50 = np.clip(p[50], 0, 100)
    q10 = np.clip(np.minimum(p[10], q50), 0, 100)
    q90 = np.clip(np.maximum(p[90], q50), 0, 100)
    righe = [(c, int(e), lettera(a), lettera(m), lettera(lo), lettera(hi), round(float(m), 1),
              ver.get("nome", NOME_MODELLO), date.today().isoformat())
             for c, e, a, m, lo, hi in zip(f["cavallo"], f["eta"], f["pct_attuale"], q50, q10, q90)]
    conn.executemany("INSERT OR REPLACE INTO voto_previsto VALUES (?,?,?,?,?,?,?,?,?)", righe)
    conn.commit()
    print(f"[VOTO PREVISTO] {len(righe)} cavalli (eta' {eta_ok})", file=sys.stderr)
    return len(righe)


if __name__ == "__main__":
    import os
    conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    if "--prova" in sys.argv:
        ris, df = prova(conn)
        print(json.dumps(ris, ensure_ascii=False, indent=1))
        if ris["adottato"] and "--salva" in sys.argv:
            allena_e_salva(conn, df, ris)
            print("salvato", file=sys.stderr)
    else:
        print(phase_voto_previsto(conn))
