import { COLORE_SCHEDA_VOTO } from "@/lib/coloreVoto";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import HorseSearchBar from "../components/HorseSearchBar";
import Wordmark from "../components/Wordmark";
import GradeBadge from "../components/GradeBadge";
import CavalliDelMomento from "../components/CavalliDelMomento";
import RiquadroRating from "../components/RiquadroRating";
import CavalloCaricamento from "../components/CavalloCaricamento";
import EsploraCategorie, { trasparente } from "../components/EsploraCategorie";
import BandieraCavallo from "@/components/BandieraCavallo";
import {
  Users, Flag, TrendingUp, ChevronRight, Trophy, Dna, GitCompare,
  BookOpen, Activity, Award, Network, Coins, Zap, Clock, MapPin, Calendar, Heart, Sparkles, Warehouse, FlaskConical, BookMarked, Scale, Briefcase, Tag } from "lucide-react";

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
// Colori ufficiali dei voti (SSS oro, SS argento, S bronzo...), uguali in tutto il sito.
const GRADE_COLORS: Record<string, string> = COLORE_SCHEDA_VOTO;

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


  const totalPerf = stats?.gradeDist.reduce((s, g) => s + g.cnt, 0) ?? 1;
  const orderedGrades = GRADE_ORDER.map(g => ({ grade: g, cnt: stats?.gradeDist.find(d => d.grade === g)?.cnt ?? 0 }));

  // Top stallions by final_score (i primi 10 con figli in archivio)
  const topStallions = stallions
    ? stallions.filter(s => s.final_score != null && s.n_figli_totali && s.n_figli_totali > 0).slice(0, 10)
    : [];

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

        <div style={{ position: "relative", maxWidth: "1680px", margin: "0 auto" }}>
          {/* Title */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", maxWidth: "100%" }}>
              <h1 style={{ margin: 0, lineHeight: 1, maxWidth: "100%", minWidth: 0 }}>
                <Wordmark size={54} withLogo logoSize={96} grande />
              </h1>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginTop: "24px", maxWidth: "560px" }}>
            <HorseSearchBar placeholder="Cerca un cavallo per nome..." />
          </div>

          <EsploraCategorie />
        </div>
      </div>

      {/* ─── NUMERI DELL'ARCHIVIO ───
          Stesso aspetto delle cinque categorie qui sopra: riga di colore a
          sinistra, velatura nell'angolo, e al passaggio si sollevano. Ognuno
          apre la pagina dove quei numeri si vedono per esteso. */}
      <div className="page-shell">
        <div className="numeri-home">
          {[
            { label: "Cavalli", nota: "in attività e ritirati", value: stats?.totalHorses ?? 0, icon: Users, color: "hsl(51 80% 55%)", href: "/leaderboard" },
            { label: "Gare archiviate", nota: "un arrivo per ogni cavallo", value: stats?.totalRaces ?? 0, icon: Flag, color: "hsl(0 60% 55%)", href: "/ippodromi" },
            { label: "Stalloni analizzati", nota: "giudicati sui figli", value: stats?.totalStallions ?? 0, icon: TrendingUp, color: "hsl(120 60% 50%)", href: "/stalloni" },
            { label: "Cavalli votati", nota: "con un voto da SSS a F", value: totalPerf, icon: Zap, color: "hsl(183 70% 52%)", href: "/metodo" },
          ].map(({ label, nota, value, icon: Icon, color, href }) => (
            <Link key={label} href={href}>
              <a className="pannello pannello-cliccabile numero-home" style={{ ["--colore-pannello" as any]: color }}
                 data-testid={`numero-${label.toLowerCase().replace(/ /g, "-")}`}>
                <span className="numero-home-icona" style={{ background: trasparente(color, 0.12) }}>
                  <Icon size={22} style={{ color }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="tabular numero-home-valore">
                    {isLoading ? "—" : <AnimatedNumber value={value} />}
                  </span>
                  <span className="numero-home-nome">{label}</span>
                  <span className="numero-home-nota">{nota}</span>
                </span>
                <ChevronRight size={16} className="numero-home-freccia" style={{ color }} />
              </a>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── RATING: riquadro largo, si apre al clic ─── */}
      <div className="page-shell">
        <RiquadroRating />
      </div>

      {/* ─── CAVALLI DEL MOMENTO ─── */}
      <div className="page-shell">
        <CavalliDelMomento />
      </div>

      {/* ─── TOP STALLONI + CAMPIONE PER GENERAZIONE ─── */}
      <div className="page-shell">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(460px, 100%), 1fr))", gap: "16px" }}>

          {/* Top stallions */}
          <div className="pannello" style={{ ["--colore-pannello" as any]: "hsl(120 60% 50%)", padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Trophy size={16} style={{ color: "hsl(51 80% 55%)" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Top Stalloni
                </span>
              </div>
              <Link href="/stalloni">
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
                      <BandieraCavallo nome={s.name} paese={s.nationality} ignoto_se_vuoto />
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

          {/* Champion per generation */}
          <div className="pannello" style={{ ["--colore-pannello" as any]: "hsl(51 80% 55%)", padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Crown size={16} style={{ color: "hsl(51 100% 55%)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Campione per generazione
              </span>
              <span style={{ fontSize: "11px", color: "hsl(210 8% 45%)" }}>solo nati in Italia</span>
            </div>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[1,2,3,4,5,6,7,8,9,10].map(i => <div key={i} className="skeleton" style={{ height: "32px", borderRadius: "6px" }} />)}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {stats?.topByYear.slice(0, 10).map((h, i) => (
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
                      <BandieraCavallo nome={h.name} paese={h.country} />
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
