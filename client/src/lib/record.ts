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
 * Qui si normalizza tutto a "1.13.6": minuti, secondi (sempre a due cifre,
 * quindi 1.08.6 e non 1.8.6) e decimi.
 */
export function formatRecord(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";

  const v = String(raw).trim();
  if (!v) return "—";

  // Valori non numerici (es. "tnc") vanno mostrati come sono.
  if (!/\d/.test(v)) return v;

  // Le schede dei cavalli storici riportano 0'00"0 quando il record non e'
  // stato registrato. Non e' un tempo: e' un dato mancante, e mostrarlo
  // faceva comparire "1.0.00.0" in classifica accanto a Mack Grace SM.
  if (/^0+[.'’]?0*[."”]?0*$/.test(v.replace(/\s+/g, ""))) return "—";

  // Apici e virgolette diventano punti: 1'13"6 -> 1.13.6
  let s = v.replace(/['’]/g, ".").replace(/["”]/g, ".").replace(/\s+/g, "");
  s = s.replace(/\.+$/, "").replace(/\.{2,}/g, ".");

  // Se il minuto non c'e', lo aggiungiamo noi.
  if (!/^1\./.test(s)) s = `1.${s}`;

  // Secondi sempre a due cifre: 1.8.6 -> 1.08.6
  const m = s.match(/^(\d+)\.(\d{1,2})(?:\.(\d))?$/);
  if (m) return `${m[1]}.${m[2].padStart(2, "0")}.${m[3] ?? "0"}`;
  return s;
}

/**
 * Tempo al km salvato come numero di secondi oltre il minuto (8.6 = 1.08.6,
 * 13.1 = 1.13.1). Lo scrive come minuti.secondi.decimi, con i secondi sempre a
 * due cifre. Valori da 60 in su sono letti come secondi totali (68.6 = 1.08.6).
 */
export function tempoKm(t: number | string | null | undefined): string {
  if (t === null || t === undefined || t === "") return "—";
  const n = typeof t === "number" ? t : parseFloat(String(t).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return typeof t === "string" ? formatRecord(t) : "—";
  const decimiTot = Math.round((n >= 60 ? n : n + 60) * 10);
  const minuti = Math.floor(decimiTot / 600);
  const resto = decimiTot - minuti * 600;
  const secondi = Math.floor(resto / 10);
  const decimi = resto % 10;
  return `${minuti}.${String(secondi).padStart(2, "0")}.${decimi}`;
}
