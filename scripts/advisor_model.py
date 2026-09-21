#!/usr/bin/env python3
"""
Modello dell'Advisor: stima il voto atteso di un puledro dalla coppia
padre + madre, e si mette alla prova sul passato.

Come funziona, in breve
-----------------------
Per ogni figlio gia' valutato si calcolano due indizi:

  * indizio del padre  = voto medio degli ALTRI figli di quel padre
  * indizio della madre = voto medio degli ALTRI figli di quella madre

Gli "altri" servono a non barare: il figlio che stiamo stimando non entra
mai nel proprio indizio (leave-one-out). Entrambi gli indizi vengono
attenuati verso la media generale quando i figli sono pochi
(shrinkage bayesiano semplice: n / (n + k)), perche' una madre con un solo
figlio non e' una prova.

Poi una regressione lineare ai minimi quadrati trova quanto pesa ciascun
indizio. I pesi finiscono in advisor_model.json e il sito li usa dal vivo.

La prova del nove
-----------------
I pesi si stimano SOLO sui cavalli nati fino a un certo anno, e la qualita'
si misura sui nati dopo, mai visti in addestramento. Si confronta con tre
alternative banali:

  * media    : dare a tutti il voto medio della popolazione
  * tassa    : ordinare per costo della monta (piu' caro = migliore)
  * fama     : ordinare per guadagni della progenie del padre

Tutto finisce in advisor_backtest.json, che alimenta la pagina di verifica.
"""

import json
import math
import os
import random
import sqlite3
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data.db")
MODEL_OUT = os.path.join(ROOT, "advisor_model.json")
BACKTEST_OUT = os.path.join(ROOT, "advisor_backtest.json")

# Quanti figli servono perche' l'indizio valga per intero.
K_SIRE = 8.0
K_DAM = 2.0
# Anno di taglio: si impara fino a qui, si verifica dopo.
CUTOFF_YEAR = 2019

# Ereditabilita' dei caratteri di corsa nel trotto, dalla letteratura.
# Serve a calcolare il TETTO TEORICO della precisione: anche conoscendo
# perfettamente il valore genetico dei genitori, la correlazione massima
# attesa con il risultato del singolo figlio e' radice(h2 / 2)
# (genetica quantitativa classica: il figlio riceve meta' del valore
# additivo di ciascun genitore, il resto e' ambiente e sorte).
#   tempo al km   h2 ~ 0,28-0,36  (Suontama 2012; Rohe 2001)
#   guadagni      h2 ~ 0,09-0,20  (Rohe 2001; Thiruvenkadan 2009)
HERITABILITY_REF = {
    "guadagni_basso": 0.09,
    "guadagni_alto": 0.20,
    "tempo_basso": 0.28,
    "tempo_alto": 0.36,
}


def load_rows(conn):
    """Figli valutati con padre e madre noti."""
    q = """
        SELECT r.name, r.birth_year, r.score, r.grade, r.career_earnings,
               UPPER(TRIM(r.sire)) AS sire, UPPER(TRIM(h.dam)) AS dam
        FROM horse_ratings r
        JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
        WHERE r.rating_mode = 'performance'
          AND r.score IS NOT NULL
          AND r.sire IS NOT NULL AND TRIM(r.sire) <> ''
          AND h.dam IS NOT NULL AND TRIM(h.dam) <> ''
          AND r.birth_year IS NOT NULL
    """
    return [dict(zip(
        ["name", "birth_year", "score", "grade", "earnings", "sire", "dam"], r
    )) for r in conn.execute(q)]


def group_stats(rows, key):
    """Somma dei voti e numero di figli per padre (o per madre)."""
    tot = defaultdict(float)
    cnt = defaultdict(int)
    for r in rows:
        tot[r[key]] += r["score"]
        cnt[r[key]] += 1
    return tot, cnt


def loo_effect(tot, cnt, key_value, own_score, mean_all, k, exclude_self=True):
    """Indizio leave-one-out, attenuato verso la media generale."""
    s = tot.get(key_value, 0.0)
    n = cnt.get(key_value, 0)
    if exclude_self:
        s -= own_score
        n -= 1
    if n <= 0:
        return mean_all, 0
    avg = s / n
    w = n / (n + k)
    return mean_all + w * (avg - mean_all), n


