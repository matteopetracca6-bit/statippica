"""
confronto_quote.py — Il pronostico dei primi tre confrontato con il mercato.

COSA FA
  Per le corse del periodo di prova (dal 1/1/2025, mai viste dal modello)
  mette accanto, per ogni cavallo:
    - la nostra probabilita' di arrivare nei primi tre, calcolata la sera
      prima con i soli dati del passato;
    - la probabilita' "del mercato", ricavata dalla quota finale vincente del
      totalizzatore (tabella quote_totalizzatore).
  e misura chi dei due sceglie meglio i primi tre. Poi guarda le corse in cui
  i due non sono d'accordo: chi aveva ragione?

  E' un'analisi della qualita' del pronostico, non un consiglio di gioco.

DALLA QUOTA ALLA PROBABILITA'
  Quota 4,00 vuol dire che 1 euro giocato vincente ne paga 4: il pubblico
  stima circa 1/4 = 25% di vittoria. Le probabilita' cosi' ottenute sommano a
  piu' di 1, perche' il totalizzatore trattiene una parte delle giocate
  (circa un quarto): si riportano a 1 dentro ogni corsa. I cavalli accoppiati
  hanno la stessa quota, che vale per la coppia: la si divide fra i due.
  Dalla probabilita' di vincere si passa a quella dei primi tre con la regola
  di Harville: se vince A, il secondo si sceglie fra gli altri con le stesse
  proporzioni, e cosi' il terzo.

ATTENZIONE, IL MERCATO E' AVVANTAGGIATO
  La quota finale si forma fino alla partenza: conosce ritirati, ferratura,
  riscaldamento, voci di scuderia. Il nostro pronostico e' fatto la sera
  prima. Un confronto alla pari non e' possibile con i dati pubblici.

USO
  DB_PATH=data.db python3 scripts/confronto_quote.py
  scrive modelli/confronto_quote.json
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))

FILE_USCITA = RADICE / "modelli" / "confronto_quote.json"


def harville_top3(p):
    """Probabilita' di arrivare nei primi tre, dalle probabilita' di vittoria."""
    import numpy as np
    p = np.asarray(p, dtype=float)
    n = len(p)
    if n <= 3:
        return np.ones(n)
    out = p.copy()
    for j in range(n):
        if p[j] >= 1:
            continue
        # j primo, i secondo
        q2 = p / (1 - p[j])
        q2[j] = 0
        out += p[j] * q2
        for k in range(n):
            if k == j or p[j] + p[k] >= 1:
                continue
            q3 = p / (1 - p[j] - p[k])
            q3[j] = 0
            q3[k] = 0
            out += p[j] * q2[k] * q3
    return np.clip(out, 0, 1)


def probabilita_mercato(gruppo):
    """Probabilita' di vittoria e dei primi tre per i cavalli di una corsa."""
    import numpy as np
    q = gruppo["quota"].to_numpy(dtype=float)
    imp = 1.0 / q
    # Accoppiati: stessa quota e segnati come scuderia -> la quota e' della coppia.
    acc = gruppo["accoppiato"].fillna(0).to_numpy() == 1
    if acc.any():
        chiave = np.round(q, 2)
        for v in np.unique(chiave[acc]):
            m = acc & (chiave == v)
            if m.sum() > 1:
                imp[m] = imp[m] / m.sum()
    margine = imp.sum()
    p = imp / margine
    return p, harville_top3(p), margine


