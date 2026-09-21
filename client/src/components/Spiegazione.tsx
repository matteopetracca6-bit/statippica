/**
 * Spiegazione a tendina, chiusa di default.
 *
 * Le schede dei cavalli si erano riempite di prosa: sette blocchi di testo
 * lungo su una pagina sola, ognuno sacrosanto preso a se' ma che messi insieme
 * spingevano i numeri sempre piu' in basso. Su un telefono il risultato era
 * una pagina da leggere invece che da consultare.
 *
 * Le spiegazioni pero' servono - senza, un percentile o un voto provvisorio
 * sono numeri senza significato. Quindi restano tutte, ma chiuse: si vede una
 * riga con il punto interrogativo, e chi vuole capire apre.
 *
 * Usa <details> del browser invece di gestire l'apertura a mano: funziona
 * senza JavaScript, e la tastiera e i lettori di schermo lo sanno gia' usare.
 */
import React from "react";

export function Spiegazione({
  titolo = "Come si legge questo dato",
  children,
  compatta = false,
}: {
  titolo?: string;
  children: React.ReactNode;
  /** Versione minima, per infilarla sotto un singolo numero. */
  compatta?: boolean;
}) {
  return (
    <details
      className="spiegazione"
      style={{
        marginTop: compatta ? 8 : 12,
        // I paragrafi che questa tendina ha sostituito avevano uno spazio sotto:
        // senza, la riga col punto interrogativo si incollava al contenuto
        // successivo e sembrava farne parte.
        marginBottom: 12,
        borderTop: compatta ? "none" : "1px solid hsl(220 10% 16%)",
        paddingTop: compatta ? 0 : 10,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: compatta ? 11 : 11.5,
          color: "hsl(183 55% 52%)",
          userSelect: "none",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 15,
            height: 15,
            borderRadius: "50%",
            border: "1px solid hsl(183 45% 38%)",
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ?
        </span>
        {titolo}
      </summary>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: 1.65,
          color: "var(--muted)",
          maxWidth: "72ch",
        }}
      >
        {children}
      </div>
    </details>
  );
}

export default Spiegazione;
