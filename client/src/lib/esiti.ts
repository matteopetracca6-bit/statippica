/**
 * Colori e nomi dei risultati economici, uguali in tutto il sito:
 * verde = in utile, giallo = in pari, rosso = in perdita.
 */
export const ESITO_COLORE: Record<string, string> = {
  profitto: "hsl(145 60% 50%)",
  pareggio: "hsl(45 90% 58%)",
  perdita: "hsl(0 65% 62%)",
};
export const ESITO_NOME: Record<string, string> = {
  profitto: "In utile",
  pareggio: "In pari",
  perdita: "In perdita",
};
/** Colore di una cifra in euro: verde se positiva, rosso se negativa. */
export const coloreSegno = (n: number | null | undefined) =>
  n == null ? undefined : n >= 0 ? ESITO_COLORE.profitto : ESITO_COLORE.perdita;
