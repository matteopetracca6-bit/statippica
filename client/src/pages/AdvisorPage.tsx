import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import NameSelect from "../components/NameSelect";
import { PredictionCard, ReasonsList, InbreedingPanel, RulesPanel, RoiRangePanel, ConclusioneEconomica } from "../components/AdvisorInsights";
import type { Prediction, InbreedingDetail, Eligibility, RoiRange, Rivendita } from "../components/AdvisorInsights";
import { Search, Dna, AlertCircle, Euro, TrendingUp, Users, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(183 100% 55%)", SS: "hsl(150 80% 50%)", S: "hsl(120 60% 50%)",
  A: "hsl(60 80% 55%)", B: "hsl(30 80% 58%)", C: "hsl(15 70% 55%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(0 60% 45%)",
};

/**
 * Colore di un voto, eventualmente trasparente.
 *
 * Le barre della distribuzione erano grigie perche' al colore veniva
 * appiccicato "88" in fondo (`hsl(...)88`): e' una scrittura valida solo per
 * i colori esadecimali, quindi il browser buttava via tutta la regola. Qui la
 * trasparenza viene messa dentro la parentesi, come vuole la notazione hsl.
 */
function gradeColor(grade: string, alpha = 1): string {
  const base = GRADE_COLORS[grade] || "hsl(210 8% 45%)";
  if (alpha >= 1) return base;
  return base.replace(/^hsl\((.*)\)$/, `hsl($1 / ${alpha})`);
}

interface AdvisorResult {
  found: boolean;
  suggestions?: { name: string; birth_year: number; sire: string; dam: string }[];
  fattrice?: { name: string; birth_year: number; sire: string; dam: string };
  ancestors?: string[];
  budget_max?: number;
  candidates?: Candidate[];
}

interface Candidate {
  name: string;
  stud_fee_eur: number;
  stud_farm: string;
  avg_score: number;
  n_in_corsa: number;
  /** Figli con un voto in archivio: e' il campione su cui poggia tutto il resto. */
  n_figli_totali: number;
  n_SSS: number; n_SS: number; n_S: number;
  pct_top_S: number;
  avg_earnings: number;
  media_in_corsa: number;
  progeny_earnings_2024: number;
  // Campi prodotti dal motore di previsione padre+madre: dipendono dalla
  // fattrice scelta, quindi cambiano da ricerca a ricerca.
  expected_score?: number;
  expected_grade?: string;
  typical_low?: number;
  typical_high?: number;
  prob_top?: number;
  confidence_label?: string;
  value_index?: number;
  inbreeding_pct?: number;
  inbreeding_level?: string;
}

interface Simulation {
  stallion: string;
  mare: string;
  stud_fee: number;
  distribution: { grade: string; probability: number; stallion_count: number; avg_earnings: number; expected_earnings: number }[];
  total_offspring: number;
  source: string;
  costs: { stud_fee: number; riproduzione: number; puledro_anno1: number; yearling: number; training: number; agone: number; costo_base: number; costo_se_morte: number; costo_atteso: number };
  roi: { costo_atteso: number; ricavo_atteso: number; utile_atteso: number; roi_pct: number; prob_recupero_costi: number };
  roi_range?: RoiRange;
  rivendita?: Rivendita | null;
  inbreeding: { risk: boolean; ancestor: string | null };
  prediction?: Prediction;
  inbreeding_detail?: InbreedingDetail;
  reasons?: string[];
  eligibility?: Eligibility;
}

