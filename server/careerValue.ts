/**
 * Valore residuo di carriera: quanto un cavallo puo' ancora guadagnare.
 *
 * Serve a rispondere alla domanda pratica di chi compra un cavallo gia'
 * in attivita': ha ancora corsa davanti, o ha "finito la benzina"?
 * Guardare solo i guadagni accumulati risponde alla domanda sbagliata,
 * perche' premia proprio i cavalli che hanno gia' dato tutto.
 *
 * Il modello e' una tavola di sopravvivenza, come quelle usate in
 * demografia, applicata alla carriera invece che alla vita:
 *
 *   1. per ogni fascia di voto e ogni eta' si misura la probabilita' di
 *      correre ancora l'anno successivo;
 *   2. si misura quanto incassa tipicamente chi corre a quell'eta';
 *   3. il residuo e' la somma, sugli anni futuri, del guadagno di quel
 *      l'anno moltiplicato per la probabilita' di arrivarci in attivita'.
 *
 * Tarato su cavalli nati dal 2014, di cui l'archivio copre la carriera
 * dall'inizio, e contando ogni eta' solo quando l'anno solare e' gia'
 * concluso: senza questo accorgimento i cavalli giovani sembrerebbero
 * ritirati quando invece e' l'archivio che si ferma. Numeri in
 * career_value_model.json.
 *
 * Limite da dichiarare sempre a schermo: e' una media storica per fascia
 * di voto, non una previsione sul singolo animale. Infortuni, cambio di
 * scuderia e qualita' del driver non sono considerati, e alle eta'
 * avanzate i cavalli osservati sono pochi.
 */

import fs from "fs";
import path from "path";

export interface AnnoFuturo {
  eta: number;
  prob_attivo: number;
  guadagno_mediano_anno: number;
  su_dati_della_fascia: boolean;
}

export interface VoceResiduo {
  cumulato_tipico_a_questa_eta: number;
  quota_futura_tipica: number;
  residuo_mediano: number;
  residuo_medio: number;
  residuo_p25: number;
  residuo_p75: number;
  anni_attesi_ancora: number;
  prossimi_anni: AnnoFuturo[];
  quota_su_dati_della_fascia: number;
  stima_solida: boolean;
}

export interface CareerValueModel {
  descrizione: string;
  metodo: string;
  limiti: string[];
  anno_ultimo_completo: number;
  eta_max: number;
  fasce: string[];
  residuo: Record<string, Record<string, VoceResiduo>>;
  tavola_sopravvivenza: Record<string, {
    eta: number;
    prob_corre_ancora: number;
    n_base: number;
    guadagno_mediano: number;
    n_attivi: number;
  }[]>;
}

let cache: CareerValueModel | null = null;

export function getCareerValueModel(): CareerValueModel | null {
  if (cache) return cache;
  for (const p of [
    path.resolve(process.cwd(), "career_value_model.json"),
    path.resolve(process.cwd(), "..", "career_value_model.json"),
  ]) {
    try {
      if (fs.existsSync(p)) {
        cache = JSON.parse(fs.readFileSync(p, "utf-8"));
        return cache;
      }
    } catch { /* si prova il percorso successivo */ }
  }
  return null;
}

/** Fascia di voto usata dalla tavola. Deve restare allineata allo script. */
export function fasciaVoto(voto: number): string {
  if (voto >= 70) return "70+";
  if (voto >= 60) return "60-70";
  if (voto >= 50) return "50-60";
  if (voto >= 40) return "40-50";
  if (voto >= 30) return "30-40";
  return "<30";
}

export type Giudizio =
  | "giovane"        // il grosso della carriera deve ancora arrivare
  | "nel_pieno"      // sta rendendo, ha ancora margine
  | "in_calo"        // il meglio e' alle spalle ma qualcosa resta
  | "quasi_finito"   // residuo minimo
  | "non_stimabile";

export interface StimaCarriera {
  disponibile: boolean;
  motivo?: string;
  eta: number;
  fascia: string;
  gia_guadagnato: number;
  residuo_mediano: number;
  residuo_p25: number;
  residuo_p75: number;
  anni_attesi_ancora: number;
  /**
   * Quota della carriera che deve ancora arrivare, calcolata sul cavallo
   * TIPICO della sua fascia di voto. Non si usa il rapporto con i guadagni
   * di questo cavallo perche' sono grandezze su scale diverse: un campione
   * incassa molte volte la mediana della sua fascia, e quel confronto lo
   * farebbe sembrare a fine corsa proprio quando ha appena iniziato.
   */
  quota_futura: number;
  /** Guadagno tipico di un cavallo della stessa fascia alla stessa eta'. */
  tipico_a_questa_eta: number;
  /** Quante volte questo cavallo rende rispetto ai suoi pari. */
  rendimento_vs_pari: number;
  /** Residuo riproporzionato sul rendimento di questo cavallo. */
  residuo_personalizzato: number;
  giudizio: Giudizio;
  titolo: string;
  spiegazione: string;
  prossimi_anni: AnnoFuturo[];
  stima_solida: boolean;
  quota_su_dati_della_fascia: number;
  avvertenza?: string;
}

const EURO = (v: number) =>
  "€" + Math.round(v).toLocaleString("it-IT");

/**
 * Stima il valore residuo di un cavallo.
 *
 * @param voto        punteggio del cavallo (0-100)
 * @param annoNascita anno di nascita
 * @param giaGuadagnato premi di carriera gia' incassati
 * @param correAncora  se il cavallo risulta ancora in attivita'
 * @param annoOggi     anno corrente
 */
