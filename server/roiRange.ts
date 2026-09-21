/**
 * Stima del ritorno economico come FASCIA, non come numero secco.
 *
 * Perche' serve: i guadagni di un cavallo sono distribuiti in modo
 * fortemente asimmetrico. Nel grado SSS la media e' 371.747 euro ma la
 * mediana e' 230.061: pochi campioni tirano su la media. Un "ROI atteso"
 * calcolato sulle medie descrive quindi un puledro che quasi nessuno
 * ottiene davvero. Chi deve decidere se pagare una monta ha bisogno di
 * sapere quanto e' probabile perderci, non solo la media aritmetica.
 *
 * Come si fa: si simulano molti puledri. Per ognuno si estrae un grado
 * dalla distribuzione dei figli dello stallone (attenuata verso la
 * popolazione quando i figli osservati sono pochi) e poi si estrae un
 * guadagno reale fra quelli osservati in quel grado. Il 5% di mortalita'
 * precoce e' simulato come nel modello dei costi.
 *
 * Attenzione alle generazioni immature: un puledro nato nel 2023 in
 * archivio risulta con 1.768 euro di guadagno mediano non perche' valga
 * poco, ma perche' non ha ancora corso. Includerlo abbasserebbe la
 * stima di un cavallo che deve ancora nascere. Per questo la simulazione
 * usa solo le generazioni che hanno completato la carriera.
 */

import type Database from "better-sqlite3";

export const GRADE_LIST = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"] as const;

/**
 * Forza dell'attenuazione verso la popolazione: con K figli osservati il
 * peso dei dati dello stallone e' 50%. Con 24 figli (caso RAJA MIRCHI)
 * il peso e' 24/(24+25) = 49%, cioe' meta' del suo profilo viene ancora
 * dalla media generale. Con 500 figli (VARENNE) e' il 95%.
 */
export const K_SHRINK = 25;

/**
 * Anni necessari perche' una generazione abbia una carriera leggibile.
 * Dai dati: la mediana dei guadagni e' stabile fra i nati 2012 e 2019
 * (10-16 mila euro) e crolla dal 2020 in poi (8.500, poi 6.000, poi
 * 1.768 nel 2023). Sette anni di eta' e' la soglia in cui la carriera
 * risulta sostanzialmente conclusa.
 */
export const ANNI_MATURITA = 7;

/** Ultima generazione considerata matura oggi. */
export function annoMaturita(oggi = new Date()): number {
  return oggi.getFullYear() - ANNI_MATURITA;
}

/** Numero di puledri simulati. 20.000 basta per stabilizzare i decili. */
const N_SIM = 20000;

export interface RoiRange {
  /** Ritorno mediano: il puledro "tipico". */
  roi_mediano_pct: number;
  /** Ritorno medio: gonfiato dai pochi campioni, mostrato per confronto. */
  roi_medio_pct: number;
  roi_p10_pct: number;
  roi_p25_pct: number;
  roi_p75_pct: number;
  roi_p90_pct: number;
  /** Probabilita' che il puledro ripaghi almeno i costi sostenuti. */
  prob_pareggio_pct: number;
  /** Probabilita' di perdere piu' della meta' dell'investimento. */
  prob_perdita_grave_pct: number;
  guadagno_mediano: number;
  guadagno_medio: number;
  guadagno_p90: number;
  costo_atteso: number;
  n_simulazioni: number;
  /** Quanto del profilo viene dai figli veri dello stallone (0-1). */
  peso_dati_stallone: number;
  n_figli_valutati: number;
  /** Solo i nati fino a quest'anno entrano nella simulazione. */
  anno_maturita: number;
  /** "maturi" = figli con carriera conclusa; "tutti" = ripiego sui figli ancora in attivita'. */
  base_figli: "maturi" | "tutti" | "nessuna";
  /**
   * Soglia di pareggio: il livello minimo che il puledro deve raggiungere
   * perche' i guadagni tipici di quel livello coprano i costi, e quanto e'
   * probabile arrivarci.
   */
  pareggio: {
    grado_minimo: string | null;
    guadagno_tipico_del_grado: number;
    probabilita_pct: number;
    /** Guadagno che serve per chiudere in pari. */
    serve: number;
  };
  nota: string;
  avvertenza: string;
}

