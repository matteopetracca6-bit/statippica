/**
 * IPPODROMI E GRAN PREMI: una sola pagina per il "dove si corre".
 *
 * Tre linguette:
 *  - PISTE: le piste italiane, elenco a sinistra e scheda a destra, con il
 *    peso del numero di partenza e i Gran Premi corsi su quella pista;
 *  - GRAN PREMI: l'albo d'oro delle grandi corse dal 2014, corse a
 *    sinistra e vincitori a destra;
 *  - TREND: come cambiano voti, guadagni e gare negli anni.
 *
 * Gli indirizzi vecchi aprono la linguetta giusta: /ippodromi e /piste le
 * piste, /trend i trend, /gran-premi /albo-doro /palmares i Gran Premi.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MapPin, Trophy, LineChart, Search, X, ArrowRight, Landmark } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { CoppaGara } from "@/components/CoppaGara";
import { LinkGuidatore } from "@/components/Collegamenti";
import { GARE_GP, VITTORIE_GP, type VittoriaGP } from "@/data/granPremi";
import { colorePista } from "@/lib/piste";
import { tempoKm } from "@/lib/record";
import TrendsPage from "./TrendsPage";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro } from "../components/DueColonne";

const COLORE = "hsl(95 55% 52%)";
const ORO = "hsl(45 90% 58%)";

type Tab = "piste" | "granpremi" | "trend";

interface Track {
  track: string; nome: string; n_gare: number; n_cavalli: number; n_giornate: number;
  prima_gara: string | null; ultima_gara: string | null; distanza_tipica: number | null;
  tempo_km_mediano: number | null; premio_medio: number | null; premio_massimo: number | null;
  partenti_medi: number | null; vantaggio_interno: number | null; n_guidatori: number; attivo: number;
}
interface Partenza { start_pos: number; n_gare: number; pct_vittorie: number; pct_primi_tre: number }

const dataIt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const nomeGara = (id: string) => GARE_GP.find(g => g.id === id)?.nome ?? id;

/* ------------------------------------------------------------------ */
/* PISTE                                                                */
/* ------------------------------------------------------------------ */

