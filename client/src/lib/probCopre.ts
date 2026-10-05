/**
 * Probabilita' di vincere almeno `soglia` euro, letta dai percentili (5%..95%)
 * dei premi vinti davvero dai cavalli con una stima simile. Stesso conto del
 * server (server/previsioni.ts), qui serve per la curva dei costi.
 */
export function probDaPercentili(q: number[], soglia: number): { p: number; estremo: "sotto" | "sopra" | null } {
  if (soglia <= 0) return { p: 1, estremo: null };
  if (soglia <= q[0]) return { p: 0.95, estremo: "sopra" };
  if (soglia > q[q.length - 1]) return { p: 0.05, estremo: "sotto" };
  for (let i = 0; i < q.length - 1; i++) {
    if (q[i] < soglia && soglia <= q[i + 1]) {
      const a = 0.05 + 0.05 * i;
      return { p: 1 - (a + 0.05 * (soglia - q[i]) / (q[i + 1] - q[i])), estremo: null };
    }
  }
  return { p: 0.05, estremo: "sotto" };
}

export const testoProb = (p: number | null, estremo?: string | null) =>
  p == null ? "—" : estremo === "sotto" ? "meno del 5%" : estremo === "sopra" ? "oltre il 95%" : `${Math.round(p)}%`;

export const esitoSaldo = (saldo: number, costo: number) =>
  Math.abs(saldo) <= 0.1 * costo ? "pareggio" : saldo > 0 ? "profitto" : "perdita";
