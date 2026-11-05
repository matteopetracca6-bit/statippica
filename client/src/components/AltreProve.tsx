/**
 * Le altre prove di un cavallo, oltre alla sua qualifica.
 *
 * Per i cavalli piu' vecchi la fonte elenca sotto "qualifiche" anche i tempi
 * fatti all'estero, le riqualifiche dopo una lunga sosta e qualche prova
 * ripetuta. La pagina tiene una sola qualifica per cavallo (la prima in
 * Italia) e mostra qui il resto, ciascuna riga con il suo motivo.
 */
import { tempoKm } from "@/lib/record";

export interface AltraProva { qual_date: string; track: string | null; time_raw: string | null; time_km: number | null; motivo: string }

export const MOTIVI: Record<string, string> = {
  estero: "all'estero",
  adulto: "riqualifica da adulto",
  dopo_debutto: "riqualifica dopo il debutto",
  riqualifica: "riqualifica, più di un anno dopo",
  ripetuta: "altra prova prima del debutto",
  prima: "prova precedente",
};

const itDate = (d: string) => (!d || d.length !== 10 ? d || "—" : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);

export default function AltreProve({ altre, colore }: { altre: AltraProva[]; colore: string }) {
  if (!altre?.length) return null;
  return (
    <div data-testid="altre-prove" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {altre.map(a => (
        <div key={a.qual_date + (a.track ?? "")} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 12.5,
          padding: "6px 10px", borderRadius: 8, background: "var(--ed-fondo2, hsl(220 10% 12%))" }}>
          <span style={{ minWidth: 0, color: "var(--ed-muto, hsl(210 8% 60%))" }}>
            <span style={{ color: "var(--ed-testo, hsl(210 10% 92%))" }}>{itDate(a.qual_date)}</span>
            {a.track && a.track !== "ES" ? ` · ${a.track}` : ""} · {MOTIVI[a.motivo] ?? a.motivo}
          </span>
          <span className="tabular" style={{ color: a.motivo === "estero" ? "var(--ed-muto, hsl(210 8% 60%))" : colore, fontWeight: 700 }}>
            {a.time_km != null ? tempoKm(a.time_km) : a.time_raw ? "n.d." : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