def fit_ols(X, y):
    """Minimi quadrati su poche colonne, con eliminazione di Gauss."""
    p = len(X[0])
    ata = [[0.0] * p for _ in range(p)]
    aty = [0.0] * p
    for xi, yi in zip(X, y):
        for a in range(p):
            aty[a] += xi[a] * yi
            for b in range(p):
                ata[a][b] += xi[a] * xi[b]
    # ridge minuscola per sicurezza numerica
    for a in range(p):
        ata[a][a] += 1e-8
    m = [row[:] + [aty[i]] for i, row in enumerate(ata)]
    for col in range(p):
        piv = max(range(col, p), key=lambda r: abs(m[r][col]))
        m[col], m[piv] = m[piv], m[col]
        pv = m[col][col]
        if abs(pv) < 1e-12:
            continue
        m[col] = [v / pv for v in m[col]]
        for r in range(p):
            if r != col:
                f = m[r][col]
                m[r] = [v - f * w for v, w in zip(m[r], m[col])]
    return [m[i][p] for i in range(p)]


def pearson(a, b):
    n = len(a)
    if n < 2:
        return 0.0
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((y - mb) ** 2 for y in b))
    return num / (da * db) if da > 0 and db > 0 else 0.0


def spearman(a, b):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        rk = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for t in range(i, j + 1):
                rk[order[t]] = avg
            i = j + 1
        return rk
    return pearson(ranks(a), ranks(b))


def top_decile_lift(pred, actual, frac=0.1):
    """Quanto valgono, in media, i figli del 10% di accoppiamenti
    giudicati migliori, rispetto alla media generale."""
    n = len(pred)
    if n < 20:
        return None
    k = max(1, int(n * frac))
    idx = sorted(range(n), key=lambda i: -pred[i])[:k]
    top = sum(actual[i] for i in idx) / k
    base = sum(actual) / n
    return {"top_mean": round(top, 2), "population_mean": round(base, 2),
            "lift": round(top - base, 2), "n_top": k}


def bootstrap_differenza(pred_a, pred_b, actual, n_giri=2000, seme=12345):
    """Il vantaggio dell'Advisor e' reale o e' fortuna del campione?

    Si riestrae molte volte il gruppo di verifica con reinserimento e ogni
    volta si ricalcola di quanto l'Advisor batte l'alternativa. Se anche
    ricampionando il vantaggio resta quasi sempre positivo, non dipende da
    quali cavalli sono capitati nel campione.

    Restituisce il vantaggio osservato, l'intervallo entro cui cade nel 95%
    dei ricampionamenti e la quota di ricampionamenti in cui l'Advisor
    perde (una specie di valore-p a una coda).
    """
    rnd = random.Random(seme)
    n = len(actual)
    osservato = spearman(pred_a, actual) - spearman(pred_b, actual)
    differenze = []
    for _ in range(n_giri):
        idx = [rnd.randrange(n) for _ in range(n)]
        a = [actual[i] for i in idx]
        differenze.append(spearman([pred_a[i] for i in idx], a)
                          - spearman([pred_b[i] for i in idx], a))
    differenze.sort()
    lo = differenze[int(0.025 * n_giri)]
    hi = differenze[int(0.975 * n_giri) - 1]
    quota_negativa = sum(1 for d in differenze if d <= 0) / n_giri
    return {
        "vantaggio": round(osservato, 4),
        "intervallo95": [round(lo, 4), round(hi, 4)],
        "quota_ricampionamenti_sfavorevoli": round(quota_negativa, 4),
        "significativo": bool(lo > 0),
        "n_giri": n_giri,
    }


def prova_permutazione(pred, actual, n_giri=2000, seme=999):
    """La correlazione osservata e' distinguibile dal puro caso?

    Si mescolano i risultati veri e si ricalcola la correlazione: cosi' si
    costruisce la distribuzione di cio' che si otterrebbe se la previsione
    non contenesse nessuna informazione. La quota di mescolamenti che fanno
    meglio della previsione vera e' il valore-p.
    """
    rnd = random.Random(seme)
    osservato = spearman(pred, actual)
    mescolati = list(actual)
    superiori = 0
    for _ in range(n_giri):
        rnd.shuffle(mescolati)
        if spearman(pred, mescolati) >= osservato:
            superiori += 1
    return {
        "spearman_osservato": round(osservato, 4),
        "valore_p": round((superiori + 1) / (n_giri + 1), 5),
        "n_giri": n_giri,
    }


