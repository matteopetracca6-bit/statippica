import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import HorseSearchBar from "../components/HorseSearchBar";
import GradeBadge from "../components/GradeBadge";
import { Trophy, TrendingUp, Users, Flag, Search, X, ChevronRight } from "lucide-react";

interface Stats {
  totalHorses: number;
  totalRaces: number;
  totalStallions: number;
  gradeDist: { grade: string; cnt: number }[];
  topByYear: { birth_year: number; name: string; grade: string; score: number; career_earnings: number }[];
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div style={{
      background: "hsl(220 12% 10%)",
      border: "1px solid hsl(220 10% 16%)",
      borderRadius: "12px",
      padding: "20px 22px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "10px",
        background: `${color}1a`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <div className="tabular" style={{ fontSize: "22px", fontWeight: 700, color: "hsl(210 10% 92%)", lineHeight: 1.2 }}>
          {typeof value === "number" ? value.toLocaleString("it-IT") : value}
        </div>
        <div style={{ fontSize: "12px", color: "hsl(210 8% 50%)", marginTop: "2px" }}>{label}</div>
      </div>
    </div>
  );
}

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(51 100% 55%)", SS: "hsl(0 0% 78%)", S: "hsl(30 70% 60%)",
  A: "hsl(183 60% 55%)", B: "hsl(100 45% 50%)", C: "hsl(25 55% 52%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(40 3% 28%)"
};


interface StallionRow {
  name: string;
  avg_score: number | null;
  final_score: number | null;
  grade: string | null;
  n_figli_totali: number | null;
  n_in_corsa: number | null;
  pct_top_S: number | null;
  birth_year?: number;
  country?: string;
}

