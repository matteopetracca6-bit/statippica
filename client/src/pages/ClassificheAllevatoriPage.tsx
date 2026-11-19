/**
 * CLASSIFICA DEGLI ALLEVATORI PER STAGIONE (novembre 2026).
 *
 * Per ogni allevamento: quanti suoi cavalli hanno corso in una stagione,
 * quante corse, vittorie e piazzamenti, quanto hanno vinto. Filtri per eta'
 * (2, 3, 4 anni, anziani, tutte) e ordine (vincite, vittorie, media a
 * cavallo). Idea vista su VendoPuledri, conti fatti con l'archivio corse di
 * StatIppica (server/classifiche.ts). L'allevamento non e' noto per tutti i
 * cavalli: la pagina scrive quanta parte dei premi della stagione e' coperta.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Medal, X, ChevronLeft, ChevronRight, ArrowRight, Info } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro } from "../components/DueColonne";

const COLORE = coloreScheda("/allevatori/classifiche");
// I premi in giallo come in tutto il sito (prima erano verdi solo qui).
const VERDE = "hsl(51 75% 58%)";
const PAGE = 30;
const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ed-bordo)", background: "var(--ed-fondo)", color: "var(--ed-testo)", fontSize: 12.5, fontFamily: "inherit" };
const ETA = [{ k: "tutte", t: "Tutte le età" }, { k: "2", t: "2 anni" }, { k: "3", t: "3 anni" }, { k: "4", t: "4 anni" }, { k: "anziani", t: "Anziani" }];
const ORDINI = [{ k: "vincite", t: "Vincite" }, { k: "vittorie", t: "Vittorie" }, { k: "media", t: "Media a cavallo" }];

interface Riga {
  nome: string; cavalli: number; corse: number; vittorie: number; piazzati: number; vincite: number;
  media_cavallo: number; pct_vittorie: number; di_vertice: number; migliore: { nome: string; nato: number; vincite: number } | null;
}
interface Dati {
  anno: number; anno_riferimento: number; eta: string; ordine: string; nati: [number, number]; anni: number[];
  allevatori: number; totale_vincite: number; copertura: { cavalli: number; cavalli_noti: number; pct_premi: number }; righe: Riga[];
}
interface Cavallo { nome: string; nato: number; sesso: string | null; padre: string | null; madre: string | null; corse: number; vittorie: number; piazzati: number; vincite: number; voto: string | null }

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

function SchedaAllevatore({ r, d, eta, onClose }: { r: Riga; d: Dati; eta: string; onClose?: () => void }) {
  const p = new URLSearchParams({ nome: r.nome, anno: String(d.anno), eta });
  const { data, isLoading } = useQuery<{ cavalli: Cavallo[] }>({
    queryKey: ["/api/classifiche/allevatori/cavalli", p.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/classifiche/allevatori/cavalli?${p.toString()}`)).json(),
  });
  return (
    <div className="ed-dettaglio" data-testid="scheda-allevatore-stagione">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Allevamento · stagione {d.anno}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORE, overflowWrap: "anywhere", marginTop: 3 }}>{r.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>cavalli nati fra il {d.nati[0]} e il {d.nati[1]}</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Vinto nella stagione" valore={euro(r.vincite)} colore={VERDE} sotto={`${num(r.vittorie)} vittorie, ${num(r.piazzati)} volte 2° o 3°`} />
        <Cifra titolo="Cavalli in corsa" valore={num(r.cavalli)} sotto={`${num(r.corse)} corse in tutto`} />
        <Cifra titolo="Media a cavallo" valore={euro(r.media_cavallo)} sotto={`vince il ${num(r.pct_vittorie, 1)}% delle corse`} />
      </div>
      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I suoi cavalli nella stagione, da chi ha vinto di più</div>
      {isLoading ? <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Carico...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
          {(data?.cavalli ?? []).map(c => (
            <div key={c.nome} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: "var(--ed-fondo2)" }}>
              <span style={{ minWidth: 0 }}>
                <Link href={`/horse/${encodeURIComponent(c.nome)}/${c.nato}`} className="collegamento-scheda">
                  <span style={{ fontWeight: 700, color: "var(--ed-testo)" }}>{c.nome}</span>
                </Link>
                {c.voto && <span style={{ marginLeft: 6 }}><GradeBadge grade={c.voto} size="sm" /></span>}
                <span style={{ display: "block", fontSize: 11, color: "var(--ed-muto)" }}>
                  {c.nato}{c.padre ? ` · di ${c.padre}` : ""} · {c.vittorie} vitt. su {c.corse}
                </span>
              </span>
              <span className="tabular" style={{ color: VERDE, fontWeight: 700, alignSelf: "center", whiteSpace: "nowrap" }}>{euro(c.vincite)}</span>
            </div>
          ))}
        </div>
      )}
      <Link href={`/allevatore/${encodeURIComponent(r.nome)}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda dell'allevatore <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function ClassificheAllevatoriPage() {
  const desktop = useDesktop();
  const [anno, setAnno] = useState("");
  const [eta, setEta] = useState("tutte");
  const [ordine, setOrdine] = useState("vincite");
  const [page, setPage] = useState(0);
  const [aperto, setAperto] = useState<string | null>(null);
  const p = new URLSearchParams({ eta, ordine });
  if (anno) p.set("anno", anno);
  const { data, isLoading } = useQuery<Dati>({
    queryKey: ["/api/classifiche/allevatori", p.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/classifiche/allevatori?${p.toString()}`)).json(),
    placeholderData: prev => prev,
  });
  useEffect(() => { setPage(0); setAperto(null); }, [anno, eta, ordine]);
  const righe = data?.righe ?? [];
  const visibili = righe.slice(page * PAGE, page * PAGE + PAGE);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].nome : null);
  const sceltoR = righe.find(r => r.nome === scelto) ?? null;
  const valore = (r: Riga) => (ordine === "vittorie" ? r.vittorie : ordine === "media" ? r.media_cavallo : r.vincite);
  const max = Math.max(1, ...righe.map(valore));

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Medal} colore={COLORE} titolo="Classifica allevatori" margineSotto={16}
        sottotitolo="Gli allevamenti stagione per stagione: cavalli in corsa, vittorie e vincite.">
        Per ogni allevamento si sommano le corse dei cavalli che ha fatto nascere, in una stagione e per l'età scelta.
        «Media a cavallo» mette in fila chi ha i cavalli che vincono di più uno per uno (servono almeno 3 cavalli in corsa).
        Tocca una riga per vedere i cavalli.
      </IntestazionePagina>

      <div className="ed-barra">
        <select value={anno || String(data?.anno ?? "")} onChange={e => setAnno(e.target.value)} aria-label="Stagione" style={sel} data-testid="select-stagione-allevatori">
          {(data?.anni ?? []).map(a => <option key={a} value={String(a)}>Stagione {a}</option>)}
        </select>
        <div className="ed-segm" role="group" aria-label="Età dei cavalli">
          {ETA.map(e => <button key={e.k} aria-pressed={eta === e.k} onClick={() => setEta(e.k)}>{e.t}</button>)}
        </div>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {ORDINI.map(o => <button key={o.k} aria-pressed={ordine === o.k} onClick={() => setOrdine(o.k)}>{o.t}</button>)}
        </div>
      </div>

      {data && data.copertura.cavalli > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "var(--ed-muto)", margin: "0 0 12px", lineHeight: 1.5 }} data-testid="copertura-allevatori">
          <Info size={14} style={{ flexShrink: 0, marginTop: 3 }} />
          <span>
            Conosciamo l'allevamento di {num(data.copertura.cavalli_noti)} cavalli su {num(data.copertura.cavalli)} che hanno corso,
            pari al {num(data.copertura.pct_premi, 1)}% dei premi della stagione. Gli altri non sono contati: ogni notte ne
            cerchiamo altri, quindi i totali crescono un po' alla volta. {num(data.allevatori)} allevamenti in classifica.
          </span>
        </div>
      )}

      {isLoading && !data ? <CavalloCaricamento label="Preparo la classifica..." /> : righe.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun allevamento per i filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {visibili.map((r, i) => {
                const att = scelto === r.nome;
                const pos = page * PAGE + i + 1;
                return (
                  <div key={r.nome} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : r.nome)} data-testid={`row-allevatore-${i}`}>
                      <span className="ed-pos" data-podio={pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: COLORE }}>{r.nome}</span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={valore(r)} max={max} colore={COLORE} /></span>
                        <span className="ed-sotto" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {num(r.cavalli)} cavalli · {num(r.vittorie)} vittorie su {num(r.corse)}{r.migliore ? ` · il migliore: ${r.migliore.nome}` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: VERDE, whiteSpace: "nowrap" }}>
                          {ordine === "vittorie" ? `${num(r.vittorie)} vitt.` : ordine === "media" ? euro(r.media_cavallo) : euro(r.vincite)}
                        </span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)", whiteSpace: "nowrap" }}>
                          {ordine === "vincite" ? `${euro(r.media_cavallo)} a cavallo` : euro(r.vincite)}
                        </span>
                      </span>
                    </button>
                    {!desktop && att && data && <div style={{ marginTop: 6 }}><SchedaAllevatore r={r} d={data} eta={eta} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            <Paginazione page={page} pagine={Math.max(1, Math.ceil(righe.length / PAGE))} set={n => { setPage(n); setAperto(null); }} />
          </div>
          {desktop && data && (sceltoR ? <SchedaAllevatore key={`${sceltoR.nome}|${data.anno}|${eta}`} r={sceltoR} d={data} eta={eta} />
            : <div className="ed-dettaglio ed-vuoto">Scegli un allevamento dall'elenco.</div>)}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come è fatto il conto e cosa non dice" compatta>
          Si contano le corse della stagione scelta, in Italia e all'estero, con le vincite nette. «Anziani» vuol dire da 5 a 14 anni.
          L'allevamento di un cavallo viene dalla rubrica raccolta da VendoPuledri; un cavallo allevato in società conta per ogni
          allevamento. La classifica è calcolata da StatIppica con il suo archivio e può differire da quelle pubblicate altrove.
          Un allevamento grande ha più cavalli e quindi più vincite in tutto: per confrontare la qualità guarda la media a cavallo.
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/allevamento", titolo: "Allevatori e stazioni di monta", descrizione: "Le schede degli allevatori con la qualità della produzione." },
        { href: "/stalloni/classifiche", titolo: "Classifiche stalloni", descrizione: "Gli stalloni per stagione e come nonni." },
        { href: "/classifiche-eta", titolo: "Classifiche per età", descrizione: "I migliori 2, 3, 4 anni e anziani." },
      ]} />
    </div>
  );
}
