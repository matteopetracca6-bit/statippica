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
  // Versione 3, verificata su tutti i nati (anche chi non corre). Le due
  // probabilita' qui sopra vengono da una curva teorica e non sono verificate:
  // restano per compatibilita', il sito mostra queste.
  puledro: PrevisionePuledro;
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
    // ATTENZIONE A COME SI CHIAMA QUESTA COSA. Non misura quanto e' affidabile
    // la previsione: misura solo quanto materiale c'e' sui due genitori, cioe'
    // quanti figli valutati hanno. Uno stallone con 200 figli da' un indizio
    // ben misurato; resta un indizio debole, perche' il modello che lo usa
    // spiega il 2,3% dei risultati.
    //
    // Le etichette erano "alta / media / bassa" accanto a un voto atteso, e
    // quasi tutti gli stalloni uscivano "media": chi leggeva capiva "il
    // consiglio e' mediamente affidabile", che e' falso. Sono diventate
    // "molti dati / dati sufficienti / pochi dati": dicono la stessa cosa senza
    // promettere quello che il modello non mantiene.
    confidence_label: conf >= 0.75 ? "molti dati"
                    : conf >= 0.45 ? "dati sufficienti"
                    : "pochi dati",
    sire, dam,
    population_mean: m.population_mean,
    expected_grade: gradeFromScore(expected),
    prob_top: Math.round((1 - normCdf((60 - expected) / sd)) * 1000) / 10,
    prob_poor: Math.round(normCdf((20 - expected) / sd) * 1000) / 10,
    puledro: predictPuledro(db, stallion, mare),
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

// ── Previsione dei puledri, versione 3 ────────────────────────────────
// Due probabilita' per OGNI puledro nato, contando anche chi non corre:
//   prob_corre : arriva alle corse
//   prob_buono : diventa un buon cavallo (25% migliore dei nati dell'anno)
// Pesi e taratura arrivano da puledri_model.json (scripts/puledri_model.py);
// il calcolo qui deve restare identico a _costruisci() dello script.

interface PuledriModel {
  versione: number;
  base: { corre: number; buono: number };
  k: Record<string, number>;
  informazioni: string[];
  pesi: { corre: number[]; buono: number[] };
  taratura: { corre: number[]; buono: number[] };
  soglie_buono: Record<string, number>;
  sperimentale: boolean;
  stato: string;
}

let PULEDRI: PuledriModel | null = null;
let PULEDRI_VERIFICA: any = null;

export function loadPuledriModel(root = process.cwd()): boolean {
  try {
    PULEDRI = JSON.parse(fs.readFileSync(path.join(root, "puledri_model.json"), "utf8"));
  } catch { PULEDRI = null; }
  try {
    PULEDRI_VERIFICA = JSON.parse(fs.readFileSync(path.join(root, "puledri_verifica.json"), "utf8"));
  } catch { PULEDRI_VERIFICA = null; }
  return PULEDRI !== null;
}
export function getPuledriVerifica(): any { return PULEDRI_VERIFICA; }

interface Conto { n: number; c: number; b: number }
interface Archivio {
  quando: number;
  padre: Map<string, Conto>;
  madre: Map<string, Conto>;
  padreMadre: Map<string, Conto>;
  infoCavallo: Map<string, { anno: number | null; padre: string; madre: string }>;
}
let ARCHIVIO: Archivio | null = null;
const DURATA_ARCHIVIO_MS = 60 * 60 * 1000;

/** Conti per padre, madre e padre della madre, letti una volta all'ora. */
function archivio(db: DB, m: PuledriModel): Archivio {
  if (ARCHIVIO && Date.now() - ARCHIVIO.quando < DURATA_ARCHIVIO_MS) return ARCHIVIO;
  const righe = db.prepare(`
    SELECT h.sire AS padre, h.dam AS madre, COALESCE(d.sire, '') AS padre_madre,
           COALESCE(h.career_races, 0) > 0 AS corre,
           CASE WHEN COALESCE(h.career_races, 0) > 0 AND r.score >= CAST(t.value AS REAL)
                THEN 1 ELSE 0 END AS buono
    FROM horses h
    JOIN json_each(?) t ON t.key = CAST(h.birth_year AS TEXT)
    LEFT JOIN horse_ratings r ON r.name = h.name AND r.birth_year = h.birth_year
                             AND r.rating_mode = 'performance'
    LEFT JOIN horses d ON d.rowid = (SELECT rowid FROM horses WHERE name = h.dam LIMIT 1)
    WHERE COALESCE(h.horse_class, 'athlete') <> 'breeder'
      AND h.name NOT GLOB '* ([A-Z]*)'
      AND COALESCE(TRIM(h.sire), '') <> '' AND COALESCE(TRIM(h.dam), '') <> ''
  `).all(JSON.stringify(m.soglie_buono)) as any[];
  const somma = (mp: Map<string, Conto>, k: string, r: any) => {
    if (!k) return;
    const v = mp.get(k) ?? { n: 0, c: 0, b: 0 };
    v.n += 1; v.c += r.corre ? 1 : 0; v.b += r.buono ? 1 : 0;
    mp.set(k, v);
  };
  const a: Archivio = { quando: Date.now(), padre: new Map(), madre: new Map(), padreMadre: new Map(), infoCavallo: new Map() };
  for (const r of righe) {
    somma(a.padre, r.padre, r);
    somma(a.madre, r.madre, r);
    somma(a.padreMadre, r.padre_madre, r);
  }
  ARCHIVIO = a;
  return a;
}

