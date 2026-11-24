/**
 * LE TUE SPESE: la barretta in cima a ogni pagina di Economia (24/11/2026).
 *
 * Prima il costo al mese si scriveva in ogni pagina, ciascuna col suo campo.
 * Ora si scrive qui una volta sola (resta salvato nel browser insieme alla
 * scuderia) e vale in tutte: Prima di correre, In corsa, La tua scuderia,
 * Mercato. La barretta dice anche che periodo guardano i numeri della pagina,
 * cosi' due cifre diverse in due pagine non sembrano una contraddizione.
 */
import { useEffect, useState } from "react";
import { Pencil, Check, CalendarRange } from "lucide-react";
import { useScuderia } from "@/lib/scuderia";
import GradeBadge from "./GradeBadge";
import { VERDE, GIALLO, ROSSO, COLORE_ECONOMIA } from "@/lib/coloriEconomia";

const euro = (n: number) => "€ " + Math.round(n).toLocaleString("it-IT");
const TESTO = "hsl(210 10% 90%)";
const MUTO = "hsl(210 8% 56%)";

export default function SpeseBar({ periodo, conMonta = false, colore = COLORE_ECONOMIA }: {
  /** Che periodo guardano i numeri della pagina: "i prossimi 12 mesi", "tutta la carriera"... */
  periodo: string;
  /** Mostra anche il prezzo della monta (serve per i conti di un puledro da allevare). */
  conMonta?: boolean;
  colore?: string;
}) {
  const { scuderia, impostaMensile, impostaMonta } = useScuderia();
  const [aperta, setAperta] = useState(false);
  const [mensile, setMensile] = useState(String(scuderia.mensile || 1200));
  const [monta, setMonta] = useState(scuderia.monta == null ? "" : String(scuderia.monta));
  useEffect(() => { setMensile(String(scuderia.mensile || 1200)); }, [scuderia.mensile]);
  useEffect(() => { setMonta(scuderia.monta == null ? "" : String(scuderia.monta)); }, [scuderia.monta]);

  const salvaMensile = (t: string) => { const n = Number(t); if (n >= 100) impostaMensile(Math.round(n)); };
  const salvaMonta = (t: string) => impostaMonta(t.trim() === "" ? null : Math.max(0, Math.round(Number(t) || 0)));
  const m = scuderia.mensile || 1200;
  const campo: React.CSSProperties = {
    width: 96, background: "hsl(220 12% 7%)", border: "1px solid hsl(220 10% 24%)", borderRadius: 8,
    color: TESTO, padding: "6px 9px", fontSize: 13, fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
  };
  const preset = (v: number, t: string) => (
    <button type="button" onClick={() => { setMensile(String(v)); impostaMensile(v); }}
      style={{ border: `1px solid ${m === v ? colore : "hsl(220 10% 24%)"}`, background: m === v ? `color-mix(in srgb, ${colore} 16%, transparent)` : "transparent",
        color: m === v ? TESTO : MUTO, borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
      {euro(v)} {t}
    </button>
  );

  return (
    <div data-testid="barra-spese" style={{
      border: `1px solid color-mix(in srgb, ${colore} 35%, hsl(220 10% 20%))`, borderRadius: 12, marginBottom: 16,
      background: `color-mix(in srgb, ${colore} 6%, hsl(220 14% 9%))`, padding: "10px 14px",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", fontSize: 13, color: MUTO }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CalendarRange size={15} color={colore} />
          Questa pagina guarda <b style={{ color: TESTO }}>{periodo}</b>
        </span>
        <span>
          Le tue spese: <b className="tabular" style={{ color: TESTO }}>{euro(m)} al mese</b> per cavallo ({euro(12 * m)} l'anno)
          {conMonta && <> · monta <b className="tabular" style={{ color: TESTO }}>{scuderia.monta == null ? "da indicare" : euro(scuderia.monta)}</b></>}
        </span>
        <button type="button" onClick={() => setAperta(!aperta)} data-testid="cambia-spese"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${colore}`,
            color: colore, borderRadius: 8, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {aperta ? <><Check size={13} /> Fatto</> : <><Pencil size={13} /> Cambia</>}
        </button>
      </div>
      {/* Legenda unica, uguale in tutte le pagine di Economia. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", marginTop: 8, fontSize: 11.5, color: MUTO }} data-testid="legenda-economia">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
          Voti {["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"].map(v => <GradeBadge key={v} grade={v} size="sm" />)}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          Soldi {([[VERDE, "in utile"], [GIALLO, "in pari"], [ROSSO, "in perdita"]] as const).map(([c, t]) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: c, display: "inline-block" }} />{t}
            </span>
          ))}
        </span>
      </div>
      {aperta && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 22px", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid hsl(220 10% 20%)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: MUTO, flexWrap: "wrap" }}>
            Allenamento e mantenimento al mese (€)
            <input type="number" min={100} step={50} inputMode="numeric" value={mensile} style={campo} data-testid="input-mensile"
              onChange={e => setMensile(e.target.value)} onBlur={e => salvaMensile(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") salvaMensile((e.target as HTMLInputElement).value); }} />
          </label>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{preset(800, "basso")}{preset(1200, "tipico")}{preset(1800, "alto")}</span>
          {conMonta && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: MUTO, flexWrap: "wrap" }}>
              Prezzo della monta (€)
              <input type="number" min={0} step={500} inputMode="numeric" value={monta} placeholder="facoltativo" style={campo}
                onChange={e => setMonta(e.target.value)} onBlur={e => salvaMonta(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") salvaMonta((e.target as HTMLInputElement).value); }} />
            </label>
          )}
          <span style={{ fontSize: 11.5, color: "hsl(210 8% 46%)", flexBasis: "100%" }}>
            Valgono in tutte le pagine di Economia e restano salvate in questo browser. Il costo al mese è la leva che sposta di più ogni conto.
          </span>
        </div>
      )}
    </div>
  );
}
