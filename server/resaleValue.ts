/**
 * Valore di rivendita del puledro come yearling.
 *
 * Per molti allevatori il ricavo vero non sono i premi di corsa ma la
 * vendita del puledro a un anno. Ignorarlo rendeva il giudizio economico
 * dell'Advisor troppo severo verso gli stalloni di grido, che valgono
 * proprio in asta.
 *
 * Il modello e' una regressione di log(prezzo) sul voto medio dei figli
 * dello stallone, calcolata su 401 yearling EFFETTIVAMENTE aggiudicati
 * nelle aste italiane ANACT e ITS (i lotti "ricomprati" dal venditore
 * sono esclusi: non sono vendite). Coefficienti in resale_model.json.
 *
 * Due limiti da dichiarare sempre a schermo, perche' cambiano la lettura:
 *
 * 1. R2 = 0,068. Il padre sposta il prezzo ma spiega solo il 7% della
 *    variabilita': il mercato paga soprattutto conformazione, movimento,
 *    presentazione, nome dell'allevatore e linea materna, che l'archivio
 *    non contiene. La stima e' quindi una fascia larga, non un prezzo.
 *
 * 2. Le aste sono selezionate. Un puledro qualunque non ci entra: il
 *    prezzo base d'incanto parte da 3.000 euro ANACT e 5.000 ITS, e
 *    circa un lotto su cinque torna indietro invenduto. Il valore qui
 *    stimato vale per un puledro giudicato degno dell'asta.
 */

import fs from "fs";
import path from "path";

export interface ResaleModel {
  b0: number;
  b1: number;
  sd_log: number;
  n: number;
  r2: number;
  quota_venduti: number;
  mediana_venduti: number;
  n_lotti_totali: number;
  fonti: { nome: string; url: string }[];
  nota: string;
}

let cache: ResaleModel | null | undefined;

export function getResaleModel(): ResaleModel | null {
  if (cache !== undefined) return cache;
  for (const p of [
    path.resolve(process.cwd(), "resale_model.json"),
    path.resolve(process.cwd(), "..", "resale_model.json"),
  ]) {
    try {
      if (fs.existsSync(p)) {
        cache = JSON.parse(fs.readFileSync(p, "utf-8")) as ResaleModel;
        return cache;
      }
    } catch {
      /* file illeggibile: si procede senza la stima di rivendita */
    }
  }
  cache = null;
  return cache;
}

export interface ResaleEstimate {
  prezzo_mediano: number;
  prezzo_p25: number;
  prezzo_p75: number;
  prezzo_p10: number;
  prezzo_p90: number;
  /** Probabilita' storica che il lotto trovi davvero un compratore in asta. */
  prob_vendita_pct: number;
  /**
   * Costo fino allo svezzamento e primo anno, senza addestramento ne'
   * attivita' agonistica: chi vende da yearling non li sostiene.
   */
  costo_fino_a_yearling: number;
  utile_mediano: number;
  roi_mediano_pct: number;
  /** Ricavo atteso tenendo conto del rischio di non vendere. */
  ricavo_ponderato: number;
  r2: number;
  n_lotti: number;
  fonti: { nome: string; url: string }[];
  avvertenza: string;
}

/**
 * @param votoAtteso voto previsto del puledro dal modello padre+madre
 * @param costoYearling costo sostenuto fino alla vendita come yearling
 */
export function stimaRivendita(votoAtteso: number, costoYearling: number): ResaleEstimate | null {
  const m = getResaleModel();
  if (!m) return null;

  const mu = m.b0 + m.b1 * votoAtteso;
  const q = (z: number) => Math.round(Math.exp(mu + z * m.sd_log));
  const mediano = q(0);

  // Chi non vende in asta non incassa nulla quell'anno: il ricavo atteso
  // pesa il prezzo per la probabilita' storica di aggiudicazione.
  const ricavoPonderato = Math.round(mediano * m.quota_venduti);

  return {
    prezzo_mediano: mediano,
    prezzo_p10: q(-1.2816),
    prezzo_p25: q(-0.6745),
    prezzo_p75: q(0.6745),
    prezzo_p90: q(1.2816),
    prob_vendita_pct: Math.round(m.quota_venduti * 1000) / 10,
    costo_fino_a_yearling: Math.round(costoYearling),
    utile_mediano: Math.round(mediano - costoYearling),
    roi_mediano_pct: costoYearling > 0
      ? Math.round(((mediano - costoYearling) / costoYearling) * 1000) / 10
      : 0,
    ricavo_ponderato: ricavoPonderato,
    r2: m.r2,
    n_lotti: m.n,
    fonti: m.fonti,
    avvertenza:
      "Stima ricavata da " + m.n + " yearling realmente aggiudicati alle aste ANACT e ITS. " +
      "Il padre spiega solo il " + Math.round(m.r2 * 100) + "% del prezzo: il resto lo fanno " +
      "conformazione, presentazione, linea materna e piazza d'asta, che questo archivio non " +
      "contiene. Vale inoltre per un puledro ammesso a un'asta selezionata, non per un puledro " +
      "qualunque: circa " + Math.round((1 - m.quota_venduti) * 100) + " lotti su 100 tornano a casa invenduti.",
  };
}
