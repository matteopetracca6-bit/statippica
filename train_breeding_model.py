#!/usr/bin/env python3
"""
train_breeding_model.py — StatIppica
Addestra il modello di stima accoppiamenti (stallone x fattrice -> qualità
attesa del puledro) e lo esporta come JSON leggibile dal server Node.

COME FUNZIONA
- Dataset: ogni cavallo nel DB con rating noto E con padre e madre che hanno
  a loro volta un rating è un "esempio di accoppiamento già avvenuto":
  features = statistiche di padre/madre (+ nonni), target = com'è venuto il figlio.
- Due modelli Gradient Boosting (stessa famiglia di XGBoost):
    1. REGRESSORE  -> score atteso del puledro (0-100)
    2. CLASSIFICATORE binario -> probabilità di puledro "scarso" (voto D/E/F)
- Export: alberi serializzati in JSON (breeding_model.json nella root del repo).
  Il server Node fa inferenza camminando gli alberi — nessuna dipendenza Python
  a runtime.
- ROI: si esporta anche la mappa voto->guadagni medi storici osservati nel DB,
  che il server usa per stimare guadagni attesi e ROI rispetto al prezzo di monta.

FEATURES (come richiesto: tempi/earnings/risultati di stallone e fattrice,
tempo del padre della fattrice e del padre dello stallone):
  s_time, s_earn, s_win, s_score, s_races   (stallone)
  m_time, m_earn, m_win, m_score, m_races   (fattrice)
  ds_time  (dam-sire: padre della fattrice)
  ss_time  (sire-sire: padre dello stallone)

NOTA ONESTA sul "70-30": Gradient Boosting impara i pesi dai dati — non si
impone a priori la ripartizione 70/30 tra stallone e fattrice. Lo script
STAMPA le feature importances apprese, così puoi verificare se i dati
confermano quella proporzione. Se vorrai forzarla, si può fare in un secondo
momento (es. pesando le feature), ma partirei da ciò che i dati dicono.

Uso:
  python3 train_breeding_model.py                 # addestra e salva breeding_model.json
  python3 train_breeding_model.py --db test.db    # usa un DB diverso
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
from sklearn.model_selection import cross_val_score

DB_PATH = Path(os.environ.get("DB_PATH", "data.db"))
MODEL_PATH = Path(os.environ.get("BREEDING_MODEL_PATH", "breeding_model.json"))

POOR_GRADES = {"D", "E", "F"}

FEATURES = [
    "s_time", "s_earn", "s_win", "s_score", "s_races",
    "m_time", "m_earn", "m_win", "m_score", "m_races",
    "ds_time", "ss_time",
]


def build_dataset(conn: sqlite3.Connection):
    """Costruisce il dataset dagli accoppiamenti storici: figli con rating noto
    i cui padre e madre hanno anch'essi un rating nel DB."""
    rows = conn.execute("""
        SELECT
            f.name, f.grade, f.score,
            s.time_percentile  AS s_time,  s.earn_percentile AS s_earn,
            s.win_rate         AS s_win,   s.score           AS s_score,
            s.career_races     AS s_races,
            m.time_percentile  AS m_time,  m.earn_percentile AS m_earn,
            m.win_rate         AS m_win,   m.score           AS m_score,
            m.career_races     AS m_races,
            ds.time_percentile AS ds_time,
            ss.time_percentile AS ss_time
        FROM horse_ratings f
        JOIN horses h                ON h.name = f.name
        JOIN horse_ratings s         ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire))
                                     AND s.rating_mode = 'performance'
        JOIN horse_ratings m         ON UPPER(TRIM(m.name)) = UPPER(TRIM(h.dam))
                                     AND m.rating_mode = 'performance'
        LEFT JOIN horses hm          ON hm.name = h.dam
        LEFT JOIN horse_ratings ds   ON UPPER(TRIM(ds.name)) = UPPER(TRIM(hm.sire))
                                     AND ds.rating_mode = 'performance'
        LEFT JOIN horses hs          ON hs.name = h.sire
        LEFT JOIN horse_ratings ss   ON UPPER(TRIM(ss.name)) = UPPER(TRIM(hs.sire))
                                     AND ss.rating_mode = 'performance'
        WHERE f.rating_mode = 'performance'
          AND f.score IS NOT NULL AND f.grade IS NOT NULL
    """).fetchall()

    if not rows:
        return None, None, None, None

    X, y_score, y_poor = [], [], []
    medians = {}

    raw = []
    for r in rows:
        d = dict(r)
        raw.append(d)

    # Mediane per riempire i buchi (nonni spesso mancanti)
    for feat in FEATURES:
        vals = [d[feat] for d in raw if d[feat] is not None]
        medians[feat] = float(np.median(vals)) if vals else 0.0

    for d in raw:
        X.append([d[f] if d[f] is not None else medians[f] for f in FEATURES])
        y_score.append(d["score"])
        y_poor.append(1 if d["grade"] in POOR_GRADES else 0)

    return np.array(X), np.array(y_score), np.array(y_poor), medians


