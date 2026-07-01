import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFlag, KNOWN_STALLION_NATIONALITY, COUNTRY_FLAG } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import HorseSearchBar from "../components/HorseSearchBar";
import { ArrowLeft, Trophy, Clock, Flag, Coins } from "lucide-react";

interface HorseData {
  name: string;
  birth_year: number;
  sex: string;
  country: string;
  sire: string;
  dam: string;
  career_races: number;
  career_wins: number;
  career_places: number;
  career_earnings: number;
  record_career: string;
  record_short: string;
  record_long: string;
  grade: string;
  score: number;
  earn_percentile: number;
  time_percentile: number;
  sire_percentile: number;
  rating_mode: string;
  win_rate: number;
  races: Race[];
  siblings: Sibling[];
  pedigree: {
    sire: string | null;
    dam: string | null;
    sire_sire: string | null;
    sire_dam: string | null;
    dam_sire: string | null;
    dam_dam: string | null;
  } | null;
}

interface Race {
  race_date: string;
  track: string;
  placement: number;
  placement_raw: string;
  time_km: number;
  distance: number;
  driver: string;
  prize_net: number;
  prize_gross: number;
  race_code: string;
}

interface Sibling {
  name: string;
  birth_year: number;
  grade: string;
  score: number;
  career_earnings: number;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: "hsl(220 12% 12%)",
      border: "1px solid hsl(220 10% 17%)",
      borderRadius: "10px",
      padding: "14px 16px",
    }}>
      <div className="tabular" style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 90%)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="tabular" style={{ fontSize: "11px", color: "hsl(183 80% 55%)", marginTop: "2px" }}>{sub}</div>}
      <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

