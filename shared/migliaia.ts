/**
 * IL PUNTO DELLE MIGLIAIA ANCHE SUI NUMERI DA QUATTRO CIFRE.
 *
 * In italiano i browser scrivono "1000" e "8403" senza punto, ma "14.400" con
 * il punto: e' una regola del formato (raggruppa solo da cinque cifre in su).
 * Nelle tabelle i numeri uno sotto l'altro si leggevano male. Questa funzione,
 * chiamata una volta all'avvio, fa si' che ogni numero scritto in italiano
 * abbia sempre il punto: "1.000", "8.403".
 */
export function attivaPuntoMigliaia() {
  const P = Number.prototype as any;
  if (P.__puntoMigliaia) return;
  const originale = Number.prototype.toLocaleString;
  P.toLocaleString = function (this: number, loc?: any, opts?: any) {
    const out: string = originale.call(this, loc, opts);
    const italiano = typeof loc === "string" && loc.toLowerCase().startsWith("it");
    if (!italiano || opts?.useGrouping === false) return out;
    const a = Math.abs(Number(this));
    if (!(a >= 1000 && a < 10000)) return out;
    // Mette il punto dentro la prima serie di quattro cifre isolate.
    return out.replace(/(^|[^\d.,])(\d)(\d{3})(?!\d)/, "$1$2.$3");
  };
  P.__puntoMigliaia = true;
}
