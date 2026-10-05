/**
 * UN SOLO MODO DI DISEGNARE I GRAFICI A COLONNE.
 *
 * Prima ogni pagina aveva le sue colonne: chi con il numero sopra e chi no,
 * chi con la scheda al passaggio del mouse e chi senza, colori e altezze
 * diverse. Ora tutte usano questo: stesse linee guida sullo sfondo, stesso
 * numero sopra la colonna, stessa scheda quando ci passi sopra (o la tocchi
 * sul telefono), stessa animazione d'entrata.
 */
import { useState, type ReactNode } from "react";

export type Colonna = {
  chiave: string | number;
  /** Testo sotto la colonna (anno, numero di partenza, voto...). */
  etichetta: string;
  valore: number;
  /** Numero scritto sopra la colonna, gia' formattato. */
  testo?: string;
  /** Colore della colonna; se manca usa quello del grafico. */
  colore?: string;
  /** Colonna a righe: dato ancora incompleto. */
  tratteggio?: boolean;
  /** Righe della scheda che appare al passaggio del mouse. */
  scheda?: { testo: ReactNode; colore?: string }[];
};

/** Le tinte usate nei grafici, sempre con lo stesso significato. */
export const COLORI_GRAFICO = {
  euro: "hsl(51 80% 55%)",      // soldi: premi, guadagni
  quantita: "hsl(183 70% 48%)", // conteggi e quote
  buono: "hsl(160 60% 48%)",
  medio: "hsl(45 75% 52%)",
  scarso: "hsl(15 70% 52%)",
  spento: "hsl(220 8% 38%)",
};

export const STILE_SCHEDA: React.CSSProperties = {
  background: "hsl(220 14% 8%)", border: "1px solid hsl(220 10% 22%)",
  borderRadius: "8px", padding: "8px 12px", fontSize: "11.5px", lineHeight: 1.55,
  color: "hsl(210 10% 85%)", boxShadow: "0 6px 20px rgba(0,0,0,0.45)", whiteSpace: "nowrap",
};

export default function GraficoColonne({
  dati, altezza = 160, colore = COLORI_GRAFICO.quantita, formatoGuida, nomeAsse, mostraTesti = true, massimo,
}: {
  /** Valore in cima all'asse (per esempio 100 per le percentuali); se manca, il piu' alto. */
  massimo?: number;
  dati: Colonna[];
  altezza?: number;
  colore?: string;
  /** Come scrivere il valore delle linee guida (meta' e massimo). */
  formatoGuida?: (v: number) => string;
  /** Riga sotto il grafico che dice cosa c'e' sull'asse orizzontale. */
  nomeAsse?: string;
  mostraTesti?: boolean;
}) {
  const [sopra, setSopra] = useState<string | number | null>(null);
  const max = massimo ?? (Math.max(...dati.map(d => d.valore), 0) || 1);
  const fitte = dati.length > 14;
  const altezzaBarre = altezza - 34; // spazio per il numero sopra e l'etichetta sotto

  return (
    <div className="grafico-colonne">
      <div style={{ position: "relative", height: `${altezza}px` }}>
        {/* Linee guida: meta' e massimo */}
        {[1, 0.5].map(f => (
          <div key={f} className="grafico-guida" style={{ bottom: `${18 + altezzaBarre * f}px`, right: 0 }}>
            {formatoGuida && <span>{formatoGuida(max * f)}</span>}
          </div>
        ))}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: formatoGuida ? "40px" : 0, display: "flex", alignItems: "flex-end", gap: fitte ? "3px" : "6px" }}>
          {dati.map((d, i) => {
            const c = d.colore ?? colore;
            const attiva = sopra === d.chiave;
            return (
              <div
                key={d.chiave}
                className="grafico-colonna"
                onMouseEnter={() => setSopra(d.chiave)}
                onMouseLeave={() => setSopra(null)}
                onClick={() => setSopra(s => (s === d.chiave ? null : d.chiave))}
                style={{ opacity: sopra != null && !attiva ? 0.4 : 1 }}
              >
                {attiva && d.scheda && (
                  <div className="grafico-scheda" style={{
                    ...STILE_SCHEDA,
                    // Le prime e le ultime colonne aprono la scheda verso l'interno,
                    // cosi' non esce dal riquadro.
                    left: i < dati.length / 4 ? 0 : i > (dati.length * 3) / 4 ? "auto" : "50%",
                    right: i > (dati.length * 3) / 4 ? 0 : "auto",
                    transform: i >= dati.length / 4 && i <= (dati.length * 3) / 4 ? "translateX(-50%)" : "none",
                  }}>
                    {d.scheda.map((r, k) => (
                      <div key={k} style={{ color: r.colore ?? (k === 0 ? "hsl(210 10% 90%)" : "hsl(210 8% 60%)"), fontWeight: k === 0 ? 700 : 400 }}>{r.testo}</div>
                    ))}
                  </div>
                )}
                {mostraTesti && (
                  <span className="tabular grafico-testo" style={{ color: attiva ? c : "hsl(210 10% 78%)", fontSize: fitte ? "9.5px" : "10.5px" }}>
                    {d.testo ?? ""}
                  </span>
                )}
                <div className="barra-su" style={{
                  animationDelay: `${Math.min(i, 14) * 40}ms`,
                  width: "100%",
                  height: `${Math.max(d.valore > 0 ? 3 : 1, (d.valore / max) * altezzaBarre)}px`,
                  background: d.tratteggio
                    ? `repeating-linear-gradient(135deg, ${c} 0 4px, transparent 4px 9px)`
                    : `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 62%, black))`,
                  boxShadow: d.tratteggio ? `inset 0 0 0 1px ${c}` : attiva ? `0 0 0 1px ${c}` : "none",
                  borderRadius: "4px 4px 0 0",
                  opacity: d.tratteggio ? 0.75 : 1,
                }} />
                <span className="tabular grafico-etichetta" style={{ fontSize: fitte ? "9.5px" : "10.5px" }}>{d.etichetta}</span>
              </div>
            );
          })}
        </div>
      </div>
      {nomeAsse && <div className="grafico-asse">{nomeAsse}</div>}
    </div>
  );
}
