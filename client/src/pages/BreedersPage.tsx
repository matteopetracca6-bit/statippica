import { COLORE_SCHEDA_VOTO } from "@/lib/coloreVoto";
/**
 * ALLEVATORI: chi ha materialmente allevato i cavalli.
 *
 * Il dato arriva dalla seconda fonte (VendoPuledri), che lo riporta per ogni
 * soggetto; l'archivio corse non lo contiene. Da non confondere con le
 * stazioni di monta, dove stanno gli stalloni.
 *
 * Impaginato a due colonne (vedi DueColonne): classifica a sinistra, scheda
 * dell'allevatore a destra. La qualita' si legge sul voto medio dei cavalli
 * prodotti, tenendo presente che sono valutati solo quelli che hanno corso.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { Search, X, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro, isNum } from "../components/DueColonne";

interface BreederRow {
  breeder_name: string;
  n_cavalli: number;
  n_valutati: number;
  score_medio: number | null;
  score_migliore: number | null;
  n_top: number;
}
interface BreederDetail {
  name: string;
  n_cavalli: number;
  contact: { city: string | null; province: string | null } | null;
  horses: {
    horse_name: string; birth_year: number | null; sex: string | null; score: number | null;
    grade: string | null; career_races: number | null; career_earnings: number | null;
  }[];
}

const PAGE = 40;
const VOTI = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
// Colori ufficiali dei voti (SSS oro, SS argento, S bronzo...), uguali in tutto il sito.
const GRADE_COLORS: Record<string, string> = COLORE_SCHEDA_VOTO;
/** Il voto medio usa il colore della pagina: non e' un voto a lettere. */
function coloreVoto(s: number | null | undefined): string {
  return isNum(s) ? "var(--ed-acc)" : "hsl(210 8% 45%)";
}

