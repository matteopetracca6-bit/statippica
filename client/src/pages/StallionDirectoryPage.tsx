import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFlag } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import { Search, X, MapPin, Euro, Filter, ArrowUpDown } from "lucide-react";

interface StallionEntry {
  name: string;
  stud_fee_eur: number | null;
  stud_farm: string | null;
  stud_status: string | null;
  in_catalog?: number;
  country: string | null;
  nationality: string | null;
  season: string | null;
  avg_score: number | null;
  final_score: number | null;
  grade: string | null;
  n_figli_totali: number | null;
  n_in_corsa: number | null;
  pct_top_S: number | null;
}

type SortKey = "fee_desc" | "fee_asc" | "name_asc" | "score_desc" | "figli_desc";

const COUNTRY_LABELS: Record<string, string> = {
  USA: "Stati Uniti",
  ITA: "Italia",
  FRA: "Francia",
  SWE: "Svezia",
  NOR: "Norvegia",
  GER: "Germania",
  DEN: "Danimarca",
  FIN: "Finlandia",
  NED: "Olanda",
  ESP: "Spagna",
  GBR: "Regno Unito",
  CAN: "Canada",
  AUT: "Austria",
  BEL: "Belgio",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Disponibile",
  da_concordare: "Da concordare",
  free: "Monta gratuita",
  ritirato: "Ritirato",
  deceased: "Deceduto",
  non_in_catalogo: "Non in monta 2026",
};

const STATUS_COLORS: Record<string, string> = {
  active: "hsl(120 50% 45%)",
  da_concordare: "hsl(40 70% 50%)",
  free: "hsl(150 45% 50%)",
  ritirato: "hsl(0 60% 50%)",
  deceased: "hsl(0 40% 45%)",
  non_in_catalogo: "hsl(210 8% 45%)",
};

