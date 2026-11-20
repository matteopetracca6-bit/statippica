/**
 * SAGOME DI CARICAMENTO.
 *
 * Mentre i numeri arrivano, al posto del riquadro vuoto (o della scritta
 * "Calcolo...") si vede la sua forma in grigio: titolo, riquadri, righe. Cosi'
 * la pagina non salta quando i dati compaiono, perche' lo spazio e' gia' preso.
 */
import CavalloCaricamento from "./CavalloCaricamento";

// 20/11/2026: niente piu' sagome grigie: al loro posto il caricamento unico
// della pagina (cavallo al galoppo e frasi ippiche).
export default function Sagoma(_p: {
  riquadri?: number; righe?: number; grafico?: number; cornice?: boolean; titolo?: boolean;
}) {
  return <CavalloCaricamento label="Caricamento" />;
}
