import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { getFlag } from "@/lib/flags";
import TrottingHorseLoader from "../components/TrottingHorseLoader";

const GRADE_ORDER = ["SSS","SS","S","A","B","C","D","E","F"] as const;
const GRADE_COLOR: Record<string,string> = {
  SSS: "hsl(183 100% 50%)", SS: "hsl(150 80% 50%)", S: "hsl(120 60% 50%)",
  A: "hsl(60 80% 55%)", B: "hsl(30 80% 58%)", C: "hsl(15 70% 55%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(0 60% 45%)",
};

/**
 * Applica una trasparenza a un colore HSL. La concatenazione di un codice
 * esadecimale ("hsl(...)55") non e' CSS valido e fa scartare il colore:
 * la notazione giusta e' "hsl(H S% L% / alfa)".
 */
function conAlfa(hsl: string, alfa: number): string {
  return hsl.replace(/^hsl\((.*)\)$/, (_m, dentro) => `hsl(${dentro} / ${alfa})`);
}


function GradeBadge({ grade, size = "md" }: { grade: string; size?: "sm"|"md" }) {
  const fs = size === "sm" ? "14px" : "20px";
  const px = size === "sm" ? "3px 8px" : "4px 12px";
  return (
    <span style={{
      display: "inline-block", padding: px, borderRadius: "6px",
      fontWeight: 800, fontSize: fs,
      color: GRADE_COLOR[grade] || "hsl(210 8% 70%)",
      background: conAlfa(GRADE_COLOR[grade] || "hsl(210 8% 70%)", 0.1),
      border: `1.5px solid ${conAlfa(GRADE_COLOR[grade] || "hsl(210 8% 70%)", 0.33)}`,
      letterSpacing: "0.04em",
    }}>{grade || "—"}</span>
  );
}

function StatRow({ label, v1, v2, better, format, raw }: {
  label: string;
  v1: number | null | undefined;
  v2: number | null | undefined;
  better?: "higher" | "lower";
  format?: (v: number) => string;
  raw?: boolean;
}) {
  const fmt = format || ((v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 }));
  const isNum = v1 != null && v2 != null;
  const h1wins = isNum && better === "higher" ? v1 > v2 : isNum && better === "lower" ? v1 < v2 : false;
  const h2wins = isNum && better === "higher" ? v2 > v1 : isNum && better === "lower" ? v2 < v1 : false;

  const cell = (v: number | null | undefined, wins: boolean) => (
    <div style={{
      flex: 1, textAlign: "center", fontWeight: wins ? 700 : 400,
      color: wins ? "hsl(183 100% 60%)" : "hsl(210 8% 72%)",
      fontSize: "15px", padding: "10px 8px",
    }}>
      {v != null ? (raw ? v : fmt(v)) : "—"}
      {wins && <span style={{ marginLeft: "6px", fontSize: "12px" }}>✓</span>}
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid hsl(220 10% 14%)" }}>
      {cell(v1, h1wins)}
      <div style={{
        flex: "0 0 160px", textAlign: "center", fontSize: "12px",
        color: "hsl(210 8% 45%)", fontWeight: 500, padding: "10px 8px",
        letterSpacing: "0.03em", textTransform: "uppercase",
      }}>{label}</div>
      {cell(v2, h2wins)}
    </div>
  );
}

