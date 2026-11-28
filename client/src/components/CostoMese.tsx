/**
 * Il costo al mese, una barra da spostare fra 200 e 2.000 € (28/11/2026).
 * Uguale in tutte le pagine che lo usano e salvato nel browser insieme alla
 * scuderia (lib/scuderia): spostandolo in una pagina cambia anche nelle altre.
 * Il valore si scrive mentre si trascina, il conto riparte quando ci si ferma.
 */
import { useEffect, useRef, useState } from "react";
import { useScuderia } from "@/lib/scuderia";
import { COLORE_ECONOMIA } from "@/lib/coloriEconomia";

export const COSTO_MIN = 200, COSTO_MAX = 2000, COSTO_PASSO = 50;
const euro = (n: number) => "€ " + Math.round(n).toLocaleString("it-IT");
const limita = (n: number) => Math.min(COSTO_MAX, Math.max(COSTO_MIN, Math.round(n / COSTO_PASSO) * COSTO_PASSO));

/** Il costo al mese salvato, gia' dentro la barra. */
export function useCostoMese(): number {
  return limita(useScuderia().scuderia.mensile || 1200);
}

export default function CostoMese({ colore = COLORE_ECONOMIA, etichetta = "Costo al mese", nota }: {
  colore?: string; etichetta?: string; nota?: string;
}) {
  const { scuderia, impostaMensile } = useScuderia();
  const salvato = limita(scuderia.mensile || 1200);
  const [v, setV] = useState(salvato);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setV(salvato); }, [salvato]);
  useEffect(() => () => { if (attesa.current) clearTimeout(attesa.current); }, []);
  const cambia = (n: number) => {
    setV(n);
    if (attesa.current) clearTimeout(attesa.current);
    attesa.current = setTimeout(() => impostaMensile(n), 350);
  };
  const pct = ((v - COSTO_MIN) / (COSTO_MAX - COSTO_MIN)) * 100;
  return (
    <div className="costo-mese" data-testid="costo-mese" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
      <style>{`
        .costo-mese input[type=range] { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px; outline: none; cursor: pointer;
          flex: 1 1 180px; min-width: 140px; max-width: 360px; margin: 0; }
        .costo-mese input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: hsl(210 10% 94%); border: 3px solid var(--cm-c); box-shadow: 0 1px 4px rgb(0 0 0 / .5); }
        .costo-mese input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: hsl(210 10% 94%);
          border: 3px solid var(--cm-c); }
        .costo-mese input[type=range]:focus-visible { outline: 2px solid var(--cm-c); outline-offset: 3px; }
      `}</style>
      <span style={{ fontSize: 12.5, color: "hsl(210 8% 56%)" }}>{etichetta}</span>
      <input type="range" min={COSTO_MIN} max={COSTO_MAX} step={COSTO_PASSO} value={v} aria-label={`${etichetta}: ${euro(v)}`}
        onChange={e => cambia(Number(e.target.value))} data-testid="costo-mese-barra"
        style={{ ["--cm-c" as any]: colore, background: `linear-gradient(to right, ${colore} 0%, ${colore} ${pct}%, hsl(220 10% 22%) ${pct}%, hsl(220 10% 22%) 100%)` }} />
      <b className="tabular" style={{ fontSize: 14, color: "hsl(210 10% 92%)", minWidth: 64 }}>{euro(v)}</b>
      <span className="tabular" style={{ fontSize: 11.5, color: "hsl(210 8% 48%)" }}>{euro(12 * v)} l&apos;anno{nota ? ` · ${nota}` : ""}</span>
    </div>
  );
}
