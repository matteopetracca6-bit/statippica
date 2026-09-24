import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import HorseSearchBar from "../components/HorseSearchBar";
import Wordmark from "../components/Wordmark";
import logoHorse from "@assets/statippica-logo.png";
import GradeBadge from "../components/GradeBadge";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { getFlag } from "@/lib/flags";
import {
  Users, Flag, TrendingUp, ChevronRight, Trophy, Dna, GitCompare,
  BookOpen, Activity, Award, Network, Coins, Zap, Clock, MapPin, Calendar, Heart, Sparkles, Warehouse, FlaskConical, BookMarked } from "lucide-react";

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

// I colori dei riquadri sono scritti come hsl(...): la trasparenza va messa
// dentro la parentesi. Accodare "55" come si fa con i colori esadecimali
// produce un colore non valido, e il bordo al passaggio non compariva.
function trasparente(colore: string, alfa: number) {
  return colore.startsWith("hsl(") ? colore.replace(/\)$/, ` / ${alfa})`) : colore;
}

function NavCard({ href, icon: Icon, title, desc, color }: { href: string; icon: any; title: string; desc: string; color: string }) {
  // Al passaggio del cursore (o quando ci si arriva col tasto Tab) il
  // riquadro prende un contorno del suo colore, con un alone leggero.
  const vars = {
    "--colore-riquadro": color,
    "--colore-riquadro-alone": trasparente(color, 0.22),
    "--colore-riquadro-icona": trasparente(color, 0.12),
  } as React.CSSProperties;
  return (
    <Link href={href}>
      <a className="riquadro-home" style={vars}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="riquadro-home-icona">
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
  const topStallions = stallions
    ? stallions.filter(s => s.final_score != null && s.n_figli_totali && s.n_figli_totali > 0).slice(0, 6)
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
                <Wordmark size={56} weight={700} withLogo logoSrc={logoHorse} logoSize={72} />
              </h1>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginTop: "24px", maxWidth: "560px" }}>
            <HorseSearchBar placeholder="Cerca un cavallo per nome..." />
          </div>

          {/* Esplora — navigation cards */}
          <div style={{ marginTop: "28px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
              Esplora
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px" }}>
              {/* Leaderboard e Cavalli erano la stessa tabella con filtri
                  diversi: una scheda sola, con tutti i filtri. */}
              <NavCard href="/leaderboard" icon={Trophy} title="Cavalli e classifica" desc="Tutti i cavalli valutati: cerca per nome o ordina per voto, guadagni e vittorie. Il voto si legge contro tutti o dentro la sua annata" color="hsl(51 80% 55%)" />
              <NavCard href="/stallioni" icon={BookOpen} title="Catalogo Stalloni" desc="Tutti gli stalloni valutati, con tasse di monta, allevamenti e provenienza" color="hsl(120 60% 50%)" />
              <NavCard href="/advisor" icon={Dna} title="Advisor" desc="Simula accoppiamenti, calcola ROI e valuta il coefficiente di inbreeding" color="hsl(280 60% 60%)" />
              <NavCard href="/compare" icon={GitCompare} title="Comparazione" desc="Confronta due cavalli su statistiche, carriera e genealogia" color="hsl(30 80% 55%)" />
              <NavCard href="/calendario" icon={Calendar} title="Calendario" desc="Prossime gare in programma con iscritti, voti e stima probabilita di vittoria" color="hsl(0 60% 55%)" />
              <NavCard href="/trend" icon={Activity} title="Trend" desc="Andamenti temporali: distribuzione rating, guadagni e gare per anno" color="hsl(160 60% 50%)" />
              <NavCard href="/pedigree" icon={Network} title="Pedigree" desc="Albero genealogico completo fino a 5 generazioni, con consanguineita e incroci ripetuti" color="hsl(220 60% 60%)" />
              <NavCard href="/qualifiche" icon={Sparkles} title="Qualifiche" desc="Il primo tempo ufficiale dei cavalli giovani, prima che debuttino in corsa" color="hsl(280 60% 62%)" />
              <NavCard href="/allevamento" icon={Warehouse} title="Allevamento" desc="Allevatori e stazioni di monta in un'unica scheda, con la qualita media della produzione" color="hsl(20 70% 58%)" />
              <NavCard href="/validazione" icon={FlaskConical} title="Verifica Advisor" desc="La prova che il consiglio di accoppiamento funziona: test su puledri mai visti e fonti scientifiche" color="hsl(183 70% 52%)" />
              <NavCard href="/fattrici" icon={Heart} title="Fattrici" desc="Fattrici valutate sulla progenie: figli di vertice, guadagni medi e carriera della madre" color="hsl(330 70% 58%)" />
              <NavCard href="/guidatori" icon={Users} title="Guidatori" desc="Chi porta i cavalli a rendere piu' del loro solito, a parita' di cavallo e di numero di partenza" color="hsl(200 70% 58%)" />
              <NavCard href="/ippodromi" icon={MapPin} title="Ippodromi" desc="Le 26 piste italiane e quanto pesa partire dentro o fuori su ciascuna" color="hsl(95 55% 52%)" />
              <NavCard href="/metodo" icon={BookMarked} title="Metodo e dati" desc="Da dove vengono i numeri, come si calcola ogni voto, cosa non se ne puo' concludere e quando si e' aggiornato l'archivio" color="hsl(40 40% 72%)" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI CARDS ─── */}
      <div className="page-shell">
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
      <div className="page-shell">
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
                          background: GRADE_COLORS[grade],
                          borderRadius: "4px", transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                        }} />
                        <span className="tabular" style={{
                          position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                          fontSize: "11px", fontWeight: 700, color: "#fff",
                          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
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

      {/* ─── CHAMPIONS + TOP EARNERS ─── */}
      <div className="page-shell">
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


      {/* ─── TOP PRIZE RACES ─── */}
      <div className="page-shell">
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
