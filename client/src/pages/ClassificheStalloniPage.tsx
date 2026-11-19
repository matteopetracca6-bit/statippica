/**
 * CLASSIFICHE DEGLI STALLONI (novembre 2026).
 *
 * Due linguette:
 *  - "La stagione": per ogni stallone cosa hanno fatto i figli in un anno:
 *    quanti hanno corso, quanto hanno vinto, quanti hanno un record sotto
 *    1.12 ... 1.17 e quanti hanno superato 100, 50, 25 e 10 mila euro;
 *  - "Come nonni": la linea paterna vista dall'alto, cioe' quanto vincono i
 *    figli dei figli stalloni di uno stallone.
 *
 * Il voto dello stallone guarda tutta la carriera dei figli; qui si guarda
 * una stagione alla volta, o la discendenza. Calcolo in server/classifiche.ts.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Crown, X, ChevronLeft, ChevronRight, ArrowRight, Globe, CalendarDays, GitBranch } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import { tempoKm } from "@/lib/record";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro } from "../components/DueColonne";

const COLORE = coloreScheda("/stalloni/classifiche");
const ORO = "hsl(51 80% 62%)";
const PAGE = 30;
const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ed-bordo)", background: "var(--ed-fondo)", color: "var(--ed-testo)", fontSize: 12.5, fontFamily: "inherit" };
const ETA = [{ k: "tutte", t: "Tutte (2–10 anni)" }, { k: "2", t: "2 anni" }, { k: "3", t: "3 anni" }, { k: "4", t: "4 anni" }, { k: "anziani", t: "Anziani" }];

interface RigaStagione {
  nome: string; figli: number; in_corsa: number; pct_in_corsa: number; vincite: number; media_partente: number; vittorie: number;
  tempi: number[]; soglie_vincite: number[]; migliore: { nome: string; nato: number; vincite: number } | null; voto: string | null;
}
interface Stagione {
  anno: number; anno_riferimento: number; eta: string; nati: [number, number]; soglie_tempo: number[]; soglie_vincite: number[];
  anni: number[]; stalloni: number; totale_vincite: number; righe: RigaStagione[];
}
interface Figlio { nome: string; nato: number; sesso: string | null; madre: string | null; corse: number; vittorie: number; vincite: number; record: number | null; voto: string | null }
interface RigaNonno {
  nome: string; figli_stalloni: number; nipoti: number; nipoti_corsi: number; vincite: number; media_nipote: number; vittorie: number;
  di_vertice: number; voto: string | null;
  figli: { nome: string; nipoti: number; nipoti_corsi: number; vincite: number }[];
  migliori: { nome: string; nato: number; padre: string; vincite: number; voto: string | null }[];
}
interface Nonni { anno: number; anno_riferimento: number; periodo: "carriera" | "stagione"; anni: number[]; stalloni: number; righe: RigaNonno[] }

const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");
const migliaia = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));

function NomeStallone({ nome, voto }: { nome: string; voto: string | null }) {
  return (
    <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: ORO }}>{nome}</span>
      {voto && <GradeBadge grade={voto} size="sm" />}
    </span>
  );
}
function BottoneScheda({ nome }: { nome: string }) {
  return (
    <Link href={`/stallion/${encodeURIComponent(nome)}`}>
      <a style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: ORO, color: "hsl(220 13% 7%)",
        borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
        Scheda dello stallone <ArrowRight size={14} />
      </a>
    </Link>
  );
}
function Paginazione({ page, pagine, set }: { page: number; pagine: number; set: (p: number) => void }) {
  if (pagine <= 1) return null;
  return (
    <div className="ed-pagine">
      <button onClick={() => set(Math.max(0, page - 1))} disabled={page === 0} aria-label="Pagina precedente"><ChevronLeft size={15} /></button>
      <span>Pagina {page + 1} di {pagine}</span>
      <button onClick={() => set(Math.min(pagine - 1, page + 1))} disabled={page >= pagine - 1} aria-label="Pagina successiva"><ChevronRight size={15} /></button>
    </div>
  );
}
/** Una fila di caselline: soglia sopra, quanti figli sotto. */
function Soglie({ titolo, etichette, valori, nota }: { titolo: string; etichette: string[]; valori: number[]; nota: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ed-etich" style={{ marginBottom: 6 }}>{titolo}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${etichette.length}, minmax(0, 1fr))`, gap: 5 }}>
        {etichette.map((e, i) => (
          <div key={e} style={{ textAlign: "center", padding: "7px 2px", borderRadius: 8, background: "var(--ed-fondo2)", border: "1px solid var(--ed-bordo)" }}>
            <div style={{ fontSize: 10.5, color: "var(--ed-muto)", whiteSpace: "nowrap" }}>{e}</div>
            <div className="tabular" style={{ fontSize: 16, fontWeight: 800, color: valori[i] ? "var(--ed-testo)" : "var(--ed-fioco)" }}>{valori[i]}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--ed-fioco)", marginTop: 4 }}>{nota}</div>
    </div>
  );
}

// ── La stagione ────────────────────────────────────────────────────────────
function SchedaStagione({ r, d, eta, esteri, onClose }: { r: RigaStagione; d: Stagione; eta: string; esteri: boolean; onClose?: () => void }) {
  const p = new URLSearchParams({ sire: r.nome, anno: String(d.anno), eta });
  if (esteri) p.set("naz", "tutti");
  const { data, isLoading } = useQuery<{ figli: Figlio[] }>({
    queryKey: ["/api/classifiche/stalloni/figli", p.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/classifiche/stalloni/figli?${p.toString()}`)).json(),
  });
  return (
    <div className="ed-dettaglio" data-testid="scheda-stallone-stagione">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Stallone · stagione {d.anno}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: ORO, overflowWrap: "anywhere" }}>{r.nome}</span>
            {r.voto && <GradeBadge grade={r.voto} />}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>figli nati fra il {d.nati[0]} e il {d.nati[1]}</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Vinto dai figli" valore={euro(r.vincite)} colore={COLORE} sotto={`${num(r.vittorie)} vittorie`} />
        <Cifra titolo="Figli in corsa" valore={num(r.in_corsa)} sotto={`su ${num(r.figli)} in archivio (${num(r.pct_in_corsa, 1)}%)`} />
        <Cifra titolo="Media a figlio" valore={euro(r.media_partente)} sotto="per ogni figlio che ha corso" />
      </div>
      <Soglie titolo="Figli con un record di" etichette={d.soglie_tempo.map(t => `1.${t}`)} valori={r.tempi}
        nota="Record in carriera fino alla fine della stagione. «1.12» vuol dire 1.12,9 o più veloce." />
      <Soglie titolo={`Figli che nel ${d.anno} hanno vinto almeno`} etichette={d.soglie_vincite.map(v => `€ ${migliaia(v)}`)} valori={r.soglie_vincite}
        nota="Vincite nette della sola stagione." />
      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I figli nella stagione, da chi ha vinto di più</div>
      {isLoading ? <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Carico...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 380, overflowY: "auto" }}>
          {(data?.figli ?? []).map(f => (
            <div key={f.nome} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
              <span style={{ minWidth: 0 }}>
                <Link href={`/horse/${encodeURIComponent(f.nome)}/${f.nato}`} className="collegamento-scheda">
                  <span style={{ fontWeight: 700, color: "var(--ed-testo)" }}>{f.nome}</span>
                </Link>
                {f.voto && <span style={{ marginLeft: 6 }}><GradeBadge grade={f.voto} size="sm" /></span>}
                <span style={{ display: "block", fontSize: 11, color: "var(--ed-muto)" }}>
                  {f.nato} · {f.vittorie} vitt. su {f.corse} · record {tempoKm(f.record)}
                </span>
              </span>
              <span className="tabular" style={{ color: COLORE, fontWeight: 700, alignSelf: "center", whiteSpace: "nowrap" }}>{euro(f.vincite)}</span>
            </div>
          ))}
        </div>
      )}
      <BottoneScheda nome={r.nome} />
    </div>
  );
}

function LaStagione() {
  const desktop = useDesktop();
  const [anno, setAnno] = useState("");
  const [eta, setEta] = useState("tutte");
  const [esteri, setEsteri] = useState(false);
  const [page, setPage] = useState(0);
  const [aperto, setAperto] = useState<string | null>(null);
  const p = new URLSearchParams({ eta });
  if (anno) p.set("anno", anno);
  if (esteri) p.set("naz", "tutti");
  const { data, isLoading } = useQuery<Stagione>({
    queryKey: ["/api/classifiche/stalloni", p.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/classifiche/stalloni?${p.toString()}`)).json(),
    placeholderData: prev => prev,
  });
  useEffect(() => { setPage(0); setAperto(null); }, [anno, eta, esteri]);
  const righe = data?.righe ?? [];
  const visibili = righe.slice(page * PAGE, page * PAGE + PAGE);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].nome : null);
  const sceltoR = righe.find(r => r.nome === scelto) ?? null;
  const max = Math.max(1, ...righe.map(r => r.vincite));

  return (
    <div>
      <div className="ed-barra">
        <select value={anno || String(data?.anno ?? "")} onChange={e => setAnno(e.target.value)} aria-label="Stagione" style={sel} data-testid="select-stagione-stalloni">
          {(data?.anni ?? []).map(a => <option key={a} value={String(a)}>Stagione {a}</option>)}
        </select>
        <div className="ed-segm" role="group" aria-label="Età dei figli">
          {ETA.map(e => <button key={e.k} aria-pressed={eta === e.k} onClick={() => setEta(e.k)}>{e.t}</button>)}
        </div>
        <button className="chip-filtro" aria-pressed={esteri} data-attivo={esteri} onClick={() => setEsteri(v => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderColor: esteri ? COLORE : undefined, color: esteri ? COLORE : undefined }}>
          <Globe size={13} /> Anche i figli nati all'estero
        </button>
        {data && <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(data.stalloni)} stalloni · {euro(data.totale_vincite)} vinti dai figli</span>}
      </div>
      {isLoading && !data ? <CavalloCaricamento label="Preparo la classifica..." /> : righe.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuno stallone per i filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {visibili.map((r, i) => {
                const att = scelto === r.nome;
                const pos = page * PAGE + i + 1;
                return (
                  <div key={r.nome} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : r.nome)} data-testid={`row-stagione-${i}`}>
                      <span className="ed-pos" data-podio={pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <NomeStallone nome={r.nome} voto={r.voto} />
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={r.vincite} max={max} colore={COLORE} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {num(r.in_corsa)} figli in corsa · {euro(r.media_partente)} a figlio{r.tempi[0] ? ` · ${r.tempi[0]} sotto 1.13` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: COLORE, whiteSpace: "nowrap" }}>{euro(r.vincite)}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)", whiteSpace: "nowrap" }}>{num(r.vittorie)} vittorie</span>
                      </span>
                    </button>
                    {!desktop && att && data && <div style={{ marginTop: 6 }}><SchedaStagione r={r} d={data} eta={eta} esteri={esteri} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            <Paginazione page={page} pagine={Math.max(1, Math.ceil(righe.length / PAGE))} set={n => { setPage(n); setAperto(null); }} />
          </div>
          {desktop && data && (sceltoR ? <SchedaStagione key={`${sceltoR.nome}|${data.anno}|${eta}|${esteri}`} r={sceltoR} d={data} eta={eta} esteri={esteri} />
            : <div className="ed-dettaglio ed-vuoto">Scegli uno stallone dall'elenco.</div>)}
        </div>
      )}
    </div>
  );
}

// ── Come nonni ─────────────────────────────────────────────────────────────
function SchedaNonno({ r, d, onClose }: { r: RigaNonno; d: Nonni; onClose?: () => void }) {
  const maxF = Math.max(1, ...r.figli.map(f => f.vincite));
  const quando = d.periodo === "stagione" ? `nella stagione ${d.anno}` : "in carriera";
  return (
    <div className="ed-dettaglio" data-testid="scheda-nonno">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Stallone come nonno paterno · {quando}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: ORO, overflowWrap: "anywhere" }}>{r.nome}</span>
            {r.voto && <GradeBadge grade={r.voto} />}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>{num(r.figli_stalloni)} figli stalloni · {num(r.nipoti)} nipoti in archivio</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Vinto dai nipoti" valore={euro(r.vincite)} colore={COLORE} sotto={`${num(r.vittorie)} vittorie`} />
        <Cifra titolo="Nipoti in corsa" valore={num(r.nipoti_corsi)} sotto={`media ${euro(r.media_nipote)} a nipote`} />
        <Cifra titolo="Nipoti di vertice" valore={num(r.di_vertice)} sotto="con voto S, SS o SSS" />
      </div>
      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I figli stalloni, da chi ha dato di più</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {r.figli.map(f => (
          <div key={f.nome} style={{ fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10 }}>
              <span style={{ minWidth: 0 }}><Link href={`/stallion/${encodeURIComponent(f.nome)}`} className="collegamento-scheda"><span style={{ fontWeight: 700, color: ORO }}>{f.nome}</span></Link></span>
              <span className="tabular" style={{ color: COLORE, fontWeight: 700, whiteSpace: "nowrap" }}>{euro(f.vincite)}</span>
            </div>
            <div style={{ margin: "5px 0 3px" }}><Barretta valore={f.vincite} max={maxF} colore={COLORE} alta={4} /></div>
            <div style={{ fontSize: 11, color: "var(--ed-muto)" }}>{num(f.nipoti_corsi)} figli in corsa su {num(f.nipoti)}</div>
          </div>
        ))}
      </div>
      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I nipoti che hanno vinto di più</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {r.migliori.map(n => (
          <div key={n.nome} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
            <span style={{ minWidth: 0 }}>
              <Link href={`/horse/${encodeURIComponent(n.nome)}/${n.nato}`} className="collegamento-scheda"><span style={{ fontWeight: 700, color: "var(--ed-testo)" }}>{n.nome}</span></Link>
              {n.voto && <span style={{ marginLeft: 6 }}><GradeBadge grade={n.voto} size="sm" /></span>}
              <span style={{ display: "block", fontSize: 11, color: "var(--ed-muto)" }}>{n.nato} · figlio di {n.padre}</span>
            </span>
            <span className="tabular" style={{ color: COLORE, fontWeight: 700, alignSelf: "center", whiteSpace: "nowrap" }}>{euro(n.vincite)}</span>
          </div>
        ))}
      </div>
      <BottoneScheda nome={r.nome} />
    </div>
  );
}

