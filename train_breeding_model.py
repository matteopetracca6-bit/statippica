#!/usr/bin/env python3
"""
train_breeding_model.py — StatIppica (v2, validazione onesta)
Addestra il modello di stima accoppiamenti (stallone x fattrice -> qualità
attesa del puledro) e lo esporta come JSON leggibile dal server Node.

COSA CAMBIA RISPETTO ALLA v1
La v1 valutava il modello con una cross-validation casuale a 5 fold. È una
misura ottimistica e inadatta a questo dominio, per tre motivi:

1. FAMIGLIE. I figli dello stesso stallone finivano sia in train sia in
   validation: il modello poteva "riconoscere la famiglia" invece di imparare
   una regola di accoppiamento. Qui si usa GroupKFold raggruppando per
   stallone, così una famiglia sta interamente dentro o fuori dal training.
2. TEMPO. In uso reale si predice il valore di un puledro non ancora nato,
   quindi si addestra sul passato e si verifica sul futuro. Qui si aggiunge un
   holdout temporale per anno di nascita del figlio.
3. QUALITA' DEL TARGET. Lo score di un figlio con 2-3 corse è quasi rumore.
   Si filtra sul numero minimo di corse del figlio (MIN_CHILD_RACES).

Si calcolano inoltre le BASELINE (media del target e media dei due genitori):
un modello che non batte la media non va usato come supporto decisionale, e il
gate di validazione lo dichiara esplicitamente.

METRICHE
- regressione: MAE, RMSE, R2 out-of-fold per gruppi + holdout temporale
- classificazione "puledro scarso" (D/E/F): AUC, PR-AUC (con prevalenza di
  riferimento) e Brier score, che misura anche la calibrazione

FEATURES
  s_time, s_earn, s_win, s_score, s_races   (stallone)
  m_time, m_earn, m_win, m_score, m_races   (fattrice)
  ds_time  (padre della fattrice), ss_time  (padre dello stallone)

Uso:
  python3 train_breeding_model.py
  python3 train_breeding_model.py --db test.db --min-child-races 10
  python3 train_breeding_model.py --report breeding_eval_report.json
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
)

DB_PATH = Path(os.environ.get("DB_PATH", "data.db"))
MODEL_PATH = Path(os.environ.get("BREEDING_MODEL_PATH", "breeding_model.json"))
REPORT_PATH = Path(os.environ.get("BREEDING_REPORT_PATH", "breeding_eval_report.json"))

POOR_GRADES = {"D", "E", "F"}

# Numero minimo di corse del figlio perché il suo score sia un target sensato.
MIN_CHILD_RACES = int(os.environ.get("MIN_CHILD_RACES", "10"))
# Anno di nascita del figlio: fino a questo anno = train, dopo = test temporale.
TEMPORAL_SPLIT_YEAR = int(os.environ.get("TEMPORAL_SPLIT_YEAR", "2021"))
# Copertura minima di una feature: sotto questa soglia la feature sarebbe quasi
# sempre rimpiazzata dalla mediana, quindi viene scartata e documentata.
MIN_FEATURE_COVERAGE = float(os.environ.get("MIN_FEATURE_COVERAGE", "0.05"))

FEATURES = [
    "s_time", "s_earn", "s_win", "s_score", "s_races",
    "m_time", "m_earn", "m_win", "m_score", "m_races",
    "ds_time", "ss_time",
]

# ── Criteri minimi di validazione ────────────────────────────
# Le soglie si applicano alle metriche out-of-fold per GRUPPI FAMILIARI, non
# alla cross-validation casuale: è la misura più vicina all'uso reale.
MIN_R2_DECISION = 0.20
MIN_AUC_DECISION = 0.65
MIN_SAMPLES_DECISION = 500
MIN_R2_EXPERIMENTAL = 0.0
MIN_AUC_EXPERIMENTAL = 0.55

METHODOLOGY_NOTICE = (
    "Validazione out-of-fold con GroupKFold per stallone (nessuna famiglia "
    "condivisa fra train e validation) piu' holdout temporale per anno di "
    "nascita del figlio. Gli output non sono supporto decisionale finche' "
    "validation_status non e' 'decision_support_ready'."
)


def validation_status(cv_r2: float, cv_auc: float, n_samples: int) -> dict:
    """Classifica lo stato del modello secondo criteri espliciti."""
    if (cv_r2 >= MIN_R2_DECISION and cv_auc >= MIN_AUC_DECISION
            and n_samples >= MIN_SAMPLES_DECISION):
        status = "decision_support_ready"
    elif cv_r2 >= MIN_R2_EXPERIMENTAL or cv_auc >= MIN_AUC_EXPERIMENTAL:
        status = "experimental"
    else:
        status = "not_ready"
    return {
        "validation_status": status,
        "is_decision_support_ready": status == "decision_support_ready",
        "validation_criteria": {
            "min_r2_decision": MIN_R2_DECISION,
            "min_auc_decision": MIN_AUC_DECISION,
            "min_samples_decision": MIN_SAMPLES_DECISION,
            "min_r2_experimental": MIN_R2_EXPERIMENTAL,
            "min_auc_experimental": MIN_AUC_EXPERIMENTAL,
            "cv_scheme": "GroupKFold(5) per stallone + holdout temporale",
        },
        "methodology_notice": METHODOLOGY_NOTICE,
    }


def build_dataset(conn: sqlite3.Connection, min_child_races: int):
    """Accoppiamenti storici: figli con rating noto i cui padre e madre hanno
    anch'essi un rating 'performance'. Restituisce anche il gruppo familiare
    (stallone) e l'anno di nascita del figlio, necessari per la validazione.

    Nota sulle chiavi: in questo database `horses.name` è PRIMARY KEY e
    `horse_ratings` ha un indice unico su (name, birth_year, rating_mode);
    l'audit non ha trovato omonimi, quindi il join per nome normalizzato è
    attualmente univoco. Se in futuro comparissero omonimi, questi join
    andranno portati sulla chiave composta (name, birth_year).
    """
    rows = conn.execute("""
        SELECT
            f.name, f.birth_year, f.grade, f.score,
            f.career_races AS f_races,
            h.sire AS family_sire,
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

    raw_all = [dict(r) for r in rows]
    raw = [d for d in raw_all if (d["f_races"] or 0) >= min_child_races]
    if not raw:
        return None

    medians = {}
    for feat in FEATURES:
        vals = [d[feat] for d in raw if d[feat] is not None]
        medians[feat] = float(np.median(vals)) if vals else 0.0

    X = np.array([[d[f] if d[f] is not None else medians[f] for f in FEATURES] for d in raw])
    y_score = np.array([d["score"] for d in raw], dtype=float)
    y_poor = np.array([1 if d["grade"] in POOR_GRADES else 0 for d in raw])
    groups = np.array([(d["family_sire"] or f"__solo_{i}") for i, d in enumerate(raw)])
    years = np.array([d["birth_year"] or 0 for d in raw])

    coverage = {
        f: round(sum(1 for d in raw if d[f] is not None) / len(raw), 3) for f in FEATURES
    }
    # Feature quasi sempre assenti (es. tempi dei nonni non ancora popolati)
    # vengono scartate: riempirle con la mediana aggiunge solo rumore.
    used = [f for f in FEATURES if coverage[f] >= MIN_FEATURE_COVERAGE]
    dropped = [f for f in FEATURES if f not in used]
    if not used:
        return None
    keep_idx = [FEATURES.index(f) for f in used]
    X = X[:, keep_idx]
    return {
        "X": X, "y_score": y_score, "y_poor": y_poor, "groups": groups,
        "years": years, "medians": {f: medians[f] for f in used},
        "coverage": coverage, "features": used, "dropped_features": dropped,
        "n_before_filter": len(raw_all), "n": len(raw),
    }


