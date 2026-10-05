"""
pronostico_top3.py — Probabilita' di arrivare nei primi tre, prima della partenza.

COSA FA
  Per ogni cavallo iscritto a una gara in calendario stima la probabilita' di
  chiudere primo, secondo o terzo. La stima viene da un modello XGBoost
  allenato sulle gare dell'archivio, e si scrive nella tabella
  `pronostico_top3`, che il sito legge nella pagina Calendario.

LA REGOLA CHE CONTA DI PIU': NIENTE DAL FUTURO
  Ogni dato che entra nella stima e' calcolato com'era il giorno della gara,
  usando solo le corse precedenti. Il voto attuale del cavallo, per esempio,
  NON entra: contiene anche le corse venute dopo, e farebbe sembrare il
  modello piu' bravo di quello che e'. Lo stesso vale per il guidatore: nelle
  gare in calendario la fonte non lo indica, quindi si usa quello dell'ultima
  corsa del cavallo, sia per allenare sia per stimare.

DUE MODI DI USO
  python3 pronostico_top3.py --allena   allena, verifica e salva il modello
                                        (si fa a mano, quando serve)
  phase_pronostico_top3(conn)           dentro il lavoro notturno: calcola le
                                        stime per le gare in calendario

  Il lavoro notturno non ha bisogno di XGBoost: il modello salvato e' un
  elenco di alberi di decisione, e qui sotto c'e' il codice che li percorre.
  Servono solo numpy e pandas. La verifica controlla che questo codice dia
  esattamente gli stessi numeri di XGBoost.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "top3_xgb.json"
FILE_VERIFICA = CARTELLA / "top3_verifica.json"
NOME_MODELLO = "top3-xgb-v1"

# Ordine fisso delle variabili: il modello le legge per posizione.
VARIABILI = [
    "h_n", "h_top3", "h_vitt", "h_ult5_top3", "h_ult3_pos", "h_ult_top3",
    "h_giorni", "h_premi_365", "h_gare_365", "h_tempo_migl", "h_tempo_ult",
    "h_pista_top3", "h_pista_n", "eta", "maschio",
    "d_top3", "d_n",
    "partenza", "partenti", "partenza_rel",
    "r_ult5_top3", "r_premi_365", "r_top3", "r_tempo_migl", "r_d_top3",
    "s_ult5_top3", "s_premi_365", "s_tempo_migl",
]

# Come si spiega ogni variabile a chi legge il calendario. Solo quelle che
# hanno senso in una frase; il verso dice se un valore alto e' un pregio.
SPIEGAZIONI = {
    "r_ult5_top3": ("forma recente", +1),
    "r_premi_365": ("premi dell'ultimo anno", +1),
    "r_top3": ("piazzamenti in carriera", +1),
    "r_tempo_migl": ("tempi", -1),   # tempo basso = meglio
    "r_d_top3": ("guidatore", +1),
    "partenza": ("numero di partenza", -1),        # numero basso = meglio
    "h_pista_top3": ("risultati su questa pista", +1),
    "h_giorni": ("giorni dall'ultima corsa", 0),
}


# ─────────────────────────────────────────────────────────────────────────────
#  Costruzione delle variabili (uguale per allenamento e calendario)
# ─────────────────────────────────────────────────────────────────────────────

def _storico(conn: sqlite3.Connection):
    import pandas as pd
    df = pd.read_sql_query(
        """SELECT r.horse_name AS cavallo, r.race_date AS data, r.track AS pista,
                  r.race_number AS numero, r.driver AS guidatore,
                  r.placement AS arrivo, r.time_km AS tempo, r.start_pos AS partenza,
                  r.total_starters AS partenti, r.prize_net AS premio
             FROM races r
            WHERE r.race_date IS NOT NULL AND r.race_date >= '2013-01-01'""", conn)
    df["gara"] = df["data"].astype(str) + "|" + df["pista"].fillna("").astype(str) + "|" + df["numero"].astype(str)
    df["futura"] = False
    return df


def _calendario(conn: sqlite3.Connection):
    import pandas as pd
    up = pd.read_sql_query(
        """SELECT horse_name AS cavallo, race_date AS data, track AS pista,
                  race_time AS ora, start_pos AS partenza
             FROM upcoming_races WHERE race_date >= date('now', '-1 day')""", conn)
    if up.empty:
        return up
    up["gara"] = up["data"] + "|" + up["pista"].fillna("") + "|" + up["ora"].astype(str)
    # Nel calendario l'elenco dei partenti e' completo: il loro numero e' il campo.
    up["partenti"] = up.groupby("gara")["cavallo"].transform("count")
    up["numero"] = up["ora"]
    up["guidatore"] = None
    up["arrivo"] = None
    up["tempo"] = None
    up["premio"] = 0.0
    up["futura"] = True
    return up



def _media_passata(df, chiavi, col):
    """Media di `col` sulle righe precedenti dello stesso gruppo (esclusa la riga)."""
    prev = df.groupby(chiavi, sort=False)[col].shift()
    k = [df[c] for c in ([chiavi] if isinstance(chiavi, str) else chiavi)]
    somma = prev.fillna(0).groupby(k, sort=False).cumsum()
    quante = prev.notna().astype(float).groupby(k, sort=False).cumsum()
    return (somma / quante).where(quante > 0)


def _mobile_passata(df, chiave, col, n, come="mean"):
    prev = df.groupby(chiave, sort=False)[col].shift()
    r = prev.groupby(df[chiave], sort=False).rolling(n, min_periods=1)
    r = r.mean() if come == "mean" else r.min()
    return r.reset_index(level=0, drop=True).sort_index()


def _minimo_passato(df, chiave, col):
    prev = df.groupby(chiave, sort=False)[col].shift()
    return prev.groupby(df[chiave], sort=False).cummin()


def costruisci_variabili(conn: sqlite3.Connection, con_calendario: bool = False):
    """Una riga per partenza, con le variabili calcolate solo dal passato."""
    import numpy as np
    import pandas as pd

    df = _storico(conn)
    if con_calendario:
        up = _calendario(conn)
        if not up.empty:
            df = pd.concat([df, up[df.columns.intersection(up.columns)]], ignore_index=True)

    df["data"] = pd.to_datetime(df["data"], errors="coerce")
    df = df[df["data"].notna()].copy()
    for c in ("arrivo", "tempo", "partenza", "partenti", "premio"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    # Il campo noto: dove la fonte non lo scrive, almeno quanti ne conosciamo.
    df.loc[(df["partenti"] < 2) | (df["partenti"] > 24), "partenti"] = np.nan
    df.loc[(df["partenza"] < 1) | (df["partenza"] > 24), "partenza"] = np.nan
    conosciuti = df.groupby("gara")["cavallo"].transform("count")
    df["partenti"] = df["partenti"].fillna(conosciuti)
    df["premio"] = df["premio"].fillna(0.0)
    # Tempo al km: fuori scala = dato rotto (la fonte a volte scrive 0 o 99).
    df.loc[(df["tempo"] < 9) | (df["tempo"] > 40), "tempo"] = np.nan

    # Esito: solo per le gare gia' corse. Ritirati, squalificati e non
    # piazzati contano come "non nei primi tre".
    corsa = ~df["futura"].astype(bool)
    df["top3"] = np.where(corsa, ((df["arrivo"] >= 1) & (df["arrivo"] <= 3)).astype(float), np.nan)
    df["vitt"] = np.where(corsa, (df["arrivo"] == 1).astype(float), np.nan)
    pos = (df["arrivo"] / df["partenti"]).clip(upper=1.0)
    df["pos_rel"] = np.where(corsa, pos.fillna(1.0), np.nan)

    df = df.sort_values(["cavallo", "data", "gara"]).reset_index(drop=True)
    g = df.groupby("cavallo", sort=False)

    # Cavallo: tutto spostato di una corsa, cosi' la riga vede solo il passato.
    df["h_n"] = g.cumcount().astype(float)
    df["h_top3"] = _media_passata(df, "cavallo", "top3")
    df["h_vitt"] = _media_passata(df, "cavallo", "vitt")
    df["h_ult5_top3"] = _mobile_passata(df, "cavallo", "top3", 5)
    df["h_ult3_pos"] = _mobile_passata(df, "cavallo", "pos_rel", 3)
    df["h_ult_top3"] = g["top3"].shift()
    df["h_giorni"] = (df["data"] - g["data"].shift()).dt.days.astype(float)
    df["h_tempo_migl"] = _minimo_passato(df, "cavallo", "tempo")
    df["h_tempo_ult"] = g["tempo"].shift().groupby(df["cavallo"], sort=False).ffill()

    # Ultimi 365 giorni: premi e numero di corse, escludendo la data stessa.
    tmp = df[["cavallo", "data", "premio"]].copy()
    tmp["uno"] = 1.0
    tmp = tmp.set_index("data")
    r365 = (tmp.groupby("cavallo", sort=False)[["premio", "uno"]]
               .rolling("365D", closed="left").sum())
    df["h_premi_365"] = r365["premio"].to_numpy()
    df["h_gare_365"] = r365["uno"].to_numpy()
    gia = df["h_n"] > 0  # ha gia' corso, ma non nell'ultimo anno: zero, non "ignoto"
    df.loc[gia & df["h_premi_365"].isna(), ["h_premi_365", "h_gare_365"]] = 0.0

    # Sulla stessa pista.
    gp = df.groupby(["cavallo", "pista"], sort=False)
    df["h_pista_n"] = gp.cumcount().astype(float)
    df["h_pista_top3"] = _media_passata(df, ["cavallo", "pista"], "top3")

    # Guidatore: quello dell'ultima corsa del cavallo, con il suo rendimento
    # misurato fino a quella corsa (escludendola). Vale per allenamento e
    # calendario allo stesso modo.
    dd = df[df["guidatore"].notna()].sort_values(["data", "gara"])
    d_top3 = _media_passata(dd, "guidatore", "top3")
    d_n = dd.groupby("guidatore", sort=False).cumcount().astype(float)
    df["_d_top3"] = d_top3.reindex(df.index)
    df["_d_n"] = d_n.reindex(df.index)
    df.loc[df["guidatore"].isna(), ["_d_top3", "_d_n"]] = np.nan
    df["d_top3"] = g["_d_top3"].shift()
    df["d_n"] = g["_d_n"].shift()

    # Eta' e sesso dall'anagrafica.
    import pandas as pd  # noqa: F811
    an = pd.read_sql_query("SELECT name AS cavallo, birth_year, sex FROM horses", conn)
    an = an.drop_duplicates("cavallo")
    df = df.merge(an, on="cavallo", how="left")
    df["eta"] = (df["data"].dt.year - pd.to_numeric(df["birth_year"], errors="coerce")).astype(float)
    df.loc[(df["eta"] < 2) | (df["eta"] > 16), "eta"] = np.nan
    df["maschio"] = df["sex"].map(lambda s: 1.0 if str(s).upper().startswith(("M", "C", "S")) else (0.0 if isinstance(s, str) and s else np.nan))

    # Gara.
    df["partenza_rel"] = df["partenza"] / df["partenti"]

    # Confronto con gli avversari della stessa corsa: posizione in classifica
    # (0 = il peggiore, 1 = il migliore) e scarto dalla media della corsa.
    gg = df.groupby("gara", sort=False)
    for sorg, dest, verso in (("h_ult5_top3", "r_ult5_top3", True), ("h_premi_365", "r_premi_365", True),
                              ("h_top3", "r_top3", True), ("h_tempo_migl", "r_tempo_migl", False),
                              ("d_top3", "r_d_top3", True)):
        df[dest] = gg[sorg].rank(pct=True, ascending=verso)
    for sorg, dest in (("h_ult5_top3", "s_ult5_top3"), ("h_premi_365", "s_premi_365"),
                       ("h_tempo_migl", "s_tempo_migl")):
        df[dest] = df[sorg] - gg[sorg].transform("mean")

    return df


# ─────────────────────────────────────────────────────────────────────────────
#  Lettura del modello senza XGBoost
# ─────────────────────────────────────────────────────────────────────────────

class Alberi:
    """Percorre gli alberi salvati da XGBoost (formato JSON) con numpy."""

    def __init__(self, percorso: Path):
        m = json.loads(Path(percorso).read_text())
        lm = m["learner"]
        bs = lm["learner_model_param"]["base_score"].strip("[]")
        base = float(bs)
        self.margine0 = math.log(base / (1 - base))
        self.alberi = []
        for t in lm["gradient_booster"]["model"]["trees"]:
            self.alberi.append((
                __import__("numpy").array(t["left_children"]),
                __import__("numpy").array(t["right_children"]),
                __import__("numpy").array(t["split_indices"]),
                __import__("numpy").array(t["split_conditions"], dtype="float32"),
                __import__("numpy").array(t["default_left"], dtype=bool),
            ))
        self.variabili = lm.get("feature_names") or VARIABILI

    def margine(self, X):
        import numpy as np
        X = np.asarray(X, dtype="float32")
        n = X.shape[0]
        tot = np.full(n, self.margine0, dtype="float64")
        righe = np.arange(n)
        for sx, dx, idx, cond, dl in self.alberi:
            nodo = np.zeros(n, dtype=np.int64)
            while True:
                foglia = sx[nodo] == -1
                if foglia.all():
                    break
                att = ~foglia
                v = X[righe[att], idx[nodo[att]]]
                manca = np.isnan(v)
                va_sx = np.where(manca, dl[nodo[att]], v < cond[nodo[att]])
                nodo[att] = np.where(va_sx, sx[nodo[att]], dx[nodo[att]])
            tot += cond[nodo]
        return tot

    def probabilita(self, X):
        import numpy as np
        return 1.0 / (1.0 + np.exp(-self.margine(X)))


def normalizza_per_gara(prob, gare, campo):
    """Nella stessa corsa i posti nei primi tre sono tre (o meno, se i
    partenti sono meno di tre): le probabilita' devono sommare a quello.
    Si lavora sulle quote, cosi' nessuna supera il 100%."""
    import numpy as np
    import pandas as pd
    p = np.clip(np.asarray(prob, dtype=float), 1e-4, 1 - 1e-4)
    out = p.copy()
    df = pd.DataFrame({"g": gare, "p": p, "k": np.minimum(3, campo)})
    for _, idx in df.groupby("g").indices.items():
        q = p[idx]
        k = float(df["k"].iloc[idx[0]])
        if len(q) <= k:
            out[idx] = 1.0
            continue
        lo, hi = -20.0, 20.0
        lq = np.log(q / (1 - q))
        for _ in range(60):  # cerca lo spostamento che porta la somma a k
            mid = (lo + hi) / 2
            s = (1 / (1 + np.exp(-(lq + mid)))).sum()
            lo, hi = (mid, hi) if s < k else (lo, mid)
        out[idx] = 1 / (1 + np.exp(-(lq + (lo + hi) / 2)))
    return out


