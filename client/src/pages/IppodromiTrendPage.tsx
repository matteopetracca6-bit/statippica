/**
 * Ippodromi e trend in un'unica scheda.
 *
 * Erano due riquadri separati nella home. Sono uniti per fare posto al punto
 * di pareggio senza aumentare i riquadri: entrambe le pagine descrivono il
 * contesto delle corse (dove si corre, e come cambia nel tempo), quindi
 * stanno bene insieme come due linguette della stessa scheda.
 *
 * La linguetta segue l'indirizzo: /ippodromi apre le piste, /trend i trend,
 * cosi' i vecchi collegamenti continuano a portare dove portavano.
 */
import { useLocation } from "wouter";
import TracksPage from "./TracksPage";
import TrendsPage from "./TrendsPage";

const COLORE = "hsl(95 55% 52%)";

export default function IppodromiTrendPage() {
  const [percorso, naviga] = useLocation();
  const trend = percorso.startsWith("/trend");
  const linguetta = (attiva: boolean): React.CSSProperties => ({
    padding: "8px 16px", borderRadius: "8px", cursor: "pointer", border: "none",
    fontSize: "13px", fontWeight: 700,
    background: attiva ? COLORE : "hsl(220 10% 14%)",
    color: attiva ? "hsl(220 13% 7%)" : "hsl(210 8% 60%)",
  });
  return (
    <div>
      <div role="tablist" aria-label="Ippodromi e trend"
           style={{ padding: "18px 30px 0", display: "flex", gap: "6px" }}>
        <button role="tab" aria-selected={!trend} style={linguetta(!trend)} onClick={() => naviga("/ippodromi")}>Piste</button>
        <button role="tab" aria-selected={trend} style={linguetta(trend)} onClick={() => naviga("/trend")}>Trend nel tempo</button>
      </div>
      {trend ? <TrendsPage /> : <TracksPage />}
    </div>
  );
}
