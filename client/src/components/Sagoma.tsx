/**
 * SAGOME DI CARICAMENTO.
 *
 * Mentre i numeri arrivano, al posto del riquadro vuoto (o della scritta
 * "Calcolo...") si vede la sua forma in grigio: titolo, riquadri, righe. Cosi'
 * la pagina non salta quando i dati compaiono, perche' lo spazio e' gia' preso.
 */
const CARD: React.CSSProperties = {
  background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "12px", padding: "20px 22px",
};

export default function Sagoma({
  riquadri = 3, righe = 0, grafico = 0, cornice = false, titolo = cornice,
}: {
  /** Quanti riquadri con un numero grande. */
  riquadri?: number;
  /** Quante righe di tabella o di testo. */
  righe?: number;
  /** Altezza di un grafico, in pixel (0 = nessun grafico). */
  grafico?: number;
  /** Con la cornice del riquadro attorno, come le schede vere. */
  cornice?: boolean;
  titolo?: boolean;
}) {
  const corpo = (
    <div aria-busy="true" aria-label="Caricamento" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {titolo && <div className="skeleton" style={{ height: "12px", width: "38%" }} />}
      {riquadri > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(200px, 100%), 1fr))`, gap: "10px" }}>
          {Array.from({ length: riquadri }).map((_, i) => (
            <div key={i} style={{ border: "1px solid hsl(220 10% 15%)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "9px" }}>
              <div className="skeleton" style={{ height: "10px", width: "55%" }} />
              <div className="skeleton" style={{ height: "22px", width: "40%" }} />
              <div className="skeleton" style={{ height: "9px", width: "80%" }} />
            </div>
          ))}
        </div>
      )}
      {grafico > 0 && <div className="skeleton" style={{ height: `${grafico}px`, borderRadius: "8px" }} />}
      {Array.from({ length: righe }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: "14px", width: `${92 - ((i * 17) % 30)}%` }} />
      ))}
    </div>
  );
  return cornice ? <div style={{ ...CARD, marginBottom: "16px" }}>{corpo}</div> : corpo;
}
