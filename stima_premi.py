"""
stima_premi.py — Premi attesi di un cavallo nei prossimi dodici mesi.

COSA FA
  Per ogni cavallo che ha corso nell'ultimo anno stima quanto vincera' in
  premi nei dodici mesi successivi. La stima viene da un modello XGBoost e si
  scrive nella tabella `stima_premi`, che il sito mostra nella pagina del
  cavallo accanto ai costi di mantenimento: e' il pezzo che serve per dire se
  quel cavallo, da solo, ha buone probabilita' di coprire le spese.

NIENTE DAL FUTURO
  Il modello si allena su "fotografie" prese all'inizio di ogni trimestre: per
  ogni cavallo si guarda solo cio' che era successo prima di quella data, e si
  confronta con i premi vinti nei dodici mesi dopo. Le fotografie di prova
  (2025) sono successive a tutto quello che il modello ha visto.

COSA NON FA
  Non stima i puledri che non hanno mai corso: servirebbe prevederli dai
  genitori, e su questo i dati non bastano (e' il modello di allevamento che
  il sito non presenta come affidabile).

DUE MODI DI USO
  python3 stima_premi.py --allena      allena, verifica e salva (a mano)
  phase_stima_premi(conn)              nel lavoro notturno, solo numpy/pandas
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from pronostico_top3 import Alberi

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "premi_xgb.json"
FILE_VERIFICA = CARTELLA / "premi_verifica.json"
NOME_MODELLO = "premi-xgb-v1"

# Spesa di riferimento della tesi: 1.200 euro al mese.
COSTO_ANNO_RIFERIMENTO = 14_400

VARIABILI = [
    "eta", "maschio", "castrone",
    "n365", "premi365", "vitt365", "top3_365", "fuori365", "estero365",
    "km_migl365", "km_med365", "premio_medio365",
    "n90", "premi90", "premi_anno_prima", "n_anno_prima",
    "n_carriera", "premi_carriera", "anni_attivita", "giorni_ferma",
    "ult5_top3", "ult5_pos", "mese",
]

SPIEGAZIONI = {
    "premi365": "premi dell'ultimo anno",
    "top3_365": "piazzamenti nell'ultimo anno",
    "ult5_top3": "forma nelle ultime cinque corse",
    "n365": "corse nell'ultimo anno",
    "km_migl365": "miglior tempo dell'ultimo anno",
}


def _corse(conn):
    import pandas as pd
    r = pd.read_sql_query(
        """SELECT r.horse_name AS cavallo, r.race_date AS data, r.track AS pista,
                  r.placement AS arrivo, r.placement_raw AS arrivo_testo,
                  r.time_km AS tempo, COALESCE(r.prize_net, 0) AS premio
             FROM races r
            WHERE r.race_date IS NOT NULL AND r.race_date >= '2013-01-01'
              AND COALESCE(LOWER(r.placement_raw), '') NOT IN ('nr', 'n.p.')""", conn)
    r["data"] = pd.to_datetime(r["data"], errors="coerce")
    r = r.dropna(subset=["data"])
    r["top3"] = r["arrivo"].between(1, 3).astype(float)
    r["vinta"] = (r["arrivo"] == 1).astype(float)
    # Ritirato, squalificato, rotto: corsa finita male.
    r["fuori"] = r["arrivo"].isna().astype(float)
    r["estero"] = (r["pista"] == "ESTERO").astype(float)
    r["pos"] = r["arrivo"].clip(upper=12).fillna(12)
    r.loc[(r["tempo"] < 60) | (r["tempo"] > 120), "tempo"] = float("nan")
    h = pd.read_sql_query("SELECT name AS cavallo, birth_year AS nato, sex AS sesso FROM horses", conn)
    return r.sort_values(["cavallo", "data"]), h


def fotografia(r, h, giorno):
    """Variabili di ogni cavallo attivo al `giorno`, usando solo corse precedenti."""
    import numpy as np
    import pandas as pd
    g = pd.Timestamp(giorno)
    prima = r[r["data"] < g]
    a365 = prima[prima["data"] >= g - pd.Timedelta(days=365)]
    if a365.empty:
        return pd.DataFrame()
    x = a365.groupby("cavallo").agg(
        n365=("premio", "size"), premi365=("premio", "sum"), vitt365=("vinta", "sum"),
        top3_365=("top3", "mean"), fuori365=("fuori", "mean"), estero365=("estero", "mean"),
        km_migl365=("tempo", "min"), km_med365=("tempo", "median"))
    x["premio_medio365"] = x["premi365"] / x["n365"]
    a90 = prima[prima["data"] >= g - pd.Timedelta(days=90)].groupby("cavallo").agg(
        n90=("premio", "size"), premi90=("premio", "sum"))
    ap = prima[(prima["data"] < g - pd.Timedelta(days=365)) & (prima["data"] >= g - pd.Timedelta(days=730))]
    ap = ap.groupby("cavallo").agg(premi_anno_prima=("premio", "sum"), n_anno_prima=("premio", "size"))
    tutto = prima[prima["cavallo"].isin(x.index)].groupby("cavallo").agg(
        n_carriera=("premio", "size"), premi_carriera=("premio", "sum"),
        prima_corsa=("data", "min"), ultima_corsa=("data", "max"))
    ult5 = prima[prima["cavallo"].isin(x.index)].groupby("cavallo").tail(5).groupby("cavallo").agg(
        ult5_top3=("top3", "mean"), ult5_pos=("pos", "mean"))
    x = x.join(a90).join(ap).join(tutto).join(ult5)
    for c in ["n90", "premi90", "premi_anno_prima", "n_anno_prima"]:
        x[c] = x[c].fillna(0)
    x["anni_attivita"] = (g - x["prima_corsa"]).dt.days / 365.25
    x["giorni_ferma"] = (g - x["ultima_corsa"]).dt.days
    x = x.drop(columns=["prima_corsa", "ultima_corsa"]).reset_index()
    x = x.merge(h, on="cavallo", how="left")
    x["eta"] = g.year - x["nato"]
    x.loc[(x["eta"] < 2) | (x["eta"] > 20), "eta"] = np.nan
    s = x["sesso"].fillna("").str.upper().str[:1]
    x["maschio"] = (s == "M").astype(float)
    x["castrone"] = (s == "C").astype(float)
    x.loc[~s.isin(["M", "F", "C"]), ["maschio", "castrone"]] = np.nan
    x["mese"] = g.month
    x["giorno"] = g
    return x


def _obiettivo(r, x, giorno):
    import pandas as pd
    g = pd.Timestamp(giorno)
    dopo = r[(r["data"] >= g) & (r["data"] < g + pd.Timedelta(days=365))]
    s = dopo.groupby("cavallo")["premio"].sum()
    return x["cavallo"].map(s).fillna(0.0).to_numpy()


def _trimestri(da, a):
    import pandas as pd
    return list(pd.date_range(da, a, freq="QS"))


def _fasce(pred, vero, n=10):
    """Come sono andati davvero i cavalli con una stima simile: per ogni
    decimo delle stime, i premi effettivi in 19 punti (dal 5% al 95%)."""
    import numpy as np
    # Decimi, con l'ultimo diviso in tre: lassu' le stime vanno da 11 mila a
    # oltre 300 mila euro, e un'unica fascia direbbe poco.
    punti = list(np.linspace(0, 0.9, n)) + [0.95, 0.98, 1.0]
    tagli = np.quantile(pred, punti)
    n = len(tagli) - 1
    fasce = []
    for i in range(n):
        lo, hi = tagli[i], tagli[i + 1]
        m = (pred >= lo) & ((pred <= hi) if i == n - 1 else (pred < hi))
        if m.sum() < 30:
            continue
        v = vero[m]
        fasce.append({
            "da": round(float(lo), 0), "a": round(float(hi), 0), "n": int(m.sum()),
            "stimato": round(float(pred[m].mean()), 0), "reale": round(float(v.mean()), 0),
            "zero": round(float((v <= 0).mean()), 3),
            "percentili": [round(float(q), 0) for q in np.quantile(v, np.linspace(0.05, 0.95, 19))],
            "copre_riferimento": round(float((v >= COSTO_ANNO_RIFERIMENTO).mean()), 3),
        })
    return fasce


def _misure(vero, pred):
    import numpy as np
    from scipy.stats import spearmanr
    sopra_v = vero >= COSTO_ANNO_RIFERIMENTO
    sopra_p = pred >= COSTO_ANNO_RIFERIMENTO
    return {
        "errore_medio": round(float(np.abs(vero - pred).mean()), 0),
        "correlazione_rango": round(float(spearmanr(vero, pred).statistic), 4),
        # Dei cavalli indicati sopra la soglia, quanti l'hanno davvero superata.
        "indicati_sopra": int(sopra_p.sum()),
        "indicati_sopra_giusti": round(float(sopra_v[sopra_p].mean()), 3) if sopra_p.any() else None,
        # Dei cavalli che l'hanno superata, quanti erano stati indicati.
        "trovati": round(float(sopra_p[sopra_v].mean()), 3) if sopra_v.any() else None,
    }


def allena():
    import numpy as np
    import pandas as pd
    import xgboost as xgb

    conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    r, h = _corse(conn)
    print("fotografie trimestrali...", file=sys.stderr)
    pezzi = []
    for g in _trimestri("2016-01-01", "2025-07-01"):
        x = fotografia(r, h, g)
        if x.empty:
            continue
        x["y"] = _obiettivo(r, x, g)
        pezzi.append(x)
    df = pd.concat(pezzi, ignore_index=True)
    allen = df[df["giorno"] <= "2022-10-01"]
    valid = df[(df["giorno"] >= "2023-01-01") & (df["giorno"] <= "2023-10-01")]
    prova = df[df["giorno"] >= "2025-01-01"]
    print(f"fotografie: allenamento {len(allen):,}, controllo {len(valid):,}, prova {len(prova):,}", file=sys.stderr)

    par = dict(objective="reg:tweedie", tweedie_variance_power=1.5, eta=0.05, max_depth=5,
               min_child_weight=20, subsample=0.8, colsample_bytree=0.8, eval_metric="tweedie-nloglik@1.5",
               seed=7, nthread=4)
    da = xgb.DMatrix(allen[VARIABILI].astype("float32"), label=allen["y"], feature_names=VARIABILI)
    dv = xgb.DMatrix(valid[VARIABILI].astype("float32"), label=valid["y"], feature_names=VARIABILI)
    m = xgb.train(par, da, 3000, evals=[(dv, "controllo")], early_stopping_rounds=100, verbose_eval=False)
    n_alberi = m.best_iteration + 1
    tutti = pd.concat([allen, valid])
    dt = xgb.DMatrix(tutti[VARIABILI].astype("float32"), label=tutti["y"], feature_names=VARIABILI)
    m = xgb.train(par, dt, n_alberi)

    dp = xgb.DMatrix(prova[VARIABILI].astype("float32"), feature_names=VARIABILI)
    pred = m.predict(dp)
    vero = prova["y"].to_numpy()

    # Metodi semplici da battere.
    ripeti = prova["premi365"].to_numpy()  # "vincera' quanto l'anno scorso"
    per_eta = tutti.groupby("eta")["y"].mean()
    media_eta = prova["eta"].map(per_eta).fillna(tutti["y"].mean()).to_numpy()

    CARTELLA.mkdir(exist_ok=True)
    m.save_model(str(FILE_MODELLO))
    lettore = Alberi(FILE_MODELLO)
    # Scarto relativo: gli importi arrivano a decine di migliaia di euro.
    scarto = float((np.abs(lettore.importo(prova[VARIABILI].to_numpy(dtype="float32")) - pred) / np.maximum(pred, 1)).max())
    peso = m.get_score(importance_type="gain")
    totp = sum(peso.values()) or 1
    ris = {
        "modello": NOME_MODELLO,
        "allenato_il": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fotografie_allenamento": {"da": "2016-01-01", "a": "2023-10-01", "n": int(len(tutti))},
        "periodo_prova": {"da": "2025-01-01", "a": "2025-07-01", "fotografie": int(len(prova)),
                           "cavalli": int(prova["cavallo"].nunique())},
        "alberi": n_alberi,
        "costo_anno_riferimento": COSTO_ANNO_RIFERIMENTO,
        "modello_misure": _misure(vero, pred),
        "come_l_anno_prima": _misure(vero, ripeti),
        "media_per_eta": _misure(vero, media_eta),
        "premi_medi_reali": round(float(vero.mean()), 0),
        "premi_medi_stimati": round(float(pred.mean()), 0),
        "quota_a_zero": round(float((vero <= 0).mean()), 3),
        "fasce": _fasce(pred, vero),
        "peso_variabili": sorted(({"variabile": k, "peso": round(v / totp, 4)} for k, v in peso.items()),
                                 key=lambda d: -d["peso"])[:10],
        "scarto_lettore": scarto,
    }
    mm, rr = ris["modello_misure"], ris["come_l_anno_prima"]
    ris["supera_i_metodi_semplici"] = bool(
        mm["errore_medio"] < rr["errore_medio"] and mm["errore_medio"] < ris["media_per_eta"]["errore_medio"]
        and mm["correlazione_rango"] > rr["correlazione_rango"])
    FILE_VERIFICA.write_text(json.dumps(ris, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in ris.items() if k != "fasce"}, ensure_ascii=False, indent=2))


def _motivi(riga, mediane) -> list[dict]:
    out = []
    p = riga.get("premi365") or 0
    out.append({"testo": f"ha vinto {int(round(p, -1)):,} € negli ultimi dodici mesi".replace(",", "."), "verso": 1 if p >= mediane["premi365"] else -1})
    t = riga.get("ult5_top3")
    if t == t and t is not None:
        if t >= 0.6:
            out.append({"testo": "spesso nei primi tre nelle ultime cinque corse", "verso": 1})
        elif t <= 0.2:
            out.append({"testo": "raramente nei primi tre nelle ultime cinque corse", "verso": -1})
    e = riga.get("eta")
    if e == e and e is not None:
        if e >= 10:
            out.append({"testo": f"ha {int(e)} anni: a quest'età i premi calano", "verso": -1})
        elif e <= 3:
            out.append({"testo": f"ha {int(e)} anni: carriera appena iniziata", "verso": 0})
    gf = riga.get("giorni_ferma")
    if gf == gf and gf is not None and gf >= 120:
        out.append({"testo": f"non corre da {int(gf)} giorni", "verso": -1})
    return out[:3]


def phase_stima_premi(conn: sqlite3.Connection) -> int:
    """Riscrive `stima_premi` per i cavalli che hanno corso nell'ultimo anno.
    Non fa mai fallire il lavoro notturno."""
    try:
        import numpy as np  # noqa: F401
        import pandas as pd
    except ImportError:
        print("[PREMI] numpy/pandas non installati: salto", file=sys.stderr)
        return 0
    if not FILE_MODELLO.exists():
        print("[PREMI] modello non trovato: salto", file=sys.stderr)
        return 0
    try:
        verifica = json.loads(FILE_VERIFICA.read_text()) if FILE_VERIFICA.exists() else {}
        r, h = _corse(conn)
        oggi = pd.Timestamp(datetime.now(timezone.utc).date())
        x = fotografia(r, h, oggi)
        conn.execute("""CREATE TABLE IF NOT EXISTS stima_premi (
            horse_name TEXT PRIMARY KEY, premi_attesi REAL, premi_ultimo_anno REAL,
            corse_ultimo_anno INTEGER, eta INTEGER, motivi TEXT, modello TEXT,
            verificato INTEGER, calcolato_il TEXT)""")
        conn.execute("DELETE FROM stima_premi")
        if x.empty:
            conn.commit()
            return 0
        pred = Alberi(FILE_MODELLO).importo(x[VARIABILI].to_numpy(dtype="float32"))
        mediane = {"premi365": float(x["premi365"].median())}
        ora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ver = 1 if verifica.get("supera_i_metodi_semplici") else 0
        righe = []
        for (_, rr), p in zip(x.iterrows(), pred):
            d = rr.to_dict()
            righe.append((d["cavallo"], round(float(p), 0), round(float(d["premi365"]), 0), int(d["n365"]),
                          int(d["eta"]) if d["eta"] == d["eta"] else None,
                          json.dumps(_motivi(d, mediane), ensure_ascii=False), NOME_MODELLO, ver, ora))
        conn.executemany("INSERT OR REPLACE INTO stima_premi VALUES (?,?,?,?,?,?,?,?,?)", righe)
        conn.commit()
        print(f"[PREMI] {len(righe)} cavalli stimati", file=sys.stderr)
        return len(righe)
    except Exception as e:
        print(f"[PREMI] errore, salto: {e!r}", file=sys.stderr)
        try:
            conn.rollback()
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    if "--allena" in sys.argv:
        allena()
    else:
        print(phase_stima_premi(sqlite3.connect(os.environ.get("DB_PATH", "data.db"))))
