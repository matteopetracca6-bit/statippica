import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { Search, X, ChevronLeft, ChevronRight, Filter } from "lucide-react";

/**
 * SEZIONE FATTRICI.
 *
 * Una fattrice NON e' valutata sulla propria carriera: molte hanno smesso di
 * correre da vent'anni e per molte non abbiamo nemmeno i totali. Il voto viene
 * dalla PROGENIE (dam_rating_stats, FASE 3c della pipeline notturna). La
 * carriera propria, quando la conosciamo, e' mostrata come contesto.
 */

interface MareRow {
  dam: string;
  n_figli_totali: number;
  n_valutati: number;
  n_in_corsa: number;
  final_score: number;
  grade: string;
  n_SSS: number;
  n_SS: number;
  n_S: number;
  pct_top_S: number;
  avg_earnings: number;
  own_races: number | null;
  own_wins: number | null;
  own_earnings: number | null;
  own_record: string | null;
  own_grade: string | null;
}

interface MaresResponse {
  total: number;
  page: number;
  limit: number;
  rows: MareRow[];
  grades: { grade: string; cnt: number }[];
}

const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

const SORTS: { key: string; label: string }[] = [
  { key: "final_score", label: "Voto" },
  { key: "n_figli", label: "Figli valutati" },
  { key: "n_in_corsa", label: "Figli in attività" },
  { key: "pct_top_S", label: "% figli di vertice" },
  { key: "avg_earnings", label: "Guadagno medio figli" },
  { key: "dam", label: "Nome" },
];

function eur(v: number | null | undefined): string {
  if (!v) return "—";
  return "€ " + Math.round(v).toLocaleString("it-IT");
}

