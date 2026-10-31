/**
 * SEZIONE QUALIFICHE.
 *
 * La prova di qualifica e' il primo tempo ufficiale di un cavallo: la sostiene
 * da giovane, prima di poter essere iscritto alle corse. E' quindi l'unico
 * segnale disponibile su un soggetto che non ha ancora una carriera, e per
 * molti di questi cavalli l'archivio corse non ha ancora nulla.
 *
 * Layout a due colonne come le altre pagine rifatte:
 *  - linguetta "Le prove": elenco a sinistra, scheda del cavallo a destra
 *    (tempo, quante prove ha battuto, genitori, chi lo allena, fratelli di
 *    padre gia' qualificati);
 *  - linguetta "Stalloni": i padri con i figli piu' veloci, e per ognuno
 *    l'elenco dei figli qualificati.
 *
 * I dati arrivano dalla seconda fonte (VendoPuledri) e vengono aggiornati
 * dalla fase 2f della pipeline notturna.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Award, Search, X, Sparkles, ChevronLeft, ChevronRight, Timer, Crown, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import NomePista from "@/components/NomePista";
import { tempoKm, formatRecord } from "@/lib/record";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num } from "../components/DueColonne";

const COLORE = "hsl(280 60% 62%)";
const VERDE = "hsl(150 60% 52%)";
const PAGE = 30;

interface QualRow {
  horse_name: string; qual_date: string; track: string | null; time_raw: string | null; time_km: number | null;
  sire: string | null; dam: string | null; maternal_gsire: string | null; trainer: string | null;
  owner: string | null; breeder: string | null; known_name: string | null; birth_year: number | null;
  score: number | null; grade: string | null;
}
interface QualResponse { rows: QualRow[]; total: number; limit: number; offset: number; years: string[]; tracks: { track: string; n: number }[] }
interface Padre { sire: string; n_figli: number; tempo_medio: number; migliore: number | null }
interface QualStats {
  n_prove: number; n_cavalli: number; n_stalloni: number; n_nuovi: number; dal: string; al: string;
  tempo_medio: number | null; tempo_migliore: number | null; top_sires: Padre[]; distribuzione?: { t: number; n: number }[];
}

const itDate = (d: string) => (!d || d.length !== 10 ? d || "—" : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);
const tempo = (r: { time_raw: string | null; time_km: number | null }) =>
  r.time_km != null ? tempoKm(r.time_km) : r.time_raw ? formatRecord(r.time_raw) : "—";
const chiave = (r: QualRow) => `${r.horse_name}|${r.qual_date}`;
const secondi = (x: number) => x.toFixed(1).replace(".", ",");

/** Quante prove su cento sono state piu' lente di questo tempo. */
function battute(t: number | null, dist: { t: number; n: number }[] | undefined): number | null {
  if (t == null || !dist?.length) return null;
  const tot = dist.reduce((s, d) => s + d.n, 0);
  const lente = dist.filter(d => d.t > t).reduce((s, d) => s + d.n, 0);
  return tot ? Math.floor((lente / tot) * 100) : null;
}

