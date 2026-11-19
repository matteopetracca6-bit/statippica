#!/usr/bin/env python3
"""
Modello di valutazione economica (ROI) per decisioni di breeding nel trotto italiano.

Questo modulo calcola il ritorno sull'investimento atteso per un accoppiamento
stallone × fattrice, basandosi su:

COSTI (dati reali da fonti di settore italiane, 2024-2026):
  - Prezzo monta (stud fee): dal catalogo ANACT o dal database
  - Inseminazione e diagnosi gravidanza: listino CTS Moruzzo 2026
  - Boarding fattrice (gestazione + allattamento): listino CTS Moruzzo 2026
  - Registrazione puledro: tariffa UNIRE 2026
  - Addestramento e training: listini scuderie italiane
  - Veterinario, maniscalco, assicurazione: medie di settore

RICAVI:
  - Guadagni di carriera medi per voto (grado SSS..F), calcolati dal database
    reale di StatIppica (22.900+ cavalli, 671.000+ gare)
  - Probabilità di ottenere ciascun voto: distribuzione per stallone
    (P(grade|sire) dai figli osservati) con fallback alla distribuzione
    di popolazione

Fonti dati:
  - CTS Moruzzo: listino prezzi servizi riproduzione 2026
  - ANACT: catalogo stalloni trottatori 2025
  - UNIRE: tariffe iscrizione puledri 2026
  - Club Cavallo Italia: costi gestione cavallo
  - Friesian Horse Italia: tassi mortalità neonatale (4-8%)
  - Database StatIppica: guadagni medi per voto

Uso:
  python roi_model.py --sire "VARENNE" --mare "BELLISSIMA GRIF"
  python roi_model.py --sire "FACE TIME BOURBON" --budget 50000
  python roi_model.py --list  # mostra ROI per tutti gli stalloni con dati
"""

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from datetime import datetime

# ─────────────────────────────────────────────
# PARAMETRI DI COSTO (fonti: CTS Moruzzo 2026, UNIRE 2026, settore)
# ─────────────────────────────────────────────

# Tutti i costi sono in Euro, IVA esclusa (l'allevatore professionale la recupera)
COSTI = {
    # --- Riproduzione ---
    "inseminazione": 430,        # AI seme fresco/refrigerato + diagnosi gravidanza (CTS Moruzzo 2026, servizio 6)
    "monitoraggio_gravidanza": 80,  # Conferma oltre 60gg + monitoraggio rischio (media, CTS Moruzzo servizi 9+11)
    "assistenza_parto": 400,     # Assistenza parto + analisi isoeritrolisi (CTS Moruzzo servizio 12)

    # --- Boarding fattrice ---
    "boarding_mare_box_giorno": 15,   # Scuderizzazione fattrice in box (CTS Moruzzo servizio 1)
    "boarding_mare_pasture_giorno": 9,  # Mantenimento fattrice+puledro al prato (CTS Moruzzo servizio 4)

    # --- Puledro ---
    "registrazione_puledro": 96,   # Denuncia nascita UNIRE 2026
    "veterinario_anno": 500,      # Vaccinazioni, sverminazione, visite (media settore)
    "maniscalco_anno": 600,       # Ferratura 4-6 volte/anno (media settore)
    "assicurazione_anno": 600,    # Assicurazione base (media settore)
    "attrezzatura": 1500,         # Sellare, finimenti, attrezzatura (una tantum)

    # --- Addestramento ---
    "training_mese": 350,         # Doma/addestramento (media scuderie italiane)
    "boarding_training_giorno": 15,  # Boarding durante training (box)
    "quote_gara_anno": 500,       # Iscrizioni gare (media)

    # --- Timeline ---
    "giorni_gestazione": 340,     # ~11 mesi
    "giorni_allattamento": 180,   # ~6 mesi al prato con la madre
    "mesi_yearling_box": 12,       # 12 mesi in box prima del training
    "mesi_training": 18,          # 18 mesi di training prima della prima gara
    "anni_gara": 4,               # Anni di carriera agonistica attesa

    # --- Rischio ---
    "tasso_mortalita_neonatale": 0.05,  # 4-8% non sopravvive prime settimane (Friesian Horse Italia)
}

