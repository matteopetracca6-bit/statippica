import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { Search, Dna, AlertCircle, Euro, TrendingUp, Users } from "lucide-react";

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

export default function AdvisorPage() {
  const [fattrice, setFattrice] = useState("");
  const [budget, setBudget] = useState("");
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
    mutate({ fattrice: fattrice.trim(), budget_max: budget ? parseInt(budget) : undefined });
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: "920px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Advisor Allevatore
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Inserisci la tua fattrice e ottieni i migliori stalloni compatibili per pedigree e ROI atteso.
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

      {/* Results */}
      {data && !data.found && (
        <div>
          {(data.suggestions?.length ?? 0) > 0 ? (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "20px 22px",
            }}>
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
                    fontSize: "13px", letterSpacing: "0.03em",
                    transition: "background 0.1s",
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

          {/* Candidates table */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 22px 0", fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 80%)" }}>
              {data.candidates?.length ?? 0} stalloni compatibili
              {data.budget_max && ` (budget ≤ €${data.budget_max.toLocaleString("it-IT")})`}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "14px" }}>
                <thead style={{ background: "hsl(220 12% 9%)" }}>
                  <tr>
                    {["Stallone", "Monta", "Allevamento", "Avg score", "In corsa", "% top-S", "Guad. medi", "Prod. 2024"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "10px 14px",
                        fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        borderBottom: "1px solid hsl(220 10% 16%)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.candidates?.map((c, i) => (
                    <tr
                      key={c.name}
                      data-testid={`row-candidate-${i}`}
                      style={{ borderBottom: "1px solid hsl(220 10% 13%)", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <td style={{ padding: "11px 14px" }}>
                        <Link href={`/stallion/${encodeURIComponent(c.name)}`}>
                          <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 85%)", textDecoration: "none", letterSpacing: "0.04em" }}>
                            {c.name}
                          </a>
                        </Link>
                      </td>
                      <td className="tabular" style={{ padding: "11px 14px", fontSize: "13px", color: c.stud_fee_eur ? "hsl(51 80% 58%)" : "hsl(210 8% 42%)" }}>
                        {c.stud_fee_eur ? `€${c.stud_fee_eur.toLocaleString("it-IT")}` : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: "12px", color: "hsl(210 8% 50%)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.stud_farm || "—"}
                      </td>
                      <td className="tabular" style={{ padding: "11px 14px", fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)" }}>
                        {c.avg_score?.toFixed(1) ?? "—"}
                      </td>
                      <td className="tabular" style={{ padding: "11px 14px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                        {c.n_in_corsa ?? "—"}
                      </td>
                      <td className="tabular" style={{ padding: "11px 14px", fontSize: "12px", color: c.pct_top_S >= 20 ? "hsl(100 50% 55%)" : "hsl(210 8% 52%)" }}>
                        {c.pct_top_S != null ? `${c.pct_top_S.toFixed(1)}%` : "—"}
                      </td>
                      <td className="tabular" style={{ padding: "11px 14px", fontSize: "12px", color: "hsl(51 70% 55%)" }}>
                        {c.avg_earnings != null ? `€${c.avg_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td className="tabular" style={{ padding: "11px 14px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>
                        {c.progeny_earnings_2024 ? `€${(c.progeny_earnings_2024 / 1000).toFixed(0)}k` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
