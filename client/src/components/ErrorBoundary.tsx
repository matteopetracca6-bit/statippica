/**
 * client/src/components/ErrorBoundary.tsx — StatIppica
 *
 * Rete di sicurezza per l'intero sito.
 *
 * Perche' esiste: React, se un solo componente va in errore durante il
 * disegno, smonta tutta l'applicazione e lascia una pagina completamente
 * bianca, senza barra di navigazione e senza spiegazioni. E' successo con un
 * campo mancante in una singola sezione. Da qui in avanti un guasto resta
 * confinato: si vede un messaggio in italiano e il resto del sito continua a
 * essere raggiungibile.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Utile in sviluppo; in produzione non disturba l'utente.
    console.error("Errore nella pagina:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        maxWidth: "620px", margin: "0 auto", padding: "60px 24px",
        textAlign: "center", color: "hsl(210 8% 60%)",
      }}>
        <AlertTriangle size={34} style={{ color: "hsl(35 85% 58%)", marginBottom: "16px" }} />
        <h1 style={{ fontSize: "19px", fontWeight: 800, color: "hsl(210 10% 88%)", margin: "0 0 10px" }}>
          Questa pagina non si e' caricata
        </h1>
        <p style={{ fontSize: "13.5px", lineHeight: 1.65, margin: "0 0 22px" }}>
          Si e' verificato un problema nel mostrare questa sezione. Il resto del
          sito funziona: puoi tornare alla pagina iniziale e riprovare.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => { this.setState({ error: null }); window.location.hash = "#/"; }}
            style={{
              padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer",
              background: "hsl(183 100% 38%)", color: "hsl(220 13% 7%)", fontWeight: 700, fontSize: "13px",
            }}
          >Torna alla home</button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "9px 18px", borderRadius: "8px", cursor: "pointer",
              background: "none", border: "1px solid hsl(220 10% 22%)",
              color: "hsl(210 8% 65%)", fontWeight: 600, fontSize: "13px",
            }}
          >Ricarica</button>
        </div>
      </div>
    );
  }
}
