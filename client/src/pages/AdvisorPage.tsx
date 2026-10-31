/**
 * client/src/pages/AdvisorPage.tsx — StatIppica
 *
 * Advisor Allevatore, versione a due colonne.
 *
 *   1. si sceglie la fattrice (e, se si vuole, un tetto alla monta);
 *   2. a sinistra la classifica degli stalloni compatibili, ognuno con una
 *      sola barra che dice quanti puledri su 100 diventano buoni e quanti
 *      arrivano alle corse;
 *   3. a destra il dettaglio della coppia scelta: cento puledri disegnati,
 *      il voto atteso e quattro schede (Economia, Genetica, Regole, Perche').
 *
 * Sul telefono le due colonne diventano una: il dettaglio si apre sotto lo
 * stallone toccato.
 *
 * Tutti i numeri passano da `num()`: la vecchia pagina si bloccava quando un
 * campo arrivava con un nome diverso da quello atteso, perche' chiamava
 * `.toFixed` su un valore che non c'era. Qui un dato mancante diventa "—".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import CavalloCaricamento from "../components/CavalloCaricamento";
import NameSelect from "../components/NameSelect";
import { PredictionCard, ReasonsList, InbreedingPanel, RulesPanel, RoiRangePanel, ConclusioneEconomica } from "../components/AdvisorInsights";
import type { Prediction, InbreedingDetail, Eligibility, RoiRange, Rivendita } from "../components/AdvisorInsights";
import { Search, AlertCircle, Euro, Sparkles, X, GitCompare, ChevronRight, ExternalLink, TriangleAlert } from "lucide-react";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";

/* ------------------------------------------------------------------ */
/* Numeri sicuri                                                       */
/* ------------------------------------------------------------------ */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Numero con `d` decimali alla italiana, oppure "—" se il dato manca. */
function num(v: unknown, d = 0): string {
  return isNum(v) ? v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
}
function euro(v: unknown): string {
  return isNum(v) && v > 0 ? `€ ${num(v)}` : "—";
}

/* ------------------------------------------------------------------ */
/* Colori                                                              */
/* ------------------------------------------------------------------ */

const C = {
  buono: "hsl(100 60% 52%)",
  corre: "hsl(205 35% 52%)",
  vuoto: "hsl(220 10% 16%)",
  cyan: "hsl(183 80% 55%)",
  oro: "hsl(51 80% 58%)",
  testo: "hsl(210 10% 88%)",
  muto: "hsl(210 8% 52%)",
  fioco: "hsl(210 8% 38%)",
  bordo: "hsl(220 10% 16%)",
  viola: "hsl(280 60% 62%)",
};
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(183 100% 55%)", SS: "hsl(150 80% 50%)", S: "hsl(120 60% 50%)",
  A: "hsl(60 80% 55%)", B: "hsl(30 80% 58%)", C: "hsl(15 70% 55%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(0 60% 45%)",
};
function gradeColor(grade: string, alpha = 1): string {
  const base = GRADE_COLORS[grade] || "hsl(210 8% 45%)";
  return alpha >= 1 ? base : base.replace(/^hsl\((.*)\)$/, `hsl($1 / ${alpha})`);
}
function inbColor(level?: string): string {
  return level === "alta" ? "hsl(0 65% 58%)" : level === "media" ? "hsl(35 85% 58%)"
    : level === "bassa" ? "hsl(60 70% 55%)" : "hsl(100 45% 48%)";
}

/** Media di tutti i puledri: uno qualsiasi diventa buono 25 volte su 100. */
const BASE_BUONI = 25;

/* ------------------------------------------------------------------ */
/* Tipi                                                                */
/* ------------------------------------------------------------------ */

interface AdvisorResult {
  found: boolean;
  suggestions?: { name: string; birth_year: number; sire: string; dam: string }[];
  fattrice?: { name: string; birth_year: number; sire: string; dam: string };
  ancestors?: string[];
  budget_max?: number;
  candidates?: Candidate[];
  validazione?: {
    stato: string; sperimentale: boolean; riserva?: string | null;
    auc_buono: number | null; auc_solo_padre: number | null; n_prova: number;
  } | null;
}

interface Candidate {
  name: string;
  stud_fee_eur?: number | null;
  stud_farm?: string | null;
  avg_score?: number | null;
  n_figli_totali?: number | null;
  pct_top_S?: number | null;
  avg_earnings?: number | null;
  expected_score?: number | null;
  expected_grade?: string | null;
  typical_low?: number | null;
  typical_high?: number | null;
  prob_buono?: number | null;
  prob_corre?: number | null;
  confidence_label?: string | null;
  value_index?: number | null;
  inbreeding_pct?: number | null;
  inbreeding_level?: string | null;
}

interface Simulation {
  stallion: string;
  mare: string;
  stud_fee: number;
  distribution?: { grade: string; probability: number; stallion_count: number; avg_earnings: number; expected_earnings: number }[];
  total_offspring?: number;
  source?: string;
  costs?: Record<string, number>;
  roi?: { costo_atteso: number; ricavo_atteso: number; utile_atteso: number; roi_pct: number; prob_recupero_costi: number };
  roi_range?: RoiRange;
  rivendita?: Rivendita | null;
  inbreeding?: { risk: boolean; ancestor: string | null };
  prediction?: Prediction;
  inbreeding_detail?: InbreedingDetail;
  reasons?: string[];
  eligibility?: Eligibility;
}