def _misure(y, p, gare):
    import numpy as np
    import pandas as pd
    from sklearn.metrics import roc_auc_score, log_loss, brier_score_loss
    p = np.clip(np.asarray(p, dtype=float), 1e-4, 1 - 1e-4)
    d = pd.DataFrame({"y": y, "p": p, "g": gare})
    d["rk"] = d.groupby("g")["p"].rank(ascending=False, method="first")
    return {
        "auc": round(float(roc_auc_score(y, p)), 4),
        "log_loss": round(float(log_loss(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "tre_scelti_a_segno": round(float(d.loc[d["rk"] <= 3, "y"].mean()), 4),
        "primo_scelto_nei_tre": round(float(d.loc[d["rk"] == 1, "y"].mean()), 4),
    }


def _numero_corsa(numero) -> int | None:
    s = str(numero)
    m = re.search(r"_R(\d+)$", s)
    if m:
        return int(m.group(1))
    try:
        return int(float(s))
    except ValueError:
        return None


def prepara(conn, previsioni=None):
    """Unisce le previsioni del periodo di prova alle quote.

    `previsioni`: tabella con cavallo, data, pista, numero, gara, top3, p
    (la nostra probabilita' non normalizzata). Se manca si calcola con il
    modello salvato.
    """
    import numpy as np
    import pandas as pd
    import pronostico_top3 as pt

    if previsioni is None:
        df = pt.costruisci_variabili(conn)
        te = df[df["top3"].notna() & (df["data"] >= "2025-01-01")].copy()
        lettore = pt.Alberi(pt.FILE_MODELLO)
        te["p"] = lettore.probabilita(te[lettore.variabili].to_numpy(dtype="float32"))
        previsioni = te
    te = previsioni[["cavallo", "data", "pista", "numero", "gara", "top3", "vitt", "p",
                     "partenti", "_campo_noto"]].copy()
    te["corsa"] = te["numero"].map(_numero_corsa)
    te["data_s"] = pd.to_datetime(te["data"]).dt.strftime("%Y-%m-%d")

    q = pd.read_sql_query("""SELECT race_date AS data_s, pista, corsa, horse_name AS cavallo,
                                    quota, accoppiato, arrivo FROM quote_totalizzatore""", conn)
    x = te.merge(q, on=["data_s", "pista", "corsa", "cavallo"], how="inner")
    # Solo corse in cui conosciamo la quota di TUTTI i partenti che abbiamo, e
    # in cui abbiamo tutti i partenti: altrimenti le probabilita' del mercato,
    # riportate a 1, sarebbero gonfiate.
    n_te = te.groupby("gara")["cavallo"].transform("count")
    te_pieno = te.assign(n_te=n_te)
    x = x.merge(te_pieno[["gara", "cavallo", "n_te"]], on=["gara", "cavallo"])
    x["n_quota"] = x.groupby("gara")["quota"].transform(lambda s: s.notna().sum())
    x = x[(x["n_quota"] == x["n_te"]) & (x["n_te"] >= 4)
          & x["_campo_noto"].astype(bool) & (x["n_te"] >= x["partenti"])]
    righe = []
    for g, gr in x.groupby("gara", sort=False):
        pv, p3, marg = probabilita_mercato(gr)
        righe.append(pd.DataFrame({"gara": g, "cavallo": gr["cavallo"].to_numpy(),
                                   "m_vitt": pv, "m_top3": p3, "margine": marg}))
    m = pd.concat(righe, ignore_index=True)
    x = x.merge(m, on=["gara", "cavallo"])
    # La nostra stima normalizzata per corsa, come nel calendario.
    x["noi"] = pt.normalizza_per_gara(x["p"].to_numpy(), x["gara"].to_numpy(), x["partenti"].to_numpy())
    return x


def analisi(x) -> dict:
    import numpy as np
    import pandas as pd
    from sklearn.linear_model import LogisticRegression

    y = x["top3"].to_numpy()
    gare = x["gara"].to_numpy()
    ris = {
        "periodo": {"da": str(pd.to_datetime(x["data"]).min().date()),
                    "a": str(pd.to_datetime(x["data"]).max().date()),
                    "corse": int(x["gara"].nunique()), "partenze": int(len(x))},
        "trattenuta_media": round(float(1 - 1 / x.groupby("gara")["margine"].first().mean()), 3),
        "noi": _misure(y, x["noi"], gare),
        "mercato": _misure(y, x["m_top3"], gare),
        "a_caso": round(float(x.groupby("gara").apply(lambda g: min(3, len(g)) / len(g)).mean()), 4),
    }

    # Insieme: il nostro pronostico aggiunge qualcosa a quello che il mercato
    # sa gia'? Si allena sul 2025 e si prova sul 2026.
    def lo(p):
        p = np.clip(p, 1e-4, 1 - 1e-4)
        return np.log(p / (1 - p))
    X = np.c_[lo(x["m_top3"]), lo(x["noi"])]
    prima = (pd.to_datetime(x["data"]) < "2026-01-01").to_numpy()
    if prima.sum() > 1000 and (~prima).sum() > 1000:
        solo_m = LogisticRegression().fit(X[prima, :1], y[prima])
        solo_n = LogisticRegression().fit(X[prima, 1:], y[prima])
        tutti = LogisticRegression().fit(X[prima], y[prima])
        pm = solo_m.predict_proba(X[~prima, :1])[:, 1]
        pn = solo_n.predict_proba(X[~prima, 1:])[:, 1]
        pi = tutti.predict_proba(X[~prima])[:, 1]
        # Ognuno ricalibrato allo stesso modo sul 2025, cosi' il confronto delle
        # percentuali e' alla pari (la regola di Harville gonfia i favoriti).
        ris["insieme"] = {
            "allenato_su": "2025", "provato_su": "2026",
            "corse_prova": int(pd.Series(gare[~prima]).nunique()),
            "solo_noi": _misure(y[~prima], pn, gare[~prima]),
            "solo_mercato": _misure(y[~prima], pm, gare[~prima]),
            "mercato_piu_noi": _misure(y[~prima], pi, gare[~prima]),
            "peso_mercato": round(float(tutti.coef_[0][0]), 3),
            "peso_noi": round(float(tutti.coef_[0][1]), 3),
        }

    # Disaccordi: il nostro favorito non e' fra i primi tre del mercato.
    x = x.copy()
    x["rk_noi"] = x.groupby("gara")["noi"].rank(ascending=False, method="first")
    x["rk_m"] = x.groupby("gara")["m_top3"].rank(ascending=False, method="first")
    dis = x[(x["rk_noi"] <= 3) & (x["rk_m"] > 3)]
    acc = x[(x["rk_noi"] <= 3) & (x["rk_m"] <= 3)]
    solo_m = x[(x["rk_m"] <= 3) & (x["rk_noi"] > 3)]
    ris["accordo"] = {
        "favoriti_in_comune": round(float(len(acc) / max(1, (x["rk_noi"] <= 3).sum())), 3),
        "in_comune": {"n": int(len(acc)), "nei_tre": round(float(acc["top3"].mean()), 3)},
        "solo_nostri": {"n": int(len(dis)), "nei_tre": round(float(dis["top3"].mean()), 3),
                        "stima_noi": round(float(dis["noi"].mean()), 3),
                        "stima_mercato": round(float(dis["m_top3"].mean()), 3)},
        "solo_del_mercato": {"n": int(len(solo_m)), "nei_tre": round(float(solo_m["top3"].mean()), 3),
                             "stima_noi": round(float(solo_m["noi"].mean()), 3),
                             "stima_mercato": round(float(solo_m["m_top3"].mean()), 3)},
    }

    # Dove la nostra stima e' molto piu' alta (o bassa) di quella del mercato:
    # com'e' andata davvero?
    x["diff"] = x["noi"] - x["m_top3"]
    fasce = []
    for a, b, nome in ((-1, -0.2, "noi molto sotto il mercato"), (-0.2, -0.1, "noi sotto"),
                       (-0.1, 0.1, "d'accordo (meno di 10 punti)"), (0.1, 0.2, "noi sopra"),
                       (0.2, 1.01, "noi molto sopra il mercato")):
        s = x[(x["diff"] >= a) & (x["diff"] < b)]
        if len(s) >= 30:
            fasce.append({"fascia": nome, "n": int(len(s)), "stima_noi": round(float(s["noi"].mean()), 3),
                          "stima_mercato": round(float(s["m_top3"].mean()), 3),
                          "reale": round(float(s["top3"].mean()), 3)})
    ris["disaccordo"] = fasce

    # Calibrazione delle due stime, per fasce.
    def cal(col):
        out = []
        edges = [0, .1, .2, .3, .4, .5, .6, .7, .8, 1.01]
        for a, b in zip(edges[:-1], edges[1:]):
            s = x[(x[col] >= a) & (x[col] < b)]
            if len(s) >= 50:
                out.append({"da": a, "a": min(b, 1), "n": int(len(s)),
                            "stimato": round(float(s[col].mean()), 3), "reale": round(float(s["top3"].mean()), 3)})
        return out
    ris["calibrazione"] = {"noi": cal("noi"), "mercato": cal("m_top3")}

    # Per mese, per vedere che il risultato non dipende da un periodo.
    x["mese"] = pd.to_datetime(x["data"]).dt.strftime("%Y-%m")
    mesi = []
    for mese, s in x.groupby("mese"):
        mesi.append({"mese": mese, "corse": int(s["gara"].nunique()),
                     "noi": round(float(s.loc[s["rk_noi"] <= 3, "top3"].mean()), 3),
                     "mercato": round(float(s.loc[s["rk_m"] <= 3, "top3"].mean()), 3)})
    ris["per_mese"] = mesi
    return ris


def main():
    import pronostico_top3 as pt
    conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    x = prepara(conn)
    ris = analisi(x)
    ris["modello"] = pt.NOME_MODELLO
    ris["calcolato_il"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ris["fonte_quote"] = "Hippoweb, archivio risultati di trotto: quota finale vincente del totalizzatore"
    FILE_USCITA.write_text(json.dumps(ris, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in ris.items() if k not in ("calibrazione", "per_mese")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
