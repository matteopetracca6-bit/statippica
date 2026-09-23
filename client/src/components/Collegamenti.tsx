/**
 * Nomi cliccabili, usati ovunque compaia un guidatore o un ippodromo.
 *
 * Servono a muoversi di lato fra le schede: da un cavallo al suo guidatore,
 * dal guidatore alla pista dove corre, dalla pista ai cavalli, senza passare
 * dalla home. Lo stile e' discreto (il nome resta del suo colore e si
 * sottolinea al passaggio) perche' in una tabella piena di nomi, colorarli
 * tutti come link la renderebbe illeggibile.
 */
import { Link } from "wouter";

// "ESTERO" raccoglie decine di piste straniere e non ha una scheda: in quel
// caso il nome resta semplice testo, invece di portare a una pagina vuota.
const SENZA_SCHEDA = new Set(["ESTERO", "ITALIA", ""]);

export function LinkPista({ codice }: { codice?: string | null }) {
  if (!codice) return <>{"\u2014"}</>;
  if (SENZA_SCHEDA.has(codice.toUpperCase()) || codice.length < 3) return <>{codice}</>;
  return (
    <Link href={`/ippodromo/${encodeURIComponent(codice)}`} className="collegamento-scheda"
      onClick={(e: React.MouseEvent) => e.stopPropagation()}>{codice}</Link>
  );
}

export function LinkGuidatore({ nome }: { nome?: string | null }) {
  if (!nome) return null;
  return (
    <Link href={`/guidatore/${encodeURIComponent(nome)}`} className="collegamento-scheda"
      onClick={(e: React.MouseEvent) => e.stopPropagation()}>{nome}</Link>
  );
}
