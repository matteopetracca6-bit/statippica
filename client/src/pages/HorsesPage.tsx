import { useState, useEffect } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { getFlag } from "@/lib/flags";
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";

interface HorseRow {
  name: string;
  birth_year: number;
  sire: string;
  grade: string;
  score: number;
  career_races: number;
  career_wins: number;
  career_earnings: number;
  win_rate: number;
  record_career: string | null;
  country: string | null;
  sex: string | null;
  dam: string | null;
}

interface HorsesResponse {
  total: number;
  page: number;
  limit: number;
  rows: HorseRow[];
  years: number[];
  countries: string[];
}

const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

export default function HorsesPage() {
  const [data, setData] = useState<HorsesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [grade, setGrade] = useState("all");
  const [country, setCountry] = useState("all");
  const [sex, setSex] = useState("all");
  const [sortBy, setSortBy] = useState("score");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const debounce = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: "30",
        sort: sortBy,
        ...(search && { search }),
        ...(year !== "all" && { year }),
        ...(grade !== "all" && { grade }),
        ...(country !== "all" && { country }),
        ...(sex !== "all" && { sex }),
      });
      apiRequest("GET", `/api/horses?${params}`)
        .then(r => r.json())
        .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [page, search, year, grade, country, sex, sortBy]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  const resetPage = (fn: () => void) => { setPage(1); fn(); };

  return (
    <div className="page-shell">
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <Users size={24} style={{ color: "hsl(183 80% 55%)" }} />
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "hsl(210 10% 90%)", margin: 0 }}>
          Database Cavalli
        </h1>
        {data && (
          <span className="tabular" style={{ fontSize: "13px", color: "hsl(210 8% 50%)", marginLeft: "8px" }}>
            {data.total.toLocaleString("it-IT")} cavalli
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
        gap: "10px", marginBottom: "20px",
      }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "hsl(210 8% 40%)" }} />
          <input
            type="text"
            placeholder="Cerca cavallo..."
            value={search}
            onChange={e => resetPage(() => setSearch(e.target.value))}
            style={{
              width: "100%", padding: "10px 12px 10px 34px",
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "8px", color: "hsl(210 10% 90%)", fontSize: "13px",
              outline: "none",
            }}
          />
        </div>
        {/* Year */}
        <select value={year} onChange={e => resetPage(() => setYear(e.target.value))}
          style={filterStyle}>
          <option value="all">Anno</option>
          {data?.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {/* Grade */}
        <select value={grade} onChange={e => resetPage(() => setGrade(e.target.value))}
          style={filterStyle}>
          <option value="all">Grade</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {/* Country */}
        <select value={country} onChange={e => resetPage(() => setCountry(e.target.value))}
          style={filterStyle}>
          <option value="all">Paese</option>
          {data?.countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Sex */}
        <select value={sex} onChange={e => resetPage(() => setSex(e.target.value))}
          style={filterStyle}>
          <option value="all">Sesso</option>
          <option value="M">Maschio</option>
          <option value="F">Femmina</option>
        </select>
        {/* Sort */}
        <select value={sortBy} onChange={e => resetPage(() => setSortBy(e.target.value))}
          style={filterStyle}>
          <option value="score">Score</option>
          <option value="earnings">Guadagni</option>
          <option value="wins">Vittorie</option>
          <option value="races">Gare</option>
          <option value="name">Nome</option>
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "14px", overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid hsl(220 10% 16%)" }}>
              <th style={thStyle}>Cavallo</th>
              <th style={thStyle}>Anno</th>
              <th style={thStyle}>Paese</th>
              <th style={thStyle}>Grade</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Score</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Gare</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Vit</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Win%</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Guadagni</th>
              <th style={thStyle}>Padre</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={tdCenterStyle}>
                <div className="skeleton" style={{ height: "20px", borderRadius: "6px", margin: "12px 0" }} />
              </td></tr>
            ) : !data || data.rows.length === 0 ? (
              <tr><td colSpan={10} style={tdCenterStyle}>
                <span style={{ color: "hsl(210 8% 45%)", fontSize: "13px" }}>Nessun cavallo trovato</span>
              </td></tr>
            ) : data.rows.map((h, i) => (
              <tr key={`${h.name}-${h.birth_year}`}
                style={{
                  borderBottom: i < data.rows.length - 1 ? "1px solid hsl(220 10% 14%)" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={tdStyle}>
                  <Link href={`/horse/${encodeURIComponent(h.name)}/${h.birth_year}`}>
                    <a style={{ color: "hsl(183 80% 60%)", textDecoration: "none", fontWeight: 600, fontSize: "13px" }}>
                      {getFlag(h.country, h.name)} {h.name}
                    </a>
                  </Link>
                </td>
                <td style={{ ...tdStyle, className: "tabular" } as any}>
                  <span className="tabular">{h.birth_year}</span>
                </td>
                <td style={tdStyle}>{h.country || "—"}</td>
                <td style={tdStyle}>{h.grade ? <GradeBadge grade={h.grade} size="sm" /> : "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span className="tabular" style={{ fontWeight: 700, color: "hsl(183 60% 55%)" }}>{h.score?.toFixed(1)}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span className="tabular">{h.career_races ?? "—"}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span className="tabular">{h.career_wins ?? "—"}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span className="tabular" style={{ color: h.win_rate >= 20 ? "hsl(120 60% 50%)" : "hsl(210 8% 55%)" }}>
                    {h.win_rate != null ? `${h.win_rate.toFixed(1)}%` : "—"}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span className="tabular" style={{ color: "hsl(51 70% 55%)" }}>
                    €{h.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: "12px", color: "hsl(210 8% 55%)" }}>{h.sire || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "20px" }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={pageBtnStyle(page === 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tabular" style={{ fontSize: "13px", color: "hsl(210 8% 60%)" }}>
            Pagina {page} di {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={pageBtnStyle(page >= totalPages)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "hsl(220 12% 10%)",
  border: "1px solid hsl(220 10% 16%)",
  borderRadius: "8px",
  color: "hsl(210 10% 85%)",
  fontSize: "13px",
  outline: "none",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: "11px",
  fontWeight: 600,
  color: "hsl(210 8% 50%)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "13px",
  color: "hsl(210 10% 80%)",
};

const tdCenterStyle: React.CSSProperties = {
  padding: "16px",
  textAlign: "center",
};

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: "8px",
    background: disabled ? "hsl(220 12% 8%)" : "hsl(220 12% 12%)",
    border: "1px solid hsl(220 10% 16%)",
    color: disabled ? "hsl(210 8% 30%)" : "hsl(183 80% 55%)",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
