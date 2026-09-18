#!/usr/bin/env python3
"""Genera i grafici per il capitolo ROI della tesi."""

import json
import sqlite3
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
from pathlib import Path

# Config
plt.rcParams.update({
    'font.size': 11,
    'axes.titlesize': 14,
    'axes.labelsize': 12,
    'figure.dpi': 150,
    'savefig.dpi': 200,
    'savefig.bbox': 'tight',
    'axes.grid': True,
    'grid.alpha': 0.3,
})
plt.rcParams['font.family'] = 'DejaVu Sans'

DB_PATH = Path(__file__).parent / "data.db"
OUT_DIR = Path(__file__).parent / "docs" / "roi_charts"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Colori
COLOR_PRIMARY = '#1a5276'
COLOR_ACCENT = '#e74c3c'
COLOR_GREEN = '#27ae60'
COLOR_ORANGE = '#f39c12'
COLORS_GRADE = ['#8e44ad', '#2980b9', '#1abc9c', '#27ae60', '#f1c40f', '#e67e22', '#e74c3c', '#c0392b', '#7f8c8d']

GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"]

# Carica dati
with open(Path(__file__).parent / "roi_analysis_output.json") as f:
    roi_data = json.load(f)

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

# ─── 1. Distribuzione guadagni per voto ───
fig, ax = plt.subplots(figsize=(10, 6))
grade_earn = roi_data["grade_earnings"]
grades = [g for g in GRADE_ORDER if g in grade_earn]
avgs = [grade_earn[g]["avg_earnings"] for g in grades]
ns = [grade_earn[g]["n"] for g in grades]
colors = COLORS_GRADE[:len(grades)]

bars = ax.bar(grades, avgs, color=colors, edgecolor='white', linewidth=0.8)
ax.set_xlabel('Voto di Performance')
ax.set_ylabel('Guadagno medio di carriera (€)')
ax.set_title('Guadagno medio per voto di performance\n(16.585 cavalli, database StatIppica)')
ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'€{x:,.0f}'))

for bar, avg, n in zip(bars, avgs, ns):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() * 1.02,
            f'€{avg:,.0f}\n(n={n})', ha='center', va='bottom', fontsize=9)

ax.set_ylim(0, max(avgs) * 1.25)
plt.tight_layout()
plt.savefig(OUT_DIR / '01_grade_earnings.png')
plt.close()
print("1. Grade earnings distribution")

# ─── 2. ROI per stud fee (popolazione) ───
from roi_model import calculate_roi, grade_probabilities_population, grade_earnings_from_db

pop_probs = roi_data["population_probabilities"]
fees = list(range(0, 36000, 500))
rois = []
for fee in fees:
    r = calculate_roi(fee, pop_probs, grade_earn)
    rois.append(r["roi"] * 100)

fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(fees, rois, color=COLOR_PRIMARY, linewidth=2.5)
ax.axhline(y=0, color=COLOR_GREEN, linestyle='--', linewidth=1.5, label='Break-even (ROI = 0%)')
ax.fill_between(fees, rois, 0, where=[r < 0 for r in rois], color=COLOR_ACCENT, alpha=0.15)
ax.fill_between(fees, rois, 0, where=[r >= 0 for r in rois], color=COLOR_GREEN, alpha=0.15)
ax.set_xlabel('Stud Fee (€)')
ax.set_ylabel('ROI atteso (%)')
ax.set_title('ROI atteso per livello di stud fee\n(modello popolazione generale)')
ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'€{x:,.0f}'))
ax.legend(loc='upper right')
plt.tight_layout()
plt.savefig(OUT_DIR / '02_roi_by_studfee.png')
plt.close()
print("2. ROI by stud fee")

# ─── 3. Top 15 stalloni per ROI ───
results = sorted(roi_data["results"], key=lambda x: -x["roi"])[:15]
names = [r["stallone"] for r in results]
roi_vals = [r["roi"] * 100 for r in results]
fees_vals = [r["stud_fee"] for r in results]
colors_bar = [COLOR_GREEN if r > 0 else COLOR_ACCENT for r in roi_vals]

