import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { getFlag } from "@/lib/flags";
import { Calendar, MapPin, Clock, ChevronDown, ChevronRight, Trophy, AlertCircle } from "lucide-react";

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

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRace, setExpandedRace] = useState<string | null>(null);

  useState(() => {
    apiRequest("GET", "/api/calendar?limit=100")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
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
            {data.total} eventi
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: "60px", borderRadius: "12px" }} />
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
            const topPick = race.entries[0];
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
                    minWidth: "60px", textAlign: "center",
                    background: "hsl(220 12% 8%)", borderRadius: "10px", padding: "8px 10px",
                  }}>
                    <div style={{ fontSize: "11px", color: "hsl(210 8% 50%)", textTransform: "uppercase" }}>
                      {formatDate(race.race_date).split(" ")[0]}
                    </div>
                    <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
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
                        {race.track}
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

                  {/* Top pick preview */}
                  {topPick && topPick.win_estimate > 0 && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      background: "hsl(183 80% 40% / 0.1)", borderRadius: "8px",
                      padding: "6px 12px",
                    }}>
                      <Trophy size={14} style={{ color: "hsl(51 80% 55%)" }} />
                      <div>
                        <div style={{ fontSize: "12px", color: "hsl(210 10% 85%)", fontWeight: 600 }}>
                          {getFlag(topPick.country, topPick.horse_name)} {topPick.horse_name}
                        </div>
                        <div className="tabular" style={{ fontSize: "11px", color: "hsl(183 80% 55%)", fontWeight: 700 }}>
                          {topPick.win_estimate.toFixed(1)}% stimato
                        </div>
                      </div>
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
                  <div style={{ borderTop: "1px solid hsl(220 10% 16%)", padding: "8px" }}>
                    {race.entries.map((entry, idx) => (
                      <Link key={`${entry.horse_name}-${idx}`} href={`/horse/${encodeURIComponent(entry.horse_name)}/${entry.birth_year || 0}`}>
                        <a style={{
                          display: "grid",
                          gridTemplateColumns: "32px 1fr auto auto auto auto",
                          alignItems: "center", gap: "12px",
                          padding: "10px 16px", borderRadius: "8px", textDecoration: "none",
                          transition: "background 0.1s",
                          background: idx === 0 ? "hsl(51 80% 50% / 0.05)" : "transparent",
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                          onMouseLeave={e => e.currentTarget.style.background = idx === 0 ? "hsl(51 80% 50% / 0.05)" : "transparent"}
                        >
                          {/* Position */}
                          <span className="tabular" style={{
                            fontSize: "13px", fontWeight: 700,
                            color: idx === 0 ? "hsl(51 80% 55%)" : "hsl(210 8% 40%)",
                          }}>
                            {idx + 1}
                          </span>

                          {/* Name + info */}
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 88%)" }}>
                              {getFlag(entry.country, entry.horse_name)} {entry.horse_name}
                            </div>
                            <div style={{ fontSize: "11px", color: "hsl(210 8% 45%)", marginTop: "2px" }}>
                              {entry.driver && <span>{entry.driver}</span>}
                              {entry.sire && <span> · {entry.sire}</span>}
                              {entry.birth_year && <span> · {entry.birth_year}</span>}
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

                          {/* Career earnings */}
                          <div className="tabular" style={{
                            fontSize: "12px", minWidth: "60px", textAlign: "right",
                            color: "hsl(51 70% 55%)",
                          }}>
                            {entry.career_earnings ? `€${(entry.career_earnings / 1000).toFixed(0)}k` : "—"}
                          </div>

                          {/* Win estimate bar */}
                          <div style={{ minWidth: "80px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ flex: 1, height: "6px", background: "hsl(220 12% 8%)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{
                                height: "100%", width: `${Math.min(entry.win_estimate * 2, 100)}%`,
                                background: idx === 0 ? "hsl(51 80% 55%)" : "hsl(183 60% 50%)",
                                borderRadius: "3px", transition: "width 0.5s",
                              }} />
                            </div>
                            <span className="tabular" style={{
                              fontSize: "12px", fontWeight: 700, minWidth: "36px",
                              color: idx === 0 ? "hsl(51 80% 55%)" : "hsl(183 60% 55%)",
                            }}>
                              {entry.win_estimate.toFixed(1)}%
                            </span>
                          </div>
                        </a>
                      </Link>
                    ))}
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
