import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
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

  const views: { key: View; label: string }[] = [
    { key: "topPrize", label: "Montepremi top" },
    { key: "fastest", label: "Tempi record" },
    { key: "upsets", label: "Sorprese" },
    { key: "dominant", label: "Dominatori" },
  ];

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Top Performance
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Le migliori gare, i tempi record, le sorprese e i dominatori del trotto italiano.
        </p>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        {views.map(({ key, label }) => (
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
        <TrottingHorseLoader label="Caricamento top performance..." />
      ) : !data ? (
        <div style={{ color: "hsl(210 8% 45%)", padding: "40px" }}>Nessun dato.</div>
      ) : (
        <>
          {/* Top prize races */}
          {view === "topPrize" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", overflow: "hidden",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "hsl(220 12% 9%)" }}>
                    <tr>
                      {["Cavallo", "Data", "Track", "Posto", "Tempo", "Dist", "Driver", "Premio €"].map(h => (
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
                      <tr key={i} style={{ borderBottom: "1px solid hsl(220 10% 12%)", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none" }}>
                              {r.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{fmtDate(r.race_date)}</td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.track || "—"}</td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: r.placement === 1 ? "hsl(100 60% 50%)" : "hsl(210 8% 55%)", fontWeight: r.placement === 1 ? 700 : 400 }}>
                          {r.placement_raw || r.placement}
                        </td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{fmtTime(r.time_km)}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.distance || "—"}</td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.driver || "—"}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                          €{fmt(r.prize_net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fastest times */}
          {view === "fastest" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", overflow: "hidden",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                      <tr key={i} style={{ borderBottom: "1px solid hsl(220 10% 12%)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 700, color: i < 3 ? "hsl(51 80% 55%)" : "hsl(210 8% 40%)" }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none" }}>
                              {r.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{fmtDate(r.race_date)}</td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.track || "—"}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "14px", fontWeight: 700, color: "hsl(100 60% 50%)" }}>
                          {fmtTime(r.time_km)}
                        </td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.distance}m</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(51 70% 55%)" }}>€{fmt(r.prize_net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upsets */}
          {view === "upsets" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", overflow: "hidden",
            }}>
              <div style={{ padding: "14px 18px", fontSize: "12px", color: "hsl(210 8% 48%)" }}>
                Vittorie dalla partenza piu' arretrata (posti maggiori o uguali a 10 con almeno 12 partenti)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                      <tr key={i} style={{ borderBottom: "1px solid hsl(220 10% 12%)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none" }}>
                              {r.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{fmtDate(r.race_date)}</td>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.track || "—"}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 700, color: "hsl(25 70% 55%)" }}>
                          {r.start_pos}°
                        </td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{r.total_starters}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(100 60% 50%)" }}>{fmtTime(r.time_km)}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                          €{fmt(r.prize_net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dominant horses */}
          {view === "dominant" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", overflow: "hidden",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                      <tr key={i} style={{ borderBottom: "1px solid hsl(220 10% 12%)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 700, color: i < 3 ? "hsl(51 80% 55%)" : "hsl(210 8% 40%)" }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Link href={`/horse/${encodeURIComponent(h.horse_name)}/0`}>
                            <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 80% 58%)", textDecoration: "none" }}>
                              {h.horse_name}
                            </a>
                          </Link>
                        </td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{fmt(h.n_races)}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(100 60% 50%)", fontWeight: 700 }}>{fmt(h.n_wins)}</td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: h.win_rate >= 15 ? "hsl(100 50% 55%)" : "hsl(210 8% 55%)" }}>
                          {h.win_rate?.toFixed(1)}%
                        </td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                          €{fmt(h.total_earnings)}
                        </td>
                        <td className="tabular" style={{ padding: "8px 12px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                          €{fmt(h.biggest_prize)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