function quota(c: Conto | undefined, campo: "corre" | "buono", base: number, k: number) {
  const n = c?.n ?? 0;
  if (n <= 0) return { q: base, n: 0 };
  const s = campo === "corre" ? c!.c : c!.b;
  const w = n / (n + k);
  return { q: base + w * (s / n - base), n };
}
const logit = (p: number) => { const x = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(x / (1 - x)); };
const sigm = (z: number) => 1 / (1 + Math.exp(-z));

export interface PrevisionePuledro {
  disponibile: boolean;
  prob_corre: number | null;     // su 100
  prob_buono: number | null;     // su 100
  media_buono: number;           // su 100: un puledro qualsiasi
  figli_padre: number;
  figli_madre: number;
  sperimentale: boolean;
  stato: string;
}

export function predictPuledro(db: DB, stallion: string, mare: string): PrevisionePuledro {
  const m = PULEDRI;
  if (!m) {
    return { disponibile: false, prob_corre: null, prob_buono: null, media_buono: 25,
             figli_padre: 0, figli_madre: 0, sperimentale: true, stato: "modello non disponibile" };
  }
  const a = archivio(db, m);
  const S = stallion.trim().toUpperCase();
  const M = mare.trim().toUpperCase();
  const info = db.prepare("SELECT birth_year, sire, dam FROM horses WHERE name = ? LIMIT 1").get(M) as any;
  const annoPuledro = new Date().getFullYear() + 1;
  const usa = new Set(m.informazioni);
  const out: Record<string, number> = {};
  for (const campo of ["corre", "buono"] as const) {
    const base = m.base[campo];
    const qp = quota(a.padre.get(S), campo, base, m.k.padre);
    const v = [1, logit(qp.q)];
    const qm = quota(a.madre.get(M), campo, base, m.k.madre);
    if (usa.has("madre")) v.push(logit(qm.q));
    if (usa.has("nonna")) {
      const nonna = info?.dam ? String(info.dam).toUpperCase() : "";
      v.push(logit(qm.n === 0 && nonna ? quota(a.madre.get(nonna), campo, base, m.k.nonna).q : base));
    }
    if (usa.has("padre_madre")) {
      const pm = info?.sire ? String(info.sire).toUpperCase() : "";
      v.push(logit(pm ? quota(a.padreMadre.get(pm), campo, base, m.k.padre_madre).q : base));
    }
    if (usa.has("eta_madre")) {
      const e = info?.birth_year ? annoPuledro - info.birth_year : null;
      const ok = e !== null && e >= 2 && e <= 30;
      v.push(ok ? 0 : 1, ok && e! <= 5 ? 1 : 0, ok && e! >= 15 ? 1 : 0, ok ? (e! - 10) / 5 : 0);
    }
    if (usa.has("parto")) {
      const parto = 1 + (a.madre.get(M)?.n ?? 0);
      v.push(parto === 1 ? 1 : 0, Math.min(parto, 8) / 8);
    }
    const w = m.pesi[campo];
    if (w.length !== v.length) {
      // pesi e informazioni non combaciano: meglio nessuna cifra che una sbagliata
      return { disponibile: false, prob_corre: null, prob_buono: null, media_buono: 25,
               figli_padre: qp.n, figli_madre: qm.n, sperimentale: true, stato: "modello non coerente" };
    }
    const p = sigm(v.reduce((s, x, i) => s + x * w[i], 0));
    const t = m.taratura[campo];
    out[campo] = sigm(t[0] + t[1] * logit(p));
    out["n_padre"] = qp.n;
    out["n_madre"] = qm.n;
  }
  return {
    disponibile: true,
    prob_corre: Math.round(out.corre * 100),
    prob_buono: Math.round(out.buono * 100),
    media_buono: Math.round(m.base.buono * 100),
    figli_padre: out.n_padre,
    figli_madre: out.n_madre,
    sperimentale: m.sperimentale,
    stato: m.stato,
  };
}
