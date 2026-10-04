import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { useState, useMemo } from "react";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import GraficoColonne, { COLORI_GRAFICO } from "../components/GraficoColonne";

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(183 100% 55%)", SS: "hsl(150 80% 50%)", S: "hsl(120 60% 50%)",
  A: "hsl(60 80% 55%)", B: "hsl(30 80% 58%)", C: "hsl(15 70% 55%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(0 60% 45%)",
};

/**
 * Applica una trasparenza a un colore HSL.
 *
 * Serve perche' prima il codice scriveva `GRADE_COLORS[g] + "88"`, che
 * produce "hsl(183 100% 55%)88": stringa non valida, quindi il browser
 * scartava lo sfondo e le barre del grafico risultavano invisibili (si
 * vedeva solo il loro bordo da 1 pixel). La notazione corretta per i
 * colori HSL e' "hsl(H S% L% / alfa)".
 */
function conAlfa(hsl: string, alfa: number): string {
  return hsl.replace(/^hsl\((.*)\)$/, (_m, dentro) => `hsl(${dentro} / ${alfa})`);
}

interface TrendsData {
  gradeByYear: { birth_year: number; grade: string; cnt: number }[];
  earningsByYear: { birth_year: number; n_horses: number; avg_earnings: number; avg_races: number; avg_wins: number; avg_win_rate: number; eta?: number; carriera_conclusa?: boolean }[];
  nota_annate?: { annata_minima: number; eta_carriera_conclusa: number; avvertenza: string };
  racesPerYear: { year: string; n_races: number; n_horses: number; avg_prize: number; total_prize: number }[];
  topTracks: { track: string; n_races: number; avg_prize: number; total_prize: number }[];
}

type View = "grades" | "earnings" | "races" | "tracks";

