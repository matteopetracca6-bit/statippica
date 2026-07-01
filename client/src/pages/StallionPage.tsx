import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFlag } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import { ArrowLeft, Search, X } from "lucide-react";

interface Pedigree {
  sire: string | null;
  dam: string | null;
  sire_sire: string | null;
  sire_dam: string | null;
  dam_sire: string | null;
  dam_dam: string | null;
}

interface StallionData {
  sire: string;
  n_figli_totali: number;
  n_in_corsa: number;
  n_SSS: number; n_SS: number; n_S: number;
  n_A: number; n_B: number; n_C: number; n_D: number; n_E: number; n_F: number;
  avg_score: number;
  avg_earnings: number;
  max_earnings: number;
  avg_win_rate: number;
  pct_top_S: number;
  grade: string | null;       // voto stallone (SSS…F)
  vp_boost: number;           // boost VendoPuledri (max +5)
  final_score: number | null; // punteggio finale con boost
  no_offspring_data?: boolean;
  stud?: {
    stud_fee_eur: number;
    stud_farm: string;
    stud_status: string;
    progeny_earnings_2024: number;
    media_in_corsa: number;
    tot_prod: number;
  };
  children: Child[];
  gradeDist: { grade: string; cnt: number }[];
  pedigree: Pedigree | null;
}

interface Child {
  name: string;
  birth_year: number;
  grade: string;
  score: number;
  career_earnings: number;
  record_career: string;
  win_rate: number;
  sire_percentile: number;
}

interface SearchResult {
  name: string;
  n_figli_totali: number;
  n_in_corsa: number;
  avg_score: number;
  n_SSS: number; n_SS: number; n_S: number;
  pct_top_S: number;
}

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(51 100% 55%)", SS: "hsl(0 0% 78%)", S: "hsl(30 70% 60%)",
  A: "hsl(183 60% 55%)", B: "hsl(100 45% 50%)", C: "hsl(25 55% 52%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(40 3% 28%)"
};