function HorseSearch({ value, onChange, label }: {
  value: string; onChange: (v: string) => void; label: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const { data: results } = useQuery<any[]>({
    queryKey: ["/api/search/horse", query],
    queryFn: () => query.length >= 2
      ? apiRequest("GET", `/api/search/horse?q=${encodeURIComponent(query)}&limit=10`).then(r => r.json())
      : Promise.resolve([]),
    enabled: query.length >= 2,
    retry: 2,
    staleTime: 30000,
  });

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <div style={{ fontSize: "11px", color: "hsl(183 60% 45%)", fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
        {label}
      </div>
      <input
        data-testid={`input-compare-${label.toLowerCase().replace(/\s/g,"-")}`}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca cavallo..."
        style={{
          width: "100%", background: "hsl(220 14% 10%)",
          border: "1px solid hsl(220 10% 18%)", borderRadius: "8px",
          padding: "10px 14px", color: "hsl(210 10% 90%)", fontSize: "14px",
          outline: "none", boxSizing: "border-box",
        }}
      />
      {open && results && results.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0,
          background: "hsl(220 14% 11%)", border: "1px solid hsl(220 10% 20%)",
          borderRadius: "8px", marginTop: "4px", maxHeight: "220px", overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {results.map((r: any) => (
            <div
              key={`${r.name}-${r.birth_year}`}
              data-testid={`option-compare-${r.name}`}
              onMouseDown={() => {
                setQuery(r.name);
                onChange(`${r.name}__${r.birth_year}`);
                setOpen(false);
              }}
              style={{
                padding: "10px 14px", cursor: "pointer",
                borderBottom: "1px solid hsl(220 10% 15%)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "hsl(220 10% 16%)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "hsl(210 10% 88%)", fontSize: "14px", fontWeight: 500 }}>
                {r.name}
              </span>
              <span style={{ color: "hsl(210 8% 45%)", fontSize: "12px" }}>
                {r.birth_year} · <span style={{ color: GRADE_COLOR[r.grade] || "inherit" }}>{r.grade}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [sel1, setSel1] = useState<string>("");
  const [sel2, setSel2] = useState<string>("");

  const parse = (sel: string) => {
    const [name, year] = sel.split("__");
    return { name, year };
  };

  const { data, isLoading } = useQuery<{ horse1: any; horse2: any }>({
    queryKey: ["/api/compare", sel1, sel2],
    queryFn: () => {
      const h1 = parse(sel1); const h2 = parse(sel2);
      return apiRequest("GET",
        `/api/compare?name1=${encodeURIComponent(h1.name)}&year1=${h1.year}&name2=${encodeURIComponent(h2.name)}&year2=${h2.year}`
      ).then(r => r.json());
    },
    enabled: sel1.includes("__") && sel2.includes("__"),
  });

  // Fetch stats for both horses
  const { data: stats1 } = useQuery<any>({
    queryKey: ["/api/horse-stats", sel1],
    queryFn: () => {
      const h = parse(sel1);
      return apiRequest("GET", `/api/horse/${encodeURIComponent(h.name)}/${h.year}/stats`).then(r => r.json());
    },
    enabled: sel1.includes("__") && !!data?.horse1,
    staleTime: 60000,
  });
  const { data: stats2 } = useQuery<any>({
    queryKey: ["/api/horse-stats", sel2],
    queryFn: () => {
      const h = parse(sel2);
      return apiRequest("GET", `/api/horse/${encodeURIComponent(h.name)}/${h.year}/stats`).then(r => r.json());
    },
    enabled: sel2.includes("__") && !!data?.horse2,
    staleTime: 60000,
  });

  const h1 = data?.horse1;
  const h2 = data?.horse2;
  const ready = !!h1 && !!h2;

  // Compute derived stats
  const placeRate = (h: any) => {
    if (!h || h.career_races == null || h.career_races === 0) return null;
    const places = (h.career_places || 0) + (h.career_wins || 0);
    return places / h.career_races * 100;
  };
  const winRatePct = (h: any) => {
    if (!h || h.career_races == null || h.career_races === 0) return null;
    // win_rate from API is already a percentage (0-100)
    if (h.win_rate != null) return h.win_rate;
    return (h.career_wins || 0) / h.career_races * 100;
  };
  const earnPerRace = (h: any) => {
    if (!h || h.career_races == null || h.career_races === 0) return null;
    return (h.career_earnings || 0) / h.career_races;
  };

  return (
    <div className="page-shell">
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: 0, letterSpacing: "-0.01em" }}>
          Comparazione Cavalli
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 48%)", marginTop: "6px" }}>
          Seleziona due cavalli per confrontarne statistiche, rating, pedigree e performance.
        </p>
      </div>

      {/* Search bar */}
      <div style={{
        display: "flex", gap: "20px", alignItems: "flex-start",
        background: "hsl(220 14% 9%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", padding: "20px", marginBottom: "28px",
      }}>
        <HorseSearch value="" onChange={setSel1} label="Cavallo 1" />
        <div style={{
          flexShrink: 0, alignSelf: "flex-end", paddingBottom: "10px",
          color: "hsl(210 8% 40%)", fontWeight: 700, fontSize: "18px",
        }}>VS</div>
        <HorseSearch value="" onChange={setSel2} label="Cavallo 2" />
      </div>

      {/* Loading */}
      {isLoading && <TrottingHorseLoader label="Caricamento confronto..." />}

      {/* Not found messages */}
      {data && !h1 && sel1 && (
        <div style={{ color: "hsl(15 70% 55%)", marginBottom: "12px", fontSize: "13px" }}>
          Cavallo 1 non trovato nel database.
        </div>
      )}
      {data && !h2 && sel2 && (
        <div style={{ color: "hsl(15 70% 55%)", marginBottom: "12px", fontSize: "13px" }}>
          Cavallo 2 non trovato nel database.
        </div>
      )}

      {/* Comparison table */}
      {ready && (
        <div style={{
          background: "hsl(220 14% 9%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "14px", overflow: "hidden",
        }}>
          {/* Horse headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 160px 1fr",
            borderBottom: "2px solid hsl(220 10% 16%)",
          }}>
            {[h1, h2].map((h, i) => (
              <div key={i} style={{
                padding: "20px 16px", textAlign: "center",
                borderRight: i === 0 ? "1px solid hsl(220 10% 16%)" : undefined,
              }}>
                <Link href={`/horse/${encodeURIComponent(h.name)}/${h.birth_year}`}>
                  <a style={{
                    fontWeight: 800, fontSize: "16px",
                    color: "hsl(183 100% 62%)", textDecoration: "none",
                    display: "block", marginBottom: "6px",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                  >
                    {getFlag(h.country, h.name)} {h.name}
                  </a>
                </Link>
                <div style={{ fontSize: "12px", color: "hsl(210 8% 48%)", marginBottom: "10px" }}>
                  {h.birth_year} · {h.sire || "—"}
                </div>
                <GradeBadge grade={h.grade} />
                <div style={{ fontSize: "12px", color: "hsl(210 8% 40%)", marginTop: "6px" }}>
                  Score {h.score?.toFixed(1) ?? "—"}
                  {h.earn_percentile != null && ` · ${h.earn_percentile.toFixed(0)}° percentile`}
                </div>
              </div>
            ))}
            <div style={{ gridColumn: 2, gridRow: 1 }} />
          </div>

          {/* Career stats */}
          <div style={{ padding: "12px 16px 4px", fontSize: "11px", color: "hsl(210 8% 38%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>
            Carriera
          </div>
          <div>
            <StatRow label="Corse" v1={h1.career_races} v2={h2.career_races} better="higher" />
            <StatRow label="Vittorie" v1={h1.career_wins} v2={h2.career_wins} better="higher" />
            <StatRow label="Piazzamenti" v1={h1.career_places} v2={h2.career_places} better="higher" />
            <StatRow
              label="Win rate %"
              v1={winRatePct(h1)}
              v2={winRatePct(h2)}
              better="higher"
              format={v => `${v.toFixed(1)}%`}
            />
            <StatRow
              label="Piazz. rate %"
              v1={placeRate(h1)}
              v2={placeRate(h2)}
              better="higher"
              format={v => `${v.toFixed(1)}%`}
            />
            <StatRow
              label="Montepremi €"
              v1={h1.career_earnings}
              v2={h2.career_earnings}
              better="higher"
              format={v => `€${v.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`}
            />
            <StatRow
              label="€ / corsa"
              v1={earnPerRace(h1)}
              v2={earnPerRace(h2)}
              better="higher"
              format={v => `€${v.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`}
            />
            <StatRow label="Score MAISM" v1={h1.score} v2={h2.score} better="higher" format={v => v.toFixed(2)} />
          </div>

          {/* Record */}
          {(h1.record_career != null || h2.record_career != null) && (
            <>
              <div style={{ padding: "12px 16px 4px", fontSize: "11px", color: "hsl(210 8% 38%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", borderTop: "2px solid hsl(220 10% 16%)" }}>
                Record
              </div>
              <div>
                <StatRow
                  label="Record km"
                  v1={h1.record_career}
                  v2={h2.record_career}
                  better="lower"
                  format={v => `1:${(v / 10).toFixed(1)}`}
                />
              </div>
            </>
          )}

          {/* Year-by-year comparison */}
          {stats1 && stats2 && (stats1.yearlyStats?.length > 0 || stats2.yearlyStats?.length > 0) && (
            <div style={{ borderTop: "2px solid hsl(220 10% 16%)", padding: "16px" }}>
              <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", textAlign: "center" }}>
                Carriera anno per anno
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {[{ h: h1, s: stats1 }, { h: h2, s: stats2 }].map(({ h, s }, i) => (
                  <div key={i} style={{ borderRight: i === 0 ? "1px solid hsl(220 10% 14%)" : undefined, paddingRight: i === 0 ? "16px" : 0 }}>
                    {s.yearlyStats?.map((yr: any) => (
                      <div key={yr.year} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 0", borderBottom: "1px solid hsl(220 10% 10%)", fontSize: "12px",
                      }}>
                        <span style={{ color: "hsl(210 8% 42%)", minWidth: "30px" }}>{yr.year}</span>
                        <span style={{ color: "hsl(210 8% 55%)", textAlign: "center" }}>
                          {yr.races}c · {yr.wins}v
                        </span>
                        <span style={{ color: "hsl(51 70% 55%)", textAlign: "right" }}>
                          €{(yr.earnings / 1000).toFixed(0)}k
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pedigree comparison */}
          {(h1.pedigree || h2.pedigree) && (
            <div style={{ borderTop: "2px solid hsl(220 10% 16%)", padding: "20px 16px" }}>
              <div style={{
                fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 600,
                letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "14px",
                textAlign: "center",
              }}>
                Pedigree
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 1fr", gap: "0" }}>
                {[h1, h2].map((h, i) => (
                  <div key={i} style={{
                    padding: "0 12px",
                    borderRight: i === 0 ? "1px solid hsl(220 10% 16%)" : undefined,
                  }}>
                    {[
                      ["Padre", h.pedigree?.sire || h.sire, "sire"],
                      ["Madre", h.pedigree?.dam || h.dam, "dam"],
                      ["Nonno pat.", h.pedigree?.sire_sire, "sire_sire"],
                      ["Nonna pat.", h.pedigree?.sire_dam, "sire_dam"],
                      ["Nonno mat.", h.pedigree?.dam_sire, "dam_sire"],
                      ["Nonna mat.", h.pedigree?.dam_dam, "dam_dam"],
                    ].map(([lbl, val, type]) => {
                      if (!val) return null;
                      const isSire = type === "sire" || type === "sire_sire" || type === "dam_sire";
                      const link = isSire
                        ? `/stallion/${encodeURIComponent(val as string)}`
                        : `/horse/${encodeURIComponent(val as string)}/0`;
                      return (
                        <div key={String(lbl)} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "6px 0", borderBottom: "1px solid hsl(220 10% 12%)", fontSize: "13px",
                        }}>
                          <span style={{ color: "hsl(210 8% 42%)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {lbl}
                          </span>
                          <Link href={link}>
                            <a style={{ color: "hsl(183 80% 58%)", fontWeight: 500, textDecoration: "none", fontSize: "12px" }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                              onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                            >
                              {String(val)}
                            </a>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div style={{ gridColumn: 2 }} />
              </div>
            </div>
          )}

          {/* Track stats comparison */}
          {stats1 && stats2 && (stats1.trackStats?.length > 0 || stats2.trackStats?.length > 0) && (
            <div style={{ borderTop: "2px solid hsl(220 10% 16%)", padding: "16px" }}>
              <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", textAlign: "center" }}>
                Performance per ippodromo
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {[{ h: h1, s: stats1 }, { h: h2, s: stats2 }].map(({ h, s }, i) => (
                  <div key={i} style={{ borderRight: i === 0 ? "1px solid hsl(220 10% 14%)" : undefined, paddingRight: i === 0 ? "16px" : 0 }}>
                    {s.trackStats?.slice(0, 5).map((tr: any) => (
                      <div key={tr.track} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 0", borderBottom: "1px solid hsl(220 10% 10%)", fontSize: "12px",
                      }}>
                        <span style={{ color: "hsl(210 8% 42%)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tr.track}
                        </span>
                        <span style={{ color: "hsl(210 8% 55%)", textAlign: "center", margin: "0 8px" }}>
                          {tr.races}c · {tr.wins}v
                        </span>
                        <span style={{ color: "hsl(51 70% 55%)", textAlign: "right" }}>
                          €{(tr.earnings / 1000).toFixed(0)}k
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!ready && !isLoading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "hsl(210 8% 38%)", fontSize: "14px" }}>
          Seleziona due cavalli per iniziare il confronto.
        </div>
      )}
    </div>
  );
}
