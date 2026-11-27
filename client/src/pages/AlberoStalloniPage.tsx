/**
 * ALBERO DEGLI STALLONI (novembre 2026; nuova grafica 27/11/2026).
 *
 * Due linguette:
 *  - ELENCO: tutti gli stalloni con filtri (generazione, voto, in monta,
 *    ricerca) e ordine; a destra (da telefono sotto la riga) la scheda dello
 *    stallone scelto con la sua linea paterna, i figli stalloni e i figli
 *    nati anno per anno.
 *  - DINASTIE: le linee maschili come albero vero, dal capostipite ai papa'
 *    di oggi; ogni ramo si apre e si chiude, la ricerca apre il ramo fino allo
 *    stallone cercato.
 *
 * Le generazioni (papa', nonni, bisnonni...) vengono dagli anni in cui sono
 * nati i figli: server/alberoStalloni.ts. Il voto conta tutti i figli
 * registrati, ed e' poco affidabile sotto i 30 figli valutati.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { GitBranch, Search, X, Snowflake, ChevronRight, ChevronDown, ChevronLeft, List, Network, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import { CSS_DUE_COLONNE, Cifra, num, useDesktop } from "../components/DueColonne";
import { periodoMonta } from "@/lib/periodoMonta";

const COLORE = coloreScheda("/stalloni/albero");
const COLORI_GEN = ["hsl(120 55% 52%)", "hsl(183 65% 55%)", "hsl(210 70% 65%)", "hsl(265 55% 68%)", "hsl(35 70% 60%)"];
const VOTI = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const PER_PAGINA = 40;

interface Stallone {
  nome: string; nato: number | null; padre: string | null; figli: number;
  primo_figlio: number | null; ultimo_figlio: number | null; anno_punta: number | null; anno_centrale: number | null;
  monta_dal: number | null; monta_al: number | null; in_monta: boolean; fuori_catalogo_recente: boolean;
  morto: { data: string | null; fonte: string | null; url: string | null } | null; seme_congelato: boolean;
  stagione: string | null; generazione: number; voto: string | null; punteggio: number | null; figli_valutati: number;
  posto_generazione: number | null; su_generazione: number | null; per_anno: { anno: number; n: number }[];
  voto_confrontabile: boolean;
}
interface Albero {
  anno_riferimento: number; stagione: string | null; distanza_generazione: number; centrale_papa: number;
  generazioni: { indice: number; nome: string; da: number | null; a: number | null; stalloni: number }[];
  stalloni: Stallone[]; nomi: string[]; min_figli: number; anno_inizio_voto: number;
}

const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");
const dataIt = (d: string | null) => (d && d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d ?? "");

const CSS = `
.as-lista .ed-riga { grid-template-columns: 30px minmax(0, 1fr) auto; }
.as-gen { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.as-chip { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 10px; border-radius: 9px;
  border: 1px solid hsl(220 10% 20%); background: hsl(220 12% 10%); color: hsl(210 10% 90%); font-size: 12.5px; font-weight: 600;
  font-family: inherit; flex-shrink: 0; cursor: pointer; }
.as-chip[disabled] { cursor: default; opacity: .75; }
.as-chip small { font-size: 10.5px; font-weight: 500; }
.as-linea { display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.as-figli { display: flex; flex-wrap: wrap; gap: 6px; }
.as-albero { font-size: 13px; }
.as-nodo { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 8px; min-width: 0; }
.as-nodo:hover { background: hsl(220 12% 12%); }
.as-nodo[data-cercato="true"] { background: color-mix(in srgb, var(--ed-acc) 16%, transparent); }
.as-figli-albero { margin-left: 12px; padding-left: 10px; border-left: 1px solid hsl(220 10% 20%); }
.as-apri { background: none; border: none; color: hsl(210 8% 55%); cursor: pointer; display: flex; padding: 2px; flex-shrink: 0; }
.as-nome { background: none; border: none; color: hsl(210 10% 90%); font: inherit; font-weight: 700; cursor: pointer; padding: 0;
  text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.as-nome[data-virtuale="true"] { color: hsl(210 8% 62%); font-weight: 600; cursor: default; }
.as-meta { font-size: 11px; color: var(--ed-muto); white-space: nowrap; flex-shrink: 0; }
.as-barra { height: 6px; border-radius: 3px; flex-shrink: 0; opacity: .8; }
@media (max-width: 640px) { .as-meta.facoltativa { display: none; } .as-figli-albero { margin-left: 6px; padding-left: 8px; } }
`;

/* I figli nati anno per anno, su un asse comune a tutta la pagina. */
function Andamento({ per_anno, da, a, colore, alto = 40 }: { per_anno: { anno: number; n: number }[]; da: number; a: number; colore: string; alto?: number }) {
  const max = Math.max(1, ...per_anno.map(p => p.n));
  const W = 300, H = alto, larg = W / (a - da + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block" }}>
      <rect x={0} y={H - 1} width={W} height={1} fill="hsl(220 10% 20%)" />
      {per_anno.map(p => {
        const h = Math.max(1.5, (p.n / max) * (H - 3));
        return <rect key={p.anno} x={(p.anno - da) * larg} y={H - 1 - h} width={Math.max(1, larg - 0.6)} height={h} fill={colore} opacity={0.85} />;
      })}
    </svg>
  );
}