/** Piccolo istogramma dei tempi con il segno del cavallo scelto. */
function Distribuzione({ dist, t }: { dist: { t: number; n: number }[]; t: number | null }) {
  // gruppi da mezzo secondo, fra il 14 e il 25 (oltre: tutti nell'ultimo)
  const gruppi = useMemo(() => {
    const m = new Map<number, number>();
    dist.forEach(d => { const k = Math.min(25, Math.max(14, Math.floor(d.t * 2) / 2)); m.set(k, (m.get(k) ?? 0) + d.n); });
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [dist]);
  const max = Math.max(1, ...gruppi.map(g => g[1]));
  const suo = t == null ? null : Math.min(25, Math.max(14, Math.floor(t * 2) / 2));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }}>
        {gruppi.map(([k, n]) => (
          <div key={k} title={`${tempoKm(k)}–${tempoKm(k + 0.4)}: ${n} prove`}
            style={{ flex: 1, height: `${Math.max(4, (n / max) * 100)}%`, borderRadius: "3px 3px 1px 1px",
              background: k === suo ? COLORE : "color-mix(in srgb, var(--ed-muto) 30%, transparent)" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ed-fioco)", marginTop: 4 }}>
        <span>più veloci · {tempoKm(14)}</span><span>{tempoKm(25)} e oltre · più lenti</span>
      </div>
    </div>
  );
}

function SchedaProva({ r, stats, onClose, vaiPadre }: { r: QualRow; stats?: QualStats | null; onClose?: () => void; vaiPadre: (s: string) => void }) {
  const pct = battute(r.time_km, stats?.distribuzione);
  const diff = r.time_km != null && stats?.tempo_medio != null ? stats.tempo_medio - r.time_km : null;
  const { data: fratelli } = useQuery<QualResponse>({
    queryKey: ["/api/qualifiche", "sire", r.sire],
    enabled: !!r.sire,
    queryFn: async () => (await apiRequest("GET", `/api/qualifiche?sire=${encodeURIComponent(r.sire!)}&limit=8&sort=time`)).json(),
  });
  const altri = (fratelli?.rows ?? []).filter(x => x.horse_name !== r.horse_name).slice(0, 5);
  return (
    <div className="ed-dettaglio" data-testid="scheda-qualifica">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Prova di qualifica · {itDate(r.qual_date)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: "var(--ed-testo)", overflowWrap: "anywhere" }}>{r.horse_name}</span>
            {r.grade && <GradeBadge grade={r.grade} />}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
            {r.track ? <NomePista pista={r.track} colorato /> : "ippodromo non indicato"}
            {r.birth_year ? ` · nato nel ${r.birth_year}` : ""}
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Tempo al km" valore={tempo(r)} colore={COLORE}
          sotto={diff == null ? undefined : diff >= 0 ? `${secondi(diff)} s meglio della media` : `${secondi(-diff)} s peggio della media`} />
        <Cifra titolo="Prove battute" valore={pct == null ? "—" : `${pct}%`} colore={pct != null && pct >= 75 ? VERDE : undefined}
          sotto="quante prove su cento sono state più lente" />
      </div>
      {stats?.distribuzione && stats.distribuzione.length > 0 && (
        <div style={{ marginTop: 12 }}><Distribuzione dist={stats.distribuzione} t={r.time_km} /></div>
      )}

      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Famiglia e scuderia</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "5px 12px", fontSize: 13 }}>
        <span style={{ color: "var(--ed-muto)" }}>Padre</span>
        <span>{r.sire ? <button onClick={() => vaiPadre(r.sire!)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "hsl(51 80% 62%)", fontWeight: 700, fontSize: 13, fontFamily: "inherit", textAlign: "left" }}>{r.sire}</button> : "—"}</span>
        <span style={{ color: "var(--ed-muto)" }}>Madre</span><span style={{ color: "var(--ed-testo)" }}>{r.dam || "—"}{r.maternal_gsire ? <span style={{ color: "var(--ed-muto)" }}> (da {r.maternal_gsire})</span> : null}</span>
        <span style={{ color: "var(--ed-muto)" }}>Allenatore</span><span style={{ color: "var(--ed-testo)" }}>{r.trainer || "—"}</span>
        <span style={{ color: "var(--ed-muto)" }}>Proprietario</span><span style={{ color: "var(--ed-testo)" }}>{r.owner || "—"}</span>
        <span style={{ color: "var(--ed-muto)" }}>Allevamento</span><span style={{ color: "var(--ed-testo)" }}>{r.breeder || "—"}</span>
      </div>

      {r.sire && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Altri figli di {r.sire} in qualifica</div>
          {altri.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>È l'unico figlio di questo padre fra le prove raccolte.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {altri.map(x => (
                <div key={chiave(x)} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ed-testo)" }}>{x.horse_name}</span>
                  <span className="tabular" style={{ color: COLORE, fontWeight: 700 }}>{tempo(x)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {r.known_name && r.birth_year ? (
          <Link href={`/horse/${encodeURIComponent(r.known_name)}/${r.birth_year}`}>
            <a data-testid="link-scheda-cavallo" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORE, color: "hsl(220 13% 7%)",
              borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
              Scheda del cavallo <ArrowRight size={14} />
            </a>
          </Link>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "hsl(280 60% 75%)" }}>
            <Sparkles size={13} /> Non ha ancora corso: non c'è ancora una scheda nell'archivio corse.
          </span>
        )}
      </div>
    </div>
  );
}

