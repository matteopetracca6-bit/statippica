/**
 * I colori delle pagine di Economia, in un posto solo (24/11/2026).
 *
 * Regole:
 *  - i voti hanno i colori del sito (SSS oro, SS argento, S bronzo, A azzurro,
 *    B verde, C marrone, D-F grigi): sono gli stessi di .grade-* in index.css;
 *  - i soldi hanno solo tre colori: verde in utile, giallo in pari, rosso in
 *    perdita (lib/esiti). Le cifre neutre (premi attesi, spese) restano bianche;
 *  - l'oro non si usa per nient'altro, perche' sul sito vuol dire SSS;
 *  - un solo colore di sezione, il verde acqua di Economia.
 */
import { ESITO_COLORE } from "./esiti";

export const VERDE = ESITO_COLORE.profitto;
export const GIALLO = ESITO_COLORE.pareggio;
export const ROSSO = ESITO_COLORE.perdita;
export const NEUTRO = "hsl(210 10% 92%)";
export const SPENTO = "hsl(210 8% 42%)";
export const COLORE_ECONOMIA = "hsl(160 60% 50%)";

/** Il colore del testo di ogni voto, come i bollini del sito. */
export const COLORE_VOTO: Record<string, string> = {
  SSS: "hsl(51 100% 60%)", SS: "hsl(0 0% 85%)", S: "hsl(30 80% 65%)", A: "hsl(183 70% 60%)",
  B: "hsl(100 50% 55%)", C: "hsl(25 60% 55%)", D: "hsl(40 5% 55%)", E: "hsl(40 4% 45%)", F: "hsl(40 3% 38%)",
};

/** Verde, giallo o rosso secondo una quota (0-100): sopra "buona" verde, sopra "media" giallo. */
export const coloreQuota = (x: number | null | undefined, buona: number, media: number) =>
  x == null ? SPENTO : x >= buona ? VERDE : x >= media ? GIALLO : ROSSO;
