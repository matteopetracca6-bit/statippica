"""
rischio_galoppo.py — Probabilita' che un cavallo rompa e venga squalificato
per galoppo, prima della partenza.

COSA FA
  Per ogni cavallo iscritto a una gara in calendario stima la probabilita'
  che la corsa finisca con una squalifica per galoppo: "r.p." (rottura
  prolungata durante la corsa) oppure "r.a." (galoppo in arrivo). Nel
  2014-2026 succede in circa una partenza su cinque.
  Le stime vanno nella tabella `rischio_galoppo`, che il sito mostra nel
  Calendario accanto al pronostico dei primi tre, e in
  `rischio_galoppo_storico`, che le conserva dopo la gara per controllarle
  con l'esito vero.

STESSE REGOLE DEL PRONOSTICO
  Le variabili sono quelle del pronostico dei primi tre (pronostico_top3.py),
  calcolate solo con le corse precedenti, piu' quelle sulle rotture:
  quante volte il cavallo ha rotto in carriera e nelle ultime corse, e
  quanto rompono i cavalli del guidatore di oggi e dell'allenatore (quello
  dell'ultima corsa: il calendario non lo scrive). La ferratura di oggi NON
  entra: la fonte la scrive solo il giorno della corsa, dopo il lavoro
  notturno (e nella prima prova non aggiungeva nulla).

LA REGOLA DI ADOZIONE (fissata PRIMA della prova, 2 novembre 2026)
  Il modello impara sulle corse fino al 2023; il 2024 serve a decidere
  quando fermarsi e a tarare le probabilita'; la prova e' sulle corse dal
  2025 in poi, mai viste. Il confronto e' con la regola semplice piu' forte:
  la quota di rotture del cavallo nelle corse passate (tirata verso la media
  quando le corse sono poche). Il modello si usa nel sito solo se:
    1. distingue meglio chi rompe (AUC piu' alta della regola semplice), con
       il limite basso dell'intervallo al 95% del vantaggio sopra zero
       (2.000 ricampionamenti per giornata);
    2. le probabilita' sono vere: in ogni decimo di stima la differenza fra
       la quota prevista e quella vera non supera 3 punti;
    3. il vantaggio c'e' sia nel 2025 sia nel 2026, presi da soli.
  Si usa esattamente il modello provato (non lo si riallena dopo la prova).

DUE MODI DI USO
  python3 rischio_galoppo.py --allena   allena, verifica e salva (a mano)
  phase_rischio_galoppo(conn)           nel lavoro notturno
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import pronostico_top3 as pt

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "galoppo_xgb.json"
FILE_VERIFICA = CARTELLA / "galoppo_verifica.json"
NOME_MODELLO = "galoppo-xgb-v1"

GALOPPO = ("r.p.", "r.a.")
PRIORE = 10.0          # corse "finte" alla media per chi ne ha poche
SOGLIA_BASSO = 0.12    # fasce mostrate nel sito (media dell'archivio: circa 0,20)
SOGLIA_ALTO = 0.30

VARIABILI = [
    # rotture
    "h_gal", "h_gal_shr", "h_gal_ult5", "h_gal_ult10", "h_gal_ult", "h_gal_365",
    "d_gal", "d_gal_n", "a_gal", "a_gal_n",
    # dal pronostico dei primi tre
    "h_n", "h_giorni", "eta", "maschio",
    "partenza", "partenti", "partenza_rel",
    "distanza", "dist_handicap", "dist_vs_solita", "h_fascia_n",
    "h_classe5", "h_tempo_migl", "h_ult5_top3", "h_top3", "h_pista_n", "d_n", "a_n",
]


def fascia(p: float) -> str:
    return "basso" if p < SOGLIA_BASSO else ("alto" if p >= SOGLIA_ALTO else "medio")


def _tasso_prima(df, chi: str, col: str = "gal"):
    """Quota di `col` delle corse di `chi` (guidatore o allenatore) nei giorni
    PRIMA della corsa: le corse dello stesso giorno restano fuori."""
    import pandas as pd
    d = df[df[chi].notna() & df[col].notna()]
    g = d.groupby([chi, "data"], sort=True)[col].agg(s="sum", n="count").reset_index()
    g["cs"] = g.groupby(chi)["s"].cumsum()
    g["cn"] = g.groupby(chi)["n"].cumsum()
    g = g.sort_values("data")
    sx = df[[chi, "data"]].reset_index().dropna(subset=[chi]).sort_values("data")
    m = pd.merge_asof(sx, g[[chi, "data", "cs", "cn"]], on="data", by=chi,
                      allow_exact_matches=False, direction="backward")
    m = m.set_index("index").reindex(df.index)
    return (m["cs"] / m["cn"]).where(m["cn"] >= 20), m["cn"].astype(float)


def aggiungi_variabili(conn: sqlite3.Connection, df):
    """Aggiunge alle righe del pronostico l'esito "galoppo" e le variabili
    sulle rotture passate. `df` e' l'uscita di pt.costruisci_variabili."""
    import numpy as np
    import pandas as pd
    es = pd.read_sql_query(
        """SELECT horse_name AS cavallo, race_date AS data, LOWER(placement_raw) AS esito
             FROM races WHERE race_date >= '2013-01-01'
              AND COALESCE(LOWER(placement_raw), '') NOT IN ('nr', 'n.p.')""", conn)
    es["data"] = pd.to_datetime(es["data"], errors="coerce")
    es = es.dropna(subset=["data"]).drop_duplicates(["cavallo", "data"])
    es["_g"] = es["esito"].isin(GALOPPO).astype(float)
    df = df.merge(es[["cavallo", "data", "_g"]], on=["cavallo", "data"], how="left")
    corsa = ~df["futura"].astype(bool)
    df["gal"] = np.where(corsa, df["_g"].fillna(0.0), np.nan)
    df = df.drop(columns=["_g"])
    df = df.sort_values(["cavallo", "data", "gara"]).reset_index(drop=True)

    base = float(df.loc[corsa, "gal"].mean())
    g = df.groupby("cavallo", sort=False)
    df["h_gal"] = pt._media_passata(df, "cavallo", "gal")
    prev = g["gal"].shift()
    k = prev.fillna(0).groupby(df["cavallo"], sort=False).cumsum()
    n = prev.notna().astype(float).groupby(df["cavallo"], sort=False).cumsum()
    df["h_gal_shr"] = (k + PRIORE * base) / (n + PRIORE)
    df["h_gal_ult5"] = pt._mobile_passata(df, "cavallo", "gal", 5)
    df["h_gal_ult10"] = pt._mobile_passata(df, "cavallo", "gal", 10)
    df["h_gal_ult"] = prev
    tmp = df[["cavallo", "data", "gal"]].copy().set_index("data")
    r = tmp.groupby("cavallo", sort=False)["gal"].rolling("365D", closed="left").mean()
    df["h_gal_365"] = r.to_numpy()
    df["d_gal"], df["d_gal_n"] = _tasso_prima(df, "guidatore")
    # L'allenatore della corsa e' noto solo per le corse gia' fatte; quello
    # "di oggi" e' quello dell'ultima corsa (colonna `allenatore`). Il tasso
    # si misura sulle corse dove e' stato davvero l'allenatore.
    d2 = df.rename(columns={"allenatore": "_all_oggi"})
    d2["allenatore"] = d2["allenatore_corsa"]
    sx = d2[d2["allenatore"].notna() & d2["gal"].notna()]
    gg = sx.groupby(["allenatore", "data"], sort=True)["gal"].agg(s="sum", n="count").reset_index()
    gg["cs"] = gg.groupby("allenatore")["s"].cumsum()
    gg["cn"] = gg.groupby("allenatore")["n"].cumsum()
    gg = gg.sort_values("data").rename(columns={"allenatore": "_all_oggi"})
    q = df[["allenatore", "data"]].rename(columns={"allenatore": "_all_oggi"}).reset_index()
    q = q.dropna(subset=["_all_oggi"]).sort_values("data")
    m = pd.merge_asof(q, gg[["_all_oggi", "data", "cs", "cn"]], on="data", by="_all_oggi",
                      allow_exact_matches=False, direction="backward").set_index("index").reindex(df.index)
    df["a_gal"] = (m["cs"] / m["cn"]).where(m["cn"] >= 20)
    df["a_gal_n"] = m["cn"].astype(float)
    df.attrs["media_galoppo"] = base
    return df


def costruisci(conn: sqlite3.Connection, con_calendario: bool = False, df=None):
    if df is None:
        df = pt.costruisci_variabili(conn, con_calendario=con_calendario)
    return aggiungi_variabili(conn, df.copy())


# ─────────────────────────────────────────────────────────────────────────────
#  Allenamento e prova (a mano)
# ─────────────────────────────────────────────────────────────────────────────

def _platt(p, y):
    """Taratura sul 2024: una retta sul logaritmo delle quote."""
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    lp = np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4))).reshape(-1, 1)
    lr = LogisticRegression(C=1e6).fit(lp, y)
    return float(lr.coef_[0][0]), float(lr.intercept_[0])


def tara(p, a: float, b: float):
    import numpy as np
    p = np.clip(np.asarray(p, dtype=float), 1e-4, 1 - 1e-4)
    return 1 / (1 + np.exp(-(a * np.log(p / (1 - p)) + b)))


def allena(conn=None):
    import numpy as np
    import pandas as pd
    import xgboost as xgb
    from sklearn.metrics import roc_auc_score, brier_score_loss

    conn = conn or sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    print("costruisco le variabili...", flush=True)
    df = costruisci(conn)
    df = df[df["gal"].notna() & (df["data"] >= "2015-01-01")].copy()
    tr = df[df["data"] < "2024-01-01"]
    va = df[(df["data"] >= "2024-01-01") & (df["data"] < "2025-01-01")]
    te = df[df["data"] >= "2025-01-01"].copy()
    X = lambda d: d[VARIABILI].to_numpy(dtype="float32")
    par = {"objective": "binary:logistic", "eval_metric": "logloss", "eta": 0.05, "max_depth": 5,
           "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 20, "seed": 7}
    dtr = xgb.DMatrix(X(tr), label=tr["gal"], feature_names=VARIABILI)
    dva = xgb.DMatrix(X(va), label=va["gal"], feature_names=VARIABILI)
    bst = xgb.train(par, dtr, 2000, evals=[(dva, "va")], early_stopping_rounds=60, verbose_eval=False)
    n_alberi = bst.best_iteration + 1
    bst = xgb.train(par, dtr, n_alberi)
    a, b = _platt(bst.predict(dva), va["gal"].to_numpy())

    p = tara(bst.predict(xgb.DMatrix(X(te), feature_names=VARIABILI)), a, b)
    te["p"] = p
    y = te["gal"].to_numpy()
    semplice = te["h_gal_shr"].to_numpy()
    auc_m, auc_s = roc_auc_score(y, p), roc_auc_score(y, semplice)

    # 1. vantaggio con intervallo: si ricampionano le giornate (data + pista)
    rng = np.random.default_rng(7)
    giorn = (te["data"].dt.strftime("%Y-%m-%d") + "|" + te["pista"].astype(str)).to_numpy()
    uniche, inv = np.unique(giorn, return_inverse=True)
    idx_per = pd.Series(np.arange(len(te))).groupby(inv).apply(lambda s: s.to_numpy()).to_list()
    diffs = []
    for _ in range(2000):
        scelte = rng.integers(0, len(uniche), len(uniche))
        ii = np.concatenate([idx_per[s] for s in scelte])
        diffs.append(roc_auc_score(y[ii], p[ii]) - roc_auc_score(y[ii], semplice[ii]))
    lo, hi = np.percentile(diffs, [2.5, 97.5])

    # 2. fasce vere per decimi
    te["dec"] = pd.qcut(te["p"], 10, labels=False, duplicates="drop")
    dec = te.groupby("dec").agg(prevista=("p", "mean"), vera=("gal", "mean"), n=("gal", "size"))
    scarto = float((dec["prevista"] - dec["vera"]).abs().max())

    # 3. ogni anno da solo
    per_anno = {}
    for anno, d in te.groupby(te["data"].dt.year):
        per_anno[str(anno)] = {"partenze": int(len(d)),
                               "auc_modello": round(float(roc_auc_score(d["gal"], d["p"])), 4),
                               "auc_storia_cavallo": round(float(roc_auc_score(d["gal"], d["h_gal_shr"])), 4)}
    anni_ok = all(v["auc_modello"] > v["auc_storia_cavallo"] for v in per_anno.values())

    regole = {"vantaggio_sicuro": bool(lo > 0), "fasce_vere": bool(scarto <= 0.03), "ogni_anno": bool(anni_ok)}
    fasce_sito = {}
    for nome, sel in (("basso", te["p"] < SOGLIA_BASSO), ("medio", (te["p"] >= SOGLIA_BASSO) & (te["p"] < SOGLIA_ALTO)),
                      ("alto", te["p"] >= SOGLIA_ALTO)):
        fasce_sito[nome] = {"quota_partenze": round(float(sel.mean()), 4),
                            "prevista": round(float(te.loc[sel, "p"].mean()), 4),
                            "vera": round(float(te.loc[sel, "gal"].mean()), 4)}
    debutti = te[te["h_n"] == 0]
    ris = {
        "nome": NOME_MODELLO,
        "calcolato_il": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "esito_contato": "squalifica per galoppo: r.p. (rottura prolungata) o r.a. (galoppo in arrivo)",
        "periodi": {"impara": "2015-2023", "taratura_e_stop": "2024", "prova": "dal 2025"},
        "partenze_prova": int(len(te)),
        "quota_galoppo_prova": round(float(y.mean()), 4),
        "auc_modello": round(float(auc_m), 4),
        "auc_storia_cavallo": round(float(auc_s), 4),
        "vantaggio_intervallo_95": [round(float(lo), 4), round(float(hi), 4)],
        "brier_modello": round(float(brier_score_loss(y, p)), 4),
        "brier_costante": round(float(brier_score_loss(y, np.full(len(y), float(tr["gal"].mean())))), 4),
        "scarto_massimo_decimi": round(scarto, 4),
        "decimi": [{"prevista": round(float(r.prevista), 4), "vera": round(float(r.vera), 4), "n": int(r.n)}
                   for r in dec.itertuples()],
        "per_anno": per_anno,
        "debutti": {"partenze": int(len(debutti)), "quota_galoppo": round(float(debutti["gal"].mean()), 4),
                    "auc": round(float(roc_auc_score(debutti["gal"], debutti["p"])), 4) if debutti["gal"].nunique() > 1 else None},
        "fasce_sito": fasce_sito,
        "soglie_fasce": {"basso_sotto": SOGLIA_BASSO, "alto_da": SOGLIA_ALTO},
        "taratura": {"a": a, "b": b},
        "alberi": n_alberi,
        "regole": regole,
        "supera": all(regole.values()),
    }
    print(json.dumps(ris, indent=2, ensure_ascii=False))
    CARTELLA.mkdir(exist_ok=True)
    FILE_VERIFICA.write_text(json.dumps(ris, indent=2, ensure_ascii=False))
    if ris["supera"]:
        bst.save_model(str(FILE_MODELLO))
        # Il lettore senza XGBoost deve dare gli stessi numeri.
        lettore = pt.Alberi(FILE_MODELLO)
        q = lettore.probabilita(X(te.head(5000)))
        r = bst.predict(xgb.DMatrix(X(te.head(5000)), feature_names=VARIABILI))
        print("differenza massima lettore/XGBoost:", float(np.abs(q - r).max()))
    elif FILE_MODELLO.exists():
        FILE_MODELLO.unlink()
    return ris


# ─────────────────────────────────────────────────────────────────────────────
#  Lavoro notturno
# ─────────────────────────────────────────────────────────────────────────────

def phase_rischio_galoppo(conn: sqlite3.Connection, df=None) -> int:
    """Riscrive `rischio_galoppo` per le gare in calendario. Non fa mai
    fallire la notte: in caso di problemi lascia tutto com'e' e lo dice."""
    if not FILE_MODELLO.exists() or not FILE_VERIFICA.exists():
        print("[GALOPPO] modello non adottato o assente: salto", file=sys.stderr)
        return 0
    try:
        ver = json.loads(FILE_VERIFICA.read_text())
        if not ver.get("supera"):
            print("[GALOPPO] il modello non ha superato la prova: salto", file=sys.stderr)
            return 0
        conn.execute("""CREATE TABLE IF NOT EXISTS rischio_galoppo (
            track TEXT, race_date TEXT, race_time TEXT, horse_name TEXT,
            prob REAL, fascia TEXT, n_corse INTEGER, rotture INTEGER,
            modello TEXT, calcolato_il TEXT,
            PRIMARY KEY (track, race_date, race_time, horse_name))""")
        conn.execute("""CREATE TABLE IF NOT EXISTS rischio_galoppo_storico (
            pista TEXT, race_date TEXT, corsa TEXT, horse_name TEXT,
            prob REAL, modello TEXT, calcolato_il TEXT,
            PRIMARY KEY (pista, race_date, corsa, horse_name))""")
        d = costruisci(conn, con_calendario=True, df=df)
        fut = d[d["futura"].astype(bool)].copy()
        conn.execute("DELETE FROM rischio_galoppo")
        if fut.empty:
            conn.commit()
            return 0
        lettore = pt.Alberi(FILE_MODELLO)
        p = tara(lettore.probabilita(fut[list(lettore.variabili)].to_numpy(dtype="float32")),
                 ver["taratura"]["a"], ver["taratura"]["b"])
        ora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        righe, storico = [], []
        for (_, r), pr in zip(fut.iterrows(), p):
            n = int(r["h_n"]) if r["h_n"] == r["h_n"] else 0
            rott = int(round(r["h_gal"] * n)) if n and r["h_gal"] == r["h_gal"] else 0
            data = r["data"].strftime("%Y-%m-%d")
            righe.append((r["gara"].split("|")[1], data, str(r["numero"]), r["cavallo"],
                          round(float(pr), 4), fascia(float(pr)), n, rott, NOME_MODELLO, ora))
            storico.append((r["pista"], data, str(r["numero"]), r["cavallo"], round(float(pr), 4), NOME_MODELLO, ora))
        conn.executemany("INSERT OR REPLACE INTO rischio_galoppo VALUES (?,?,?,?,?,?,?,?,?,?)", righe)
        conn.executemany("INSERT OR REPLACE INTO rischio_galoppo_storico VALUES (?,?,?,?,?,?,?)", storico)
        conn.commit()
        print(f"[GALOPPO] {len(righe)} stime per {fut['gara'].nunique()} corse", file=sys.stderr)
        return len(righe)
    except Exception as e:
        print(f"[GALOPPO] errore, salto: {e!r}", file=sys.stderr)
        try:
            conn.rollback()
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    c = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    if "--allena" in sys.argv:
        allena(c)
    else:
        print(phase_rischio_galoppo(c))