# Costi fissi totali (escluso stud fee e costi gestazione che dipendono dallo scenario)
def costi_fissi_allevamento(stud_fee: float) -> dict:
    """
    Calcola tutti i costi di allevamento dalla monta alla prima gara.
    Restituisce un dict con il breakdown.
    """
    c = COSTI

    # Fase 1: Riproduzione e gestazione
    inseminazione = c["inseminazione"] + c["monitoraggio_gravidanza"]
    boarding_gestazione = c["boarding_mare_box_giorno"] * c["giorni_gestazione"]
    costo_riproduzione = inseminazione + c["assistenza_parto"] + boarding_gestazione

    # Fase 2: Puledro (primo anno, con la madre)
    boarding_allattamento = c["boarding_mare_pasture_giorno"] * c["giorni_allattamento"]
    registrazione = c["registrazione_puledro"]
    veterina_anno1 = c["veterinario_anno"]
    costo_puledro_anno1 = boarding_allattamento + registrazione + veterina_anno1

    # Fase 3: Yearling (12 mesi in box prima del training)
    boarding_yearling = c["boarding_mare_box_giorno"] * 365 * (c["mesi_yearling_box"] / 12)
    costo_yearling = boarding_yearling + c["veterinario_anno"] + c["maniscalco_anno"]

    # Fase 4: Training (18 mesi)
    training = c["training_mese"] * c["mesi_training"]
    boarding_training = c["boarding_training_giorno"] * 30 * c["mesi_training"]
    costo_training = training + boarding_training + c["veterinario_anno"] * 1.5 + c["maniscalco_anno"] * 1.5

    # Fase 5: Attività agonistica (4 anni)
    costo_gare = c["quote_gara_anno"] * c["anni_gara"] + c["assicurazione_anno"] * c["anni_gara"]
    attrezzatura = c["attrezzatura"]
    costo_agone = costo_gare + attrezzatura

    # Totale
    costo_base = stud_fee + costo_riproduzione + costo_puledro_anno1 + costo_yearling + costo_training + costo_agone

    # Rischio mortalità: se il puledro non sopravvive (5% probabilità),
    # si perde lo stud fee + i costi di riproduzione sostenuti fino al parto
    costo_se_morte = stud_fee + inseminazione + c["assistenza_parto"] + boarding_gestazione
    tasso = c["tasso_mortalita_neonatale"]
    costo_atteso = (1 - tasso) * costo_base + tasso * costo_se_morte

    return {
        "stud_fee": stud_fee,
        "riproduzione": round(costo_riproduzione, 0),
        "puledro_anno1": round(costo_puledro_anno1, 0),
        "yearling": round(costo_yearling, 0),
        "training": round(costo_training, 0),
        "attivita_agone": round(costo_agone, 0),
        "costo_base": round(costo_base, 0),
        "costo_se_morte": round(costo_se_morte, 0),
        "tasso_mortalita": tasso,
        "costo_atteso": round(costo_atteso, 0),
    }


# ─────────────────────────────────────────────
# MODELLO RICAVI
# ─────────────────────────────────────────────

GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"]

def grade_earnings_from_db(conn: sqlite3.Connection) -> dict:
    """Estrae i guadagni medi per voto dal database reale."""
    rows = conn.execute("""
        SELECT grade, AVG(career_earnings) as avg_earn, COUNT(*) as n
        FROM horse_ratings
        WHERE rating_mode='performance' AND career_earnings IS NOT NULL AND career_earnings > 0
        GROUP BY grade
    """).fetchall()
    return {r[0]: {"avg_earnings": round(r[1] or 0, 2), "n": r[2]} for r in rows}


def grade_probabilities_population(conn: sqlite3.Connection) -> dict:
    """Distribuzione di probabilità dei voti sulla popolazione totale."""
    total = conn.execute(
        "SELECT COUNT(*) FROM horse_ratings WHERE rating_mode='performance'"
    ).fetchone()[0]
    if total == 0:
        return {g: 0 for g in GRADE_ORDER}
    rows = conn.execute("""
        SELECT grade, COUNT(*) as cnt
        FROM horse_ratings WHERE rating_mode='performance'
        GROUP BY grade
    """).fetchall()
    return {r[0]: r[1] / total for r in rows}


