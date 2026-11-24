"""
carriera_futura.py — Quanto gli resta in carriera (XGBoost).

Per ogni cavallo che ha corso nell'ultimo anno si stimano tre cose, con i
soli dati di oggi:
  - p_6:   la probabilita' che corra almeno una volta nei prossimi 6 mesi;
  - p_12:  la probabilita' che corra ancora fra 6 e 12 mesi (cioe' che fra un
           anno sia ancora in attivita');
  - corse: quante corse fara' nei prossimi 12 mesi.

Si impara da "fotografie" del passato: il primo giorno di ogni trimestre, per
ogni cavallo che aveva corso nei 12 mesi prima, cosa si sapeva quel giorno e
cosa e' successo dopo. Il confronto e' con il metodo dei cavalli simili
(stessa eta', stesso numero di corse e stesso gradino di premi nell'ultimo
anno), che e' quello usato finora dal valore di carriera.

  python3 carriera_futura.py --allena    allena, prova e salva i modelli
  (di notte) phase_carriera_futura(conn)  scrive la tabella carriera_futura
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_6 = CARTELLA / "carriera_6_xgb.json"
FILE_12 = CARTELLA / "carriera_12_xgb.json"
FILE_CORSE = CARTELLA / "carriera_corse_xgb.json"
FILE_VERIFICA = CARTELLA / "carriera_verifica.json"

VARIABILI = [
    "eta", "maschio", "mese", "n_carriera", "n_365", "n_182", "n_91", "premi_365", "premi_182", "premi_prima_182",
    "premi_carriera", "top3_365", "vitt_365", "non_class_365", "giorni_ultima", "km_ult", "km_med_365",
    "km_ult_vs_med", "anni_attivo", "n_365_anno_prima", "premi_365_anno_prima", "cambi_allenatore_365",
]
NOMI = {
    "eta": "età", "maschio": "maschio o femmina", "mese": "periodo dell'anno", "n_carriera": "corse in carriera",
    "n_365": "corse nell'ultimo anno", "n_182": "corse negli ultimi 6 mesi", "n_91": "corse negli ultimi 3 mesi",
    "premi_365": "premi nell'ultimo anno", "premi_182": "premi negli ultimi 6 mesi",
    "premi_prima_182": "premi nei 6 mesi prima", "premi_carriera": "premi in carriera",
    "top3_365": "primi tre nell'ultimo anno", "vitt_365": "vittorie nell'ultimo anno",
    "non_class_365": "corse senza piazzamento (galoppi, ritiri)", "giorni_ultima": "giorni dall'ultima corsa",
    "km_ult": "tempo al km dell'ultima corsa", "km_med_365": "tempo al km medio dell'anno",
    "km_ult_vs_med": "ultima corsa rispetto alla media", "anni_attivo": "anni di attività",
    "n_365_anno_prima": "corse nell'anno precedente", "premi_365_anno_prima": "premi nell'anno precedente",
    "cambi_allenatore_365": "cambi di allenatore nell'ultimo anno",
}
OBIETTIVI = {"p_6": FILE_6, "p_12": FILE_12, "corse": FILE_CORSE}


def _corse(conn) -> tuple[pd.DataFrame, dict]:
    r = pd.read_sql_query(
        """SELECT horse_name AS cavallo, race_date AS data, placement AS arrivo, time_km AS km,
                  prize_net AS premio, NULLIF(trainer, '') AS allenatore
             FROM races WHERE race_date IS NOT NULL
              AND COALESCE(LOWER(placement_raw), '') NOT IN ('nr', 'n.p.')""", conn)
    r["data"] = pd.to_datetime(r["data"], errors="coerce")
    r = r[r["data"].notna()].copy()
    r["premio"] = pd.to_numeric(r["premio"], errors="coerce").fillna(0.0)
    r["arrivo"] = pd.to_numeric(r["arrivo"], errors="coerce")
    r["km"] = pd.to_numeric(r["km"], errors="coerce")
    r.loc[(r["km"] < 9) | (r["km"] > 40), "km"] = np.nan
    h = pd.read_sql_query("SELECT name, birth_year, sex FROM horses", conn)
    anag = {n: (b, s) for n, b, s in h.itertuples(index=False)}
    return r, anag


def fotografie(conn, giorni: list, con_esito: bool = True) -> pd.DataFrame:
    """Una riga per (cavallo, giorno) per i cavalli che hanno corso nei 365
    giorni prima del giorno. Tutto calcolato con numpy su somme cumulate."""
    r, anag = _corse(conn)
    r = r.sort_values(["cavallo", "data"]).reset_index(drop=True)
    cav = pd.Categorical(r["cavallo"])
    hid = cav.codes.astype(np.int64)
    nomi = np.asarray(cav.categories)
    giorno0 = np.datetime64("2000-01-01")
    dn = ((r["data"].to_numpy().astype("datetime64[D]") - giorno0).astype(np.int64))
    chiave = hid * 100_000 + dn
    n = len(r)
    uno = np.ones(n)
    top3 = ((r["arrivo"] >= 1) & (r["arrivo"] <= 3)).to_numpy(float)
    vitt = (r["arrivo"] == 1).to_numpy(float)
    noncl = (r["arrivo"].isna() | (r["arrivo"] <= 0)).to_numpy(float)
    km = r["km"].to_numpy(float)
    haskm = np.isfinite(km).astype(float)
    km0 = np.where(np.isfinite(km), km, 0.0)
    premio = r["premio"].to_numpy(float)
    # cambio di allenatore rispetto alla corsa prima dello stesso cavallo
    al = r["allenatore"].fillna("").to_numpy()
    stesso = np.r_[False, hid[1:] == hid[:-1]]
    cambio = (stesso & np.r_[False, al[1:] != al[:-1]] & (al != "") & np.r_[False, al[:-1] != ""]).astype(float)

    def cum(x):
        return np.r_[0.0, np.cumsum(x)]
    C = {k: cum(v) for k, v in dict(uno=uno, top3=top3, vitt=vitt, noncl=noncl, km=km0, haskm=haskm,
                                     premio=premio, cambio=cambio).items()}
    inizio = np.searchsorted(hid, np.arange(len(nomi)), side="left")
    # primo giorno di corsa di ogni cavallo (per gli anni di attivita')
    primo_dn = dn[inizio.clip(max=n - 1)]

    righe = []
    for g in giorni:
        g = np.datetime64(pd.Timestamp(g).date())
        gd = int((g - giorno0).astype(np.int64))
        # cavalli con almeno una corsa in [g-365, g)
        a = np.searchsorted(chiave, np.arange(len(nomi)) * 100_000 + gd - 365)
        b = np.searchsorted(chiave, np.arange(len(nomi)) * 100_000 + gd)
        att = np.nonzero(b > a)[0]
        if len(att) == 0:
            continue
        a, b = a[att], b[att]
        def idx(off):
            return np.searchsorted(chiave, att * 100_000 + gd + off)
        i182, i91, i730 = idx(-182), idx(-91), idx(-730)
        s0 = inizio[att]
        f = pd.DataFrame({"cavallo": nomi[att], "giorno": pd.Timestamp(g)})
        f["n_carriera"] = b - s0
        f["n_365"] = b - a
        f["n_182"] = b - i182
        f["n_91"] = b - i91
        f["premi_365"] = C["premio"][b] - C["premio"][a]
        f["premi_182"] = C["premio"][b] - C["premio"][i182]
        f["premi_prima_182"] = C["premio"][i182] - C["premio"][a]
        f["premi_carriera"] = C["premio"][b] - C["premio"][s0]
        f["top3_365"] = (C["top3"][b] - C["top3"][a]) / f["n_365"]
        f["vitt_365"] = (C["vitt"][b] - C["vitt"][a]) / f["n_365"]
        f["non_class_365"] = (C["noncl"][b] - C["noncl"][a]) / f["n_365"]
        f["giorni_ultima"] = gd - dn[b - 1]
        nk = C["haskm"][b] - C["haskm"][a]
        f["km_med_365"] = np.where(nk > 0, (C["km"][b] - C["km"][a]) / np.maximum(nk, 1), np.nan)
        f["km_ult"] = km[b - 1]
        f["km_ult_vs_med"] = f["km_ult"] - f["km_med_365"]
        f["anni_attivo"] = (gd - primo_dn[att]) / 365.25
        f["n_365_anno_prima"] = a - i730
        f["premi_365_anno_prima"] = C["premio"][a] - C["premio"][i730]
        f["cambi_allenatore_365"] = C["cambio"][b] - C["cambio"][a]
        f["mese"] = pd.Timestamp(g).month
        if con_esito:
            j182, j365 = idx(182), idx(365)
            f["e_6"] = ((j182 - b) > 0).astype(float)
            f["e_12"] = ((j365 - j182) > 0).astype(float)
            f["e_corse"] = (j365 - b).astype(float)
            f["e_premi"] = C["premio"][j365] - C["premio"][b]
        righe.append(f)
    df = pd.concat(righe, ignore_index=True)
    anno = df["giorno"].dt.year
    by = df["cavallo"].map(lambda x: anag.get(x, (None, None))[0])
    sx = df["cavallo"].map(lambda x: anag.get(x, (None, None))[1])
    df["eta"] = anno - pd.to_numeric(by, errors="coerce")
    df["maschio"] = np.where(sx.isin(["M", "C"]), 1.0, np.where(sx == "F", 0.0, np.nan))
    df = df[(df["eta"] >= 2) & (df["eta"] <= 16)].copy()
    return df


def _gradino(p):
    return np.digitize(p, [1, 1_000, 3_000, 7_000, 15_000, 30_000, 60_000])


def _simili(tr: pd.DataFrame, te: pd.DataFrame, col: str) -> np.ndarray:
    """Il metodo dei simili: media dell'esito fra i cavalli di allenamento con
    la stessa eta', lo stesso numero di corse (a fasce) e lo stesso gradino di
    premi nell'ultimo anno; se il gruppo e' piccolo, solo eta' e gradino."""
    def k(d):
        return pd.DataFrame({"e": d["eta"].clip(upper=13).fillna(6), "g": _gradino(d["premi_365"]),
                             "n": np.digitize(d["n_365"], [3, 6, 10, 15])})
    kt, ke = k(tr), k(te)
    kt["y"] = tr[col].to_numpy()
    t1 = kt.groupby(["e", "g", "n"])["y"].agg(["mean", "count"])
    t2 = kt.groupby(["e", "g"])["y"].mean()
    m1 = ke.merge(t1.reset_index(), on=["e", "g", "n"], how="left")
    m2 = ke.merge(t2.rename("m2").reset_index(), on=["e", "g"], how="left")
    out = np.where(m1["count"].fillna(0).to_numpy() >= 50, m1["mean"].to_numpy(), m2["m2"].to_numpy())
    return np.where(np.isfinite(out), out, kt["y"].mean())


