import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getFlag } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import { ChevronLeft, ChevronRight, SortAsc } from "lucide-react";
import { formatRecord } from "@/lib/record";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

interface LeaderboardRow {
  name: string;
  birth_year: number;
  sire: string;
  grade: string;
  grade_annata?: string | null;
  pos_annata?: number | null;
  tot_annata?: number | null;
  score: number;
  earn_percentile: number;
  time_percentile: number;
  sire_percentile: number;
  career_races: number;
  career_wins: number;
  career_earnings: number;
  record_career: string;
  win_rate: number;
}

interface LeaderboardData {
  total: number;
  page: number;
  limit: number;
  rows: LeaderboardRow[];
}

const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

export default function LeaderboardPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] ?? "");
  
  const [year, setYear] = useState<string>(urlParams.get("year") ?? "");
  const [grade, setGrade] = useState<string>("");
  const [sireFilter, setSireFilter] = useState<string>("");
  const [mode, setMode] = useState<string>("performance");
  const [sort, setSort] = useState<string>("score");
  // Un cavallo con una o due corse puo' avere un voto altissimo per caso:
  // questo interruttore tiene in classifica solo chi ha una carriera vera.
  const [solidOnly, setSolidOnly] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 25;
  const MIN_RACES_SOLID = 4;

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/leaderboard/years", mode],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/leaderboard/years?mode=${mode}`);
      return r.json();
    },
  });

  // Dove ha corso. Filtra soltanto, non tocca il voto.
  const [dove, setDove] = useState<string>("");

  // Quale delle due letture del voto mostrare. "globale" confronta con tutti,
  // "annata" solo con i nati nello stesso anno. Stesso punteggio, due letture:
  // il confronto generale penalizza i giovani, che hanno avuto meno anni per
  // correre - fra i nati nel 2023 il 63% sale di lettera guardandoli fra pari.
  const [voto, setVoto] = useState<string>("globale");

  useEffect(() => { setPage(1); }, [year, grade, sireFilter, mode, sort, solidOnly, dove, voto]);

  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (grade) params.set("grade", grade);
  if (sireFilter) params.set("sire", sireFilter);
  params.set("mode", mode);
  params.set("sort", sort);
  params.set("page", String(page));
  params.set("limit", String(LIMIT));
  if (solidOnly) params.set("min_races", String(MIN_RACES_SOLID));
  if (dove) params.set("dove", dove);
  if (voto === "annata") params.set("voto", "annata");

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard", year, grade, sireFilter, mode, sort, page, solidOnly, dove, voto],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/leaderboard?${params}`);
      return r.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const filterStyle = {
    background: "hsl(220 12% 12%)",
    border: "1px solid hsl(220 10% 20%)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "hsl(210 10% 80%)",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
  } as React.CSSProperties;

  return (
    <div className="page-shell">
      {/* Header */}
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>Leaderboard</h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 48%)" }}>
          {data?.total != null ? `${data.total.toLocaleString("it-IT")} cavalli` : "—"} · {
            mode === "performance" ? "in gara"
              : mode === "storico" ? "cavalli storici, confrontati fra loro"
                : "solo pedigree"}
        </p>
        {/* Tre classifiche, tre popolazioni. Senza dirlo, un utente crede che
            il 93 di Varenne e il 90 di Cobra Killer Gar siano la stessa cosa. */}
        {mode === "storico" && (
          <p style={{ fontSize: "12px", color: "hsl(210 8% 48%)", marginTop: "8px", lineHeight: 1.6, maxWidth: "78ch" }}>
            Cavalli di cui l&apos;archivio conosce i totali di carriera ma non le singole gare,
            perche&apos; per gli anni in cui hanno corso non esistono online. Sono confrontati solo
            fra loro, su guadagni, record e percentuale di vittorie: i loro voti non si possono
            paragonare a quelli dei cavalli in gara oggi.
          </p>
        )}
        {/* Il voto d'annata non e' un voto nuovo: e' lo stesso punteggio letto
            contro i coetanei. Senza spiegarlo, un cavallo che passa da B a SS
            sembrerebbe essere stato promosso. */}
        {mode === "performance" && voto === "annata" && (
          <p style={{ fontSize: "12px", color: "hsl(210 8% 48%)", marginTop: "8px", lineHeight: 1.6, maxWidth: "78ch" }}>
            Ogni cavallo e&apos; confrontato solo con i nati nel suo stesso anno, che hanno avuto
            lo stesso tempo per correre. Il punteggio non cambia, cambia con chi viene paragonato:
            nel confronto generale i giovani sono penalizzati perche&apos; hanno meno stagioni alle
            spalle. Fra i nati nel 2023, il 63% sale di lettera guardandoli fra coetanei.
          </p>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", alignItems: "center" }}>
        {/* Mode */}
        <div style={{ display: "flex", background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)", borderRadius: "8px", overflow: "hidden" }}>
          {[{ v: "performance", l: "In gara" }, { v: "pedigree", l: "Pedigree" }, { v: "storico", l: "Storici" }].map(({ v, l }) => (
            <button key={v} onClick={() => setMode(v)} style={{
              padding: "8px 14px", fontSize: "13px", background: mode === v ? "hsl(183 100% 38% / 0.2)" : "none",
              color: mode === v ? "hsl(183 80% 65%)" : "hsl(210 8% 55%)",
              border: "none", cursor: "pointer", fontWeight: mode === v ? 600 : 400, transition: "all 0.15s",
            }}>{l}</button>
          ))}
        </div>

        {/* Year */}
        <select value={year} onChange={e => setYear(e.target.value)} style={filterStyle} data-testid="select-year">
          <option value="">Tutti gli anni</option>
          {years?.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Grade */}
        <select value={grade} onChange={e => setGrade(e.target.value)} style={filterStyle} data-testid="select-grade">
          <option value="">Tutti i voti</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* Le due letture del voto. Solo per i cavalli in gara: gli storici
            non hanno un voto d'annata, e il pedigree non ha annate su cui
            confrontare. */}
        {mode === "performance" && (
          <select value={voto} onChange={e => setVoto(e.target.value)} style={filterStyle} data-testid="select-voto">
            <option value="globale">Voto: contro tutti</option>
            <option value="annata">Voto: nella sua annata</option>
          </select>
        )}

        {/* Dove ha corso. Non compare per gli storici: di loro l'archivio ha
            solo i totali di carriera, senza le singole gare, quindi non si sa
            dove le abbiano corse. */}
        {mode !== "storico" && (
          <select value={dove} onChange={e => setDove(e.target.value)} style={filterStyle} data-testid="select-dove">
            <option value="">Italia ed estero</option>
            <option value="italia">Solo carriera in Italia</option>
            <option value="estero">Ha corso anche all&apos;estero</option>
            <option value="solo_estero">Solo carriera all&apos;estero</option>
          </select>
        )}

        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)} style={filterStyle} data-testid="select-sort">
          <option value="score">Ordina: Score</option>
          <option value="earnings">Ordina: Guadagni</option>
        </select>

        {/* Sire filter */}
        <input
          value={sireFilter}
          onChange={e => setSireFilter(e.target.value.toUpperCase())}
          placeholder="Filtra per stallone..."
          data-testid="input-sire-filter"
          style={{ ...filterStyle, minWidth: "180px" }}
        />

        {/* Solo carriere con abbastanza corse */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12px",
          color: solidOnly ? "hsl(183 70% 60%)" : "hsl(210 8% 55%)", cursor: "pointer", userSelect: "none",
        }} data-testid="toggle-solid-only">
          <input
            type="checkbox"
            checked={solidOnly}
            onChange={e => setSolidOnly(e.target.checked)}
            style={{ accentColor: "hsl(183 70% 50%)", width: "14px", height: "14px", cursor: "pointer" }}
          />
          Almeno {MIN_RACES_SOLID} corse
        </label>

        {(year || grade || sireFilter || solidOnly) && (
          <button onClick={() => { setYear(""); setGrade(""); setSireFilter(""); setSolidOnly(false); }} style={{
            fontSize: "12px", color: "hsl(0 62% 55%)", background: "none", border: "none", cursor: "pointer",
          }}>
            Reset filtri
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", overflow: "hidden",
      }}>
        {isLoading ? (
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: "40px", borderRadius: "6px" }} />
            ))}
          </div>
        ) : (
          /* L'intestazione era dichiarata "appiccicata in alto" ma non lo
             era mai: un contenitore con scorrimento orizzontale diventa
             lui il riferimento, e non scorrendo in verticale la riga dei
             titoli restava semplicemente in cima alla tabella e usciva
             dallo schermo. Dando a questo contenitore anche un'altezza
             massima e lo scorrimento verticale, la riga dei titoli resta
             davvero visibile mentre si scorrono i cavalli. */
          <div style={{ overflow: "auto", maxHeight: "calc(100dvh - 300px)", minHeight: "320px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "hsl(220 12% 9%)", zIndex: 2 }}>
                <tr>
                  {["#", "Cavallo", "Anno", "Stallone", "Voto", "Score", "Guadagni", "Record", "Win%"].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 12px",
                      fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      borderBottom: "1px solid hsl(220 10% 16%)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((row, i) => {
                  const rank = (page - 1) * LIMIT + i + 1;
                  return (
                    <tr
                      key={`${row.name}-${row.birth_year}`}
                      data-testid={`row-horse-${rank}`}
                      style={{ borderBottom: "1px solid hsl(220 10% 13%)", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 13%)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 38%)", minWidth: "36px" }}>
                        {rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : rank}
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "160px" }}>
                        <Link href={`/horse/${encodeURIComponent(row.name)}/${row.birth_year}`}>
                          <a style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 85%)", textDecoration: "none", letterSpacing: "0.03em", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ fontSize: "15px" }}>{getFlag(row.country, row.name)}</span>
                            {row.name}
                          </a>
                        </Link>
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 48%)" }}>{row.birth_year}</td>
                      <td style={{ padding: "10px 12px", minWidth: "120px" }}>
                        {row.sire ? (
                          <Link href={`/stallion/${encodeURIComponent(row.sire)}`}>
                            <a style={{ fontSize: "12px", color: "hsl(183 70% 55%)", textDecoration: "none" }}>{row.sire}</a>
                          </Link>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {/* Con la lettura per annata si mostra quella lettera,
                            e sotto si tiene la lettera generale: sono lo
                            stesso punteggio, e nascondere l'altra farebbe
                            sembrare che il voto sia cambiato. */}
                        <GradeBadge
                          grade={(voto === "annata" ? row.grade_annata : row.grade) ?? row.grade ?? "N/A"}
                          size="sm"
                        />
                        {voto === "annata" && row.grade_annata && row.grade_annata !== row.grade && (
                          <span
                            title={`Contro tutti i cavalli questo cavallo e' ${row.grade}`}
                            style={{ marginLeft: 6, fontSize: 10, color: "var(--muted)" }}
                          >
                            ({row.grade} in generale)
                          </span>
                        )}
                        {(row.career_races ?? 0) < MIN_RACES_SOLID && (
                          <span
                            title={`Voto calcolato su ${row.career_races ?? 0} corse: poco affidabile`}
                            style={{
                              marginLeft: "6px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.03em",
                              color: "hsl(38 85% 62%)", background: "hsl(38 60% 18%)",
                              border: "1px solid hsl(38 50% 28%)", borderRadius: "5px", padding: "2px 5px",
                              verticalAlign: "middle",
                            }}
                          >
                            {row.career_races ?? 0} corse
                          </span>
                        )}
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 58%)" }}>{row.score?.toFixed(1) ?? "—"}</td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(51 80% 58%)", minWidth: "90px" }}>
                        {row.career_earnings != null ? `€${row.career_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(183 60% 55%)" }}>
                        {formatRecord(row.record_career)}
                      </td>
                      <td className="tabular" style={{ padding: "10px 12px", fontSize: "12px", color: "hsl(210 8% 48%)" }}>
                        {row.win_rate != null ? `${row.win_rate.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", borderTop: "1px solid hsl(220 10% 16%)",
          }}>
            <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 8% 48%)" }}>
              Pagina {page} / {totalPages} · {data?.total.toLocaleString("it-IT")} totali
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "6px 12px", borderRadius: "7px", fontSize: "12px",
                  background: page === 1 ? "none" : "hsl(220 10% 16%)",
                  border: "1px solid hsl(220 10% 20%)",
                  color: page === 1 ? "hsl(210 8% 35%)" : "hsl(210 8% 65%)",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }}
              >
                <ChevronLeft size={14} /> Prec
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "6px 12px", borderRadius: "7px", fontSize: "12px",
                  background: page === totalPages ? "none" : "hsl(220 10% 16%)",
                  border: "1px solid hsl(220 10% 20%)",
                  color: page === totalPages ? "hsl(210 8% 35%)" : "hsl(210 8% 65%)",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                }}
              >
                Succ <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/advisor", titolo: "Advisor", descrizione: "Simula un accoppiamento e stima costi, premi e prezzo di rivendita del puledro." },
        { href: "/stalloni", titolo: "Catalogo stalloni", descrizione: "Chi sono i padri dei cavalli in classifica, con tasse di monta e produzione." },
        { href: "/trend", titolo: "Trend", descrizione: "Come cambiano voti, guadagni e numero di gare anno per anno." },
      ]} />
    </div>
  );
}
