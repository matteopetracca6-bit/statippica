import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { Search, X, Filter, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

/**
 * SEZIONE QUALIFICHE.
 *
 * La prova di qualifica e' il primo tempo ufficiale di un cavallo: la sostiene
 * da giovane, prima di poter essere iscritto alle corse. E' quindi l'unico
 * segnale disponibile su un soggetto che non ha ancora una carriera, e per
 * molti di questi cavalli l'archivio corse non ha ancora nulla.
 *
 * I dati arrivano dalla seconda fonte (VendoPuledri) e vengono aggiornati
 * dalla fase 2f della pipeline notturna.
 */

interface QualRow {
  horse_name: string;
  qual_date: string;
  track: string | null;
  time_raw: string | null;
  time_km: number | null;
  sire: string | null;
  dam: string | null;
  maternal_gsire: string | null;
  trainer: string | null;
  owner: string | null;
  breeder: string | null;
  known_name: string | null;
  birth_year: number | null;
  score: number | null;
  grade: string | null;
}

interface QualResponse {
  rows: QualRow[];
  total: number;
  limit: number;
  offset: number;
  years: string[];
  tracks: { track: string; n: number }[];
}

interface QualStats {
  n_prove: number;
  n_cavalli: number;
  n_stalloni: number;
  n_nuovi: number;
  dal: string;
  al: string;
  tempo_medio: number | null;
  tempo_migliore: number | null;
  top_sires: { sire: string; n_figli: number; tempo_medio: number }[];
}

const PAGE = 50;

function itDate(d: string): string {
  if (!d || d.length !== 10) return d || "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

function fmtTime(row: { time_raw: string | null; time_km: number | null }): string {
  if (row.time_km != null) return `1.${row.time_km.toFixed(1).replace(".", ".")}`;
  return row.time_raw || "—";
}

export default function QualifichePage() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [track, setTrack] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<"time" | "date">("time");
  const [page, setPage] = useState(0);

  const params = new URLSearchParams({
    limit: String(PAGE),
    offset: String(page * PAGE),
    sort,
  });
  if (q) params.set("q", q);
  if (year) params.set("year", year);
  if (track) params.set("track", track);
  if (onlyNew) params.set("only_new", "1");

  const { data, isLoading } = useQuery<QualResponse>({
    queryKey: ["/api/qualifiche", params.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/qualifiche?${params.toString()}`)).json(),
  });

  const { data: stats } = useQuery<QualStats | null>({
    queryKey: ["/api/qualifiche/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/qualifiche/stats")).json(),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

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
  const selectStyle: React.CSSProperties = {
    padding: "9px 10px",
    borderRadius: "8px",
    border: "1px solid hsl(220 10% 18%)",
    background: "hsl(220 12% 10%)",
    color: "hsl(210 10% 90%)",
    fontSize: "13px",
  };

  return (
    <div className="page-shell">
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: "0 0 6px" }}>
        Qualifiche
      </h1>
      <p style={{ fontSize: "13px", color: "hsl(210 8% 60%)", margin: "0 0 20px", maxWidth: "820px", lineHeight: 1.55 }}>
        La prova di qualifica è il primo tempo ufficiale di un cavallo, sostenuta da giovane prima
        di poter correre. Per molti di questi soggetti è l'unica informazione esistente: non hanno
        ancora una carriera e quindi nemmeno un voto. Il tempo è al chilometro, quindi più basso è
        meglio è.
      </p>

      {/* Riepilogo */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Prove", value: stats.n_prove?.toLocaleString("it-IT") },
            { label: "Cavalli", value: stats.n_cavalli?.toLocaleString("it-IT") },
            { label: "Mai visti in corsa", value: stats.n_nuovi?.toLocaleString("it-IT") },
            { label: "Stalloni padri", value: stats.n_stalloni?.toLocaleString("it-IT") },
            { label: "Tempo medio", value: stats.tempo_medio != null ? `1.${stats.tempo_medio.toFixed(1)}` : "—" },
            { label: "Miglior tempo", value: stats.tempo_migliore != null ? `1.${stats.tempo_migliore.toFixed(1)}` : "—" },
          ].map(k => (
            <div key={k.label} style={{ border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)", padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "hsl(210 8% 55%)", marginBottom: "4px" }}>
                {k.label}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)" }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtri */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "18px" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "340px" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "hsl(210 8% 50%)" }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setQ(searchInput.trim()); setPage(0); } }}
            placeholder="Cerca un cavallo"
            style={{
              width: "100%", padding: "9px 30px 9px 32px", borderRadius: "8px",
              border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)",
              color: "hsl(210 10% 90%)", fontSize: "13px", outline: "none",
            }}
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setQ(""); setPage(0); }}
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(210 8% 50%)", padding: 0, display: "flex" }}
              aria-label="Cancella ricerca"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select value={year} onChange={e => { setYear(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="">Tutti gli anni</option>
          {(data?.years ?? []).map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={track} onChange={e => { setTrack(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="">Tutti gli ippodromi</option>
          {(data?.tracks ?? []).map(t => (
            <option key={t.track} value={t.track}>{t.track} ({t.n})</option>
          ))}
        </select>

        <select value={sort} onChange={e => { setSort(e.target.value as "time" | "date"); setPage(0); }} style={selectStyle}>
          <option value="time">Ordina per: tempo migliore</option>
          <option value="date">Ordina per: data più recente</option>
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", color: "hsl(210 10% 82%)", cursor: "pointer", padding: "9px 10px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)" }}>
          <input type="checkbox" checked={onlyNew} onChange={e => { setOnlyNew(e.target.checked); setPage(0); }} style={{ cursor: "pointer" }} />
          Solo cavalli non ancora in archivio
        </label>

        <span style={{ fontSize: "12px", color: "hsl(210 8% 55%)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter size={13} />
          {total.toLocaleString("it-IT")} prove
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>Caricamento…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>
          Nessuna prova corrisponde ai filtri scelti.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={head}>Cavallo</th>
                <th style={{ ...head, textAlign: "right" }}>Tempo</th>
                <th style={head}>Data</th>
                <th style={head}>Ippodromo</th>
                <th style={head}>Padre</th>
                <th style={head}>Madre</th>
                <th style={head}>Allenatore</th>
                <th style={head}>Allevamento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.horse_name}-${r.qual_date}`}
                  style={{ borderTop: i === 0 ? "none" : "1px solid hsl(220 10% 14%)" }}
                >
                  <td style={cell}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {r.known_name && r.birth_year ? (
                        <span
                          onClick={() => navigate(`/horse/${encodeURIComponent(r.known_name!)}/${r.birth_year}`)}
                          style={{ color: "hsl(183 80% 60%)", cursor: "pointer", fontWeight: 600 }}
                        >
                          {r.horse_name}
                        </span>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{r.horse_name}</span>
                      )}
                      {r.grade && <GradeBadge grade={r.grade} />}
                      {!r.known_name && (
                        <span
                          title="Questo cavallo non è ancora nel nostro archivio corse"
                          style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700, color: "hsl(280 60% 72%)", border: "1px solid hsl(280 40% 32%)", borderRadius: "5px", padding: "1px 5px" }}
                        >
                          <Sparkles size={9} /> NUOVO
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {fmtTime(r)}
                  </td>
                  <td style={cell}>{itDate(r.qual_date)}</td>
                  <td style={cell}>{r.track || "—"}</td>
                  <td style={cell}>
                    {r.sire ? (
                      <span
                        onClick={() => navigate(`/stallion/${encodeURIComponent(r.sire!)}`)}
                        style={{ color: "hsl(51 80% 62%)", cursor: "pointer" }}
                      >
                        {r.sire}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={cell}>{r.dam || "—"}</td>
                  <td style={{ ...cell, color: "hsl(210 8% 68%)" }}>{r.trainer || "—"}</td>
                  <td style={{ ...cell, color: "hsl(210 8% 68%)", whiteSpace: "normal", maxWidth: "220px" }}>
                    {r.breeder || "—"}
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
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: page === 0 ? "hsl(210 8% 40%)" : "hsl(210 10% 88%)", fontSize: "13px", cursor: page === 0 ? "default" : "pointer" }}
          >
            <ChevronLeft size={14} /> Precedente
          </button>
          <span style={{ fontSize: "13px", color: "hsl(210 8% 60%)" }}>
            Pagina {page + 1} di {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: page >= totalPages - 1 ? "hsl(210 8% 40%)" : "hsl(210 10% 88%)", fontSize: "13px", cursor: page >= totalPages - 1 ? "default" : "pointer" }}
          >
            Successiva <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Stalloni migliori in qualifica */}
      {stats?.top_sires && stats.top_sires.length > 0 && (
        <div style={{ marginTop: "34px" }}>
          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "hsl(210 10% 92%)", margin: "0 0 4px" }}>
            Stalloni con i figli più veloci in qualifica
          </h2>
          <p style={{ fontSize: "12px", color: "hsl(210 8% 58%)", margin: "0 0 12px" }}>
            Solo stalloni con almeno cinque figli qualificati. È un indizio precoce, non un voto:
            la qualifica si corre in condizioni molto diverse da una corsa vera.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "10px" }}>
            {stats.top_sires.map((s, i) => (
              <div
                key={s.sire}
                onClick={() => navigate(`/stallion/${encodeURIComponent(s.sire)}`)}
                style={{ border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)", padding: "11px 13px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(51 80% 62%)" }}>
                    {i + 1}. {s.sire}
                  </span>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "hsl(210 10% 92%)", fontVariantNumeric: "tabular-nums" }}>
                    1.{s.tempo_medio.toFixed(1)}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 55%)", marginTop: "3px" }}>
                  {s.n_figli} figli qualificati
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: "11px", color: "hsl(210 8% 45%)", marginTop: "28px", lineHeight: 1.6 }}>
        Fonte dei dati di qualifica: VendoPuledri. Aggiornati ogni notte.
      </p>
      <CollegamentiCorrelati voci={[
        { href: "/leaderboard", titolo: "Leaderboard", descrizione: "I cavalli che hanno gia' una carriera in corso." },
        { href: "/advisor", titolo: "Advisor", descrizione: "Stima quanto vale un puledro prima che debutti." },
        { href: "/trend", titolo: "Trend", descrizione: "Come si distribuiscono i voti per anno di nascita." },
      ]} />
    </div>
  );
}
