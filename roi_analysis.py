#!/usr/bin/env python3
"""
Analisi ROI completa per la tesi: tutti gli stalloni con stud fee,
intervalli di confidenza bootstrap, simulazione Monte Carlo, e output JSON.
"""

import json
import sqlite3
import random
import sys
from pathlib import Path
from roi_model import (
    COSTI, costi_fissi_allevamento, grade_earnings_from_db,
    grade_probabilities_population, grade_probabilities_sire,
    expected_revenue, calculate_roi, GRADE_ORDER
)

DB_PATH = Path(__file__).parent / "data.db"
N_BOOTSTRAP = 2000
N_MONTECARLO = 10000

def bootstrap_roi(stud_fee, grade_probs, grade_earnings, n=N_BOOTSTRAP):
    """Bootstrap ROI: ricampiona i guadagni per grado e ricalcola il ROI."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Estrai i guadagni per grado
    grade_data = {}
    for g in GRADE_ORDER:
        rows = conn.execute("""
            SELECT career_earnings FROM horse_ratings
            WHERE rating_mode='performance' AND grade=? 
              AND career_earnings IS NOT NULL AND career_earnings > 0
        """, (g,)).fetchall()
        grade_data[g] = [r[0] for r in rows]

    conn.close()

    rois = []
    for _ in range(n):
        # Ricampiona i guadagni medi per grado
        sampled_earnings = {}
        for g in GRADE_ORDER:
            data = grade_data.get(g, [])
            if not data:
                sampled_earnings[g] = {"avg_earnings": grade_earnings.get(g, {}).get("avg_earnings", 0), "n": 0}
            else:
                sample = [random.choice(data) for _ in range(len(data))]
                avg = sum(sample) / len(sample)
                sampled_earnings[g] = {"avg_earnings": avg, "n": len(data)}

        roi = calculate_roi(stud_fee, grade_probs, sampled_earnings)
        rois.append(roi["roi"])

    rois.sort()
    ci_low = rois[int(0.025 * n)]
    ci_high = rois[int(0.975 * n)]
    median = rois[n // 2]
    p10 = rois[int(0.10 * n)]
    p90 = rois[int(0.90 * n)]

    return {
        "median": round(median, 4),
        "ci_low": round(ci_low, 4),
        "ci_high": round(ci_high, 4),
        "p10": round(p10, 4),
        "p90": round(p90, 4),
        "p_positive": round(sum(1 for r in rois if r > 0) / n, 4),
    }


def monte_carlo_outcome(stud_fee, grade_probs, grade_earnings, n=N_MONTECARLO):
    """Simula n cicli di allevamento e calcola la distribuzione dei risultati."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    grade_data = {}
    for g in GRADE_ORDER:
        rows = conn.execute("""
            SELECT career_earnings FROM horse_ratings
            WHERE rating_mode='performance' AND grade=? 
              AND career_earnings IS NOT NULL AND career_earnings > 0
        """, (g,)).fetchall()
        grade_data[g] = [r[0] for r in rows]

    conn.close()

    costi = costi_fissi_allevamento(stud_fee)
    costo_atteso = costi["costo_atteso"]
    tasso_morte = COSTI["tasso_mortalita_neonatale"]

    outcomes = []
    for _ in range(n):
        # 1. Il puledro sopravvive?
        if random.random() < tasso_morte:
            # Muore: perde stud fee + costi riproduzione
            outcomes.append(-(stud_fee + costi["riproduzione"]))
            continue

        # 2. Quale voto otterrà?
        r = random.random()
        cumulative = 0
        selected_grade = "F"
        for g in GRADE_ORDER:
            cumulative += grade_probs.get(g, 0)
            if r <= cumulative:
                selected_grade = g
                break

        # 3. Quanto guadagna?
        data = grade_data.get(selected_grade, [])
        if data:
            earnings = random.choice(data)
        else:
            earnings = grade_earnings.get(selected_grade, {}).get("avg_earnings", 0)

        # 4. ROI di questo ciclo
        outcomes.append(earnings - costo_atteso)

    outcomes.sort()
    return {
        "n_simulazioni": n,
        "mediana_utile": round(outcomes[n // 2], 0),
        "p10_utile": round(outcomes[int(0.10 * n)], 0),
        "p90_utile": round(outcomes[int(0.90 * n)], 0),
        "p25_utile": round(outcomes[int(0.25 * n)], 0),
        "p75_utile": round(outcomes[int(0.75 * n)], 0),
        "p_positive": round(sum(1 for o in outcomes if o > 0) / n, 4),
        "perdita_massima": round(outcomes[0], 0),
        "guadagno_massimo": round(outcomes[-1], 0),
        "percentili": {
            "5": round(outcomes[int(0.05 * n)], 0),
            "25": round(outcomes[int(0.25 * n)], 0),
            "50": round(outcomes[int(0.50 * n)], 0),
            "75": round(outcomes[int(0.75 * n)], 0),
            "95": round(outcomes[int(0.95 * n)], 0),
        }
    }


def break_even_fee(grade_probs, grade_earnings):
    """Trova lo stud fee che rende ROI = 0."""
    lo, hi = 0, 100000
    for _ in range(50):
        mid = (lo + hi) / 2
        roi = calculate_roi(mid, grade_probs, grade_earnings)
        if roi["roi"] < 0:
            hi = mid
        else:
            lo = mid
    return round((lo + hi) / 2, 0)


def main():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    grade_earnings = grade_earnings_from_db(conn)
    pop_probs = grade_probabilities_population(conn)

    # Carica stud fees dal database + export JSON
    with open(Path(__file__).parent / "stallions_2026_export.json") as f:
        export_data = json.load(f)
    export_fees = {s["name"].upper().strip(): s["stud_fee_eur"] for s in export_data if s.get("stud_fee_eur")}

    # Tutti gli stalloni nel database con final_score
    stallions = conn.execute("""
        SELECT st.sire, st.final_score, st.grade, st.n_figli_totali,
               s.stud_fee_eur, s.country
        FROM stallion_rating_stats st
        LEFT JOIN stallions s ON UPPER(TRIM(s.name)) = UPPER(TRIM(st.sire))
        WHERE st.final_score > 0
        ORDER BY st.final_score DESC
    """).fetchall()

    results = []
    for row in stallions:
        sire = row["sire"]
        # Stud fee: DB prima, poi export JSON
        stud_fee = row["stud_fee_eur"] or export_fees.get(sire, 0)
        if stud_fee == 0:
            continue  # Salta stalloni senza stud fee

        grade = row["grade"] or "N/A"
        n_figli = row["n_figli_totali"] or 0
        country = row["country"] or ""

        # Probabilità per stallone (o fallback popolazione)
        sire_probs = grade_probabilities_sire(conn, sire)
        probs_source = "figli dello stallone" if sire_probs else "popolazione generale"
        probs = sire_probs or pop_probs

        # ROI base
        roi = calculate_roi(stud_fee, probs, grade_earnings)

        # Break-even fee
        be_fee = break_even_fee(probs, grade_earnings)

        result = {
            "stallone": sire,
            "grade": grade,
            "country": country,
            "n_figli": n_figli,
            "stud_fee": stud_fee,
            "modello_prob": probs_source,
            "costo_atteso": roi["costo_atteso"],
            "ricavo_atteso": roi["ricavo_atteso"],
            "utile_atteso": roi["utile_atteso"],
            "roi": roi["roi"],
            "roi_pct": roi["roi_pct"],
            "prob_recupero": roi["prob_recupero_costi"],
            "break_even_fee": be_fee,
            "fee_max_conveniente": be_fee < stud_fee,
        }
        results.append(result)

    conn.close()

    # Ordina per ROI decrescente
    results.sort(key=lambda x: -x["roi"])

    # Stampa tabella
    print(f"\n{'='*120}")
    print(f"ROI ANALISI COMPLETA — {len(results)} STALLONI CON STUD FEE")
    print(f"{'='*120}")
    print(f"{'Stallone':<25} {'Voto':>4} {'Paese':>5} {'Figli':>6} {'Fee':>8} {'Costo':>9} {'Ricavo':>9} {'Utile':>9} {'ROI':>8} {'P(rec)':>7} {'BE Fee':>8}")
    print("-" * 120)
    for r in results:
        print(f"{r['stallone']:<25} {r['grade']:>4} {r['country']:>5} {r['n_figli']:>6} €{r['stud_fee']:>7,.0f} €{r['costo_atteso']:>8,.0f} €{r['ricavo_atteso']:>8,.0f} €{r['utile_atteso']:>8,.0f} {r['roi_pct']:>8} {r['prob_recupero']*100:>6.1f}% €{r['break_even_fee']:>7,.0f}")

    # Statistiche riassuntive
    positive_roi = [r for r in results if r["roi"] > 0]
    negative_roi = [r for r in results if r["roi"] <= 0]
    print(f"\n--- STATISTICHE RIASSUNTIVE ---")
    print(f"Stalloni con ROI positivo: {len(positive_roi)} / {len(results)} ({len(positive_roi)/len(results)*100:.1f}%)")
    print(f"Stalloni con ROI negativo: {len(negative_roi)} / {len(results)} ({len(negative_roi)/len(results)*100:.1f}%)")
    if positive_roi:
        best = positive_roi[0]
        print(f"Miglior ROI: {best['stallone']} ({best['roi_pct']}, fee €{best['stud_fee']:,.0f})")
    if negative_roi:
        worst = negative_roi[-1]
        print(f"Peggior ROI: {worst['stallone']} ({worst['roi_pct']}, fee €{worst['stud_fee']:,.0f})")

    # Bootstrap e Monte Carlo per top 10 stalloni
    print(f"\n--- BOOTSTRAP E MONTE CARLO (top 10 per ROI) ---")
    detailed = []
    for r in results[:10]:
        print(f"\n  {r['stallone']} (fee €{r['stud_fee']:,.0f}, ROI {r['roi_pct']})...")
        conn2 = sqlite3.connect(str(DB_PATH))
        conn2.row_factory = sqlite3.Row
        sire_probs = grade_probabilities_sire(conn2, r["stallone"])
        probs = sire_probs or pop_probs
        conn2.close()

        bs = bootstrap_roi(r["stud_fee"], probs, grade_earnings, n=1000)
        mc = monte_carlo_outcome(r["stud_fee"], probs, grade_earnings, n=5000)
        r["bootstrap"] = bs
        r["monte_carlo"] = mc
        detailed.append(r)
        print(f"    Bootstrap: mediana {bs['median']*100:.1f}%, IC95% [{bs['ci_low']*100:.1f}%, {bs['ci_high']*100:.1f}%], P(ROI>0)={bs['p_positive']*100:.1f}%")
        print(f"    Monte Carlo: mediana utile €{mc['mediana_utile']:,.0f}, P(utile>0)={mc['p_positive']*100:.1f}%")

    # Salva JSON completo
    output = {
        "metadata": {
            "n_stalloni": len(results),
            "n_positive_roi": len(positive_roi),
            "n_negative_roi": len(negative_roi),
            "fonti_costi": ["CTS Moruzzo 2026", "ANACT 2025", "UNIRE 2026", "Trot Stallions Directory 2026"],
            "n_cavalli_db": 16585,
            "n_gare_db": 671711,
            "costi_fissi_base": 35214,
        },
        "grade_earnings": grade_earnings,
        "population_probabilities": pop_probs,
        "results": results,
        "detailed_top10": detailed,
    }
    with open(Path(__file__).parent / "roi_analysis_output.json", "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)

    print(f"\nOutput salvato in roi_analysis_output.json")


if __name__ == "__main__":
    main()
