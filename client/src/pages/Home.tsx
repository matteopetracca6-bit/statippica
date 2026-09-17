import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import HorseSearchBar from "../components/HorseSearchBar";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { getFlag } from "@/lib/flags";
import {
  Users, Flag, TrendingUp, Search, ChevronRight, Trophy, Dna, GitCompare,
  BookOpen, Activity, Award, Network, Coins, Zap, Clock, MapPin
} from "lucide-react";

interface Stats {
  totalHorses: number;
  totalRaces: number;
  totalStallions: number;
  gradeDist: { grade: string; cnt: number }[];
  topByYear: { birth_year: number; name: string; grade: string; score: number; career_earnings: number; country?: string }[];
}

interface StallionRow {
  name: string;
  avg_score: number | null;
  final_score: number | null;
  grade: string | null;
  n_figli_totali: number | null;
  n_in_corsa: number | null;
  pct_top_S: number | null;
  nationality?: string;
  stud_fee_eur?: number | null;
}

interface TrendData {
  gradeByYear: { birth_year: number; grade: string; cnt: number }[];
  earningsByYear: { birth_year: number; avg_earn: number; total_earn: number; cnt: number }[];
  racesByYear: { race_year: number; n_races: number; avg_prize: number }[];
  topTracks: { track: string; n_races: number; avg_prize: number }[];
}

interface TopRaces {
  topPrize: { horse_name: string; country?: string; race_date: string; track: string; prize_net: number; placement: number }[];
  dominantHorses: { horse_name: string; country?: string; n_races: number; n_wins: number; win_rate: number; total_earnings: number }[];
}

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(51 100% 55%)", SS: "hsl(0 0% 78%)", S: "hsl(30 70% 60%)",
  A: "hsl(183 60% 55%)", B: "hsl(100 45% 50%)", C: "hsl(25 55% 52%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(40 3% 28%)"
};

