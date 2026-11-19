/**
 * Quanto vale in asta il puledro, e cosa ne resta all'allevatore che lo vende
 * come yearling.
 *
 * ── COS'ERA PRIMA, E PERCHE' ERA SBAGLIATO ──
 *
 * La versione precedente stimava il prezzo con una regressione sul voto atteso
 * del puledro. Il difetto non era la regressione in se' ma l'uso: il
 * coefficiente era stato calcolato sul voto medio dei figli dello stallone, che
 * fra i 522 stalloni va da 0,8 a 49,5, e veniva poi applicato al voto ATTESO
 * del puledro, che esce dal modello di accoppiamento schiacciato verso la media
 * e sta tutto fra 43 e 51: quattro volte e mezzo piu' compresso. E' come tarare
 * una bilancia su pesi da 1 a 50 chili e poi usarla per distinguere oggetti che
 * pesano tutti fra 43 e 51 — la lancetta non si muove.
 *
 * La conseguenza era grave perche' invisibile: il prezzo stimato risultava
 * sempre intorno ai 28.000 euro per qualunque stallone, mentre il costo varia
 * con la tassa di monta da 1.500 a 35.000 euro. Il ritorno diventava una
 * divisione col numeratore fisso, e premiava sistematicamente lo stallone piu'
 * economico: FACE TIME BOURBON usciva a -39% e IGOR FONT a +68%, non perche'
 * uno sia un affare e l'altro no, ma per costruzione. Un sito che con il 7% di
 * potere esplicativo dichiara che conviene la monta da 2.000 euro non sta
 * scoprendo un affare: sta dicendo che il mercato sbaglia, senza i mezzi per
 * dirlo. Se rendesse il 68%, quella monta non costerebbe 2.000 euro.
 *
 * ── COSA FA ORA ──
 *
 * Due strade, in ordine di preferenza, e a schermo si dice sempre quale e'
 * stata usata:
 *
 * 1. I FIGLI VERI DI QUELLO STALLONE. Se ha almeno tre yearling realmente
 *    aggiudicati nelle aste raccolte, si usano i prezzi dei suoi figli:
 *    mediana e quartili osservati, col numero di vendite su cui poggiano.
 *    Nessun modello di mezzo. Sono 42 stalloni.
 *
 * 2. LA TASSA DI MONTA. Per gli altri si stima da quanto costa la monta, che
 *    e' la valutazione che il mercato stesso fa dello stallone: spiega il 39%
 *    del prezzo dei figli (25% verificato escludendo dal calcolo lo stallone
 *    che si sta stimando), contro il 7% del voto dei figli. La pendenza e' 0,46:
 *    raddoppiare la monta alza il prezzo atteso del 37%, non del 100%. Questo
 *    e' il motivo per cui un margine esiste ancora sugli stalloni economici, ma
 *    misurato, non inventato.
 *
 * Il ritorno e' dato come fascia, non come numero unico, e nella versione
 * ponderata tiene conto che circa un lotto su cinque non trova compratore:
 * chi non vende non incassa.
 */

import fs from "fs";
import path from "path";

export interface FasciaStallone {
  n_venduti: number;
  n_lotti: number;
  quota_venduti: number;
  p25: number;
  mediana: number;
  p75: number;
  minimo: number;
  massimo: number;
}

export interface ResaleModel {
  versione?: number;
  metodo?: string;
  fasce_per_stallone?: Record<string, FasciaStallone>;
  min_vendite_fascia?: number;
  stima_da_monta?: {
    b0: number;
    b1: number;
    sd_log: number;
    r2: number;
    r2_verificato: number;
    n_stalloni: number;
  };
  quota_venduti_globale?: number;
  mediana_globale?: number;
  p25_globale?: number;
  p75_globale?: number;
  n_lotti_totali: number;
  n_venduti?: number;
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
  /** "figli_veri" oppure "tassa_monta": va mostrato, cambia la lettura. */
  base: "figli_veri" | "tassa_monta";
  /** Quanti yearling di questo stallone sono stati davvero venduti (0 se stimato). */
  n_vendite_osservate: number;

  prezzo_p25: number;
  prezzo_mediano: number;
  prezzo_p75: number;
  /** Solo per la fascia storica: il minimo e il massimo realmente battuti. */
  prezzo_minimo?: number;
  prezzo_massimo?: number;

  /** Quota storica di lotti che trova un compratore. */
  prob_vendita_pct: number;

  costo_fino_a_yearling: number;
  utile_mediano: number;

  /** Il ritorno come fascia: dal quartile basso a quello alto. */
  roi_p25_pct: number;
  roi_mediano_pct: number;
  roi_p75_pct: number;
  /** Ritorno atteso tenendo conto del rischio di non vendere. */
  roi_ponderato_pct: number;
  ricavo_ponderato: number;