/** Guadagni reali osservati per ciascun grado, usati come urna da cui pescare. */
export function earningsByGrade(db: Database.Database, maxBirthYear = annoMaturita()): Map<string, number[]> {
  const rows = db.prepare(`
    SELECT grade, career_earnings FROM horse_ratings
    WHERE rating_mode = 'performance' AND grade IS NOT NULL
      AND birth_year IS NOT NULL AND birth_year <= ?
  `).all(maxBirthYear) as { grade: string; career_earnings: number | null }[];
  const m = new Map<string, number[]>();
  for (const r of rows) {
    if (!m.has(r.grade)) m.set(r.grade, []);
    m.get(r.grade)!.push(Math.max(0, r.career_earnings ?? 0));
  }
  return m;
}

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[i];
}

/**
 * Distribuzione dei gradi per lo stallone, attenuata verso la popolazione.
 * Con pochi figli osservati il profilo resta vicino alla media generale,
 * cosi' uno stallone con 3 figli fortunati non sembra un fuoriclasse.
 */
export function shrunkGradeDistribution(
  stallionCounts: Map<string, number>,
  popCounts: Map<string, number>,
): { probs: Map<string, number>; weight: number; nOffspring: number } {
  const nSt = Array.from(stallionCounts.values()).reduce((a, b) => a + b, 0);
  const nPop = Array.from(popCounts.values()).reduce((a, b) => a + b, 0) || 1;
  const w = nSt / (nSt + K_SHRINK);
  const probs = new Map<string, number>();
  for (const g of GRADE_LIST) {
    const pSt = nSt > 0 ? (stallionCounts.get(g) ?? 0) / nSt : 0;
    const pPop = (popCounts.get(g) ?? 0) / nPop;
    probs.set(g, w * pSt + (1 - w) * pPop);
  }
  return { probs, weight: w, nOffspring: nSt };
}

