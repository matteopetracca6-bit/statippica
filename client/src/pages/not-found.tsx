import { useLocation } from "wouter";
import { AlertCircle, Home } from "lucide-react";

/**
 * Pagina mostrata quando l'indirizzo non esiste.
 *
 * Prima era quella di esempio del template: fondo chiaro, testo scuro su
 * riquadro scuro (illeggibile) e messaggio in inglese rivolto a chi sviluppa.
 * Ora segue il tema del sito ed e' scritta per chi lo visita.
 */
export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div style={{
      minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 18%)",
        borderRadius: "14px", padding: "28px 32px", maxWidth: "460px", width: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <AlertCircle size={22} style={{ color: "hsl(0 65% 60%)" }} />
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "hsl(210 10% 92%)", margin: 0 }}>
            Pagina non trovata
          </h1>
        </div>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 60%)", lineHeight: 1.6, margin: "0 0 18px" }}>
          L'indirizzo che hai aperto non esiste o e' stato cambiato. Torna alla home
          e riparti dalla ricerca o da una delle sezioni.
        </p>
        <button
          onClick={() => navigate("/")}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "hsl(183 60% 22%)", border: "1px solid hsl(183 45% 32%)",
            color: "hsl(183 80% 75%)", borderRadius: "10px", padding: "10px 16px",
            fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}
        >
          <Home size={14} /> Torna alla home
        </button>
      </div>
    </div>
  );
}
