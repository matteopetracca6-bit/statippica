// Colore della striscia a sinistra delle intestazioni (cavallo e stallone): quello del voto.
export const COLORE_VOTO: Record<string, string> = {
  SSS: "hsl(51 100% 55%)", SS: "hsl(0 0% 80%)", S: "hsl(30 80% 60%)", A: "hsl(183 70% 50%)",
  B: "hsl(100 50% 50%)", C: "hsl(25 60% 50%)", D: "hsl(40 5% 45%)", E: "hsl(40 4% 35%)", F: "hsl(40 3% 28%)",
};

/**
 * Il colore dei riquadri nella scheda di un cavallo, secondo il suo voto.
 *
 * Ottobre 2026: prima tutti i riquadri della scheda erano gialli (il colore
 * della sezione Cavalli), qualunque fosse il cavallo. Ora prendono il colore
 * del voto, quello del distintivo. Per D, E ed F i grigi del distintivo sono
 * troppo vicini per distinguerli in un bordo: qui D e' un grigio caldo, E un
 * grigio ardesia, F un grigio fumo piu' spento.
 */
export const COLORE_SCHEDA_VOTO: Record<string, string> = {
  SSS: "hsl(48 100% 55%)", SS: "hsl(210 12% 82%)", S: "hsl(28 75% 58%)",
  A: "hsl(183 70% 50%)", B: "hsl(100 50% 50%)", C: "hsl(20 65% 55%)",
  D: "hsl(38 18% 60%)", E: "hsl(215 16% 52%)", F: "hsl(0 0% 40%)",
};

/** Il nome della classe CSS per un voto: "voto-SSS", ..., "voto-NA". */
export function classeVoto(voto: string | null | undefined): string {
  return COLORE_SCHEDA_VOTO[voto ?? ""] ? `voto-${voto}` : "voto-NA";
}
