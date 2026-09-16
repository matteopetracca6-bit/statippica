import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { useState } from "react";

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(183 100% 55%)", SS: "hsl(150 80% 50%)", S: "hsl(120 60% 50%)",
  A: "hsl(60 80% 55%)", B: "hsl(30 80% 58%)", C: "hsl(15 70% 55%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(0 60% 45%)",
};

interface TrendsData {
  gradeByYear: { birth_year: number; grade: string; cnt: number }[];
  earningsByYear: { birth_year: number; n_horses: number; avg_earnings: number; avg_races: number; avg_wins: number; avg_win_rate: number }[];
  racesPerYear: { year: string; n_races: number; n_horses: number; avg_prize: number; total_prize: number }[];
  topTracks: { track: string; n_races: number; avg_prize: number; total_prize: number }[];
}

type View = "grades" | "earnings" | "races" | "tracks";

export default function TrendsPage() {
  const [view, setView] = useState<View>("grades");

  const { data, isLoading } = useQuery<TrendsData>({
    queryKey: ["/api/trends"],
    queryFn: () => apiRequest("GET", "/api/trends").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const fmt = (v: number) => v?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—";
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v);

  // Build stacked bar data for grades by year
  const years = data ? [...new Set(data.gradeByYear.map(g => g.birth_year))].sort() : [];
  const gradeDataByYear = years.map(yr => {
    const grades = GRADE_ORDER.map(g => ({
      grade: g,
      cnt: data!.gradeByYear.find(d => d.birth_year === yr && d.grade === g)?.cnt ?? 0,
    }));
    const total = grades.reduce((s, g) => s + g.cnt, 0);
    return { year: yr, grades, total };
  });

  // Max for scaling earnings chart
  const maxEarnings = data ? Math.max(...data.earningsByYear.map(e => e.avg_earnings), 1) : 1;
  const maxRaces = data ? Math.max(...data.racesPerYear.map(r => r.n_races), 1) : 1;
  const maxTrackRaces = data ? Math.max(...data.topTracks.map(t => t.n_races), 1) : 1;

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Trend Temporali
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Come cambiano voti, guadagni e gare nel tempo.
        </p>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        {([
          ["grades", "Voti per anno"],
          ["earnings", "Guadagni per anno"],
          ["races", "Gare per anno"],
          ["tracks", "Top ippodromi"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
              background: view === key ? "hsl(183 100% 38%)" : "hsl(220 10% 14%)",
              color: view === key ? "hsl(220 13% 7%)" : "hsl(210 8% 55%)",
              border: "none", fontSize: "12px", fontWeight: 700,
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TrottingHorseLoader label="Caricamento trend..." />
      ) : !data ? (
        <div style={{ color: "hsl(210 8% 45%)", padding: "40px" }}>Nessun dato.</div>
      ) : (
        <>
          {/* Grade distribution by year — stacked bar chart */}
          {view === "grades" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Distribuzione voti per anno di nascita
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "240px", padding: "0 4px" }}>
                {gradeDataByYear.map(yd => (
                  <div key={yd.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: 0 }}>
                    <div style={{
                      display: "flex", flexDirection: "column-reverse", height: "200px",
                      width: "100%", borderRadius: "4px 4px 0 0", overflow: "hidden",
                    }}>
                      {yd.grades.map(g => g.cnt > 0 && (
                        <div
                          key={g.grade}
                          title={`${yd.year} ${g.grade}: ${g.cnt}`}
                          style={{
                            height: `${(g.cnt / yd.total) * 100}%`,
                            background: GRADE_COLORS[g.grade] + "88",
                            borderTop: `1px solid ${GRADE_COLORS[g.grade]}`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="tabular" style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>{yd.year}</span>
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap", justifyContent: "center" }}>
                {GRADE_ORDER.map(g => (
                  <div key={g} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: GRADE_COLORS[g] + "88" }} />
                    <span style={{ color: "hsl(210 8% 55%)" }}>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Earnings by year — bar chart */}
          {view === "earnings" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Guadagno medio per anno di nascita
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "240px", padding: "0 4px" }}>
                {data.earningsByYear.map(yr => (
                  <div key={yr.birth_year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: 0 }}>
                    <span className="tabular" style={{ fontSize: "10px", color: "hsl(51 70% 55%)", fontWeight: 700 }}>
                      €{fmtK(yr.avg_earnings)}
                    </span>
                    <div style={{
                      width: "100%", height: `${(yr.avg_earnings / maxEarnings) * 200}px`,
                      background: "linear-gradient(180deg, hsl(51 80% 55%), hsl(30 70% 45%))",
                      borderRadius: "4px 4px 0 0",
                    }} />
                    <span className="tabular" style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>{yr.birth_year}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "16px", fontSize: "11px", color: "hsl(210 8% 42%)" }}>
                Cavalli per anno: {data.earningsByYear.map(y => `${y.birth_year}: ${y.n_horses}`).join(" · ")}
              </div>
            </div>
          )}

          {/* Races per year — bar chart */}
          {view === "races" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Gare e cavalli per anno
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "240px", padding: "0 4px" }}>
                {data.racesPerYear.map(yr => (
                  <div key={yr.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: 0 }}>
                    <span className="tabular" style={{ fontSize: "10px", color: "hsl(183 80% 55%)", fontWeight: 700 }}>
                      {fmtK(yr.n_races)}
                    </span>
                    <div style={{
                      width: "100%", height: `${(yr.n_races / maxRaces) * 200}px`,
                      background: "linear-gradient(180deg, hsl(183 80% 50%), hsl(183 60% 35%))",
                      borderRadius: "4px 4px 0 0",
                    }} />
                    <span className="tabular" style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>{yr.year}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "12px", display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "11px", color: "hsl(210 8% 42%)" }}>
                {data.racesPerYear.map(yr => (
                  <span key={yr.year}>{yr.year}: {fmtK(yr.n_horses)} cavalli · €{fmtK(yr.avg_prize)} media</span>
                ))}
              </div>
            </div>
          )}

          {/* Top tracks */}
          {view === "tracks" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Top ippodromi per numero di gare
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {data.topTracks.map((t, i) => (
                  <div key={t.track} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 35%)", minWidth: "24px" }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: "13px", color: "hsl(210 10% 80%)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.track || "—"}
                    </span>
                    <div style={{ flex: 2, height: "18px", background: "hsl(220 10% 12%)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${(t.n_races / maxTrackRaces) * 100}%`,
                        background: "hsl(183 80% 45%)", borderRadius: "4px",
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                    <span className="tabular" style={{ fontSize: "12px", color: "hsl(183 80% 55%)", minWidth: "60px", textAlign: "right" }}>
                      {fmt(t.n_races)}
                    </span>
                    <span className="tabular" style={{ fontSize: "12px", color: "hsl(51 70% 55%)", minWidth: "70px", textAlign: "right" }}>
                      €{fmtK(t.total_prize)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