function Prove({ stats, vaiPadre }: { stats?: QualStats | null; vaiPadre: (s: string) => void }) {
  const desktop = useDesktop();
  const [testo, setTesto] = useState("");
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [track, setTrack] = useState("");
  const [soloNuovi, setSoloNuovi] = useState(false);
  const [sort, setSort] = useState<"time" | "date">("time");
  const [page, setPage] = useState(0);
  const [aperto, setAperto] = useState<string | null>(null);

  // la ricerca parte da sola mezzo secondo dopo che si smette di scrivere
  useEffect(() => { const id = setTimeout(() => { setQ(testo.trim()); setPage(0); setAperto(null); }, 400); return () => clearTimeout(id); }, [testo]);

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), sort });
  if (q) params.set("q", q);
  if (year) params.set("year", year);
  if (track) params.set("track", track);
  if (soloNuovi) params.set("only_new", "1");
  const { data, isLoading } = useQuery<QualResponse>({
    queryKey: ["/api/qualifiche", params.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/qualifiche?${params.toString()}`)).json(),
    placeholderData: prev => prev,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pagine = Math.max(1, Math.ceil(total / PAGE));
  const cambia = (f: () => void) => { f(); setPage(0); setAperto(null); };

  const scelto = aperto ?? (desktop && rows.length ? chiave(rows[0]) : null);
  const sceltoR = rows.find(r => chiave(r) === scelto) ?? null;
  // barra: 14 secondi = piena, 25 = vuota
  const forza = (t: number | null) => (t == null ? 0 : Math.max(0.04, Math.min(1, (25 - t) / 11)));

  return (
    <div>
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca un cavallo" aria-label="Cerca un cavallo" data-testid="input-cerca-qualifica" />
          {testo && <button onClick={() => setTesto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          <button aria-pressed={sort === "time"} onClick={() => cambia(() => setSort("time"))}>Più veloci</button>
          <button aria-pressed={sort === "date"} onClick={() => cambia(() => setSort("date"))}>Più recenti</button>
        </div>
        <div className="ed-segm" role="group" aria-label="Anno">
          <button aria-pressed={year === ""} onClick={() => cambia(() => setYear(""))}>Tutti gli anni</button>
          {/* Ottobre 2026: con le annate vecchie gli anni sono una ventina.
              Restano pulsanti gli ultimi cinque, gli altri vanno nel menu qui sotto. */}
          {(data?.years ?? []).slice(0, 5).map(y => <button key={y} aria-pressed={year === y} onClick={() => cambia(() => setYear(y))}>{y}</button>)}
        </div>
      </div>
      <div className="ed-barra" style={{ marginTop: -4 }}>
        {(data?.years ?? []).length > 5 && (
          <select value={(data?.years ?? []).slice(5).includes(year) ? year : ""} onChange={e => cambia(() => setYear(e.target.value))} aria-label="Anni precedenti" data-testid="select-anni-precedenti"
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ed-bordo)", background: "var(--ed-fondo)", color: "var(--ed-testo)", fontSize: 12.5, fontFamily: "inherit" }}>
            <option value="">Anni precedenti</option>
            {(data?.years ?? []).slice(5).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        <select value={track} onChange={e => cambia(() => setTrack(e.target.value))} aria-label="Ippodromo"
          style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ed-bordo)", background: "var(--ed-fondo)", color: "var(--ed-testo)", fontSize: 12.5, fontFamily: "inherit" }}>
          <option value="">Tutti gli ippodromi</option>
          {(data?.tracks ?? []).map(t => <option key={t.track} value={t.track}>{t.track} ({t.n})</option>)}
        </select>
        <button className="chip-filtro" aria-pressed={soloNuovi} data-attivo={soloNuovi} onClick={() => cambia(() => setSoloNuovi(v => !v))}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderColor: soloNuovi ? COLORE : undefined, color: soloNuovi ? COLORE : undefined }}>
          <Sparkles size={13} /> Solo chi non ha ancora corso
        </button>
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(total)} prove</span>
      </div>

      {isLoading && !data ? <CavalloCaricamento label="Carico le qualifiche..." /> : rows.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuna prova corrisponde ai filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {rows.map((r, i) => {
                const k = chiave(r);
                const att = scelto === k;
                const pos = page * PAGE + i + 1;
                return (
                  <div key={k} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : k)} data-testid={`row-qualifica-${i}`}>
                      <span className="ed-pos" data-podio={sort === "time" && pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.horse_name}</span>
                          {r.grade && <GradeBadge grade={r.grade} />}
                          {!r.known_name && <span title="Non ha ancora corso" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "hsl(280 60% 75%)", flexShrink: 0 }}><Sparkles size={10} />NUOVO</span>}
                        </span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={forza(r.time_km)} max={1} colore={COLORE} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {r.sire || "padre —"} · {itDate(r.qual_date)}{r.track ? ` · ${r.track}` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: COLORE, whiteSpace: "nowrap" }}>{tempo(r)}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>al km</span>
                      </span>
                    </button>
                    {!desktop && att && <div style={{ marginTop: 6 }}><SchedaProva r={r} stats={stats} vaiPadre={vaiPadre} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            {pagine > 1 && (
              <div className="ed-pagine">
                <button onClick={() => { setPage(p => Math.max(0, p - 1)); setAperto(null); }} disabled={page === 0} aria-label="Pagina precedente"><ChevronLeft size={15} /></button>
                <span>Pagina {page + 1} di {pagine}</span>
                <button onClick={() => { setPage(p => Math.min(pagine - 1, p + 1)); setAperto(null); }} disabled={page >= pagine - 1} aria-label="Pagina successiva"><ChevronRight size={15} /></button>
              </div>
            )}
          </div>
          {desktop && (sceltoR ? <SchedaProva key={chiave(sceltoR)} r={sceltoR} stats={stats} vaiPadre={vaiPadre} />
            : <div className="ed-dettaglio ed-vuoto">Scegli una prova dall'elenco.</div>)}
        </div>
      )}
    </div>
  );
}

function SchedaPadre({ p, stats, onClose }: { p: Padre; stats?: QualStats | null; onClose?: () => void }) {
  const { data, isLoading } = useQuery<QualResponse>({
    queryKey: ["/api/qualifiche", "sire-tutti", p.sire],
    queryFn: async () => (await apiRequest("GET", `/api/qualifiche?sire=${encodeURIComponent(p.sire)}&limit=100&sort=time`)).json(),
  });
  const diff = stats?.tempo_medio != null ? stats.tempo_medio - p.tempo_medio : null;
  return (
    <div className="ed-dettaglio" data-testid="scheda-padre">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Stallone</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "hsl(51 80% 62%)", marginTop: 2, overflowWrap: "anywhere" }}>{p.sire}</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Tempo medio dei figli" valore={tempoKm(p.tempo_medio)} colore={COLORE}
          sotto={diff == null ? undefined : diff >= 0 ? `${secondi(diff)} s meglio della media` : `${secondi(-diff)} s peggio della media`} />
        <Cifra titolo="Figli qualificati" valore={num(p.n_figli)} sotto={p.migliore != null ? `il più veloce in ${tempoKm(p.migliore)}` : undefined} />
      </div>
      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I figli, dal più veloce</div>
      {isLoading ? <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Carico...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
          {(data?.rows ?? []).map(x => (
            <div key={chiave(x)} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
              <span style={{ minWidth: 0 }}>
                {x.known_name && x.birth_year
                  ? <Link href={`/horse/${encodeURIComponent(x.known_name)}/${x.birth_year}`} className="collegamento-scheda"><span style={{ fontWeight: 700, color: "var(--ed-testo)" }}>{x.horse_name}</span></Link>
                  : <span style={{ fontWeight: 700, color: "var(--ed-testo)" }}>{x.horse_name}</span>}
                <span style={{ display: "block", fontSize: 11, color: "var(--ed-muto)" }}>{x.dam ? `da ${x.dam}` : "madre —"} · {itDate(x.qual_date)}</span>
              </span>
              <span className="tabular" style={{ color: COLORE, fontWeight: 700, alignSelf: "center" }}>{tempo(x)}</span>
            </div>
          ))}
        </div>
      )}
      <Link href={`/stallion/${encodeURIComponent(p.sire)}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, background: "hsl(51 80% 62%)", color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda dello stallone <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

function Stalloni({ stats, iniziale }: { stats?: QualStats | null; iniziale: string | null }) {
  const desktop = useDesktop();
  const [aperto, setAperto] = useState<string | null>(iniziale);
  const padri = stats?.top_sires ?? [];
  if (!stats) return <CavalloCaricamento label="Carico gli stalloni..." />;
  if (!padri.length) return <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Ancora troppo poche prove per confrontare gli stalloni.</div>;
  const scelto = aperto && padri.some(p => p.sire === aperto) ? aperto : desktop ? padri[0].sire : null;
  const sceltoP = padri.find(p => p.sire === scelto) ?? null;
  const min = Math.min(...padri.map(p => p.tempo_medio)), max = Math.max(...padri.map(p => p.tempo_medio));
  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ed-muto)", margin: "0 0 12px", lineHeight: 1.6, maxWidth: 780 }}>
        Solo stalloni con almeno cinque figli qualificati, ordinati per tempo medio. È un indizio precoce, non un voto:
        la qualifica si corre in condizioni molto diverse da una corsa vera, e con cinque o sei figli basta un puledro lento per spostare la media.
      </p>
      <div className="ed-griglia">
        <div className="ed-lista">
          {padri.map((p, i) => {
            const att = scelto === p.sire;
            return (
              <div key={p.sire} style={{ minWidth: 0 }}>
                <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : p.sire)} data-testid={`row-padre-${i}`}>
                  <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ed-nome" style={{ display: "block", color: "hsl(51 80% 62%)" }}>{p.sire}</span>
                    <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={max - p.tempo_medio + 0.3} max={max - min + 0.3} colore={COLORE} /></span>
                    <span className="ed-sotto" style={{ display: "block" }}>{p.n_figli} figli qualificati{p.migliore != null ? ` · il migliore ${tempoKm(p.migliore)}` : ""}</span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: COLORE }}>{tempoKm(p.tempo_medio)}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>media al km</span>
                  </span>
                </button>
                {!desktop && att && <div style={{ marginTop: 6 }}><SchedaPadre p={p} stats={stats} onClose={() => setAperto("")} /></div>}
              </div>
            );
          })}
        </div>
        {desktop && sceltoP && <SchedaPadre key={sceltoP.sire} p={sceltoP} stats={stats} />}
      </div>
    </div>
  );
}