def regression_metrics(y, pred) -> dict:
    return {
        "mae": round(float(mean_absolute_error(y, pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y, pred))), 3),
        "r2": round(float(r2_score(y, pred)), 4),
    }


def evaluate(ds: dict) -> dict:
    """Baseline, out-of-fold per famiglia e holdout temporale."""
    X, y, y_poor = ds["X"], ds["y_score"], ds["y_poor"]
    groups, years = ds["groups"], ds["years"]
    n_groups = len(set(groups))
    n_splits = max(2, min(5, n_groups))
    cv = GroupKFold(n_splits=n_splits)

    report = {
        "n_samples": int(ds["n"]),
        "n_samples_before_target_filter": int(ds["n_before_filter"]),
        "n_family_groups": int(n_groups),
        "poor_prevalence": round(float(y_poor.mean()), 3),
        "feature_coverage": ds["coverage"],
        "features_used": ds["features"],
        "dropped_features_low_coverage": ds["dropped_features"],
        "baselines": {
            "target_mean": regression_metrics(y, np.full_like(y, y.mean())),
        },
    }

    # Baseline "media dei genitori": utile anche come test di scala del target.
    feats = ds["features"]
    s_score = X[:, feats.index("s_score")]
    m_score = X[:, feats.index("m_score")]
    report["baselines"]["mid_parent_score"] = regression_metrics(y, (s_score + m_score) / 2)

    # ── Regressione: out-of-fold per gruppi familiari
    candidates = {
        "gb_150_d3": GradientBoostingRegressor(n_estimators=150, max_depth=3,
                                               learning_rate=0.08, random_state=42),
        "gb_60_d2": GradientBoostingRegressor(n_estimators=60, max_depth=2,
                                              learning_rate=0.05, random_state=42),
        "ridge_a10": Ridge(alpha=10.0),
    }
    report["regression_oof_by_family"] = {}
    for name, mdl in candidates.items():
        pred = cross_val_predict(mdl, X, y, cv=cv, groups=groups)
        report["regression_oof_by_family"][name] = regression_metrics(y, pred)

    # ── Regressione: holdout temporale
    tr = np.where(years <= TEMPORAL_SPLIT_YEAR)[0]
    te = np.where(years > TEMPORAL_SPLIT_YEAR)[0]
    if len(tr) >= 50 and len(te) >= 20:
        mdl = GradientBoostingRegressor(n_estimators=150, max_depth=3,
                                        learning_rate=0.08, random_state=42)
        mdl.fit(X[tr], y[tr])
        report["regression_temporal_holdout"] = {
            "split_year": TEMPORAL_SPLIT_YEAR,
            "n_train": int(len(tr)), "n_test": int(len(te)),
            **regression_metrics(y[te], mdl.predict(X[te])),
        }
    else:
        report["regression_temporal_holdout"] = {
            "skipped": True,
            "reason": f"train={len(tr)} test={len(te)}: campioni insufficienti",
        }

    # ── Classificazione "puledro scarso" (D/E/F): out-of-fold per famiglia
    clf = GradientBoostingClassifier(n_estimators=150, max_depth=3,
                                     learning_rate=0.08, random_state=42)
    if 0 < y_poor.mean() < 1:
        proba = cross_val_predict(clf, X, y_poor, cv=cv, groups=groups,
                                  method="predict_proba")[:, 1]
        report["classification_oof_by_family"] = {
            "auc": round(float(roc_auc_score(y_poor, proba)), 4),
            "pr_auc": round(float(average_precision_score(y_poor, proba)), 4),
            "pr_auc_baseline_prevalence": round(float(y_poor.mean()), 4),
            "brier": round(float(brier_score_loss(y_poor, proba)), 4),
        }
    else:
        report["classification_oof_by_family"] = {"skipped": True, "reason": "classe unica"}

    return report


