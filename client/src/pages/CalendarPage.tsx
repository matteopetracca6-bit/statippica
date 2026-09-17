import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { getFlag } from "@/lib/flags";
import { Calendar, MapPin, Clock, ChevronDown, ChevronRight, Trophy, AlertCircle, Medal } from "lucide-react";

interface CalendarEntry {
  horse_name: string;
  driver: string | null;
  start_pos: number | null;
  distance: number | null;
  grade: string | null;
  score: number | null;
  career_earnings: number | null;
  win_rate: number | null;
  career_races: number | null;
  career_wins: number | null;
  country: string | null;
  birth_year: number | null;
  sire: string | null;
  dam: string | null;
  win_estimate: number;
}

interface RaceEvent {
  track: string;
  race_date: string;
  race_time: string;
  n_runners: number;
  entries: CalendarEntry[];
}

interface CalendarResponse {
  races: RaceEvent[];
  total: number;
  note?: string;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatTime(time: string): string {
  if (!time) return "—";
  return time.substring(0, 5);
}

const TRACK_NAMES: Record<string, string> = {
  BO: "Bologna", MI: "Milano", RM: "Roma", TO: "Torino",
  NA: "Napoli", CE: "Cesena", SR: "Siracusa", TV: "Treviso",
  MT: "Montecatini", CS: "Casarano", PA: "Palermo", MO: "Modena",
  FI: "Firenze", BA: "Bari", VA: "Varese", GA: "Garigliano",
  PD: "Padova", VI: "Villanova", CT: "Castelluccio", AN: "Ancona",
  TS: "Trieste", FR: "Frosinone", SS: "San Severo",
};

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRace, setExpandedRace] = useState<string | null>(null);

  useState(() => {
    apiRequest("GET", "/api/calendar?limit=100")
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        // Auto-expand the first race
        if (d.races && d.races.length > 0) {
          setExpandedRace(`${d.races[0].track}-${d.races[0].race_date}-${d.races[0].race_time}`);
        }
      })
      .catch(() => setLoading(false));
  });

  const raceKey = (r: RaceEvent) => `${r.track}-${r.race_date}-${r.race_time}`;

  return (
    <div style={{ padding: "24px 32px 40px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <Calendar size={24} style={{ color: "hsl(0 60% 55%)" }} />
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "hsl(210 10% 90%)", margin: 0 }}>
          Calendario Gare
        </h1>
        {data && data.total > 0 && (
          <span className="tabular" style={{ fontSize: "13px", color: "hsl(210 8% 50%)", marginLeft: "8px" }}>
            {data.total} eventi · {data.races.reduce((s, r) => s + r.n_runners, 0)} partenti
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: "80px", borderRadius: "12px" }} />
          ))}
        </div>
      ) : !data || data.races.length === 0 ? (
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "14px", padding: "48px 24px", textAlign: "center",
        }}>
          <AlertCircle size={32} style={{ color: "hsl(210 8% 40%)", marginBottom: "12px" }} />
          <p style={{ fontSize: "15px", color: "hsl(210 8% 55%)", margin: "0 0 8px" }}>
            {data?.note || "Nessuna gara in calendario."}
          </p>
          <p style={{ fontSize: "12px", color: "hsl(210 8% 40%)", margin: 0 }}>
            Le gare future vengono aggiornate automaticamente ogni notte.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {data.races.map((race, i) => {
            const key = raceKey(race);
            const expanded = expandedRace === key;
            const top3 = race.entries.slice(0, 3);
            const trackName = TRACK_NAMES[race.track] || race.track;
            return (
              <div key={key} style={{
                background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
                borderRadius: "14px", overflow: "hidden",
              }}>
                {/* Race header */}
                <div
                  onClick={() => setExpandedRace(expanded ? null : key)}
                  style={{
                    display: "flex", alignItems: "center", gap: "16px",
                    padding: "16px 20px", cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {/* Date badge */}
                  <div style={{
                    minWidth: "64px", textAlign: "center",
                    background: "hsl(220 12% 8%)", borderRadius: "10px", padding: "8px 10px",
                  }}>
                    <div style={{ fontSize: "11px", color: "hsl(210 8% 50%)", textTransform: "uppercase" }}>
                      {formatDate(race.race_date).split(" ")[0]}
                    </div>
                    <div className="tabular" style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
                      {formatDate(race.race_date).split(" ")[1]}
                    </div>
                    <div style={{ fontSize: "10px", color: "hsl(210 8% 45%)", textTransform: "uppercase" }}>
                      {formatDate(race.race_date).split(" ")[2]}
                    </div>
                  </div>

                  {/* Track + time */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <MapPin size={14} style={{ color: "hsl(183 60% 55%)" }} />
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
                        {trackName}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                      <Clock size={12} style={{ color: "hsl(210 8% 45%)" }} />
                      <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                        {formatTime(race.race_time)}
                      </span>
                      <span style={{ fontSize: "12px", color: "hsl(210 8% 40%)", marginLeft: "8px" }}>
                        {race.n_runners} partenti
                      </span>
                    </div>
                  </div>

                  {/* Podium preview */}
                  {top3.length >= 3 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {top3.map((e, idx) => (
                        <div key={idx} style={{
                          display: "flex", alignItems: "center", gap: "4px",
                          padding: "4px 8px", borderRadius: "6px",
                          background: idx === 0 ? "hsl(51 80% 50% / 0.1)" : idx === 1 ? "hsl(0 0% 70% / 0.08)" : "hsl(30 70% 50% / 0.08)",
                        }}>
                          <Medal size={12} style={{ color: idx === 0 ? "hsl(51 80% 55%)" : idx === 1 ? "hsl(0 0% 70%)" : "hsl(30 70% 50%)" }} />
                          <Link href={`/horse/${encodeURIComponent(e.horse_name)}/${e.birth_year || 0}`}>
                            <a style={{ fontSize: "11px", color: "hsl(210 10% 80%)", textDecoration: "none", fontWeight: 600 }} onClick={ev => ev.stopPropagation()}>
                              {e.horse_name}
                            </a>
                          </Link>
                          <span className="tabular" style={{ fontSize: "10px", color: idx === 0 ? "hsl(51 80% 55%)" : "hsl(183 60% 50%)", fontWeight: 700 }}>
                            {e.win_estimate.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <ChevronDown
                    size={18}
                    style={{
                      color: "hsl(210 8% 45%)",
                      transform: expanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                </div>

                {/* Expanded entries */}
                {expanded && (
                  <div style={{ borderTop: "1px solid hsl(220 10% 16%)" }}>
                    {/* Podium header */}
                    <div style={{ padding: "12px 20px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Trophy size={14} style={{ color: "hsl(51 80% 55%)" }} />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Podio stimato
                      </span>
                    </div>

                    {/* Entries table */}
                    <div style={{ padding: "0 8px 8px" }}>
                      {race.entries.map((entry, idx) => {
                        const podiumColor = idx === 0 ? "hsl(51 80% 55%)" : idx === 1 ? "hsl(0 0% 70%)" : idx === 2 ? "hsl(30 70% 50%)" : "hsl(210 8% 40%)";
                        const podiumBg = idx === 0 ? "hsl(51 80% 50% / 0.06)" : idx === 1 ? "hsl(0 0% 70% / 0.04)" : idx === 2 ? "hsl(30 70% 50% / 0.04)" : "transparent";
                        return (
                          <div key={`${entry.horse_name}-${idx}`} style={{
                            display: "grid",
                            gridTemplateColumns: "28px 24px 1fr auto auto auto",
                            alignItems: "center", gap: "12px",
                            padding: "10px 16px", borderRadius: "8px",
                            background: podiumBg,
                            transition: "background 0.1s",
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = idx < 3 ? podiumBg : "hsl(220 10% 14%)"}
                            onMouseLeave={e => e.currentTarget.style.background = podiumBg}
                          >
                            {/* Position */}
                            <span className="tabular" style={{
                              fontSize: "13px", fontWeight: 700,
                              color: podiumColor,
                              textAlign: "center",
                            }}>
                              {idx < 3 ? ["1°", "2°", "3°"][idx] : idx + 1}
                            </span>

                            {/* Medal */}
                            {idx < 3 ? (
                              <Medal size={14} style={{ color: podiumColor }} />
                            ) : (
                              <span style={{ width: 14 }} />
                            )}

                            {/* Name + info */}
                            <div>
                              <Link href={`/horse/${encodeURIComponent(entry.horse_name)}/${entry.birth_year || 0}`}>
                                <a style={{
                                  fontSize: "13px", fontWeight: 600,
                                  color: idx < 3 ? podiumColor : "hsl(210 10% 85%)",
                                  textDecoration: "none",
                                }}>
                                  {getFlag(entry.country, entry.horse_name)} {entry.horse_name}
                                </a>
                              </Link>
                              <div style={{ fontSize: "11px", color: "hsl(210 8% 45%)", marginTop: "2px" }}>
                                {entry.sire && <span>{entry.sire}</span>}
                                {entry.birth_year && <span> · {entry.birth_year}</span>}
                                {entry.career_races != null && <span> · {entry.career_races} gare</span>}
                                {entry.win_rate != null && entry.win_rate > 0 && <span> · {entry.win_rate.toFixed(0)}% win</span>}
                              </div>
                            </div>

                            {/* Grade */}
                            <div>
                              {entry.grade ? <GradeBadge grade={entry.grade} size="sm" /> : <span style={{ fontSize: "11px", color: "hsl(210 8% 40%)" }}>—</span>}
                            </div>

                            {/* Score */}
                            <div className="tabular" style={{
                              fontSize: "13px", fontWeight: 700, minWidth: "36px", textAlign: "right",
                              color: entry.score != null ? "hsl(183 60% 55%)" : "hsl(210 8% 40%)",
                            }}>
                              {entry.score != null ? entry.score.toFixed(1) : "—"}
                            </div>

                            {/* Win estimate bar */}
                            <div style={{ minWidth: "100px", display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ flex: 1, height: "8px", background: "hsl(220 12% 8%)", borderRadius: "4px", overflow: "hidden" }}>
                                <div style={{
                                  height: "100%", width: `${Math.min(entry.win_estimate * 2, 100)}%`,
                                  background: idx < 3 ? podiumColor : "hsl(183 60% 50%)",
                                  borderRadius: "4px", transition: "width 0.5s",
                                }} />
                              </div>
                              <span className="tabular" style={{
                                fontSize: "13px", fontWeight: 700, minWidth: "40px",
                                color: idx < 3 ? podiumColor : "hsl(183 60% 55%)",
                              }}>
                                {entry.win_estimate.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      {data && data.races.length > 0 && (
        <div style={{
          marginTop: "20px", padding: "14px 18px",
          background: "hsl(220 12% 8%)", borderRadius: "10px",
          border: "1px solid hsl(220 10% 14%)",
        }}>
          <p style={{ fontSize: "11px", color: "hsl(210 8% 45%)", margin: 0, lineHeight: 1.6 }}>
            Le probabilita di vittoria sono stime indicative basate sul punteggio StatIppica e non tengono conto di fattori come partenza, condizioni di pista, stato di forma recente e strategie di gara. Non costituiscono consiglio di scommessa.
          </p>
        </div>
      )}
    </div>
  );
}