function StallionCardSection({ stats, isLoading }: { stats: Stats | undefined; isLoading: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: stallions, isError: stallionsError } = useQuery<StallionRow[]>({
    queryKey: ["/api/stallions"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/stallions"); return r.json(); },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={{ marginBottom: "28px" }} ref={panelRef}>
      {/* Cards row */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: "84px", borderRadius: "12px" }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
          <StatCard label="Cavalli nel DB" value={stats?.totalHorses ?? 0} icon={Users} color="hsl(183 100% 45%)" />
          <StatCard label="Gare archiviate" value={stats?.totalRaces ?? 0} icon={Flag} color="hsl(51 100% 55%)" />

          {/* Stalloni — clickable */}
          <div
            data-testid="card-stallions"
            onClick={() => setOpen(o => !o)}
            style={{
              background: open ? "hsl(30 40% 12%)" : "hsl(220 12% 10%)",
              border: open ? "1px solid hsl(30 70% 35%)" : "1px solid hsl(220 10% 16%)",
              borderRadius: "12px",
              padding: "20px 22px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              cursor: "pointer",
              transition: "all 0.15s",
              userSelect: "none",
            }}
            onMouseEnter={e => { if (!open) { (e.currentTarget as HTMLDivElement).style.borderColor = "hsl(30 70% 30%)"; } }}
            onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLDivElement).style.borderColor = "hsl(220 10% 16%)"; } }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: "10px",
              background: "hsl(30 70% 55%)1a",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <TrendingUp size={22} style={{ color: "hsl(30 70% 55%)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="tabular" style={{ fontSize: "22px", fontWeight: 700, color: "hsl(210 10% 92%)", lineHeight: 1.2 }}>
                {(stats?.totalStallions ?? 0).toLocaleString("it-IT")}
              </div>
              <div style={{ fontSize: "12px", color: "hsl(210 8% 50%)", marginTop: "2px" }}>Stalloni analizzati</div>
            </div>
            <ChevronRight size={16} style={{
              color: "hsl(30 70% 55%)",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              flexShrink: 0,
            }} />
          </div>
        </div>
      )}

      {/* Stallion dropdown panel */}
      {open && (
        <div style={{
          marginTop: "8px",
          background: "hsl(220 14% 9%)",
          border: "1px solid hsl(30 40% 20%)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {/* Panel header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid hsl(220 10% 14%)",
          }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 80%)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Lista Stalloni
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(210 8% 40%)", padding: "2px", lineHeight: 1 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 56px 72px 64px 72px",
            padding: "8px 18px",
            borderBottom: "1px solid hsl(220 10% 12%)",
            fontSize: "10px", fontWeight: 700,
            color: "hsl(210 8% 38%)", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            <span>Stallone</span>
            <span style={{ textAlign: "center" }}>Voto</span>
            <span style={{ textAlign: "center" }}>Score</span>
            <span style={{ textAlign: "center" }}>Figli</span>
            <span style={{ textAlign: "center" }}>Top-S%</span>
          </div>

          {/* Scrollable list */}
          <div style={{ maxHeight: "340px", overflowY: "auto" }}>
            {stallionsError ? (
              <div style={{ padding: "24px", textAlign: "center", color: "hsl(15 70% 55%)", fontSize: "13px" }}>
                Errore caricamento — riprova tra qualche secondo.
              </div>
            ) : !stallions ? (
              <div style={{ padding: "24px", textAlign: "center", color: "hsl(210 8% 40%)", fontSize: "13px" }}>
                Caricamento...
              </div>
            ) : stallions.map((s, i) => (
              <Link key={s.name} href={`/stallion/${encodeURIComponent(s.name)}`}>
                <a
                  data-testid={`row-stallion-${i}`}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 56px 72px 64px 72px",
                    padding: "10px 18px",
                    textDecoration: "none",
                    borderBottom: "1px solid hsl(220 10% 11%)",
                    transition: "background 0.1s",
                    alignItems: "center",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "hsl(220 10% 13%)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{
                    fontSize: "13px", fontWeight: 600,
                    color: "hsl(183 80% 62%)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.name}
                  </span>
                  <span style={{ textAlign: "center" }}>
                    {s.grade ? <GradeBadge grade={s.grade} size="sm" /> : <span style={{ color: "hsl(210 8% 40%)", fontSize: "12px" }}>—</span>}
                  </span>
                  <span className="tabular" style={{ textAlign: "center", fontSize: "13px", color: "hsl(210 10% 72%)" }}>
                    {(s.final_score ?? s.avg_score) != null ? (s.final_score ?? s.avg_score)!.toFixed(1) : "—"}
                  </span>
                  <span className="tabular" style={{ textAlign: "center", fontSize: "13px", color: "hsl(210 8% 55%)" }}>
                    {s.n_figli_totali ?? s.n_in_corsa ?? "—"}
                  </span>
                  <span className="tabular" style={{
                    textAlign: "center", fontSize: "13px",
                    color: s.pct_top_S && s.pct_top_S >= 20 ? "hsl(183 80% 55%)" : "hsl(210 8% 55%)",
                  }}>
                    {s.pct_top_S != null ? `${s.pct_top_S.toFixed(1)}%` : "—"}
                  </span>
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { data: stats, isLoading, isError, failureCount } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/stats"); return r.json(); },
  });

  const isWakingUp = isLoading && failureCount > 0;

  const totalPerf = stats?.gradeDist.reduce((s, g) => s + g.cnt, 0) ?? 1;
  const orderedGrades = GRADE_ORDER.map(g => ({
    grade: g,
    cnt: stats?.gradeDist.find(d => d.grade === g)?.cnt ?? 0,
  }));

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1100px" }}>
      {/* Wakeup banner */}
      {isWakingUp && (
        <div style={{
          background: "hsl(40 60% 20%)",
          border: "1px solid hsl(40 60% 35%)",
          borderRadius: "10px",
          padding: "12px 18px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          color: "hsl(40 80% 80%)",
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: "50%",
            border: "2px solid hsl(40 80% 70%)",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          Server in avvio — riprovo automaticamente, attendi qualche secondo...
        </div>
      )}
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Analisi rating e statistiche trotto italiano 2012–2026
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "28px", maxWidth: "520px" }}>
        <HorseSearchBar placeholder="Cerca un cavallo per nome..." />
        <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link href="/leaderboard">
            <a style={{ fontSize: "12px", color: "hsl(183 80% 55%)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
              <Trophy size={13} /> Leaderboard globale
            </a>
          </Link>
          <span style={{ color: "hsl(220 10% 25%)" }}>·</span>
          <Link href="/advisor">
            <a style={{ fontSize: "12px", color: "hsl(183 80% 55%)", textDecoration: "none" }}>
              Advisor allevatore
            </a>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <StallionCardSection stats={stats} isLoading={isLoading} />

      {/* Grade distribution bar */}
      <div style={{
        background: "hsl(220 12% 10%)",
        border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px",
        padding: "20px 22px",
        marginBottom: "24px",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Distribuzione rating (cavalli in gara)
        </div>
        {isLoading ? (
          <div className="skeleton" style={{ height: "40px", borderRadius: "6px" }} />
        ) : (
          <>
            <div style={{ display: "flex", height: "28px", borderRadius: "6px", overflow: "hidden", gap: "2px" }}>
              {orderedGrades.filter(g => g.cnt > 0).map(({ grade, cnt }) => (
                <div
                  key={grade}
                  title={`${grade}: ${cnt} cavalli (${((cnt / totalPerf) * 100).toFixed(1)}%)`}
                  style={{
                    flex: cnt,
                    background: GRADE_COLORS[grade] + "55",
                    borderTop: `3px solid ${GRADE_COLORS[grade]}`,
                    position: "relative",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
              {orderedGrades.filter(g => g.cnt > 0).map(({ grade, cnt }) => (
                <div key={grade} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px" }}>
                  <GradeBadge grade={grade} size="sm" />
                  <span className="tabular" style={{ color: "hsl(210 8% 55%)" }}>{cnt.toLocaleString("it-IT")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Top cavallo per anno */}
      <div style={{
        background: "hsl(220 12% 10%)",
        border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px",
        padding: "20px 22px",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Campione per generazione
        </div>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: "36px", borderRadius: "6px" }} />)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {stats?.topByYear.map(h => (
              <Link key={h.birth_year} href={`/leaderboard?year=${h.birth_year}`}>
                <a style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 45%)", minWidth: "34px" }}>{h.birth_year}</span>
                  <GradeBadge grade={h.grade} size="sm" />
                  <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 85%)", letterSpacing: "0.02em" }}>{h.name}</span>
                  <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 50%)" }}>
                    €{h.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                  </span>
                </a>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
