/**
 * server/breeding.ts — StatIppica
 * Inferenza del modello di stima accoppiamenti (stallone x fattrice).
 *
 * Il modello viene addestrato offline da train_breeding_model.py (GitHub
 * Actions) ed esportato in breeding_model.json nella root del repo. Qui si fa
 * solo l'inferenza: si "camminano" gli alberi del Gradient Boosting — nessuna
 * dipendenza ML, solo matematica elementare.
 *
 * Da integrare in routes.ts con:
 *   import { predictBreeding } from "./breeding";
 *   app.get("/api/breeding/predict", (req, res) => { ... });
 * (vedi snippet endpoint in fondo al file)
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

// ── Tipi del modello esportato ───────────────────────────────
type TreeNode = { leaf: number } | { f: number; th: number; l: TreeNode; r: TreeNode };
interface GBModel { kind: "regressor" | "classifier"; init: number; learning_rate: number; trees: TreeNode[]; }
interface BreedingModel {
  trained_at: string;
  n_samples: number;
  features: string[];
  medians: Record<string, number>;
  cv_r2_score: number;
  cv_auc_poor: number;
  feature_importances: Record<string, number>;
  score_model: GBModel;
  poor_model: GBModel;
  grade_earnings: Record<string, { avg_earnings: number; n: number }>;
  grade_thresholds: [number, string][];
}

let MODEL: BreedingModel | null = null;

export function loadBreedingModel(modelPath = "breeding_model.json"): boolean {
  try {
    const p = path.resolve(modelPath);
    MODEL = JSON.parse(fs.readFileSync(p, "utf-8"));
    return true;
  } catch {
    MODEL = null;
    return false;
  }
}

// ── Inferenza ────────────────────────────────────────────────
function walkTree(node: TreeNode, x: number[]): number {
  // Convenzione sklearn: si va a sinistra se x[f] <= soglia
  while (!("leaf" in node)) {
    node = x[node.f] <= node.th ? node.l : node.r;
  }
  return node.leaf;
}

function gbPredict(model: GBModel, x: number[]): number {
  let acc = model.init;
  for (const tree of model.trees) acc += model.learning_rate * walkTree(tree, x);
  return acc;
}

function sigmoid(z: number): number { return 1 / (1 + Math.exp(-z)); }

function scoreToGrade(score: number, thresholds: [number, string][]): string {
  for (const [th, g] of thresholds) if (score >= th) return g;
  return "F";
}

// ── Estrazione feature dal DB ────────────────────────────────
interface HorseFeatures {
  time: number | null; earn: number | null; win: number | null;
  score: number | null; races: number | null; sireName: string | null;
}

function getHorseFeatures(db: Database.Database, name: string): HorseFeatures | null {
  const row = db.prepare(`
    SELECT r.time_percentile AS time, r.earn_percentile AS earn,
           r.win_rate AS win, r.score AS score, r.career_races AS races,
           h.sire AS sireName
    FROM horse_ratings r
    LEFT JOIN horses h ON h.name = r.name
    WHERE UPPER(TRIM(r.name)) = UPPER(TRIM(?)) AND r.rating_mode = 'performance'
    LIMIT 1
  `).get(name) as HorseFeatures | undefined;
  return row ?? null;
}

function getTimePercentile(db: Database.Database, name: string | null): number | null {
  if (!name) return null;
  const row = db.prepare(`
    SELECT time_percentile AS t FROM horse_ratings
    WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
    LIMIT 1
  `).get(name) as { t: number | null } | undefined;
  return row?.t ?? null;
}

// ── API principale ───────────────────────────────────────────
export interface BreedingPrediction {
  ok: boolean;
  error?: string;
  stallion?: string;
  mare?: string;
  predicted_score?: number;
  predicted_grade?: string;
  poor_foal_probability?: number;   // P(voto D, E o F)
  expected_earnings?: number;        // guadagni carriera attesi (dalla mappa voto->media storica)
  stud_fee?: number | null;
  roi_estimate?: number | null;      // (guadagni attesi - prezzo monta) / prezzo monta
  missing_data?: string[];           // feature riempite con la mediana (trasparenza)
  model_info?: { trained_at: string; n_samples: number; cv_r2: number; cv_auc: number };
}

export function predictBreeding(db: Database.Database, stallionName: string, mareName: string): BreedingPrediction {
  if (!MODEL) {
    if (!loadBreedingModel()) {
      return { ok: false, error: "Modello non disponibile: breeding_model.json mancante. Eseguire train_breeding_model.py." };
    }
  }
  const M = MODEL!;

  const s = getHorseFeatures(db, stallionName);
  const m = getHorseFeatures(db, mareName);
  if (!s) return { ok: false, error: `Stallone '${stallionName}' senza rating nel database (serve che abbia corso).` };
  if (!m) return { ok: false, error: `Fattrice '${mareName}' senza rating nel database (serve che abbia corso).` };

  const dsTime = getTimePercentile(db, m.sireName); // padre della fattrice
  const ssTime = getTimePercentile(db, s.sireName); // padre dello stallone

  const featureValues: Record<string, number | null> = {
    s_time: s.time, s_earn: s.earn, s_win: s.win, s_score: s.score, s_races: s.races,
    m_time: m.time, m_earn: m.earn, m_win: m.win, m_score: m.score, m_races: m.races,
    ds_time: dsTime, ss_time: ssTime,
  };

  const missing: string[] = [];
  const x = M.features.map((f) => {
    const v = featureValues[f];
    if (v === null || v === undefined) { missing.push(f); return M.medians[f] ?? 0; }
    return v;
  });

  const predictedScore = Math.max(0, Math.min(100, gbPredict(M.score_model, x)));
  const poorProb = sigmoid(gbPredict(M.poor_model, x));
  const grade = scoreToGrade(predictedScore, M.grade_thresholds);
  const expectedEarnings = M.grade_earnings[grade]?.avg_earnings ?? null;

  // Prezzo di monta dello stallone, se disponibile in tabella stallions
  const feeRow = db.prepare(`
    SELECT stud_fee_eur FROM stallions WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1
  `).get(stallionName) as { stud_fee_eur: number | null } | undefined;
  const studFee = feeRow?.stud_fee_eur ?? null;

  let roi: number | null = null;
  if (studFee && studFee > 0 && expectedEarnings !== null) {
    roi = Math.round(((expectedEarnings - studFee) / studFee) * 100) / 100;
  }

  return {
    ok: true,
    stallion: stallionName,
    mare: mareName,
    predicted_score: Math.round(predictedScore * 10) / 10,
    predicted_grade: grade,
    poor_foal_probability: Math.round(poorProb * 1000) / 1000,
    expected_earnings: expectedEarnings ?? undefined,
    stud_fee: studFee,
    roi_estimate: roi,
    missing_data: missing,
    model_info: {
      trained_at: M.trained_at, n_samples: M.n_samples,
      cv_r2: M.cv_r2_score, cv_auc: M.cv_auc_poor,
    },
  };
}

/* ── Snippet endpoint da aggiungere in routes.ts ──────────────

import { predictBreeding, loadBreedingModel } from "./breeding";

loadBreedingModel(); // all'avvio del server

app.get("/api/breeding/predict", (req, res) => {
  const stallion = String(req.query.stallion ?? "");
  const mare = String(req.query.mare ?? "");
  if (!stallion || !mare) {
    return res.status(400).json({ ok: false, error: "Parametri richiesti: stallion, mare" });
  }
  const result = predictBreeding(db, stallion, mare);
  res.status(result.ok ? 200 : 404).json(result);
});

──────────────────────────────────────────────────────────────── */