interface CompareRow {
  stallion: string;
  stud_fee?: number | null;
  expected_score?: number | null;
  expected_grade?: string | null;
  typical_low?: number | null;
  typical_high?: number | null;
  prob_buono?: number | null;
  prob_corre?: number | null;
  confidence_label?: string | null;
  n_offspring_sire?: number | null;
  inbreeding_pct?: number | null;
  inbreeding_level?: string | null;
  value_index?: number | null;
}

type Ordine = "buoni" | "monta" | "valore" | "figli";

/* ------------------------------------------------------------------ */
/* Stile della pagina                                                  */
/* ------------------------------------------------------------------ */

const CSS = `
.adv-cerca { display: grid; grid-template-columns: minmax(0, 1fr) 190px auto; gap: 12px; align-items: end;
  padding: 18px; border-radius: 14px; background: hsl(220 12% 9%); border: 1px solid ${C.bordo}; margin-bottom: 18px; }
.adv-avviso { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 10px;
  background: hsl(35 90% 10%); border: 1px solid hsl(35 90% 45% / 0.55); color: hsl(35 35% 88%);
  font-size: 12.5px; line-height: 1.55; margin-bottom: 16px; }
.adv-fattrice { display: flex; gap: 14px 22px; flex-wrap: wrap; align-items: center; padding: 14px 18px;
  border-radius: 12px; background: linear-gradient(90deg, hsl(280 40% 14% / 0.55), hsl(220 12% 9%));
  border: 1px solid hsl(280 40% 35% / 0.35); margin-bottom: 16px; }
.adv-barra { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.adv-ordina { display: inline-flex; padding: 3px; border-radius: 9px; background: hsl(220 12% 9%); border: 1px solid ${C.bordo}; flex-wrap: wrap; }
.adv-ordina button { background: none; border: none; color: ${C.muto}; font-size: 12px; font-weight: 600;
  padding: 6px 11px; border-radius: 7px; cursor: pointer; }
.adv-ordina button[aria-pressed="true"] { background: hsl(183 100% 38% / 0.18); color: ${C.cyan}; }
.adv-griglia { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 16px; align-items: start; }
.adv-lista { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.adv-riga { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto; gap: 4px 10px; align-items: center;
  padding: 11px 12px; border-radius: 11px; background: hsl(220 12% 9%); border: 1px solid ${C.bordo};
  cursor: pointer; transition: border-color .12s, background .12s; text-align: left; width: 100%; color: inherit; font: inherit; }
.adv-riga:hover { background: hsl(220 12% 11%); }
.adv-riga[data-attiva="true"] { border-color: hsl(183 100% 38% / 0.6); background: hsl(183 40% 12% / 0.35); }
.adv-dettaglio { position: sticky; top: 12px; min-width: 0; border-radius: 14px; background: hsl(220 12% 9%);
  border: 1px solid hsl(183 100% 38% / 0.3); padding: 18px; }
.adv-schede { display: flex; gap: 4px; border-bottom: 1px solid ${C.bordo}; margin: 18px 0 14px; overflow-x: auto; }
.adv-schede button { background: none; border: none; border-bottom: 2px solid transparent; color: ${C.muto};
  font-size: 13px; font-weight: 700; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
.adv-schede button[aria-selected="true"] { color: ${C.cyan}; border-bottom-color: ${C.cyan}; }
.adv-cifre { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.adv-cifra { padding: 10px 12px; border-radius: 10px; background: hsl(220 12% 11%); border: 1px solid ${C.bordo}; min-width: 0; }
.adv-confronto { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.adv-vassoio { position: sticky; bottom: 10px; z-index: 20; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  margin-top: 14px; padding: 10px 14px; border-radius: 12px; background: hsl(220 14% 12% / 0.96);
  border: 1px solid hsl(183 100% 38% / 0.45); box-shadow: 0 8px 28px hsl(220 30% 2% / 0.6); }
.adv-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; padding: 3px 6px 3px 9px; border-radius: 999px;
  background: hsl(183 60% 30% / 0.2); color: hsl(183 70% 70%); border: 1px solid hsl(183 60% 35% / 0.4); }
.adv-chip { white-space: nowrap; }
.adv-conta { display: none; font-size: 12.5px; color: hsl(210 8% 75%); font-weight: 600; }
.adv-chip button { background: none; border: none; color: inherit; cursor: pointer; padding: 0; display: flex; }
@media (max-width: 1023px) {
  .adv-griglia { grid-template-columns: minmax(0, 1fr); }
  .adv-dettaglio { position: static; padding: 14px; }
}
@media (max-width: 640px) {
  .adv-cerca { grid-template-columns: minmax(0, 1fr); padding: 14px; }
  .adv-riga { grid-template-columns: 22px minmax(0, 1fr) auto; }
  .adv-riga .adv-pos { display: none; }
  .adv-cifre { grid-template-columns: minmax(0, 1fr); }
  .adv-chips { display: none !important; }
  .adv-conta { display: block; flex: 1; }
}
`;

function useDesktop(): boolean {
  const q = "(min-width: 1024px)";
  const [ok, setOk] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOk(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return ok;
}

const etichetta: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: C.fioco, textTransform: "uppercase", letterSpacing: "0.07em",
};

/* ------------------------------------------------------------------ */
/* Pezzi piccoli                                                       */
/* ------------------------------------------------------------------ */

/**
 * La barra di ogni stallone: in grigio-blu quanti puledri su 100 arrivano
 * alle corse, in verde quanti diventano buoni. La tacca bianca e' la media
 * di tutti i puledri (25 su 100).
 */
