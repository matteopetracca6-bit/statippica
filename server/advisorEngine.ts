/**
 * server/advisorEngine.ts — StatIppica
 *
 * Motore dell'Advisor: stima il voto atteso del puledro di una coppia
 * (stallone x fattrice), con fascia di incertezza, rischio di
 * consanguineita' e spiegazione in italiano.
 *
 * I pesi arrivano da advisor_model.json, prodotto da scripts/advisor_model.py.
 * Qui NON si addestra nulla: si applicano i pesi e si leggono i dati.
 *
 * Perche' due indizi e non uno
 * ----------------------------
 * Prima l'Advisor guardava solo il padre, quindi dava la stessa risposta con
 * qualsiasi fattrice. Ora combina:
 *   indizio del padre  = voto medio dei suoi figli, attenuato se sono pochi
 *   indizio della madre = voto medio dei figli della fattrice (o della sua
 *                         linea materna), attenuato allo stesso modo
 * L'attenuazione (shrinkage) evita che una madre con un solo figlio fortunato
 * valga come una con venti figli.
 */

import fs from "fs";
import path from "path";
import type { Database as DB } from "better-sqlite3";

export interface AdvisorModel {
  version: number;
  trained_on: number;
  population_mean: number;
  k_sire: number;
  k_dam: number;
  intercept: number;
  w_sire: number;
  w_dam: number;
  residual_sd: number;
  backtest_summary?: Record<string, number>;
}

let MODEL: AdvisorModel | null = null;
let BACKTEST: any = null;

export function loadAdvisorModel(root = process.cwd()): boolean {
  try {
    MODEL = JSON.parse(fs.readFileSync(path.join(root, "advisor_model.json"), "utf8"));
  } catch { MODEL = null; }
  try {
    BACKTEST = JSON.parse(fs.readFileSync(path.join(root, "advisor_backtest.json"), "utf8"));
  } catch { BACKTEST = null; }
  return MODEL !== null;
}

export function getAdvisorModel(): AdvisorModel | null { return MODEL; }
export function getAdvisorBacktest(): any { return BACKTEST; }

/** Fallback prudente se il file dei pesi manca: solo la media generale. */
function model(): AdvisorModel {
  return MODEL ?? {
    version: 0, trained_on: 0, population_mean: 38.5, k_sire: 8, k_dam: 2,
    intercept: 0, w_sire: 0.5, w_dam: 0.2, residual_sd: 25,
  };
}

const GRADE_LIST = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

/** Attenua una media verso la media generale quando i casi sono pochi. */
function shrink(avg: number | null, n: number, mean: number, k: number) {
  if (avg === null || !n || n <= 0) return { value: mean, weight: 0, n: 0 };
  const w = n / (n + k);
  return { value: mean + w * (avg - mean), weight: w, n };
}

export interface ParentSignal {
  name: string;
  avg_score: number | null;
  n_offspring: number;
  effect: number;
  confidence: number;      // 0..1: quanto ci si puo' fidare del campione
  source: string;          // da dove arriva l'indizio
}

/** Indizio del padre: voto medio dei figli valutati. */
export function sireSignal(db: DB, stallion: string): ParentSignal {
  const m = model();
  const row = db.prepare(`
    SELECT AVG(score) AS avg_score, COUNT(*) AS n
    FROM horse_ratings
    WHERE rating_mode = 'performance' AND score IS NOT NULL
      AND UPPER(TRIM(sire)) = UPPER(TRIM(?))
  `).get(stallion) as any;
  const s = shrink(row?.avg_score ?? null, row?.n ?? 0, m.population_mean, m.k_sire);
  return {
    name: stallion,
    avg_score: row?.avg_score != null ? Math.round(row.avg_score * 10) / 10 : null,
    n_offspring: row?.n ?? 0,
    effect: s.value,
    confidence: Math.round(s.weight * 100) / 100,
    source: (row?.n ?? 0) > 0 ? "figli valutati" : "media generale (nessun figlio valutato)",
  };
}

/**
 * Indizio della madre. Tre livelli, dal piu' informativo al piu' debole:
 *  1. i figli valutati della fattrice
 *  2. se non ne ha, la produzione della NONNA materna (la madre della madre):
 *     la linea femminile e' il secondo indizio migliore
 *  3. altrimenti la media generale, e lo si dice
 */
