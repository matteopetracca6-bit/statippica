import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

/**
 * Striscia di collegamenti alle schede vicine, da mettere a fondo pagina.
 *
 * Prima ogni scheda era un vicolo cieco: finito di leggere la classifica
 * l'unica strada era tornare alla home. Qui si suggerisce dove ha senso
 * andare dopo, con una riga di spiegazione perche' i nomi da soli non
 * dicono a cosa servono.
 */
export interface Collegamento {
  href: string;
  titolo: string;
  descrizione: string;
}

export default function CollegamentiCorrelati({ voci }: { voci: Collegamento[] }) {
  if (!voci.length) return null;

  return (
    <div style={{ marginTop: "36px", paddingTop: "22px", borderTop: "1px solid hsl(220 10% 14%)" }}>
      <div style={{
        fontSize: "11px", fontWeight: 700, color: "hsl(210 8% 42%)",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px",
      }}>
        Continua da qui
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "10px",
      }}>
        {voci.map(v => (
          <Link key={v.href} href={v.href}>
            <a
              data-testid={`correlato-${v.href.replace(/\W+/g, "-")}`}
              style={{
                display: "block", padding: "13px 15px", borderRadius: "10px",
                background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 15%)",
                textDecoration: "none",
                transition: "border-color 0.15s, background 0.15s, transform 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "hsl(183 60% 34%)";
                e.currentTarget.style.background = "hsl(220 12% 12%)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "hsl(220 10% 15%)";
                e.currentTarget.style.background = "hsl(220 12% 10%)";
                e.currentTarget.style.transform = "none";
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", marginBottom: "3px",
              }}>
                {v.titolo}
                <ArrowRight size={13} style={{ color: "hsl(183 70% 55%)" }} />
              </div>
              <div style={{ fontSize: "11.5px", color: "hsl(210 8% 48%)", lineHeight: 1.45 }}>
                {v.descrizione}
              </div>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
