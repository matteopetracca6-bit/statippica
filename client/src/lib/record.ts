/**
 * Il record al chilometro arriva dalla fonte in quattro forme diverse:
 *
 *   "13.6"     minuto sottinteso, il caso piu' comune (12.047 cavalli)
 *   "1.13.6"   minuto gia' scritto (3.140 cavalli)
 *   "1'13\"6"  notazione con apice e virgolette (397 cavalli)
 *   "tnc"      tempo non classificato (1 cavallo)
 *
 * Le pagine mettevano davanti "1." senza guardare, quindi un record gia'
 * completo diventava "1.1.13.6" e uno con gli apici diventava "1.1'13\"6".
 * Qui si normalizza tutto a "1.13.6".
 */
export function formatRecord(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";

  const v = String(raw).trim();
  if (!v) return "—";

  // Valori non numerici (es. "tnc") vanno mostrati come sono.
  if (!/\d/.test(v)) return v;

  // Apici e virgolette diventano punti: 1'13"6 -> 1.13.6
  let s = v.replace(/['’]/g, ".").replace(/["”]/g, ".").replace(/\s+/g, "");
  s = s.replace(/\.+$/, "").replace(/\.{2,}/g, ".");

  // Se il minuto non c'e', lo aggiungiamo noi.
  return /^1\./.test(s) ? s : `1.${s}`;
}