def grade_earnings_map(conn: sqlite3.Connection) -> dict:
    """Mappa voto -> guadagni carriera medi osservati (per stimare ROI)."""
    rows = conn.execute("""
        SELECT grade, AVG(career_earnings) AS avg_earn, COUNT(*) AS n
        FROM horse_ratings
        WHERE rating_mode='performance' AND career_earnings IS NOT NULL
        GROUP BY grade
    """).fetchall()
    return {r[0]: {"avg_earnings": round(r[1] or 0, 2), "n": r[2]} for r in rows}


def export_tree(tree) -> dict:
    """Serializza un albero sklearn in un dict annidato camminabile da JS."""
    t = tree.tree_

    def node(i: int):
        if t.children_left[i] == -1:  # foglia
            return {"leaf": float(t.value[i][0][0])}
        return {
            "f": int(t.feature[i]),
            "th": float(t.threshold[i]),
            "l": node(t.children_left[i]),
            "r": node(t.children_right[i]),
        }
    return node(0)


def export_gb_model(model, kind: str) -> dict:
    """Serializza un GradientBoosting sklearn (regressore o classificatore
    binario) in JSON: previsione = init + learning_rate * somma(alberi)."""
    if kind == "regressor":
        init = float(model.init_.constant_[0][0])
    else:  # classificatore binario: init in log-odds
        p = model.init_.class_prior_[1]
        init = float(np.log(p / (1 - p)))
    return {
        "kind": kind,
        "init": init,
        "learning_rate": model.learning_rate,
        "trees": [export_tree(est[0]) for est in model.estimators_],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DB_PATH))
    parser.add_argument("--out", default=str(MODEL_PATH))
    args = parser.parse_args()

    print(f"[TRAIN] DB: {args.db}", file=sys.stderr)
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    X, y_score, y_poor, medians = build_dataset(conn)
    if X is None or len(X) < 100:
        print(f"[TRAIN] ERRORE: dataset troppo piccolo ({0 if X is None else len(X)} "
              f"accoppiamenti con dati completi). Servono più cavalli con padre e "
              f"madre entrambi dotati di rating.", file=sys.stderr)
        sys.exit(1)

    print(f"[TRAIN] Dataset: {len(X)} accoppiamenti storici, "
          f"{int(y_poor.sum())} con figlio 'scarso' (D/E/F) = "
          f"{y_poor.mean()*100:.1f}%", file=sys.stderr)

    # ── Modello 1: score atteso del puledro
    reg = GradientBoostingRegressor(n_estimators=150, max_depth=3,
                                     learning_rate=0.08, random_state=42)
    cv_r2 = cross_val_score(reg, X, y_score, cv=5, scoring="r2")
    reg.fit(X, y_score)
    print(f"[TRAIN] Regressore score — R2 cross-val: "
          f"{cv_r2.mean():.3f} (+/- {cv_r2.std():.3f})", file=sys.stderr)

    # ── Modello 2: probabilità di puledro scarso (D/E/F)
    clf = GradientBoostingClassifier(n_estimators=150, max_depth=3,
                                      learning_rate=0.08, random_state=42)
    cv_auc = cross_val_score(clf, X, y_poor, cv=5, scoring="roc_auc")
    clf.fit(X, y_poor)
    print(f"[TRAIN] Classificatore D/E/F — AUC cross-val: "
          f"{cv_auc.mean():.3f} (+/- {cv_auc.std():.3f})", file=sys.stderr)

    # ── Feature importances: verifica empirica del "70/30" stallone/fattrice
    imp = reg.feature_importances_
    s_imp = sum(imp[i] for i, f in enumerate(FEATURES) if f.startswith("s_") or f == "ss_time")
    m_imp = sum(imp[i] for i, f in enumerate(FEATURES) if f.startswith("m_") or f == "ds_time")
    tot = s_imp + m_imp
    print(f"[TRAIN] Importanza appresa dai dati — lato stallone: {s_imp/tot*100:.0f}%, "
          f"lato fattrice: {m_imp/tot*100:.0f}% "
          f"(attesa dalla letteratura: ~70/30)", file=sys.stderr)
    for f, v in sorted(zip(FEATURES, imp), key=lambda x: -x[1]):
        print(f"    {f}: {v:.3f}", file=sys.stderr)

    payload = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "n_samples": int(len(X)),
        "features": FEATURES,
        "medians": medians,
        "cv_r2_score": round(float(cv_r2.mean()), 4),
        "cv_auc_poor": round(float(cv_auc.mean()), 4),
        "feature_importances": {f: round(float(v), 4) for f, v in zip(FEATURES, imp)},
        "score_model": export_gb_model(reg, "regressor"),
        "poor_model": export_gb_model(clf, "classifier"),
        "grade_earnings": grade_earnings_map(conn),
        # Soglie voto (stesse di nightly_update.py) per mappare score->voto lato server
        "grade_thresholds": [[97, "SSS"], [90, "SS"], [80, "S"], [65, "A"],
                              [50, "B"], [35, "C"], [20, "D"], [10, "E"], [0, "F"]],
    }
    conn.close()

    Path(args.out).write_text(json.dumps(payload))
    size_kb = Path(args.out).stat().st_size / 1024
    print(f"[TRAIN] Modello salvato in {args.out} ({size_kb:.0f} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
