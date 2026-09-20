import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { Search, X, Filter, ChevronLeft, ChevronRight, ArrowLeft, MapPin } from "lucide-react";

/**
 * SEZIONE ALLEVATORI.
 *
 * Da non confondere con la sezione Allevamenti, che elenca le stazioni di
 * monta dove stanno gli stalloni. Qui c'e' chi ha materialmente allevato i
 * cavalli: il dato arriva dalla seconda fonte (VendoPuledri), che lo riporta
 * per ogni soggetto, mentre l'archivio corse non lo contiene.
 *
 * La qualita' di un allevatore si legge sul voto medio dei cavalli che ha
 * prodotto, tenendo presente che sono valutati solo quelli che hanno corso.
 */

interface BreederRow {
  breeder_name: string;
  n_cavalli: number;
  n_valutati: number;
  score_medio: number | null;
  score_migliore: number | null;
  n_top: number;
}

interface BreedersResponse {
  rows: BreederRow[];
  total: number;
}

interface BreederDetail {
  name: string;
  n_cavalli: number;
  contact: {
    city: string | null;
    province: string | null;
    // I recapiti restano nell'archivio: il sito non li mostra.
  } | null;
  horses: {
    horse_name: string;
    birth_year: number | null;
    sex: string | null;
    score: number | null;
    grade: string | null;
    career_races: number | null;
    career_earnings: number | null;
  }[];
}

const PAGE = 50;

function eur(v: number | null | undefined): string {
  if (!v) return "—";
  return "€ " + Math.round(v).toLocaleString("it-IT");
}