def grade_probabilities_sire(conn: sqlite3.Connection, sire_name: str) -> dict | None:
    """
    Distribuzione di probabilità dei voti per i figli di uno specifico stallone.
    Restituisce None se lo stallone ha troppo pochi figli (< 10).
    """
    rows = conn.execute("""
        SELECT grade, COUNT(*) as cnt
        FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode='performance'
        GROUP BY grade
    """, (sire_name,)).fetchall()

    total = sum(r[1] for r in rows)
    if total < 10:
        return None

    probs = {r[0]: r[1] / total for r in rows}
    # Assicura che tutti i gradi siano presenti (0 se mancanti)
    return {g: probs.get(g, 0.0) for g in GRADE_ORDER}


def expected_revenue(grade_probs: dict, grade_earnings: dict) -> dict:
    """
    Calcola il ricavo atteso come somma di P(grade) × avg_earnings(grade).
    Restituisce anche il breakdown per grado.
    """
    breakdown = {}
    total_expected = 0.0
    for g in GRADE_ORDER:
        p = grade_probs.get(g, 0)
        earn = grade_earnings.get(g, {}).get("avg_earnings", 0)
        expected = p * earn
        breakdown[g] = {
            "probabilita": round(p, 4),
            "guadagno_medio": round(earn, 0),
            "ricavo_atteso": round(expected, 0),
        }
        total_expected += expected
    return {"breakdown": breakdown, "ricavo_atteso_totale": round(total_expected, 0)}


# ─────────────────────────────────────────────
# ROI
# ─────────────────────────────────────────────

def calculate_roi(stud_fee: float, grade_probs: dict, grade_earnings: dict) -> dict:
    """
    Calcola il ROI per uno scenario di accoppiamento.

    ROI = (ricavo_atteso - costo_atteso) / costo_atteso
    """
    costi = costi_fissi_allevamento(stud_fee)
    ricavi = expected_revenue(grade_probs, grade_earnings)

    costo_atteso = costi["costo_atteso"]
    ricavo_atteso = ricavi["ricavo_atteso_totale"]
    roi = (ricavo_atteso - costo_atteso) / costo_atteso if costo_atteso > 0 else 0

    # Break-even: ricavo minimo per coprire i costi
    break_even_revenue = costo_atteso
    # Probabilità di recuperare i costi (P(guadagno >= costo))
    # Semplificazione: somma le probabilità dei gradi con guadagno >= costo
    prob_recupero = 0.0
    for g in GRADE_ORDER:
        earn = grade_earnings.get(g, {}).get("avg_earnings", 0)
        if earn >= costo_atteso:
            prob_recupero += grade_probs.get(g, 0)

    return {
        "costi": costi,
        "ricavi": ricavi,
        "roi": round(roi, 4),
        "roi_pct": f"{roi*100:.1f}%",
        "costo_atteso": round(costo_atteso, 0),
        "ricavo_atteso": round(ricavo_atteso, 0),
        "utile_atteso": round(ricavo_atteso - costo_atteso, 0),
        "break_even_revenue": round(break_even_revenue, 0),
        "prob_recupero_costi": round(prob_recupero, 4),
        "prob_recupero_costi_pct": f"{prob_recupero*100:.1f}%",
    }


# ─────────────────────────────────────────────
# SENSITIVITÀ
# ─────────────────────────────────────────────

