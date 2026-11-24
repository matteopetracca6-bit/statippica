/**
 * Periodo e Risposta: i due mattoni comuni delle pagine di Economia (24/11/2026).
 *  - Periodo: l'etichetta piccola accanto a un numero ("prossimi 12 mesi",
 *    "tutta la carriera"), cosi' si sa sempre su che arco di tempo e' fatto.
 *  - Risposta: il riquadro in alto con il numero grande e il verdetto, prima
 *    di qualsiasi tabella.
 */
import type { ReactNode } from "react";

export function Periodo({ testo }: { testo: string }) {
  return (
    <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, letterSpacing: ".03em", color: "hsl(210 10% 72%)",
      border: "1px solid hsl(220 10% 26%)", borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap", verticalAlign: "middle" }}>
      {testo}
    </span>
  );
}

export function Risposta({ etichetta, valore, verdetto, periodo, testo, sotto, colore = "hsl(210 10% 92%)", destra }: {
  etichetta: string; valore: ReactNode; verdetto?: ReactNode; periodo: string;
  testo?: ReactNode; sotto?: ReactNode; colore?: string; destra?: ReactNode;
}) {
  return (
    <div data-testid="risposta" style={{ borderRadius: 14, padding: "16px 18px", border: `1px solid color-mix(in srgb, ${colore} 45%, transparent)`,
      background: `color-mix(in srgb, ${colore} 7%, hsl(220 14% 9%))` }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "hsl(210 8% 56%)", textTransform: "uppercase", letterSpacing: ".06em" }}>{etichetta}</span>
            <Periodo testo={periodo} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <span className="tabular" style={{ fontSize: 32, fontWeight: 900, color: colore, lineHeight: 1.1 }}>{valore}</span>
            {verdetto && <span style={{ fontSize: 15, fontWeight: 800, color: colore }}>{verdetto}</span>}
          </div>
          {testo && <div style={{ fontSize: 12.5, color: "hsl(210 10% 86%)", marginTop: 6, lineHeight: 1.5, maxWidth: 520 }}>{testo}</div>}
        </div>
        {destra && <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>{destra}</div>}
      </div>
      {sotto && <div style={{ fontSize: 12, color: "hsl(210 8% 56%)", marginTop: 10, borderTop: "1px solid hsl(220 10% 20%)", paddingTop: 8 }}>{sotto}</div>}
    </div>
  );
}
