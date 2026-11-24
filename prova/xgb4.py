"""Quattro prove XGBoost (24/11/2026): rank, km, residui. La carriera e' in carriera_futura.py."""
import json, os, sqlite3, sys, time
from pathlib import Path
import numpy as np, pandas as pd
import xgboost as xgb
sys.path.insert(0, ".")
import pronostico_top3 as p
from sklearn.metrics import log_loss

modo = sys.argv[1]
OUT = Path("out"); OUT.mkdir(exist_ok=True)
conn = sqlite3.connect("data.db")
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


if modo == "rank":
    pb_va, pb_te, _, nb = binario(V)
    # rilevanza: 3 al primo, 2 al secondo, 1 al terzo
    def rel(d):
        a = d["arrivo"].to_numpy()
        return np.where(a == 1, 3, np.where(a == 2, 2, np.where(a == 3, 1, 0))).astype(float)
    def gruppi(d):
        return d.groupby("gara", sort=False).size().to_numpy()
    # le righe della stessa corsa devono essere vicine: ordinate per data e gara
    esiti = {"binario": {"alberi": nb}}
    pieno_te = p.campo_pieno(te)
    y_te = te["top3"].to_numpy()[pieno_te]; g_te = te["gara"].to_numpy()[pieno_te]; k_te = te["partenti"].to_numpy()[pieno_te]
    v_te = te["vitt"].to_numpy()[pieno_te]
    tb = temperatura(pb_va, va, np.arange(0.7, 1.31, 0.05))
    q_b = p.normalizza_per_gara(pb_te[pieno_te], g_te, k_te, tb)
    esiti["binario"].update(p._misure(y_te, q_b, g_te)); esiti["binario"]["temperatura"] = tb
    def vince_mis(q):
        rk = pd.Series(q).groupby(pd.Series(g_te)).rank(ascending=False, method="first").to_numpy()
        return {"log_loss_vince": round(float(log_loss(v_te, np.clip(q, 1e-5, 1 - 1e-5))), 4),
                "primo_scelto_vince": round(float(v_te[rk == 1].mean()), 4)}
    modelli = {}
    for nome, obiettivo in (("pairwise", "rank:pairwise"), ("ndcg", "rank:ndcg")):
        par = dict(PAR, objective=obiettivo, eval_metric="ndcg@3")
        par.pop("eval_metric")
        par["eval_metric"] = "ndcg@3"
        dtr = xgb.DMatrix(X(tr), label=rel(tr)); dtr.set_group(gruppi(tr))
        dva = xgb.DMatrix(X(va), label=rel(va)); dva.set_group(gruppi(va))
        b = xgb.train(par, dtr, 2000, evals=[(dva, "v")], early_stopping_rounds=60, verbose_eval=200)
        n = b.best_iteration + 1
        s_va = b.predict(dva, iteration_range=(0, n))
        trva = pd.concat([tr, va])
        dtv = xgb.DMatrix(X(trva), label=rel(trva)); dtv.set_group(gruppi(trva))
        b2 = xgb.train(par, dtv, n)
        s_te = b2.predict(xgb.DMatrix(X(te)))
        modelli[nome] = b2
        # da solo: il punteggio come logit, temperatura sul 2024
        t1 = temperatura(sig(s_va), va, np.arange(0.2, 3.01, 0.1))
        q1 = p.normalizza_per_gara(sig(s_te[pieno_te]), g_te, k_te, t1)
        e = {"alberi": n, "da_solo": {**p._misure(y_te, q1, g_te), "temperatura": t1}}
        # insieme al binario: logit(binario) + w * (punteggio - media della corsa)
        def centra(s, d):
            return s - pd.Series(s).groupby(d["gara"].to_numpy()).transform("mean").to_numpy()
        c_va, c_te = centra(s_va, va), centra(s_te, te)
        lb_va = np.log(np.clip(pb_va, 1e-4, 1 - 1e-4) / (1 - np.clip(pb_va, 1e-4, 1 - 1e-4)))
        lb_te = np.log(np.clip(pb_te, 1e-4, 1 - 1e-4) / (1 - np.clip(pb_te, 1e-4, 1 - 1e-4)))
        migl = None
        for w in (0.0, 0.25, 0.5, 0.75, 1.0, 1.5):
            pv = sig(lb_va + w * c_va)
            t = temperatura(pv, va, np.arange(0.6, 1.41, 0.1))
            pieno_va = p.campo_pieno(va)
            q = p.normalizza_per_gara(pv[pieno_va], va["gara"].to_numpy()[pieno_va], va["partenti"].to_numpy()[pieno_va], t)
            ll = log_loss(va["top3"].to_numpy()[pieno_va], np.clip(q, 1e-4, 1 - 1e-4))
            print(nome, "w", w, "t", t, "ll 2024", round(ll, 5), flush=True)
            if migl is None or ll < migl[0]:
                migl = (ll, w, t)
        _, w, t = migl
        q2 = p.normalizza_per_gara(sig(lb_te + w * c_te)[pieno_te], g_te, k_te, t)
        e["insieme"] = {**p._misure(y_te, q2, g_te), "peso": w, "temperatura": t}
        # vittoria: dal punteggio, somma 1
        tv = temperatura(sig(s_va), va, np.arange(0.3, 3.01, 0.1), col="vitt", k=1)
        e["vince_da_punteggio"] = {**vince_mis(norm1(sig(s_te[pieno_te]), g_te, tv)), "temperatura": tv}
        esiti[nome] = e
        print("ESITO", nome, json.dumps(e), flush=True)
    # vittoria del modello in uso (vince_xgb), per confronto
    try:
        lv = p.Alberi(p.FILE_VINCE)
        pv = lv.probabilita(X(te[pieno_te], list(lv.variabili)))
        qv = pv / pd.Series(pv).groupby(pd.Series(g_te)).transform("sum").to_numpy()
        esiti["vince_in_uso"] = vince_mis(qv)
    except Exception as ex:
        esiti["vince_in_uso"] = str(ex)
    esiti["corse_prova"] = int(pd.Series(g_te).nunique())
    (OUT / "esito_rank.json").write_text(json.dumps(esiti, indent=1))
    for k, b in modelli.items():
        b.save_model(str(OUT / f"top3_rank_{k}.json"))
    print("ESITO_FINALE", json.dumps(esiti))