# ─────────────────────────────────────────────────────────────────────────────
#  Allenamento e verifica (a mano)
# ─────────────────────────────────────────────────────────────────────────────

def _misure(y, p, gare):
    import numpy as np
    import pandas as pd
    from sklearn.metrics import roc_auc_score, log_loss, brier_score_loss
    p = np.clip(p, 1e-4, 1 - 1e-4)
    d = pd.DataFrame({"y": y, "p": p, "g": gare})
    # I tre con la stima piu' alta in ogni corsa: quanti arrivano davvero nei primi tre?
    d["rk"] = d.groupby("g")["p"].rank(ascending=False, method="first")
    scelti = d[d["rk"] <= 3]
    return {
        "auc": round(float(roc_auc_score(y, p)), 4),
        "log_loss": round(float(log_loss(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "tre_scelti_a_segno": round(float(scelti["y"].mean()), 4),
    }


def allena():
    import numpy as np
    import pandas as pd
    import xgboost as xgb

    db = os.environ.get("DB_PATH", "data.db")
    conn = sqlite3.connect(db)
    print("costruisco le variabili...", flush=True)
    df = costruisci_variabili(conn)
    df = df[df["top3"].notna() & (df["data"] >= "2015-01-01")].copy()
    print(f"partenze utilizzabili: {len(df):,}", flush=True)

    tr = df[df["data"] < "2024-01-01"]
    va = df[(df["data"] >= "2024-01-01") & (df["data"] < "2025-01-01")]
    te = df[df["data"] >= "2025-01-01"]
    X = lambda d: d[VARIABILI].to_numpy(dtype="float32")
    dtr = xgb.DMatrix(X(tr), label=tr["top3"], feature_names=VARIABILI)
    dva = xgb.DMatrix(X(va), label=va["top3"], feature_names=VARIABILI)
    par = dict(objective="binary:logistic", eval_metric="logloss", eta=0.05, max_depth=6,
               min_child_weight=50, subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
               tree_method="hist", nthread=2, seed=7)
    bst = xgb.train(par, dtr, 2000, evals=[(dva, "verifica")], early_stopping_rounds=60, verbose_eval=100)
    n_alberi = bst.best_iteration + 1
    print("alberi:", n_alberi, flush=True)
    # Riallena su allenamento + 2024 con lo stesso numero di alberi; il 2025-26 resta mai visto.
    trva = pd.concat([tr, va])
    bst = xgb.train(par, xgb.DMatrix(X(trva), label=trva["top3"], feature_names=VARIABILI), n_alberi)
    CARTELLA.mkdir(exist_ok=True)
    bst.save_model(str(FILE_MODELLO))

    # Il lettore senza XGBoost deve dare gli stessi numeri.
    lettore = Alberi(FILE_MODELLO)
    p_xgb = bst.predict(xgb.DMatrix(X(te), feature_names=VARIABILI))
    p_mio = lettore.probabilita(X(te))
    scarto = float(np.max(np.abs(p_xgb - p_mio)))
    print("scarto massimo fra XGBoost e il lettore:", scarto, flush=True)
    assert scarto < 1e-4, "il lettore degli alberi non coincide con XGBoost"

    y = te["top3"].to_numpy()
    gare = te["gara"].to_numpy()

    # Metodi semplici da battere.
    # 1) solo il numero di partenza (con il numero di partenti), misurato sul passato.
    base = trva.assign(pz=trva["partenza"].fillna(-1), cp=trva["partenti"].clip(upper=16).fillna(-1))
    tab = base.groupby(["pz", "cp"])["top3"].mean()
    k = te.assign(pz=te["partenza"].fillna(-1), cp=te["partenti"].clip(upper=16).fillna(-1))
    p_partenza = k.set_index(["pz", "cp"]).index.map(tab).to_numpy(dtype=float)
    p_partenza = np.where(np.isnan(p_partenza), trva["top3"].mean(), p_partenza)
    # 2) solo la forma: piazzamenti nelle ultime 5 corse (attenuata verso la media).
    m0 = trva["top3"].mean()
    n5 = te["h_n"].clip(upper=5).fillna(0)
    p_forma = ((te["h_ult5_top3"].fillna(m0) * n5 + m0 * 2) / (n5 + 2)).to_numpy()
    # 3) il metodo che il calendario usa oggi: il voto attuale del cavallo.
    #    Attenzione: e' avvantaggiato, perche' il voto di oggi conosce anche le
    #    corse del 2025-26 su cui lo stiamo provando.
    voti = pd.read_sql_query("SELECT name AS cavallo, score FROM horse_ratings WHERE rating_mode='performance'", conn)
    mappa = voti.drop_duplicates("cavallo").set_index("cavallo")["score"]
    sc = pd.to_numeric(te["cavallo"].map(mappa), errors="coerce").to_numpy(dtype=float)
    sc = np.where(np.isfinite(sc), sc, np.nanmedian(sc))
    e = np.exp(np.clip(sc, -100, 100) / 20)
    somma = pd.Series(e).groupby(pd.Series(gare), dropna=False).transform("sum").to_numpy()
    p_voto = np.clip(3 * e / somma, 1e-4, 0.99)

    ris = {
        "modello": _misure(y, p_mio, gare),
        "solo_partenza": _misure(y, p_partenza, gare),
        "solo_forma": _misure(y, p_forma, gare),
        "voto_attuale": _misure(y, p_voto, gare),
    }

    # Corse con il campo completo (tutti i partenti nell'archivio): li' si
    # puo' provare anche la versione normalizzata, che e' quella del calendario.
    cnt = te.groupby("gara")["cavallo"].transform("count")
    pieno = (cnt >= te["partenti"]).to_numpy()
    p_norm = normalizza_per_gara(p_mio[pieno], gare[pieno], te["partenti"].to_numpy()[pieno])
    ris["campo_completo"] = {
        "corse": int(pd.Series(gare[pieno]).nunique()),
        "modello": _misure(y[pieno], p_mio[pieno], gare[pieno]),
        "modello_normalizzato": _misure(y[pieno], p_norm, gare[pieno]),
        "solo_partenza": _misure(y[pieno], p_partenza[pieno], gare[pieno]),
        "voto_attuale": _misure(y[pieno], p_voto[pieno], gare[pieno]),
    }

    # Le percentuali sono credibili? Per fasce di stima, quanti arrivano davvero.
    fasce = []
    edges = [0, .1, .2, .3, .4, .5, .6, .7, 1.01]
    for a, b in zip(edges[:-1], edges[1:]):
        sel = (p_norm >= a) & (p_norm < b)
        if sel.sum() >= 50:
            fasce.append({"da": a, "a": min(b, 1), "n": int(sel.sum()),
                          "stimato": round(float(p_norm[sel].mean()), 3),
                          "reale": round(float(y[pieno][sel].mean()), 3)})
    ris["fasce"] = fasce

    imp = bst.get_score(importance_type="gain")
    tot = sum(imp.values()) or 1
    ris["peso_variabili"] = sorted(({"variabile": k, "peso": round(v / tot, 4)} for k, v in imp.items()),
                                   key=lambda r: -r["peso"])

    mod, sp, vo = ris["modello"], ris["solo_partenza"], ris["voto_attuale"]
    supera = (mod["log_loss"] < sp["log_loss"] and mod["auc"] > max(sp["auc"], vo["auc"], ris["solo_forma"]["auc"]))
    ris["supera_i_metodi_semplici"] = bool(supera)
    ris["periodo_prova"] = {"da": str(te["data"].min().date()), "a": str(te["data"].max().date()),
                            "partenze": int(len(te)), "corse": int(pd.Series(gare).nunique())}
    ris["periodo_allenamento"] = {"da": str(trva["data"].min().date()), "a": str(trva["data"].max().date()),
                                  "partenze": int(len(trva))}
    ris["alberi"] = int(n_alberi)
    ris["nome"] = NOME_MODELLO
    ris["allenato_il"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    FILE_VERIFICA.write_text(json.dumps(ris, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in ris.items() if k not in ("peso_variabili",)}, indent=2, ensure_ascii=False))


# ─────────────────────────────────────────────────────────────────────────────
#  Fase notturna: stime per le gare in calendario
# ─────────────────────────────────────────────────────────────────────────────

def _motivi(riga) -> list[dict]:
    """Due o tre ragioni in parole semplici: dove il cavallo sta sopra o sotto
    gli avversari della stessa corsa, per le voci che pesano di piu'."""
    out = []
    for var, (testo, verso) in SPIEGAZIONI.items():
        v = riga.get(var)
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        if var == "partenza":
            if v <= 3:
                out.append({"testo": f"parte col numero {int(v)}", "pro": True, "forza": 0.5})
            elif v >= 9:
                out.append({"testo": f"parte col numero {int(v)}", "pro": False, "forza": 0.5})
            continue
        if var == "h_giorni":
            if v > 120:
                out.append({"testo": f"fermo da {int(v)} giorni", "pro": False, "forza": 0.35})
            continue
        if var == "h_pista_top3":
            if (riga.get("h_pista_n") or 0) >= 3:
                if v >= 0.5:
                    out.append({"testo": "va bene su questa pista", "pro": True, "forza": 0.3})
                elif v <= 0.1:
                    out.append({"testo": "su questa pista finora non ha reso", "pro": False, "forza": 0.3})
            continue
        # Classifica nella corsa: 1 = il migliore del gruppo. Con meno di
        # quattro avversari noti "tra i migliori" non vuol dire niente.
        if (riga.get("_noti") or 0) < 4:
            continue
        if v >= 0.8:
            out.append({"testo": f"{testo} tra i migliori", "pro": True, "forza": v - 0.5})
        elif v <= 0.25:
            out.append({"testo": f"{testo} tra i peggiori", "pro": False, "forza": 0.5 - v})
    out.sort(key=lambda m: -m["forza"])
    return [{"testo": m["testo"], "pro": m["pro"]} for m in out[:3]]


def phase_pronostico_top3(conn: sqlite3.Connection) -> int:
    """Riscrive la tabella pronostico_top3 per le gare in calendario.
    Non deve mai far fallire il lavoro notturno: in caso di problemi lascia la
    tabella com'e' e lo dice."""
    try:
        import numpy as np  # noqa: F401
        import pandas as pd  # noqa: F401
    except ImportError:
        print("[PRONOSTICO] numpy/pandas non installati: salto", file=sys.stderr)
        return 0
    if not FILE_MODELLO.exists():
        print("[PRONOSTICO] modello non trovato: salto", file=sys.stderr)
        return 0
    try:
        verifica = json.loads(FILE_VERIFICA.read_text()) if FILE_VERIFICA.exists() else {}
        df = costruisci_variabili(conn, con_calendario=True)
        fut = df[df["futura"].astype(bool)].copy()
        # Quanti partenti della corsa hanno gia' corse in archivio: serve a
        # non dire "tra i migliori" quando il confronto e' con uno o due.
        fut["_noti"] = fut.groupby("gara")["h_n"].transform(lambda x: (x > 0).sum())
        conn.execute("""CREATE TABLE IF NOT EXISTS pronostico_top3 (
            track TEXT, race_date TEXT, race_time TEXT, horse_name TEXT,
            prob REAL, prob_grezza REAL, affidabile INTEGER, n_corse INTEGER,
            motivi TEXT, modello TEXT, verificato INTEGER, calcolato_il TEXT,
            PRIMARY KEY (track, race_date, race_time, horse_name))""")
        conn.execute("DELETE FROM pronostico_top3")
        if fut.empty:
            conn.commit()
            return 0
        lettore = Alberi(FILE_MODELLO)
        grezza = lettore.probabilita(fut[VARIABILI].to_numpy(dtype="float32"))
        prob = normalizza_per_gara(grezza, fut["gara"].to_numpy(), fut["partenti"].to_numpy())
        ora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        verificato = 1 if verifica.get("supera_i_metodi_semplici") else 0
        righe = []
        for (_, r), pg, pn in zip(fut.iterrows(), grezza, prob):
            d = r.to_dict()
            ncorse = int(d["h_n"]) if d["h_n"] == d["h_n"] else 0
            righe.append((d["pista"], d["data"].strftime("%Y-%m-%d"), str(d["numero"]), d["cavallo"],
                          round(float(pn), 4), round(float(pg), 4), 1 if ncorse >= 5 else 0, ncorse,
                          json.dumps(_motivi(d), ensure_ascii=False), NOME_MODELLO, verificato, ora))
        conn.executemany("INSERT OR REPLACE INTO pronostico_top3 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", righe)
        conn.commit()
        print(f"[PRONOSTICO] {len(righe)} stime per {fut['gara'].nunique()} corse", file=sys.stderr)
        return len(righe)
    except Exception as e:  # mai bloccare la notte per questo
        print(f"[PRONOSTICO] errore, salto: {e!r}", file=sys.stderr)
        try:
            conn.rollback()
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    if "--allena" in sys.argv:
        allena()
    else:
        conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
        print(phase_pronostico_top3(conn))
