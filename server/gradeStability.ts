/**
 * Quanto e' affidabile il voto di un cavallo, a seconda dell'eta'.
 *
 * Il voto si calcola sulla carriera fatta finora. A due anni quella carriera
 * e' una manciata di corse, a otto e' tutto quello che il cavallo fara' mai:
 * la stessa lettera non vale la stessa cosa nei due casi. Il sito la mostrava
 * identica, e chi guardava non aveva modo di sapere quale delle due stesse
 * leggendo.
 *
 * I numeri arrivano da scripts/grade_stability.py, che ricostruisce sui nati
 * 2012-2016 il voto che avevano a ogni eta' e lo confronta con quello
 * raggiunto a fine carriera. A due anni resta fermo meno di un cavallo su tre.
 */
import fs from "node:fs";
import path from "node:path";

export interface VoceStabilita {
  n: number;
  resta: number;
  sale: number;
  scende: number;
}

export interface GradeStabilityModel {
  descrizione: string;
  metodo: string;
  lettura: string;
  limiti: string[];
  gruppo_minimo: number;
  per_eta: Record<string, Record<string, VoceStabilita>>;
}

let cache: GradeStabilityModel | null = null;

export function getGradeStabilityModel(): GradeStabilityModel | null {
  if (cache) return cache;
  for (const p of [
    path.resolve(process.cwd(), "grade_stability.json"),
    path.resolve(process.cwd(), "..", "grade_stability.json"),
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

export interface Affidabilita {
  disponibile: boolean;
  motivo?: string;
  eta: number;
  eta_usata?: number;
  voto?: string;
  resta?: number;
  sale?: number;
  scende?: number;
  n?: number;
  /** provvisorio | in_via_di_conferma | consolidato */
  livello?: "provvisorio" | "in_via_di_conferma" | "consolidato";
  frase?: string;
}

/**
 * Affidabilita' del voto di un cavallo.
 *
 * `eta` e' l'eta' del cavallo, `voto` la lettera che ha adesso. La tavola
 * copre le eta' 2-8: sotto le due non c'e' carriera da giudicare, sopra le
 * otto il voto e' praticamente definitivo e si usa l'ultima riga disponibile.
 */
export function affidabilitaVoto(eta: number, voto: string | null): Affidabilita {
  const m = getGradeStabilityModel();
  if (!m || !voto) {
    return { disponibile: false, motivo: "Dati di affidabilita' non disponibili.", eta };
  }
  if (eta < 2) {
    return {
      disponibile: false,
      eta,
      motivo: "Prima dei due anni non c'e' una carriera su cui basare un voto.",
    };
  }

  const disponibili = Object.keys(m.per_eta).map(Number).sort((a, b) => a - b);
  if (!disponibili.length) {
    return { disponibile: false, motivo: "Dati di affidabilita' non disponibili.", eta };
  }
  // Oltre l'ultima eta' misurata il voto e' consolidato: si usa quella riga
  // invece di non dire niente.
  const maxEta = disponibili[disponibili.length - 1];
  const etaUsata = Math.min(eta, maxEta);

  const blocco = m.per_eta[String(etaUsata)];
  const v = blocco?.[voto];
  if (!v) {
    return {
      disponibile: false,
      eta,
      eta_usata: etaUsata,
      motivo: "Per questa combinazione di eta' e voto i cavalli osservati sono troppo pochi.",
    };
  }

  const livello: Affidabilita["livello"] =
    v.resta < 50 ? "provvisorio" : v.resta < 85 ? "in_via_di_conferma" : "consolidato";

  const frase =
    livello === "provvisorio"
      ? `Voto ancora provvisorio: fra i cavalli che a ${etaUsata} anni erano ${voto}, ` +
        `solo il ${v.resta.toFixed(0)}% ha chiuso la carriera con questa lettera. ` +
        `Il ${v.sale.toFixed(0)}% e' salito, il ${v.scende.toFixed(0)}% e' sceso.`
      : livello === "in_via_di_conferma"
        ? `Voto in via di conferma: fra i cavalli che a ${etaUsata} anni erano ${voto}, ` +
          `il ${v.resta.toFixed(0)}% ha chiuso con questa lettera.`
        : `Voto consolidato: fra i cavalli che a ${etaUsata} anni erano ${voto}, ` +
          `il ${v.resta.toFixed(0)}% ha chiuso la carriera con questa lettera.`;

  return {
    disponibile: true,
    eta,
    eta_usata: etaUsata,
    voto,
    resta: v.resta,
    sale: v.sale,
    scende: v.scende,
    n: v.n,
    livello,
    frase,
  };
}