fig, ax = plt.subplots(figsize=(12, 7))
y_pos = np.arange(len(names))
bars = ax.barh(y_pos, roi_vals, color=colors_bar, edgecolor='white')
ax.set_yticks(y_pos)
ax.set_yticklabels(names)
ax.invert_yaxis()
ax.set_xlabel('ROI atteso (%)')
ax.set_title('Top 15 stalloni per ROI atteso\n(dati reali: stud fee 2026 + guadagni carriera figli)')

for bar, r, fee in zip(bars, roi_vals, fees_vals):
    label = f'{r:+.1f}% (fee €{fee:,.0f})'
    if r >= 0:
        ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2,
                label, ha='left', va='center', fontsize=9)
    else:
        ax.text(bar.get_width() - 1, bar.get_y() + bar.get_height()/2,
                label, ha='right', va='center', fontsize=9, color='white', fontweight='bold')

ax.axvline(x=0, color='black', linewidth=0.8)
ax.set_xlim(min(roi_vals) - 15, max(roi_vals) + 20)
plt.tight_layout()
plt.savefig(OUT_DIR / '03_top15_roi.png')
plt.close()
print("3. Top 15 stalloni ROI")

# ─── 4. Monte Carlo distribution per Varenne ───
# Estrai i dati di guadagno per grado
import random
random.seed(42)

grade_data = {}
for g in GRADE_ORDER:
    rows = conn.execute("""
        SELECT career_earnings FROM horse_ratings
        WHERE rating_mode='performance' AND grade=? 
          AND career_earnings IS NOT NULL AND career_earnings > 0
    """, (g,)).fetchall()
    grade_data[g] = [r[0] for r in rows]

from roi_model import grade_probabilities_sire, costi_fissi_allevamento, COSTI

sire_probs = grade_probabilities_sire(conn, "VARENNE")
probs = sire_probs or pop_probs
stud_fee = 8500
costi = costi_fissi_allevamento(stud_fee)
costo_atteso = costi["costo_atteso"]
tasso_morte = COSTI["tasso_mortalita_neonatale"]

outcomes = []
for _ in range(10000):
    if random.random() < tasso_morte:
        outcomes.append(-(stud_fee + costi["riproduzione"]))
        continue
    r = random.random()
    cumulative = 0
    selected = "F"
    for g in GRADE_ORDER:
        cumulative += probs.get(g, 0)
        if r <= cumulative:
            selected = g
            break
    data = grade_data.get(selected, [])
    earnings = random.choice(data) if data else 0
    outcomes.append(earnings - costo_atteso)

fig, ax = plt.subplots(figsize=(10, 6))
n, bins, patches = ax.hist(outcomes, bins=100, color=COLOR_PRIMARY, alpha=0.7, edgecolor='white')
ax.axvline(x=0, color=COLOR_GREEN, linewidth=2, linestyle='--', label='Break-even')
ax.axvline(x=np.median(outcomes), color=COLOR_ORANGE, linewidth=2, linestyle='-', label=f'Mediana: €{np.median(outcomes):,.0f}')
ax.axvline(x=np.mean(outcomes), color=COLOR_ACCENT, linewidth=2, linestyle='-', label=f'Media: €{np.mean(outcomes):,.0f}')
ax.set_xlabel('Risultato economico per ciclo di allevamento (€)')
ax.set_ylabel('Frequenza (simulazioni)')
ax.set_title('Simulazione Monte Carlo: distribuzione dei risultati\nper accoppiamento con Varenne (stud fee €8.500)')
ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'€{x:,.0f}'))
ax.legend(loc='upper right')
plt.tight_layout()
plt.savefig(OUT_DIR / '04_montecarlo_varenne.png')
plt.close()
print("4. Monte Carlo Varenne")

# ─── 5. Cost breakdown pie chart ───
costi_dict = costi_fissi_allevamento(8500)
labels = ['Stud fee', 'Riproduzione', 'Puledro (anno 1)', 'Yearling', 'Training', 'Attività agonistica']
sizes = [costi_dict['stud_fee'], costi_dict['riproduzione'], costi_dict['puledro_anno1'],
         costi_dict['yearling'], costi_dict['training'], costi_dict['attivita_agone']]
colors_pie = ['#8e44ad', '#2980b9', '#1abc9c', '#f1c40f', '#e67e22', '#e74c3c']

