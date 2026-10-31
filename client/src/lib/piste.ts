/**
 * Un colore per ogni ippodromo, uguale su tutto il sito.
 *
 * Ottobre 2026: prima le piste erano tutte dello stesso azzurro; nel
 * calendario due riunioni dello stesso giorno sembravano uguali. Ora ogni
 * ippodromo ha il suo colore, e lo stesso colore torna nel calendario, nella
 * scheda della pista, nelle gare di un cavallo, nella fascia delle notizie.
 *
 * I colori sono stati scelti guardando quali ippodromi corrono lo stesso
 * giorno (gare dal 2023): quelli che si trovano spesso insieme nel calendario
 * hanno i colori piu' lontani, e nessuna coppia e' quasi uguale. Le piste non in
 * elenco prendono un colore calcolato dal nome, sempre lo stesso.
 */

export const COLORI_PISTE: Record<string, string> = {
  NAPOLI: "hsl(0 78% 58%)",
  ROMA: "hsl(240 78% 58%)",
  BOLOGNA: "hsl(180 78% 58%)",
  MILANO: "hsl(270 62% 72%)",
  TORINO: "hsl(330 62% 72%)",
  TARANTO: "hsl(252 78% 58%)",
  AVERSA: "hsl(72 78% 58%)",
  MONTEGIORGIO: "hsl(96 78% 58%)",
  PALERMO: "hsl(300 78% 58%)",
  CASTELLUCCIO: "hsl(336 78% 58%)",
  FIRENZE: "hsl(48 78% 58%)",
  PADOVA: "hsl(156 78% 58%)",
  CESENA: "hsl(216 78% 58%)",
  MODENA: "hsl(192 78% 58%)",
  SIRACUSA: "hsl(120 78% 58%)",
  MONTECATINI: "hsl(60 78% 58%)",
  GARIGLIANO: "hsl(24 78% 58%)",
  TREVISO: "hsl(174 62% 72%)",
  FOLLONICA: "hsl(66 62% 72%)",
  VILLANOVA: "hsl(294 62% 72%)",
  TRIESTE: "hsl(144 78% 58%)",
  PONTECAGNANO: "hsl(12 78% 58%)",
  CASARANO: "hsl(264 78% 58%)",
  PRATO: "hsl(90 62% 72%)",
  CIVITANOVA: "hsl(84 78% 58%)",
  FERRARA: "hsl(288 78% 58%)",
  BARI: "hsl(228 78% 58%)",
  VARESE: "hsl(30 62% 72%)",
  ANCONA: "hsl(234 62% 72%)",
  FROSINONE: "hsl(36 78% 58%)",
  "SAN SEVERO": "hsl(204 78% 58%)",
  ESTERO: "hsl(210 8% 62%)",
};

/** Le sigle del calendario ufficiale. */
const SIGLE: Record<string, string> = {
  BO: "BOLOGNA", MI: "MILANO", RM: "ROMA", TO: "TORINO", NA: "NAPOLI",
  CE: "CESENA", SR: "SIRACUSA", TV: "TREVISO", MT: "MONTECATINI",
  CS: "CASARANO", PA: "PALERMO", MO: "MODENA", FI: "FIRENZE",
  GA: "GARIGLIANO", PD: "PADOVA", VI: "VILLANOVA", CT: "CASTELLUCCIO",
  TS: "TRIESTE", AV: "AVERSA", TA: "TARANTO", MG: "MONTEGIORGIO",
  FE: "FERRARA", FO: "FOLLONICA", CV: "CIVITANOVA", PC: "PONTECAGNANO",
  BA: "BARI", VA: "VARESE", AN: "ANCONA", FR: "FROSINONE", SS: "SAN SEVERO",
  PR: "PRATO", MON: "MONTEGIORGIO",
  // Nelle prove di qualifica della seconda fonte "ES" indica una prova all'estero.
  ES: "ESTERO",
};

/** Da "Napoli — Agnano", "napoli", "NA" a "NAPOLI". */
export function nomePista(x: string | null | undefined): string {
  if (!x) return "";
  let s = String(x).trim().toUpperCase();
  s = s.split(/\s+[—–-]\s+/)[0].trim();
  if (SIGLE[s]) return SIGLE[s];
  if (COLORI_PISTE[s]) return s;
  // "MILANO SAN SIRO", "ROMA CAPANNELLE": basta la prima parola nota
  for (const nome of Object.keys(COLORI_PISTE)) if (s.startsWith(nome + " ")) return nome;
  return s;
}

export function colorePista(x: string | null | undefined): string {
  const n = nomePista(x);
  if (COLORI_PISTE[n]) return COLORI_PISTE[n];
  if (!n) return COLORI_PISTE.ESTERO;
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 64%)`;
}

/** Il colore con trasparenza, per sfondi e contorni. */
export function colorePistaTenue(x: string | null | undefined, alfa: number): string {
  return colorePista(x).replace(")", ` / ${alfa})`);
}