function AnimatedNumber({ value, format = true }: { value: number; format?: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{format ? display.toLocaleString("it-IT") : display}</>;
}

function NavCard({ href, icon: Icon, title, desc, color }: { href: string; icon: any; title: string; desc: string; color: string }) {
  return (
    <Link href={href}>
      <a style={{
        display: "flex", flexDirection: "column", gap: "10px",
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "14px", padding: "18px 20px", textDecoration: "none",
        transition: "all 0.2s", cursor: "pointer",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "hsl(220 12% 13%)"; e.currentTarget.style.borderColor = color + "55"; e.currentTarget.style.transform = "translateY(-3px)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "hsl(220 12% 10%)"; e.currentTarget.style.borderColor = "hsl(220 10% 16%)"; e.currentTarget.style.transform = "none"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: 36, height: 36, borderRadius: "8px", background: color + "1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={18} style={{ color }} />
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "hsl(210 10% 90%)", letterSpacing: "0.02em" }}>{title}</span>
        </div>
        <span style={{ fontSize: "12px", color: "hsl(210 8% 48%)", lineHeight: 1.5 }}>{desc}</span>
      </a>
    </Link>
  );
}

export default function Home() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/stats"); return r.json(); },
  });

  const { data: stallions } = useQuery<StallionRow[]>({
    queryKey: ["/api/stallions"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/stallions"); return r.json(); },
    staleTime: 5 * 60 * 1000,
  });

  const { data: trends } = useQuery<TrendData>({
    queryKey: ["/api/trends"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/trends"); return r.json(); },
    staleTime: 5 * 60 * 1000,
  });

  const { data: topRaces } = useQuery<TopRaces>({
    queryKey: ["/api/top-races"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/top-races?limit=5"); return r.json(); },
    staleTime: 5 * 60 * 1000,
  });

  const totalPerf = stats?.gradeDist.reduce((s, g) => s + g.cnt, 0) ?? 1;
  const orderedGrades = GRADE_ORDER.map(g => ({ grade: g, cnt: stats?.gradeDist.find(d => d.grade === g)?.cnt ?? 0 }));

  // Top stallions by final_score (take top 6 with offspring data)
  const topStallions = useMemo(() => {
    if (!stallions) return [];
    return stallions
      .filter(s => s.final_score != null && s.n_figli_totali && s.n_figli_totali > 0)
      .slice(0, 6);
  }, [stallions]);

  // Recent years for earnings chart (last 10)
  const earningsChart = useMemo(() => {
    if (!trends?.earningsByYear) return [];
    return trends.earningsByYear
      .filter(e => e.birth_year >= 2014)
      .sort((a, b) => a.birth_year - b.birth_year)
      .slice(-10);
  }, [trends]);

  // Race counts by year
  const racesChart = useMemo(() => {
    if (!trends?.racesByYear) return [];
    return trends.racesByYear
      .filter(r => r.race_year >= 2015)
      .sort((a, b) => a.race_year - b.race_year)
      .slice(-8);
  }, [trends]);

  const maxEarning = earningsChart.length > 0 ? Math.max(...earningsChart.map(e => e.avg_earn)) : 1;
  const maxRaces = racesChart.length > 0 ? Math.max(...racesChart.map(r => r.n_races)) : 1;

  return (
    <div style={{ minHeight: "100%", paddingBottom: "40px" }}>

      {/* ─── HERO SECTION ─── */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(210 30% 12%) 50%, hsl(200 40% 8%) 100%)",
        borderBottom: "1px solid hsl(220 20% 16%)",
        padding: "48px 32px 40px",
      }}>
        {/* Decorative glow */}
        <div style={{
          position: "absolute", top: "-60px", right: "-40px",
          width: "300px", height: "300px", borderRadius: "50%",
          background: "radial-gradient(circle, hsl(183 80% 40% / 0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-80px", left: "20%",
          width: "400px", height: "200px",
          background: "radial-gradient(ellipse, hsl(51 80% 50% / 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto" }}>
          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "8px" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "12px",
              background: "linear-gradient(135deg, hsl(183 80% 45%), hsl(200 80% 35%))",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 20px hsl(183 80% 40% / 0.3)",
            }}>
              <TrendingUp size={26} style={{ color: "hsl(220 20% 98%)" }} />
            </div>
            <div>
              <h1 style={{ fontSize: "32px", fontWeight: 800, color: "hsl(210 20% 96%)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
                StatIppica
              </h1>
              <p style={{ fontSize: "13px", color: "hsl(210 10% 55%)", margin: "2px 0 0", letterSpacing: "0.04em" }}>
                Il trotto italiano analizzato con l'intelligenza artificiale
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginTop: "24px", maxWidth: "560px" }}>
            <HorseSearchBar placeholder="Cerca un cavallo per nome..." />
          </div>

          {/* Quick links */}
          <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {[
              { href: "/leaderboard", icon: Trophy, label: "Leaderboard", color: "hsl(51 80% 55%)" },
              { href: "/stallioni", icon: BookOpen, label: "Catalogo Stalloni", color: "hsl(183 80% 55%)" },
              { href: "/advisor", icon: Dna, label: "Advisor", color: "hsl(120 60% 50%)" },
              { href: "/compare", icon: GitCompare, label: "Comparazione", color: "hsl(30 80% 55%)" },
            ].map(({ href, icon: Icon, label, color }) => (
              <Link key={href} href={href}>
                <a style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 18%)",
                  borderRadius: "8px", padding: "8px 14px", textDecoration: "none",
                  fontSize: "12px", fontWeight: 600, color: "hsl(210 10% 70%)",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(220 12% 16%)"; e.currentTarget.style.color = color; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "hsl(220 12% 12%)"; e.currentTarget.style.color = "hsl(210 10% 70%)"; }}
                >
                  <Icon size={14} style={{ color }} />
                  {label}
                </a>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ─── KPI CARDS ─── */}
      <div style={{ padding: "24px 32px 0", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px" }}>
          {[
            { label: "Cavalli", value: stats?.totalHorses ?? 0, icon: Users, color: "hsl(183 100% 45%)" },
            { label: "Gare archiviate", value: stats?.totalRaces ?? 0, icon: Flag, color: "hsl(51 100% 55%)" },
            { label: "Stalloni analizzati", value: stats?.totalStallions ?? 0, icon: TrendingUp, color: "hsl(30 80% 55%)" },
            { label: "Cavalli votati", value: totalPerf, icon: Zap, color: "hsl(120 60% 50%)" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "14px", padding: "18px 20px",
              display: "flex", alignItems: "center", gap: "14px",
              transition: "border-color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = color + "40"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "hsl(220 10% 16%)"}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "10px", background: color + "1a",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Icon size={20} style={{ color }} />
              </div>
              <div>
                <div className="tabular" style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 92%)", lineHeight: 1.1 }}>
                  {isLoading ? "—" : <AnimatedNumber value={value} />}
                </div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 50%)", marginTop: "2px" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── MAIN GRID: Grade distribution + Top stallions ─── */}
      <div style={{ padding: "20px 32px 0", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* Grade distribution — proper bar chart */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "14px", padding: "22px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <Activity size={16} style={{ color: "hsl(183 60% 55%)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Distribuzione Rating
              </span>
            </div>
            {isLoading ? (
              <div className="skeleton" style={{ height: "180px", borderRadius: "8px" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {orderedGrades.filter(g => g.cnt > 0).map(({ grade, cnt }) => {
                  const pct = (cnt / totalPerf) * 100;
                  return (
                    <div key={grade} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "32px", flexShrink: 0 }}>
                        <GradeBadge grade={grade} size="sm" />
                      </div>
                      <div style={{ flex: 1, height: "22px", background: "hsl(220 12% 8%)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                        <div style={{
                          height: "100%", width: `${Math.max(pct, 1)}%`,
                          background: `linear-gradient(90deg, ${GRADE_COLORS[grade]}88, ${GRADE_COLORS[grade]})`,
                          borderRadius: "4px", transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                        }} />
                        <span className="tabular" style={{
                          position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                          fontSize: "11px", fontWeight: 600, color: "hsl(210 10% 70%)",
                        }}>
                          {cnt.toLocaleString("it-IT")} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top stallions */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "14px", padding: "22px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Trophy size={16} style={{ color: "hsl(51 80% 55%)" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Top Stalloni
                </span>
              </div>
              <Link href="/stallioni">
                <a style={{ fontSize: "11px", color: "hsl(183 80% 55%)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}>
                  Tutti <ChevronRight size={12} />
                </a>
              </Link>
            </div>
            {!stallions ? (
              <div className="skeleton" style={{ height: "180px", borderRadius: "8px" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {topStallions.map((s, i) => (
                  <Link key={s.name} href={`/stallion/${encodeURIComponent(s.name)}`}>
                    <a style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 12px", borderRadius: "8px", textDecoration: "none",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span className="tabular" style={{ fontSize: "12px", color: i < 3 ? "hsl(51 80% 55%)" : "hsl(210 8% 35%)", fontWeight: 700, minWidth: "20px" }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: "16px" }}>{getFlag(s.nationality, s.name)}</span>
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 85%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name}
                      </span>
                      {s.grade && <GradeBadge grade={s.grade} size="sm" />}
                      <span className="tabular" style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 60% 55%)", minWidth: "36px", textAlign: "right" }}>
                        {s.final_score?.toFixed(1)}
                      </span>
                      {s.stud_fee_eur != null && s.stud_fee_eur > 0 && (
                        <span className="tabular" style={{ fontSize: "11px", color: "hsl(51 70% 55%)", minWidth: "48px", textAlign: "right" }}>
                          €{(s.stud_fee_eur / 1000).toFixed(1)}k
                        </span>
                      )}
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── CHARTS ROW: Earnings over time + Races per year ─── */}
      <div style={{ padding: "16px 32px 0", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* Earnings by year chart */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "14px", padding: "22px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Coins size={16} style={{ color: "hsl(51 80% 55%)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Guadagni medi per generazione
              </span>
            </div>
            {!trends ? (
              <div className="skeleton" style={{ height: "140px", borderRadius: "8px" }} />
            ) : earningsChart.length === 0 ? (
              <div style={{ height: "140px", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(210 8% 40%)", fontSize: "13px" }}>Nessun dato</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "140px" }}>
                {earningsChart.map((e, i) => {
                  const h = (e.avg_earn / maxEarning) * 100;
                  return (
                    <div key={e.birth_year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                        <div
                          title={`${e.birth_year}: €${Math.round(e.avg_earn).toLocaleString("it-IT")} (${e.cnt} cavalli)`}
                          style={{
                            width: "100%", height: `${Math.max(h, 3)}%`,
                            background: `linear-gradient(180deg, hsl(51 80% 55%), hsl(40 70% 45%))`,
                            borderRadius: "4px 4px 0 0", transition: "height 0.8s cubic-bezier(0.16,1,0.3,1)",
                            cursor: "pointer", opacity: 0.85,
                          }}
                          onMouseEnter={ev => ev.currentTarget.style.opacity = "1"}
                          onMouseLeave={ev => ev.currentTarget.style.opacity = "0.85"}
                        />
                      </div>
                      <span className="tabular" style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>{e.birth_year}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Races per year chart */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "14px", padding: "22px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Flag size={16} style={{ color: "hsl(183 60% 55%)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Gare per anno
              </span>
            </div>
            {!trends ? (
              <div className="skeleton" style={{ height: "140px", borderRadius: "8px" }} />
            ) : racesChart.length === 0 ? (
              <div style={{ height: "140px", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(210 8% 40%)", fontSize: "13px" }}>Nessun dato</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "140px" }}>
                {racesChart.map((r, i) => {
                  const h = (r.n_races / maxRaces) * 100;
                  return (
                    <div key={r.race_year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                        <div
                          title={`${r.race_year}: ${r.n_races.toLocaleString("it-IT")} gare (premio medio €${Math.round(r.avg_prize).toLocaleString("it-IT")})`}
                          style={{
                            width: "100%", height: `${Math.max(h, 3)}%`,
                            background: `linear-gradient(180deg, hsl(183 70% 50%), hsl(200 60% 40%))`,
                            borderRadius: "4px 4px 0 0", transition: "height 0.8s cubic-bezier(0.16,1,0.3,1)",
                            cursor: "pointer", opacity: 0.85,
                          }}
                          onMouseEnter={ev => ev.currentTarget.style.opacity = "1"}
                          onMouseLeave={ev => ev.currentTarget.style.opacity = "0.85"}
                        />
                      </div>
                      <span className="tabular" style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>{r.race_year}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── CHAMPIONS + TOP EARNERS ─── */}
      <div style={{ padding: "16px 32px 0", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* Champion per generation */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "14px", padding: "22px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Crown size={16} style={{ color: "hsl(51 100% 55%)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Campione per generazione
              </span>
            </div>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: "32px", borderRadius: "6px" }} />)}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {stats?.topByYear.slice(0, 6).map((h, i) => (
                  <Link key={h.birth_year} href={`/horse/${encodeURIComponent(h.name)}/${h.birth_year}`}>
                    <a style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 12px", borderRadius: "8px", textDecoration: "none",
                      transition: "background 0.15s",
                      background: i === 0 ? "hsl(51 80% 50% / 0.06)" : "transparent",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                      onMouseLeave={e => e.currentTarget.style.background = i === 0 ? "hsl(51 80% 50% / 0.06)" : "transparent"}
                    >
                      <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 45%)", fontWeight: 700, minWidth: "36px" }}>{h.birth_year}</span>
                      {i === 0 && <span style={{ fontSize: "14px" }}>👑</span>}
                      <GradeBadge grade={h.grade} size="sm" />
                      <span style={{ fontSize: "16px" }}>{getFlag(h.country, h.name)}</span>
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: i === 0 ? "hsl(51 80% 65%)" : "hsl(210 10% 85%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.name}
                      </span>
                      <span className="tabular" style={{ fontSize: "12px", color: "hsl(51 70% 55%)", fontWeight: 600 }}>
                        €{h.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                      </span>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top earners */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "14px", padding: "22px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Coins size={16} style={{ color: "hsl(100 60% 50%)" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Top vincitori
                </span>
              </div>
              <Link href="/top">
                <a style={{ fontSize: "11px", color: "hsl(183 80% 55%)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}>
                  Tutte <ChevronRight size={12} />
                </a>
              </Link>
            </div>
            {!topRaces ? (
              <div className="skeleton" style={{ height: "160px", borderRadius: "8px" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {topRaces.dominantHorses?.slice(0, 6).map((h, i) => (
                  <Link key={h.horse_name} href={`/horse/${encodeURIComponent(h.horse_name)}/0`}>
                    <a style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 12px", borderRadius: "8px", textDecoration: "none",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span className="tabular" style={{ fontSize: "12px", color: i < 3 ? "hsl(51 80% 55%)" : "hsl(210 8% 35%)", fontWeight: 700, minWidth: "20px" }}>{i + 1}</span>
                      <span style={{ fontSize: "16px" }}>{getFlag(h.country, h.horse_name)}</span>
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 85%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.horse_name}
                      </span>
                      <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 48%)" }}>{h.n_races} gare</span>
                      <span className="tabular" style={{ fontSize: "11px", color: h.win_rate >= 30 ? "hsl(120 60% 50%)" : "hsl(210 8% 48%)", fontWeight: 600, minWidth: "36px", textAlign: "right" }}>
                        {h.win_rate.toFixed(0)}%
                      </span>
                      <span className="tabular" style={{ fontSize: "12px", color: "hsl(51 70% 55%)", fontWeight: 600, minWidth: "56px", textAlign: "right" }}>
                        €{(h.total_earnings / 1000).toFixed(0)}k
                      </span>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── NAVIGATION CARDS ─── */}
      <div style={{ padding: "20px 32px 0", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
          Esplora
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px" }}>
          <NavCard href="/leaderboard" icon={Trophy} title="Leaderboard" desc="Classifica completa dei cavalli per score, guadagni e anno di nascita" color="hsl(51 80% 55%)" />
          <NavCard href="/stallioni" icon={BookOpen} title="Catalogo Stalloni" desc="149 stalloni trottatori con tasse di monta, allevamenti e provenienza" color="hsl(183 80% 55%)" />
          <NavCard href="/advisor" icon={Dna} title="Advisor" desc="Simula accoppiamenti, calcola ROI e valuta il coefficiente di inbreeding" color="hsl(120 60% 50%)" />
          <NavCard href="/compare" icon={GitCompare} title="Comparazione" desc="Confronta due cavalli su statistiche, carriera e genealogia" color="hsl(30 80% 55%)" />
          <NavCard href="/allevamenti" icon={MapPin} title="Allevamenti" desc="Ranking degli allevamenti per qualita della produzione" color="hsl(200 70% 55%)" />
          <NavCard href="/trend" icon={Activity} title="Trend" desc="Andamenti temporali: distribuzione rating, guadagni e gare per anno" color="hsl(280 60% 60%)" />
          <NavCard href="/top" icon={Award} title="Top Gare" desc="Le gare piu ricche, i tempi piu veloci, le sorprese e i dominatori" color="hsl(0 60% 55%)" />
          <NavCard href="/pedigree" icon={Network} title="Pedigree" desc="Albero genealogico a 4 generazioni con coefficiente di inbreeding" color="hsl(160 60% 50%)" />
        </div>
      </div>

      {/* ─── TOP PRIZE RACES ─── */}
      <div style={{ padding: "20px 32px 0", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "14px", padding: "22px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Award size={16} style={{ color: "hsl(0 60% 55%)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Gare con montepremi piu alto
              </span>
            </div>
            <Link href="/top">
              <a style={{ fontSize: "11px", color: "hsl(183 80% 55%)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}>
                Vedi tutte <ChevronRight size={12} />
              </a>
            </Link>
          </div>
          {!topRaces ? (
            <div className="skeleton" style={{ height: "120px", borderRadius: "8px" }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {topRaces.topPrize?.slice(0, 5).map((r, i) => (
                <Link key={i} href={`/horse/${encodeURIComponent(r.horse_name)}/0`}>
                  <a style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 12px", borderRadius: "8px", textDecoration: "none",
                    transition: "background 0.15s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <span className="tabular" style={{ fontSize: "12px", color: i === 0 ? "hsl(0 60% 55%)" : "hsl(210 8% 35%)", fontWeight: 700, minWidth: "20px" }}>{i + 1}</span>
                    <span style={{ fontSize: "16px" }}>{getFlag(r.country, r.horse_name)}</span>
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 85%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.horse_name}
                    </span>
                    <span style={{ fontSize: "11px", color: "hsl(210 8% 45%)", display: "flex", alignItems: "center", gap: "3px" }}>
                      <MapPin size={11} /> {r.track || "—"}
                    </span>
                    <span style={{ fontSize: "11px", color: "hsl(210 8% 45%)", display: "flex", alignItems: "center", gap: "3px" }}>
                      <Clock size={11} /> {r.race_date || "—"}
                    </span>
                    <span className="tabular" style={{ fontSize: "14px", fontWeight: 700, color: "hsl(0 60% 55%)", minWidth: "70px", textAlign: "right" }}>
                      €{r.prize_net?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                    </span>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function Crown({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="M5 16L3 4l5.5 4L12 4l3.5 4L21 4l-2 12H5zm0 2v2h14v-2H5z" />
    </svg>
  );
}
