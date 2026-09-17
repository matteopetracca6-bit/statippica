import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { getFlag } from "@/lib/flags";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { useState } from "react";

interface TopRacesData {
  topPrize: { horse_name: string; race_date: string; track: string; placement: number; placement_raw: string; time_km: number; distance: number; driver: string; prize_net: number; prize_gross: number; total_starters: number; start_pos: number }[];
  fastestTimes: { horse_name: string; race_date: string; track: string; time_km: number; distance: number; prize_net: number; driver: string }[];
  upsets: { horse_name: string; race_date: string; track: string; start_pos: number; total_starters: number; prize_net: number; driver: string; time_km: number }[];
  dominantHorses: { horse_name: string; n_races: number; n_wins: number; win_rate: number; total_earnings: number; biggest_prize: number }[];
}

type View = "topPrize" | "fastest" | "upsets" | "dominant";

export default function TopRacesPage() {
  const [view, setView] = useState<View>("topPrize");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const { data, isLoading } = useQuery<TopRacesData>({
    queryKey: ["/api/top-races"],
    queryFn: () => apiRequest("GET", "/api/top-races?limit=50").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const fmt = (v: number) => v?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—";
  const fmtDate = (d: string) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  };
  const fmtTime = (t: number) => t ? `1:${(t / 10).toFixed(1)}` : "—";

  const views: { key: View; label: string; icon: string }[] = [
    { key: "topPrize", label: "Montepremi top", icon: "💰" },
    { key: "fastest", label: "Tempi record", icon: "⚡" },
    { key: "upsets", label: "Sorprese", icon: "🔥" },
    { key: "dominant", label: "Dominatori", icon: "👑" },
  ];

  const rowStyle = (i: number, isHeader = false) => ({
    padding: "8px 12px",
    fontSize: "13px",
    color: hoveredRow === i && !isHeader ? "hsl(210 10% 95%)" : "hsl(210 8% 55%)",
    fontWeight: hoveredRow === i && !isHeader ? 600 : 400,
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Top Performance
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Le migliori gare, i tempi record, le sorprese e i dominatori del trotto italiano.
        </p>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        {views.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              padding: "8px 16px", borderRadius: "10px", cursor: "pointer",
              background: view === key ? "hsl(183 100% 38%)" : "hsl(220 10% 14%)",
              color: view === key ? "hsl(220 13% 7%)" : "hsl(210 8% 55%)",
              border: "none", fontSize: "12px", fontWeight: 700,
              transition: "all 0.25s ease",
              transform: view === key ? "scale(1.08)" : "scale(1)",
              boxShadow: view === key ? `0 3px 12px hsl(183 100% 38% / 0.3)` : "none",
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TrottingHorseLoader label="Caricamento top performance..." size={120} />
      ) : !data ? (
        <div style={{ color: "hsl(210 8% 45%)", padding: "40px" }}>Nessun dato.</div>
      ) : (
        <div className="fade-in" style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "12px", overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              {/* TOP PRIZE */}
              {view === "topPrize" && (
                <>
                  <thead style={{ background: "hsl(220 12% 9%)" }}>
                    <tr>
                      {["Cavallo", "Data", "Track", "Posto", "Tempo", "Dist", "Driver", "Premio €"].map((h, i) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 12px",
                          fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: "1px solid hsl(220 10% 16%)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPrize.slice(0, 30).map((r, i) => (
                      <tr
                        key={i}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          borderBottom: "1px solid hsl(220 10% 12%)",
                          background: hoveredRow === i ? "hsl(183 100% 38% / 0.08)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <td style={{ ...rowStyle(i) }}>
                          <Link href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ fontSize: "15px" }}>{getFlag(r.country, r.horse_name)}</span>
                              {r.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td style={{ ...rowStyle(i) }}>{fmtDate(r.race_date)}</td>
                        <td style={{ ...rowStyle(i) }}>{r.track || "—"}</td>
                        <td style={{ ...rowStyle(i), color: r.placement === 1 ? "hsl(100 60% 50%)" : "hsl(210 8% 55%)", fontWeight: r.placement === 1 ? 700 : 400 }}>
                          {r.placement_raw || r.placement}
                        </td>
                        <td className="tabular" style={{ ...rowStyle(i) }}>{fmtTime(r.time_km)}</td>
                        <td className="tabular" style={{ ...rowStyle(i) }}>{r.distance || "—"}m</td>
                        <td style={{ ...rowStyle(i) }}>{r.driver || "—"}</td>
                        <td className="tabular" style={{ ...rowStyle(i), fontSize: "14px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                          €{fmt(r.prize_net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* FASTEST TIMES */}
              {view === "fastest" && (
                <>
                  <thead style={{ background: "hsl(220 12% 9%)" }}>
                    <tr>
                      {["#", "Cavallo", "Data", "Track", "Tempo", "Dist", "Premio €"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 12px",
                          fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: "1px solid hsl(220 10% 16%)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.fastestTimes.map((r, i) => (
                      <tr
                        key={i}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          borderBottom: "1px solid hsl(220 10% 12%)",
                          background: hoveredRow === i ? "hsl(100 50% 50% / 0.08)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <td className="tabular" style={{
                          padding: "8px 12px", fontSize: "15px", fontWeight: 800,
                          color: i < 3 ? ["hsl(51 80% 55%)", "hsl(210 8% 70%)", "hsl(25 60% 50%)"][i] : "hsl(210 8% 40%)",
                        }}>
                          {i < 3 ? ["1°", "2°", "3°"][i] : i + 1}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ fontSize: "15px" }}>{getFlag(r.country, r.horse_name)}</span>
                              {r.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td style={{ ...rowStyle(i) }}>{fmtDate(r.race_date)}</td>
                        <td style={{ ...rowStyle(i) }}>{r.track || "—"}</td>
                        <td className="tabular" style={{
                          padding: "8px 12px", fontSize: "15px", fontWeight: 800,
                          color: hoveredRow === i ? "hsl(100 70% 60%)" : "hsl(100 60% 50%)",
                          transition: "color 0.15s",
                        }}>
                          {fmtTime(r.time_km)}
                        </td>
                        <td className="tabular" style={{ ...rowStyle(i) }}>{r.distance}m</td>
                        <td className="tabular" style={{ ...rowStyle(i), color: "hsl(51 70% 55%)" }}>€{fmt(r.prize_net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* UPSETS */}
              {view === "upsets" && (
                <>
                  <thead style={{ background: "hsl(220 12% 9%)" }}>
                    <tr>
                      {["Cavallo", "Data", "Track", "Partenza", "Partenti", "Tempo", "Premio €"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 12px",
                          fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: "1px solid hsl(220 10% 16%)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.upsets.map((r, i) => (
                      <tr
                        key={i}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          borderBottom: "1px solid hsl(220 10% 12%)",
                          background: hoveredRow === i ? "hsl(25 60% 50% / 0.08)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ fontSize: "15px" }}>{getFlag(r.country, r.horse_name)}</span>
                              {r.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td style={{ ...rowStyle(i) }}>{fmtDate(r.race_date)}</td>
                        <td style={{ ...rowStyle(i) }}>{r.track || "—"}</td>
                        <td className="tabular" style={{
                          padding: "8px 12px", fontSize: "14px", fontWeight: 800,
                          color: hoveredRow === i ? "hsl(25 80% 60%)" : "hsl(25 70% 55%)",
                        }}>
                          {r.start_pos}°
                        </td>
                        <td className="tabular" style={{ ...rowStyle(i) }}>{r.total_starters}</td>
                        <td className="tabular" style={{ ...rowStyle(i), color: "hsl(100 60% 50%)" }}>{fmtTime(r.time_km)}</td>
                        <td className="tabular" style={{ ...rowStyle(i), fontSize: "14px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                          €{fmt(r.prize_net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* DOMINANT HORSES */}
              {view === "dominant" && (
                <>
                  <thead style={{ background: "hsl(220 12% 9%)" }}>
                    <tr>
                      {["#", "Cavallo", "Gare", "Vittorie", "Win%", "Guadagni totali", "Premio max"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 12px",
                          fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: "1px solid hsl(220 10% 16%)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.dominantHorses.map((h, i) => (
                      <tr
                        key={i}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          borderBottom: "1px solid hsl(220 10% 12%)",
                          background: hoveredRow === i ? "hsl(51 70% 50% / 0.08)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <td className="tabular" style={{
                          padding: "8px 12px", fontSize: "15px", fontWeight: 800,
                          color: i < 3 ? ["hsl(51 80% 55%)", "hsl(210 8% 70%)", "hsl(25 60% 50%)"][i] : "hsl(210 8% 40%)",
                        }}>
                          {i < 3 ? ["1°", "2°", "3°"][i] : i + 1}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(h.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ fontSize: "15px" }}>{getFlag(h.country, h.horse_name)}</span>
                              {h.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td className="tabular" style={{ ...rowStyle(i) }}>{fmt(h.n_races)}</td>
                        <td className="tabular" style={{ ...rowStyle(i), color: "hsl(100 60% 50%)", fontWeight: 700 }}>{fmt(h.n_wins)}</td>
                        <td className="tabular" style={{
                          ...rowStyle(i),
                          color: hoveredRow === i && h.win_rate >= 15 ? "hsl(100 70% 60%)" : h.win_rate >= 15 ? "hsl(100 50% 55%)" : "hsl(210 8% 55%)",
                        }}>
                          {h.win_rate?.toFixed(1)}%
                        </td>
                        <td className="tabular" style={{ ...rowStyle(i), fontSize: "14px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                          €{fmt(h.total_earnings)}
                        </td>
                        <td className="tabular" style={{ ...rowStyle(i) }}>€{fmt(h.biggest_prize)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
