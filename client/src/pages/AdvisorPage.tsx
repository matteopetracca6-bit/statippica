import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { Search, Dna, AlertCircle, Euro, TrendingUp, Users, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(183 100% 55%)", SS: "hsl(150 80% 50%)", S: "hsl(120 60% 50%)",
  A: "hsl(60 80% 55%)", B: "hsl(30 80% 58%)", C: "hsl(15 70% 55%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(0 60% 45%)",
};

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
  n_SSS: number; n_SS: number; n_S: number;
  pct_top_S: number;
  avg_earnings: number;
  media_in_corsa: number;
  progeny_earnings_2024: number;
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
  inbreeding: { risk: boolean; ancestor: string | null };
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
      {/* Grade probability distribution */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
          Distribuzione voti puledro atteso
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {sim.distribution.map(d => (
            <div key={d.grade} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "32px", textAlign: "center" }}>
                <GradeBadge grade={d.grade} size="sm" />
              </div>
              <div style={{ flex: 1, height: "22px", background: "hsl(220 10% 12%)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${(d.probability / maxProb) * 100}%`,
                  background: `${GRADE_COLORS[d.grade]}88`, borderRadius: "4px",
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ width: "50px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: GRADE_COLORS[d.grade] }}>
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
            ? `Basato su ${sim.total_offspring} figli esistenti di questo stallone`
            : "Dati insufficienti sullo stallone — uso distribuzione popolazione generale"}
        </div>
      </div>

      {/* Inbreeding warning */}
      {sim.inbreeding?.risk && (
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

      {/* ROI summary */}
      <div style={{
        background: roiPositive ? "hsl(100 30% 12%)" : "hsl(0 30% 12%)",
        border: `1px solid ${roiPositive ? "hsl(100 50% 30%)" : "hsl(0 50% 30%)"}`,
        borderRadius: "10px", padding: "14px 18px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
            ROI atteso
          </div>
          <div style={{
            fontSize: "22px", fontWeight: 800,
            color: roiPositive ? "hsl(100 60% 55%)" : "hsl(0 60% 55%)",
          }}>
            {sim.roi.roi_pct > 0 ? "+" : ""}{sim.roi.roi_pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 40%)", marginTop: "2px" }}>
            Ricavo atteso: €{sim.roi.ricavo_atteso.toLocaleString("it-IT")} · Utile: €{sim.roi.utile_atteso.toLocaleString("it-IT")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
            Prob. recupero costi
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "hsl(183 80% 55%)" }}>
            {sim.roi.prob_recupero_costi.toFixed(1)}%
          </div>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 40%)", marginTop: "2px" }}>
            P(cavalli con guadagni ≥ costo)
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  const [fattrice, setFattrice] = useState("");
  const [budget, setBudget] = useState("");
  const [expandedStallion, setExpandedStallion] = useState<string | null>(null);
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
    mutate({ fattrice: fattrice.trim(), budget_max: budget ? parseInt(budget) : undefined });
  }

  const mareName = data?.fattrice?.name || fattrice.trim();

  return (
    <div style={{ padding: "28px 32px", maxWidth: "920px" }}>
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
        <div style={{ flex: "1 1 280px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 48%)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "8px" }}>
            Nome fattrice
          </label>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "hsl(220 12% 14%)", border: "1px solid hsl(220 10% 22%)",
            borderRadius: "8px", padding: "10px 14px",
          }}>
            <Dna size={15} style={{ color: "hsl(210 8% 48%)", flexShrink: 0 }} />
            <input
              value={fattrice}
              onChange={e => setFattrice(e.target.value.toUpperCase())}
              placeholder="Es. BELLISSIMA GRIF"
              data-testid="input-fattrice"
              required
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "hsl(210 10% 88%)", fontSize: "14px", letterSpacing: "0.04em" }}
            />
          </div>
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
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <TrendingUp size={11} style={{ color: "hsl(183 80% 55%)" }} />
                        <span className="tabular" style={{ fontSize: "12px", color: "hsl(183 80% 58%)", fontWeight: 700 }}>
                          {c.avg_score?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Users size={11} style={{ color: "hsl(210 8% 50%)" }} />
                        <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                          {c.n_in_corsa ?? "—"} in gara
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
