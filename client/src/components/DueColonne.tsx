/**
 * client/src/components/DueColonne.tsx — StatIppica
 *
 * Il modo di impaginare comune alle pagine "elenco + dettaglio" (Allevatori,
 * Stazioni di monta, Puledri e aste, Comparazione): a sinistra una classifica
 * di righe, a destra la scheda della riga scelta, che resta ferma mentre si
 * scorre. Sul telefono le colonne diventano una e la scheda si apre sotto la
 * riga toccata.
 *
 * Ogni pagina passa il suo colore con la variabile CSS --ed-acc.
 */
import { useEffect, useState } from "react";

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Numero alla italiana con `d` decimali; "—" se il dato manca. */
export function num(v: unknown, d = 0): string {
  return isNum(v) ? v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
}
/** Euro senza decimali; "—" se manca o e' zero (a meno di `zero`). */
export function euro(v: unknown, zero = false): string {
  if (!isNum(v) || (!zero && v === 0)) return "—";
  return (v < 0 ? "−€ " : "€ ") + Math.abs(Math.round(v)).toLocaleString("it-IT");
}
export const nomeBello = (s: string) => (s || "").split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

export function useDesktop(min = 1024): boolean {
  const q = `(min-width: ${min}px)`;
  const [ok, setOk] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOk(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return ok;
}

export const CSS_DUE_COLONNE = `
.ed { --ed-acc: hsl(183 80% 55%); --ed-bordo: hsl(220 10% 16%); --ed-fondo: hsl(220 12% 9%); --ed-fondo2: hsl(220 12% 11%);
  --ed-testo: hsl(210 10% 88%); --ed-muto: hsl(210 8% 52%); --ed-fioco: hsl(210 8% 38%); }
.ed-barra { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.ed-cerca { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; max-width: 360px; padding: 9px 12px; border-radius: 9px;
  background: var(--ed-fondo); border: 1px solid var(--ed-bordo); }
.ed-cerca input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--ed-testo); font-size: 13px; font-family: inherit; }
.ed-segm { display: inline-flex; padding: 3px; border-radius: 9px; background: var(--ed-fondo); border: 1px solid var(--ed-bordo); flex-wrap: wrap; }
.ed-segm button { background: none; border: none; color: var(--ed-muto); font-size: 12px; font-weight: 600; padding: 6px 11px;
  border-radius: 7px; cursor: pointer; font-family: inherit; }
.ed-segm button[aria-pressed="true"] { background: color-mix(in srgb, var(--ed-acc) 18%, transparent); color: var(--ed-acc); }
.ed-linguette { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
.ed-linguetta { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 11px; cursor: pointer; text-align: left;
  background: var(--ed-fondo); border: 1px solid var(--ed-bordo); font-family: inherit; color: inherit; }
.ed-linguetta[aria-selected="true"] { background: color-mix(in srgb, var(--ed-acc) 12%, transparent); border-color: var(--ed-acc); }
.ed-linguetta b { display: block; font-size: 13px; color: var(--ed-testo); }
.ed-linguetta[aria-selected="true"] b { color: var(--ed-acc); }
.ed-linguetta small { display: block; font-size: 11px; color: var(--ed-muto); margin-top: 1px; }
.ed-griglia { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 16px; align-items: start; }
.ed-lista { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ed-riga { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 11px 13px;
  border-radius: 11px; background: var(--ed-fondo); border: 1px solid var(--ed-bordo); cursor: pointer; width: 100%;
  text-align: left; color: inherit; font: inherit; transition: border-color .12s, background .12s; }
.ed-riga:hover { background: var(--ed-fondo2); }
.ed-riga[data-attiva="true"] { border-color: color-mix(in srgb, var(--ed-acc) 65%, transparent); background: color-mix(in srgb, var(--ed-acc) 8%, var(--ed-fondo)); }
.ed-pos { font-size: 13px; font-weight: 800; color: var(--ed-fioco); text-align: center; font-variant-numeric: tabular-nums; }
.ed-pos[data-podio="true"] { color: var(--ed-acc); }
.ed-nome { font-size: 13.5px; font-weight: 800; color: var(--ed-testo); letter-spacing: .02em; overflow-wrap: anywhere; }
.ed-sotto { font-size: 11.5px; color: var(--ed-muto); margin-top: 2px; }
.ed-dettaglio { position: sticky; top: 12px; min-width: 0; border-radius: 14px; background: var(--ed-fondo);
  border: 1px solid color-mix(in srgb, var(--ed-acc) 35%, transparent); padding: 18px; }
.ed-vuoto { border-style: dashed; color: var(--ed-muto); font-size: 13px; text-align: center; padding: 40px 18px; }
.ed-etich { font-size: 10.5px; font-weight: 700; color: var(--ed-fioco); text-transform: uppercase; letter-spacing: .07em; }
.ed-cifre { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }
.ed-cifra { padding: 10px 12px; border-radius: 10px; background: var(--ed-fondo2); border: 1px solid var(--ed-bordo); min-width: 0; }
.ed-cifra .v { font-size: 22px; font-weight: 800; line-height: 1.15; margin-top: 4px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.ed-cifra .s { font-size: 11px; color: var(--ed-muto); margin-top: 2px; line-height: 1.4; }
.ed-tit { font-size: 15px; font-weight: 800; color: var(--ed-testo); margin: 22px 0 10px; }
.ed-pannello { border-radius: 14px; background: var(--ed-fondo); border: 1px solid var(--ed-bordo); padding: 16px; }
.ed-pagine { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px; font-size: 12.5px; color: var(--ed-muto); }
.ed-pagine button { display: flex; align-items: center; background: var(--ed-fondo); border: 1px solid var(--ed-bordo); color: var(--ed-testo);
  border-radius: 8px; padding: 6px 9px; cursor: pointer; }
.ed-pagine button:disabled { color: var(--ed-fioco); cursor: default; }
.ed-chiudi { background: none; border: 1px solid var(--ed-bordo); border-radius: 8px; color: var(--ed-muto); padding: 5px; cursor: pointer; display: flex; }
@media (max-width: 1023px) {
  .ed-griglia { grid-template-columns: minmax(0, 1fr); }
  .ed-dettaglio { position: static; padding: 14px; }
}
@media (max-width: 640px) {
  .ed-riga { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 4px 9px; padding: 10px 11px; }
  .ed-cifre { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ed-linguetta { flex: 1 1 140px; }
}
`;

export function Cifra({ titolo, valore, colore, sotto }: { titolo: string; valore: React.ReactNode; colore?: string; sotto?: React.ReactNode }) {
  return (
    <div className="ed-cifra">
      <div className="ed-etich">{titolo}</div>
      <div className="v" style={{ color: colore ?? "var(--ed-testo)" }}>{valore}</div>
      {sotto && <div className="s">{sotto}</div>}
    </div>
  );
}

/** Barra orizzontale semplice, 0-100 o rispetto a un massimo. */
export function Barretta({ valore, max = 100, colore, alta = 6 }: { valore: number | null | undefined; max?: number; colore?: string; alta?: number }) {
  const w = isNum(valore) && max > 0 ? Math.max(0, Math.min(100, (valore / max) * 100)) : 0;
  return (
    <div style={{ height: alta, borderRadius: alta / 2, background: "hsl(220 10% 16%)", overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", borderRadius: alta / 2, background: colore ?? "var(--ed-acc)", transition: "width .4s ease" }} />
    </div>
  );
}
