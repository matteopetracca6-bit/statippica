/**
 * Manto e sesso del cavallo, con un disegno piccolo.
 *
 * I manti con un disegno sono tre: baio, baio oscuro (detto anche morello)
 * e sauro (anche sauro bruciato). Gli altri, rari nell'archivio (grigio,
 * roano), compaiono solo scritti. Il castrone usa il simbolo del maschio.
 */
import baio from "../assets/manti/baio.webp";
import baioOscuro from "../assets/manti/baio-oscuro.webp";
import sauro from "../assets/manti/sauro.webp";
import maschio from "../assets/manti/maschio.webp";
import femmina from "../assets/manti/femmina.webp";

function manto(coat: string | null | undefined): { nome: string; img: string | null } | null {
  const c = (coat ?? "").trim().toLowerCase();
  if (!c || c === "n/d") return null;
  if (c.startsWith("baio oscuro") || c.startsWith("morello")) return { nome: "Baio oscuro", img: baioOscuro };
  if (c.startsWith("sauro")) return { nome: c.includes("bruciato") ? "Sauro bruciato" : "Sauro", img: sauro };
  if (c.startsWith("baio")) return { nome: "Baio", img: baio };
  return { nome: c.charAt(0).toUpperCase() + c.slice(1), img: null };
}

const SESSO: Record<string, { nome: string; img: string }> = {
  M: { nome: "Maschio", img: maschio },
  F: { nome: "Femmina", img: femmina },
  C: { nome: "Castrone", img: maschio },
};

export default function MantoSesso({ coat, sex }: { coat?: string | null; sex?: string | null }) {
  const m = manto(coat);
  const s = sex ? SESSO[sex] : undefined;
  if (!m && !s) return null;
  return (
    <div className="manto-sesso" style={{
      marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px",
      background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "12px",
      padding: "8px 14px 8px 10px",
    }}>
      {m?.img && (
        <img src={m.img} alt={`Cavallo dal manto ${m.nome.toLowerCase()}`} width={132} height={89}
             style={{ width: "132px", height: "auto", display: "block" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
        {m && (
          <div>
            <div style={{ fontSize: "10.5px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Manto</div>
            <div style={{ color: "hsl(210 10% 90%)", fontWeight: 700 }}>{m.nome}</div>
          </div>
        )}
        {s && (
          <div>
            <div style={{ fontSize: "10.5px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Sesso</div>
            <div style={{ color: "hsl(210 10% 90%)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <img src={s.img} alt="" width={16} height={16} style={{ width: "16px", height: "16px", objectFit: "contain" }} />
              {s.nome}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
