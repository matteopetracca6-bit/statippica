/**
 * CLASSIFICHE PER ETA' (novembre 2026).
 *
 * I migliori 2 anni, 3 anni, 4 anni e anziani, per vincite: in carriera
 * (l'eta' di adesso) o in una sola stagione. Per ognuno padre, madre, nonno
 * materno e miglior tempo su distanza breve e lunga. Il calcolo e' in
 * server/classifiche.ts e usa solo l'archivio corse di StatIppica.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Medal, X, ChevronLeft, ChevronRight, ArrowRight, Globe } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import { tempoKm } from "@/lib/record";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro, nomeBello } from "../components/DueColonne";

const COLORE = "hsl(45 85% 58%)";
const ORO = "hsl(51 80% 62%)";
const PAGE = 30;

interface Riga {
  nome: string; nato: number; sesso: string | null; padre: string | null; madre: string | null; nonno: string | null;
  corse: number; vittorie: number; primi_tre: number; vincite: number; breve: number | null; lunga: number | null; voto: string | null;
}
interface Risposta {
  anno: number; anno_riferimento: number; periodo: "carriera" | "stagione"; eta: string; nati: [number, number];
  totale_cavalli: number; totale_vincite: number; righe: Riga[]; anni: number[];
}

const ETA = [{ k: "2", t: "2 anni" }, { k: "3", t: "3 anni" }, { k: "4", t: "4 anni" }, { k: "anziani", t: "Anziani" }];
const sessoTesto = (s: string | null) => (s === "F" ? "femmina" : s === "C" ? "castrone" : s === "M" ? "maschio" : "");
const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ed-bordo)", background: "var(--ed-fondo)", color: "var(--ed-testo)", fontSize: 12.5, fontFamily: "inherit" };

function LinkStallone({ nome }: { nome: string | null }) {
  if (!nome) return <span style={{ color: "var(--ed-fioco)" }}>—</span>;
  return <Link href={`/stallion/${encodeURIComponent(nome)}`} className="collegamento-scheda"><span style={{ color: ORO, fontWeight: 700 }}>{nome}</span></Link>;
}

function Scheda({ r, d, onClose }: { r: Riga; d: Risposta; onClose?: () => void }) {
  const quando = d.periodo === "stagione" ? `nella stagione ${d.anno}` : "in carriera";
  return (
    <div className="ed-dettaglio" data-testid="scheda-leader">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">{d.eta === "anziani" ? "Anziano" : `${d.eta} anni`} · {quando}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: "var(--ed-testo)", overflowWrap: "anywhere" }}>{r.nome}</span>
            {r.voto && <GradeBadge grade={r.voto} />}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>nato nel {r.nato}{r.sesso ? ` · ${sessoTesto(r.sesso)}` : ""}</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Vincite" valore={euro(r.vincite)} colore={COLORE} sotto={quando} />
        <Cifra titolo="Vittorie" valore={num(r.vittorie)} sotto={`su ${num(r.corse)} corse · ${num(r.primi_tre)} volte nei primi tre`} />
        <Cifra titolo="Tempo breve" valore={tempoKm(r.breve)} sotto="il migliore sotto i 2000 m" />
        <Cifra titolo="Tempo lungo" valore={tempoKm(r.lunga)} sotto="il migliore da 2000 m in su" />
      </div>
      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Famiglia</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "5px 12px", fontSize: 13 }}>
        <span style={{ color: "var(--ed-muto)" }}>Padre</span><span><LinkStallone nome={r.padre} /></span>
        <span style={{ color: "var(--ed-muto)" }}>Madre</span><span style={{ color: "var(--ed-testo)" }}>{r.madre || "—"}</span>
        <span style={{ color: "var(--ed-muto)" }}>Nonno materno</span><span><LinkStallone nome={r.nonno} /></span>
      </div>
      <Link href={`/horse/${encodeURIComponent(r.nome)}/${r.nato}`}>
        <a data-testid="link-scheda-cavallo" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda del cavallo <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function ClassificheEtaPage() {
  const desktop = useDesktop();
  const [eta, setEta] = useState("3");
  const [periodo, setPeriodo] = useState<string>("carriera");
  const [sesso, setSesso] = useState("");
  const [ordine, setOrdine] = useState("vincite");
  const [esteri, setEsteri] = useState(false);
  const [page, setPage] = useState(0);
  const [aperto, setAperto] = useState<string | null>(null);

  const params = new URLSearchParams({ eta, periodo, ordine });
  if (sesso) params.set("sesso", sesso);
  if (esteri) params.set("naz", "tutti");
  const { data, isLoading } = useQuery<Risposta>({
    queryKey: ["/api/classifiche/eta", params.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/classifiche/eta?${params.toString()}`)).json(),
    placeholderData: prev => prev,
  });
  useEffect(() => { setPage(0); setAperto(null); }, [eta, periodo, sesso, ordine, esteri]);

  const righe = data?.righe ?? [];
  const pagine = Math.max(1, Math.ceil(righe.length / PAGE));
  const visibili = righe.slice(page * PAGE, page * PAGE + PAGE);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].nome : null);
  const sceltoR = righe.find(r => r.nome === scelto) ?? null;
  const max = Math.max(1, ...righe.map(r => r.vincite));
  const anni = data?.anni ?? [];
  const annoStag = periodo === "carriera" ? null : periodo;
  const tempo = ordine === "breve" || ordine === "lunga";

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Medal} colore={COLORE} titolo="Classifiche per età" margineSotto={16}
        sottotitolo="I migliori 2 anni, 3 anni, 4 anni e anziani: in carriera o in una sola stagione.">
        Ogni classifica mette in fila i cavalli della stessa età per quanto hanno vinto. «In carriera» guarda l'età di adesso e conta
        tutte le corse; «Stagione» guarda un solo anno e l'età che i cavalli avevano quell'anno. Per ognuno trovi padre, madre,
        nonno materno e il miglior tempo al chilometro sulla distanza breve e su quella lunga. Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      <div className="ed-barra">
        <div className="ed-segm" role="group" aria-label="Età">
          {ETA.map(e => <button key={e.k} aria-pressed={eta === e.k} onClick={() => setEta(e.k)} data-testid={`eta-${e.k}`}>{e.t}</button>)}
        </div>
        <div className="ed-segm" role="group" aria-label="Periodo">
          <button aria-pressed={periodo === "carriera"} onClick={() => setPeriodo("carriera")}>In carriera</button>
          <button aria-pressed={periodo !== "carriera"} onClick={() => setPeriodo(String(data?.anno_riferimento ?? anni[0] ?? new Date().getFullYear()))}>Stagione</button>
        </div>
        {annoStag && (
          <select value={annoStag} onChange={e => setPeriodo(e.target.value)} aria-label="Stagione" style={sel} data-testid="select-stagione">
            {anni.map(a => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        )}
        <div className="ed-segm" role="group" aria-label="Sesso">
          <button aria-pressed={sesso === ""} onClick={() => setSesso("")}>Tutti</button>
          <button aria-pressed={sesso === "M"} onClick={() => setSesso("M")}>Maschi</button>
          <button aria-pressed={sesso === "F"} onClick={() => setSesso("F")}>Femmine</button>
        </div>
      </div>
      <div className="ed-barra" style={{ marginTop: -4 }}>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          <button aria-pressed={ordine === "vincite"} onClick={() => setOrdine("vincite")}>Vincite</button>
          <button aria-pressed={ordine === "vittorie"} onClick={() => setOrdine("vittorie")}>Vittorie</button>
          <button aria-pressed={ordine === "breve"} onClick={() => setOrdine("breve")}>Tempo breve</button>
          <button aria-pressed={ordine === "lunga"} onClick={() => setOrdine("lunga")}>Tempo lungo</button>
        </div>
        <button className="chip-filtro" aria-pressed={esteri} data-attivo={esteri} onClick={() => setEsteri(v => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderColor: esteri ? COLORE : undefined, color: esteri ? COLORE : undefined }}>
          <Globe size={13} /> Anche i nati all'estero
        </button>
        {data && (
          <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>
            nati nel {data.nati[0] === data.nati[1] ? data.nati[0] : `${data.nati[0]}–${data.nati[1]}`} · {num(data.totale_cavalli)} cavalli · {euro(data.totale_vincite)} vinti
          </span>
        )}
      </div>

      {isLoading && !data ? <CavalloCaricamento label="Preparo la classifica..." /> : righe.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun cavallo per i filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {visibili.map((r, i) => {
                const att = scelto === r.nome;
                const pos = page * PAGE + i + 1;
                return (
                  <div key={r.nome} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : r.nome)} data-testid={`row-leader-${i}`}>
                      <span className="ed-pos" data-podio={pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.nome}</span>
                          {r.voto && <GradeBadge grade={r.voto} size="sm" />}
                          {r.sesso && <span style={{ fontSize: 10.5, fontWeight: 700, color: r.sesso === "F" ? "hsl(330 70% 70%)" : "hsl(205 70% 68%)", flexShrink: 0 }}>{r.sesso === "F" ? "F" : r.sesso === "C" ? "C" : "M"}</span>}
                        </span>
                        {!tempo && <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={r.vincite} max={max} colore={COLORE} /></span>}
                        <span className="ed-sotto" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.padre ? nomeBello(r.padre) : "padre —"} · {r.madre ? nomeBello(r.madre) : "madre —"}{r.nonno ? ` (${nomeBello(r.nonno)})` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: COLORE, whiteSpace: "nowrap" }}>
                          {ordine === "breve" ? tempoKm(r.breve) : ordine === "lunga" ? tempoKm(r.lunga) : ordine === "vittorie" ? `${r.vittorie} vitt.` : euro(r.vincite)}
                        </span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)", whiteSpace: "nowrap" }}>
                          {ordine === "vincite" ? `${r.vittorie} vitt. su ${r.corse}` : euro(r.vincite)}
                        </span>
                      </span>
                    </button>
                    {!desktop && att && data && <div style={{ marginTop: 6 }}><Scheda r={r} d={data} onClose={() => setAperto("")} /></div>}
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
          {desktop && data && (sceltoR ? <Scheda key={sceltoR.nome} r={sceltoR} d={data} />
            : <div className="ed-dettaglio ed-vuoto">Scegli un cavallo dall'elenco.</div>)}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come è fatto il conto e cosa non dice" compatta>
          Le vincite sono quelle nette delle corse nell'archivio di StatIppica, comprese quelle all'estero che l'archivio conosce.
          Di base si vedono solo i cavalli nati in Italia; «Anche i nati all'estero» aggiunge gli altri. «Maschi» comprende i castroni.
          Nella classifica in carriera degli anziani restano solo quelli che hanno corso nella stagione in corso. Il tempo «breve» è il
          migliore sotto i 2000 metri, quello «lungo» il migliore da 2000 metri in su, contando solo le corse in cui il cavallo è arrivato.
          Si vedono i primi 200 di ogni classifica.
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/leaderboard", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati, con il voto." },
        { href: "/stalloni/classifiche", titolo: "Classifiche stalloni", descrizione: "Gli stalloni per stagione e come nonni." },
        { href: "/qualifiche", titolo: "Qualifiche", descrizione: "Il primo tempo dei giovani." },
      ]} />
    </div>
  );
}