function PercentileBar({ label, value, max = 100 }: { label: string; value: number | null; max?: number }) {
  if (value == null) return null;
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 90 ? "hsl(51 100% 55%)" : pct >= 70 ? "hsl(183 100% 45%)" : pct >= 40 ? "hsl(100 50% 50%)" : "hsl(25 55% 50%)";
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px", color: "hsl(210 8% 55%)" }}>{label}</span>
        <span className="tabular" style={{ fontSize: "12px", fontWeight: 600, color }}>{pct.toFixed(1)}°</span>
      </div>
      <div style={{ height: "6px", background: "hsl(220 10% 18%)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function HorsePedigreeNode({ label, name, isStallion, highlight }: {
  label: string; name: string | null; isStallion: boolean; highlight?: boolean;
}) {
  const [, navigate] = useLocation();
  if (!name) {
    return (
      <div style={{ padding: "10px 14px", borderRadius: "8px", background: "hsl(220 12% 9%)", border: "1px dashed hsl(220 10% 18%)" }}>
        <div style={{ fontSize: "10px", color: "hsl(210 8% 35%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
        <div style={{ fontSize: "12px", color: "hsl(210 8% 38%)", fontStyle: "italic" }}>—</div>
      </div>
    );
  }
  const handleClick = () => {
    if (isStallion) navigate(`/stallion/${encodeURIComponent(name)}`);
  };
  const isClickable = isStallion;
  return (
    <div
      onClick={isClickable ? handleClick : undefined}
      style={{
        padding: "10px 14px", borderRadius: "8px", textAlign: "left", width: "100%",
        cursor: isClickable ? "pointer" : "default",
        background: highlight
          ? (isStallion ? "hsl(183 30% 10%)" : "hsl(320 15% 10%)")
          : "hsl(220 12% 11%)",
        border: highlight
          ? (isStallion ? "1px solid hsl(183 40% 25%)" : "1px solid hsl(320 20% 22%)")
          : "1px solid hsl(220 10% 18%)",
        transition: isClickable ? "background 0.15s, border-color 0.15s" : undefined,
      }}
      onMouseEnter={isClickable ? (e: any) => { e.currentTarget.style.background = highlight ? "hsl(183 30% 14%)" : "hsl(220 12% 15%)"; } : undefined}
      onMouseLeave={isClickable ? (e: any) => { e.currentTarget.style.background = highlight ? (isStallion ? "hsl(183 30% 10%)" : "hsl(320 15% 10%)") : "hsl(220 12% 11%)"; } : undefined}
    >
      <div style={{ fontSize: "10px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
      <div style={{
        fontSize: highlight ? "13px" : "12px",
        fontWeight: highlight ? 700 : 600,
        color: highlight
          ? (isStallion ? "hsl(183 70% 65%)" : "hsl(320 50% 75%)")
          : "hsl(210 8% 75%)",
        letterSpacing: "0.03em",
      }}>{name}</div>
    </div>
  );
}

export default function HorsePage() {
  const [match, params] = useRoute("/horse/:name/:year");
  const [, navigate] = useLocation();

  const name = params?.name ? decodeURIComponent(params.name) : "";
  const year = params?.year ?? "0";

  // If year is 0, show search only
  if (year === "0" || !name) {
    return (
      <div style={{ padding: "28px 32px", maxWidth: "600px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 90%)", marginBottom: "20px" }}>Cerca Cavallo</h1>
        <HorseSearchBar placeholder="Nome cavallo..." />
      </div>
    );
  }

  const { data: horse, isLoading, error } = useQuery<HorseData>({
    queryKey: ["/api/horse", name, year],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/horse/${encodeURIComponent(name)}/${year}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!name && year !== "0",
  });

  if (isLoading) return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="skeleton" style={{ height: "60px", width: "300px", borderRadius: "10px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "80px", borderRadius: "10px" }} />)}
        </div>
      </div>
    </div>
  );

  if (error || !horse) return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: "14px", color: "hsl(0 62% 55%)" }}>Cavallo non trovato.</div>
      <div style={{ marginTop: "20px", maxWidth: "400px" }}><HorseSearchBar /></div>
    </div>
  );

  const SEX_LABEL: Record<string, string> = { M: "Maschio", F: "Femmina" };
  const MODE_LABEL = horse.rating_mode === "performance" ? "Gare" : "Pedigree";

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1000px" }} className="fade-in">
      {/* Back + search */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "24px" }}>
        <button onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: "6px", color: "hsl(210 8% 50%)", fontSize: "13px", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <ArrowLeft size={16} /> Indietro
        </button>
        <div style={{ flex: 1, maxWidth: "380px" }}><HorseSearchBar /></div>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
        <GradeBadge grade={horse.grade ?? "N/A"} size="lg" />
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "hsl(210 10% 94%)", letterSpacing: "0.03em", marginBottom: "4px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "20px" }}>{getFlag(horse.country, horse.name)}</span>
              {horse.name}
            </h1>
          <div style={{ fontSize: "13px", color: "hsl(210 8% 52%)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span>{horse.birth_year}</span>
            <span>·</span>
            <span>{SEX_LABEL[horse.sex] ?? horse.sex}</span>
            {horse.country && <><span>·</span><span>{horse.country}</span></>}
            <span>·</span>
            <span>Rating: {MODE_LABEL}</span>
            {horse.score != null && <><span>·</span><span className="tabular">Score {horse.score.toFixed(1)}</span></>}
          </div>
        </div>
      </div>

      {/* Genealogy */}
      {horse.pedigree && (horse.pedigree.sire || horse.pedigree.dam) && (
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "12px", padding: "20px 22px", marginBottom: "24px",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
            Genealogia
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0", alignItems: "center" }}>
            {/* Paternal grandparents */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingRight: "16px" }}>
              <HorsePedigreeNode label="Nonno pat." name={horse.pedigree.sire_sire} isStallion />
              <HorsePedigreeNode label="Nonna pat." name={horse.pedigree.sire_dam} isStallion={false} />
            </div>
            {/* Parents */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "0 20px" }}>
              <HorsePedigreeNode label="Padre (Sire)" name={horse.pedigree.sire} isStallion highlight />
              <HorsePedigreeNode label="Madre (Dam)" name={horse.pedigree.dam} isStallion={false} highlight />
            </div>
            {/* Maternal grandparents */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "16px" }}>
              <HorsePedigreeNode label="Nonno mat." name={horse.pedigree.dam_sire} isStallion />
              <HorsePedigreeNode label="Nonna mat." name={horse.pedigree.dam_dam} isStallion={false} />
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", marginBottom: "24px" }}>
        <Stat label="Corse totali" value={horse.career_races ?? "—"} />
        <Stat label="Vittorie" value={horse.career_wins ?? "—"} sub={horse.win_rate != null ? `${horse.win_rate.toFixed(1)}% win rate` : undefined} />
        <Stat label="Piazzamenti" value={horse.career_places ?? "—"} />
        <Stat label="Guadagni" value={horse.career_earnings != null ? `€${horse.career_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"} />
        {horse.record_career && <Stat label="Record km" value={`1.${horse.record_career}`} />}
      </div>

      {/* Percentile bars */}
      {horse.rating_mode === "performance" && (
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "12px", padding: "20px 22px", marginBottom: "24px",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
            Percentili generazione {horse.birth_year}
          </div>
          <PercentileBar label="Guadagni" value={horse.earn_percentile} />
          <PercentileBar label="Miglior tempo" value={horse.time_percentile} />
          {horse.sire_percentile != null && (
            <PercentileBar label={`vs fratellastri (${horse.sire})`} value={horse.sire_percentile} />
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Last races */}
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "12px", padding: "20px 22px",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
            Ultime gare
          </div>
          {horse.races?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {horse.races.slice(0, 10).map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "7px 0",
                  borderBottom: i < Math.min(9, horse.races.length - 1) ? "1px solid hsl(220 10% 15%)" : "none",
                }}>
                  <div className="tabular" style={{
                    minWidth: "24px", height: "24px", borderRadius: "6px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px", fontWeight: 700,
                    background: r.placement === 1 ? "hsl(51 100% 50% / 0.15)" : r.placement <= 3 ? "hsl(183 60% 40% / 0.15)" : "hsl(220 10% 14%)",
                    color: r.placement === 1 ? "hsl(51 100% 60%)" : r.placement <= 3 ? "hsl(183 80% 60%)" : "hsl(210 8% 50%)",
                    border: "1px solid",
                    borderColor: r.placement === 1 ? "hsl(51 100% 50% / 0.3)" : r.placement <= 3 ? "hsl(183 60% 40% / 0.3)" : "hsl(220 10% 20%)",
                  }}>
                    {r.placement_raw ?? r.placement ?? "—"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "hsl(210 8% 65%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.track || "—"} {r.race_date ? `· ${r.race_date}` : ""}
                    </div>
                    <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)" }}>
                      {r.driver || ""} {r.distance ? `· ${r.distance}m` : ""}
                    </div>
                  </div>
                  {r.time_km != null && (
                    <div className="tabular" style={{ fontSize: "11px", color: "hsl(183 70% 55%)", flexShrink: 0 }}>
                      {(r.time_km / 10).toFixed(1)}s
                    </div>
                  )}
                  {r.prize_net != null && r.prize_net > 0 && (
                    <div className="tabular" style={{ fontSize: "11px", color: "hsl(51 80% 55%)", flexShrink: 0 }}>
                      €{r.prize_net.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "hsl(210 8% 40%)" }}>Nessuna gara in archivio.</div>
          )}
        </div>

        {/* Siblings */}
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
          borderRadius: "12px", padding: "20px 22px",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
            Fratellastri top (stesso padre)
          </div>
          {horse.siblings?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {horse.siblings.map((s, i) => (
                <Link key={`${s.name}-${s.birth_year}`} href={`/horse/${encodeURIComponent(s.name)}/${s.birth_year}`}>
                  <a style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 10px", borderRadius: "7px", textDecoration: "none",
                    transition: "background 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <GradeBadge grade={s.grade} size="sm" />
                    <span style={{ flex: 1, fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 78%)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 45%)", flexShrink: 0 }}>
                      €{s.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                    </span>
                  </a>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "hsl(210 8% 40%)" }}>Nessun fratellastro trovato.</div>
          )}
        </div>
      </div>
    </div>
  );
}