  /** Quanto e' affidabile la stima, con le parole giuste. */
  solidita: string;
  avvertenza: string;
  fonti: { nome: string; url: string }[];
}

/**
 * @param stallone   nome dello stallone, per cercare la sua fascia storica
 * @param tassaMonta tassa di monta in euro (serve alla stima di ripiego)
 * @param costoYearling costo sostenuto fino alla vendita come yearling
 */
export function stimaRivendita(
  stallone: string,
  tassaMonta: number,
  costoYearling: number,
): ResaleEstimate | null {
  const m = getResaleModel();
  if (!m) return null;

  const chiave = (stallone || "").trim().toUpperCase();
  const fascia = m.fasce_per_stallone?.[chiave];

  let p25: number, mediana: number, p75: number;
  let base: "figli_veri" | "tassa_monta";
  let nOsservate = 0;
  let quotaVendita = m.quota_venduti_globale ?? 0.78;
  let minimo: number | undefined;
  let massimo: number | undefined;
  let solidita: string;

  if (fascia && fascia.n_venduti >= (m.min_vendite_fascia ?? 3)) {
    // Strada 1: i figli veri di questo stallone.
    base = "figli_veri";
    nOsservate = fascia.n_venduti;
    p25 = fascia.p25;
    mediana = fascia.mediana;
    p75 = fascia.p75;
    minimo = fascia.minimo;
    massimo = fascia.massimo;
    // La quota di vendita di questo stallone e' piu' informativa di quella
    // generale, ma su pochi lotti e' instabile: si usa la sua solo da dieci
    // lotti in su.
    if (fascia.n_lotti >= 10) quotaVendita = fascia.quota_venduti;
    solidita = fascia.n_venduti >= 10
      ? `Fascia solida: ${fascia.n_venduti} figli di questo stallone realmente venduti in asta.`
      : `Fascia indicativa: poggia su ${fascia.n_venduti} figli venduti, pochi perche' due `
        + "prezzi fuori scala la spostano.";
  } else if (m.stima_da_monta && tassaMonta > 0) {
    // Strada 2: la tassa di monta.
    base = "tassa_monta";
    const s = m.stima_da_monta;
    const mu = s.b0 + s.b1 * Math.log(tassaMonta);
    const q = (z: number) => Math.round(Math.exp(mu + z * s.sd_log));
    p25 = q(-0.6745);
    mediana = q(0);
    p75 = q(0.6745);
    solidita = `Nessun figlio di questo stallone nelle aste raccolte: prezzo stimato dalla `
      + `tassa di monta, che spiega il ${Math.round(s.r2_verificato * 100)}% del prezzo. `
      + "E' un ordine di grandezza, non una valutazione del singolo puledro.";
  } else {
    // Niente fascia e niente monta: si mostra il mercato nel suo insieme,
    // dicendo chiaramente che non riguarda questo stallone.
    base = "tassa_monta";
    p25 = m.p25_globale ?? 0;
    mediana = m.mediana_globale ?? 0;
    p75 = m.p75_globale ?? 0;
    solidita = "Non ci sono dati ne' sui figli di questo stallone ne' sulla sua tassa di "
      + "monta: questa e' la fascia di tutto il mercato, non una stima su di lui.";
  }

  const roi = (prezzo: number) =>
    costoYearling > 0
      ? Math.round(((prezzo - costoYearling) / costoYearling) * 1000) / 10
      : 0;

  const ricavoPonderato = Math.round(mediana * quotaVendita);

  return {
    base,
    n_vendite_osservate: nOsservate,
    prezzo_p25: p25,
    prezzo_mediano: mediana,
    prezzo_p75: p75,
    prezzo_minimo: minimo,
    prezzo_massimo: massimo,
    prob_vendita_pct: Math.round(quotaVendita * 1000) / 10,
    costo_fino_a_yearling: Math.round(costoYearling),
    utile_mediano: Math.round(mediana - costoYearling),
    roi_p25_pct: roi(p25),
    roi_mediano_pct: roi(mediana),
    roi_p75_pct: roi(p75),
    roi_ponderato_pct: roi(ricavoPonderato),
    ricavo_ponderato: ricavoPonderato,
    solidita,
    avvertenza:
      `Prezzi ricavati da ${m.n_lotti_totali} lotti delle aste ANACT e ITS, di cui `
      + `${m.n_venduti ?? "?"} realmente aggiudicati: i lotti ricomprati dal venditore non `
      + "contano come vendite, perche' il puledro non ha cambiato proprietario. Le aste sono "
      + "selezionate e il prezzo base parte da 3.000 euro: un puledro qualunque non vi accede, "
      + `e circa ${Math.round((1 - quotaVendita) * 100)} lotti su 100 tornano a casa invenduti. `
      + "Il prezzo lo fanno anche conformazione, movimento, presentazione e linea materna, che "
      + "questo archivio non contiene.",
    fonti: m.fonti,
  };
}