function ComeNonni({ iniziale }: { iniziale: string | null }) {
  const desktop = useDesktop();
  const [periodo, setPeriodo] = useState("carriera");
  const [esteri, setEsteri] = useState(false);
  const [page, setPage] = useState(0);
  const [aperto, setAperto] = useState<string | null>(iniziale);
  const p = new URLSearchParams({ periodo });
  if (esteri) p.set("naz", "tutti");
  const { data, isLoading } = useQuery<Nonni>({
    queryKey: ["/api/classifiche/nipoti", p.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/classifiche/nipoti?${p.toString()}`)).json(),
    placeholderData: prev => prev,
  });
  const righe = data?.righe ?? [];
  // Arrivando dalla scheda di uno stallone, si apre la pagina in cui sta.
  useEffect(() => {
    if (!iniziale || !righe.length) return;
    const i = righe.findIndex(r => r.nome === iniziale);
    if (i >= 0) setPage(Math.floor(i / PAGE));
  }, [iniziale, righe.length]);
  const visibili = righe.slice(page * PAGE, page * PAGE + PAGE);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].nome : null);
  const sceltoR = righe.find(r => r.nome === scelto) ?? null;
  const max = Math.max(1, ...righe.map(r => r.vincite));
  const cambia = (f: () => void) => { f(); setPage(0); setAperto(null); };

  return (
    <div>
      <div className="ed-barra">
        <div className="ed-segm" role="group" aria-label="Periodo">
          <button aria-pressed={periodo === "carriera"} onClick={() => cambia(() => setPeriodo("carriera"))}>Tutto l'archivio</button>
          <button aria-pressed={periodo !== "carriera"} onClick={() => cambia(() => setPeriodo(String(data?.anno_riferimento ?? new Date().getFullYear())))}>Una stagione</button>
        </div>
        {periodo !== "carriera" && (
          <select value={periodo} onChange={e => cambia(() => setPeriodo(e.target.value))} aria-label="Stagione" style={sel}>
            {(data?.anni ?? []).map(a => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        )}
        <button className="chip-filtro" aria-pressed={esteri} data-attivo={esteri} onClick={() => cambia(() => setEsteri(v => !v))}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderColor: esteri ? COLORE : undefined, color: esteri ? COLORE : undefined }}>
          <Globe size={13} /> Anche i nipoti nati all'estero
        </button>
        {data && <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(data.stalloni)} stalloni con nipoti in corsa</span>}
      </div>
      {isLoading && !data ? <CavalloCaricamento label="Preparo la classifica..." /> : righe.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuno stallone per i filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {visibili.map((r, i) => {
                const att = scelto === r.nome;
                const pos = page * PAGE + i + 1;
                return (
                  <div key={r.nome} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : r.nome)} data-testid={`row-nonno-${i}`}>
                      <span className="ed-pos" data-podio={pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <NomeStallone nome={r.nome} voto={r.voto} />
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={r.vincite} max={max} colore={COLORE} /></span>
                        <span className="ed-sotto" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {num(r.figli_stalloni)} figli stalloni · {num(r.nipoti_corsi)} nipoti in corsa{r.figli[0] ? ` · il primo: ${r.figli[0].nome}` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: COLORE, whiteSpace: "nowrap" }}>{euro(r.vincite)}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)", whiteSpace: "nowrap" }}>{euro(r.media_nipote)} a nipote</span>
                      </span>
                    </button>
                    {!desktop && att && data && <div style={{ marginTop: 6 }}><SchedaNonno r={r} d={data} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            <Paginazione page={page} pagine={Math.max(1, Math.ceil(righe.length / PAGE))} set={n => { setPage(n); setAperto(null); }} />
          </div>
          {desktop && data && (sceltoR ? <SchedaNonno key={sceltoR.nome} r={sceltoR} d={data} />
            : <div className="ed-dettaglio ed-vuoto">Scegli uno stallone dall'elenco.</div>)}
        </div>
      )}
    </div>
  );
}

export default function ClassificheStalloniPage() {
  const q = parametri();
  const [tab, setTab] = useState<"stagione" | "nonni">(q.get("tab") === "nonni" ? "nonni" : "stagione");
  const iniziale = q.get("s");
  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Crown} colore={COLORE} titolo="Classifiche stalloni" margineSotto={16}
        sottotitolo="Gli stalloni stagione per stagione, e come nonni attraverso i figli stalloni.">
        Il voto di uno stallone guarda tutta la carriera dei figli. Qui invece si guarda una stagione alla volta: quanti figli hanno
        corso, quanto hanno vinto, quanti sono veloci e quanti hanno vinto tanto. Nella seconda linguetta si sale di una generazione:
        quanto vincono i figli dei figli stalloni, cioè quanto è forte la linea paterna. Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      <div className="ed-linguette" role="tablist">
        <button role="tab" className="ed-linguetta" aria-selected={tab === "stagione"} onClick={() => setTab("stagione")} data-testid="tab-stagione">
          <CalendarDays size={17} color={tab === "stagione" ? COLORE : "hsl(210 8% 50%)"} />
          <span><b>La stagione</b><small>Cosa hanno fatto i figli in un anno</small></span>
        </button>
        <button role="tab" className="ed-linguetta" aria-selected={tab === "nonni"} onClick={() => setTab("nonni")} data-testid="tab-nonni">
          <GitBranch size={17} color={tab === "nonni" ? COLORE : "hsl(210 8% 50%)"} />
          <span><b>Come nonni</b><small>Quanto vincono i figli dei figli stalloni</small></span>
        </button>
      </div>

      {tab === "stagione" ? <LaStagione /> : <ComeNonni iniziale={iniziale} />}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come è fatto il conto e cosa non dice" compatta>
          Si contano i figli che sono nell'archivio di StatIppica, di base solo quelli nati in Italia, e le loro vincite nette.
          Nella stagione, «tutte le età» vuol dire figli da 2 a 10 anni, e «anziani» da 5 a 10. Un cavallo che non ha mai corso a volte
          non è nell'archivio, quindi la percentuale di figli in corsa può uscire più alta del vero. «Come nonni» conta i nipoti
          per linea paterna (il padre del padre); uno stallone con tanti figli stalloni in monta ha più nipoti e quindi più vincite in tutto:
          per confrontare la qualità guarda anche la media a nipote. Le vincite in «tutto l'archivio» partono dal 2013.
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/stalloni/albero", titolo: "Albero degli stalloni", descrizione: "Papà, nonni, bisnonni e la linea paterna." },
        { href: "/stalloni", titolo: "Stalloni", descrizione: "Il catalogo con voti e prezzi di monta." },
        { href: "/classifiche-eta", titolo: "Classifiche per età", descrizione: "I migliori 2, 3, 4 anni e anziani." },
      ]} />
    </div>
  );
}