fig, ax = plt.subplots(figsize=(8, 8))
wedges, texts, autotexts = ax.pie(sizes, labels=labels, autopct=lambda p: f'€{p*sum(sizes)/100:,.0f}\n({p:.1f}%)',
                                  colors=colors_pie, startangle=90, textprops={'fontsize': 10})
ax.set_title('Breakdown costi allevamento (Varenne, stud fee €8.500)\nCosto totale atteso: €{:,.0f}'.format(costi_dict['costo_atteso']))
plt.tight_layout()
plt.savefig(OUT_DIR / '05_cost_breakdown.png')
plt.close()
print("5. Cost breakdown")

# ─── 6. Sensitivity analysis per Varenne ───
from roi_model import sensitivity_analysis
sens = sensitivity_analysis(8500, probs, grade_earn)
scenarios = [s["scenario"] for s in sens]
roi_sens = [s["roi"] * 100 for s in sens]

fig, ax = plt.subplots(figsize=(10, 6))
colors_sens = [COLOR_GREEN if r > 0 else COLOR_ACCENT for r in roi_sens]
bars = ax.bar(range(len(scenarios)), roi_sens, color=colors_sens, edgecolor='white')
ax.set_xticks(range(len(scenarios)))
ax.set_xticklabels(scenarios, rotation=0)
ax.set_ylabel('ROI (%)')
ax.set_title('Analisi di sensitività: Varenne (€8.500)\nVariazione probabilità figli top-grade (SSS+SS+S)')
ax.axhline(y=0, color='black', linewidth=0.8)
for bar, r in zip(bars, roi_sens):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + (0.5 if r >= 0 else -1.5),
            f'{r:+.1f}%', ha='center', fontsize=9)
plt.tight_layout()
plt.savefig(OUT_DIR / '06_sensitivity_varenne.png')
plt.close()
print("6. Sensitivity Varenne")

# ─── 7. Scatter: stud fee vs ROI ───
all_results = roi_data["results"]
fees_scatter = [r["stud_fee"] for r in all_results]
roi_scatter = [r["roi"] * 100 for r in all_results]
grades_scatter = [r["grade"] for r in all_results]

grade_color_map = {"SSS": '#8e44ad', "SS": '#2980b9', "S": '#1abc9c', "A": '#27ae60',
                   "B": '#f1c40f', "C": '#e67e22', "D": '#e74c3c', "E": '#c0392b', "F": '#7f8c8d'}
colors_scatter = [grade_color_map.get(g, '#7f8c8d') for g in grades_scatter]

fig, ax = plt.subplots(figsize=(12, 7))
ax.scatter(fees_scatter, roi_scatter, c=colors_scatter, s=80, edgecolors='white', linewidth=0.5, zorder=5)
ax.axhline(y=0, color='black', linewidth=1, linestyle='--')

# Annotazioni per stalloni notevoli
notable = {"VARENNE", "FACE TIME BOURBON", "RAJA MIRCHI", "READLY EXPRESS", "MAHARAJAH", "MUSCLE MASS", "DONATO HANOVER"}
for r in all_results:
    if r["stallone"] in notable:
        ax.annotate(r["stallone"], (r["stud_fee"], r["roi"]*100),
                    textcoords="offset points", xytext=(8, 5), fontsize=8, fontweight='bold')

ax.set_xlabel('Stud Fee (€)')
ax.set_ylabel('ROI atteso (%)')
ax.set_title('Stud Fee vs ROI atteso per stallone\n(colore = voto performance dello stallone)')
ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'€{x:,.0f}'))

# Legenda
from matplotlib.lines import Line2D
legend_elements = [Line2D([0], [0], marker='o', color='w', markerfacecolor=c, markersize=10, label=g)
                   for g, c in grade_color_map.items() if g in set(grades_scatter)]
ax.legend(handles=legend_elements, loc='upper right', title='Voto stallone', fontsize=9)
plt.tight_layout()
plt.savefig(OUT_DIR / '07_fee_vs_roi_scatter.png')
plt.close()
print("7. Scatter fee vs ROI")

conn.close()
print(f"\nTutti i grafici salvati in {OUT_DIR}/")
