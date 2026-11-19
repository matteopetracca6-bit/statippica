import { ESITO_COLORE, ESITO_NOME } from "@/lib/esiti";

/** Piccola legenda dei colori dei risultati: la stessa in ogni pagina. */
export default function LegendaEsiti({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", fontSize: "11px", color: "hsl(210 8% 50%)", ...style }}
         aria-label="Legenda dei colori">
      {(["profitto", "pareggio", "perdita"] as const).map(k => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: ESITO_COLORE[k] }} />
          {ESITO_NOME[k]}{k === "pareggio" && " (±10% del costo)"}
        </span>
      ))}
    </div>
  );
}