function SchedaAllevatore({ nome, onClose }: { nome: string; onClose?: () => void }) {
  const [, navigate] = useLocation();
  const [soloValutati, setSoloValutati] = useState(false);
  const { data: d, isLoading } = useQuery<BreederDetail | null>({
    queryKey: ["/api/allevatore", nome],
    queryFn: async () => (await apiRequest("GET", `/api/allevatore/${encodeURIComponent(nome)}`)).json(),
  });
  const horses = d?.horses ?? [];
  const valutati = horses.filter(h => isNum(h.score));
  const medio = valutati.length ? valutati.reduce((a, h) => a + (h.score as number), 0) / valutati.length : null;
  const guadagni = horses.reduce((a, h) => a + (isNum(h.career_earnings) ? h.career_earnings : 0), 0);
  const conta: Record<string, number> = {};
  for (const h of horses) if (h.grade) conta[h.grade] = (conta[h.grade] ?? 0) + 1;
  const top = (conta.SSS ?? 0) + (conta.SS ?? 0) + (conta.S ?? 0);
  const mostrati = soloValutati ? valutati : horses;

  return (
    <div className="ed-dettaglio" data-testid="scheda-allevatore">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Allevatore</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ed-testo)", overflowWrap: "anywhere", marginTop: 2 }}>{nome}</div>
          {d?.contact?.city && (
            <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
              <MapPin size={12} /> {d.contact.city}{d.contact.province ? ` (${d.contact.province})` : ""}
            </div>
          )}
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      {isLoading ? <CavalloCaricamento label="Carico i cavalli..." /> : !d ? (
        <div style={{ fontSize: 13, color: "var(--ed-muto)", marginTop: 14 }}>Nessun cavallo trovato per questo allevatore.</div>
      ) : (
        <>
          <div className="ed-cifre" style={{ marginTop: 14 }}>
            <Cifra titolo="Cavalli" valore={num(d.n_cavalli)} sotto={`${num(valutati.length)} valutati`} />
            <Cifra titolo="Voto medio" valore={num(medio, 1)} colore={coloreVoto(medio)} sotto="dei valutati" />
            <Cifra titolo="Di vertice" valore={num(top)} colore={GRADE_COLORS.S} sotto="voto S o più" />
            <Cifra titolo="Premi vinti" valore={euro(guadagni)} colore="hsl(51 75% 58%)" sotto="tutti i suoi cavalli" />
          </div>

          {valutati.length > 0 && (
            <>
              <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Come sono andati i suoi cavalli</div>
              <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", background: "hsl(220 10% 16%)" }}>
                {VOTI.filter(v => conta[v]).map(v => (
                  <div key={v} title={`${v}: ${conta[v]}`} style={{ width: `${(conta[v] / valutati.length) * 100}%`, background: GRADE_COLORS[v] }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px 10px", flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "var(--ed-muto)" }}>
                {VOTI.filter(v => conta[v]).map(v => (
                  <span key={v}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: GRADE_COLORS[v], marginRight: 4 }} />{v} {conta[v]}</span>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 8px", flexWrap: "wrap" }}>
            <div className="ed-etich" style={{ marginRight: "auto" }}>I cavalli ({num(mostrati.length)})</div>
            <label style={{ fontSize: 12, color: "var(--ed-muto)", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={soloValutati} onChange={e => setSoloValutati(e.target.checked)} /> solo valutati
            </label>
          </div>
          <div style={{ maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingRight: 2 }}>
            {mostrati.map(h => (
              <div key={h.horse_name + (h.birth_year ?? "")}
                onClick={() => h.birth_year && navigate(`/horse/${encodeURIComponent(h.horse_name)}/${h.birth_year}`)}
                style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "8px 10px",
                  borderRadius: 8, background: "var(--ed-fondo2)", cursor: h.birth_year ? "pointer" : "default" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ed-testo)", overflowWrap: "anywhere" }}>{h.horse_name}</div>
                  <div style={{ fontSize: 11, color: "var(--ed-muto)" }}>
                    {h.birth_year ?? "—"}{h.sex ? ` · ${h.sex === "F" ? "femmina" : "maschio"}` : ""} · {num(h.career_races)} corse · {euro(h.career_earnings)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tabular" style={{ fontSize: 12.5, fontWeight: 700, color: coloreVoto(h.score) }}>{num(h.score, 1)}</span>
                  {h.grade ? <GradeBadge grade={h.grade} size="sm" /> : <span style={{ fontSize: 11, color: "var(--ed-fioco)" }}>non valutato</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function BreedersPage(_props: { embedded?: boolean } = {}) {
  const [location] = useLocation();
  const nomeDaIndirizzo = location.startsWith("/allevatore/") ? decodeURIComponent(location.slice("/allevatore/".length)) : null;
  const desktop = useDesktop();
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [minHorses, setMinHorses] = useState(5);
  const [page, setPage] = useState(0);
  const [aperto, setAperto] = useState<string | null>(nomeDaIndirizzo);
  useEffect(() => { if (nomeDaIndirizzo) setAperto(nomeDaIndirizzo); }, [nomeDaIndirizzo]);

  // La ricerca parte da sola mezzo secondo dopo l'ultima lettera.
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchInput.trim()); setPage(0); }, 450);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), min_horses: String(minHorses) });
  if (q) params.set("q", q);
  const { data, isLoading } = useQuery<{ rows: BreederRow[]; total: number }>({
    queryKey: ["/api/allevatori", params.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/allevatori?${params.toString()}`)).json(),
    placeholderData: p => p,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pagine = Math.max(1, Math.ceil(total / PAGE));

  // Su computer la scheda a destra non resta mai vuota: si apre il primo.
  const scelto = useMemo(() => aperto ?? (desktop && rows.length ? rows[0].breeder_name : null), [aperto, desktop, rows]);

  return (
    <div>
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Cerca un allevatore" aria-label="Cerca un allevatore" />
          {searchInput && <button onClick={() => setSearchInput("")} aria-label="Cancella ricerca"
            style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Quanti cavalli allevati">
          {[[1, "Tutti"], [2, "2+ cavalli"], [5, "5+"], [10, "10+"], [25, "25+"]].map(([v, t]) => (
            <button key={v} aria-pressed={minHorses === v} onClick={() => { setMinHorses(v as number); setPage(0); }}>{t}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(total)} allevatori</span>
      </div>

      {isLoading && !data ? <CavalloCaricamento label="Carico gli allevatori..." /> : rows.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun allevatore corrisponde ai filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {rows.map((r, i) => {
                const pos = page * PAGE + i + 1;
                const att = scelto === r.breeder_name;
                return (
                  <div key={r.breeder_name} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? null : r.breeder_name)} data-testid={`row-allevatore-${i}`}>
                      <span className="ed-pos" data-podio={pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "block" }}>{r.breeder_name}</span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={r.score_medio} colore={coloreVoto(r.score_medio)} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {num(r.n_cavalli)} cavalli · {num(r.n_valutati)} valutati{r.n_top ? ` · ${r.n_top} di vertice` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 19, fontWeight: 800, color: coloreVoto(r.score_medio) }}>{num(r.score_medio, 1)}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>voto medio</span>
                      </span>
                    </button>
                    {!desktop && att && <div style={{ marginTop: 6 }}><SchedaAllevatore nome={r.breeder_name} onClose={() => setAperto(null)} /></div>}
                  </div>
                );
              })}
            </div>
            {pagine > 1 && (
              <div className="ed-pagine">
                <button disabled={page === 0} onClick={() => { setPage(p => p - 1); setAperto(null); }} aria-label="Pagina precedente"><ChevronLeft size={14} /></button>
                pagina {page + 1} di {pagine}
                <button disabled={page >= pagine - 1} onClick={() => { setPage(p => p + 1); setAperto(null); }} aria-label="Pagina successiva"><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
          {desktop && (scelto ? <SchedaAllevatore key={scelto} nome={scelto} /> : <div className="ed-dettaglio ed-vuoto">Scegli un allevatore dall'elenco.</div>)}
        </div>
      )}

      {/* Un allevatore aperto dall'indirizzo ma fuori da questa pagina dell'elenco, sul telefono */}
      {!desktop && aperto && !rows.some(r => r.breeder_name === aperto) && (
        <div style={{ marginTop: 10 }}><SchedaAllevatore nome={aperto} onClose={() => setAperto(null)} /></div>
      )}

      <p style={{ fontSize: 11, color: "var(--ed-fioco)", marginTop: 22, lineHeight: 1.6 }}>
        Fonte del dato di allevamento: VendoPuledri, aggiornato ogni notte. I recapiti non sono mostrati.
        Vedi anche il <Link href="/stalloni"><a style={{ color: "var(--ed-acc)" }}>catalogo stalloni</a></Link>.
      </p>
    </div>
  );
}