def _trimestri(da: str, a: str) -> list:
    return list(pd.date_range(da, a, freq="QS"))


def allena(conn, salva=True) -> dict:
    import xgboost as xgb
    from sklearn.metrics import log_loss, roc_auc_score, brier_score_loss, mean_absolute_error
    ultimo = pd.read_sql_query("SELECT MAX(race_date) AS d FROM races", conn)["d"].iloc[0]
    fine = pd.Timestamp(ultimo) - pd.Timedelta(days=366)
    df = fotografie(conn, _trimestri("2015-01-01", str(fine.date())))
    print("fotografie:", len(df), flush=True)
    # Allenamento fino al 2021 (esito entro il 2022), taratura 2022, prova dal 2023.
    tr = df[df["giorno"] < "2022-01-01"]
    va = df[(df["giorno"] >= "2022-01-01") & (df["giorno"] < "2023-01-01")]
    te = df[df["giorno"] >= "2023-01-01"]
    X = lambda d: d[VARIABILI].to_numpy(dtype="float32")
    ris = {"nome": "carriera-xgb-v1", "allenato_il": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "fotografie": {"allenamento": int(len(tr) + len(va)), "prova": int(len(te)),
                          "prova_da": str(te["giorno"].min().date()), "prova_a": str(te["giorno"].max().date()),
                          "cavalli_prova": int(te["cavallo"].nunique())},
           "variabili": VARIABILI, "modelli": {}}
    for nome, col, obiettivo in (("p_6", "e_6", "binary:logistic"), ("p_12", "e_12", "binary:logistic"),
                                 ("corse", "e_corse", "count:poisson")):
        par = dict(objective=obiettivo, eta=0.05, max_depth=6, min_child_weight=50, subsample=0.8,
                   colsample_bytree=0.8, reg_lambda=2.0, tree_method="hist",
                   nthread=int(os.environ.get("NTHREAD", "4")), seed=7,
                   eval_metric="logloss" if obiettivo.startswith("binary") else "poisson-nloglik")
        b = xgb.train(par, xgb.DMatrix(X(tr), label=tr[col], feature_names=VARIABILI), 2000,
                      evals=[(xgb.DMatrix(X(va), label=va[col], feature_names=VARIABILI), "v")],
                      early_stopping_rounds=50, verbose_eval=200)
        nalb = b.best_iteration + 1
        trva = pd.concat([tr, va])
        b = xgb.train(par, xgb.DMatrix(X(trva), label=trva[col], feature_names=VARIABILI), nalb)
        p = b.predict(xgb.DMatrix(X(te), feature_names=VARIABILI))
        s = _simili(trva, te, col)
        y = te[col].to_numpy()
        if obiettivo.startswith("binary"):
            def mis(q):
                q = np.clip(q, 1e-4, 1 - 1e-4)
                return {"log_loss": round(float(log_loss(y, q)), 4), "auc": round(float(roc_auc_score(y, q)), 4),
                        "brier": round(float(brier_score_loss(y, q)), 4)}
            m = {"modello": mis(p), "simili": mis(s), "quota_vera": round(float(y.mean()), 4)}
            fasce = []
            for a_, b_ in zip([0, .2, .4, .6, .8, .9], [.2, .4, .6, .8, .9, 1.01]):
                sel = (p >= a_) & (p < b_)
                if sel.sum() >= 100:
                    fasce.append({"da": a_, "a": min(b_, 1), "n": int(sel.sum()), "stimato": round(float(p[sel].mean()), 3),
                                  "reale": round(float(y[sel].mean()), 3)})
            m["fasce"] = fasce
            per_eta = {}
            for e, sel in te.groupby(te["eta"].clip(upper=12)).groups.items():
                ii = te.index.get_indexer(sel)
                if len(ii) >= 300:
                    per_eta[int(e)] = {"n": int(len(ii)), "stimato": round(float(p[ii].mean()), 3), "reale": round(float(y[ii].mean()), 3),
                                       "auc_modello": round(float(roc_auc_score(y[ii], p[ii])), 3) if 0 < y[ii].mean() < 1 else None,
                                       "auc_simili": round(float(roc_auc_score(y[ii], s[ii])), 3) if 0 < y[ii].mean() < 1 else None}
            m["per_eta"] = per_eta
            m["supera"] = bool(m["modello"]["log_loss"] < m["simili"]["log_loss"])
        else:
            m = {"modello": {"errore_medio": round(float(mean_absolute_error(y, p)), 3), "media_stimata": round(float(p.mean()), 2)},
                 "simili": {"errore_medio": round(float(mean_absolute_error(y, s)), 3), "media_stimata": round(float(s.mean()), 2)},
                 "media_vera": round(float(y.mean()), 2)}
            m["supera"] = bool(m["modello"]["errore_medio"] < m["simili"]["errore_medio"])
        imp = b.get_score(importance_type="gain"); tot = sum(imp.values()) or 1
        m["peso_variabili"] = sorted(({"variabile": k, "peso": round(v / tot, 4)} for k, v in imp.items()), key=lambda r: -r["peso"])
        m["alberi"] = int(nalb)
        ris["modelli"][nome] = m
        print(nome, json.dumps({k: v for k, v in m.items() if k not in ("peso_variabili", "per_eta", "fasce")}), flush=True)
        if salva:
            CARTELLA.mkdir(exist_ok=True)
            b.save_model(str(OBIETTIVI[nome]))
    if salva:
        FILE_VERIFICA.write_text(json.dumps(ris, indent=1, ensure_ascii=False))
    return ris