export function damSignal(db: DB, mare: string): ParentSignal {
  const m = model();
  const own = db.prepare(`
    SELECT AVG(r.score) AS avg_score, COUNT(*) AS n
    FROM horse_ratings r
    JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
    WHERE r.rating_mode = 'performance' AND r.score IS NOT NULL
      AND UPPER(TRIM(h.dam)) = UPPER(TRIM(?))
  `).get(mare) as any;

  if ((own?.n ?? 0) > 0) {
    const s = shrink(own.avg_score, own.n, m.population_mean, m.k_dam);
    return {
      name: mare,
      avg_score: Math.round(own.avg_score * 10) / 10,
      n_offspring: own.n,
      effect: s.value,
      confidence: Math.round(s.weight * 100) / 100,
      source: `${own.n} figli valutati della fattrice`,
    };
  }

  // Livello 2: la nonna materna
  const gran = db.prepare("SELECT dam FROM horses WHERE name = ? LIMIT 1").get(mare) as any;
  if (gran?.dam) {
    const g = db.prepare(`
      SELECT AVG(r.score) AS avg_score, COUNT(*) AS n
      FROM horse_ratings r
      JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
      WHERE r.rating_mode = 'performance' AND r.score IS NOT NULL
        AND UPPER(TRIM(h.dam)) = UPPER(TRIM(?))
    `).get(gran.dam) as any;
    if ((g?.n ?? 0) > 0) {
      // Meta' peso: e' una generazione piu' lontana.
      const s = shrink(g.avg_score, g.n, m.population_mean, m.k_dam * 2);
      return {
        name: mare,
        avg_score: Math.round(g.avg_score * 10) / 10,
        n_offspring: g.n,
        effect: s.value,
        confidence: Math.round(s.weight * 100) / 100,
        source: `nessun figlio valutato: si usa la linea materna (${gran.dam})`,
      };
    }
  }

  return {
    name: mare, avg_score: null, n_offspring: 0, effect: m.population_mean,
    confidence: 0, source: "nessun dato sulla produzione: si usa la media generale",
  };
}

export interface Prediction {
  expected_score: number;
  band_low: number;
  band_high: number;
  typical_low: number;
  typical_high: number;
  residual_sd: number;
  confidence: number;
  confidence_label: string;
  sire: ParentSignal;
  dam: ParentSignal;
  population_mean: number;
  expected_grade: string;
  prob_top: number;     // probabilita' di un figlio di alto livello (score >= 60)
  prob_poor: number;    // probabilita' di un figlio scarso (score < 20)
}

/** Funzione di ripartizione normale, per le probabilita'. */
function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

function gradeFromScore(score: number): string {
  if (score >= 75) return "SSS";
  if (score >= 62) return "SS";
  if (score >= 52) return "S";
  if (score >= 43) return "A";
  if (score >= 34) return "B";
  if (score >= 26) return "C";
  if (score >= 18) return "D";
  if (score >= 9) return "E";
  return "F";
}

export function predictPair(db: DB, stallion: string, mare: string): Prediction {
  const m = model();
  const sire = sireSignal(db, stallion);
  const dam = damSignal(db, mare);
  const raw = m.intercept + m.w_sire * sire.effect + m.w_dam * dam.effect;
  const expected = Math.max(0, Math.min(100, raw));

  // Fiducia complessiva: media dei due campioni, con piu' peso al padre.
  const conf = Math.round((0.6 * sire.confidence + 0.4 * dam.confidence) * 100) / 100;
  const sd = m.residual_sd;

  return {
    expected_score: Math.round(expected * 10) / 10,
    // fascia larga (circa 90 casi su 100)
    band_low: Math.max(0, Math.round((expected - 1.64 * sd) * 10) / 10),
    band_high: Math.min(100, Math.round((expected + 1.64 * sd) * 10) / 10),
    // fascia dei casi tipici (circa 50 su 100)
    typical_low: Math.max(0, Math.round((expected - 0.674 * sd) * 10) / 10),
    typical_high: Math.min(100, Math.round((expected + 0.674 * sd) * 10) / 10),
    residual_sd: sd,
    confidence: conf,
    confidence_label: conf >= 0.75 ? "alta" : conf >= 0.45 ? "media" : "bassa",
    sire, dam,
    population_mean: m.population_mean,
    expected_grade: gradeFromScore(expected),
    prob_top: Math.round((1 - normCdf((60 - expected) / sd)) * 1000) / 10,
    prob_poor: Math.round(normCdf((20 - expected) / sd) * 1000) / 10,
  };
}

// ── Consanguineita' su piu' generazioni ────────────────────────────

export interface InbreedingResult {
  available: boolean;
  common_ancestors: { name: string; sire_gen: number; dam_gen: number; contribution: number }[];
  coefficient_pct: number;     // stima del coefficiente di parentela
  level: "nessuna" | "bassa" | "media" | "alta";
  note: string;
}

/**
 * Cerca gli antenati in comune fra stallone e fattrice usando l'albero
 * completo (vp_pedigree), non solo genitori e nonni come prima.
 * La stima del coefficiente segue Wright: ogni antenato in comune
 * contribuisce (1/2)^(gen_padre + gen_madre + 1).
 */
