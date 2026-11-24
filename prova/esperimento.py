"""Prova della versione 5 del pronostico: varianti di variabili e modello per la vittoria."""
import json, sqlite3, sys, time
import numpy as np, pandas as pd
sys.path.insert(0, ".")
import pronostico_top3 as p

variante = sys.argv[1]
conn = sqlite3.connect("data.db")
t = time.time()
df = p.prepara_allenamento(conn)
print("variabili pronte in", round(time.time() - t), "s, partenze", len(df), flush=True)
V4 = list(p.VARIABILI)
IND = ["h_ind_migl", "h_ind_med5", "r_ind_migl", "s_ind_med5"]
H2H = ["h2h", "h2h_n", "campo_premi", "campo_vs_solito"]
F30 = ["d_top3_30", "d_n_30", "r_d_top3_30", "a_top3_30", "a_n_30"]
VAR = {"v4": V4, "ind": V4 + IND, "h2h": V4 + H2H, "f30": V4 + F30, "tutte": V4 + IND + H2H + F30,
       "tutte_ferri": V4 + IND + H2H + F30 + p.VARIABILI_FERRI}

if variante != "vince":
    ris = p.allena(conn, df, VAR[variante], salva=False)
    cc = ris["campo_completo"]
    print("ESITO", json.dumps({"variante": variante, "modello": ris["modello"], "normalizzato": cc["modello_normalizzato"],
                               "corse": cc["corse"], "fasce": ris["fasce"][-3:], "alberi": ris["alberi"],
                               "peso_top": ris["peso_variabili"][:12]}, ensure_ascii=False))
    sys.exit(0)

# Modello per la vittoria, con le stesse variabili della versione 5, contro la
# vittoria ricavata dal pronostico dei primi tre.
import xgboost as xgb
from sklearn.metrics import log_loss, brier_score_loss, roc_auc_score
V = VAR["tutte"]
tr = df[df["data"] < "2024-01-01"]; va = df[(df["data"] >= "2024-01-01") & (df["data"] < "2025-01-01")]; te = df[df["data"] >= "2025-01-01"]
X = lambda d: d[V].to_numpy(dtype="float32")
par = dict(objective="binary:logistic", eval_metric="logloss", eta=0.05, max_depth=6, min_child_weight=50, subsample=0.8,
           colsample_bytree=0.8, reg_lambda=2.0, tree_method="hist", nthread=4, seed=7)
def allena_su(col):
    b = xgb.train(par, xgb.DMatrix(X(tr), label=tr[col]), 2000, evals=[(xgb.DMatrix(X(va), label=va[col]), "v")], early_stopping_rounds=60, verbose_eval=200)
    n = b.best_iteration + 1
    trva = pd.concat([tr, va])
    return xgb.train(par, xgb.DMatrix(X(trva), label=trva[col]), n), n
bv, nv = allena_su("vitt")
b3, n3 = allena_su("top3")
pieno = p.campo_pieno(te)
t2 = te[pieno].copy()
t2["pv"] = bv.predict(xgb.DMatrix(X(t2)))
t2["p3"] = b3.predict(xgb.DMatrix(X(t2)))
def norm1(s, g):  # somma 1 per corsa
    return s / s.groupby(g).transform("sum")
t2["pv_n"] = norm1(t2["pv"], t2["gara"])
# dalla stima dei primi tre: quota^a normalizzata, con a scelto sul 2024
v2 = va[p.campo_pieno(va)].copy(); v2["p3"] = b3.predict(xgb.DMatrix(X(v2)))
best = None
for a in np.arange(1.0, 3.01, 0.1):
    q = norm1((v2["p3"] / (1 - v2["p3"])) ** a, v2["gara"])
    ll = log_loss(v2["vitt"], np.clip(q, 1e-4, 1 - 1e-4))
    if best is None or ll < best[0]: best = (ll, a)
a = best[1]
t2["p3v_n"] = norm1((t2["p3"] / (1 - t2["p3"])) ** a, t2["gara"])
def misure(col):
    y = t2["vitt"].to_numpy(); pp = np.clip(t2[col].to_numpy(), 1e-4, 1 - 1e-4)
    rk = t2.groupby("gara")[col].rank(ascending=False, method="first")
    return {"log_loss": round(float(log_loss(y, pp)), 4), "brier": round(float(brier_score_loss(y, pp)), 4),
            "auc": round(float(roc_auc_score(y, pp)), 4), "primo_scelto_vince": round(float(t2.loc[rk == 1, "vitt"].mean()), 4),
            "p_al_vincitore": round(float(t2.loc[t2["vitt"] == 1, col].mean()), 4)}
print("ESITO", json.dumps({"variante": "vince", "corse": int(t2["gara"].nunique()), "alberi": nv, "esponente_da_top3": round(float(a), 2),
                           "modello_vince": misure("pv_n"), "dai_primi_tre": misure("p3v_n")}, ensure_ascii=False))
bv.save_model("vince_prova.json")
