import { Link } from "wouter";
import { Plus, Check } from "lucide-react";
import { useScuderia, type VoceScuderia } from "@/lib/scuderia";

/** Bottone "Aggiungi alla scuderia": se il cavallo c'e' gia', lo dice e
 *  porta alla pagina della scuderia. `piccolo` per le righe delle tabelle. */
export default function AggiungiScuderia({ voce, piccolo = false, icona = false }: { voce: Omit<VoceScuderia, "id">; piccolo?: boolean; icona?: boolean }) {
  const { contiene, aggiungi } = useScuderia();
  const dentro = contiene(voce);
  const stile: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${dentro ? "hsl(145 40% 35%)" : "hsl(38 60% 40%)"}`,
    background: dentro ? "hsl(145 40% 12%)" : "hsl(38 50% 12%)",
    color: dentro ? "hsl(145 55% 62%)" : "hsl(38 85% 66%)",
    borderRadius: 8, fontWeight: 700, fontFamily: "inherit",
    padding: piccolo ? "3px 7px" : "6px 11px", fontSize: piccolo ? 11.5 : 12.5, textDecoration: "none",
  };
  if (icona) {
    const st: React.CSSProperties = { ...stile, padding: "1px 3px", borderRadius: 6, verticalAlign: "middle" };
    return dentro
      ? <Link href="/scuderia" style={st} title="È nella tua scuderia" aria-label="È nella tua scuderia"><Check size={12} /></Link>
      : <button type="button" style={st} title="Aggiungi alla tua scuderia" aria-label="Aggiungi alla tua scuderia"
                onClick={e => { e.preventDefault(); e.stopPropagation(); aggiungi(voce); }}><Plus size={12} /></button>;
  }
  if (dentro) {
    return (
      <Link href="/scuderia" style={stile} title="È già nella tua scuderia: apri la scuderia">
        <Check size={piccolo ? 12 : 14} />{piccolo ? "In scuderia" : "Nella tua scuderia"}
      </Link>
    );
  }
  return (
    <button type="button" style={stile} onClick={e => { e.preventDefault(); e.stopPropagation(); aggiungi(voce); }}
            title="Aggiungi alla tua scuderia">
      <Plus size={piccolo ? 12 : 14} />{piccolo ? "Scuderia" : "Aggiungi alla scuderia"}
    </button>
  );
}