function Partenze({ partenze }: { partenze: Partenza[] }) {
  const max = Math.max(...partenze.map(p => p.pct_primi_tre), 1);
  return (
    <div className="ed-pannello" style={{ marginBottom: 16 }} data-testid="pannello-partenze">
      <div className="ed-tit" style={{ marginTop: 0 }}>Quanto conta il numero di partenza</div>
      <p style={{ fontSize: 12.5, color: "var(--ed-muto)", lineHeight: 1.6, margin: "0 0 12px", maxWidth: 780 }}>
        Quante volte su cento si arriva nei primi tre, per numero di partenza, in tutte le corse dell'archivio con almeno cinque partenti.
        Non è un pronostico: è quello che è successo.
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150 }}>
        {partenze.map(p => {
          const col = p.start_pos <= 5 ? COLORE : p.start_pos <= 8 ? "hsl(60 70% 55%)" : "hsl(25 75% 58%)";
          return (
            <div key={p.start_pos} title={`Numero ${p.start_pos}: ${p.pct_primi_tre.toFixed(1).replace(".", ",")}% nei primi tre`}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              <span className="tabular" style={{ fontSize: 10.5, color: "var(--ed-testo)", fontWeight: 700 }}>{Math.round(p.pct_primi_tre)}%</span>
              <div style={{ width: "100%", maxWidth: 46, height: `${(p.pct_primi_tre / max) * 100}%`, background: col, borderRadius: "5px 5px 2px 2px", opacity: 0.85 }} />
              <span className="tabular" style={{ fontSize: 11, color: "var(--ed-muto)" }}>{p.start_pos}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--ed-fioco)", marginTop: 6 }}>numero di partenza · verde fino al 5, giallo fino all'8, arancio oltre</div>
      <Spiegazione titolo="Come si legge" compatta>
        Fino al quinto numero la quota resta intorno al 50%; dal sesto scende, e dal decimo in poi si dimezza. La differenza fra il primo e il
        dodicesimo è di circa venti punti, ed è uno degli effetti più grossi di questo archivio. Attenzione a cosa non dice: i numeri esterni non sono solo
        svantaggiati dalla posizione, ma in molte corse vengono assegnati ai cavalli con più vittorie alle spalle, che partono dietro per regolamento.
        Una parte del divario è quindi la posizione, una parte è chi ci viene messo.
      </Spiegazione>
    </div>
  );
}

function SchedaPista({ t, onClose, vaiGara }: { t: Track; onClose?: () => void; vaiGara: (id: string) => void }) {
  const c = colorePista(t.track);
  const gp = VITTORIE_GP.filter(v => v.pista === t.track);
  const perGara = Array.from(new Set(gp.map(v => v.gara))).map(id => ({ id, n: gp.filter(v => v.gara === id).length, ultima: gp.filter(v => v.gara === id).sort((a, b) => b.anno - a.anno)[0] }));
  return (
    <div className="ed-dettaglio" data-testid="scheda-pista" style={{ borderColor: `color-mix(in srgb, ${c} 40%, transparent)` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Ippodromo{!t.attivo ? " · non recente" : ""}</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: c, marginTop: 2, overflowWrap: "anywhere" }}>{t.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>dal {dataIt(t.prima_gara)} al {dataIt(t.ultima_gara)} · {num(t.n_giornate)} giornate</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Gare" valore={num(t.n_gare)} sotto={`${num(t.n_cavalli)} cavalli diversi`} />
        <Cifra titolo="Partire dentro vale" valore={t.vantaggio_interno != null ? `+${t.vantaggio_interno.toFixed(0)} punti` : "—"} colore={COLORE} sotto="nei primi tre, contro chi parte dal 7 in poi" />
        <Cifra titolo="Premio medio" valore={euro(t.premio_medio)} colore={ORO} sotto={t.premio_massimo ? `il più alto ${euro(t.premio_massimo)}` : undefined} />
        <Cifra titolo="Tempo tipico" valore={t.tempo_km_mediano ? tempoKm(t.tempo_km_mediano) : "—"} sotto={t.distanza_tipica ? `al km, su ${num(t.distanza_tipica)} m di solito` : "al km"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, fontSize: 12.5, color: "var(--ed-muto)" }}>
        <span>Partenti in media: <b style={{ color: "var(--ed-testo)" }}>{num(t.partenti_medi, 1)}</b></span>
        <span>Guidatori: <b style={{ color: "var(--ed-testo)" }}>{num(t.n_guidatori)}</b></span>
      </div>

      <div className="ed-etich" style={{ margin: "16px 0 8px" }}>Gran Premi corsi qui</div>
      {perGara.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Nessuno dei Gran Premi dell'albo d'oro si corre su questa pista.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {perGara.map(g => (
            <button key={g.id} onClick={() => vaiGara(g.id)} className="ed-riga" style={{ gridTemplateColumns: "30px minmax(0, 1fr) auto", padding: "8px 10px" }}>
              <CoppaGara gara={g.id} size={22} />
              <span style={{ minWidth: 0 }}>
                <span className="ed-nome" style={{ display: "block", fontSize: 12.5 }}>{nomeGara(g.id)}</span>
                <span className="ed-sotto" style={{ display: "block" }}>{g.n} edizioni · ultima: {g.ultima.anno} {g.ultima.vincitore}</span>
              </span>
              <ArrowRight size={14} color="var(--ed-muto)" />
            </button>
          ))}
        </div>
      )}

      <Link href={`/ippodromo/${encodeURIComponent(t.track)}`}>
        <a data-testid="link-scheda-pista" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda completa della pista <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

type OrdinePiste = "gare" | "interno" | "premio" | "nome";

function Piste({ vaiGara }: { vaiGara: (id: string) => void }) {
  const desktop = useDesktop();
  const [cerca, setCerca] = useState("");
  const [ordine, setOrdine] = useState<OrdinePiste>("gare");
  const [aperto, setAperto] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<{ disponibile: boolean; n: number; tracks: Track[]; partenze: Partenza[] }>({
    queryKey: ["/api/tracks"],
    queryFn: () => apiRequest("GET", "/api/tracks").then(r => r.json()),
  });
  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const t = (data?.tracks ?? []).filter(x => !q || x.nome.toLowerCase().includes(q) || x.track.toLowerCase().includes(q));
    const k = (x: Track) => ordine === "gare" ? x.n_gare : ordine === "interno" ? x.vantaggio_interno ?? -99 : ordine === "premio" ? x.premio_medio ?? 0 : 0;
    return ordine === "nome" ? [...t].sort((a, b) => a.nome.localeCompare(b.nome)) : [...t].sort((a, b) => k(b) - k(a));
  }, [data, cerca, ordine]);

  if (isLoading) return <CavalloCaricamento label="Carico gli ippodromi..." />;
  if (error) return <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Non riesco a caricare gli ippodromi. Riprova fra poco.</div>;
  if (!data?.disponibile) return <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>I dati sugli ippodromi saranno disponibili dal prossimo aggiornamento notturno.</div>;

  const scelto = aperto ?? (desktop && righe.length ? righe[0].track : null);
  const sceltoT = righe.find(t => t.track === scelto) ?? null;
  const maxGare = Math.max(1, ...righe.map(t => t.n_gare));
  const valore = (t: Track): [string, string, string] =>
    ordine === "interno" ? [t.vantaggio_interno != null ? `+${t.vantaggio_interno.toFixed(0)}` : "—", "punti dentro", COLORE]
      : ordine === "premio" ? [euro(t.premio_medio), "premio medio", ORO]
      : [num(t.n_gare), "gare", "var(--ed-testo)"];

  return (
    <div>
      {data.partenze?.length > 0 && <Partenze partenze={data.partenze} />}
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={cerca} onChange={e => { setCerca(e.target.value); setAperto(null); }} placeholder="Cerca un ippodromo" aria-label="Cerca un ippodromo" />
          {cerca && <button onClick={() => setCerca("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {([["gare", "Gare"], ["interno", "Partire dentro"], ["premio", "Premio medio"], ["nome", "Nome"]] as const).map(([k, t]) =>
            <button key={k} aria-pressed={ordine === k} onClick={() => setOrdine(k)}>{t}</button>)}
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{righe.length} piste</span>
      </div>
      {righe.length === 0 ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun ippodromo con questo nome.</div> : (
        <div className="ed-griglia">
          <div className="ed-lista">
            {righe.map((t, i) => {
              const att = scelto === t.track;
              const [v, et, col] = valore(t);
              const c = colorePista(t.track);
              return (
                <div key={t.track} style={{ minWidth: 0 }}>
                  <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? null : t.track)} data-testid={`row-pista-${i}`}>
                    <span className="ed-pos" data-podio={i < 3 && ordine !== "nome"}>{i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: c, flexShrink: 0 }} />{t.nome}
                        {!t.attivo && <span style={{ fontSize: 10, color: "var(--ed-fioco)", fontWeight: 600 }}>non recente</span>}
                      </span>
                      <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={t.n_gare} max={maxGare} colore={c} /></span>
                      <span className="ed-sotto" style={{ display: "block" }}>
                        {t.distanza_tipica ? `${num(t.distanza_tipica)} m` : "—"} · {num(t.partenti_medi, 1)} partenti · premio {euro(t.premio_medio)}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{v}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{et}</span>
                    </span>
                  </button>
                  {!desktop && att && <div style={{ marginTop: 6 }}><SchedaPista t={t} vaiGara={vaiGara} onClose={() => setAperto(null)} /></div>}
                </div>
              );
            })}
          </div>
          {desktop && (sceltoT ? <SchedaPista key={sceltoT.track} t={sceltoT} vaiGara={vaiGara} />
            : <div className="ed-dettaglio ed-vuoto">Scegli una pista dall'elenco.</div>)}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", marginTop: 18, lineHeight: 1.6 }}>
        «Partire dentro vale» è la differenza, su quella pista, fra la quota di arrivi nei primi tre partendo dai primi tre numeri e partendo dal settimo
        in poi. Le gare corse all'estero sono nell'archivio e contano nelle carriere dei cavalli, ma non hanno una scheda: la fonte le raccoglie tutte sotto
        un'unica voce, e sono decine di piste diverse in paesi diversi.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GRAN PREMI                                                           */
/* ------------------------------------------------------------------ */

function Divisione({ d }: { d: string | null }) {
  if (!d) return null;
  const f = d === "Femmine";
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, marginLeft: 6,
      color: f ? "hsl(330 75% 72%)" : "hsl(205 75% 70%)", background: f ? "hsl(330 60% 50% / 0.14)" : "hsl(205 60% 50% / 0.14)" }}>{f ? "Femmine" : "Maschi"}</span>
  );
}

function NomeCavallo({ v }: { v: VittoriaGP }) {
  const testo = <span style={{ fontWeight: 800, color: "var(--ed-testo)" }}>{v.vincitore}</span>;
  if (!v.scheda || !v.nato) return testo;
  return <Link href={`/horse/${encodeURIComponent(v.vincitore)}/${v.nato}`} className="collegamento-scheda">{testo}</Link>;
}

function SchedaGara({ id, filtro, onClose, vaiPista }: { id: string; filtro: string; onClose?: () => void; vaiPista: (p: string) => void }) {
  const g = GARE_GP.find(x => x.id === id)!;
  const righe = VITTORIE_GP.filter(v => v.gara === id && (!filtro || v.vincitore.includes(filtro)))
    .sort((a, b) => b.anno - a.anno || (a.divisione ?? "").localeCompare(b.divisione ?? ""));
  const tutte = VITTORIE_GP.filter(v => v.gara === id);
  const conteggio = new Map<string, number>();
  tutte.forEach(v => { if (v.driver) conteggio.set(v.driver, (conteggio.get(v.driver) ?? 0) + 1); });
  const topDriver = Array.from(conteggio.entries()).sort((a, b) => b[1] - a[1])[0];
  const piste = Array.from(new Set(tutte.map(v => v.pista).filter(Boolean))) as string[];
  const montepremi = tutte.filter(v => v.montepremi).sort((a, b) => b.anno - a.anno)[0];
  return (
    <div className="ed-dettaglio" data-testid="scheda-gara" style={{ borderColor: "color-mix(in srgb, " + ORO + " 40%, transparent)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <CoppaGara gara={g.id} size={40} title={g.nome} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Gran Premio</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: ORO, marginTop: 2, overflowWrap: "anywhere" }}>{g.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>{g.info}</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      {g.nota && <div style={{ fontSize: 12, color: "var(--ed-muto)", marginTop: 8 }}>{g.nota}</div>}

      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Edizioni" valore={num(tutte.length)} sotto={`dal ${Math.min(...tutte.map(v => v.anno))}`} />
        <Cifra titolo="Guidatore più vincente" valore={topDriver ? `${topDriver[1]}` : "—"} colore={ORO} sotto={topDriver ? topDriver[0] : undefined} />
        <Cifra titolo="Montepremi" valore={montepremi ? euro(montepremi.montepremi) : "—"} sotto={montepremi ? `nel ${montepremi.anno}` : undefined} />
      </div>
      {piste.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10, fontSize: 12, color: "var(--ed-muto)" }}>
          Si corre a:
          {piste.map(p => (
            <button key={p} className="chip-filtro" onClick={() => vaiPista(p)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: colorePista(p) }} />{p}
            </button>
          ))}
        </div>
      )}

      <div className="ed-etich" style={{ margin: "16px 0 8px" }}>Albo d'oro{filtro ? ` · solo ${filtro}` : ""}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 520, overflowY: "auto" }}>
        {righe.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Nessun vincitore con questo nome in questa corsa.</div>}
        {righe.map(v => (
          <div key={`${v.anno}-${v.divisione ?? ""}`} style={{ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) auto", gap: 10, alignItems: "center",
            padding: "8px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
            <a href={v.fonte} target="_blank" rel="noreferrer" title={`Fonte · ${dataIt(v.data)}`} className="tabular"
              style={{ fontSize: 14, fontWeight: 800, color: ORO, textDecoration: "none" }}>{v.anno}</a>
            <span style={{ minWidth: 0, fontSize: 13 }}>
              <NomeCavallo v={v} /><Divisione d={v.divisione} />
              <span style={{ display: "block", fontSize: 11.5, color: "var(--ed-muto)", marginTop: 2 }}>
                {v.driver ? <LinkGuidatore nome={v.driver} /> : "guidatore —"}
                {v.nota ? ` · ${v.nota}` : ""}
              </span>
            </span>
            <span style={{ textAlign: "right", fontSize: 12 }}>
              <span className="tabular" style={{ display: "block", color: "var(--ed-testo)" }}>{v.tempo ?? "—"}</span>
              {v.pista && <span style={{ display: "block", fontSize: 10.5, color: colorePista(v.pista) }}>{v.pista}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GranPremi({ iniziale, vaiPista }: { iniziale: string | null; vaiPista: (p: string) => void }) {
  const desktop = useDesktop();
  const [testo, setTesto] = useState("");
  const [aperto, setAperto] = useState<string | null>(iniziale);
  const q = testo.trim().toUpperCase();

  const plurivincitori = useMemo(() => {
    const m = new Map<string, { v: VittoriaGP; n: number; gare: Set<string> }>();
    for (const v of VITTORIE_GP) {
      const k = `${v.vincitore}|${v.nato ?? ""}`;
      const x = m.get(k) ?? { v, n: 0, gare: new Set<string>() };
      x.n += 1; x.gare.add(v.gara); m.set(k, x);
    }
    return Array.from(m.values()).filter(x => x.n >= 3).sort((a, b) => b.n - a.n || a.v.vincitore.localeCompare(b.v.vincitore));
  }, []);
  const nCavalli = new Set(VITTORIE_GP.map(v => `${v.vincitore}|${v.nato ?? ""}`)).size;
  const anni = VITTORIE_GP.map(v => v.anno);
  const gare = GARE_GP.filter(g => !q || VITTORIE_GP.some(v => v.gara === g.id && v.vincitore.includes(q)));
  const scelto = aperto && gare.some(g => g.id === aperto) ? aperto : desktop && gare.length ? gare[0].id : null;

  return (
    <div>
      <div className="ed-cifre">
        <Cifra titolo="Corse" valore={num(GARE_GP.length)} sotto="le più importanti in Italia" />
        <Cifra titolo="Edizioni" valore={num(VITTORIE_GP.length)} sotto={`dal ${Math.min(...anni)} a oggi`} />
        <Cifra titolo="Cavalli vincitori" valore={num(nCavalli)} />
        <Cifra titolo="Più titoli" valore={plurivincitori[0] ? `${plurivincitori[0].n}` : "—"} colore={ORO} sotto={plurivincitori[0]?.v.vincitore} />
      </div>

      {plurivincitori.length > 0 && (
        <div style={{ margin: "14px 0 4px" }}>
          <div className="ed-etich" style={{ marginBottom: 8 }}>Almeno tre titoli · tocca un nome per vedere solo le sue vittorie</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {plurivincitori.map(x => {
              const att = q === x.v.vincitore;
              return (
                <button key={x.v.vincitore + x.v.nato} onClick={() => { setTesto(att ? "" : x.v.vincitore); setAperto(null); }}
                  title={Array.from(x.gare).map(nomeGara).join(", ")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    background: att ? "hsl(45 80% 50% / 0.22)" : "hsl(45 80% 50% / 0.08)", border: `1px solid hsl(45 80% 55% / ${att ? 0.7 : 0.3})`,
                    color: "var(--ed-testo)", fontSize: 12.5 }}>
                  <span style={{ display: "inline-flex", gap: 1 }}>{Array.from(x.gare).slice(0, 4).map(g => <CoppaGara key={g} gara={g} size={14} />)}</span>
                  {x.v.vincitore}<b style={{ color: ORO }}>{x.n}</b>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="ed-barra" style={{ marginTop: 14 }}>
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={testo} onChange={e => { setTesto(e.target.value); setAperto(null); }} placeholder="Cerca un cavallo vincitore" aria-label="Cerca un cavallo" data-testid="input-cerca-gp" />
          {testo && <button onClick={() => setTesto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{gare.length} corse</span>
      </div>

      {gare.length === 0 ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun vincitore con questo nome.</div> : (
        <div className="ed-griglia">
          <div className="ed-lista">
            {gare.map((g, i) => {
              const att = scelto === g.id;
              const vv = VITTORIE_GP.filter(v => v.gara === g.id).sort((a, b) => b.anno - a.anno);
              const sue = q ? vv.filter(v => v.vincitore.includes(q)).length : 0;
              const ult = vv[0];
              return (
                <div key={g.id} style={{ minWidth: 0 }}>
                  <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : g.id)} data-testid={`row-gara-${g.id}`}
                    style={{ gridTemplateColumns: "40px minmax(0, 1fr) auto" }}>
                    <CoppaGara gara={g.id} size={30} />
                    <span style={{ minWidth: 0 }}>
                      <span className="ed-nome" style={{ display: "block" }}>{g.nome}</span>
                      <span className="ed-sotto" style={{ display: "block" }}>{g.info}</span>
                      {ult && <span className="ed-sotto" style={{ display: "block" }}>ultima: <b style={{ color: "var(--ed-testo)" }}>{ult.anno} {ult.vincitore}</b></span>}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: ORO }}>{q ? sue : vv.length}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{q ? (sue === 1 ? "vittoria" : "vittorie") : "edizioni"}</span>
                    </span>
                  </button>
                  {!desktop && att && <div style={{ marginTop: 6 }}><SchedaGara id={g.id} filtro={q} vaiPista={vaiPista} onClose={() => setAperto("")} /></div>}
                </div>
              );
            })}
          </div>
          {desktop && scelto && <SchedaGara key={scelto} id={scelto} filtro={q} vaiPista={vaiPista} />}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Spiegazione titolo="Da dove vengono questi nomi" compatta>
          Dal 2016 ogni vincitore è preso dai risultati ufficiali della Grande Ippica Italiana (il sito del Ministero), cercando la corsa per nome: per le
          gare con batterie conta solo la finale, le corse di consolazione sono escluse. Il 2014 e il 2015 non sono nel database ufficiale e vengono dagli
          albi d'oro degli ippodromi e da Wikipedia. Le corse del 2026 non ancora disputate compariranno quando si correranno. Toccando l'anno si apre la
          fonte; il nome del cavallo porta alla sua scheda quando il cavallo è nel nostro archivio.
        </Spiegazione>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PAGINA                                                               */
/* ------------------------------------------------------------------ */

export default function IppodromiTrendPage() {
  const [percorso] = useLocation();
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const iniz: Tab = percorso.startsWith("/trend") ? "trend"
    : percorso.startsWith("/gran-premi") || percorso.startsWith("/albo-doro") || percorso.startsWith("/palmares") ? "granpremi" : "piste";
  const [tab, setTab] = useState<Tab>(iniz);
  const [gara, setGara] = useState<string | null>(q.get("gara"));
  const [chiave, setChiave] = useState(0);
  const [, naviga] = useLocation();

  const vaiGara = (id: string) => { setGara(id); setChiave(k => k + 1); setTab("granpremi"); window.scrollTo?.(0, 0); };
  const vaiPista = (p: string) => naviga(`/ippodromo/${encodeURIComponent(p)}`);

  const tabs: { key: Tab; label: string; hint: string; icon: any }[] = [
    { key: "piste", label: "Piste", hint: "Le piste italiane e il numero di partenza", icon: MapPin },
    { key: "granpremi", label: "Gran Premi", hint: "I vincitori delle grandi corse dal 2014", icon: Trophy },
    { key: "trend", label: "Trend nel tempo", hint: "Voti, guadagni e gare negli anni", icon: LineChart },
  ];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Landmark} colore={COLORE} titolo="Ippodromi e Gran Premi" margineSotto={16}
        sottotitolo="Dove si corre, le grandi corse e i loro vincitori, e come cambiano i numeri negli anni.">
        Tre viste dello stesso tema. Nelle piste trovi quanto pesa il numero di partenza e, per ogni ippodromo, i Gran Premi che vi si corrono.
        Nei Gran Premi c'è l'albo d'oro delle grandi corse italiane dal 2014. Nei trend si vede come cambiano voti, guadagni e numero di gare negli anni.
        Tocca una riga per aprire la sua scheda.
      </IntestazionePagina>

      <div className="ed-linguette" role="tablist">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} role="tab" className="ed-linguetta" aria-selected={tab === t.key} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}>
              <Icon size={17} color={tab === t.key ? COLORE : "hsl(210 8% 50%)"} />
              <span><b>{t.label}</b><small>{t.hint}</small></span>
            </button>
          );
        })}
      </div>

      {tab === "piste" && <Piste vaiGara={vaiGara} />}
      {tab === "granpremi" && <GranPremi key={chiave} iniziale={gara} vaiPista={vaiPista} />}
      {tab === "trend" && <TrendsPage embedded />}

      <CollegamentiCorrelati voci={[
        { href: "/calendario", titolo: "Calendario", descrizione: "Le corse dei prossimi giorni, pista per pista." },
        { href: "/guidatori", titolo: "Guidatori", descrizione: "Chi porta i cavalli a rendere più del loro solito." },
        { href: "/cavalli", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati sull'archivio." },
      ]} />
    </div>
  );
}
