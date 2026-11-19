"""
valore_residuo_ml.py — "Quanto puo' ancora guadagnare": gli anni dal secondo
al quarto stimati con XGBoost (ottobre 2026).

PERCHE'
  La stima del valore residuo prende il primo anno dal modello dei premi e
  gli anni successivi dai "cavalli simili" del passato (stessa eta', stesso
  gruppo di voto, stesso gradino di premi). I simili non sanno nulla della
  forma recente ne' del livello delle corse: due cavalli di 5 anni con 8.000
  euro nell'ultimo anno ricevono la stessa stima anche se uno ha vinto in
  corse da 3.000 euro e l'altro e' arrivato terzo in corse da 20.000. La
  tesi (par. 8.2) lo indica come limite: per i gruppi di voto deboli la
  stima era troppo ottimista.

COSA FA
  Un modello XGBoost (premi in euro, come quello dei premi a 12 mesi) stima
  quanto il cavallo vincera' negli anni dal secondo al quarto da oggi. Usa
  le stesse "fotografie" del modello dei premi, piu' il livello delle corse
  disputate (premio del vincitore) e il livello piu' alto in cui e' arrivato
  nei primi tre.

PROVA (si fa a mano)
  python3 valore_residuo_ml.py --prova
    allena sulle fotografie dal 2014 al 2018 (gli anni 2-4 finiscono entro
    ottobre 2022), prova sui cavalli in attivita' a fine ottobre 2022 e
    confronta con i "simili" sugli stessi cavalli e sugli stessi anni
    (2023-2026). Se il modello sbaglia meno, si riallena su tutte le
    fotografie con gli anni 2-4 gia' passati e si salva; altrimenti non si
    salva nulla e il sito resta com'e'.

USO NOTTURNO
  stima_anni_2_4(conn, oggi) -> {cavallo: euro}; la usa valore_carriera.py
  solo se la verifica dice "adottato". Il lavoro notturno non ha bisogno di
  XGBoost: gli alberi si leggono con numpy.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "residuo_xgb.json"
FILE_VERIFICA = CARTELLA / "residuo_verifica.json"
NOME_MODELLO = "residuo-xgb-v1"

VARIABILI = [
    "eta", "maschio", "castrone",
    "n365", "premi365", "vitt365", "top3_365", "fuori365", "estero365",
    "km_migl365", "km_med365", "premio_medio365",
    "n90", "premi90", "premi_anno_prima", "n_anno_prima",
    "n_carriera", "premi_carriera", "anni_attivita", "giorni_ferma",
    "ult5_top3", "ult5_pos",
    "liv365", "liv5", "liv_top3_migl",
]
QUOTE_POSTO = {1: 1.0, 2: 0.475, 3: 0.259, 4: 0.13, 5: 0.087}
PARAMETRI = dict(objective="reg:tweedie", tweedie_variance_power=1.5, eta=0.05, max_depth=5,
                 min_child_weight=30, subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
                 tree_method="hist", nthread=2, seed=11)


def _corse(conn):
    """Le corse con il livello della corsa (premio stimato del vincitore)."""
    import numpy as np
    import pandas as pd
    from stima_premi import _corse as corse_premi
    r, h = corse_premi(conn)
    extra = pd.read_sql_query(
        """SELECT horse_name AS cavallo, race_date AS data, track AS pista,
                  COALESCE(CAST(race_number AS TEXT), race_code) AS numero
             FROM races WHERE race_date IS NOT NULL AND race_date >= '2013-01-01'
              AND COALESCE(LOWER(placement_raw), '') NOT IN ('nr', 'n.p.')""", conn)
    extra["data"] = pd.to_datetime(extra["data"], errors="coerce")
    extra = extra.dropna(subset=["data"]).drop_duplicates(["cavallo", "data", "pista"])
    r = r.merge(extra, on=["cavallo", "data", "pista"], how="left")
    r["gara"] = r["data"].dt.strftime("%Y-%m-%d") + "|" + r["pista"].astype(str) + "|" + r["numero"].astype(str)
    q = r["arrivo"].map(QUOTE_POSTO)
    v = (r["premio"] / q).where((r["premio"] > 0) & q.notna())
    r["livello"] = np.log1p(v.groupby(r["gara"]).transform("median"))
    return r.sort_values(["cavallo", "data"]), h


def fotografia(r, h, giorno):
    import pandas as pd
    from stima_premi import fotografia as foto_premi
    x = foto_premi(r, h, giorno)
    if x.empty:
        return x
    g = pd.Timestamp(giorno)
    prima = r[(r["data"] < g) & r["cavallo"].isin(x["cavallo"])]
    a365 = prima[prima["data"] >= g - pd.Timedelta(days=365)]
    l365 = a365.groupby("cavallo")["livello"].mean()
    l5 = prima.dropna(subset=["livello"]).groupby("cavallo").tail(5).groupby("cavallo")["livello"].mean()
    lt = prima[prima["top3"] == 1].groupby("cavallo")["livello"].max()
    x["liv365"] = x["cavallo"].map(l365)
    x["liv5"] = x["cavallo"].map(l5)
    x["liv_top3_migl"] = x["cavallo"].map(lt)
    return x


def _obiettivo(r, x, giorno):
    """Premi vinti dal secondo al quarto anno dopo `giorno`."""
    import pandas as pd
    g = pd.Timestamp(giorno)
    dopo = r[(r["data"] >= g + pd.Timedelta(days=365)) & (r["data"] < g + pd.Timedelta(days=4 * 365))]
    return x["cavallo"].map(dopo.groupby("cavallo")["premio"].sum()).fillna(0.0).to_numpy()


def _fotografie(r, h, giorni):
    import pandas as pd
    pezzi = []
    for g in giorni:
        x = fotografia(r, h, g)
        if x.empty:
            continue
        x["y"] = _obiettivo(r, x, g)
        pezzi.append(x)
        print(f"  fotografia {pd.Timestamp(g).date()}: {len(x)} cavalli", file=sys.stderr, flush=True)
    return pd.concat(pezzi, ignore_index=True)


def _allena(df, n_alberi=None):
    import xgboost as xgb
    X = df[VARIABILI].to_numpy(dtype="float32")
    if n_alberi is None:
        # Ultimo anno di fotografie come verifica interna, per il numero di alberi.
        ultimo = df["giorno"].max() - __import__("pandas").Timedelta(days=365)
        tr, va = df[df["giorno"] <= ultimo], df[df["giorno"] > ultimo]
        dtr = xgb.DMatrix(tr[VARIABILI].to_numpy(dtype="float32"), label=tr["y"], feature_names=VARIABILI)
        dva = xgb.DMatrix(va[VARIABILI].to_numpy(dtype="float32"), label=va["y"], feature_names=VARIABILI)
        b = xgb.train(PARAMETRI, dtr, 3000, evals=[(dva, "verifica")], early_stopping_rounds=80, verbose_eval=False)
        n_alberi = b.best_iteration + 1
    bst = xgb.train(PARAMETRI, xgb.DMatrix(X, label=df["y"], feature_names=VARIABILI), n_alberi)
    return bst, n_alberi


def prova(conn, oggi: date | None = None, anno_prova: int = 2022) -> dict:
    import numpy as np
    import pandas as pd
    import xgboost as xgb
    import valore_carriera as vc

    oggi = oggi or datetime.now(timezone.utc).date()
    r, h = _corse(conn)
    giorno_prova = pd.Timestamp(year=anno_prova, month=oggi.month, day=oggi.day)
    # Fotografie trimestrali: l'ultima ha gli anni 2-4 conclusi entro il giorno di prova.
    fine_all = giorno_prova - pd.Timedelta(days=4 * 365)
    giorni = list(pd.date_range("2014-01-01", fine_all, freq="QS"))
    print("fotografie per allenare...", file=sys.stderr, flush=True)
    df = _fotografie(r, h, giorni)
    bst, n_alberi = _allena(df)
    print("alberi:", n_alberi, file=sys.stderr, flush=True)

    # I cavalli in attivita' al giorno di prova, con la stima dei simili per anno.
    g, ultimo = vc._finestre(conn, oggi)
    s = vc._stati(g, ultimo)
    simili = vc.Simili(s, fino_a_anno=anno_prova)
    base = s[(s["anno_fin"] == anno_prova) & (s["stato"] != vc.FERMO) & (s["eta"] <= vc.ETA_MAX - 1)]
    futuri = s[s["anno_fin"] > anno_prova].pivot_table(index="nome", columns="anno_fin", values="premi")
    futuri = futuri.clip(lower=0).fillna(0)
    cache, righe = {}, []
    for _, x in base.iterrows():
        k = (int(x["eta"]), int(x["stato"]), int(x["voto"]))
        if k not in cache:
            anni = simili.stima(*k)["anni"]
            cache[k] = [a["atteso"] for a in anni[:4]] + [0.0] * (4 - len(anni[:4]))
        sim = cache[k]
        vero = [float(futuri.loc[x["nome"], anno_prova + i]) if (x["nome"] in futuri.index and anno_prova + i in futuri.columns) else 0.0
                for i in range(1, 5)]
        righe.append((x["nome"], int(x["eta"]), int(x["voto"]), sim[0], sum(sim[1:4]), vero[0], sum(vero[1:4])))
    t = pd.DataFrame(righe, columns=["cavallo", "eta", "voto", "sim_1", "sim_24", "vero_1", "vero_24"])
    foto = fotografia(r, h, giorno_prova)
    p = bst.predict(xgb.DMatrix(foto[VARIABILI].to_numpy(dtype="float32"), feature_names=VARIABILI))
    t = t.merge(pd.DataFrame({"cavallo": foto["cavallo"], "ml_24": p}), on="cavallo", how="inner")
    # Terza via: la media fra simili e modello. I simili tengono conto del
    # gruppo di voto (il modello, con pochi SSS fra le fotografie, li
    # sottostima), il modello della forma e del livello delle corse.
    t["mix_24"] = 0.5 * (t["sim_24"] + t["ml_24"])
    # Quarta via: il modello per tutti tranne i SSS, che restano ai simili.
    # Fra le fotografie per allenare i SSS sono pochi, e il modello tende a
    # riportarli verso la media.
    t["nosss_24"] = np.where(t["voto"] == 0, t["sim_24"], t["ml_24"])

    def misure(pred, vero):
        from scipy.stats import spearmanr
        return {"errore_medio": round(float(np.abs(pred - vero).mean())),
                "media_stimata": round(float(pred.mean())), "media_vera": round(float(vero.mean())),
                "correlazione_rango": round(float(spearmanr(pred, vero).statistic), 4)}

    out = {
        "modello": NOME_MODELLO, "giorno_prova": str(giorno_prova.date()),
        "anni_veri": f"{anno_prova + 2}-{anno_prova + 4} (dal secondo al quarto anno)",
        "cavalli": int(len(t)), "fotografie_allenamento": int(len(df)),
        "allenato_fino_a": str(pd.Timestamp(giorni[-1]).date()), "alberi": int(n_alberi),
        "simili": misure(t["sim_24"].to_numpy(), t["vero_24"].to_numpy()),
        "xgboost": misure(t["ml_24"].to_numpy(), t["vero_24"].to_numpy()),
        "media_simili_xgboost": misure(t["mix_24"].to_numpy(), t["vero_24"].to_numpy()),
        "xgboost_tranne_sss": misure(t["nosss_24"].to_numpy(), t["vero_24"].to_numpy()),
        "per_voto": {},
    }
    for v, x in t.groupby("voto"):
        out["per_voto"][vc.GRUPPI_VOTO[v]] = {
            "cavalli": int(len(x)), "vero": round(float(x["vero_24"].mean())),
            "simili": round(float(x["sim_24"].mean())), "xgboost": round(float(x["ml_24"].mean())),
            "media": round(float(x["mix_24"].mean())),
            "errore_media": round(float((x["mix_24"] - x["vero_24"]).abs().mean())),
            "errore_simili": round(float((x["sim_24"] - x["vero_24"]).abs().mean())),
            "errore_xgboost": round(float((x["ml_24"] - x["vero_24"]).abs().mean())),
        }
    out["per_eta"] = {}
    for e, x in t.groupby("eta"):
        if len(x) >= 100:
            out["per_eta"][int(e)] = {"cavalli": int(len(x)), "vero": round(float(x["vero_24"].mean())),
                                      "simili": round(float(x["sim_24"].mean())),
                                      "xgboost": round(float(x["ml_24"].mean())),
                                      "media": round(float(x["mix_24"].mean()))}
    imp = bst.get_score(importance_type="gain")
    tot = sum(imp.values()) or 1
    out["peso_variabili"] = sorted(({"variabile": k, "peso": round(v / tot, 4)} for k, v in imp.items()),
                                   key=lambda z: -z["peso"])[:10]
    # Si sceglie la via che sbaglia meno sul singolo cavallo, purche' ordini
    # i cavalli meglio dei simili e che in media non si allontani dal vero
    # piu' del 5% (il sito mostra la media: deve restare credibile per chi
    # ragiona su molti cavalli). Altrimenti restano i simili.
    sim = out["simili"]
    vera = sim["media_vera"]
    candidati = [(out[k]["errore_medio"], k) for k in ("xgboost", "media_simili_xgboost", "xgboost_tranne_sss")
                 if out[k]["errore_medio"] < sim["errore_medio"]
                 and out[k]["correlazione_rango"] > sim["correlazione_rango"]
                 and abs(out[k]["media_stimata"] / vera - 1) <= 0.05]
    adottato = bool(candidati)
    out["adottato"] = adottato
    out["scelta"] = min(candidati)[1] if candidati else "simili"
    out["esito"] = (f"adottato ({out['scelta']}): sbaglia meno dei simili sugli stessi cavalli" if adottato
                    else "non adottato: non migliora i simili sugli stessi cavalli")
    if adottato:
        # Modello di produzione: tutte le fotografie con gli anni 2-4 gia' passati.
        fine = pd.Timestamp(oggi) - pd.Timedelta(days=4 * 365)
        tutte = _fotografie(r, h, list(pd.date_range("2014-01-01", fine, freq="QS")))
        bst2, _ = _allena(tutte, n_alberi)
        CARTELLA.mkdir(exist_ok=True)
        bst2.save_model(str(FILE_MODELLO))
        from pronostico_top3 import Alberi
        x = tutte.sample(min(3000, len(tutte)), random_state=3)
        a_ = bst2.predict(xgb.DMatrix(x[VARIABILI].to_numpy(dtype="float32"), feature_names=VARIABILI))
        b_ = Alberi(FILE_MODELLO).importo(x[VARIABILI].to_numpy(dtype="float32"))
        # Scarto relativo: XGBoost somma gli alberi in precisione ridotta.
        scarto = float(np.max(np.abs(a_ - b_) / np.maximum(np.abs(a_), 1.0)))
        assert scarto < 1e-4, f"il lettore degli alberi non coincide con XGBoost ({scarto})"
        out["produzione"] = {"fotografie": int(len(tutte)), "fino_a": str(fine.date()), "scarto_lettore_relativo": scarto}
    out["verificato_il"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    FILE_VERIFICA.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    return out


def scelta() -> str:
    """"xgboost", "media_simili_xgboost" oppure "simili" (modello non adottato)."""
    try:
        return json.loads(FILE_VERIFICA.read_text()).get("scelta", "simili") if adottato() else "simili"
    except Exception:  # noqa: BLE001
        return "simili"


def adottato() -> bool:
    try:
        return bool(json.loads(FILE_VERIFICA.read_text()).get("adottato")) and FILE_MODELLO.exists()
    except Exception:  # noqa: BLE001
        return False


def stima_anni_2_4(conn, oggi: date | None = None) -> dict:
    """Premi attesi dal secondo al quarto anno, per ogni cavallo che ha corso
    nell'ultimo anno. Vuoto se il modello non e' stato adottato."""
    if not adottato():
        return {}
    from pronostico_top3 import Alberi
    oggi = oggi or datetime.now(timezone.utc).date()
    r, h = _corse(conn)
    x = fotografia(r, h, oggi)
    if x.empty:
        return {}
    p = Alberi(FILE_MODELLO).importo(x[VARIABILI].to_numpy(dtype="float32"))
    return {c: float(v) for c, v in zip(x["cavallo"], p)}


if __name__ == "__main__":
    c = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    if "--prova" in sys.argv:
        print(json.dumps(prova(c), ensure_ascii=False, indent=1))