export function stimaValoreResiduo(
  voto: number | null | undefined,
  annoNascita: number | null | undefined,
  giaGuadagnato: number,
  correAncora: boolean,
  annoOggi: number = new Date().getFullYear(),
): StimaCarriera | null {
  const m = getCareerValueModel();
  if (!m) return null;
  if (voto == null || annoNascita == null) return null;

  const eta = annoOggi - annoNascita;
  const fascia = fasciaVoto(voto);

  const vuoto = (motivo: string): StimaCarriera => ({
    disponibile: false, motivo, eta, fascia,
    gia_guadagnato: giaGuadagnato,
    residuo_mediano: 0, residuo_p25: 0, residuo_p75: 0,
    anni_attesi_ancora: 0, quota_futura: 0,
    tipico_a_questa_eta: 0, rendimento_vs_pari: 1, residuo_personalizzato: 0,
    giudizio: "non_stimabile",
    titolo: "Non stimabile",
    spiegazione: motivo,
    prossimi_anni: [], stima_solida: false, quota_su_dati_della_fascia: 0,
  });

  if (eta < 2) {
    return vuoto(
      "Il cavallo non ha ancora l'eta' per correre: non c'e' una carriera " +
      "da cui misurare quanto resta.");
  }
  if (eta > m.eta_max) {
    return vuoto(
      `Oltre i ${m.eta_max} anni i cavalli ancora in attivita' nell'archivio ` +
      "sono troppo pochi per una stima affidabile.");
  }
  if (!correAncora) {
    return vuoto(
      "Il cavallo non risulta in attivita'. La stima vale per un cavallo " +
      "che sta correndo: per uno fermo dipende dal motivo dello stop, che " +
      "l'archivio non registra.");
  }

  const v = m.residuo[fascia]?.[String(eta)];
  if (!v) return vuoto("Dati insufficienti per questa combinazione di voto ed eta'.");

  /* Quanto rende questo cavallo rispetto ai suoi pari di pari eta'.
     Il rapporto grezzo e' instabile (basta una vittoria importante per
     triplicarlo), quindi si attenua verso 1 e si limita fra un terzo e
     quattro volte: serve a riproporzionare, non a estrapolare. */
  const tipico = v.cumulato_tipico_a_questa_eta;
  const grezzo = tipico > 0 ? giaGuadagnato / tipico : 1;
  const ATTENUAZIONE = 0.6;
  const rendimento = Math.min(4, Math.max(1 / 3,
    1 + ATTENUAZIONE * (grezzo - 1)));

  const quotaFutura = v.quota_futura_tipica;
  const residuoPersonalizzato = Math.round(v.residuo_mediano * rendimento);

  let giudizio: Giudizio;
  let titolo: string;
  if (quotaFutura >= 0.6) {
    giudizio = "giovane";
    titolo = "Il grosso deve ancora arrivare";
  } else if (quotaFutura >= 0.3) {
    giudizio = "nel_pieno";
    titolo = "Nel pieno della carriera";
  } else if (quotaFutura >= 0.1) {
    giudizio = "in_calo";
    titolo = "Il meglio e' alle spalle";
  } else {
    giudizio = "quasi_finito";
    titolo = "Ha quasi finito la benzina";
  }

  const comeVaRispettoAiPari =
    rendimento >= 1.6
      ? `Rende molto piu' dei suoi pari: a ${eta} anni un cavallo con questo ` +
        `voto ha di solito in cassa ${EURO(tipico)}, lui ${EURO(giaGuadagnato)}. ` +
        `Tenendone conto, il residuo sale a circa ${EURO(residuoPersonalizzato)}.`
      : rendimento <= 0.7
        ? `Rende meno dei suoi pari: a ${eta} anni un cavallo con questo voto ` +
          `ha di solito in cassa ${EURO(tipico)}, lui ${EURO(giaGuadagnato)}. ` +
          `Tenendone conto, il residuo scende a circa ${EURO(residuoPersonalizzato)}.`
        : `Rende in linea con i suoi pari, che alla stessa eta' hanno in cassa ` +
          `circa ${EURO(tipico)}.`;

  const spiegazione =
    `A ${eta} anni un cavallo con questo voto corre ancora in media ` +
    `${v.anni_attesi_ancora.toFixed(1)} stagioni, e gli resta da incassare ` +
    `circa il ${Math.round(quotaFutura * 100)}% di quello che guadagnera' in ` +
    `tutta la carriera. ` + comeVaRispettoAiPari + " " +
    (quotaFutura >= 0.5
      ? "La parte piu' redditizia e' ancora davanti."
      : quotaFutura >= 0.3
        ? "Una parte importante della carriera e' ancora da correre."
        : quotaFutura >= 0.1
          ? "Resta un margine, ma minore di quanto ha gia' prodotto."
          : "Chi lo compra oggi paga soprattutto quello che ha gia' fatto.");

  return {
    disponibile: true,
    eta, fascia,
    gia_guadagnato: giaGuadagnato,
    residuo_mediano: v.residuo_mediano,
    residuo_p25: v.residuo_p25,
    residuo_p75: v.residuo_p75,
    anni_attesi_ancora: v.anni_attesi_ancora,
    quota_futura: Math.round(quotaFutura * 1000) / 1000,
    tipico_a_questa_eta: tipico,
    rendimento_vs_pari: Math.round(rendimento * 100) / 100,
    residuo_personalizzato: residuoPersonalizzato,
    giudizio, titolo, spiegazione,
    prossimi_anni: v.prossimi_anni,
    stima_solida: v.stima_solida,
    quota_su_dati_della_fascia: v.quota_su_dati_della_fascia,
    avvertenza: v.stima_solida
      ? undefined
      : "A questa eta' i cavalli di questa fascia di voto osservati " +
        "nell'archivio sono pochi, quindi il conto si appoggia in parte a " +
        "cavalli di ogni livello: la cifra descrive il cavallo medio piu' " +
        "che questo specifico profilo.",
  };
}