export function inbreeding(db: DB, stallion: string, mare: string): InbreedingResult {
  const idOf = db.prepare("SELECT id FROM vp_names WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1");
  const sid = (idOf.get(stallion) as any)?.id;
  const mid = (idOf.get(mare) as any)?.id;
  if (!sid || !mid) {
    return {
      available: false, common_ancestors: [], coefficient_pct: 0, level: "nessuna",
      note: "Albero genealogico non disponibile per almeno uno dei due: il controllo di parentela non e' stato possibile.",
    };
  }

  const anc = db.prepare(`
    SELECT ancestor_id, MIN(LENGTH(path)) AS gen FROM vp_pedigree
    WHERE horse_id = ? GROUP BY ancestor_id
  `);
  const sMap = new Map<number, number>();
  for (const r of anc.all(sid) as any[]) sMap.set(r.ancestor_id, r.gen);
  const mMap = new Map<number, number>();
  for (const r of anc.all(mid) as any[]) mMap.set(r.ancestor_id, r.gen);

  const nameOf = db.prepare("SELECT name FROM vp_names WHERE id = ? LIMIT 1");
  const common: InbreedingResult["common_ancestors"] = [];
  let coeff = 0;
  // Array.from invece di iterare la Map: il target di compilazione e' ES5.
  for (const [aid, sg] of Array.from(sMap.entries())) {
    const mg = mMap.get(aid);
    if (mg === undefined) continue;
    const contrib = Math.pow(0.5, sg + mg + 1);
    coeff += contrib;
    common.push({
      name: (nameOf.get(aid) as any)?.name ?? `#${aid}`,
      sire_gen: sg, dam_gen: mg,
      contribution: Math.round(contrib * 100000) / 1000,
    });
  }
  common.sort((a, b) => b.contribution - a.contribution);

  const pct = Math.round(coeff * 10000) / 100;
  const level = pct >= 6.25 ? "alta" : pct >= 3.125 ? "media" : pct > 0 ? "bassa" : "nessuna";
  const note = pct === 0
    ? "Nessun antenato in comune trovato nelle generazioni disponibili."
    : `Stima del grado di parentela del puledro: ${pct.toFixed(2)}%. `
      + (level === "alta"
        ? "E' un valore alto: in genere si preferisce restare sotto il 6%."
        : level === "media"
          ? "Valore medio: accettabile, ma da tenere presente."
          : "Valore contenuto, in linea con la normale pratica di allevamento.");

  return { available: true, common_ancestors: common.slice(0, 12), coefficient_pct: pct, level, note };
}

// ── Spiegazione in italiano ────────────────────────────────────────

export function explain(p: Prediction, inb: InbreedingResult, fee: number | null): string[] {
  const out: string[] = [];
  const diff = p.expected_score - p.population_mean;
  const verso = diff >= 0 ? "sopra" : "sotto";
  out.push(
    `Voto atteso ${p.expected_score.toFixed(1)}, cioe' ${Math.abs(diff).toFixed(1)} punti `
    + `${verso} la media di ${p.population_mean.toFixed(1)}.`
  );
  if (p.sire.n_offspring > 0) {
    out.push(
      `Il padre ha ${p.sire.n_offspring} figli gia' valutati, con voto medio `
      + `${p.sire.avg_score?.toFixed(1)}: ${p.sire.confidence >= 0.7 ? "campione solido" : "campione ancora limitato"}.`
    );
  } else {
    out.push("Il padre non ha ancora figli valutati: la stima si appoggia alla media generale.");
  }
  if (p.dam.n_offspring > 0 && p.dam.source.startsWith("nessun figlio")) {
    out.push(`La fattrice non ha figli valutati, quindi si guarda la sua linea materna (${p.dam.source.replace(/^.*\(/, "").replace(/\)$/, "")}).`);
  } else if (p.dam.n_offspring > 0) {
    out.push(
      `La fattrice ha ${p.dam.n_offspring} figli valutati, con voto medio `
      + `${p.dam.avg_score?.toFixed(1)}: ${p.dam.avg_score! >= p.population_mean ? "alza" : "abbassa"} la stima.`
    );
  } else {
    out.push("Della fattrice non si sa nulla sulla produzione: il suo contributo e' neutro e la stima e' meno affidabile.");
  }
  out.push(
    `Un figlio di alto livello ha circa ${p.prob_top.toFixed(0)} probabilita' su 100; `
    + `un figlio deludente circa ${p.prob_poor.toFixed(0)} su 100.`
  );
  if (inb.level !== "nessuna") {
    const top = inb.common_ancestors[0];
    out.push(
      `Parentela stimata ${inb.coefficient_pct.toFixed(2)}% (${inb.level})`
      + (top ? `, principalmente per ${top.name}, che compare in entrambi gli alberi.` : ".")
    );
  }
  if (fee && fee > 0) out.push(`Costo della monta: ${fee.toLocaleString("it-IT")} euro.`);
  out.push(
    `Attendibilita' complessiva: ${p.confidence_label}. La stima e' una media, non una `
    + `previsione sul singolo puledro: il caso pesa piu' della genetica su un solo figlio.`
  );
  return out;
}

export { GRADE_LIST, gradeFromScore };
