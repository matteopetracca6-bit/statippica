"""
sopra_previsto.py — Chi fa meglio (o peggio) del previsto: allenatori,
guidatori e stalloni.

Per ogni partenza delle corse di prova (dal 2025, mai viste dai modelli) si
confronta l'arrivo vero con quello che un modello XGBoost si aspettava dal
cavallo. Per gli allenatori il modello NON conosce l'allenatore, per i
guidatori NON conosce il guidatore: cosi' lo scarto e' quello che il cavallo
ha reso in piu' (o in meno) con loro, a parita' di tutto il resto. Per gli
stalloni si usa il modello completo (non sa chi e' il padre).

Scrive modelli/sopra_previsto.json. Lo rifa' il riallenamento mensile.
  python3 scripts/sopra_previsto.py
"""
import json, os, sqlite3, sys, time
from pathlib import Path
import numpy as np, pandas as pd
import xgboost as xgb
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pronostico_top3 as p
from sklearn.metrics import log_loss

OUT = Path(__file__).resolve().parent.parent / "modelli"
conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
t0 = time.time()
df = p.prepara_allenamento(conn)
print("variabili pronte in", round(time.time() - t0), "s, partenze", len(df), flush=True)
V = list(p.VARIABILI + p.VARIABILI_V5)
t_va, t_te = p._tagli()
df = df.sort_values(["data", "gara"], kind="stable").reset_index(drop=True)
tr = df[df["data"] < t_va]; va = df[(df["data"] >= t_va) & (df["data"] < t_te)]; te = df[df["data"] >= t_te]
NT = int(os.environ.get("NTHREAD", "4"))
PAR = dict(objective="binary:logistic", eval_metric="logloss", eta=0.05, max_depth=6, min_child_weight=50, subsample=0.8,
           colsample_bytree=0.8, reg_lambda=2.0, tree_method="hist", nthread=NT, seed=7)


def X(d, vv=None):
    return d[vv or V].to_numpy(dtype="float32")


def binario(vv, col="top3"):
    """Come allena(): impara fino al 2023 con stop sul 2024, poi rifatto su tutto fino al 2024.
    Restituisce stime sul 2024 (dal modello che non l'ha visto) e sulla prova."""
    b = xgb.train(PAR, xgb.DMatrix(X(tr, vv), label=tr[col]), 2000, evals=[(xgb.DMatrix(X(va, vv), label=va[col]), "v")],
                  early_stopping_rounds=60, verbose_eval=200)
    n = b.best_iteration + 1
    p_va = b.predict(xgb.DMatrix(X(va, vv)), iteration_range=(0, n))
    trva = pd.concat([tr, va])
    b2 = xgb.train(PAR, xgb.DMatrix(X(trva, vv), label=trva[col]), n)
    return p_va, b2.predict(xgb.DMatrix(X(te, vv))), b2, n


def temperatura(pp, d, griglia, col="top3", k=None):
    pieno = p.campo_pieno(d)
    y = d[col].to_numpy()[pieno]
    best = None
    for t in griglia:
        if k is None:
            q = p.normalizza_per_gara(pp[pieno], d["gara"].to_numpy()[pieno], d["partenti"].to_numpy()[pieno], float(t))
        else:
            q = norm1(pp[pieno], d["gara"].to_numpy()[pieno], float(t))
        ll = log_loss(y, np.clip(q, 1e-4, 1 - 1e-4))
        if best is None or ll < best[0]:
            best = (ll, float(round(t, 3)))
    return best[1]


def norm1(pp, gare, t):
    """Somma 1 per corsa (vittoria), con temperatura sui logit."""
    lg = t * np.log(np.clip(pp, 1e-6, 1 - 1e-6) / (1 - np.clip(pp, 1e-6, 1 - 1e-6)))
    s = pd.Series(lg).groupby(pd.Series(gare)).transform("max").to_numpy()
    e = np.exp(lg - s)
    return e / pd.Series(e).groupby(pd.Series(gare)).transform("sum").to_numpy()


def sig(x):
    return 1 / (1 + np.exp(-x))


GA = set(p.GRUPPI["allenatore"][0]); GD = set(p.GRUPPI["guidatore"][0])
sire = dict(conn.execute("SELECT name, sire FROM horses WHERE sire IS NOT NULL AND sire != ''").fetchall())
pieno = p.campo_pieno(te)
t2 = te[pieno].copy()
risultato = {"periodo": {"da": str(te["data"].min().date()), "a": str(te["data"].max().date()),
                         "corse": int(t2["gara"].nunique()), "partenze": int(len(t2))}}
for chi, vv, col in (("allenatori", [v for v in V if v not in GA], "allenatore_corsa"),
                     ("guidatori", [v for v in V if v not in GD], "guidatore"),
                     ("stalloni", V, "_padre")):
    pva, pte, _, n = binario(vv)
    t = temperatura(pva, va, np.arange(0.7, 1.31, 0.1))
    q = p.normalizza_per_gara(pte[pieno], t2["gara"].to_numpy(), t2["partenti"].to_numpy(), t)
    d = t2.assign(att=q)
    d["_padre"] = d["cavallo"].map(sire)
    d = d[d[col].notna() & (d[col].astype(str).str.strip() != "")]
    d["anno"] = d["data"].dt.year
    g = d.groupby(col)
    tab = pd.DataFrame({"partenze": g.size(), "cavalli": g["cavallo"].nunique(), "veri": g["top3"].sum(),
                        "attesi": g["att"].sum(), "var": g["att"].apply(lambda s: float((s * (1 - s)).sum())),
                        "vittorie": g["vitt"].sum()})
    tab["scarto_100"] = (tab["veri"] - tab["attesi"]) / tab["partenze"] * 100
    tab["z"] = (tab["veri"] - tab["attesi"]) / np.sqrt(tab["var"].clip(lower=1e-6))
    # stabilita': lo scarto del 2025 dice qualcosa su quello del 2026?
    h = d.groupby([col, "anno"]).agg(n=("top3", "size"), v=("top3", "sum"), a=("att", "sum")).reset_index()
    h["s"] = (h["v"] - h["a"]) / h["n"]
    pv = h[h["n"] >= 60].pivot(index=col, columns="anno", values="s").dropna()
    stab = float(pv.iloc[:, 0].corr(pv.iloc[:, 1])) if pv.shape[1] >= 2 and len(pv) >= 20 else None
    minimo = 150
    el = tab[tab["partenze"] >= minimo].sort_values("z", ascending=False)
    righe = [{"nome": str(k), "partenze": int(r.partenze), "cavalli": int(r.cavalli), "veri": int(r.veri),
              "attesi": round(float(r.attesi), 1), "scarto_100": round(float(r.scarto_100), 2), "z": round(float(r.z), 2),
              "vittorie": int(r.vittorie)} for k, r in el.iterrows()]
    risultato[chi] = {"minimo_partenze": minimo, "alberi": n, "temperatura": t, "variabili": len(vv),
                      "stabilita_2025_2026": None if stab is None else round(stab, 3),
                      "entita_per_stabilita": int(len(pv)), "elenco": righe}
    print("ESITO", chi, len(righe), "stab", stab, json.dumps(righe[:5]), flush=True)
risultato["calcolato_il"] = time.strftime("%Y-%m-%d")
(OUT / "sopra_previsto.json").write_text(json.dumps(risultato, ensure_ascii=False, indent=0))
print("ESITO_FINALE ok")