function StallionSearchBar({ onSelect }: { onSelect: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: results = [] } = useQuery<SearchResult[]>({
    queryKey: ["/api/search/stallion", q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const r = await apiRequest("GET", `/api/search/stallion?q=${encodeURIComponent(q)}`);
      return r.json();
    },
    enabled: q.length >= 2,
  });

  return (
    <div style={{ position: "relative", maxWidth: "480px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)",
        borderRadius: "10px", padding: "10px 14px",
      }}>
        <Search size={16} style={{ color: "hsl(210 8% 50%)" }} />
        <input
          value={q}
          onChange={e => { setQ(e.target.value.toUpperCase()); setOpen(true); }}
          placeholder="Cerca stallone..."
          data-testid="input-stallion-search"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "hsl(210 10% 88%)", fontSize: "14px", letterSpacing: "0.03em" }}
        />
        {q && <button onClick={() => { setQ(""); setOpen(false); }}><X size={14} style={{ color: "hsl(210 8% 45%)" }} /></button>}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px", overflow: "hidden", zIndex: 100,
          boxShadow: "0 8px 32px hsl(220 20% 5% / 0.6)",
        }}>
          {results.map((s, i) => (
            <button
              key={s.name}
              onClick={() => { onSelect(s.name); setQ(s.name); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid hsl(220 10% 16%)" : "none",
                textAlign: "left", transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 15%)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", letterSpacing: "0.03em" }}>{s.name}</div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)" }}>
                  {s.n_in_corsa} in corsa · avg {s.avg_score?.toFixed(1)} · {s.pct_top_S?.toFixed(0)}% top-S
                </div>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {s.n_SSS > 0 && <GradeBadge grade="SSS" size="sm" />}
                {s.n_SS > 0 && <GradeBadge grade="SS" size="sm" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PedigreeNode({ label, name, highlight }: { label: string; name: string | null; highlight?: boolean }) {
  const [, navigate] = useLocation();
  if (!name) {
    return (
      <div style={{ padding: "10px 14px", borderRadius: "8px", background: "hsl(220 12% 9%)", border: "1px dashed hsl(220 10% 18%)" }}>
        <div style={{ fontSize: "10px", color: "hsl(210 8% 35%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
        <div style={{ fontSize: "12px", color: "hsl(210 8% 38%)", fontStyle: "italic" }}>—</div>
      </div>
    );
  }
  return (
    <button
      onClick={() => navigate(`/stallion/${encodeURIComponent(name)}`)}
      style={{
        padding: "10px 14px", borderRadius: "8px", cursor: "pointer", textAlign: "left", width: "100%",
        background: highlight ? "hsl(183 30% 10%)" : "hsl(220 12% 11%)",
        border: highlight ? "1px solid hsl(183 40% 25%)" : "1px solid hsl(220 10% 18%)",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = highlight ? "hsl(183 30% 14%)" : "hsl(220 12% 15%)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = highlight ? "hsl(183 30% 10%)" : "hsl(220 12% 11%)"; }}
    >
      <div style={{ fontSize: "10px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
      <div style={{
        fontSize: highlight ? "13px" : "12px",
        fontWeight: highlight ? 700 : 600,
        color: highlight ? "hsl(183 70% 65%)" : "hsl(210 8% 75%)",
        letterSpacing: "0.03em",
      }}>
          <span style={{ fontSize: "22px", marginRight: "8px" }}>{getFlag(stallion?.nationality, name)}</span>
          {name}
        </div>
    </button>
  );
}

export default function StallionPage() {
  const [match, params] = useRoute("/stallion/:name");
  const [, navigate] = useLocation();
  const stallionName = params?.name ? decodeURIComponent(params.name) : "";

  const isSearch = !stallionName || stallionName === "search";

  const { data: stallion, isLoading } = useQuery<StallionData>({
    queryKey: ["/api/stallion", stallionName],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/stallion/${encodeURIComponent(stallionName)}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !isSearch,
  });

  const totalDist = stallion?.gradeDist.reduce((s, g) => s + g.cnt, 0) ?? 1;

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }} className="fade-in">
      <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" }}>
        <button onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: "6px", color: "hsl(210 8% 50%)", fontSize: "13px", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <ArrowLeft size={16} /> Indietro
        </button>
        <StallionSearchBar onSelect={name => navigate(`/stallion/${encodeURIComponent(name)}`)} />
      </div>

      {isSearch && (
        <div style={{ fontSize: "14px", color: "hsl(210 8% 45%)", marginTop: "12px" }}>
          Cerca uno stallone per nome.
        </div>
      )}

      {isLoading && !isSearch && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="skeleton" style={{ height: "50px", width: "280px", borderRadius: "10px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "76px", borderRadius: "10px" }} />)}
          </div>
        </div>
      )}

      {!isSearch && !isLoading && stallion && (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "hsl(210 10% 94%)", letterSpacing: "0.04em", margin: 0 }}>
              {stallion.sire}
            </h1>
            {stallion.grade && (
              <GradeBadge grade={stallion.grade} size="lg" />
            )}
          </div>
          <div style={{ fontSize: "13px", color: "hsl(210 8% 50%)", marginBottom: "24px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span>{stallion.n_figli_totali} prodotti totali</span>
            <span>·</span>
            <span>{stallion.n_in_corsa} in corsa</span>
            {stallion.stud?.stud_fee_eur && (
              <>
                <span>·</span>
                <span style={{ color: "hsl(51 80% 60%)" }}>Monta €{stallion.stud.stud_fee_eur.toLocaleString("it-IT")}</span>
              </>
            )}
            {stallion.stud?.stud_farm && (
              <>
                <span>·</span>
                <span>{stallion.stud.stud_farm}</span>
              </>
            )}
            {stallion.no_offspring_data && (
              <span style={{ color: "hsl(40 60% 55%)" }}>· Dati prodotti non ancora disponibili</span>
            )}
          </div>

          {/* Rating card — visibile solo se ci sono dati offspring */}
          {!stallion.no_offspring_data && stallion.final_score != null && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "18px 22px", marginBottom: "18px",
              display: "flex", alignItems: "center", gap: "28px", flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rating Stallone</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                  {stallion.grade && <GradeBadge grade={stallion.grade} size="lg" />}
                  <span className="tabular" style={{ fontSize: "26px", fontWeight: 800, color: "hsl(210 10% 90%)" }}>
                    {stallion.final_score.toFixed(1)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score base</div>
                <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(210 10% 75%)" }}>
                  {stallion.avg_score?.toFixed(1) ?? "—"}
                </div>
              </div>
              {(stallion.vp_boost ?? 0) > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>VP Boost</div>
                  <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(120 50% 55%)" }}>
                    +{(stallion.vp_boost ?? 0).toFixed(2)}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>% top-S</div>
                <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(183 60% 55%)" }}>
                  {stallion.pct_top_S != null ? `${stallion.pct_top_S.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", marginBottom: "22px" }}>
            {[
              { label: "Avg score", value: stallion.avg_score?.toFixed(1) ?? "—" },
              { label: "% top-S", value: stallion.pct_top_S != null ? `${stallion.pct_top_S.toFixed(1)}%` : "—" },
              { label: "Guadagni medi", value: stallion.avg_earnings != null ? `€${stallion.avg_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—" },
              { label: "Massimo figlio", value: stallion.max_earnings != null ? `€${stallion.max_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—" },
              { label: "Win rate medio", value: stallion.avg_win_rate != null ? `${stallion.avg_win_rate.toFixed(1)}%` : "—" },
              ...(stallion.stud?.progeny_earnings_2024 ? [{ label: "Prod. 2024", value: `€${(stallion.stud.progeny_earnings_2024 / 1000).toFixed(0)}k` }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 17%)",
                borderRadius: "10px", padding: "14px 16px",
              }}>
                <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>{value}</div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginTop: "4px" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Genealogy */}
          {stallion.pedigree && (stallion.pedigree.sire || stallion.pedigree.dam) && (
            <div style={{
              background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
              borderRadius: "12px", padding: "20px 22px", marginBottom: "22px",
            }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
                Genealogia
              </div>
              {/* Pedigree grid: 3 columns — grandparents paterni | parents | grandparents materni */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0", alignItems: "center" }}>
                {/* Paternal grandparents */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingRight: "16px" }}>
                  <PedigreeNode label="Nonno pat." name={stallion.pedigree.sire_sire} />
                  <PedigreeNode label="Nonna pat." name={stallion.pedigree.sire_dam} />
                </div>
                {/* Parents */}
                <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "0 20px", position: "relative" }}>
                  <PedigreeNode label="Padre (Sire)" name={stallion.pedigree.sire} highlight />
                  <PedigreeNode label="Madre (Dam)" name={stallion.pedigree.dam} highlight />
                </div>
                {/* Maternal grandparents */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "16px" }}>
                  <PedigreeNode label="Nonno mat." name={stallion.pedigree.dam_sire} />
                  <PedigreeNode label="Nonna mat." name={stallion.pedigree.dam_dam} />
                </div>
              </div>
            </div>
          )}

          {/* Grade distribution */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", padding: "20px 22px", marginBottom: "22px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
              Distribuzione figli (in corsa)
            </div>
            <div style={{ display: "flex", height: "24px", borderRadius: "4px", overflow: "hidden", gap: "2px", marginBottom: "10px" }}>
              {GRADE_ORDER.map(g => {
                const cnt = stallion.gradeDist.find(d => d.grade === g)?.cnt ?? 0;
                if (!cnt) return null;
                return (
                  <div key={g} title={`${g}: ${cnt}`} style={{
                    flex: cnt,
                    background: GRADE_COLORS[g] + "55",
                    borderTop: `3px solid ${GRADE_COLORS[g]}`,
                  }} />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {GRADE_ORDER.map(g => {
                const cnt = stallion.gradeDist.find(d => d.grade === g)?.cnt ?? 0;
                if (!cnt) return null;
                return (
                  <div key={g} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <GradeBadge grade={g} size="sm" />
                    <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 50%)" }}>{cnt}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top children */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", padding: "20px 22px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
              Top prodotti (per guadagni)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
                  {["Cavallo", "Anno", "Voto", "Score", "Guadagni", "Record", "Win%", "% vs fratelli"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px 10px", fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stallion.children.map((c, i) => (
                  <tr key={`${c.name}-${c.birth_year}`} style={{ borderBottom: i < stallion.children.length - 1 ? "1px solid hsl(220 10% 14%)" : "none", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <td style={{ padding: "9px 10px" }}>
                      <Link href={`/horse/${encodeURIComponent(c.name)}/${c.birth_year}`}>
                        <a style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 80%)", textDecoration: "none", letterSpacing: "0.03em", display: "flex", alignItems: "center", gap: "5px" }}><span>{getFlag(c.country, c.name)}</span><span>{c.name}</span></a>
                      </Link>
                    </td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{c.birth_year}</td>
                    <td style={{ padding: "9px 10px" }}><GradeBadge grade={c.grade} size="sm" /></td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{c.score?.toFixed(1)}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(51 80% 60%)" }}>€{c.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(183 70% 55%)" }}>{c.record_career ? `1.${c.record_career}` : "—"}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{c.win_rate != null ? `${c.win_rate.toFixed(1)}%` : "—"}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{c.sire_percentile != null ? `${c.sire_percentile.toFixed(0)}°` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isSearch && !isLoading && !stallion && (
        <div style={{ fontSize: "14px", color: "hsl(0 62% 55%)" }}>Stallone non trovato.</div>
      )}
    </div>
  );
}
