/**
 * Il titolo di ogni pagina, uguale dappertutto: icona, nome, una riga che
 * dice a cosa serve la pagina e, chiusa in una tendina, la spiegazione lunga.
 * Prima ogni pagina apriva con un paragrafo di cinque righe sempre aperto, e
 * ognuna in un modo diverso.
 */
import React from "react";
import { Spiegazione, TITOLI_SPIEGAZIONE } from "./Spiegazione";

export default function IntestazionePagina({
  icona: Icona, colore, titolo, sottotitolo, etichetta, children, mostra, numeri, limiti, margineSotto = 16,
}: {
  icona?: React.ElementType;
  colore?: string;
  titolo: React.ReactNode;
  /** Una riga sola, sempre visibile. */
  sottotitolo?: React.ReactNode;
  /** Piccola targhetta accanto al titolo, per esempio "sperimentale". */
  etichetta?: React.ReactNode;
  children?: React.ReactNode;
  mostra?: React.ReactNode;
  numeri?: React.ReactNode;
  limiti?: React.ReactNode;
  margineSotto?: number;
}) {
  const c = colore ?? "hsl(183 60% 55%)";
  const haSpiegazione = children || mostra || numeri || limiti;
  return (
    <div style={{ marginBottom: margineSotto }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {Icona && <Icona size={20} style={{ color: c }} />}
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "hsl(210 10% 92%)", margin: 0, letterSpacing: "0.02em" }}>{titolo}</h1>
        {etichetta && (
          <span style={{ fontSize: 11, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 999, padding: "1px 8px" }}>{etichetta}</span>
        )}
      </div>
      {sottotitolo && <div style={{ fontSize: 13, color: "hsl(210 8% 60%)", marginTop: 5, lineHeight: 1.5, maxWidth: 860 }}>{sottotitolo}</div>}
      {haSpiegazione && (
        <Spiegazione titolo={TITOLI_SPIEGAZIONE.pagina} mostra={mostra} numeri={numeri} limiti={limiti}>{children}</Spiegazione>
      )}
    </div>
  );
}
