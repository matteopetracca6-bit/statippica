/** Le prove del simulatore contro corse vere: le leggono il simulatore e la pagina del metodo. */
export const PROVA = {
  corse: 461, dal: "25/10", al: "20/11/2026",
  squalificheSim: 17.6, squalificheVere: 17.6, scartoKm: 0.1,
};
// Prova del 24/11/2026 della taratura sul pronostico XGBoost: 222 corse vere
// con almeno 6 partenti degli ultimi 14 giorni (187 con le quote finali), 250
// simulazioni a corsa, prima e dopo la taratura (prova/sim.ts).
export const PROVA_XGB = {
  corse: 222, conQuote: 187,
  alVincitore: { solo: 17.3, tarato: 21.5, conMercato: 23.1, totalizzatore: 24.8 },
  favoritoVince: { solo: 24.8, tarato: 35.6, conMercato: 39.6, totalizzatore: 43.3 },
  errorePrimiTre: { solo: 0.192, tarato: 0.182, pronostico: 0.182 },
  erroreVince: { solo: 0.090, tarato: 0.085, totalizzatore: 0.083 },
};
