import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getFlag } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import { ChevronLeft, ChevronRight, SortAsc } from "lucide-react";

interface LeaderboardRow {
  name: string;
  birth_year: number;
  sire: string;
  grade: string;
  score: number;
  earn_percentile: number;
  time_percentile: number;
  sire_percentile: number;
  career_races: number;
  career_wins: number;
  career_earnings: number;
  record_career: string;
  win_rate: number;
}

interface LeaderboardData {
  total: number;
  page: number;
  limit: number;
  rows: LeaderboardRow[];
}

const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

export default function LeaderboardPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] ?? "");
  
  const [year, setYear] = useState<string>(urlParams.get("year") ?? "");
  const [grade, setGrade] = useState<string>("");
  const [sireFilter, setSireFilter] = useState<string>("");
  const [mode, setMode] = useState<string>("performance");
  const [sort, setSort] = useState<string>("score");
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/leaderboard/years"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/leaderboard/years"); return r.json(); },
  });

  useEffect(() => { setPage(1); }, [year, grade, sireFilter, mode, sort]);

  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (grade) params.set("grade", grade);
  if (sireFilter) params.set("sire", sireFilter);
  params.set("mode", mode);
  params.set("sort", sort);
  params.set("page", String(page));
  params.set("limit", String(LIMIT));

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard", year, grade, sireFilter, mode, sort, page],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/leaderboard?${params}`);
      return r.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const filterStyle = {
    background: "hsl(220 12% 12%)",
    border: "1px solid hsl(220 10% 20%)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "hsl(210 10% 80%)",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
  } as React.CSSProperties;

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>Leaderboard</h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 48%)" }}>
          {data?.total != null ? `${data.total.toLocaleString("it-IT")} cavalli` : "—"} · {mode === "performance" ? "in gara" : "solo pedigree"}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", alignItems: "center" }}>
        {/* Mode */}
        <div style={{ display: "flex", background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)", borderRadius: "8px", overflow: "hidden" }}>
          {[{ v: "performance", l: "In gara" }, { v: "pedigree", l: "Pedigree" }].map(({ v, l }) => (
            <button key={v} onClick={() => setMode(v)} style={{
              padding: "8px 14px", fontSize: "13px", background: mode === v ? "hsl(183 100% 38% / 0.2)" : "none",
              color: mode === v ? "hsl(183 80% 65%)" : "hsl(210 8% 55%)",
              border: "none", cursor: "pointer", fontWeight: mode === v ? 600 : 400, transition: "all 0.15s",
            }}>{l}</button>
          ))}
        </div>

        {/* Year */}
        <select value={year} onChange={e => setYear(e.target.value)} style={filterStyle} data-testid="select-year">
          <option value="">Tutti gli anni</option>
          {years?.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Grade */}
        <select value={grade} onChange={e => setGrade(e.target.value)} style={filterStyle} data-testid="select-grade">
          <option value="">Tutti i voti</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)} style={filterStyle} data-testid="select-sort">
          <option value="score">Ordina: Score</option>
          <option value="earnings">Ordina: Guadagni</option>
        </select>

        {/* Sire filter */}
        <input
          value={sireFilter}
          onChange={e => setSireFilter(e.target.value.toUpperCase())}
          placeholder="Filtra per stallone..."
          data-testid="input-sire-filter"
          style={{ ...filterStyle, minWidth: "180px" }}
        />

        {(year || grade || sireFilter) && (
          <button onClick={() => { setYear(""); setGrade(""); setSireFilter(""); }} style={{
            fontSize: "12px", color: "hsl(0 62% 55%)", background: "none", border: "none", cursor: "pointer",
          }}>
            Reset filtri
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", overflow: "hidden",
      }}>
        {isLoading ? (
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: "40px", borderRadius: "6px" }} />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "hsl(220 12% 9%)", zIndex: 2 }}>
                <tr>
                  {["#", "Cavallo", "Anno", "Stallone", "Voto", "Score", "Guadagni", "Record", "Win%"].map(h => (
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
                {data?.rows.map((row, i) => {
                  const rank = (page - 1) * LIMIT + i + 1;
                  return (
                    <tr
                      key={`${row.name}-${row.birth_year}`}
                      data-testid={`row-horse-${rank}`}
                      style={{ borderBottom: "1px solid hsl(220 10% 13%)", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 38%)", minWidth: "36px" }}>
                        {rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : rank}
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "160px" }}>
                        <Link href={`/horse/${encodeURIComponent(row.name)}/${row.birth_year}`}>
                          <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 85%)", textDecoration: "none", letterSpacing: "0.03em" }}>
                            {row.name}
                          </a>
                        </Link>
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 48%)" }}>{row.birth_year}</td>
                      <td style={{ padding: "10px 12px", minWidth: "120px" }}>
                        {row.sire ? (
                          <Link href={`/stallion/${encodeURIComponent(row.sire)}`}>
                            <a style={{ fontSize: "12px", color: "hsl(183 70% 55%)", textDecoration: "none" }}>{row.sire}</a>
                          </Link>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}><GradeBadge grade={row.grade ?? "N/A"} size="sm" /></td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 58%)" }}>{row.score?.toFixed(1) ?? "—"}</td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(51 80% 58%)", minWidth: "90px" }}>
                        {row.career_earnings != null ? `€${row.career_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(183 60% 55%)" }}>
                        {row.record_career ? `1.${row.record_career}` : "—"}
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 48%)" }}>
                        {row.win_rate != null ? `${row.win_rate.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", borderTop: "1px solid hsl(220 10% 16%)",
          }}>
            <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 48%)" }}>
              Pagina {page} / {totalPages} · {data?.total.toLocaleString("it-IT")} totali
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "6px 12px", borderRadius: "7px", fontSize: "12px",
                  background: page === 1 ? "none" : "hsl(220 10% 16%)",
                  border: "1px solid hsl(220 10% 20%)",
                  color: page === 1 ? "hsl(210 8% 35%)" : "hsl(210 8% 65%)",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }}
              >
                <ChevronLeft size={14} /> Prec
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "6px 12px", borderRadius: "7px", fontSize: "12px",
                  background: page === totalPages ? "none" : "hsl(220 10% 16%)",
                  border: "1px solid hsl(220 10% 20%)",
                  color: page === totalPages ? "hsl(210 8% 35%)" : "hsl(210 8% 65%)",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                }}
              >
                Succ <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
