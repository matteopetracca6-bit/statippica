import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { useState } from "react";

interface Farm {
  stud_farm: string;
  n_stallions: number;
  n_figli_totali: number;
  n_in_corsa: number;
  avg_score: number;
  avg_final_score: number;
  pct_top_S: number;
  n_SSS: number; n_SS: number; n_S: number;
  total_earnings: number;
  best_stallion: { name: string; final_score: number; grade: string; n_figli_totali: number; pct_top_S: number; stud_fee_eur: number } | null;
}

export default function StudFarmsPage() {
  const [sortBy, setSortBy] = useState<"final_score" | "earnings" | "top_S" | "stallions">("final_score");

  const { data: farms, isLoading } = useQuery<Farm[]>({
    queryKey: ["/api/stud-farms"],
    queryFn: () => apiRequest("GET", "/api/stud-farms").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const sorted = farms ? [...farms].sort((a, b) => {
    if (sortBy === "final_score") return (b.avg_final_score || 0) - (a.avg_final_score || 0);
    if (sortBy === "earnings") return (b.total_earnings || 0) - (a.total_earnings || 0);
    if (sortBy === "top_S") return (b.pct_top_S || 0) - (a.pct_top_S || 0);
    return b.n_stallions - a.n_stallions;
  }) : [];

  const fmt = (v: number) => v?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—";
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v);

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Allevamenti
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Classifica degli allevamenti per qualita' della produzione: stalloni, figli, score medio e guadagni.
        </p>
      </div>

      {/* Sort tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {([
          ["final_score", "Score"],
          ["earnings", "Guadagni"],
          ["top_S", "Top-S%"],
          ["stallions", "N stalloni"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            style={{
              padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
              background: sortBy === key ? "hsl(183 100% 38%)" : "hsl(220 10% 14%)",
              color: sortBy === key ? "hsl(220 13% 7%)" : "hsl(210 8% 55%)",
              border: "none", fontSize: "12px", fontWeight: 700,
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TrottingHorseLoader label="Caricamento allevamenti..." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sorted.map((farm, i) => (
            <div key={farm.stud_farm} style={{
              background: "hsl(220 12% 10%)",
              border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px",
              padding: "16px 20px",
              transition: "border-color 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "hsl(183 60% 30%)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "hsl(220 10% 16%)"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <span className="tabular" style={{
                  fontSize: "16px", fontWeight: 800, color: "hsl(210 8% 35%)",
                  minWidth: "30px",
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
                    {farm.stud_farm}
                  </div>
                  <div style={{ fontSize: "12px", color: "hsl(210 8% 48%)", marginTop: "2px" }}>
                    {farm.n_stallions} stalloni · {fmt(farm.n_figli_totali)} figli totali · {fmt(farm.n_in_corsa)} in gara
                  </div>
                </div>
                {farm.best_stallion && (
                  <Link href={`/stallion/${encodeURIComponent(farm.best_stallion.name)}`}>
                    <a style={{
                      fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)",
                      textDecoration: "none",
                      background: "hsl(183 100% 38% / 0.1)",
                      padding: "4px 12px", borderRadius: "6px",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(183 100% 38% / 0.2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "hsl(183 100% 38% / 0.1)"}
                    >
                      {farm.best_stallion.name}
                      {farm.best_stallion.grade && <> · <GradeBadge grade={farm.best_stallion.grade} size="sm" /></>}
                    </a>
                  </Link>
                )}
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score medio</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(183 80% 58%)" }}>
                    {farm.avg_final_score?.toFixed(1) ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Top-S%</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: farm.pct_top_S >= 15 ? "hsl(100 50% 55%)" : "hsl(210 8% 55%)" }}>
                    {farm.pct_top_S?.toFixed(1) ?? "—"}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>SSS+SS+S</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(51 80% 55%)" }}>
                    {fmt(farm.n_SSS + farm.n_SS + farm.n_S)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Guadagni totali</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                    €{fmtK(farm.total_earnings)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