export default function StallionDirectoryPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyCatalog, setOnlyCatalog] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("fee_desc");

  const { data: stallions = [], isLoading } = useQuery<StallionEntry[]>({
    queryKey: ["/api/stallions"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/stallions");
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    // Prima qui c'era un filtro fisso sulla stagione 2026, che riduceva la
    // pagina ai 153 stalloni in monta quest'anno e nascondeva gli altri 392
    // di cui conosciamo la produzione. Ora si vedono tutti e la monta 2026
    // diventa una scelta dell'utente.
    let list = stallions;
    if (onlyCatalog) {
      // Solo chi e' davvero nel catalogo 2026. Prima bastava season === "2026",
      // che lasciava dentro anche gli stalloni usciti dal catalogo con la
      // stagione vecchia ancora scritta in archivio.
      list = list.filter(s =>
        s.stud_status === "active" || s.stud_status === "da_concordare" || s.stud_status === "free"
      );
    }

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(s =>
        s.name.toUpperCase().includes(q) ||
        (s.stud_farm || "").toUpperCase().includes(q)
      );
    }

    if (countryFilter !== "all") {
      list = list.filter(s => {
        const c = s.country || s.nationality || "";
        return c === countryFilter;
      });
    }

    if (statusFilter !== "all") {
      list = list.filter(s => s.stud_status === statusFilter);
    }

    const sorted = [...list];
    switch (sortBy) {
      case "fee_desc":
        sorted.sort((a, b) => (b.stud_fee_eur ?? 0) - (a.stud_fee_eur ?? 0));
        break;
      case "fee_asc":
        sorted.sort((a, b) => (a.stud_fee_eur ?? 999999) - (b.stud_fee_eur ?? 999999));
        break;
      case "name_asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "score_desc":
        sorted.sort((a, b) => (b.final_score ?? b.avg_score ?? 0) - (a.final_score ?? a.avg_score ?? 0));
        break;
      case "figli_desc":
        sorted.sort((a, b) => (b.n_figli_totali ?? 0) - (a.n_figli_totali ?? 0));
        break;
    }
    return sorted;
  }, [stallions, search, countryFilter, statusFilter, sortBy, onlyCatalog]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    stallions.forEach(s => {
      const c = s.country || s.nationality;
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [stallions]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const withFee = filtered.filter(s => s.stud_fee_eur != null && s.stud_fee_eur > 0).length;
    const avgFee = withFee > 0
      ? Math.round(filtered.filter(s => s.stud_fee_eur && s.stud_fee_eur > 0).reduce((sum, s) => sum + (s.stud_fee_eur || 0), 0) / withFee)
      : 0;
    const maxFee = Math.max(...filtered.map(s => s.stud_fee_eur ?? 0), 0);
    const active = filtered.filter(s => s.stud_status === "active").length;
    return { total, withFee, avgFee, maxFee, active };
  }, [filtered]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1200px" }} className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 94%)", letterSpacing: "0.03em", margin: "0 0 6px" }}>
          Stalloni
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)", margin: 0 }}>
          {stats.total} stalloni con produzione valutata. Spunta "Solo monta 2026" per vedere
          soltanto quelli disponibili in Italia questa stagione. Fonti: Trot Stallions Directory e ANACT.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        {[
          { label: "Stalloni in elenco", value: stats.total, color: "hsl(210 10% 90%)" },
          { label: "Disponibili", value: stats.active, color: "hsl(120 50% 55%)" },
          { label: "Con prezzo", value: stats.withFee, color: "hsl(183 60% 55%)" },
          { label: "Monta media", value: `€${stats.avgFee.toLocaleString("it-IT")}`, color: "hsl(51 80% 60%)" },
          { label: "Monta massima", value: `€${stats.maxFee.toLocaleString("it-IT")}`, color: "hsl(0 60% 55%)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 17%)",
            borderRadius: "10px", padding: "14px 16px",
          }}>
            <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginTop: "4px" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: "240px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)",
            borderRadius: "10px", padding: "10px 14px",
          }}>
            <Search size={16} style={{ color: "hsl(210 8% 50%)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca stallone o allevamento..."
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "hsl(210 10% 88%)", fontSize: "14px", letterSpacing: "0.03em" }}
            />
            {search && <button onClick={() => setSearch("")}><X size={14} style={{ color: "hsl(210 8% 45%)" }} /></button>}
          </div>
        </div>

        {/* Country filter */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px", padding: "10px 14px",
        }}>
          <Filter size={14} style={{ color: "hsl(210 8% 45%)" }} />
          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            style={{ background: "none", border: "none", outline: "none", color: "hsl(210 10% 80%)", fontSize: "13px", cursor: "pointer" }}
          >
            <option value="all">Tutti i paesi</option>
            {countries.map(c => (
              <option key={c} value={c}>{COUNTRY_LABELS[c] || c}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px", padding: "10px 14px",
        }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ background: "none", border: "none", outline: "none", color: "hsl(210 10% 80%)", fontSize: "13px", cursor: "pointer" }}
          >
            <option value="all">Tutti gli stati</option>
            <option value="active">Disponibili</option>
            <option value="da_concordare">Da concordare</option>
            <option value="free">Monta gratuita</option>
            <option value="non_in_catalogo">Non in monta 2026</option>
          </select>
        </div>

        {/* Solo monta 2026 */}
        <label style={{
          display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
          background: onlyCatalog ? "hsl(120 40% 16%)" : "hsl(220 12% 12%)",
          border: `1px solid ${onlyCatalog ? "hsl(120 45% 32%)" : "hsl(220 10% 20%)"}`,
          borderRadius: "10px", padding: "10px 14px",
          color: onlyCatalog ? "hsl(120 55% 70%)" : "hsl(210 10% 80%)", fontSize: "13px",
        }}>
          <input
            type="checkbox"
            checked={onlyCatalog}
            onChange={e => setOnlyCatalog(e.target.checked)}
            style={{ accentColor: "hsl(120 55% 45%)", cursor: "pointer" }}
          />
          Solo monta 2026
        </label>

        {/* Sort */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px", padding: "10px 14px",
        }}>
          <ArrowUpDown size={14} style={{ color: "hsl(210 8% 45%)" }} />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            style={{ background: "none", border: "none", outline: "none", color: "hsl(210 10% 80%)", fontSize: "13px", cursor: "pointer" }}
          >
            <option value="fee_desc">Prezzo (alto → basso)</option>
            <option value="fee_asc">Prezzo (basso → alto)</option>
            <option value="name_asc">Nome (A-Z)</option>
            <option value="score_desc">Score rating</option>
            <option value="figli_desc">Numero figli</option>
          </select>
        </div>
      </div>

      {/* Stallion grid */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: "120px", borderRadius: "12px" }} />)}
        </div>
      )}

      {!isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
          {filtered.map(s => {
            const country = s.country || s.nationality;
            // Senza stato non si puo' dire che sia in monta: prima ogni
            // stallone fuori catalogo veniva mostrato come "Disponibile".
            const status = s.stud_status || null;
            const inSeason = status === "active" || status === "da_concordare" || status === "free";
            const fee = s.stud_fee_eur;
            return (
              <button
                key={s.name}
                onClick={() => navigate(`/stallion/${encodeURIComponent(s.name)}`)}
                style={{
                  background: "hsl(220 12% 10%)",
                  border: "1px solid hsl(220 10% 16%)",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s, border-color 0.15s, transform 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "hsl(220 12% 13%)";
                  e.currentTarget.style.borderColor = "hsl(183 40% 25%)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "hsl(220 12% 10%)";
                  e.currentTarget.style.borderColor = "hsl(220 10% 16%)";
                  e.currentTarget.style.transform = "none";
                }}
              >
                {/* Top row: name + grade */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "hsl(210 10% 90%)", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                      {country && (
                        <span style={{ fontSize: "11px", color: "hsl(210 8% 50%)" }}>
                          {getFlag(country)} {COUNTRY_LABELS[country] || country}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.grade && <GradeBadge grade={s.grade} size="sm" />}
                </div>

                {/* Fee + status */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {!inSeason ? (
                    <span style={{ fontSize: "12px", color: "hsl(210 8% 45%)" }}>
                      {status ? STATUS_LABELS[status] || status : "Non in monta 2026"}
                    </span>
                  ) : fee != null && fee > 0 ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      background: "hsl(51 80% 50% / 0.12)", borderRadius: "6px", padding: "3px 8px",
                    }}>
                      <Euro size={12} style={{ color: "hsl(51 80% 60%)" }} />
                      <span className="tabular" style={{ fontSize: "13px", fontWeight: 700, color: "hsl(51 80% 60%)" }}>
                        {fee.toLocaleString("it-IT")}
                      </span>
                    </div>
                  ) : fee === 0 ? (
                    <span style={{ fontSize: "12px", color: "hsl(120 50% 55%)", fontWeight: 600 }}>Gratuita</span>
                  ) : (
                    <span style={{ fontSize: "12px", color: "hsl(40 60% 50%)" }}>Da concordare</span>
                  )}
                  {inSeason && status && (
                    <span style={{
                      fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: STATUS_COLORS[status] || "hsl(210 8% 50%)",
                    }}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  )}
                </div>

                {/* Farm */}
                {s.stud_farm && (
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "hsl(210 8% 45%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <MapPin size={11} style={{ flexShrink: 0 }} />
                    <span>{s.stud_farm}</span>
                  </div>
                )}

                {/* Stats line */}
                {(s.n_figli_totali || s.final_score || s.avg_score) && (
                  <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: "hsl(210 8% 40%)", borderTop: "1px solid hsl(220 10% 14%)", paddingTop: "8px" }}>
                    {s.n_figli_totali != null && s.n_figli_totali > 0 && (
                      <span>{s.n_figli_totali} figli</span>
                    )}
                    {s.n_in_corsa != null && s.n_in_corsa > 0 && (
                      <span>· {s.n_in_corsa} in corsa</span>
                    )}
                    {s.final_score != null && (
                      <span>· score {s.final_score.toFixed(1)}</span>
                    )}
                    {s.pct_top_S != null && s.pct_top_S > 0 && (
                      <span>· {s.pct_top_S.toFixed(0)}% top-S</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "hsl(210 8% 40%)" }}>
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>Nessuno stallone trovato</div>
          <div style={{ fontSize: "13px" }}>Prova a modificare i filtri di ricerca.</div>
        </div>
      )}

      {/* Footer note */}
      <div style={{
        fontSize: "11px", color: "hsl(210 8% 38%)", marginTop: "24px", padding: "12px 16px",
        background: "hsl(220 12% 9%)", borderRadius: "8px", border: "1px solid hsl(220 10% 14%)",
      }}>
        Dati raccolti da Trot Stallions Directory (stagione 2026), ANACT Libro Stalloni,
        e schede individuali degli allevamenti. I prezzi si intendono + IVA salvo dove diversamente indicato.
        Alcuni stalloni hanno tariffe in USD convertite a un cambio approssimato.
      </div>
    </div>
  );
}