def grade_earnings_map(conn: sqlite3.Connection) -> dict:
    """Mappa voto -> guadagni carriera medi osservati. È un PROXY DESCRITTIVO
    della popolazione storica, non una previsione economica individuale."""
    rows = conn.execute("""
        SELECT grade, AVG(career_earnings) AS avg_earn, COUNT(*) AS n
        FROM horse_ratings
        WHERE rating_mode='performance' AND career_earnings IS NOT NULL
        GROUP BY grade
    """).fetchall()
    return {r[0]: {"avg_earnings": round(r[1] or 0, 2), "n": r[2]} for r in rows}


# Percentili per le soglie di voto (identici a nightly_update.py):
#   SSS = top 1%,  SS = top 5%,  S = top 10%, A = top 25%,
#   B   = top 40%, C  = top 60%, D = top 75%, E = top 90%, F = resto
_GRADE_PERCENTILES = [
    (99, "SSS"), (95, "SS"), (90, "S"), (75, "A"),
    (60, "B"),   (40, "C"),  (25, "D"), (10, "E"),
]

def compute_grade_thresholds(conn: sqlite3.Connection) -> list[list]:
    """Calcola le soglie dinamiche sui percentili del dataset reale,
    per mappare score->voto lato server (stessa logica di nightly_update.py)."""
    scores = [r[0] for r in conn.execute(
        "SELECT score FROM horse_ratings WHERE rating_mode='performance' AND score IS NOT NULL"
    ).fetchall()]
    if not scores:
        return [[0, "F"]]
    s = sorted(scores)
    n = len(s)
    def pv(p): return s[min(int(p / 100 * n), n - 1)]
    return [[round(float(pv(p)), 2), g] for p, g in _GRADE_PERCENTILES] + [[0, "F"]]


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
    parser.add_argument("--report", default=str(REPORT_PATH))
    parser.add_argument("--min-child-races", type=int, default=MIN_CHILD_RACES)
    args = parser.parse_args()

    print(f"[TRAIN] DB: {args.db}", file=sys.stderr)
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    ds = build_dataset(conn, args.min_child_races)
    if ds is None or ds["n"] < 100:
        n = 0 if ds is None else ds["n"]
        print(f"[TRAIN] ERRORE: dataset troppo piccolo ({n} accoppiamenti con "
              f"figlio di almeno {args.min_child_races} corse). Servono più "
              f"cavalli con padre e madre entrambi dotati di rating.", file=sys.stderr)
        sys.exit(1)

    print(f"[TRAIN] Dataset: {ds['n']} accoppiamenti "
          f"(da {ds['n_before_filter']} prima del filtro >= {args.min_child_races} corse), "
          f"{int(ds['y_poor'].sum())} figli 'scarsi' (D/E/F) = "
          f"{ds['y_poor'].mean()*100:.1f}%", file=sys.stderr)

    FEATURES_USED = ds["features"]
    if ds["dropped_features"]:
        print(f"[TRAIN] Feature scartate per copertura < {MIN_FEATURE_COVERAGE:.0%}: "
              f"{', '.join(ds['dropped_features'])}", file=sys.stderr)

    report = evaluate(ds)
    report["trained_at"] = datetime.now(timezone.utc).isoformat()
    report["min_child_races"] = args.min_child_races
    report["features"] = FEATURES_USED

    best_r2 = max(m["r2"] for m in report["regression_oof_by_family"].values())
    clf_rep = report["classification_oof_by_family"]
    best_auc = clf_rep.get("auc", 0.0)

    print(f"[TRAIN] Baseline media   : MAE {report['baselines']['target_mean']['mae']}, R2 0.0",
          file=sys.stderr)
    print(f"[TRAIN] Baseline genitori: R2 {report['baselines']['mid_parent_score']['r2']}",
          file=sys.stderr)
    for name, m in report["regression_oof_by_family"].items():
        print(f"[TRAIN] {name}: MAE {m['mae']}, R2 out-of-fold {m['r2']}", file=sys.stderr)
    print(f"[TRAIN] Classificatore D/E/F: AUC {best_auc}, "
          f"PR-AUC {clf_rep.get('pr_auc')} (prevalenza {clf_rep.get('pr_auc_baseline_prevalence')}), "
          f"Brier {clf_rep.get('brier')}", file=sys.stderr)

    # ── Modelli finali addestrati su tutti i dati disponibili
    reg = GradientBoostingRegressor(n_estimators=150, max_depth=3,
                                    learning_rate=0.08, random_state=42)
    reg.fit(ds["X"], ds["y_score"])
    clf = GradientBoostingClassifier(n_estimators=150, max_depth=3,
                                     learning_rate=0.08, random_state=42)
    clf.fit(ds["X"], ds["y_poor"])

    imp = reg.feature_importances_
    s_imp = sum(imp[i] for i, f in enumerate(FEATURES_USED) if f.startswith("s_") or f == "ss_time")
    m_imp = sum(imp[i] for i, f in enumerate(FEATURES_USED) if f.startswith("m_") or f == "ds_time")
    tot = s_imp + m_imp
    if tot > 0:
        print(f"[TRAIN] Importanza appresa — lato stallone: {s_imp/tot*100:.0f}%, "
              f"lato fattrice: {m_imp/tot*100:.0f}%", file=sys.stderr)

    status = validation_status(best_r2, best_auc, ds["n"])
    # Flag per componente: dice quale output è utilizzabile e quale no.
    baseline_mae = report["baselines"]["target_mean"]["mae"]
    best_reg_mae = min(m["mae"] for m in report["regression_oof_by_family"].values())
    status["components"] = {
        "score_regressor_beats_mean_baseline": bool(best_r2 > 0 and best_reg_mae < baseline_mae),
        "score_regressor_usable": bool(best_r2 >= MIN_R2_DECISION),
        "poor_classifier_usable": bool(best_auc >= MIN_AUC_DECISION),
    }
    report.update(status)

    payload = {
        "trained_at": report["trained_at"],
        "n_samples": int(ds["n"]),
        "features": FEATURES_USED,
        "medians": ds["medians"],
        # Chiavi legacy mantenute per retrocompatibilità del server:
        # ora contengono le metriche out-of-fold PER FAMIGLIA, non la CV casuale.
        "cv_r2_score": round(float(best_r2), 4),
        "cv_auc_poor": round(float(best_auc), 4),
        "feature_importances": {f: round(float(v), 4) for f, v in zip(FEATURES_USED, imp)},
        "score_model": export_gb_model(reg, "regressor"),
        "poor_model": export_gb_model(clf, "classifier"),
        **status,
        "evaluation": report,
        "grade_earnings": grade_earnings_map(conn),
        # Soglie voto dinamiche (percentili del dataset reale) per mappare score->voto lato server
        "grade_thresholds": compute_grade_thresholds(conn),
    }
    conn.close()

    Path(args.out).write_text(json.dumps(payload))
    Path(args.report).write_text(json.dumps(report, indent=2))
    print(f"[TRAIN] validation_status: {payload['validation_status']} "
          f"(decision support: {payload['is_decision_support_ready']})", file=sys.stderr)
    print(f"[TRAIN] Modello salvato in {args.out} "
          f"({Path(args.out).stat().st_size/1024:.0f} KB); report in {args.report}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