function Voto({ s }: { s: Stallone }) {
  if (!s.voto) return null;
  return <span title={s.voto_confrontabile ? "" : "Voto poco affidabile: meno di 30 figli valutati"} style={{ opacity: s.voto_confrontabile ? 1 : 0.45, display: "inline-flex" }}>
    <GradeBadge grade={s.voto} size="sm" /></span>;
}

function Chip({ nome, s, sotto, onClick }: { nome: string; s?: Stallone; sotto?: string; onClick?: () => void }) {
  const colore = s ? COLORI_GEN[s.generazione] : "hsl(210 8% 55%)";
  return (
    <button className="as-chip" onClick={onClick} disabled={!onClick} style={{ borderColor: s ? undefined : "hsl(220 10% 16%)" }}>
      <span style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>{nome}{s && <Voto s={s} />}</span>
      {sotto && <small style={{ color: colore }}>{sotto}</small>}
    </button>
  );
}

/* La scheda dello stallone scelto: linea paterna, figli stalloni, figli per anno. */
function Scheda({ s, perNome, figliDi, nomeGen, asse, scegli, onClose }: {
  s: Stallone; perNome: Map<string, Stallone>; figliDi: Map<string, Stallone[]>; nomeGen: (g: number) => string;
  asse: [number, number]; scegli: (n: string) => void; onClose?: () => void;
}) {
  const colore = COLORI_GEN[s.generazione];
  const su: string[] = [];
  let p = s.padre, giri = 0;
  while (p && giri++ < 10) { su.unshift(p); p = perNome.get(p)?.padre ?? null; }
  const figli = (figliDi.get(s.nome) ?? []).slice().sort((a, b) => (b.punteggio ?? -1) - (a.punteggio ?? -1) || b.figli - a.figli);
  return (
    <div className="ed-dettaglio" data-testid="scheda-stallone-albero" style={{ borderColor: `color-mix(in srgb, ${colore} 45%, transparent)` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="as-gen" style={{ color: colore }}>{nomeGen(s.generazione)}{s.posto_generazione ? ` · ${s.posto_generazione}° su ${s.su_generazione}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: "var(--ed-testo)", overflowWrap: "anywhere" }}>{s.nome}</span>
            {s.voto && <span style={{ opacity: s.voto_confrontabile ? 1 : 0.5 }}><GradeBadge grade={s.voto} /></span>}
            {s.seme_congelato && <span title="Deceduto, ancora nel catalogo: seme congelato" style={{ color: "hsl(195 80% 70%)", display: "flex" }}><Snowflake size={15} /></span>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3, lineHeight: 1.5 }}>
            {s.nato ? <>nato nel {s.nato} · </> : null}in monta {periodoMonta(s)}
            {s.morto ? <> · deceduto{s.morto.data ? ` il ${dataIt(s.morto.data)}` : ""}</> : null}
            {s.fuori_catalogo_recente ? <> · non nel catalogo italiano</> : null}
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Figli in archivio" valore={num(s.figli)} colore={colore} sotto={s.anno_punta ? `più figli nel ${s.anno_punta}` : undefined} />
        <Cifra titolo="Figli valutati" valore={num(s.figli_valutati)} sotto={s.voto_confrontabile ? "voto affidabile" : "meno di 30: voto poco affidabile"} />
        <Cifra titolo="Figli stalloni" valore={num(figli.length)} sotto="nell'albero" />
      </div>

      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Figli nati anno per anno · {asse[0]}–{asse[1]}</div>
      <Andamento per_anno={s.per_anno} da={asse[0]} a={asse[1]} colore={colore} />

      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Linea paterna</div>
      {su.length ? (
        <div className="as-linea">
          {su.map(n => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Chip nome={n} s={perNome.get(n)} sotto={perNome.has(n) ? nomeGen(perNome.get(n)!.generazione) : "fuori dall'albero"}
                onClick={perNome.has(n) ? () => scegli(n) : undefined} />
              <ChevronRight size={14} style={{ color: "var(--ed-muto)" }} />
            </span>
          ))}
          <Chip nome={s.nome} s={s} sotto="scelto" />
        </div>
      ) : <div style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>Il padre non è noto nell'archivio.</div>}

      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Figli stalloni</div>
      {figli.length ? (
        <div className="as-figli">
          {figli.slice(0, 30).map(f => <Chip key={f.nome} nome={f.nome} s={f} sotto={nomeGen(f.generazione)} onClick={() => scegli(f.nome)} />)}
          {figli.length > 30 && <span style={{ fontSize: 12, color: "var(--ed-muto)", alignSelf: "center" }}>e altri {figli.length - 30}</span>}
        </div>
      ) : <div style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>Nessun figlio stallone nell'albero.</div>}

      <Link href={`/stallion/${encodeURIComponent(s.nome)}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: colore, color: "hsl(220 13% 7%)",
        borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }} data-testid="apri-stallone">
        Scheda dello stallone <ArrowRight size={14} />
      </Link>
    </div>
  );
}

/* ─────────────────────────── Dinastie ─────────────────────────── */
interface Nodo { nome: string; s?: Stallone; figli: Nodo[]; discendenti: number; migliore: number }

function costruisciDinastie(stalloni: Stallone[]): Nodo[] {
  const perNome = new Map(stalloni.map(s => [s.nome, s]));
  // Padri fuori dall'albero (pochi figli in archivio) ma con almeno due figli
  // stalloni: diventano nodi "virtuali", cosi' i fratelli restano insieme.
  const contaFigli = new Map<string, number>();
  for (const s of stalloni) if (s.padre && s.padre !== s.nome) contaFigli.set(s.padre, (contaFigli.get(s.padre) ?? 0) + 1);
  const nodi = new Map<string, Nodo>();
  const nodo = (n: string): Nodo => { let x = nodi.get(n); if (!x) { x = { nome: n, s: perNome.get(n), figli: [], discendenti: 0, migliore: 0 }; nodi.set(n, x); } return x; };
  for (const s of stalloni) nodo(s.nome);
  for (const [p, k] of Array.from(contaFigli.entries())) if (!perNome.has(p) && k >= 2) nodo(p);
  const haPadre = new Set<string>();
  for (const s of stalloni) {
    if (!s.padre || s.padre === s.nome || !nodi.has(s.padre)) continue;
    // niente cicli (dati sporchi): si risale il padre e se si torna qui si salta
    let q: string | null | undefined = s.padre, giri = 0, ciclo = false;
    while (q && giri++ < 30) { if (q === s.nome) { ciclo = true; break; } q = perNome.get(q)?.padre; }
    if (ciclo) continue;
    nodo(s.padre).figli.push(nodo(s.nome)); haPadre.add(s.nome);
  }
  const calcola = (x: Nodo, visti = new Set<string>()): void => {
    if (visti.has(x.nome)) return; visti.add(x.nome);
    x.figli.forEach(f => calcola(f, visti));
    x.discendenti = x.figli.reduce((t, f) => t + 1 + f.discendenti, 0);
    x.migliore = Math.max(x.s?.punteggio ?? 0, ...x.figli.map(f => f.migliore));
    x.figli.sort((a, b) => b.discendenti - a.discendenti || (b.s?.punteggio ?? 0) - (a.s?.punteggio ?? 0));
  };
  const radici = Array.from(nodi.values()).filter(x => !haPadre.has(x.nome));
  radici.forEach(r => calcola(r));
  return radici.sort((a, b) => b.discendenti - a.discendenti || (b.s?.figli ?? 0) - (a.s?.figli ?? 0));
}

function RamoDinastia({ x, aperti, alterna, cercato, scegli, nomeGen, maxFigli }: {
  x: Nodo; aperti: Set<string>; alterna: (n: string) => void; cercato: string | null; scegli: (n: string) => void;
  nomeGen: (g: number) => string; maxFigli: number;
}) {
  const aperto = aperti.has(x.nome);
  const colore = x.s ? COLORI_GEN[x.s.generazione] : "hsl(210 8% 45%)";
  return (
    <div>
      <div className="as-nodo" data-cercato={cercato === x.nome} id={`dinastia-${x.nome.replace(/[^A-Z0-9]/g, "_")}`}>
        {x.figli.length ? (
          <button className="as-apri" onClick={() => alterna(x.nome)} aria-label={aperto ? "Chiudi il ramo" : "Apri il ramo"} aria-expanded={aperto}>
            {aperto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : <span style={{ width: 19, flexShrink: 0 }} />}
        <span className="as-barra" style={{ width: x.s ? Math.max(4, 46 * Math.sqrt(x.s.figli / maxFigli)) : 4, background: colore }} />
        <button className="as-nome" data-virtuale={!x.s} onClick={x.s ? () => scegli(x.nome) : undefined} title={x.s ? "Apri la scheda nell'elenco" : "Pochi figli in archivio: fuori dall'albero"}>{x.nome}</button>
        {x.s && <Voto s={x.s} />}
        {x.s?.seme_congelato && <Snowflake size={12} color="hsl(195 80% 70%)" />}
        <span className="as-meta facoltativa" style={{ color: colore }}>{x.s ? nomeGen(x.s.generazione) : "fuori albero"}</span>
        {x.figli.length > 0 && <span className="as-meta">{x.figli.length} {x.figli.length === 1 ? "figlio" : "figli"}{x.discendenti > x.figli.length ? ` · ${x.discendenti} discendenti` : ""}</span>}
      </div>
      {aperto && x.figli.length > 0 && (
        <div className="as-figli-albero">
          {x.figli.map(f => <RamoDinastia key={f.nome} x={f} aperti={aperti} alterna={alterna} cercato={cercato} scegli={scegli} nomeGen={nomeGen} maxFigli={maxFigli} />)}
        </div>
      )}
    </div>
  );
}

function Dinastie({ data, scegli, nomeGen }: { data: Albero; scegli: (n: string) => void; nomeGen: (g: number) => string }) {
  const radici = useMemo(() => costruisciDinastie(data.stalloni), [data]);
  const linee = radici.filter(r => r.discendenti > 0);
  const soli = radici.filter(r => r.discendenti === 0);
  const maxFigli = Math.max(1, ...data.stalloni.map(s => s.figli));
  const [aperti, setAperti] = useState<Set<string>>(() => new Set(linee.slice(0, 3).map(r => r.nome)));
  const [testo, setTesto] = useState("");
  const [cercato, setCercato] = useState<string | null>(null);
  const [tutteLinee, setTutteLinee] = useState(false);
  const alterna = (n: string) => setAperti(a => { const b = new Set(a); b.has(n) ? b.delete(n) : b.add(n); return b; });
  const perNome = useMemo(() => new Map(data.stalloni.map(s => [s.nome, s])), [data]);
  const trovati = useMemo(() => {
    const q = testo.trim().toUpperCase();
    return q.length < 2 ? [] : data.stalloni.filter(s => s.nome.includes(q)).slice(0, 8);
  }, [testo, data]);
  const vaiA = (n: string) => {
    // apre i rami dal capostipite fino allo stallone
    const su: string[] = [];
    let p = perNome.get(n)?.padre, giri = 0;
    while (p && giri++ < 30) { su.push(p); p = perNome.get(p)?.padre; }
    setAperti(a => new Set([...Array.from(a), ...su]));
    setCercato(n); setTesto(""); setTutteLinee(true);
    setTimeout(() => document.getElementById(`dinastia-${n.replace(/[^A-Z0-9]/g, "_")}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const mostrate = tutteLinee ? linee : linee.slice(0, 12);
  return (
    <div className="ed-pannello" data-testid="dinastie">
      <div className="ed-barra">
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <label className="ed-cerca" style={{ maxWidth: "none" }}>
            <Search size={15} style={{ color: "var(--ed-muto)" }} />
            <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca uno stallone nelle dinastie" aria-label="Cerca nelle dinastie" data-testid="cerca-dinastie" />
          </label>
          {trovati.length > 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "hsl(220 14% 11%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 10, padding: 4 }}>
              {trovati.map(s => (
                <button key={s.nome} onClick={() => vaiA(s.nome)} style={{ display: "flex", justifyContent: "space-between", gap: 10, width: "100%", background: "none", border: "none", color: "hsl(210 10% 90%)", padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left" }}>
                  <span>{s.nome}</span><span style={{ color: COLORI_GEN[s.generazione], fontSize: 11.5 }}>{nomeGen(s.generazione)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="chip-filtro" onClick={() => setAperti(new Set(linee.map(r => r.nome)))}>Apri i capostipiti</button>
        <button className="chip-filtro" onClick={() => { setAperti(new Set()); setCercato(null); }}>Chiudi tutto</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--ed-muto)", marginBottom: 10, lineHeight: 1.5 }}>
        {linee.length} linee maschili, dal capostipite ai papà di oggi. La barra colorata è lunga quanto i figli in archivio, il colore è la generazione;
        i nomi grigi sono padri con pochi figli in archivio, fuori dall'albero, che tengono insieme i fratelli. Tocca un nome per la sua scheda.
      </div>
      <div className="as-albero">
        {mostrate.map(r => <RamoDinastia key={r.nome} x={r} aperti={aperti} alterna={alterna} cercato={cercato} scegli={scegli} nomeGen={nomeGen} maxFigli={maxFigli} />)}
      </div>
      {linee.length > mostrate.length && (
        <button className="chip-filtro" style={{ marginTop: 10 }} onClick={() => setTutteLinee(true)}>Mostra tutte le {linee.length} linee</button>
      )}
      {soli.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--ed-muto)" }}>{soli.length} stalloni senza padre né figli stalloni nell'albero</summary>
          <div className="as-figli" style={{ marginTop: 8 }}>
            {soli.slice(0, 200).map(r => <Chip key={r.nome} nome={r.nome} s={r.s} sotto={r.s ? nomeGen(r.s.generazione) : undefined} onClick={r.s ? () => scegli(r.nome) : undefined} />)}
          </div>
        </details>
      )}
    </div>
  );
}

/* ─────────────────────────── Pagina ─────────────────────────── */
export default function AlberoStalloniPage() {
  const { data, isLoading } = useQuery<Albero>({
    queryKey: ["/api/stalloni/albero"],
    queryFn: async () => (await apiRequest("GET", "/api/stalloni/albero")).json(),
  });
  const desktop = useDesktop();
  const [vista, setVista] = useState<"elenco" | "dinastie">(() => parametri().get("vista") === "dinastie" ? "dinastie" : "elenco");
  const [scelto, setScelto] = useState<string | null>(() => parametri().get("s")?.toUpperCase() ?? null);
  const [gen, setGen] = useState<number | null>(null);
  const [voto, setVoto] = useState("");
  const [soloMonta, setSoloMonta] = useState(false);
  const [cerca, setCerca] = useState("");
  const [ordine, setOrdine] = useState<"voto" | "figli" | "anno">("voto");
  const [pagina, setPagina] = useState(1);
  const [aperto, setAperto] = useState<string | null>(null);

  const perNome = useMemo(() => new Map((data?.stalloni ?? []).map(s => [s.nome, s])), [data]);
  const figliDi = useMemo(() => {
    const m = new Map<string, Stallone[]>();
    for (const s of data?.stalloni ?? []) if (s.padre) m.set(s.padre, [...(m.get(s.padre) ?? []), s]);
    return m;
  }, [data]);
  const asse = useMemo<[number, number]>(() => {
    const anni = (data?.stalloni ?? []).map(s => s.primo_figlio ?? 9999);
    return [Math.min(...anni, data?.anno_riferimento ?? 2024), data?.anno_riferimento ?? 2024];
  }, [data]);
  const nomeGen = (g: number) => data?.nomi?.[g] ?? "";

  const filtrati = useMemo(() => {
    const q = cerca.trim().toUpperCase();
    const el = (data?.stalloni ?? []).filter(s => (gen == null || s.generazione === gen) && (!voto || s.voto === voto)
      && (!soloMonta || s.in_monta) && (!q || s.nome.includes(q) || (s.padre ?? "").includes(q)));
    const k = (s: Stallone) => ordine === "figli" ? -s.figli : ordine === "anno" ? -(s.anno_centrale ?? 0)
      : -((s.voto_confrontabile ? 1000 : 0) + (s.punteggio ?? -1));
    return el.sort((a, b) => k(a) - k(b) || b.figli - a.figli);
  }, [data, gen, voto, soloMonta, cerca, ordine]);
  useEffect(() => { setPagina(1); }, [gen, voto, soloMonta, cerca, ordine]);
  const pagine = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const p = Math.min(pagina, pagine);
  const visibili = filtrati.slice((p - 1) * PER_PAGINA, p * PER_PAGINA);
  const sceltoS = (scelto && perNome.get(scelto)) || (desktop ? visibili[0] : null) || null;

  const scegli = (n: string) => {
    setVista("elenco"); setScelto(n); setAperto(n);
    // se lo stallone non e' nella pagina dell'elenco, si tolgono i filtri e si va alla sua pagina
    const i = filtrati.findIndex(x => x.nome === n);
    if (i < 0) { setGen(null); setVoto(""); setSoloMonta(false); setCerca(""); }
    else setPagina(Math.floor(i / PER_PAGINA) + 1);
    setTimeout(() => document.getElementById(`riga-${n.replace(/[^A-Z0-9]/g, "_")}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE + CSS}</style>
      <IntestazionePagina icona={GitBranch} colore={COLORE} titolo="Albero degli stalloni" margineSotto={16}
        sottotitolo="Tutti gli stalloni per generazione e le loro dinastie: papà, nonni, bisnonni e così via.">
        Ogni stallone sta nella generazione degli anni in cui ha fatto più figli: si guarda l'anno centrale dei figli in archivio.
        I papà sono gli stalloni in monta nella stagione {data?.stagione ?? "di adesso"}, compresi quelli deceduti che restano nel catalogo,
        come VARENNE (fiocco di neve), e quelli fuori dal catalogo italiano con figli nati fino all'ultimo anno. Fra un padre e un suo figlio
        stallone passano di solito {data?.distanza_generazione ?? 8} anni: è la distanza che separa le generazioni.
        <br /><br />
        Il voto conta tutti i figli registrati (dal 2012 con il voto delle corse, prima con quello storico) ed è sbiadito sotto i 30 figli valutati.
        Ogni stallone si confronta solo con quelli della sua generazione. Nell'albero entrano gli stalloni con almeno {data?.min_figli ?? 10} figli
        in archivio e tutti quelli che hanno un voto.
      </IntestazionePagina>

      {isLoading && <CavalloCaricamento label="Costruisco l'albero..." />}

      {data && <>
        <div className="ed-cifre" style={{ marginBottom: 14 }}>
          {data.generazioni.map(g => (
            <Cifra key={g.indice} titolo={g.nome} valore={num(g.stalloni)} colore={COLORI_GEN[g.indice]}
              sotto={g.da != null ? (g.da === g.a ? `figli intorno al ${g.da}` : `figli intorno al ${g.da}–${g.a}`) : undefined} />
          ))}
        </div>

        <div className="ed-linguette" role="tablist">
          {([["elenco", "Elenco", "Cerca, filtra e confronta", List], ["dinastie", "Dinastie", "Chi discende da chi", Network]] as const).map(([k, t, h, Icona]) => (
            <button key={k} role="tab" className="ed-linguetta" aria-selected={vista === k} onClick={() => setVista(k)} data-testid={`tab-${k}`}>
              <Icona size={17} color={vista === k ? COLORE : "hsl(210 8% 50%)"} />
              <span><b>{t}</b><small>{h}</small></span>
            </button>
          ))}
        </div>

        {vista === "dinastie" ? <Dinastie data={data} scegli={scegli} nomeGen={nomeGen} /> : <>
          <div className="ed-barra">
            <label className="ed-cerca">
              <Search size={15} style={{ color: "var(--ed-muto)" }} />
              <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca uno stallone o un padre" aria-label="Cerca" data-testid="cerca-albero" />
              {cerca && <button onClick={() => setCerca("")} aria-label="Cancella" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
            </label>
            <div className="ed-segm" role="group" aria-label="Generazione">
              <button aria-pressed={gen == null} onClick={() => setGen(null)}>Tutte</button>
              {data.generazioni.map(g => <button key={g.indice} aria-pressed={gen === g.indice} onClick={() => setGen(g.indice)} data-testid={`gen-${g.indice}`}>{g.nome}</button>)}
            </div>
          </div>
          <div className="ed-barra">
            <select value={voto} onChange={e => setVoto(e.target.value)} aria-label="Voto"
              style={{ background: "var(--ed-fondo)", border: "1px solid var(--ed-bordo)", color: "var(--ed-testo)", borderRadius: 9, padding: "8px 10px", fontFamily: "inherit", fontSize: 12.5 }}>
              <option value="">Ogni voto</option>
              {VOTI.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="chip-filtro" aria-pressed={soloMonta} onClick={() => setSoloMonta(x => !x)}
              style={{ borderColor: soloMonta ? COLORE : undefined, color: soloMonta ? COLORE : undefined }}>Solo in monta</button>
            <div className="ed-segm" role="group" aria-label="Ordina per">
              <button aria-pressed={ordine === "voto"} onClick={() => setOrdine("voto")}>Voto</button>
              <button aria-pressed={ordine === "figli"} onClick={() => setOrdine("figli")}>Figli</button>
              <button aria-pressed={ordine === "anno"} onClick={() => setOrdine("anno")}>Più recenti</button>
            </div>
            <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(filtrati.length)} stalloni</span>
          </div>

          <div className="ed-griglia">
            <div className="ed-lista as-lista">
              {!visibili.length && <div className="ed-pannello ed-vuoto">Nessuno stallone con questi filtri.</div>}
              {visibili.map((s, i) => {
                const pos = (p - 1) * PER_PAGINA + i + 1;
                const attivo = sceltoS?.nome === s.nome;
                return (
                  <div key={s.nome}>
                    <button className="ed-riga" data-attiva={attivo} id={`riga-${s.nome.replace(/[^A-Z0-9]/g, "_")}`} data-testid={`riga-${s.nome}`}
                      onClick={() => { setScelto(s.nome); setAperto(a => desktop ? s.nome : a === s.nome ? null : s.nome); }}>
                      <span className="ed-pos" data-podio={pos <= 3 && ordine === "voto"}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 6 }}>{s.nome}{s.seme_congelato && <Snowflake size={12} color="hsl(195 80% 70%)" />}</span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          <span className="as-gen" style={{ color: COLORI_GEN[s.generazione] }}>{nomeGen(s.generazione)}</span>
                          {s.padre ? <> · da {s.padre}</> : null} · {num(s.figli)} figli · in monta {periodoMonta(s)}
                        </span>
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <Voto s={s} />
                        {s.posto_generazione && <span style={{ fontSize: 10.5, color: "var(--ed-fioco)" }}>{s.posto_generazione}° su {s.su_generazione}</span>}
                      </span>
                    </button>
                    {!desktop && aperto === s.nome && (
                      <div style={{ marginTop: 6 }}>
                        <Scheda s={s} perNome={perNome} figliDi={figliDi} nomeGen={nomeGen} asse={asse} scegli={scegli} onClose={() => setAperto(null)} />
                      </div>
                    )}
                  </div>
                );
              })}
              {pagine > 1 && (
                <div className="ed-pagine">
                  <button disabled={p <= 1} onClick={() => setPagina(p - 1)} aria-label="Pagina precedente"><ChevronLeft size={14} /></button>
                  pagina {p} di {pagine}
                  <button disabled={p >= pagine} onClick={() => setPagina(p + 1)} aria-label="Pagina successiva"><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
            {desktop && (sceltoS
              ? <Scheda s={sceltoS} perNome={perNome} figliDi={figliDi} nomeGen={nomeGen} asse={asse} scegli={scegli} />
              : <div className="ed-dettaglio ed-vuoto">Scegli uno stallone dall'elenco.</div>)}
          </div>
        </>}
      </>}
    </div>
  );
}
