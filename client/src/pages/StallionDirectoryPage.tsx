import { nomePaese, ordinaPaesi } from "@/lib/flags";
import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "../components/GradeBadge";
import { Search, X, MapPin, BookOpen, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num } from "../components/DueColonne";
import ConfrontoStalloni from "../components/ConfrontoStalloni";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";

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
  affidabilita_txt?: string | null;
}

type SortKey = "fee_desc" | "fee_asc" | "name_asc" | "score_desc" | "figli_desc";


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

const COLORE = "hsl(120 60% 50%)";
const PASSO = 50;
const SCORRE = { flexWrap: "nowrap" as const, overflowX: "auto" as const, maxWidth: "100%", whiteSpace: "nowrap" as const };
const stileSelect: React.CSSProperties = {
  background: "var(--ed-fondo)", border: "1px solid var(--ed-bordo)", borderRadius: 9, padding: "8px 10px",
  color: "var(--ed-testo)", fontSize: 12.5, outline: "none", cursor: "pointer", fontFamily: "inherit",
};
const inMonta = (st: string | null) => st === "active" || st === "da_concordare" || st === "free";

/** Il prezzo della monta come lo si legge: cifra, gratuita, da concordare o fuori catalogo. */
function prezzo(s: StallionEntry): { testo: string; colore: string } {
  const st = s.stud_status || null;
  if (!inMonta(st)) return { testo: st ? STATUS_LABELS[st] || st : "Non in monta 2026", colore: "var(--ed-fioco)" };
  if (s.stud_fee_eur != null && s.stud_fee_eur > 0) return { testo: `€ ${s.stud_fee_eur.toLocaleString("it-IT")}`, colore: "hsl(51 80% 60%)" };
  if (s.stud_fee_eur === 0 || st === "free") return { testo: "Gratuita", colore: "hsl(150 45% 55%)" };
  return { testo: "Da concordare", colore: "hsl(40 70% 55%)" };
}

