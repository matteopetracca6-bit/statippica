/**
 * COMPARAZIONE: due cavalli uno contro l'altro.
 *
 * Tutto in toni di giallo: il cavallo A giallo oro, il cavallo B arancio.
 * In alto le due schede con voto e lettera e il conto di chi e' davanti,
 * poi il grafico a ragno con i due profili sovrapposti (le sei punte della
 * scheda cavallo), poi le barre a specchio per i numeri della carriera,
 * poi anno per anno, pedigree e ippodromi.
 *
 * Il conto «meglio in» usa solo quattro voci che non si ripetono:
 * % vittorie, % nei primi 3, euro a corsa e record. Corse e guadagni totali
 * si vedono ma non contano, perche' dicono soprattutto quanto ha corso
 * (e sarebbero contati due volte insieme alle percentuali). Il voto e' gia'
 * un riassunto di tutto e sta nelle schede in alto.
 *
 * Indirizzo con i cavalli gia' scelti: #/compare?a=NOME__ANNO&b=NOME__ANNO
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { GitCompare, ArrowLeftRight, Search, Trophy } from "lucide-react";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "../components/GradeBadge";
import CavalloCaricamento from "../components/CavalloCaricamento";
import IntestazionePagina from "../components/IntestazionePagina";
import { formatRecord } from "@/lib/record";
import { SPIEGAZIONI, type PuntaRadar } from "../components/RadarCavallo";

const GIALLO = coloreScheda("/compare");
const A = "hsl(48 96% 56%)";
const B = "hsl(24 92% 60%)";
const TESTO = "hsl(210 10% 90%)";
const MUTO = "hsl(210 8% 52%)";
const FIOCO = "hsl(210 8% 38%)";
const BORDO = "hsl(220 10% 16%)";
const FONDO = "hsl(220 12% 9%)";
const FONDO2 = "hsl(220 12% 11%)";
const COL = [A, B];
const LETTERA = ["A", "B"];

const CSS = `
.cf-sel { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 14px; align-items: end; }
.cf-vs { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 2px; }
.cf-eroi { display: grid; grid-template-columns: minmax(0, 1fr) 150px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.cf-riga { display: grid; grid-template-columns: 96px minmax(0, 1fr) 150px minmax(0, 1fr) 96px; gap: 10px; align-items: center; padding: 9px 0;
  border-bottom: 1px solid hsl(220 10% 13%); }
.cf-due { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.cf-ped { display: grid; grid-template-columns: minmax(0, 1fr) 110px minmax(0, 1fr); gap: 10px; align-items: center; padding: 7px 0;
  border-bottom: 1px solid hsl(220 10% 13%); font-size: 12.5px; }
.cf-sez { border-radius: 14px; background: ${FONDO}; border: 1px solid ${BORDO}; padding: 16px 18px; margin-top: 14px; }
.cf-tit { font-size: 15px; font-weight: 800; color: ${TESTO}; margin: 0 0 4px; }
.cf-etich { font-size: 10.5px; font-weight: 700; color: ${FIOCO}; text-transform: uppercase; letter-spacing: .07em; }
@media (max-width: 760px) {
  .cf-sel { grid-template-columns: minmax(0, 1fr); }
  .cf-vs { flex-direction: row; justify-content: center; padding: 0; }
  .cf-eroi { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .cf-eroi .cf-punteggio { grid-column: 1 / -1; grid-row: 2; }
  .cf-riga { grid-template-columns: 64px minmax(0, 1fr) minmax(0, 1fr) 64px; gap: 6px; }
  .cf-riga .cf-lab { grid-column: 1 / -1; grid-row: 1; text-align: center; }
  .cf-due { grid-template-columns: minmax(0, 1fr); }
  .cf-ped { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .cf-ped .cf-lab { grid-column: 1 / -1; grid-row: 1; text-align: center; }
  .cf-sez { padding: 14px 12px; }
}
`;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const intero = (v: number) => Math.round(v).toLocaleString("it-IT");
const euro = (v: number) => "€ " + Math.round(v).toLocaleString("it-IT");
const perc = (v: number) => `${v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Record al km in secondi totali (1.13.6 -> 73,6), per sapere chi e' piu' veloce. */
function secondiRecord(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const f = formatRecord(raw as any);
  const m = f.match(/^(\d+)\.(\d{2})\.(\d)$/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10;
  return s > 0 ? s : null;
}

function scriviRecord(v: number): string {
  const d = Math.round(v * 10);
  return `${Math.floor(d / 600)}.${String(Math.floor((d % 600) / 10)).padStart(2, "0")}.${d % 10}`;
}

function parse(sel: string) {
  const [name, year] = sel.split("__");
  return { name: name ?? "", year: year ?? "" };
}

function HorseSearch({ value, onChange, indice }: { value: string; onChange: (v: string) => void; indice: number }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const { data: results } = useQuery<any[]>({
    queryKey: ["/api/search/horse", query],
    queryFn: () => apiRequest("GET", `/api/search/horse?q=${encodeURIComponent(query)}&limit=10`).then(r => r.json()),
    enabled: query.length >= 2,
    retry: 2,
    staleTime: 30000,
  });
  const c = COL[indice];
  return (
    <div style={{ position: "relative", minWidth: 0, borderRadius: 14, background: FONDO, border: `1px solid ${BORDO}`, borderTop: `3px solid ${c}`, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: c, color: "hsl(220 13% 7%)", fontWeight: 900, fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center" }}>{LETTERA[indice]}</span>
        <span className="cf-etich" style={{ color: c }}>Cavallo {LETTERA[indice]}</span>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, background: "hsl(220 12% 7%)", border: `1px solid ${BORDO}`, borderRadius: 9, padding: "9px 12px" }}>
        <Search size={15} style={{ color: MUTO, flexShrink: 0 }} />
        <input
          data-testid={`input-compare-cavallo-${indice + 1}`}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Cerca un cavallo (almeno 2 lettere)"
          aria-label={`Cavallo ${LETTERA[indice]}`}
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: TESTO, fontSize: 14, fontFamily: "inherit" }}
        />
      </label>
      {open && results && results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, background: "hsl(220 14% 11%)", border: `1px solid hsl(220 10% 20%)`,
          borderRadius: 10, marginTop: 4, maxHeight: 260, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {results.map((r: any) => (
            <div key={`${r.name}-${r.birth_year}`} data-testid={`option-compare-${r.name}`}
              onMouseDown={() => { setQuery(r.name); onChange(`${r.name}__${r.birth_year}`); setOpen(false); }}
              style={{ padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid hsl(220 10% 15%)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.background = "hsl(220 10% 16%)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <span style={{ color: TESTO, fontSize: 13.5, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{r.name}</span>
              <span style={{ color: MUTO, fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {r.birth_year}{r.grade && r.grade !== "N/A" && <GradeBadge grade={r.grade} size="sm" />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Voce { lab: string; v: [number | null, number | null]; meglio: "alto" | "basso"; f: (v: number) => string;
  mostra?: [string, string]; dettaglio?: [string | null, string | null]; conta: boolean }

/** Una riga a specchio: la barra di A cresce verso sinistra, quella di B verso destra. */
function RigaSpecchio({ voce }: { voce: Voce }) {
  const [a, b] = voce.v;
  const entrambi = isNum(a) && isNum(b);
  let vince = -1;
  if (voce.conta && entrambi && a !== b) vince = voce.meglio === "alto" ? (a! > b! ? 0 : 1) : (a! < b! ? 0 : 1);
  // per il record (piu' basso e' meglio) la barra piu' lunga va al piu' veloce
  const forza = (x: number | null) => {
    if (!isNum(x)) return 0;
    if (voce.meglio === "alto") return x;
    const altro = [a, b].filter(isNum) as number[];
    const peggiore = Math.max(...altro);
    return peggiore - x + 1;
  };
  const fa = forza(a), fb = forza(b);
  const max = Math.max(fa, fb, 1e-9);
  const barra = (i: number, f: number) => (
    <div style={{ height: 12, borderRadius: 6, background: "hsl(220 10% 14%)", overflow: "hidden", display: "flex", justifyContent: i === 0 ? "flex-end" : "flex-start" }}>
      <div style={{ width: `${(f / max) * 100}%`, minWidth: f > 0 ? 3 : 0, height: "100%", borderRadius: 6, background: voce.conta ? COL[i] : "hsl(220 8% 34%)", opacity: vince === -1 || vince === i ? 1 : 0.4, transition: "width .4s ease" }} />
    </div>
  );
  const valore = (i: number, x: number | null) => (
    <span className="tabular" style={{ textAlign: i === 0 ? "right" : "left", fontSize: 13.5, fontWeight: vince === i ? 800 : 500,
      color: vince === i ? COL[i] : isNum(x) ? "hsl(210 10% 75%)" : FIOCO, whiteSpace: "nowrap" }}>
      {voce.mostra ? voce.mostra[i] : isNum(x) ? voce.f(x) : "—"}
      {voce.dettaglio?.[i] && <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, color: FIOCO }}>{voce.dettaglio[i]}</span>}
    </span>
  );
  return (
    <div className="cf-riga" data-testid={`riga-${voce.lab}`}>
      {valore(0, a)}
      {barra(0, fa)}
      <span className="cf-lab" style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: MUTO, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {voce.lab}
        {!voce.conta && <span style={{ display: "block", fontSize: 9.5, fontWeight: 600, color: FIOCO, textTransform: "none", letterSpacing: 0 }}>non conta nel punteggio</span>}
      </span>
      {barra(1, fb)}
      {valore(1, b)}
    </div>
  );
}

/**
 * Grafico a ragno con i due profili sovrapposti: A pieno giallo, B arancio
 * tratteggiato. Ogni punta va da 0 (centro) a 100 (bordo): quanti cavalli
 * nati nello stesso anno lascia dietro. Una punta senza dato resta al centro.
 */
function RagnoDoppio({ r }: { r: [PuntaRadar[] | null, PuntaRadar[] | null] }) {
  const base = r[0] ?? r[1];
  if (!base) return null;
  const W = 420, H = 340, cx = W / 2, cy = H / 2 + 4, RR = 112;
  const n = base.length;
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, v: number) => { const a = ang(i), q = (RR * Math.max(0, Math.min(100, v))) / 100; return [cx + q * Math.cos(a), cy + q * Math.sin(a)] as const; };
  const anello = (v: number) => base.map((_, i) => pt(i, v).join(",")).join(" ");
  const val = (k: number, i: number) => r[k]?.[i]?.valore ?? null;
  const forma = (k: number) => base.map((_, i) => pt(i, val(k, i) ?? 0).join(",")).join(" ");
  const tratt = ["", "6 4"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 460, height: "auto", display: "block", margin: "0 auto" }} role="img" data-testid="ragno"
      aria-label={"Profili a confronto: " + base.map((p, i) => `${p.etichetta} A ${val(0, i) == null ? "n.d." : Math.round(val(0, i)!)}, B ${val(1, i) == null ? "n.d." : Math.round(val(1, i)!)}`).join("; ")}>
      {[25, 50, 75, 100].map(v => <polygon key={v} points={anello(v)} fill="none" stroke="hsl(220 10% 24%)" strokeWidth={v === 100 ? 1.2 : 0.8} strokeDasharray={v === 100 ? undefined : "2 3"} />)}
      {base.map((p, i) => { const [x, y] = pt(i, 100); return <line key={p.chiave} x1={cx} y1={cy} x2={x} y2={y} stroke="hsl(220 10% 22%)" strokeWidth={0.8} />; })}
      {[0, 1].map(k => r[k] && (
        <g key={k}>
          <polygon points={forma(k)} fill={COL[k]} fillOpacity={k === 0 ? 0.22 : 0.12} stroke={COL[k]} strokeWidth={2.2} strokeDasharray={tratt[k] || undefined} strokeLinejoin="round" />
          {base.map((_, i) => { const v = val(k, i); if (v == null) return null; const [x, y] = pt(i, v);
            return <circle key={i} cx={x} cy={y} r={3.4} fill={COL[k]} stroke="hsl(220 14% 10%)" strokeWidth={1.2} />; })}
        </g>
      ))}
      {base.map((p, i) => {
        const a = ang(i), c = Math.cos(a), s = Math.sin(a);
        const x = cx + (RR + 16) * c, y = cy + (RR + 14) * s;
        const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
        const dy = s < -0.5 ? -14 : s > 0.5 ? 6 : -4;
        const num = (k: number) => { const v = val(k, i); return v == null ? "n.d." : String(Math.round(v)); };
        return (
          <g key={p.chiave}>
            <title>{SPIEGAZIONI[p.chiave] ?? p.etichetta}</title>
            <text x={x} y={y + dy} textAnchor={anchor} fontSize={12} fill="hsl(210 8% 64%)" fontWeight={700}>{p.etichetta}</text>
            <text x={x} y={y + dy + 15} textAnchor={anchor} fontSize={13} fontWeight={800} style={{ fontVariantNumeric: "tabular-nums" }}>
              <tspan fill={r[0] ? A : FIOCO}>{num(0)}</tspan><tspan fill={FIOCO}> · </tspan><tspan fill={r[1] ? B : FIOCO}>{num(1)}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SchedaEroe({ h, i, vinte }: { h: any; i: number; vinte: number }) {
  const c = COL[i];
  return (
    <div style={{ minWidth: 0, borderRadius: 14, padding: "16px 16px 14px", background: `color-mix(in srgb, ${c} 8%, ${FONDO})`,
      border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, textAlign: i === 0 ? "left" : "right" }} data-testid={`eroe-${LETTERA[i]}`}>
      <div className="cf-etich" style={{ color: c }}>Cavallo {LETTERA[i]}</div>
      <Link href={`/horse/${encodeURIComponent(h.name)}/${h.birth_year}`}>
        <a style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: i === 0 ? "flex-start" : "flex-end", fontSize: 18, fontWeight: 900,
          color: TESTO, textDecoration: "none", marginTop: 4, overflowWrap: "anywhere" }}>
          <BandieraCavallo nome={h.name} paese={h.country} /> {h.name}
        </a>
      </Link>
      <div style={{ fontSize: 12, color: MUTO, marginTop: 3 }}>{h.birth_year}{h.sire ? ` · figlio di ${h.sire}` : ""}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, justifyContent: i === 0 ? "flex-start" : "flex-end", flexDirection: i === 0 ? "row" : "row-reverse" }}>
        <span className="tabular" style={{ fontSize: 30, fontWeight: 900, color: c, lineHeight: 1 }}>{isNum(h.score) ? h.score.toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—"}</span>
        {h.grade && <GradeBadge grade={h.grade} size="lg" />}
      </div>
      <div style={{ fontSize: 11.5, color: FIOCO, marginTop: 6 }}>
        voto{h.rating_mode === "pedigree" ? " (dal pedigree: non ha ancora corso abbastanza)" : ""} · meglio in {vinte} {vinte === 1 ? "voce" : "voci"}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const [sel1, setSel1] = useState<string>(q.get("a") ?? "");
  const [sel2, setSel2] = useState<string>(q.get("b") ?? "");
  const [giro, setGiro] = useState(0);
  const pronti = sel1.includes("__") && sel2.includes("__");

  useEffect(() => {
    if (!pronti) return;
    const base = window.location.hash.split("?")[0];
    const nuovo = `${base}?a=${encodeURIComponent(sel1)}&b=${encodeURIComponent(sel2)}`;
    if (window.location.hash !== nuovo) window.history.replaceState(null, "", nuovo);
  }, [sel1, sel2, pronti]);

  const { data, isLoading } = useQuery<{ horse1: any; horse2: any }>({
    queryKey: ["/api/compare", sel1, sel2],
    queryFn: () => {
      const h1 = parse(sel1), h2 = parse(sel2);
      return apiRequest("GET", `/api/compare?name1=${encodeURIComponent(h1.name)}&year1=${h1.year}&name2=${encodeURIComponent(h2.name)}&year2=${h2.year}`).then(r => r.json());
    },
    enabled: pronti,
  });
  const statsDi = (sel: string, ok: boolean) => ({
    queryKey: ["/api/horse-stats", sel],
    queryFn: () => { const h = parse(sel); return apiRequest("GET", `/api/horse/${encodeURIComponent(h.name)}/${h.year}/stats`).then(r => r.json()); },
    enabled: sel.includes("__") && ok,
    staleTime: 60000,
  });
  const { data: stats1 } = useQuery<any>(statsDi(sel1, !!data?.horse1));
  const { data: stats2 } = useQuery<any>(statsDi(sel2, !!data?.horse2));

  const h1 = data?.horse1, h2 = data?.horse2;
  const ready = !!h1 && !!h2;
  const scambia = () => { setSel1(sel2); setSel2(sel1); setGiro(g => g + 1); };

  // Se l'archivio non ha i totali di carriera, li ricava dalle stagioni.
  const carriera = (h: any, s: any) => {
    const ys: any[] = s?.yearlyStats ?? [];
    const daAnni = ys.length > 0;
    // Le stagioni hanno "places" = arrivi nei primi 3, vittorie comprese.
    // Si usano le stagioni quando coprono tutta la carriera, altrimenti i totali.
    const sc = ys.reduce((t, y) => t + (y.races || 0), 0);
    const usaAnni = daAnni && sc >= (h?.career_races || 0);
    const corse = usaAnni ? sc : h?.career_races ?? null;
    const vitt = usaAnni ? ys.reduce((t, y) => t + (y.wins || 0), 0) : h?.career_wins ?? null;
    const piazz = usaAnni ? ys.reduce((t, y) => t + (y.places || 0), 0)
      : h?.career_places > 0 ? h.career_places + (h.career_wins ?? 0) : null;
    const guad = Math.max(h?.career_earnings || 0, usaAnni ? ys.reduce((t, y) => t + (y.earnings || 0), 0) : 0) || (h?.career_earnings ?? null);
    const bestAnni = ys.map(y => y.best_time).filter(isNum);
    const rec = secondiRecord(h?.record_career) ?? (bestAnni.length ? secondiRecord(Math.min(...bestAnni)) : null);
    // la quota nei primi 3 si puo' sempre calcolare sulle stagioni presenti
    const piazzQuota = usaAnni || !daAnni ? (isNum(piazz) && isNum(corse) && corse > 0 ? (piazz / corse) * 100 : null)
      : sc > 0 ? (ys.reduce((t, y) => t + (y.places || 0), 0) / sc) * 100 : null;
    return { corse, vitt, piazz, guad, rec, piazzQuota };
  };
  const c1 = carriera(h1, stats1), c2 = carriera(h2, stats2);
  const tasso = (n: number | null, d: number | null) => (isNum(n) && isNum(d) && d > 0 ? (n / d) * 100 : null);
  // Ogni fatto compare una volta sola: il numero grezzo sta sotto la percentuale.
  const suCorse = (n: number | null, c: { corse: number | null }) => isNum(n) && isNum(c.corse) ? `${intero(n)} su ${intero(c.corse)}` : null;
  const voci: Voce[] = ready ? [
    { lab: "Vittorie", v: [tasso(c1.vitt, c1.corse), tasso(c2.vitt, c2.corse)], meglio: "alto", f: perc, conta: true,
      dettaglio: [suCorse(c1.vitt, c1), suCorse(c2.vitt, c2)] },
    { lab: "Nei primi 3", v: [c1.piazzQuota, c2.piazzQuota], meglio: "alto", f: perc, conta: true,
      dettaglio: [suCorse(c1.piazz, c1), suCorse(c2.piazz, c2)] },
    { lab: "€ a corsa", v: [isNum(c1.guad) && c1.corse ? c1.guad / c1.corse : null, isNum(c2.guad) && c2.corse ? c2.guad / c2.corse : null], meglio: "alto", f: euro, conta: true },
    { lab: "Record al km", v: [c1.rec, c2.rec], meglio: "basso", f: scriviRecord, conta: true },
    { lab: "Corse", v: [c1.corse, c2.corse], meglio: "alto", f: intero, conta: false },
    { lab: "Guadagni totali", v: [c1.guad, c2.guad], meglio: "alto", f: euro, conta: false },
  ] : [];
  const vinte = [0, 0];
  let contese = 0;
  for (const v of voci) {
    const [a, b] = v.v;
    if (!v.conta || !isNum(a) || !isNum(b)) continue;
    contese++;
    if (a === b) continue;
    const i = v.meglio === "alto" ? (a > b ? 0 : 1) : (a < b ? 0 : 1);
    vinte[i]++;
  }
  const leader = vinte[0] === vinte[1] ? -1 : vinte[0] > vinte[1] ? 0 : 1;

  // anno per anno: tutte le stagioni dei due cavalli
  const anni = Array.from(new Set([...(stats1?.yearlyStats ?? []), ...(stats2?.yearlyStats ?? [])].map((y: any) => String(y.year)))).sort();
  const perAnno = (s: any, a: string) => (s?.yearlyStats ?? []).find((y: any) => String(y.year) === a);
  const maxAnno = Math.max(1, ...[...(stats1?.yearlyStats ?? []), ...(stats2?.yearlyStats ?? [])].map((y: any) => y.earnings || 0));

  const PED: [string, string][] = [["Padre", "sire"], ["Madre", "dam"], ["Nonno paterno", "sire_sire"], ["Nonna paterna", "sire_dam"], ["Nonno materno", "dam_sire"], ["Nonna materna", "dam_dam"]];
  const pedVal = (h: any, k: string) => h?.pedigree?.[k] || (k === "sire" ? h?.sire : k === "dam" ? h?.dam : null) || null;
  const antenati = (h: any) => new Set(PED.map(([, k]) => pedVal(h, k)).filter(Boolean));
  const inComune = ready ? Array.from(antenati(h1)).filter(n => antenati(h2).has(n)) : [];
  const linkPed = (k: string, v: string) => (k === "sire" || k === "sire_sire" || k === "dam_sire") ? `/stallion/${encodeURIComponent(v)}` : `/fattrice/${encodeURIComponent(v)}`;

  return (
    <div className="page-shell">
      <style>{CSS}</style>
      <IntestazionePagina icona={GitCompare} colore={GIALLO} titolo="Comparazione" margineSotto={16}
        sottotitolo="Due cavalli uno contro l'altro: profilo a ragno, carriera, record, pedigree e ippodromi.">
        Scegli due cavalli: il cavallo A è in giallo, il cavallo B in arancio. Il grafico a ragno mette uno sopra l'altro i due profili
        della scheda cavallo. Sotto, per ogni numero la barra più lunga è quella migliore; per il record vince il tempo più basso.
        Il conto «meglio in» usa solo quattro voci che non si ripetono: percentuale di vittorie, percentuale nei primi 3, euro vinti a corsa e record.
        Corse e guadagni totali si vedono ma non contano, perché dicono soprattutto quanto ha corso un cavallo.
      </IntestazionePagina>

      <div className="cf-sel">
        <HorseSearch key={`a-${giro}`} value={parse(sel1).name} onChange={setSel1} indice={0} />
        <div className="cf-vs">
          <span style={{ fontSize: 13, fontWeight: 900, color: GIALLO, letterSpacing: ".1em" }}>VS</span>
          <button onClick={scambia} disabled={!sel1 && !sel2} aria-label="Scambia i due cavalli" title="Scambia" data-testid="btn-scambia"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 10, cursor: "pointer",
              background: FONDO2, border: `1px solid ${BORDO}`, color: GIALLO }}>
            <ArrowLeftRight size={16} />
          </button>
        </div>
        <HorseSearch key={`b-${giro}`} value={parse(sel2).name} onChange={setSel2} indice={1} />
      </div>

      {isLoading && <div style={{ marginTop: 18 }}><CavalloCaricamento label="Preparo il confronto..." /></div>}
      {data && (!h1 || !h2) && (
        <div className="cf-sez" style={{ color: MUTO, fontSize: 13 }}>
          {!h1 && "Il cavallo A non è nell'archivio. "}{!h2 && "Il cavallo B non è nell'archivio."}
        </div>
      )}

      {ready && (
        <>
          <div className="cf-eroi" style={{ marginTop: 16 }}>
            <SchedaEroe h={h1} i={0} vinte={vinte[0]} />
            <div className="cf-punteggio" data-testid="punteggio" style={{ borderRadius: 14, background: FONDO, border: `1px solid ${BORDO}`, padding: 14,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
              <Trophy size={18} color={leader === -1 ? MUTO : COL[leader]} />
              <div className="tabular" style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
                <span style={{ color: A }}>{vinte[0]}</span><span style={{ color: FIOCO, margin: "0 6px" }}>–</span><span style={{ color: B }}>{vinte[1]}</span>
              </div>
              <div style={{ fontSize: 11.5, color: MUTO, lineHeight: 1.45 }}>
                {leader === -1 ? <>pari su {contese} voci</> : <><b style={{ color: COL[leader] }}>{LETTERA[leader]}</b> è meglio in {vinte[leader]} voci su {contese}</>}
              </div>
            </div>
            <SchedaEroe h={h2} i={1} vinte={vinte[1]} />
          </div>

          <div className="cf-sez" data-testid="sezione-ragno">
            <div className="cf-tit">Il profilo a confronto</div>
            <div style={{ fontSize: 12, color: MUTO, marginBottom: 6, lineHeight: 1.5 }}>
              Ogni punta va da 0 al centro a 100 sul bordo: quanti cavalli nati nello stesso anno lascia dietro. Due cavalli di annate diverse
              sono quindi misurati ognuno contro i propri coetanei. Frequenza e pedigree descrivono il cavallo ma non dicono chi è più bravo.
             
            </div>
            {(h1.radar || h2.radar) ? (
              <>
                <RagnoDoppio r={[h1.radar ?? null, h2.radar ?? null]} />
                <div style={{ display: "flex", justifyContent: "center", gap: 18, flexWrap: "wrap", fontSize: 12, color: MUTO, marginTop: 4 }}>
                  {[0, 1].map(i => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width="26" height="10"><line x1="1" y1="5" x2="25" y2="5" stroke={COL[i]} strokeWidth={2.5} strokeDasharray={i === 1 ? "6 4" : undefined} /></svg>
                      <b style={{ color: COL[i] }}>{LETTERA[i]}</b> {[h1, h2][i].name}{![h1, h2][i].radar && " (nessun profilo)"}
                    </span>
                  ))}
                </div>
                <details style={{ marginTop: 10, fontSize: 12, color: MUTO }}>
                  <summary style={{ cursor: "pointer", color: GIALLO, fontWeight: 700 }}>Cosa misura ogni punta</summary>
                  <div style={{ marginTop: 6, display: "grid", gap: 4, lineHeight: 1.45 }}>
                    {(h1.radar ?? h2.radar).map((p: PuntaRadar) => (
                      <div key={p.chiave}><b style={{ color: TESTO }}>{p.etichetta}</b>: {SPIEGAZIONI[p.chiave] ?? ""}</div>
                    ))}
                  </div>
                </details>
                {(!h1.radar || !h2.radar) && (
                  <div style={{ fontSize: 11.5, color: FIOCO, textAlign: "center", marginTop: 6 }}>
                    Il profilo c'è solo per i cavalli valutati sulle loro corse: chi ha corso poco o è un campione storico non ce l'ha.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: FIOCO }}>Nessuno dei due ha un profilo: c'è solo per i cavalli valutati sulle loro corse.</div>
            )}
          </div>

          <div className="cf-sez">
            <div className="cf-tit">Numero per numero</div>
            <div style={{ fontSize: 12, color: MUTO, marginBottom: 6 }}>
              La barra piena indica chi è davanti, quella più chiara chi è dietro. Le righe grigie si vedono ma non contano nel punteggio.
            </div>
            {voci.map(v => <RigaSpecchio key={v.lab} voce={v} />)}
          </div>

          {anni.length > 0 && (
            <div className="cf-sez">
              <div className="cf-tit">Anno per anno</div>
              <div style={{ fontSize: 12, color: MUTO, marginBottom: 8 }}>Guadagni di ogni stagione, con corse e vittorie.</div>
              {anni.map(a => {
                const y = [perAnno(stats1, a), perAnno(stats2, a)];
                return (
                  <div key={a} className="cf-riga">
                    {[0, 1].map(i => i === 0 ? (
                      <span key="va" className="tabular" style={{ textAlign: "right", fontSize: 12.5, color: y[0] ? TESTO : FIOCO }}>{y[0] ? euro(y[0].earnings || 0) : "—"}</span>
                    ) : null)}
                    <div style={{ height: 12, borderRadius: 6, background: "hsl(220 10% 14%)", display: "flex", justifyContent: "flex-end", overflow: "hidden" }}>
                      <div style={{ width: `${((y[0]?.earnings || 0) / maxAnno) * 100}%`, height: "100%", background: A, borderRadius: 6 }} />
                    </div>
                    <span className="cf-lab" style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: TESTO }}>
                      {a}
                      <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, color: FIOCO }}>
                        {y[0] ? `${y[0].races}c ${y[0].wins}v` : "—"} · {y[1] ? `${y[1].races}c ${y[1].wins}v` : "—"}
                      </span>
                    </span>
                    <div style={{ height: 12, borderRadius: 6, background: "hsl(220 10% 14%)", overflow: "hidden" }}>
                      <div style={{ width: `${((y[1]?.earnings || 0) / maxAnno) * 100}%`, height: "100%", background: B, borderRadius: 6 }} />
                    </div>
                    <span className="tabular" style={{ fontSize: 12.5, color: y[1] ? TESTO : FIOCO }}>{y[1] ? euro(y[1].earnings || 0) : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cf-sez">
            <div className="cf-tit">Pedigree</div>
            <div style={{ fontSize: 12, color: MUTO, marginBottom: 8 }}>
              {inComune.length ? <>In comune: <b style={{ color: GIALLO }}>{inComune.join(", ")}</b> (evidenziati).</> : "Nessun antenato in comune fra padre, madre e nonni."}
            </div>
            {PED.map(([lab, k]) => {
              const v = [pedVal(h1, k), pedVal(h2, k)];
              if (!v[0] && !v[1]) return null;
              const cella = (i: number) => {
                const x = v[i];
                const comune = x && inComune.includes(x);
                return (
                  <span style={{ textAlign: i === 0 ? "right" : "left", minWidth: 0, overflowWrap: "anywhere" }}>
                    {x ? <Link href={linkPed(k, x)}><a style={{ color: comune ? GIALLO : TESTO, fontWeight: comune ? 800 : 600, textDecoration: "none",
                      ...(comune ? { background: "color-mix(in srgb, " + GIALLO + " 14%, transparent)", borderRadius: 5, padding: "1px 6px" } : {}) }}>{x}</a></Link>
                      : <span style={{ color: FIOCO }}>—</span>}
                  </span>
                );
              };
              return (
                <div key={k} className="cf-ped">
                  {cella(0)}
                  <span className="cf-lab" style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: MUTO, textTransform: "uppercase", letterSpacing: ".05em" }}>{lab}</span>
                  {cella(1)}
                </div>
              );
            })}
          </div>

          {((stats1?.trackStats?.length ?? 0) > 0 || (stats2?.trackStats?.length ?? 0) > 0) && (
            <div className="cf-sez">
              <div className="cf-tit">Dove corrono di più</div>
              <div style={{ fontSize: 12, color: MUTO, marginBottom: 10 }}>I primi cinque ippodromi di ognuno, per numero di corse.</div>
              <div className="cf-due">
                {[stats1, stats2].map((s, i) => {
                  const tr: any[] = [...(s?.trackStats ?? [])].sort((x, y) => (y.races || 0) - (x.races || 0)).slice(0, 5);
                  const mx = Math.max(1, ...tr.map(t => t.races || 0));
                  return (
                    <div key={i} style={{ minWidth: 0 }}>
                      <div className="cf-etich" style={{ color: COL[i], marginBottom: 6 }}>Cavallo {LETTERA[i]} · {[h1, h2][i].name}</div>
                      {tr.length === 0 && <div style={{ fontSize: 12.5, color: FIOCO }}>Nessuna corsa nell'archivio.</div>}
                      {tr.map(t => (
                        <div key={t.track} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 72px", gap: 8, alignItems: "center", padding: "6px 0", fontSize: 12.5,
                          borderBottom: "1px solid hsl(220 10% 13%)" }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: TESTO }}>{t.track}</span>
                            <span style={{ display: "block", height: 5, borderRadius: 3, background: "hsl(220 10% 14%)", marginTop: 4, overflow: "hidden" }}>
                              <span style={{ display: "block", height: "100%", width: `${((t.races || 0) / mx) * 100}%`, background: COL[i], borderRadius: 3 }} />
                            </span>
                          </span>
                          <span className="tabular" style={{ color: MUTO, textAlign: "right" }}>{t.races}c · {t.wins}v</span>
                          <span className="tabular" style={{ color: TESTO, textAlign: "right" }}>{euro(t.earnings || 0)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!ready && !isLoading && (
        <div className="cf-sez" style={{ textAlign: "center", padding: "44px 20px", color: MUTO, fontSize: 13.5, borderStyle: "dashed" }}>
          <GitCompare size={26} color={GIALLO} style={{ marginBottom: 10 }} />
          <div>Scegli due cavalli qui sopra per vederli uno contro l'altro.</div>
        </div>
      )}
    </div>
  );
}