def main():
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = load_rows(conn)
    if not rows:
        print("nessun dato")
        return 1

    fees = {r[0].upper(): r[1] for r in conn.execute(
        "SELECT UPPER(TRIM(name)), stud_fee_eur FROM stallions WHERE stud_fee_eur IS NOT NULL")}

    # Fama del padre calcolata SOLO sul passato: guadagni medi dei figli
    # nati fino all'anno di taglio. Senza questo accorgimento il confronto
    # userebbe dati che all'epoca non esistevano ancora.
    _ft, _fc = defaultdict(float), defaultdict(int)
    for r in rows:
        if r["birth_year"] <= CUTOFF_YEAR:
            _ft[r["sire"]] += math.log1p(r["earnings"] or 0)
            _fc[r["sire"]] += 1
    fame_mean = (sum(_ft.values()) / sum(_fc.values())) if _fc else 0.0
    fame_train = {k: fame_mean + (_fc[k] / (_fc[k] + K_SIRE)) * (_ft[k] / _fc[k] - fame_mean)
                  for k in _ft}

    train = [r for r in rows if r["birth_year"] <= CUTOFF_YEAR]
    test = [r for r in rows if r["birth_year"] > CUTOFF_YEAR]

    # --- pesi stimati SOLO sul passato -------------------------------
    st_tot, st_cnt = group_stats(train, "sire")
    dm_tot, dm_cnt = group_stats(train, "dam")
    mean_train = sum(r["score"] for r in train) / len(train)

    X, y = [], []
    for r in train:
        se, _ = loo_effect(st_tot, st_cnt, r["sire"], r["score"], mean_train, K_SIRE)
        de, _ = loo_effect(dm_tot, dm_cnt, r["dam"], r["score"], mean_train, K_DAM)
        X.append([1.0, se, de])
        y.append(r["score"])
    coef_bt = fit_ols(X, y)
    # versione senza la madre: serve a dimostrare quanto aggiunge la madre
    coef_sire_only = fit_ols([[x[0], x[1]] for x in X], y)

    # --- verifica sui nati dopo il taglio ----------------------------
    pred, pred_sire_only, act, pred_fee, pred_fame = [], [], [], [], []
    for r in test:
        se, _ = loo_effect(st_tot, st_cnt, r["sire"], 0.0, mean_train, K_SIRE, exclude_self=False)
        de, _ = loo_effect(dm_tot, dm_cnt, r["dam"], 0.0, mean_train, K_DAM, exclude_self=False)
        pred.append(coef_bt[0] + coef_bt[1] * se + coef_bt[2] * de)
        pred_sire_only.append(coef_sire_only[0] + coef_sire_only[1] * se)
        act.append(r["score"])
        # La tassa di monta e' quella di OGGI: e' gia' influenzata dai
        # risultati che stiamo cercando di prevedere, quindi sbircia il
        # futuro. La teniamo solo per mostrare perche' non vale.
        pred_fee.append(float(fees.get(r["sire"], 0) or 0))
        # "Fama" onesta: guadagni medi dei figli nati PRIMA del taglio.
        pred_fame.append(fame_train.get(r["sire"], fame_mean))

    mean_test_pred = [mean_train] * len(test)

    # ── Analisi per sottogruppi ──────────────────────────────────────
    # Il caso difficile e' la fattrice senza figli valutati: e' la maggioranza
    # delle richieste reali. Qui si misura quanto serve il ripiego sulla
    # nonna materna, invece di arrendersi alla media.
    gran = {r[0]: r[1] for r in conn.execute(
        "SELECT UPPER(TRIM(name)), UPPER(TRIM(dam)) FROM horses WHERE dam IS NOT NULL")}

    def sire_eff(r):
        return loo_effect(st_tot, st_cnt, r["sire"], 0.0, mean_train, K_SIRE, False)[0]

    def gran_eff(r):
        g = gran.get(r["dam"])
        if not g or dm_cnt.get(g, 0) == 0:
            return mean_train
        return loo_effect(dm_tot, dm_cnt, g, 0.0, mean_train, K_DAM * 2, False)[0]

    hard = [r for r in test if dm_cnt.get(r["dam"], 0) == 0]
    easy = [r for r in test if dm_cnt.get(r["dam"], 0) > 0]

    segments = []
    for label, grp, note in [
        ("Fattrici con figli gia' valutati", easy,
         "Caso favorevole: l'indizio materno e' misurato direttamente."),
        ("Fattrici senza figli valutati", hard,
         "Caso difficile e piu' frequente nella pratica: della fattrice non si "
         "sa nulla di diretto."),
    ]:
        if len(grp) < 30:
            continue
        a = [r["score"] for r in grp]
        p_full = [coef_bt[0] + coef_bt[1] * sire_eff(r)
                  + coef_bt[2] * loo_effect(dm_tot, dm_cnt, r["dam"], 0.0,
                                            mean_train, K_DAM, False)[0] for r in grp]
        p_sire = [coef_sire_only[0] + coef_sire_only[1] * sire_eff(r) for r in grp]
        seg = {
            "label": label, "note": note, "n": len(grp),
            "spearman_advisor": round(spearman(p_full, a), 3),
            "spearman_solo_padre": round(spearman(p_sire, a), 3),
        }
        if grp is hard:
            # ripiego sulla nonna materna, addestrato sulle sole madri poco note
            tr = [r for r in train if dm_cnt.get(r["dam"], 0) <= 1]
            cg = fit_ols(
                [[1.0, loo_effect(st_tot, st_cnt, r["sire"], r["score"], mean_train, K_SIRE)[0],
                  gran_eff(r)] for r in tr],
                [r["score"] for r in tr])
            p_gran = [cg[0] + cg[1] * sire_eff(r) + cg[2] * gran_eff(r) for r in grp]
            seg["spearman_con_nonna_materna"] = round(spearman(p_gran, a), 3)
            seg["n_con_nonna_informativa"] = sum(
                1 for r in grp if gran.get(r["dam"]) and dm_cnt.get(gran.get(r["dam"]), 0) > 0)
            seg["nota_nonna"] = (
                "Quando la fattrice non ha figli valutati, l'Advisor guarda la "
                "produzione della nonna materna. Questa riga misura se serve.")
        segments.append(seg)

    def metrics(p, label, note=None, leaky=False):
        err = [abs(a - b) for a, b in zip(p, act)]
        return {
            "label": label,
            "note": note,
            "leaky": leaky,
            "mae": round(sum(err) / len(err), 2),
            "pearson": round(pearson(p, act), 3),
            "spearman": round(spearman(p, act), 3),
            "top_decile": top_decile_lift(p, act),
        }

    backtest = {
        "cutoff_year": CUTOFF_YEAR,
        "n_train": len(train),
        "n_test": len(test),
        "train_years": [min(r["birth_year"] for r in train), max(r["birth_year"] for r in train)],
        "test_years": [min(r["birth_year"] for r in test), max(r["birth_year"] for r in test)],
        "population_mean": round(mean_train, 2),
        "test_mean": round(sum(act) / len(act), 2),
        "coefficients": {"intercept": round(coef_bt[0], 4),
                         "sire": round(coef_bt[1], 4),
                         "dam": round(coef_bt[2], 4)},
        "models": [
            metrics(pred, "Advisor (padre + madre)",
                    "Il modello del sito: indizio del padre e indizio della madre, "
                    "calcolati solo sui cavalli nati prima del taglio."),
            metrics(pred_sire_only, "Solo il padre",
                    "Stesso modello ma senza la linea materna: serve a misurare "
                    "quanto aggiunge davvero la madre."),
            metrics(pred_fame, "Fama del padre",
                    "Guadagni medi dei figli gia' nati prima del taglio: la scelta "
                    "che farebbe chi guarda solo il nome del padre."),
            metrics(mean_test_pred, "Media generale",
                    "Dare a tutti lo stesso voto medio: il minimo sindacale, "
                    "serve come pavimento."),
            metrics(pred_fee, "Costo della monta (oggi)",
                    "Ordinare per prezzo. Attenzione: il prezzo di oggi e' stato "
                    "fissato DOPO aver visto come sono andati questi figli, quindi "
                    "e' un confronto falsato a suo favore.", leaky=True),
        ],
        "theoretical_ceiling": {
            "formula": "radice(h2 / 2)",
            "spiegazione":
                "Tetto massimo di correlazione fra una previsione basata sui "
                "genitori e il risultato del singolo figlio, conoscendo "
                "perfettamente il valore genetico dei genitori. Deriva dalla "
                "genetica quantitativa classica: il figlio eredita meta' del "
                "valore additivo di ciascun genitore, il resto e' ambiente, "
                "driver, salute e sorte.",
            "valori": {
                k: round(math.sqrt(v / 2), 3) for k, v in HERITABILITY_REF.items()
            },
            "heritability_usata": HERITABILITY_REF,
            "fonti": [
                "Suontama et al. 2012, J Anim Sci 90:2921-2930",
                "Rohe et al. 2001, Arch Tierz 44:580-588",
                "Thiruvenkadan et al. 2009, Livest Sci 124:163-181",
            ],
        },
        # ── Il vantaggio e' reale o e' rumore? ───────────────────────
        # Finora il confronto diceva "l'Advisor ordina meglio". Mancava la
        # domanda successiva, quella che conta: di quanto, e con quanta
        # certezza? Senza questo, un vantaggio di pochi centesimi poteva
        # essere semplicemente il campione fortunato.
        "significativita": {
            "spiegazione":
                "Due prove indipendenti. La prima riestrae 2000 volte il "
                "gruppo di verifica per vedere se il vantaggio dell'Advisor "
                "resta positivo anche cambiando i cavalli del campione. La "
                "seconda mescola i risultati veri 2000 volte per misurare "
                "quanto facilmente il caso produrrebbe la correlazione "
                "osservata.",
            "confronti": [
                {
                    "contro": "Solo il padre",
                    "domanda": "La linea materna aggiunge davvero qualcosa?",
                    **bootstrap_differenza(pred, pred_sire_only, act),
                },
                {
                    "contro": "Fama del padre",
                    "domanda": "L'Advisor batte chi sceglie guardando il nome del padre?",
                    **bootstrap_differenza(pred, pred_fame, act),
                },
                {
                    "contro": "Costo della monta (oggi)",
                    "domanda": "L'Advisor batte chi sceglie guardando il prezzo?",
                    "avvertenza":
                        "Il prezzo di oggi e' stato fissato dopo aver visto "
                        "questi risultati, quindi gioca in casa. Se l'Advisor "
                        "lo batte comunque, il confronto e' conservativo.",
                    **bootstrap_differenza(pred, pred_fee, act),
                },
            ],
            "contro_il_caso": prova_permutazione(pred, act),
        },
        "segments": segments,
        "scatter": [
            {"pred": round(p, 1), "actual": round(a, 1)}
            for p, a in list(zip(pred, act))[:1500]
        ],
    }
    json.dump(backtest, open(BACKTEST_OUT, "w"), ensure_ascii=False, indent=1)

    # --- modello finale: riaddestrato su TUTTI i dati ----------------
    st_tot, st_cnt = group_stats(rows, "sire")
    dm_tot, dm_cnt = group_stats(rows, "dam")
    mean_all = sum(r["score"] for r in rows) / len(rows)
    X, y = [], []
    for r in rows:
        se, _ = loo_effect(st_tot, st_cnt, r["sire"], r["score"], mean_all, K_SIRE)
        de, _ = loo_effect(dm_tot, dm_cnt, r["dam"], r["score"], mean_all, K_DAM)
        X.append([1.0, se, de])
        y.append(r["score"])
    coef = fit_ols(X, y)
    resid = [yy - (coef[0] + coef[1] * xx[1] + coef[2] * xx[2]) for xx, yy in zip(X, y)]
    sd = math.sqrt(sum(e * e for e in resid) / max(1, len(resid) - 3))

    model = {
        "version": 2,
        "trained_on": len(rows),
        "population_mean": round(mean_all, 4),
        "k_sire": K_SIRE,
        "k_dam": K_DAM,
        "intercept": round(coef[0], 6),
        "w_sire": round(coef[1], 6),
        "w_dam": round(coef[2], 6),
        "residual_sd": round(sd, 4),
        "backtest_summary": {
            "spearman": backtest["models"][0]["spearman"],
            "mae": backtest["models"][0]["mae"],
            "baseline_spearman": backtest["models"][2]["spearman"],
        },
    }
    json.dump(model, open(MODEL_OUT, "w"), ensure_ascii=False, indent=1)

    print(json.dumps({"model": model, "backtest": {
        k: v for k, v in backtest.items() if k != "scatter"}}, ensure_ascii=False, indent=1))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