elif modo == "km":
    # tempo tipico di pista e distanza nell'anno prima (come l'indice di velocita')
    anno = df["data"].dt.year
    fascia = pd.cut(df["distanza"], [0, 1799, 2199, 9999], labels=False)
    base = pd.DataFrame({"pista": df["pista"], "f": fascia, "anno": anno, "t": df["tempo"]})[df["tempo"].notna() & fascia.notna()]
    tab = base.groupby(["pista", "f", "anno"])["t"].agg(["median", "count"]).reset_index()
    tab = tab[tab["count"] >= 30]
    tab_g = base.groupby(["f", "anno"])["t"].median().reset_index().rename(columns={"t": "mg"})
    q1 = pd.DataFrame({"pista": df["pista"], "f": fascia, "anno": anno - 1}).merge(tab[["pista", "f", "anno", "median"]], on=["pista", "f", "anno"], how="left")
    q2 = pd.DataFrame({"pista": df["pista"], "f": fascia, "anno": anno - 2}).merge(tab[["pista", "f", "anno", "median"]], on=["pista", "f", "anno"], how="left")
    q3 = pd.DataFrame({"f": fascia, "anno": anno - 1}).merge(tab_g, on=["f", "anno"], how="left")
    df["rif_km"] = q1["median"].fillna(q2["median"]).fillna(q3["mg"]).to_numpy()
    df["y_ind"] = df["tempo"] - df["rif_km"]
    VK = V + ["rif_km"]
    tr = df[df["data"] < t_va]; va = df[(df["data"] >= t_va) & (df["data"] < t_te)]; te = df[df["data"] >= t_te]
    ok = lambda d: d[d["y_ind"].notna() & d["rif_km"].notna()]
    trk, vak, tek = ok(tr), ok(va), ok(te)
    par = dict(PAR, objective="reg:squarederror", eval_metric="mae")
    esiti = {}
    for nome, obi in (("quadrato", "reg:squarederror"), ("assoluto", "reg:absoluteerror")):
        par = dict(PAR, objective=obi, eval_metric="mae")
        b = xgb.train(par, xgb.DMatrix(X(trk, VK), label=trk["y_ind"]), 3000, evals=[(xgb.DMatrix(X(vak, VK), label=vak["y_ind"]), "v")],
                      early_stopping_rounds=60, verbose_eval=300)
        n = b.best_iteration + 1
        trva = pd.concat([trk, vak])
        b2 = xgb.train(par, xgb.DMatrix(X(trva, VK), label=trva["y_ind"]), n)
        pred = b2.predict(xgb.DMatrix(X(tek, VK))) + tek["rif_km"].to_numpy()
        vero = tek["tempo"].to_numpy()
        e = {"alberi": n, "errore_medio": round(float(np.mean(np.abs(pred - vero))), 3),
             "errore_quadratico": round(float(np.sqrt(np.mean((pred - vero) ** 2))), 3)}
        # ordine dentro la corsa e il piu' veloce previsto: su tutte le partenze di prova
        tutti = te[te["rif_km"].notna()].copy()
        tutti["pred"] = b2.predict(xgb.DMatrix(X(tutti, VK))) + tutti["rif_km"].to_numpy()
        rk = tutti.groupby("gara")["pred"].rank(method="first")
        e["piu_veloce_vince"] = round(float(tutti.loc[rk == 1, "vitt"].mean()), 4)
        e["tre_piu_veloci_nei_tre"] = round(float(tutti.loc[rk <= 3, "top3"].mean()), 4)
        sp = tek.assign(pred=pred).groupby("gara").apply(lambda g: g["pred"].corr(g["tempo"], method="spearman") if len(g) >= 4 else np.nan)
        e["ordine_tempi_spearman"] = round(float(sp.mean()), 4)
        # il vincitore: tempo previsto contro tempo vero
        vin = tek.assign(pred=pred)[tek["arrivo"] == 1]
        e["errore_tempo_vincitore"] = round(float(np.mean(np.abs(vin["pred"] - vin["tempo"]))), 3)
        imp = b2.get_score(importance_type="gain"); tot = sum(imp.values()) or 1
        e["peso_variabili"] = sorted(({"variabile": VK[int(k[1:])] if k.startswith("f") and k[1:].isdigit() else k, "peso": round(v / tot, 4)} for k, v in imp.items()), key=lambda r: -r["peso"])[:20]
        esiti[nome] = e
        b2.save_model(str(OUT / f"km_{nome}.json"))
        print("ESITO", nome, json.dumps({k: v for k, v in e.items() if k != "peso_variabili"}), flush=True)
    # metodi semplici
    vero = tek["tempo"].to_numpy()
    def semplice(pred, nome):
        m = np.isfinite(pred)
        tutti = te[te["rif_km"].notna()].copy()
        return {"errore_medio": round(float(np.mean(np.abs(pred[m] - vero[m]))), 3), "coperti": round(float(m.mean()), 3)}
    esiti["ultimo_tempo"] = semplice(tek["h_tempo_ult"].to_numpy(), "ultimo")
    esiti["pista_piu_indice_medio"] = semplice((tek["rif_km"] + tek["h_ind_med5"]).to_numpy(), "ind")
    esiti["pista_piu_indice_migliore"] = semplice((tek["rif_km"] + tek["h_ind_migl"]).to_numpy(), "migl")
    esiti["solo_pista"] = semplice(tek["rif_km"].to_numpy(), "pista")
    tutti = te[te["rif_km"].notna()].copy()
    tutti["s"] = (tutti["rif_km"] + tutti["h_ind_med5"]).fillna(99)
    rk = tutti.groupby("gara")["s"].rank(method="first")
    esiti["pista_piu_indice_medio"]["piu_veloce_vince"] = round(float(tutti.loc[rk == 1, "vitt"].mean()), 4)
    esiti["partenze_prova"] = int(len(tek))
    (OUT / "esito_km.json").write_text(json.dumps(esiti, indent=1))
    print("ESITO_FINALE", json.dumps({k: ({kk: vv for kk, vv in v.items() if kk != "peso_variabili"} if isinstance(v, dict) else v) for k, v in esiti.items()}))

elif modo == "residui":
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