export default function BreedersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [minHorses, setMinHorses] = useState(2);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const params = new URLSearchParams({
    limit: String(PAGE),
    offset: String(page * PAGE),
    min_horses: String(minHorses),
  });
  if (q) params.set("q", q);

  const { data, isLoading } = useQuery<BreedersResponse>({
    queryKey: ["/api/allevatori", params.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/allevatori?${params.toString()}`)).json(),
    enabled: !selected,
  });

  const { data: detail } = useQuery<BreederDetail | null>({
    queryKey: ["/api/allevatore", selected],
    queryFn: async () => (await apiRequest("GET", `/api/allevatore/${encodeURIComponent(selected!)}`)).json(),
    enabled: !!selected,
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

  // ── Scheda del singolo allevatore ──
  if (selected) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 20px 48px" }}>
        <button
          onClick={() => setSelected(null)}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "hsl(183 80% 60%)", fontSize: "13px", cursor: "pointer", padding: 0, marginBottom: "14px" }}
        >
          <ArrowLeft size={14} /> Tutti gli allevatori
        </button>

        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: "0 0 6px" }}>
          {selected}
        </h1>

        {detail?.contact && detail.contact.city && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "13px", color: "hsl(210 8% 65%)", marginBottom: "16px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <MapPin size={13} /> {detail.contact.city}
              {detail.contact.province ? ` (${detail.contact.province})` : ""}
            </span>
          </div>
        )}

        <p style={{ fontSize: "13px", color: "hsl(210 8% 60%)", margin: "0 0 18px" }}>
          {detail?.n_cavalli ?? 0} cavalli allevati presenti nei nostri dati.
        </p>

        {!detail ? (
          <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>Caricamento…</div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={head}>Cavallo</th>
                  <th style={head}>Nato</th>
                  <th style={head}>Voto</th>
                  <th style={{ ...head, textAlign: "right" }}>Punti</th>
                  <th style={{ ...head, textAlign: "right" }}>Corse</th>
                  <th style={{ ...head, textAlign: "right" }}>Guadagni</th>
                </tr>
              </thead>
              <tbody>
                {detail.horses.map((h, i) => (
                  <tr key={h.horse_name} style={{ borderTop: i === 0 ? "none" : "1px solid hsl(220 10% 14%)" }}>
                    <td style={cell}>
                      {h.birth_year ? (
                        <span
                          onClick={() => navigate(`/horse/${encodeURIComponent(h.horse_name)}/${h.birth_year}`)}
                          style={{ color: "hsl(183 80% 60%)", cursor: "pointer", fontWeight: 600 }}
                        >
                          {h.horse_name}
                        </span>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{h.horse_name}</span>
                      )}
                    </td>
                    <td style={cell}>{h.birth_year ?? "—"}</td>
                    <td style={cell}>{h.grade ? <GradeBadge grade={h.grade} /> : "—"}</td>
                    <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {h.score != null ? h.score.toFixed(1) : "—"}
                    </td>
                    <td style={{ ...cell, textAlign: "right" }}>{h.career_races ?? "—"}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{eur(h.career_earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Elenco ──
  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: embedded ? "0" : "24px 20px 48px" }}>
      {!embedded && (
        <>
          <h1 style={{ fontSize: "28px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: "0 0 6px" }}>
            Allevatori
          </h1>
          <p style={{ fontSize: "13px", color: "hsl(210 8% 60%)", margin: "0 0 20px", maxWidth: "820px", lineHeight: 1.55 }}>
            Chi ha materialmente allevato i cavalli, con la qualità media dei soggetti prodotti. È cosa
            diversa dalla sezione Allevamenti, che raccoglie le stazioni dove stanno gli stalloni. Il
            voto medio considera solo i cavalli che hanno già corso abbastanza da essere valutati.
          </p>
        </>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "18px" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "340px" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "hsl(210 8% 50%)" }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setQ(searchInput.trim()); setPage(0); } }}
            placeholder="Cerca un allevatore"
            style={{ width: "100%", padding: "9px 30px 9px 32px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: "hsl(210 10% 90%)", fontSize: "13px", outline: "none" }}
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

        <select
          value={minHorses}
          onChange={e => { setMinHorses(parseInt(e.target.value)); setPage(0); }}
          style={{ padding: "9px 10px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: "hsl(210 10% 90%)", fontSize: "13px" }}
        >
          <option value={1}>Cavalli allevati: tutti</option>
          <option value={2}>Almeno 2 cavalli</option>
          <option value={5}>Almeno 5 cavalli</option>
          <option value={10}>Almeno 10 cavalli</option>
        </select>

        <span style={{ fontSize: "12px", color: "hsl(210 8% 55%)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter size={13} />
          {total.toLocaleString("it-IT")} allevatori
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>Caricamento…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>
          Nessun allevatore corrisponde ai filtri scelti.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={head}>Allevatore</th>
                <th style={{ ...head, textAlign: "right" }}>Cavalli</th>
                <th style={{ ...head, textAlign: "right" }}>Valutati</th>
                <th style={{ ...head, textAlign: "right" }}>Voto medio</th>
                <th style={{ ...head, textAlign: "right" }}>Miglior voto</th>
                <th style={{ ...head, textAlign: "right" }}>Di vertice</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.breeder_name}
                  onClick={() => setSelected(r.breeder_name)}
                  style={{ borderTop: i === 0 ? "none" : "1px solid hsl(220 10% 14%)", cursor: "pointer" }}
                >
                  <td style={{ ...cell, whiteSpace: "normal", maxWidth: "380px" }}>
                    <span style={{ color: "hsl(183 80% 60%)", fontWeight: 600 }}>{r.breeder_name}</span>
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.n_cavalli}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.n_valutati}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {r.score_medio != null ? r.score_medio.toFixed(1) : "—"}
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.score_migliore != null ? r.score_migliore.toFixed(1) : "—"}
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.n_top || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "18px" }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: page === 0 ? "hsl(210 8% 40%)" : "hsl(210 10% 88%)", fontSize: "13px", cursor: page === 0 ? "default" : "pointer" }}
          >
            <ChevronLeft size={14} /> Precedente
          </button>
          <span style={{ fontSize: "13px", color: "hsl(210 8% 60%)" }}>Pagina {page + 1} di {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px", borderRadius: "8px", border: "1px solid hsl(220 10% 18%)", background: "hsl(220 12% 10%)", color: page >= totalPages - 1 ? "hsl(210 8% 40%)" : "hsl(210 10% 88%)", fontSize: "13px", cursor: page >= totalPages - 1 ? "default" : "pointer" }}
          >
            Successiva <ChevronRight size={14} />
          </button>
        </div>
      )}

      <p style={{ fontSize: "11px", color: "hsl(210 8% 45%)", marginTop: "28px", lineHeight: 1.6 }}>
        Fonte del dato di allevamento: VendoPuledri. Aggiornato ogni notte.
      </p>
    </div>
  );
}