# ─────────────────────────────────────────────
# Lavoro notturno
# ─────────────────────────────────────────────
def phase_carriera_futura(conn: sqlite3.Connection, oggi: date | None = None) -> int:
    """Scrive carriera_futura: una riga per cavallo che ha corso nell'ultimo
    anno. Senza i modelli (o se non hanno superato la prova) non fa niente."""
    if not all(f.exists() for f in OBIETTIVI.values()) or not FILE_VERIFICA.exists():
        print("[CARRIERA FUTURA] modelli assenti, salto", file=sys.stderr)
        return 0
    from pronostico_top3 import Alberi
    ver = json.loads(FILE_VERIFICA.read_text())
    oggi = oggi or datetime.now(timezone.utc).date()
    f = fotografie(conn, [pd.Timestamp(oggi)], con_esito=False)
    X = f[VARIABILI].to_numpy(dtype="float32")
    lp6, lp12, lc = Alberi(FILE_6), Alberi(FILE_12), Alberi(FILE_CORSE)
    f["p_6"] = lp6.probabilita(X)
    f["p_12"] = lp12.probabilita(X)
    f["corse"] = lc.importo(X)
    # le tre ragioni che spostano di piu' la stima di "ancora in attivita' fra un anno"
    c, _ = lp12.contributi(X)
    nomi = list(lp12.variabili)
    motivi = []
    for riga in c:
        o = np.argsort(-np.abs(riga))[:3]
        motivi.append(json.dumps([{"variabile": nomi[i], "testo": NOMI.get(nomi[i], nomi[i]), "effetto": round(float(riga[i]), 3)}
                                  for i in o if abs(riga[i]) >= 0.05], ensure_ascii=False))
    f["motivi"] = motivi
    adesso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("DROP TABLE IF EXISTS carriera_futura")
    conn.execute("""CREATE TABLE carriera_futura (horse_name TEXT PRIMARY KEY, p_6 REAL, p_12 REAL, corse REAL,
                    eta INTEGER, corse_365 INTEGER, giorni_ultima INTEGER, motivi TEXT, modello TEXT, calcolato_il TEXT)""")
    conn.executemany("INSERT OR REPLACE INTO carriera_futura VALUES (?,?,?,?,?,?,?,?,?,?)", [
        (x.cavallo, round(float(x.p_6), 4), round(float(x.p_12), 4), round(float(x.corse), 2), int(x.eta),
         int(x.n_365), int(x.giorni_ultima), x.motivi, ver.get("nome"), adesso) for x in f.itertuples()])
    conn.commit()
    print(f"[CARRIERA FUTURA] {len(f)} cavalli", file=sys.stderr)
    return len(f)


if __name__ == "__main__":
    c = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    if "--allena" in sys.argv:
        r = allena(c)
        print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ("peso_variabili",)} for k, v in r["modelli"].items()},
                         ensure_ascii=False, indent=1))
    else:
        phase_carriera_futura(c)
