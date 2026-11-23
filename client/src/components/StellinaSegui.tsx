import { Star } from "lucide-react";
import { useSeguiti } from "@/lib/seguiti";

/** Stellina "segui questo cavallo": lo mette fra i Cavalli seguiti (23/11/2026). */
export default function StellinaSegui({ nome, anno, piccola = false }: { nome: string; anno: number | null; piccola?: boolean }) {
  const { segue, alterna } = useSeguiti();
  const si = segue(nome, anno);
  const giallo = "hsl(51 85% 58%)";
  return (
    <button type="button" data-testid="stellina-segui"
      onClick={e => { e.preventDefault(); e.stopPropagation(); alterna(nome, anno); }}
      title={si ? "Lo segui: tocca per smettere" : "Segui questo cavallo: lo trovi in Cavalli seguiti"}
      aria-pressed={si}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
        borderRadius: 8, fontWeight: 700, padding: piccola ? "2px 6px" : "6px 11px", fontSize: piccola ? 11.5 : 12.5,
        border: `1px solid ${si ? giallo : "hsl(51 50% 35%)"}`, background: si ? "hsl(51 60% 14%)" : "transparent", color: giallo,
      }}>
      <Star size={piccola ? 12 : 14} fill={si ? giallo : "none"} />{!piccola && (si ? "Lo segui" : "Segui")}
    </button>
  );
}