export default function TrendsPage() {
  const [view, setView] = useState<View>("grades");
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null);

  const { data, isLoading } = useQuery<TrendsData>({
    queryKey: ["/api/trends"],
    queryFn: () => apiRequest("GET", "/api/trends").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const fmt = (v: number) => v?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—";
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v);

  // Build stacked bar data for grades by year
  const years = useMemo(() => data ? [...new Set(data.gradeByYear.map(g => g.birth_year))].sort() : [], [data]);
  const gradeDataByYear = useMemo(() => years.map(yr => {
    const grades = GRADE_ORDER.map(g => ({
      grade: g,
      cnt: data!.gradeByYear.find(d => d.birth_year === yr && d.grade === g)?.cnt ?? 0,
    }));
    const total = grades.reduce((s, g) => s + g.cnt, 0);
    return { year: yr, grades, total };
  }), [years, data]);

  const maxEarnings = useMemo(() => data ? Math.max(...data.earningsByYear.map(e => e.avg_earnings), 1) : 1, [data]);
  const maxRaces = useMemo(() => data ? Math.max(...data.racesPerYear.map(r => r.n_races), 1) : 1, [data]);
  const maxTrackRaces = useMemo(() => data ? Math.max(...data.topTracks.map(t => t.n_races), 1) : 1, [data]);

  // Toggle group for grades view
  const [showGrades, setShowGrades] = useState<Set<string>>(new Set(GRADE_ORDER));

  const toggleGrade = (g: string) => {
    const next = new Set(showGrades);
    if (next.has(g)) next.delete(g); else next.add(g);
    if (next.size === 0) return; // keep at least one
    setShowGrades(next);
  };

  const views: { key: View; label: string }[] = [
    { key: "grades", label: "Voti per anno" },
    { key: "earnings", label: "Guadagni per anno" },
    { key: "races", label: "Gare per anno" },
    { key: "tracks", label: "Top ippodromi" },
  ];

  return (
    <div className="page-shell">
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Trend Temporali
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Come cambiano voti, guadagni e gare nel tempo.
        </p>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        {views.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              padding: "7px 14px", borderRadius: "8px", cursor: "pointer",
              background: view === key ? "hsl(183 100% 38%)" : "hsl(220 10% 14%)",
              color: view === key ? "hsl(220 13% 7%)" : "hsl(210 8% 55%)",
              border: "none", fontSize: "12px", fontWeight: 700,
              transition: "all 0.2s ease",
              transform: view === key ? "scale(1.05)" : "scale(1)",
              boxShadow: view === key ? "0 2px 8px hsl(183 100% 38% / 0.3)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <CavalloCaricamento label="Caricamento trend..." />
      ) : !data ? (
        <div style={{ color: "hsl(210 8% 45%)", padding: "40px" }}>Nessun dato.</div>
      ) : (
        <>
          {/* Grade distribution by year — stacked bar chart */}
          {view === "grades" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
              transition: "border-color 0.3s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Distribuzione voti per anno di nascita
                </div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 40%)" }}>
                  {gradeDataByYear.reduce((s, y) => s + y.total, 0)} cavalli totali
                </div>
              </div>

              {/* Interactive legend — toggle grades */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
                {GRADE_ORDER.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleGrade(g)}
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      padding: "3px 8px", borderRadius: "6px", cursor: "pointer",
                      background: showGrades.has(g) ? conAlfa(GRADE_COLORS[g], 0.13) : "transparent",
                      border: `1px solid ${showGrades.has(g) ? conAlfa(GRADE_COLORS[g], 0.33) : "hsl(220 10% 14%)"}`,
                      fontSize: "11px", fontWeight: 700,
                      color: showGrades.has(g) ? GRADE_COLORS[g] : "hsl(210 8% 30%)",
                      transition: "all 0.15s",
                      opacity: showGrades.has(g) ? 1 : 0.4,
                    }}
                  >
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: GRADE_COLORS[g] }} />
                    {g}
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "260px", padding: "0 4px" }}>
                {gradeDataByYear.map((yd, idxAnno) => {
                  const visibleGrades = yd.grades.filter(g => showGrades.has(g.grade));
                  const visibleTotal = visibleGrades.reduce((s, g) => s + g.cnt, 0) || 1;
                  return (
                    <div
                      key={yd.year}
                      onMouseEnter={() => setHoveredBar(`grade-${yd.year}`)}
                      onMouseLeave={() => setHoveredBar(null)}
                      style={{
                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                        gap: "4px", minWidth: 0, cursor: "pointer",
                        opacity: hoveredBar && hoveredBar !== `grade-${yd.year}` ? 0.5 : 1,
                        transition: "opacity 0.2s",
                      }}
                    >
                      {/* Tooltip */}
                      {hoveredBar === `grade-${yd.year}` && (
                        <div style={{
                          position: "absolute", transform: "translateY(-100%)",
                          background: "hsl(220 14% 8%)", border: "1px solid hsl(220 10% 20%)",
                          borderRadius: "8px", padding: "8px 12px",
                          fontSize: "11px", whiteSpace: "nowrap", zIndex: 10,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        }}>
                          <div style={{ fontWeight: 700, color: "hsl(210 10% 85%)", marginBottom: "4px" }}>{yd.year}</div>
                          {visibleGrades.filter(g => g.cnt > 0).map(g => (
                            <div key={g.grade} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: GRADE_COLORS[g.grade] }} />
                              <span style={{ color: GRADE_COLORS[g.grade] }}>{g.grade}</span>
                              <span className="tabular" style={{ color: "hsl(210 8% 65%)", marginLeft: "auto" }}>{g.cnt}</span>
                            </div>
                          ))}
                          <div style={{ borderTop: "1px solid hsl(220 10% 14%)", marginTop: "4px", paddingTop: "4px", color: "hsl(210 8% 50%)", fontWeight: 600 }}>
                            Totale: {yd.total}
                          </div>
                        </div>
                      )}
                      <div className="barra-su" style={{
                        display: "flex", flexDirection: "column-reverse", height: "220px",
                        width: "100%", borderRadius: "4px 4px 0 0", overflow: "hidden",
                        animationDelay: `${Math.min(idxAnno, 14) * 45}ms`,
                      }}>
                        {visibleGrades.map(g => g.cnt > 0 && (
                          <div
                            key={g.grade}
                            style={{
                              height: `${(g.cnt / visibleTotal) * 100}%`,
                              background: conAlfa(GRADE_COLORS[g.grade], hoveredBar === `grade-${yd.year}` ? 0.8 : 0.53),
                              borderTop: `1px solid ${GRADE_COLORS[g.grade]}`,
                              transition: "background 0.2s",
                            }}
                          />
                        ))}
                      </div>
                      {/* Tredici anni su 340 pixel danno 16 pixel a etichetta:
                          "2012" ne chiede 22, quindi i numeri si accavallavano e
                          non se ne leggeva nessuno. Su telefono l'etichetta
                          ruota in verticale, dove la larghezza non serve piu'. */}
                      <span className="tabular etichetta-anno" style={{ fontSize: "10px", color: "hsl(210 8% 45%)" }}>{yd.year}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Earnings by year — bar chart with hover details */}
          {view === "earnings" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Guadagno medio per anno di nascita
              </div>
              {/* Senza questa riga il grafico si legge come un crollo del
                  settore, mentre e' soltanto l'eta' dei cavalli: i nati di
                  recente devono ancora correre. */}
              <div style={{ fontSize: "12px", color: "hsl(210 8% 55%)", marginBottom: "18px", lineHeight: 1.55, maxWidth: "70ch" }}>
                Le annate recenti guadagnano meno perche&apos; i cavalli sono ancora giovani e
                devono correre, non perche&apos; il settore stia calando. Sono confrontabili fra
                loro solo le colonne piene, cioe&apos; le annate che hanno concluso la carriera.
              </div>
              <GraficoColonne
                altezza={260}
                colore={COLORI_GRAFICO.euro}
                formatoGuida={v => `€${fmtK(v)}`}
                nomeAsse="anno di nascita · a righe le annate che stanno ancora correndo"
                dati={data.earningsByYear.map(yr => ({
                  chiave: yr.birth_year,
                  etichetta: String(yr.birth_year),
                  valore: yr.avg_earnings,
                  testo: `€${fmtK(yr.avg_earnings)}`,
                  tratteggio: yr.carriera_conclusa === false,
                  scheda: [
                    { testo: String(yr.birth_year) },
                    { testo: `€${fmt(yr.avg_earnings)} medi`, colore: COLORI_GRAFICO.euro },
                    { testo: `${fmt(yr.n_horses)} cavalli` },
                    { testo: `${fmt(yr.avg_races)} gare medie` },
                    { testo: `${String(yr.avg_win_rate).replace(".", ",")}% vittorie` },
                    ...(yr.carriera_conclusa === false ? [{ testo: `carriera non conclusa: ${yr.eta} anni`, colore: COLORI_GRAFICO.medio }] : []),
                  ],
                }))}
              />
            </div>
          )}

          {/* Races per year — bar chart with hover */}
          {view === "races" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Gare e cavalli per anno
              </div>
              <GraficoColonne
                altezza={260}
                colore={COLORI_GRAFICO.quantita}
                formatoGuida={v => fmtK(v)}
                nomeAsse="anno delle corse"
                dati={data.racesPerYear.map(yr => ({
                  chiave: yr.year,
                  etichetta: String(yr.year),
                  valore: yr.n_races,
                  testo: fmtK(yr.n_races),
                  scheda: [
                    { testo: String(yr.year) },
                    { testo: `${fmt(yr.n_races)} gare`, colore: COLORI_GRAFICO.quantita },
                    { testo: `${fmt(yr.n_horses)} cavalli` },
                    { testo: `€${fmt(yr.avg_prize)} premio medio`, colore: COLORI_GRAFICO.euro },
                    { testo: `€${fmtK(yr.total_prize)} in totale`, colore: COLORI_GRAFICO.euro },
                  ],
                }))}
              />
            </div>
          )}

          {/* Top tracks — interactive horizontal bars */}
          {view === "tracks" && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Top ippodromi per numero di gare
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {data.topTracks.map((t, i) => (
                  <div
                    key={t.track}
                    onMouseEnter={() => setHoveredTrack(i)}
                    onMouseLeave={() => setHoveredTrack(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "6px 0",
                      transition: "transform 0.15s",
                      transform: hoveredTrack === i ? "translateX(4px)" : "translateX(0)",
                    }}
                  >
                    <span className="tabular" style={{
                      fontSize: "12px", fontWeight: 700,
                      color: hoveredTrack === i ? "hsl(183 80% 55%)" : "hsl(210 8% 35%)",
                      minWidth: "24px", transition: "color 0.15s",
                    }}>{i + 1}</span>
                    <span style={{
                      flex: 1, fontSize: "13px", fontWeight: hoveredTrack === i ? 700 : 500,
                      color: hoveredTrack === i ? "hsl(210 10% 90%)" : "hsl(210 10% 75%)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      transition: "all 0.15s",
                    }}>
                      {t.track || "—"}
                    </span>
                    <div style={{ flex: 2, height: "20px", background: "hsl(220 10% 12%)", borderRadius: "4px", overflow: "hidden" }}>
                      <div className="barra-destra" style={{
                        animationDelay: `${Math.min(i, 14) * 45}ms`,
                        height: "100%", width: `${(t.n_races / maxTrackRaces) * 100}%`,
                        background: hoveredTrack === i
                          ? "linear-gradient(90deg, hsl(183 90% 55%), hsl(183 70% 45%))"
                          : "linear-gradient(90deg, hsl(183 80% 45%), hsl(183 60% 35%))",
                        borderRadius: "4px",
                        transition: "all 0.3s ease",
                      }} />
                    </div>
                    <span className="tabular" style={{
                      fontSize: "12px", fontWeight: 700,
                      color: hoveredTrack === i ? "hsl(183 80% 55%)" : "hsl(210 8% 55%)",
                      minWidth: "60px", textAlign: "right", transition: "color 0.15s",
                    }}>
                      {fmt(t.n_races)}
                    </span>
                    <span className="tabular" style={{
                      fontSize: "12px",
                      color: hoveredTrack === i ? "hsl(51 80% 58%)" : "hsl(51 70% 50%)",
                      minWidth: "70px", textAlign: "right", transition: "color 0.15s",
                    }}>
                      €{fmtK(t.total_prize)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <CollegamentiCorrelati voci={[
        { href: "/leaderboard", titolo: "Leaderboard", descrizione: "I singoli cavalli dietro questi andamenti." },
        { href: "/qualifiche", titolo: "Qualifiche", descrizione: "I cavalli giovani non ancora in classifica, appena qualificati." },
        { href: "/advisor", titolo: "Advisor", descrizione: "Usa questi andamenti per scegliere un accoppiamento." },
      ]} />
    </div>
  );
}
