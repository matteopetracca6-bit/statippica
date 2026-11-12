/**
 * Quota di allenatore e guidatore sui premi vinti dai loro cavalli.
 *
 * Il regolamento delle corse al trotto (allegato 2, ripartizione dei premi al
 * traguardo) divide il premio di ogni cavallo piazzato: 85% al proprietario,
 * 10% all'allenatore, 5% al guidatore. I "premi vinti" del sito sono la parte
 * del proprietario, quindi la quota si ricava da quella. E' una stima: non
 * conta gli ingaggi, i premi aggiunti ne' gli accordi privati.
 */
export const QUOTA = { allenatore: 0.10, guidatore: 0.05 } as const;

export function quotaStimata(premiProprietario: number, chi: keyof typeof QUOTA): number {
  return ((premiProprietario || 0) / 0.85) * QUOTA[chi];
}