function BarraBuoni({ buoni, corre }: { buoni?: number | null; corre?: number | null }) {
  const b = isNum(buoni) ? Math.max(0, Math.min(100, buoni)) : 0;
  const c = isNum(corre) ? Math.max(b, Math.min(100, corre)) : b;
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 4, background: C.vuoto, overflow: "visible" }}>
      <div style={{ position: "absolute", inset: 0, width: `${c}%`, borderRadius: 4, background: "hsl(205 30% 40% / 0.55)" }} />
      <div style={{ position: "absolute", inset: 0, width: `${b}%`, borderRadius: 4, background: `linear-gradient(90deg, hsl(100 50% 38%), ${C.buono})` }} />
      <div title="Media di tutti i puledri: 25 su 100" style={{ position: "absolute", left: `${BASE_BUONI}%`, top: -3, bottom: -3, width: 2, background: "hsl(210 10% 80% / 0.75)", borderRadius: 1 }} />
    </div>
  );
}

/** Cento puledri disegnati: verdi i buoni, azzurri quelli che corrono soltanto. */
function CentoPuledri({ buoni, corre }: { buoni?: number | null; corre?: number | null }) {
  const b = isNum(buoni) ? Math.round(buoni) : 0;
  const c = isNum(corre) ? Math.max(b, Math.round(corre)) : b;
  return (
    <div role="img" aria-label={`Su 100 puledri: ${b} buoni, ${c} arrivano alle corse`}
      style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 3, width: "100%", maxWidth: 190 }}>
      {Array.from({ length: 100 }, (_, i) => (
        <div key={i} style={{
          aspectRatio: "1", borderRadius: 3,
          background: i < b ? C.buono : i < c ? "hsl(205 30% 42%)" : C.vuoto,
        }} />
      ))}
    </div>
  );
}