function SimulationPanel({ stallion, mare }: { stallion: string; mare: string }) {
  const { data: sim, isLoading } = useQuery<Simulation>({
    queryKey: ["/api/advisor/simulate", stallion, mare],
    queryFn: () => apiRequest("GET", `/api/advisor/simulate?stallion=${encodeURIComponent(stallion)}&mare=${encodeURIComponent(mare)}`).then(r => r.json()),
    staleTime: 120000,
  });

  if (isLoading) return <TrottingHorseLoader label="Simulazione in corso..." />;

  if (!sim) return <div style={{ padding: "16px", color: "hsl(210 8% 45%)", fontSize: "13px" }}>Errore caricamento simulazione.</div>;

  const maxProb = Math.max(...sim.distribution.map(d => d.probability), 1);
  const roiPositive = sim.roi.roi_pct >= 0;

  return (
    <div style={{ marginTop: "12px", padding: "16px 18px", background: "hsl(220 12% 8%)", borderRadius: "10px", border: "1px solid hsl(220 10% 14%)" }}>
      {/* Voto atteso con fascia di incertezza */}
      {sim.prediction && <PredictionCard p={sim.prediction} />}
      {sim.reasons && <ReasonsList reasons={sim.reasons} />}
      {sim.inbreeding_detail && <InbreedingPanel inb={sim.inbreeding_detail} />}
      {sim.eligibility && <RulesPanel el={sim.eligibility} />}
      {sim.roi_range && <RoiRangePanel r={sim.roi_range} />}

      {/* Grade probability distribution */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
          Distribuzione voti puledro atteso
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0", fontSize: "9.5px", color: "hsl(210 8% 38%)", marginBottom: "4px" }}>
          <span style={{ width: "50px", textAlign: "right" }}>probab.</span>
          <span style={{ width: "70px", textAlign: "right" }}>media livello</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {sim.distribution.map(d => (
            <div key={d.grade} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "32px", textAlign: "center" }}>
                <GradeBadge grade={d.grade} size="sm" />
              </div>
              <div style={{ flex: 1, height: "22px", background: "hsl(220 10% 12%)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.max(d.probability > 0 ? 2 : 0, (d.probability / maxProb) * 100)}%`,
                  background: `linear-gradient(90deg, ${gradeColor(d.grade, 0.55)}, ${gradeColor(d.grade)})`,
                  borderRadius: "4px",
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ width: "50px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: gradeColor(d.grade) }}>
                {d.probability.toFixed(1)}%
              </div>
              <div style={{ width: "70px", textAlign: "right", fontSize: "11px", color: "hsl(210 8% 45%)" }}>
                €{(d.avg_earnings / 1000).toFixed(0)}k
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: "10px", color: "hsl(210 8% 35%)", marginTop: "8px" }}>
          {sim.source === "stallion_offspring"
            ? `Basato su ${sim.total_offspring} figli gia' valutati di questo stallone. La colonna in euro e' la media di tutti i cavalli di quel livello, non il guadagno del puledro tipico: per quello vedi la conclusione qui sotto.`
            : "Pochi figli valutati per questo stallone: la distribuzione e' quella generale di tutti i puledri."}
        </div>
      </div>

      {/* Il vecchio avviso di inbreeding resta solo se manca il calcolo nuovo,
          che e' piu' preciso (coefficiente di Wright sul pedigree completo). */}
      {!sim.inbreeding_detail && sim.inbreeding?.risk && (
        <div style={{
          background: "hsl(0 50% 20% / 0.3)", border: "1px solid hsl(0 50% 35%)",
          borderRadius: "8px", padding: "10px 14px", marginBottom: "14px",
          display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "hsl(0 60% 60%)",
        }}>
          <AlertCircle size={14} /> Rischio inbreeding: antenato comune <strong>{sim.inbreeding.ancestor}</strong>
        </div>
      )}

      {/* Cost breakdown */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
          Costi allevamento (costi vivi, 2.5 anni)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
          {[
            ["Stud fee", sim.costs.stud_fee],
            ["Riproduzione", sim.costs.riproduzione],
            ["Puledro anno 1", sim.costs.puledro_anno1],
            ["Yearling", sim.costs.yearling],
            ["Training", sim.costs.training],
            ["Attività agonistica", sim.costs.agone],
          ].map(([label, val]) => (
            <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0" }}>
              <span style={{ color: "hsl(210 8% 50%)" }}>{label}</span>
              <span className="tabular" style={{ color: "hsl(210 8% 65%)" }}>
                €{(val as number).toLocaleString("it-IT")}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "6px 0 0", borderTop: "1px solid hsl(220 10% 14%)", gridColumn: "1 / -1" }}>
            <span style={{ color: "hsl(210 8% 60%)", fontWeight: 700 }}>Costo atteso (95% sopravvivenza)</span>
            <span className="tabular" style={{ color: "hsl(15 70% 55%)", fontWeight: 700 }}>
              €{sim.costs.costo_atteso.toLocaleString("it-IT")}
            </span>
          </div>
        </div>
      </div>

      {/* Conclusione economica: sostituisce il vecchio riquadro "ROI atteso",
          che era calcolato sulle medie dei guadagni e finiva per contraddire
          la fascia mostrata piu' in alto (verde +48% mentre il puledro tipico
          perdeva il 62%). */}
      {sim.roi_range ? (
        <ConclusioneEconomica
          r={sim.roi_range}
          roiMedioStorico={sim.roi.roi_pct}
          ricavoMedio={sim.roi.ricavo_atteso}
          riv={sim.rivendita}
        />
      ) : (
        <div style={{
          background: roiPositive ? "hsl(100 30% 12%)" : "hsl(0 30% 12%)",
          border: `1px solid ${roiPositive ? "hsl(100 50% 30%)" : "hsl(0 50% 30%)"}`,
          borderRadius: "10px", padding: "14px 18px",
        }}>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
            Ritorno stimato sulle medie
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: roiPositive ? "hsl(100 60% 55%)" : "hsl(0 60% 55%)" }}>
            {sim.roi.roi_pct > 0 ? "+" : ""}{sim.roi.roi_pct.toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

interface CompareRow {
  stallion: string;
  stud_fee: number | null;
  stud_farm: string | null;
  expected_score: number;
  expected_grade: string;
  typical_low: number;
  typical_high: number;
  prob_top: number;
  prob_poor: number;
  confidence_label: string;
  n_offspring_sire: number;
  inbreeding_pct: number;
  inbreeding_level: string;
  value_index: number | null;
}

/**
 * Confronto affiancato di piu' stalloni sulla stessa fattrice.
 *
 * Serve perche' leggere le schede una per una non aiuta a scegliere: qui le
 * righe sono tutte calcolate sulla stessa madre, quindi i voti attesi sono
 * confrontabili fra loro.
 */
function ComparePanel({ mare, stallions, onClear }: { mare: string; stallions: string[]; onClear: () => void }) {
  const key = stallions.slice().sort().join(",");
  const { data, isLoading } = useQuery<{ candidates: CompareRow[] }>({
    queryKey: ["/api/advisor/compare", mare, key],
    queryFn: () => apiRequest("GET", `/api/advisor/compare?mare=${encodeURIComponent(mare)}&stallions=${encodeURIComponent(stallions.join(","))}`).then(r => r.json()),
    staleTime: 120000,
  });

  const rows = data?.candidates ?? [];
  const bestScore = Math.max.apply(null, rows.map(r => r.expected_score).concat([0]));
  const bestValue = Math.max.apply(null, rows.map(r => r.value_index ?? 0).concat([0]));

  const th: React.CSSProperties = {
    fontSize: "10px", color: "hsl(210 8% 40%)", textTransform: "uppercase",
    letterSpacing: "0.05em", fontWeight: 700, textAlign: "right",
    padding: "0 0 8px", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    fontSize: "12.5px", textAlign: "right", padding: "8px 0",
    borderTop: "1px solid hsl(220 10% 14%)", whiteSpace: "nowrap",
  };

  return (
    <div style={{
      background: "hsl(220 12% 10%)", border: "1px solid hsl(183 100% 38% / 0.28)",
      borderRadius: "12px", padding: "16px 18px", marginBottom: "16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: "hsl(183 80% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Confronto su {mare}
        </div>
        <button onClick={onClear} style={{
          marginLeft: "auto", background: "none", border: "1px solid hsl(220 10% 22%)",
          borderRadius: "6px", color: "hsl(210 8% 55%)", fontSize: "11px",
          padding: "4px 10px", cursor: "pointer",
        }}>Azzera</button>
      </div>

      {isLoading ? <TrottingHorseLoader label="Calcolo il confronto..." /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "620px" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Stallone</th>
                <th style={th}>Voto atteso</th>
                <th style={th}>Fascia tipica</th>
                <th style={th}>Alto livello</th>
                <th style={th}>Deludente</th>
                <th style={th}>Consang.</th>
                <th style={th}>Monta</th>
                <th style={th}>Qualita' per euro</th>
                <th style={th}>Attendib.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isBest = r.expected_score === bestScore;
                const isValue = (r.value_index ?? 0) === bestValue && bestValue > 0;
                return (
                  <tr key={r.stallion}>
                    <td style={{ ...td, textAlign: "left" }}>
                      <Link href={`/stallion/${encodeURIComponent(r.stallion)}`}>
                        <a style={{ color: "hsl(210 10% 85%)", textDecoration: "none", fontWeight: 700, letterSpacing: "0.03em" }}>
                          {r.stallion}
                        </a>
                      </Link>
                      <div style={{ fontSize: "10.5px", color: "hsl(210 8% 40%)" }}>
                        {r.n_offspring_sire} figli valutati
                      </div>
                    </td>
                    <td style={td}>
                      <span className="tabular" style={{ fontWeight: 800, color: isBest ? "hsl(100 60% 55%)" : "hsl(183 80% 60%)" }}>
                        {r.expected_score.toFixed(1)}
                      </span>{" "}
                      <span style={{ fontSize: "10.5px", color: "hsl(210 8% 45%)" }}>{r.expected_grade}</span>
                    </td>
                    <td style={{ ...td, color: "hsl(210 8% 58%)" }} className="tabular">
                      {r.typical_low.toFixed(0)}–{r.typical_high.toFixed(0)}
                    </td>
                    <td style={{ ...td, color: "hsl(100 55% 52%)" }} className="tabular">{r.prob_top.toFixed(0)}%</td>
                    <td style={{ ...td, color: "hsl(0 60% 58%)" }} className="tabular">{r.prob_poor.toFixed(0)}%</td>
                    <td style={{ ...td, color: r.inbreeding_level === "nessuna" ? "hsl(210 8% 45%)" : "hsl(35 85% 58%)" }} className="tabular">
                      {r.inbreeding_pct > 0 ? `${r.inbreeding_pct.toFixed(2)}%` : "—"}
                    </td>
                    <td style={{ ...td, color: "hsl(51 75% 58%)" }} className="tabular">
                      {r.stud_fee ? `€${r.stud_fee.toLocaleString("it-IT")}` : "—"}
                    </td>
                    <td style={{ ...td, color: isValue ? "hsl(100 60% 55%)" : "hsl(210 8% 58%)", fontWeight: isValue ? 800 : 400 }} className="tabular">
                      {r.value_index != null ? r.value_index.toFixed(2) : "—"}
                    </td>
                    <td style={{ ...td, color: "hsl(210 8% 55%)", fontSize: "11.5px" }}>{r.confidence_label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: "10.5px", color: "hsl(210 8% 35%)", marginTop: "10px", lineHeight: 1.5 }}>
            In verde il voto atteso piu' alto e la miglior qualita' per euro speso. La fascia
            tipica contiene meta' dei puledri attesi: quando due fasce si sovrappongono quasi
            del tutto, la differenza fra i due stalloni non e' dimostrabile con questi dati.
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdvisorPage() {
  const [fattrice, setFattrice] = useState("");
  const [budget, setBudget] = useState("");
  const [expandedStallion, setExpandedStallion] = useState<string | null>(null);
  // Stalloni spuntati per il confronto affiancato
  const [selected, setSelected] = useState<string[]>([]);
  const [, navigate] = useLocation();

  const { mutate, data, isPending, error } = useMutation<AdvisorResult, Error, { fattrice: string; budget_max?: number }>({
    mutationFn: async (body) => {
      const r = await apiRequest("POST", "/api/advisor", body);
      return r.json();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fattrice.trim()) return;
    setExpandedStallion(null);
    setSelected([]);
    mutate({ fattrice: fattrice.trim(), budget_max: budget ? parseInt(budget) : undefined });
  }

  const mareName = data?.fattrice?.name || fattrice.trim();

  return (
    <div className="page-shell">
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Advisor Allevatore
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Inserisci la tua fattrice: per ogni stallone compatibile vedrai la distribuzione probabilita' voti del puledro, i guadagni stimati e il ROI.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", padding: "22px", marginBottom: "24px",
        display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end",
      }}>
        <div style={{ flex: "1 1 300px" }}>
          {/* Tendina di scelta: prima bisognava sapere a memoria il nome esatto */}
          <NameSelect
            label="Fattrice"
            value={fattrice}
            onChange={n => setFattrice(n.toUpperCase())}
            endpoint="/api/search/fattrice"
            placeholder="Scegli una fattrice dall'elenco"
          />
        </div>

        <div style={{ flex: "0 1 180px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 48%)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "8px" }}>
            Budget monta (€)
          </label>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "hsl(220 12% 14%)", border: "1px solid hsl(220 10% 22%)",
            borderRadius: "8px", padding: "10px 14px",
          }}>
            <Euro size={15} style={{ color: "hsl(210 8% 48%)", flexShrink: 0 }} />
            <input
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="Nessun limite"
              type="number"
              min="0"
              data-testid="input-budget"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "hsl(210 10% 88%)", fontSize: "14px" }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || !fattrice.trim()}
          data-testid="button-advisor-submit"
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", borderRadius: "8px",
            background: isPending || !fattrice.trim() ? "hsl(220 10% 18%)" : "hsl(183 100% 38%)",
            color: isPending || !fattrice.trim() ? "hsl(210 8% 45%)" : "hsl(220 13% 7%)",
            border: "none", cursor: isPending || !fattrice.trim() ? "not-allowed" : "pointer",
            fontSize: "14px", fontWeight: 700, letterSpacing: "0.03em",
            transition: "all 0.15s",
          }}
        >
          <Search size={15} />
          {isPending ? "Analisi..." : "Analizza"}
        </button>
      </form>

      {/* Loading */}
      {isPending && <TrottingHorseLoader label="Ricerca stalloni compatibili..." />}

      {/* Not found */}
      {data && !data.found && (
        <div>
          {(data.suggestions?.length ?? 0) > 0 ? (
            <div style={{ background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "12px", padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", color: "hsl(25 55% 55%)", fontSize: "13px" }}>
                <AlertCircle size={16} /> Fattrice non trovata esattamente. Intendevi:
              </div>
              {data.suggestions!.map(s => (
                <button
                  key={`${s.name}-${s.birth_year}`}
                  onClick={() => { setFattrice(s.name); mutate({ fattrice: s.name, budget_max: budget ? parseInt(budget) : undefined }); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", borderRadius: "8px",
                    background: "none", border: "1px solid hsl(220 10% 20%)",
                    color: "hsl(210 8% 75%)", cursor: "pointer", marginBottom: "6px",
                    fontSize: "13px", letterSpacing: "0.03em", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 15%)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <strong>{s.name}</strong> · {s.birth_year} · padre: {s.sire || "—"}
                </button>
              ))}
            </div>
          ) : (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(0 50% 35% / 0.4)",
              borderRadius: "12px", padding: "20px 22px",
              color: "hsl(0 62% 55%)", fontSize: "13px",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <AlertCircle size={16} /> Fattrice "{fattrice}" non trovata nel database.
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {data?.found && data.fattrice && (
        <div className="fade-in">
          {/* Fattrice info */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(183 100% 38% / 0.25)",
            borderRadius: "12px", padding: "18px 22px", marginBottom: "20px",
            display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: "11px", color: "hsl(183 60% 45%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Fattrice selezionata</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "hsl(210 10% 90%)", letterSpacing: "0.04em" }}>{data.fattrice.name}</div>
              <div style={{ fontSize: "12px", color: "hsl(210 8% 52%)", marginTop: "3px" }}>
                {data.fattrice.birth_year} · Padre: {data.fattrice.sire || "—"} · Madre: {data.fattrice.dam || "—"}
              </div>
            </div>
            {data.ancestors && data.ancestors.length > 0 && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "hsl(0 50% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  Antenati esclusi (inbreeding)
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {data.ancestors.map(a => (
                    <span key={a} style={{
                      fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                      background: "hsl(0 50% 35% / 0.15)", border: "1px solid hsl(0 50% 35% / 0.3)",
                      color: "hsl(0 50% 60%)",
                    }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Candidates */}
          <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 80%)", marginBottom: "12px" }}>
            {data.candidates?.length ?? 0} stalloni compatibili — clicca per vedere la simulazione
            {data.budget_max && ` (budget ≤ €${data.budget_max.toLocaleString("it-IT")})`}
          </div>

          {selected.length >= 2 && (
            <ComparePanel mare={mareName} stallions={selected} onClear={() => setSelected([])} />
          )}
          {selected.length === 1 && (
            <div style={{ fontSize: "11.5px", color: "hsl(210 8% 45%)", marginBottom: "10px" }}>
              Spunta almeno un altro stallone per vedere il confronto affiancato.
            </div>
          )}

          {/* Candidate cards with expandable simulation */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.candidates?.map((c, i) => {
              const expanded = expandedStallion === c.name;
              return (
                <div key={c.name} style={{
                  background: "hsl(220 12% 10%)",
                  border: expanded ? "1px solid hsl(183 100% 38% / 0.3)" : "1px solid hsl(220 10% 16%)",
                  borderRadius: "12px", overflow: "hidden",
                  transition: "border-color 0.15s",
                }}>
                  {/* Candidate header row */}
                  <div
                    data-testid={`row-candidate-${i}`}
                    onClick={() => setExpandedStallion(expanded ? null : c.name)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "12px 18px", cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <input
                      type="checkbox"
                      title="Aggiungi al confronto"
                      checked={selected.indexOf(c.name) >= 0}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setSelected(prev =>
                        e.target.checked ? prev.concat([c.name]).slice(0, 6)
                                         : prev.filter(n => n !== c.name))}
                      style={{ accentColor: "hsl(183 100% 38%)", cursor: "pointer", flexShrink: 0 }}
                    />
                    <Link href={`/stallion/${encodeURIComponent(c.name)}`} onClick={e => e.stopPropagation()}>
                      <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 85%)", textDecoration: "none", letterSpacing: "0.04em" }}
                        onMouseEnter={e => e.currentTarget.style.color = "hsl(183 80% 62%)"}
                        onMouseLeave={e => e.currentTarget.style.color = "hsl(210 10% 85%)"}
                      >
                        {c.name}
                      </a>
                    </Link>

                    {/* Stats badges */}
                    <div style={{ display: "flex", gap: "10px", flex: 1, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Euro size={11} style={{ color: "hsl(51 80% 55%)" }} />
                        <span className="tabular" style={{ fontSize: "12px", color: c.stud_fee_eur ? "hsl(51 80% 58%)" : "hsl(210 8% 42%)" }}>
                          {c.stud_fee_eur ? `€${c.stud_fee_eur.toLocaleString("it-IT")}` : "—"}
                        </span>
                      </div>
                      {c.expected_score !== undefined && (
                        <div title="Voto atteso del puledro da questa fattrice" style={{
                          display: "flex", alignItems: "center", gap: "5px",
                          padding: "2px 8px", borderRadius: "5px",
                          background: "hsl(183 60% 30% / 0.18)", border: "1px solid hsl(183 60% 35% / 0.35)",
                        }}>
                          <span className="tabular" style={{ fontSize: "13px", fontWeight: 800, color: "hsl(183 80% 62%)" }}>
                            {c.expected_score.toFixed(1)}
                          </span>
                          <GradeBadge grade={c.expected_grade || "—"} size="sm" />
                          <span style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>
                            atteso {c.typical_low?.toFixed(0)}–{c.typical_high?.toFixed(0)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <TrendingUp size={11} style={{ color: "hsl(183 80% 55%)" }} />
                        <span className="tabular" style={{ fontSize: "12px", color: "hsl(183 80% 58%)", fontWeight: 700 }}>
                          {c.avg_score?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Users size={11} style={{ color: "hsl(210 8% 50%)" }} />
                        <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                          {c.n_figli_totali ?? "—"} figli valutati
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Sparkles size={11} style={{ color: c.pct_top_S >= 20 ? "hsl(100 50% 55%)" : "hsl(210 8% 52%)" }} />
                        <span className="tabular" style={{ fontSize: "12px", color: c.pct_top_S >= 20 ? "hsl(100 50% 55%)" : "hsl(210 8% 52%)" }}>
                          {c.pct_top_S != null ? `${c.pct_top_S.toFixed(1)}% top-S` : "—"}
                        </span>
                      </div>
                      <span className="tabular" style={{ fontSize: "12px", color: "hsl(51 70% 55%)" }}>
                        €{c.avg_earnings != null ? c.avg_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 }) : "—"} medi
                      </span>
                    </div>

                    {expanded
                      ? <ChevronUp size={16} style={{ color: "hsl(183 80% 55%)", flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: "hsl(210 8% 40%)", flexShrink: 0 }} />}
                  </div>

                  {/* Expandable simulation */}
                  {expanded && mareName && (
                    <SimulationPanel stallion={c.name} mare={mareName} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