def sensitivity_analysis(stud_fee: float, grade_probs: dict, grade_earnings: dict) -> list:
    """
    Analisi di sensitività: cosa succede se la probabilità di un figlio top
    (SSS+SS+S) aumenta/diminuisce del 10%, 20%, 30%?
    """
    base_roi = calculate_roi(stud_fee, grade_probs, grade_earnings)

    results = [{"scenario": "Base", "roi_pct": base_roi["roi_pct"], "roi": base_roi["roi"]}]

    top_grades = ["SSS", "SS", "S"]
    for delta in [+0.10, +0.20, +0.30, -0.10, -0.20, -0.30]:
        # Copia le probabilità
        adjusted = dict(grade_probs)
        # Aumenta/diminuisci la probabilità dei top grades
        top_prob = sum(adjusted.get(g, 0) for g in top_grades)
        other_prob = sum(adjusted.get(g, 0) for g in GRADE_ORDER if g not in top_grades)

        if delta > 0:
            new_top = top_prob * (1 + delta)
            new_other = max(0, 1 - new_top)
        else:
            new_top = max(0, top_prob * (1 + delta))
            new_other = 1 - new_top

        # Ridistribuisci
        if top_prob > 0:
            scale = new_top / top_prob if top_prob > 0 else 0
            for g in top_grades:
                adjusted[g] = adjusted.get(g, 0) * scale
        if other_prob > 0:
            scale = new_other / other_prob if other_prob > 0 else 0
            for g in GRADE_ORDER:
                if g not in top_grades:
                    adjusted[g] = adjusted.get(g, 0) * scale

        roi = calculate_roi(stud_fee, adjusted, grade_earnings)
        label = f"Top +{int(delta*100)}%" if delta > 0 else f"Top {int(delta*100)}%"
        results.append({"scenario": label, "roi_pct": roi["roi_pct"], "roi": roi["roi"]})

    return results


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "data.db"