function SchedaStallone({ s, onClose }: { s: StallionEntry; onClose?: () => void }) {
  const country = s.country || s.nationality;
  const p = prezzo(s);
  const st = s.stud_status || null;
  return (
    <div className="ed-dettaglio" data-testid="scheda-catalogo-stallone">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Stallone{country ? ` · ${nomePaese(country)}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            {country && <BandieraCavallo paese={country} ignoto_se_vuoto />}
            <span style={{ fontSize: 20, fontWeight: 800, color: COLORE, overflowWrap: "anywhere" }}>{s.name}</span>
            {s.grade && <GradeBadge grade={s.grade} size="md" />}
          </div>
          {s.stud_farm && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ed-muto)", marginTop: 4 }}>
              <MapPin size={12} style={{ flexShrink: 0 }} /> {s.stud_farm}
            </div>
          )}
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Monta 2026" valore={p.testo} colore={p.colore}
          sotto={st && inMonta(st) ? STATUS_LABELS[st] : "non è nel catalogo di quest'anno"} />
        <Cifra titolo="Punti" valore={num(s.final_score ?? s.avg_score, 1)} colore={COLORE}
          sotto={s.affidabilita_txt ? `affidabilità ${s.affidabilita_txt}` : "dai figli che hanno corso"} />
        <Cifra titolo="Figli" valore={num(s.n_figli_totali)} sotto={s.n_in_corsa ? `${s.n_in_corsa} ancora in corsa` : "nessuno in corsa"} />
        <Cifra titolo="Figli di vertice" valore={s.pct_top_S != null ? `${num(s.pct_top_S, 1)}%` : "—"} colore="hsl(183 80% 55%)" sotto="con voto S o più" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <Link href={`/stallion/${encodeURIComponent(s.name)}`}>
          <a data-testid="link-scheda-stallone" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORE, color: "hsl(220 13% 7%)",
            borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
            Scheda completa <ArrowRight size={14} />
          </a>
        </Link>
      </div>
    </div>
  );
}

export default function StallionDirectoryPage() {
  const desktop = useDesktop();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyCatalog, setOnlyCatalog] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("fee_desc");
  const [quanti, setQuanti] = useState(PASSO);
  const [aperto, setAperto] = useState<string | null>(null);

  const { data: stallions = [], isLoading } = useQuery<StallionEntry[]>({
    queryKey: ["/api/stallions"],
    queryFn: async () => (await apiRequest("GET", "/api/stallions")).json(),
  });

  useEffect(() => { setQuanti(PASSO); setAperto(null); }, [search, countryFilter, statusFilter, onlyCatalog, sortBy]);

  const filtered = useMemo(() => {
    // Prima qui c'era un filtro fisso sulla stagione 2026, che riduceva la
    // pagina ai 153 stalloni in monta quest'anno e nascondeva gli altri 392
    // di cui conosciamo la produzione. Ora si vedono tutti e la monta 2026
    // diventa una scelta dell'utente.
    let list = stallions;
    // Solo chi e' davvero nel catalogo 2026, non chi ha ancora la stagione
    // vecchia scritta in archivio.
    if (onlyCatalog) list = list.filter(s => inMonta(s.stud_status));
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(s => s.name.toUpperCase().includes(q) || (s.stud_farm || "").toUpperCase().includes(q));
    }
    if (countryFilter !== "all") list = list.filter(s => (s.country || s.nationality || "") === countryFilter);
    if (statusFilter !== "all") list = list.filter(s => s.stud_status === statusFilter);
    const sorted = [...list];
    switch (sortBy) {
      case "fee_desc": sorted.sort((a, b) => (b.stud_fee_eur ?? 0) - (a.stud_fee_eur ?? 0)); break;
      case "fee_asc": sorted.sort((a, b) => (a.stud_fee_eur ?? 999999) - (b.stud_fee_eur ?? 999999)); break;
      case "name_asc": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "score_desc": sorted.sort((a, b) => (b.final_score ?? b.avg_score ?? 0) - (a.final_score ?? a.avg_score ?? 0)); break;
      case "figli_desc": sorted.sort((a, b) => (b.n_figli_totali ?? 0) - (a.n_figli_totali ?? 0)); break;
    }
    return sorted;
  }, [stallions, search, countryFilter, statusFilter, sortBy, onlyCatalog]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    stallions.forEach(s => { const c = s.country || s.nationality; if (c) set.add(c); });
    return Array.from(set).sort();
  }, [stallions]);

  const stats = useMemo(() => {
    const conPrezzo = filtered.filter(s => s.stud_fee_eur != null && s.stud_fee_eur > 0);
    const avgFee = conPrezzo.length ? Math.round(conPrezzo.reduce((t, s) => t + (s.stud_fee_eur || 0), 0) / conPrezzo.length) : 0;
    const maxFee = Math.max(...filtered.map(s => s.stud_fee_eur ?? 0), 0);
    return { total: filtered.length, withFee: conPrezzo.length, avgFee, maxFee, active: filtered.filter(s => s.stud_status === "active").length };
  }, [filtered]);

  const maxPunti = Math.max(...filtered.map(s => s.final_score ?? s.avg_score ?? 0), 1);
  const visibili = filtered.slice(0, quanti);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].name : null);
  const sceltoS = visibili.find(s => s.name === scelto) ?? null;
  const ORDINI: [SortKey, string][] = [["fee_desc", "Monta più cara"], ["fee_asc", "Monta più economica"], ["score_desc", "Punti"], ["figli_desc", "Figli"], ["name_asc", "Nome"]];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={BookOpen} colore={COLORE} titolo="Stalloni" margineSotto={16}
        sottotitolo="Il catalogo degli stalloni con produzione valutata, con prezzi di monta e confronto.">
        Spuntando «Solo monta 2026» restano soltanto gli stalloni disponibili in Italia in questa stagione. I dati vengono da
        Trot Stallions Directory e dal Libro Stalloni ANACT. Tocca una riga per aprire la scheda dello stallone.
      </IntestazionePagina>

      <div className="ed-cifre" style={{ marginBottom: 16 }}>
        <Cifra titolo="Stalloni in elenco" valore={num(stats.total)} />
        <Cifra titolo="Disponibili" valore={num(stats.active)} colore="hsl(120 50% 55%)" sotto="in monta nel 2026" />
        <Cifra titolo="Con prezzo" valore={num(stats.withFee)} colore="hsl(183 60% 55%)" />
        <Cifra titolo="Monta media" valore={stats.avgFee ? `€ ${stats.avgFee.toLocaleString("it-IT")}` : "—"} colore="hsl(51 80% 60%)" sotto="fra quelli con prezzo" />
        <Cifra titolo="Monta più cara" valore={stats.maxFee ? `€ ${stats.maxFee.toLocaleString("it-IT")}` : "—"} colore="hsl(0 60% 60%)" />
      </div>

      {/* Confronto sul prezzo della monta */}
      <ConfrontoStalloni />

      <div className="ed-barra" style={{ marginTop: 16 }}>
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca stallone o allevamento" aria-label="Cerca stallone o allevamento" data-testid="input-cerca-stallone" />
          {search && <button onClick={() => setSearch("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={stileSelect} aria-label="Paese">
          <option value="all">Tutti i paesi</option>
          {ordinaPaesi(countries).map(c => <option key={c} value={c}>{nomePaese(c)}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={stileSelect} aria-label="Stato">
          <option value="all">Tutti gli stati</option>
          <option value="active">Disponibili</option>
          <option value="da_concordare">Da concordare</option>
          <option value="free">Monta gratuita</option>
          <option value="non_in_catalogo">Non in monta 2026</option>
        </select>
        <button className={`chip-filtro${onlyCatalog ? " attivo" : ""}`} onClick={() => setOnlyCatalog(v => !v)} aria-pressed={onlyCatalog} data-testid="btn-solo-monta">
          Solo monta 2026
        </button>
      </div>
      <div className="ed-barra" style={{ marginTop: -4 }}>
        <div className="ed-segm" role="group" aria-label="Ordina per" style={SCORRE}>
          {ORDINI.map(([k, t]) => <button key={k} aria-pressed={sortBy === k} onClick={() => setSortBy(k)}>{t}</button>)}
        </div>
      </div>

      {isLoading ? <CavalloCaricamento label="Carico gli stalloni..." /> : filtered.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuno stallone trovato. Prova a modificare i filtri.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {visibili.map((s, i) => {
                const att = scelto === s.name;
                const p = prezzo(s);
                const country = s.country || s.nationality;
                const punti = s.final_score ?? s.avg_score;
                return (
                  <div key={s.name} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : s.name)} data-testid={`row-stallone-${i}`}>
                      <span className="ed-pos">{i + 1}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {country && <BandieraCavallo paese={country} ignoto_se_vuoto />}
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                          {s.grade && <GradeBadge grade={s.grade} size="sm" />}
                        </span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={punti} max={maxPunti} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {s.n_figli_totali ? `${s.n_figli_totali} figli` : "figli non ancora valutati"}{punti != null ? ` · punti ${num(punti, 1)}` : ""}{s.stud_farm ? ` · ${s.stud_farm}` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: inMonta(s.stud_status) && s.stud_fee_eur ? 15 : 12, fontWeight: 800, color: p.colore, whiteSpace: "nowrap" }}>{p.testo}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>monta</span>
                      </span>
                    </button>
                    {!desktop && att && <div style={{ marginTop: 6 }}><SchedaStallone s={s} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            {filtered.length > quanti && (
              <button className="chip-filtro" onClick={() => setQuanti(q => q + PASSO)} data-testid="btn-altri" style={{ marginTop: 10, width: "100%" }}>
                Mostra altri ({num(filtered.length - quanti)} rimasti)
              </button>
            )}
          </div>
          {desktop && (sceltoS ? <SchedaStallone key={sceltoS.name} s={sceltoS} /> : <div className="ed-dettaglio ed-vuoto">Scegli uno stallone dall'elenco.</div>)}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come si legge" compatta>
          Dati raccolti da Trot Stallions Directory (stagione 2026), ANACT Libro Stalloni e
          schede individuali degli allevamenti. I prezzi si intendono + IVA salvo dove
          diversamente indicato; alcuni stalloni hanno tariffe in dollari, convertite a un
          cambio approssimato.
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/advisor", titolo: "Advisor", descrizione: "Prova uno di questi stalloni su una tua fattrice (sperimentale)." },
        { href: "/fattrici", titolo: "Fattrici", descrizione: "L'altra meta' dell'accoppiamento, valutata sulla progenie." },
        { href: "/allevamento", titolo: "Allevamento", descrizione: "Allevatori e stazioni di monta, con la qualita' media della produzione." },
      ]} />
    </div>
  );
}
