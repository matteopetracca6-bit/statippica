import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { getFlag } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { useState, useMemo } from "react";

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
  best_stallion: { name: string; final_score: number; grade: string; n_figli_totali: number; pct_top_S: number; stud_fee_eur: number; nationality: string } | null;
}

type SortKey = "final_score" | "earnings" | "top_S" | "stallions" | "figli";

export default function StudFarmsPage() {
  const [sortBy, setSortBy] = useState<SortKey>("final_score");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: farms, isLoading } = useQuery<Farm[]>({
    queryKey: ["/api/stud-farms"],
    queryFn: () => apiRequest("GET", "/api/stud-farms").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!farms) return [];
    const s = search.trim().toLowerCase();
    const list = s
      ? farms.filter(f => f.stud_farm.toLowerCase().includes(s))
      : farms;
    return [...list].sort((a, b) => {
      if (sortBy === "final_score") return (b.avg_final_score || 0) - (a.avg_final_score || 0);
      if (sortBy === "earnings") return (b.total_earnings || 0) - (a.total_earnings || 0);
      if (sortBy === "top_S") return (b.pct_top_S || 0) - (a.pct_top_S || 0);
      if (sortBy === "figli") return (b.n_figli_totali || 0) - (a.n_figli_totali || 0);
      return b.n_stallions - a.n_stallions;
    });
  }, [farms, search, sortBy]);

  const fmt = (v: number) => v?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—";
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v);

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Allevamenti
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Classifica degli allevamenti per qualita' della produzione.
        </p>
      </div>

      {/* Search + sort */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca allevamento..."
          style={{
            flex: "1 1 200px", background: "hsl(220 14% 10%)",
            border: "1px solid hsl(220 10% 18%)", borderRadius: "8px",
            padding: "8px 14px", color: "hsl(210 10% 90%)", fontSize: "13px",
            outline: "none", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {([
            ["final_score", "Score"],
            ["earnings", "Guadagni"],
            ["top_S", "Top-S%"],
            ["figli", "Figli"],
            ["stallions", "Stalloni"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              style={{
                padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                background: sortBy === key ? "hsl(183 100% 38%)" : "hsl(220 10% 14%)",
                color: sortBy === key ? "hsl(220 13% 7%)" : "hsl(210 8% 55%)",
                border: "none", fontSize: "11px", fontWeight: 700,
                transition: "all 0.2s ease",
                transform: sortBy === key ? "scale(1.05)" : "scale(1)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!isLoading && filtered.length > 0 && (
        <div style={{ fontSize: "12px", color: "hsl(210 8% 40%)", marginBottom: "12px" }}>
          {filtered.length} allevamenti
          {search && ` trovati per "${search}"`}
        </div>
      )}

      {isLoading ? (
        <TrottingHorseLoader label="Caricamento allevamenti..." />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "hsl(210 8% 38%)", fontSize: "14px" }}>
          Nessun allevamento trovato.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((farm, i) => {
            const isOpen = expanded === farm.stud_farm;
            return (
              <div key={farm.stud_farm} style={{
                background: isOpen ? "hsl(220 12% 11%)" : "hsl(220 12% 10%)",
                border: isOpen ? "1px solid hsl(183 60% 30%)" : "1px solid hsl(220 10% 16%)",
                borderRadius: "12px",
                transition: "all 0.25s ease",
                transform: isOpen ? "scale(1.005)" : "scale(1)",
                boxShadow: isOpen ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
              }}>
                {/* Main row — clickable */}
                <div
                  onClick={() => setExpanded(isOpen ? null : farm.stud_farm)}
                  style={{
                    padding: "16px 20px",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "12px",
                  }}
                  onMouseEnter={e => {
                    if (!isOpen) e.currentTarget.parentElement.style.borderColor = "hsl(183 40% 25%)";
                  }}
                  onMouseLeave={e => {
                    if (!isOpen) e.currentTarget.parentElement.style.borderColor = "hsl(220 10% 16%)";
                  }}
                >
                  {/* Rank */}
                  <span className="tabular" style={{
                    fontSize: "18px", fontWeight: 800,
                    color: i < 3 ? ["hsl(51 80% 55%)", "hsl(210 8% 70%)", "hsl(25 60% 50%)"][i] : "hsl(210 8% 35%)",
                    minWidth: "32px", transition: "all 0.2s",
                  }}>
                    {i + 1}
                  </span>

                  {/* Farm name + summary */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {farm.stud_farm}
                    </div>
                    <div style={{ fontSize: "12px", color: "hsl(210 8% 48%)", marginTop: "2px" }}>
                      {farm.n_stallions} stalloni · {fmt(farm.n_figli_totali)} figli · {fmt(farm.n_in_corsa)} in gara
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Score</div>
                      <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(183 80% 58%)", transition: "color 0.2s" }}>
                        {farm.avg_final_score?.toFixed(1) ?? "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Top-S</div>
                      <div className="tabular" style={{
                        fontSize: "16px", fontWeight: 700,
                        color: farm.pct_top_S >= 15 ? "hsl(100 50% 55%)" : "hsl(210 8% 55%)",
                      }}>
                        {farm.pct_top_S?.toFixed(1) ?? "—"}%
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Guadagni</div>
                      <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                        €{fmtK(farm.total_earnings)}
                      </div>
                    </div>
                  </div>

                  {/* Expand arrow */}
                  <div style={{
                    transition: "transform 0.25s ease",
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    color: "hsl(210 8% 40%)",
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M4 2 L9 7 L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Expanded details */}
                <div style={{
                  maxHeight: isOpen ? "500px" : "0",
                  overflow: "hidden",
                  transition: "max-height 0.3s ease, padding 0.3s ease",
                  padding: isOpen ? "0 20px 16px" : "0 20px",
                }}>
                  {isOpen && (
                    <div style={{
                      borderTop: "1px solid hsl(220 10% 14%)",
                      paddingTop: "16px",
                      display: "flex", gap: "20px", flexWrap: "wrap",
                    }}>
                      {/* Grade breakdown bars */}
                      <div style={{ flex: "1 1 250px" }}>
                        <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
                          Distribuzione voti figli
                        </div>
                        <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "60px" }}>
                          {[
                            ["SSS", farm.n_SSS, "hsl(183 100% 55%)"],
                            ["SS", farm.n_SS, "hsl(150 80% 50%)"],
                            ["S", farm.n_S, "hsl(120 60% 50%)"],
                          ].map(([g, cnt, col]) => {
                            const max = Math.max(farm.n_SSS, farm.n_SS, farm.n_S, 1);
                            return (
                              <div key={g as string} style={{ flex: 1, textAlign: "center" }}>
                                <div className="tabular" style={{ fontSize: "11px", color: col as string, fontWeight: 700, marginBottom: "2px" }}>
                                  {fmt(cnt as number)}
                                </div>
                                <div style={{
                                  height: `${((cnt as number) / max) * 40}px`,
                                  background: (col as string) + "66",
                                  borderTop: `2px solid ${col}`,
                                  borderRadius: "3px 3px 0 0",
                                  transition: "height 0.4s ease",
                                }} />
                                <div style={{ fontSize: "10px", color: "hsl(210 8% 42%)", marginTop: "3px" }}>{g as string}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Best stallion */}
                      {farm.best_stallion && (
                        <div style={{ flex: "1 1 200px" }}>
                          <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
                            Miglior stallone
                          </div>
                          <Link href={`/stallion/${encodeURIComponent(farm.best_stallion.name)}`}>
                            <a style={{
                              display: "inline-flex", alignItems: "center", gap: "8px",
                              background: "hsl(183 100% 38% / 0.1)",
                              padding: "8px 14px", borderRadius: "8px",
                              textDecoration: "none",
                              transition: "background 0.2s",
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = "hsl(183 100% 38% / 0.2)"}
                              onMouseLeave={e => e.currentTarget.style.background = "hsl(183 100% 38% / 0.1)"}
                            >
                              <span style={{ fontSize: "14px", fontWeight: 700, color: "hsl(183 80% 62%)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ fontSize: "16px" }}>{getFlag(farm.best_stallion.nationality, farm.best_stallion.name)}</span>
                                {farm.best_stallion.name}
                              </span>
                              {farm.best_stallion.grade && <GradeBadge grade={farm.best_stallion.grade} size="sm" />}
                              <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                                {fmt(farm.best_stallion.n_figli_totali)} figli
                              </span>
                              {farm.best_stallion.stud_fee_eur > 0 && (
                                <span className="tabular" style={{ fontSize: "12px", color: "hsl(51 70% 55%)" }}>
                                  €{fmt(farm.best_stallion.stud_fee_eur)}
                                </span>
                              )}
                            </a>
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