def main():
    parser = argparse.ArgumentParser(description="ROI Model per breeding trotto italiano")
    parser.add_argument("--sire", help="Nome stallone")
    parser.add_argument("--mare", help="Nome fattrice (non ancora usata nel modello)")
    parser.add_argument("--stud-fee", type=float, help="Stud fee personalizzato (€)")
    parser.add_argument("--budget", type=float, help="Budget massimo per la monta (€)")
    parser.add_argument("--list", action="store_true", help="Mostra ROI per tutti gli stalloni con dati")
    parser.add_argument("--sensitivity", action="store_true", help="Esegui analisi di sensitività")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"Database non trovato: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    grade_earnings = grade_earnings_from_db(conn)
    pop_probs = grade_probabilities_population(conn)

    if args.list:
        print("\n=== ROI PER STALLONE (top 30 per final_score) ===")
        print(f"{'Stallone':<25} {'Voto':>5} {'Stud Fee':>10} {'Costo Att.':>12} {'Ricavo Att.':>12} {'ROI':>8} {'P(recupero)':>12}")
        print("-" * 90)

        stallions = conn.execute("""
            SELECT st.sire, s.stud_fee_eur, st.final_score, st.grade, st.n_figli_totali
            FROM stallion_rating_stats st
            LEFT JOIN stallions s ON UPPER(TRIM(s.name)) = UPPER(TRIM(st.sire))
            WHERE st.final_score > 0
            ORDER BY st.final_score DESC
            LIMIT 30
        """).fetchall()

        for row in stallions:
            sire = row["sire"]
            stud_fee = row["stud_fee_eur"] or 0
            grade = row["grade"] or "N/A"

            # Probabilità per stallone (o fallback popolazione)
            sire_probs = grade_probabilities_sire(conn, sire)
            probs = sire_probs or pop_probs

            roi = calculate_roi(stud_fee, probs, grade_earnings)

            print(f"{sire:<25} {grade:>5} {stud_fee:>10,.0f} {roi['costo_atteso']:>12,.0f} {roi['ricavo_atteso']:>12,.0f} {roi['roi_pct']:>8} {roi['prob_recupero_costi_pct']:>12}")

        print(f"\nNota: costi fissi (escluso stud fee) ≈ €{costi_fissi_allevamento(0)['costo_atteso']:,.0f}")
        print(f"Fonti: CTS Moruzzo 2026, ANACT 2025, UNIRE 2026, database StatIppica")

    elif args.sire:
        sire = args.sire.upper()

        # Stud fee
        if args.stud_fee:
            stud_fee = args.stud_fee
        else:
            row = conn.execute("""
                SELECT stud_fee_eur FROM stallions WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
            """, (sire,)).fetchone()
            if row and row["stud_fee_eur"]:
                stud_fee = row["stud_fee_eur"]
            else:
                print(f"Stud fee non trovato per {sire}. Usa --stud-fee.", file=sys.stderr)
                stud_fee = 3000  # default

        # Probabilità
        sire_probs = grade_probabilities_sire(conn, sire)
        probs_source = "figli dello stallone" if sire_probs else "popolazione generale"
        probs = sire_probs or pop_probs

        roi = calculate_roi(stud_fee, probs, grade_earnings)

        print(f"\n{'='*60}")
        print(f"ANALISI ROI: {sire}")
        print(f"{'='*60}")

        print(f"\nStud fee: €{stud_fee:,.0f}")
        print(f"Modello probabilità: {probs_source}")

        print(f"\n--- COSTI (per ciclo di allevamento) ---")
        c = roi["costi"]
        print(f"  Stud fee:              €{c['stud_fee']:>10,.0f}")
        print(f"  Riproduzione:          €{c['riproduzione']:>10,.0f}")
        print(f"  Puledro (anno 1):      €{c['puledro_anno1']:>10,.0f}")
        print(f"  Yearling:              €{c['yearling']:>10,.0f}")
        print(f"  Training:              €{c['training']:>10,.0f}")
        print(f"  Attività agonistica:   €{c['attivita_agone']:>10,.0f}")
        print(f"  ---")
        print(f"  Costo base:            €{c['costo_base']:>10,.0f}")
        print(f"  Rischio mortalità ({c['tasso_mortalita']*100:.0f}%): costo se morte €{c['costo_se_morte']:>10,.0f}")
        print(f"  COSTO ATTESO:          €{c['costo_atteso']:>10,.0f}")

        print(f"\n--- RICAVI ATTESI (per voto) ---")
        print(f"  {'Voto':<6} {'P(voto)':>8} {'Guadagno medio':>15} {'Ricavo atteso':>15}")
        print(f"  {'-'*48}")
        for g in GRADE_ORDER:
            b = roi["ricavi"]["breakdown"][g]
            print(f"  {g:<6} {b['probabilita']*100:>7.1f}% €{b['guadagno_medio']:>13,.0f} €{b['ricavo_atteso']:>13,.0f}")
        print(f"  {'-'*48}")
        print(f"  RICAVO ATTESO TOTALE:  €{roi['ricavo_atteso']:>10,.0f}")

        print(f"\n--- RESULTATO ---")
        print(f"  Costo atteso:          €{roi['costo_atteso']:>10,.0f}")
        print(f"  Ricavo atteso:         €{roi['ricavo_atteso']:>10,.0f}")
        print(f"  Utile atteso:          €{roi['utile_atteso']:>10,.0f}")
        print(f"  ROI:                   {roi['roi_pct']:>10}")
        print(f"  P(recupero costi):     {roi['prob_recupero_costi_pct']:>10}")

        if args.sensitivity:
            print(f"\n--- ANALISI DI SENSITIVITÀ ---")
            print(f"  {'Scenario':<15} {'ROI':>10}")
            print(f"  {'-'*25}")
            for s in sensitivity_analysis(stud_fee, probs, grade_earnings):
                print(f"  {s['scenario']:<15} {s['roi_pct']:>10}")

    else:
        # Default: show population-level ROI at different stud fee levels
        print("\n=== ROI PER LIVELLO DI STUD FEE (popolazione) ===")
        print(f"{'Stud Fee':>10} {'Costo Att.':>12} {'Ricavo Att.':>12} {'ROI':>8} {'P(recupero)':>12}")
        print("-" * 60)

        for fee in [0, 500, 1000, 2000, 3000, 5000, 8000, 12000, 15000, 20000, 25000, 35000]:
            roi = calculate_roi(fee, pop_probs, grade_earnings)
            print(f"€{fee:>9,.0f} €{roi['costo_atteso']:>11,.0f} €{roi['ricavo_atteso']:>11,.0f} {roi['roi_pct']:>8} {roi['prob_recupero_costi_pct']:>12}")

    conn.close()


if __name__ == "__main__":
    main()