export default function MaresPage() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  const [minKids, setMinKids] = useState(0);
  const [sort, setSort] = useState("final_score");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({
    page: String(page),
    limit: "30",
    sort,
    dir: sort === "dam" ? "asc" : "desc",
  });
  if (search) params.set("search", search);
  if (grade !== "all") params.set("grade", grade);
  if (minKids > 0) params.set("min_kids", String(minKids));

  const { data, isLoading } = useQuery<MaresResponse>({
    queryKey: ["/api/mares", params.toString()],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/mares?${params.toString()}`);
      return r.json();
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));

  const submitSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const cell: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
    color: "hsl(210 10% 88%)",
    whiteSpace: "nowrap",
  };
  const head: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "hsl(210 8% 58%)",
    textAlign: "left",
    whiteSpace: "nowrap",
    borderBottom: "1px solid hsl(220 10% 16%)",
  };

  return (
    <div className="page-shell">
      <div style={{ marginBottom: "6px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: 0 }}>
          Fattrici
        </h1>
      </div>
      <p style={{ fontSize: "13px", color: "hsl(210 8% 60%)", margin: "0 0 20px", maxWidth: "760px", lineHeight: 1.55 }}>
        Il voto di una fattrice viene dalla progenie, non dalla sua carriera: quello che conta è
        quanto valgono i figli che ha prodotto. La sua carriera, quando la conosciamo, è mostrata
        nella scheda come contesto di lettura.
      </p>

      {/* Filtri */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "18px" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "340px" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "hsl(210 8% 50%)" }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submitSearch(); }}
            placeholder="Cerca fattrice"
            style={{
              width: "100%",
              padding: "9px 30px 9px 32px",
              borderRadius: "8px",
              border: "1px solid hsl(220 10% 18%)",
              background: "hsl(220 12% 10%)",
              color: "hsl(210 10% 90%)",
              fontSize: "13px",
              outline: "none",
            }}
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(210 8% 50%)", padding: 0, display: "flex" }}
              aria-label="Cancella ricerca"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          value={grade}
          onChange={e => { setGrade(e.target.value); setPage(1); }}
          style={{ padding: "9px 10px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: "hsl(210 10% 90%)", fontSize: "13px" }}
        >
          <option value="all">Tutti i voti</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select
          value={minKids}
          onChange={e => { setMinKids(parseInt(e.target.value)); setPage(1); }}
          style={{ padding: "9px 10px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: "hsl(210 10% 90%)", fontSize: "13px" }}
        >
          <option value={0}>Figli valutati: tutti</option>
          <option value={2}>Almeno 2 figli</option>
          <option value={3}>Almeno 3 figli</option>
          <option value={5}>Almeno 5 figli</option>
        </select>

        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}
          style={{ padding: "9px 10px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: "hsl(210 10% 90%)", fontSize: "13px" }}
        >
          {SORTS.map(s => <option key={s.key} value={s.key}>Ordina per: {s.label}</option>)}
        </select>

        <span style={{ fontSize: "12px", color: "hsl(210 8% 55%)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter size={13} />
          {total.toLocaleString("it-IT")} fattrici
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>
          Caricamento…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>
          Nessuna fattrice corrisponde ai filtri scelti.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={head}>Fattrice</th>
                <th style={head}>Voto</th>
                <th style={{ ...head, textAlign: "right" }}>Punti</th>
                <th style={{ ...head, textAlign: "right" }}>Figli valutati</th>
                <th style={{ ...head, textAlign: "right" }}>In attività</th>
                <th style={{ ...head, textAlign: "right" }}>Di vertice</th>
                <th style={{ ...head, textAlign: "right" }}>Guadagno medio figli</th>
                <th style={{ ...head, textAlign: "right" }}>Sua carriera</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr
                  key={m.dam}
                  onClick={() => navigate(`/fattrice/${encodeURIComponent(m.dam)}`)}
                  style={{
                    cursor: "pointer",
                    background: i % 2 ? "hsl(220 12% 10%)" : "transparent",
                    borderTop: "1px solid hsl(220 10% 13%)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(220 12% 14%)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 ? "hsl(220 12% 10%)" : "transparent"; }}
                >
                  <td style={{ ...cell, fontWeight: 600 }}>{m.dam}</td>
                  <td style={cell}><GradeBadge grade={m.grade} /></td>
                  <td style={{ ...cell, textAlign: "right" }}>{m.final_score?.toFixed(1)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    {m.n_valutati}
                    {m.n_figli_totali > m.n_valutati && (
                      <span style={{ color: "hsl(210 8% 48%)" }}> / {m.n_figli_totali}</span>
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>{m.n_in_corsa || "—"}</td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    {m.n_SSS + m.n_SS + m.n_S > 0
                      ? `${m.n_SSS + m.n_SS + m.n_S} (${m.pct_top_S?.toFixed(0)}%)`
                      : "—"}
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>{eur(m.avg_earnings)}</td>
                  <td style={{ ...cell, textAlign: "right", color: "hsl(210 8% 62%)" }}>
                    {m.own_races
                      ? `${m.own_races} corse · ${eur(m.own_earnings)}`
                      : "non disponibile"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "18px" }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "7px 12px", borderRadius: "8px",
              border: "1px solid hsl(220 10% 18%)",
              background: "hsl(220 12% 11%)",
              color: page <= 1 ? "hsl(210 8% 38%)" : "hsl(210 10% 88%)",
              fontSize: "12px", cursor: page <= 1 ? "default" : "pointer",
            }}
          >
            <ChevronLeft size={14} /> Precedenti
          </button>
          <span style={{ fontSize: "12px", color: "hsl(210 8% 58%)" }}>
            Pagina {page} di {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "7px 12px", borderRadius: "8px",
              border: "1px solid hsl(220 10% 18%)",
              background: "hsl(220 12% 11%)",
              color: page >= totalPages ? "hsl(210 8% 38%)" : "hsl(210 10% 88%)",
              fontSize: "12px", cursor: page >= totalPages ? "default" : "pointer",
            }}
          >
            Successive <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