function Cifra({ titolo, valore, colore, sotto }: { titolo: string; valore: React.ReactNode; colore: string; sotto?: React.ReactNode }) {
  return (
    <div className="adv-cifra">
      <div style={etichetta}>{titolo}</div>
      <div className="tabular" style={{ fontSize: 24, fontWeight: 800, color: colore, lineHeight: 1.15, marginTop: 4 }}>{valore}</div>
      {sotto && <div style={{ fontSize: 11, color: C.muto, marginTop: 2 }}>{sotto}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dettaglio di una coppia                                             */
/* ------------------------------------------------------------------ */

type Scheda = "economia" | "genetica" | "regole" | "perche";

function Dettaglio({ c, mare, onClose }: { c: Candidate; mare: string; onClose?: () => void }) {
  const [scheda, setScheda] = useState<Scheda>("economia");
  const { data: sim, isLoading, isError } = useQuery<Simulation>({
    queryKey: ["/api/advisor/simulate", c.name, mare],
    queryFn: () => apiRequest("GET", `/api/advisor/simulate?stallion=${encodeURIComponent(c.name)}&mare=${encodeURIComponent(mare)}`).then(r => r.json()),
    staleTime: 120000,
  });

  const buoni = sim?.prediction?.puledro?.prob_buono ?? c.prob_buono;
  const corre = sim?.prediction?.puledro?.prob_corre ?? c.prob_corre;

  return (
    <div className="adv-dettaglio" data-testid="advisor-dettaglio">
      {/* Intestazione della coppia */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={etichetta}>Coppia</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.testo, letterSpacing: "0.03em", marginTop: 2, overflowWrap: "anywhere" }}>
            {c.name} <span style={{ color: C.fioco, fontWeight: 500 }}>×</span> <span style={{ color: C.viola }}>{mare}</span>
          </div>
          <div style={{ fontSize: 12, color: C.muto, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>Monta <strong style={{ color: C.oro }}>{euro(c.stud_fee_eur)}</strong></span>
            <span>{num(c.n_figli_totali)} figli valutati</span>
            <Link href={`/stallion/${encodeURIComponent(c.name)}`}>
              <a style={{ color: C.cyan, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                Scheda stallone <ExternalLink size={11} />
              </a>
            </Link>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Chiudi dettaglio" style={{ background: "none", border: `1px solid ${C.bordo}`, borderRadius: 8, color: C.muto, padding: 5, cursor: "pointer", display: "flex" }}>
            <X size={15} />
          </button>
        )}
      </div>

      {/* Cento puledri + tre numeri */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
        <div style={{ flex: "0 0 auto", width: "min(190px, 100%)" }}>
          <CentoPuledri buoni={buoni} corre={corre} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: C.muto, marginTop: 7 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.buono, marginRight: 4 }} />buoni</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "hsl(205 30% 42%)", marginRight: 4 }} />corrono</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.vuoto, marginRight: 4 }} />non corrono</span>
          </div>
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "hsl(210 8% 70%)", lineHeight: 1.5 }}>
            Su <strong>100 puledri</strong> di questa coppia,{" "}
            <strong style={{ color: C.buono }}>{num(buoni)}</strong> diventano buoni cavalli e{" "}
            <strong style={{ color: "hsl(205 45% 65%)" }}>{num(corre)}</strong> arrivano alle corse.
            {isNum(buoni) && (
              <span style={{ color: C.muto }}> Un puledro qualsiasi: 25 buoni su 100.</span>
            )}
          </div>
          <div className="adv-cifre">
            <Cifra titolo="Buoni" valore={num(buoni)} colore={C.buono} sotto="su 100" />
            <Cifra titolo="Corrono" valore={num(corre)} colore="hsl(205 45% 65%)" sotto="su 100" />
            <Cifra titolo="Voto atteso" colore={C.cyan}
              valore={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{num(c.expected_score, 1)}{c.expected_grade && <GradeBadge grade={c.expected_grade} size="sm" />}</span>}
              sotto={isNum(c.typical_low) && isNum(c.typical_high) ? `di solito ${num(c.typical_low)}–${num(c.typical_high)}` : "fra chi corre"} />
          </div>
        </div>
      </div>

      {/* Schede */}
      <div className="adv-schede" role="tablist">
        {([["economia", "Economia"], ["genetica", "Genetica"], ["regole", "Regole"], ["perche", "Perché"]] as [Scheda, string][]).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={scheda === k} onClick={() => setScheda(k)} data-testid={`scheda-${k}`}>{t}</button>
        ))}
      </div>

      {isLoading && <CavalloCaricamento label="Simulazione in corso..." />}
      {(isError || (!isLoading && !sim)) && (
        <div style={{ fontSize: 13, color: C.muto }}>Non sono riuscito a calcolare il dettaglio di questa coppia.</div>
      )}
      {sim && (
        <div className="fade-in">
          {scheda === "economia" && <SchedaEconomia sim={sim} />}
          {scheda === "genetica" && <SchedaGenetica sim={sim} />}
          {scheda === "regole" && (sim.eligibility
            ? <RulesPanel el={sim.eligibility} />
            : <div style={{ fontSize: 13, color: C.muto }}>Controllo sulle regole non disponibile per questa coppia.</div>)}
          {scheda === "perche" && (
            <>
              {sim.prediction && <PredictionCard p={sim.prediction} />}
              {sim.reasons?.length ? <ReasonsList reasons={sim.reasons} /> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SchedaEconomia({ sim }: { sim: Simulation }) {
  const costi = sim.costs ?? {};
  const voci: [string, string][] = [
    ["Monta", "stud_fee"], ["Riproduzione", "riproduzione"], ["Puledro, primo anno", "puledro_anno1"],
    ["Yearling", "yearling"], ["Allenamento", "training"], ["Attività agonistica", "agone"],
  ];
  return (
    <>
      {sim.roi_range ? (
        <>
          <ConclusioneEconomica r={sim.roi_range} roiMedioStorico={sim.roi?.roi_pct ?? 0}
            ricavoMedio={sim.roi?.ricavo_atteso ?? 0} riv={sim.rivendita} />
          <div style={{ marginTop: 16 }}><RoiRangePanel r={sim.roi_range} /></div>
        </>
      ) : sim.roi ? (
        <div style={{ fontSize: 13, color: C.muto, marginBottom: 14 }}>
          Ritorno stimato sulle medie: <strong style={{ color: (sim.roi.roi_pct ?? 0) >= 0 ? C.buono : "hsl(0 60% 58%)" }}>
            {(sim.roi.roi_pct ?? 0) > 0 ? "+" : ""}{num(sim.roi.roi_pct, 1)}%</strong>
        </div>
      ) : null}

      <div style={{ ...etichetta, margin: "16px 0 8px" }}>Quanto costa arrivare alle corse (circa 2 anni e mezzo)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "2px 18px" }}>
        {voci.map(([t, k]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: `1px solid ${C.bordo}` }}>
            <span style={{ color: C.muto }}>{t}</span>
            <span className="tabular" style={{ color: "hsl(210 8% 72%)" }}>{euro(costi[k])}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0 0", fontWeight: 700 }}>
        <span style={{ color: "hsl(210 8% 68%)" }}>Costo atteso</span>
        <span className="tabular" style={{ color: "hsl(15 70% 58%)" }}>{euro(costi.costo_atteso)}</span>
      </div>
      <div style={{ fontSize: 11, color: C.fioco, marginTop: 4 }}>Tiene conto che circa 5 puledri su 100 non arrivano all'età delle corse.</div>
    </>
  );
}

function SchedaGenetica({ sim }: { sim: Simulation }) {
  const dist = sim.distribution ?? [];
  const max = Math.max(1, ...dist.map(d => (isNum(d.probability) ? d.probability : 0)));
  return (
    <>
      {sim.inbreeding_detail ? <InbreedingPanel inb={sim.inbreeding_detail} />
        : sim.inbreeding?.risk ? (
          <div style={{ fontSize: 12.5, color: "hsl(0 60% 62%)", marginBottom: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <AlertCircle size={14} /> Antenato in comune: <strong>{sim.inbreeding.ancestor}</strong>
          </div>
        ) : null}

      {dist.length > 0 && (
        <>
          <div style={{ ...etichetta, marginBottom: 8 }}>Che voto prendono i figli di questo stallone</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {dist.map(d => (
              <div key={d.grade} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) 48px", gap: 8, alignItems: "center" }}>
                <GradeBadge grade={d.grade} size="sm" />
                <div style={{ height: 16, background: C.vuoto, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(isNum(d.probability) && d.probability > 0 ? 2 : 0, ((d.probability || 0) / max) * 100)}%`,
                    background: `linear-gradient(90deg, ${gradeColor(d.grade, 0.5)}, ${gradeColor(d.grade)})`, borderRadius: 4 }} />
                </div>
                <div className="tabular" style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: gradeColor(d.grade) }}>{num(d.probability, 1)}%</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.fioco, marginTop: 8, lineHeight: 1.5 }}>
            {sim.source === "stallion_offspring"
              ? `Basato su ${num(sim.total_offspring)} figli già valutati di questo stallone.`
              : "Pochi figli valutati per questo stallone: qui c'è la distribuzione di tutti i puledri."}
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Confronto                                                           */
/* ------------------------------------------------------------------ */

function Confronto({ mare, stallions, onRemove, onClose }: { mare: string; stallions: string[]; onRemove: (n: string) => void; onClose: () => void }) {
  const key = stallions.slice().sort().join(",");
  const { data, isLoading } = useQuery<{ candidates: CompareRow[] }>({
    queryKey: ["/api/advisor/compare", mare, key],
    queryFn: () => apiRequest("GET", `/api/advisor/compare?mare=${encodeURIComponent(mare)}&stallions=${encodeURIComponent(stallions.join(","))}`).then(r => r.json()),
    staleTime: 120000,
  });
  const rows = data?.candidates ?? [];
  const best = (f: (r: CompareRow) => number | null | undefined) => {
    const v = rows.map(f).filter(isNum) as number[];
    return v.length ? Math.max(...v) : null;
  };
  const bestBuoni = best(r => r.prob_buono);
  const bestValore = best(r => r.value_index);

  return (
    <div style={{ borderRadius: 14, background: "hsl(220 12% 9%)", border: "1px solid hsl(183 100% 38% / 0.35)", padding: 16, marginBottom: 16 }} data-testid="advisor-confronto">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <GitCompare size={16} style={{ color: C.cyan }} />
        <div style={{ fontSize: 14, fontWeight: 800, color: C.testo }}>Confronto su <span style={{ color: C.viola }}>{mare}</span></div>
        <button onClick={onClose} aria-label="Chiudi confronto" style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.bordo}`, borderRadius: 8, color: C.muto, padding: 5, cursor: "pointer", display: "flex" }}>
          <X size={15} />
        </button>
      </div>
      {isLoading ? <CavalloCaricamento label="Calcolo il confronto..." /> : (
        <>
          <div className="adv-confronto">
            {rows.map(r => {
              const top = isNum(r.prob_buono) && r.prob_buono === bestBuoni;
              const valore = isNum(r.value_index) && r.value_index === bestValore && (bestValore ?? 0) > 0;
              return (
                <div key={r.stallion} style={{ borderRadius: 11, padding: 12, background: "hsl(220 12% 11%)",
                  border: `1px solid ${top ? "hsl(100 50% 40% / 0.6)" : C.bordo}`, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <Link href={`/stallion/${encodeURIComponent(r.stallion)}`}>
                      <a style={{ flex: 1, minWidth: 0, color: C.testo, fontWeight: 800, fontSize: 13, textDecoration: "none", letterSpacing: "0.03em", overflowWrap: "anywhere" }}>{r.stallion}</a>
                    </Link>
                    <button onClick={() => onRemove(r.stallion)} aria-label={`Togli ${r.stallion}`} style={{ background: "none", border: "none", color: C.fioco, cursor: "pointer", padding: 0, display: "flex" }}><X size={13} /></button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 8px", minHeight: 18 }}>
                    {top && <span style={{ fontSize: 10, fontWeight: 700, color: C.buono, border: `1px solid ${C.buono}`, borderRadius: 999, padding: "0 7px" }}>più buoni</span>}
                    {valore && <span style={{ fontSize: 10, fontWeight: 700, color: C.oro, border: `1px solid ${C.oro}`, borderRadius: 999, padding: "0 7px" }}>più qualità per euro</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="tabular" style={{ fontSize: 26, fontWeight: 800, color: C.buono }}>{num(r.prob_buono)}</span>
                    <span style={{ fontSize: 11.5, color: C.muto }}>buoni su 100 · {num(r.prob_corre)} corrono</span>
                  </div>
                  <div style={{ margin: "6px 0 10px" }}><BarraBuoni buoni={r.prob_buono} corre={r.prob_corre} /></div>
                  {([
                    ["Voto atteso", <>{num(r.expected_score, 1)} <span style={{ color: C.muto }}>{r.expected_grade ?? ""}</span></>],
                    ["Di solito", isNum(r.typical_low) && isNum(r.typical_high) ? `${num(r.typical_low)}–${num(r.typical_high)}` : "—"],
                    ["Monta", euro(r.stud_fee)],
                    ["Consanguineità", isNum(r.inbreeding_pct) && r.inbreeding_pct > 0 ? <span style={{ color: inbColor(r.inbreeding_level ?? undefined) }}>{num(r.inbreeding_pct, 2)}%</span> : "nessuna"],
                    ["Figli valutati", num(r.n_offspring_sire)],
                    ["Dati genitori", r.confidence_label ?? "—"],
                  ] as [string, React.ReactNode][]).map(([t, v]) => (
                    <div key={t} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "3px 0", borderTop: `1px solid ${C.bordo}` }}>
                      <span style={{ color: C.muto }}>{t}</span>
                      <span className="tabular" style={{ color: "hsl(210 8% 76%)", textAlign: "right" }}>{v}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <Spiegazione compatta>
            Tutti gli stalloni sono calcolati sulla stessa fattrice, quindi i numeri si possono
            confrontare. Quando le fasce "di solito" si sovrappongono quasi del tutto, la
            differenza fra due stalloni non è dimostrabile con questi dati.
          </Spiegazione>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Riga della classifica                                               */
/* ------------------------------------------------------------------ */

function Riga({ c, pos, attiva, spuntato, onApri, onSpunta }: {
  c: Candidate; pos: number; attiva: boolean; spuntato: boolean; onApri: () => void; onSpunta: (v: boolean) => void;
}) {
  const sopra = isNum(c.prob_buono) ? c.prob_buono - BASE_BUONI : null;
  return (
    <div className="adv-riga" data-attiva={attiva} role="button" tabIndex={0} onClick={onApri}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onApri(); } }}
      data-testid={`row-candidate-${pos - 1}`}>
      <input type="checkbox" title="Aggiungi al confronto" aria-label={`Confronta ${c.name}`} checked={spuntato}
        onClick={e => e.stopPropagation()} onChange={e => onSpunta(e.target.checked)}
        style={{ accentColor: "hsl(183 100% 38%)", cursor: "pointer", width: 16, height: 16, margin: 0 }} />
      <div className="adv-pos tabular" style={{ fontSize: 12, fontWeight: 800, color: pos <= 3 ? C.cyan : C.fioco, textAlign: "center" }}>{pos}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: C.testo, letterSpacing: "0.03em", overflowWrap: "anywhere" }}>{c.name}</span>
          <span style={{ fontSize: 11, color: C.fioco }}>{num(c.n_figli_totali)} figli</span>
        </div>
        <div style={{ margin: "7px 0 5px" }}><BarraBuoni buoni={c.prob_buono} corre={c.prob_corre} /></div>
        <div style={{ display: "flex", gap: "2px 12px", flexWrap: "wrap", fontSize: 11.5, color: C.muto }}>
          <span><strong className="tabular" style={{ color: C.buono }}>{num(c.prob_buono)}</strong> buoni</span>
          <span><strong className="tabular" style={{ color: "hsl(205 45% 65%)" }}>{num(c.prob_corre)}</strong> corrono</span>
          {isNum(c.inbreeding_pct) && c.inbreeding_pct > 0 && (
            <span style={{ color: inbColor(c.inbreeding_level ?? undefined) }}>consang. {num(c.inbreeding_pct, 2)}%</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span className="tabular" style={{ fontSize: 12.5, fontWeight: 700, color: isNum(c.stud_fee_eur) && c.stud_fee_eur > 0 ? C.oro : C.fioco, whiteSpace: "nowrap" }}>
          {euro(c.stud_fee_eur)}
        </span>
        {sopra != null && (
          <span className="tabular" style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", color: sopra >= 0 ? C.buono : "hsl(0 55% 60%)" }}>
            {sopra >= 0 ? "+" : ""}{num(sopra)} sulla media
          </span>
        )}
        <ChevronRight size={14} style={{ color: attiva ? C.cyan : C.fioco }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagina                                                              */
/* ------------------------------------------------------------------ */

export default function AdvisorPage() {
  const [fattrice, setFattrice] = useState("");
  const [budget, setBudget] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mostraConfronto, setMostraConfronto] = useState(false);
  const [ordine, setOrdine] = useState<Ordine>("buoni");
  const desktop = useDesktop();
  const confrontoRef = useRef<HTMLDivElement>(null);

  const { mutate, data, isPending } = useMutation<AdvisorResult, Error, { fattrice: string; budget_max?: number }>({
    mutationFn: async (body) => (await apiRequest("POST", "/api/advisor", body)).json(),
  });

  function cerca(nome: string) {
    if (!nome.trim()) return;
    setAperto(null); setSelected([]); setMostraConfronto(false);
    const b = parseInt(budget);
    mutate({ fattrice: nome.trim(), budget_max: Number.isFinite(b) && b > 0 ? b : undefined },
      { onSuccess: r => { if (r?.found && r.candidates?.length && window.matchMedia("(min-width: 1024px)").matches) setAperto(r.candidates[0].name); } });
  }

  const mareName = data?.fattrice?.name || fattrice.trim();

  const lista = useMemo(() => {
    const cs = (data?.candidates ?? []).slice();
    const v = (x: unknown, dflt: number) => (isNum(x) ? x : dflt);
    if (ordine === "buoni") cs.sort((a, b) => v(b.prob_buono, -1) - v(a.prob_buono, -1) || v(b.expected_score, 0) - v(a.expected_score, 0));
    if (ordine === "monta") cs.sort((a, b) => v(a.stud_fee_eur || null, 1e12) - v(b.stud_fee_eur || null, 1e12));
    if (ordine === "valore") cs.sort((a, b) => v(b.value_index, -1) - v(a.value_index, -1));
    if (ordine === "figli") cs.sort((a, b) => v(b.n_figli_totali, 0) - v(a.n_figli_totali, 0));
    return cs;
  }, [data, ordine]);

  const attivo = lista.find(c => c.name === aperto) ?? null;

  function spunta(nome: string, v: boolean) {
    setSelected(prev => v ? (prev.includes(nome) ? prev : prev.concat([nome]).slice(0, 6)) : prev.filter(n => n !== nome));
  }
  function apriConfronto() {
    setMostraConfronto(true);
    setTimeout(() => confrontoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const val = data?.validazione;

  return (
    <div className="page-shell">
      <style>{CSS}</style>
      <IntestazionePagina icona={Sparkles} colore={C.viola} titolo="Advisor Allevatore" etichetta="sperimentale" margineSotto={18}
        sottotitolo="Scegli una fattrice: ti mostro gli stalloni compatibili in ordine di quanti puledri su 100 diventano buoni cavalli.">
        Per ogni stallone compatibile vedi quanti puledri su 100 di quella coppia
        diventano buoni cavalli e quanti arrivano alle corse, il voto atteso fra chi
        corre, la consanguineità e la tassa di monta. Tocca uno stallone per il
        dettaglio; spunta la casella di due o più stalloni per confrontarli. Serve a
        restringere una lista, non a garantire un puledro.
      </IntestazionePagina>

      {/* 1. Ricerca */}
      <form className="adv-cerca" onSubmit={e => { e.preventDefault(); cerca(fattrice); }}>
        <div style={{ minWidth: 0 }}>
          <NameSelect label="Fattrice" value={fattrice} onChange={n => setFattrice(n.toUpperCase())}
            endpoint="/api/search/fattrice" placeholder="Scegli una fattrice dall'elenco" />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(210 8% 48%)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
            Monta massima
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "hsl(220 12% 14%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, padding: "10px 12px" }}>
            <Euro size={15} style={{ color: "hsl(210 8% 48%)", flexShrink: 0 }} />
            <input value={budget} onChange={e => setBudget(e.target.value)} placeholder="Nessun limite" type="number" min="0" inputMode="numeric"
              data-testid="input-budget" style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: C.testo, fontSize: 14 }} />
          </div>
        </div>
        <button type="submit" disabled={isPending || !fattrice.trim()} data-testid="button-advisor-submit" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 22px", borderRadius: 8, border: "none",
          background: isPending || !fattrice.trim() ? "hsl(220 10% 18%)" : "hsl(183 100% 38%)",
          color: isPending || !fattrice.trim() ? "hsl(210 8% 45%)" : "hsl(220 13% 7%)",
          cursor: isPending || !fattrice.trim() ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700,
        }}>
          <Search size={15} /> {isPending ? "Analisi..." : "Trova stalloni"}
        </button>
      </form>

      {isPending && <CavalloCaricamento label="Ricerca stalloni compatibili..." />}

      {/* Fattrice non trovata */}
      {!isPending && data && !data.found && (
        (data.suggestions?.length ?? 0) > 0 ? (
          <div className="pannello" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "hsl(25 55% 58%)", fontSize: 13 }}>
              <AlertCircle size={16} /> Non ho trovato esattamente "{fattrice}". Forse cercavi:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
              {data.suggestions!.map(s => (
                <button key={`${s.name}-${s.birth_year}`} onClick={() => { setFattrice(s.name); cerca(s.name); }} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 8, background: "hsl(220 12% 11%)",
                  border: `1px solid ${C.bordo}`, color: "hsl(210 8% 78%)", cursor: "pointer", fontSize: 13,
                }}>
                  <strong>{s.name}</strong><div style={{ fontSize: 11.5, color: C.muto }}>{s.birth_year} · padre {s.sire || "—"}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 12, padding: "18px 20px", background: "hsl(220 12% 9%)", border: "1px solid hsl(0 50% 35% / 0.4)",
            color: "hsl(0 62% 60%)", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={16} /> La fattrice "{fattrice}" non è nell'archivio.
          </div>
        )
      )}

      {/* Prima della ricerca: come funziona */}
      {!isPending && !data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            ["1", "Scegli la fattrice", "Dall'elenco, e se vuoi un tetto alla tassa di monta."],
            ["2", "Leggi la classifica", "Per ogni stallone, quanti puledri su 100 diventano buoni e quanti corrono."],
            ["3", "Apri o confronta", "Il dettaglio della coppia: costi, consanguineità, regole. Oppure più stalloni affiancati."],
          ].map(([n, t, d]) => (
            <div key={n} style={{ padding: 16, borderRadius: 12, background: "hsl(220 12% 9%)", border: `1px solid ${C.bordo}` }}>
              <div style={{ width: 26, height: 26, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800,
                color: C.viola, border: `1px solid ${C.viola}`, marginBottom: 10 }}>{n}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.testo }}>{t}</div>
              <div style={{ fontSize: 12.5, color: C.muto, marginTop: 4, lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      )}

      {/* Risultati */}
      {!isPending && data?.found && data.fattrice && (
        <div className="fade-in">
          {/* Avviso sempre visibile, sopra qualsiasi numero. */}
          <div className="adv-avviso" data-testid="advisor-avviso">
            <TriangleAlert size={16} style={{ color: "hsl(35 95% 62%)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ color: "hsl(35 95% 62%)" }}>Previsione sperimentale: indica una tendenza, non il destino del singolo puledro.</strong>{" "}
              Un puledro qualsiasi diventa buono (fra il 25% migliore dei nati dell'anno) 25 volte su 100: la tacca bianca sulle barre.
              <Spiegazione titolo="Quanto ci si può fidare" compatta>
                La previsione è stata provata su {num(val?.n_prova ?? 6000)} puledri nati fra il 2020 e
                il 2022, mai visti dal modello, compresi quelli che non hanno mai corso. Le fasce sono
                risultate vere: quando dice 37 su 100, i buoni cavalli sono stati circa 37 su 100. Ma il
                vantaggio su chi guarda solo il padre è piccolo
                {isNum(val?.auc_buono) && isNum(val?.auc_solo_padre)
                  ? ` (${num(val!.auc_buono, 3)} contro ${num(val!.auc_solo_padre, 3)}, dove 0,5 è tirare a sorte e 1 è indovinare sempre)`
                  : ""}
                : due fratelli pieni hanno carriere diverse, e allenamento, guidatore, salute e sorte
                contano più dei genitori.{val?.riserva ? <> {val.riserva}</> : null} Il voto atteso, in
                più, è calcolato solo su chi corre.
              </Spiegazione>
            </div>
          </div>

          {/* La fattrice */}
          <div className="adv-fattrice">
            <div style={{ minWidth: 0 }}>
              <div style={{ ...etichetta, color: C.viola }}>Fattrice</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.testo, letterSpacing: "0.04em" }}>{data.fattrice.name}</div>
              <div style={{ fontSize: 12, color: C.muto, marginTop: 2 }}>
                nata nel {data.fattrice.birth_year ?? "—"} · da {data.fattrice.sire || "—"} e {data.fattrice.dam || "—"}
              </div>
            </div>
            {(data.ancestors?.length ?? 0) > 0 && (
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ ...etichetta, color: "hsl(0 50% 58%)", marginBottom: 6 }}>Stalloni esclusi perché parenti stretti</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {data.ancestors!.map(a => (
                    <span key={a} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "hsl(0 50% 35% / 0.15)",
                      border: "1px solid hsl(0 50% 35% / 0.35)", color: "hsl(0 50% 66%)" }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Confronto */}
          <div ref={confrontoRef}>
            {mostraConfronto && selected.length >= 2 && (
              <Confronto mare={mareName} stallions={selected}
                onRemove={n => spunta(n, false)} onClose={() => setMostraConfronto(false)} />
            )}
          </div>

          {/* Barra della classifica */}
          <div className="adv-barra">
            <div style={{ fontSize: 14, fontWeight: 800, color: C.testo, marginRight: "auto" }}>
              {lista.length} stalloni compatibili
              {isNum(data.budget_max) && data.budget_max > 0 && (
                <span style={{ fontSize: 12, fontWeight: 500, color: C.muto }}> · monta fino a {euro(data.budget_max)}</span>
              )}
            </div>
            <div className="adv-ordina" role="group" aria-label="Ordina per">
              {([["buoni", "Più buoni"], ["monta", "Monta più bassa"], ["valore", "Qualità per euro"], ["figli", "Più figli valutati"]] as [Ordine, string][]).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={ordine === k} onClick={() => setOrdine(k)}>{t}</button>
              ))}
            </div>
          </div>

          {lista.length === 0 ? (
            <div style={{ padding: 18, borderRadius: 12, background: "hsl(220 12% 9%)", border: `1px solid ${C.bordo}`, fontSize: 13, color: C.muto }}>
              Nessuno stallone compatibile{isNum(data.budget_max) ? " con questa monta massima: prova ad alzarla o a toglierla." : "."}
            </div>
          ) : (
            <div className="adv-griglia">
              <div className="adv-lista">
                {lista.map((c, i) => (
                  <div key={c.name} style={{ minWidth: 0 }}>
                    <Riga c={c} pos={i + 1} attiva={aperto === c.name} spuntato={selected.includes(c.name)}
                      onApri={() => setAperto(aperto === c.name && !desktop ? null : c.name)} onSpunta={v => spunta(c.name, v)} />
                    {!desktop && aperto === c.name && (
                      <div style={{ marginTop: 6 }}><Dettaglio c={c} mare={mareName} onClose={() => setAperto(null)} /></div>
                    )}
                  </div>
                ))}
              </div>
              {desktop && (
                attivo ? <Dettaglio key={attivo.name} c={attivo} mare={mareName} /> : (
                  <div className="adv-dettaglio" style={{ borderStyle: "dashed", color: C.muto, fontSize: 13, textAlign: "center", padding: 40 }}>
                    Scegli uno stallone dalla classifica per vedere il dettaglio della coppia.
                  </div>
                )
              )}
            </div>
          )}

          {/* Vassoio del confronto */}
          {selected.length > 0 && (
            <div className="adv-vassoio" data-testid="advisor-vassoio">
              <GitCompare size={15} style={{ color: C.cyan }} />
              <span className="adv-conta">{selected.length === 1 ? "1 stallone scelto" : `${selected.length} stalloni scelti`}</span>
              <div className="adv-chips" style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                {selected.map(n => (
                  <span key={n} className="adv-chip">{n}<button onClick={() => spunta(n, false)} aria-label={`Togli ${n}`}><X size={12} /></button></span>
                ))}
              </div>
              {selected.length < 2 ? (
                <span style={{ fontSize: 12, color: C.muto }}>Spunta un altro stallone</span>
              ) : (
                <button onClick={apriConfronto} data-testid="button-confronta" style={{ background: "hsl(183 100% 38%)", color: "hsl(220 13% 7%)",
                  border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Confronta {selected.length}
                </button>
              )}
              <button onClick={() => { setSelected([]); setMostraConfronto(false); }} style={{ background: "none", border: `1px solid ${C.bordo}`,
                color: C.muto, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Azzera</button>
            </div>
          )}
        </div>
      )}

      <CollegamentiCorrelati voci={[
        { href: "/validazione", titolo: "Verifica advisor", descrizione: "Il consiglio messo alla prova su puledri mai visti dal modello, e perché resta sperimentale." },
        { href: "/fattrici", titolo: "Fattrici", descrizione: "Cerca un'altra fattrice da cui partire, valutata sulla progenie." },
        { href: "/stalloni", titolo: "Catalogo stalloni", descrizione: "Tutti gli stalloni valutati, con tasse di monta e allevamento." },
      ]} />
    </div>
  );
}