export function simulateRoi(
  stallionCounts: Map<string, number>,
  popCounts: Map<string, number>,
  earnings: Map<string, number[]>,
  costoBase: number,
  costoSeMorte: number,
  baseFigli: "maturi" | "tutti" | "nessuna" = "maturi",
): RoiRange {
  const { probs, weight, nOffspring } = shrunkGradeDistribution(stallionCounts, popCounts);

  // Tabella cumulata per estrarre il grado in tempo costante.
  const cum: { g: string; upto: number }[] = [];
  let acc = 0;
  for (const g of GRADE_LIST) {
    acc += probs.get(g) ?? 0;
    cum.push({ g, upto: acc });
  }
  const totale = acc || 1;

  const costoAtteso = Math.round(0.95 * costoBase + 0.05 * costoSeMorte);
  const rois: number[] = [];
  const guadagni: number[] = [];
  let pareggi = 0;
  let perditeGravi = 0;

  for (let i = 0; i < N_SIM; i++) {
    // 5% di mortalita' precoce: nessun guadagno, ma i costi vivi si fermano.
    const morto = Math.random() < 0.05;
    const costo = morto ? costoSeMorte : costoBase;

    let guadagno = 0;
    if (!morto) {
      const u = Math.random() * totale;
      let grade = GRADE_LIST[GRADE_LIST.length - 1] as string;
      for (const c of cum) {
        if (u <= c.upto) { grade = c.g; break; }
      }
      const urna = earnings.get(grade);
      guadagno = urna && urna.length ? urna[Math.floor(Math.random() * urna.length)] : 0;
    }

    const roi = costo > 0 ? (guadagno - costo) / costo : 0;
    rois.push(roi);
    guadagni.push(guadagno);
    if (guadagno >= costo) pareggi++;
    if (guadagno < costo * 0.5) perditeGravi++;
  }

  // ── Soglia di pareggio ──────────────────────────────────────────
  // Domanda concreta dell'allevatore: che livello deve raggiungere il
  // puledro per non perderci? Si scorre la scala dal basso e si prende il
  // primo livello i cui guadagni TIPICI (mediana, non media) coprono il
  // costo, poi si somma la probabilita' di quel livello e di tutti quelli
  // migliori.
  const scalaDalBasso = GRADE_LIST.slice().reverse();
  let gradoMinimo: string | null = null;
  let guadagnoTipicoGrado = 0;
  for (const g of scalaDalBasso) {
    const urna = earnings.get(g);
    if (!urna || !urna.length) continue;
    const ord = urna.slice().sort((a, b) => a - b);
    const mediana = ord[Math.floor(ord.length / 2)];
    if (mediana >= costoAtteso) { gradoMinimo = g; guadagnoTipicoGrado = mediana; break; }
  }
  let probPareggioGrado = 0;
  if (gradoMinimo) {
    const limite = GRADE_LIST.indexOf(gradoMinimo as (typeof GRADE_LIST)[number]);
    for (let k = 0; k <= limite; k++) probPareggioGrado += probs.get(GRADE_LIST[k]) ?? 0;
  }

  rois.sort((a, b) => a - b);
  guadagni.sort((a, b) => a - b);
  const pct = (x: number) => Math.round(x * 1000) / 10;
  const media = rois.reduce((a, b) => a + b, 0) / rois.length;
  const guadagnoMedio = guadagni.reduce((a, b) => a + b, 0) / guadagni.length;

  const nota = nOffspring >= 50
    ? `Profilo costruito sui ${nOffspring} figli gia' valutati di questo stallone.`
    : nOffspring >= 10
      ? `Lo stallone ha ${nOffspring} figli valutati: il suo profilo pesa il ${Math.round(weight * 100)}%, il resto viene dalla media generale perche' il campione e' ancora piccolo.`
      : `Solo ${nOffspring} figli valutati: la stima e' quasi tutta media generale (peso dei suoi dati ${Math.round(weight * 100)}%). Prendere il risultato come indicativo.`;

  return {
    roi_mediano_pct: pct(quantile(rois, 0.5)),
    roi_medio_pct: pct(media),
    roi_p10_pct: pct(quantile(rois, 0.10)),
    roi_p25_pct: pct(quantile(rois, 0.25)),
    roi_p75_pct: pct(quantile(rois, 0.75)),
    roi_p90_pct: pct(quantile(rois, 0.90)),
    prob_pareggio_pct: Math.round((pareggi / N_SIM) * 1000) / 10,
    prob_perdita_grave_pct: Math.round((perditeGravi / N_SIM) * 1000) / 10,
    guadagno_mediano: Math.round(quantile(guadagni, 0.5)),
    guadagno_medio: Math.round(guadagnoMedio),
    guadagno_p90: Math.round(quantile(guadagni, 0.90)),
    costo_atteso: costoAtteso,
    n_simulazioni: N_SIM,
    peso_dati_stallone: Math.round(weight * 1000) / 1000,
    n_figli_valutati: nOffspring,
    anno_maturita: annoMaturita(),
    base_figli: baseFigli,
    pareggio: {
      grado_minimo: gradoMinimo,
      guadagno_tipico_del_grado: Math.round(guadagnoTipicoGrado),
      probabilita_pct: Math.round((probPareggioGrado / (totale || 1)) * 1000) / 10,
      serve: costoAtteso,
    },
    nota: baseFigli === "tutti"
      ? nota + " Inoltre questo stallone e' troppo recente per avere figli con la carriera " +
        "conclusa: si usano i figli ancora in attivita', che hanno voti piu' bassi perche' " +
        "devono ancora correre. La stima e' quindi prudente per difetto."
      : baseFigli === "nessuna"
        ? "Nessun figlio valutato in archivio: la stima usa soltanto la media generale di tutti i puledri."
        : nota,
    avvertenza:
      "Fascia calcolata simulando " + N_SIM.toLocaleString("it-IT") + " puledri con i guadagni " +
      "realmente osservati sui nati fino al " + annoMaturita() + ", le uniche generazioni con la " +
      "carriera conclusa. E' una stima del rischio, non una promessa: sul singolo puledro pesano " +
      "salute, infortuni, driver e sorte piu' della genealogia.",
  };
}