export default function QualifichePage() {
  const [tab, setTab] = useState<"prove" | "stalloni">("prove");
  const [padre, setPadre] = useState<string | null>(null);
  const { data: stats } = useQuery<QualStats | null>({
    queryKey: ["/api/qualifiche/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/qualifiche/stats")).json(),
  });
  const vaiPadre = (s: string) => { setPadre(s); setTab("stalloni"); };
  const nelGruppo = (s: string) => stats?.top_sires.some(p => p.sire === s);

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Award} colore={COLORE} titolo="Qualifiche" margineSotto={16}
        sottotitolo="Il primo tempo ufficiale dei cavalli giovani, prima ancora che debuttino in corsa.">
        La prova di qualifica è il primo tempo ufficiale di un cavallo, sostenuta da giovane prima di poter correre. Per molti di questi
        soggetti è l'unica informazione esistente: non hanno ancora una carriera e quindi nemmeno un voto. Il tempo è al chilometro,
        quindi più è basso, meglio è. Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      {stats && (
        <div className="ed-cifre" style={{ marginBottom: 16 }}>
          <Cifra titolo="Prove" valore={num(stats.n_prove)} sotto={`dal ${itDate(stats.dal)} al ${itDate(stats.al)}`} />
          <Cifra titolo="Non hanno ancora corso" valore={num(stats.n_nuovi)} colore="hsl(280 60% 75%)" sotto={`su ${num(stats.n_cavalli)} cavalli`} />
          <Cifra titolo="Tempo medio" valore={stats.tempo_medio != null ? tempoKm(stats.tempo_medio) : "—"} sotto="al km" />
          <Cifra titolo="Miglior tempo" valore={stats.tempo_migliore != null ? tempoKm(stats.tempo_migliore) : "—"} colore={COLORE} sotto={`${num(stats.n_stalloni)} stalloni padri`} />
        </div>
      )}

      <div className="ed-linguette" role="tablist">
        <button role="tab" className="ed-linguetta" aria-selected={tab === "prove"} onClick={() => setTab("prove")} data-testid="tab-prove">
          <Timer size={17} color={tab === "prove" ? COLORE : "hsl(210 8% 50%)"} />
          <span><b>Le prove</b><small>Ogni cavallo con il suo tempo</small></span>
        </button>
        <button role="tab" className="ed-linguetta" aria-selected={tab === "stalloni"} onClick={() => { setPadre(null); setTab("stalloni"); }} data-testid="tab-stalloni">
          <Crown size={17} color={tab === "stalloni" ? COLORE : "hsl(210 8% 50%)"} />
          <span><b>Stalloni</b><small>I padri con i figli più veloci</small></span>
        </button>
      </div>

      {tab === "prove" && <Prove stats={stats} vaiPadre={s => (nelGruppo(s) ? vaiPadre(s) : (window.location.hash = `#/stallion/${encodeURIComponent(s)}`))} />}
      {tab === "stalloni" && <Stalloni key={padre ?? "tutti"} stats={stats} iniziale={padre} />}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come è fatto il conto e cosa non dice" compatta>
          I dati di qualifica vengono da VendoPuledri e si aggiornano ogni notte. «Prove battute» confronta il tempo con tutte le prove
          raccolte, senza tenere conto della pista né del giorno: una qualifica su una pista piccola o con il terreno pesante esce più lenta
          a parità di cavallo. Un buon tempo in qualifica è un primo indizio, non una previsione della carriera.
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/leaderboard", titolo: "Leaderboard", descrizione: "I cavalli che hanno già una carriera in corso." },
        { href: "/advisor", titolo: "Advisor", descrizione: "Stima quanto vale un puledro prima che debutti." },
        { href: "/trend", titolo: "Trend", descrizione: "Come si distribuiscono i voti per anno di nascita." },
      ]} />
    </div>
  );
}
