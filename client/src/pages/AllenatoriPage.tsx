/**
 * Pagina degli allenatori.
 *
 * L'allenatore arriva dai risultati ufficiali MASAF, che lo riportano dal
 * 2016: tutti i numeri di questa pagina partono da li'.
 *
 * Come per i guidatori, vittorie e premi dicono soprattutto QUALI cavalli ha
 * in scuderia un allenatore, non quanto li fa rendere. Per questo accanto ai
 * conti semplici c'e' il rendimento "a parita' di cavallo", misurato solo sui
 * cavalli passati per piu' allenatori: e' l'unico posto dove il confronto
 * esiste davvero. Chi ha avuto sempre gli stessi cavalli resta "non
 * giudicabile" invece di uscire nella media per finta.
 *
 * Layout a due colonne come Guidatori: elenco a sinistra, scheda a destra.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X, Timer, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento, ErroreCaricamento } from "../components/Caricamento";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import GradeBadge from "../components/GradeBadge";
import { colorePista, nomePista as sigla } from "@/lib/piste";
import { CSS_DUE_COLONNE, Cifra, Barretta, BarraCentro, coloreEffetto as coloreEff, posizioni, useDesktop, num, nomeBello } from "../components/DueColonne";

export const COLORE_ALLENATORI = "hsl(28 85% 60%)";
const COLORE = COLORE_ALLENATORI;
const DIM = "hsl(210 8% 40%)";
const PASSO = 50;
const nomePista = (t: string) => nomeBello(sigla(t));

export interface Allenatore {
  allenatore: string; nome: string;
  n_corse: number; n_corse_recenti: number; n_cavalli: number; n_cavalli_recenti: number;
  n_vittorie: number; n_primi_tre: number; pct_vittorie: number; pct_primi_tre: number;
  premi_totali: number; premi_per_corsa: number; premi_12_mesi: number; vittorie_12_mesi: number;
  prima_corsa: string | null; ultima_corsa: string | null; ippodromo_top: string | null;
  attivo: number; effetto: number | null; n_confronti: number;
  affidabilita: number; affidabilita_txt: string;
}
interface DettaglioAllenatore extends Allenatore {
  guidatore_top: string | null;
  piste: { track: string; n_corse: number; vittorie: number; pct_vittorie: number }[];
  cavalli: { nome: string; anno: number; n_corse: number; vittorie: number; premi: number; grade: string | null }[];
  guidatori: { driver: string; n_corse: number; vittorie: number; pct_vittorie: number }[];
}

export function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}
export const coloreEffetto = coloreEff;

/** Barra che parte dal centro: a sinistra rende meglio del solito, a destra peggio. Usata anche dalla scheda allenatore. */
export function BarraEffetto({ e }: { e: number | null }) {
  if (e == null) return <span style={{ fontSize: "11px", color: DIM }}>non giudicabile</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ flex: 1, minWidth: "70px" }}><BarraCentro e={e} alta={9} /></div>
      <span className="tabular" style={{ fontSize: "11.5px", color: coloreEff(e), fontWeight: 700, whiteSpace: "nowrap", width: "62px", textAlign: "right" }}>
        {posizioni(e)}
      </span>
    </div>
  );
}

type Ordine = "vittorie" | "premi" | "anno" | "percentuale" | "parita";
const ORDINI: { id: Ordine; testo: string }[] = [
  { id: "vittorie", testo: "Vittorie" },
  { id: "premi", testo: "Premi" },
  { id: "anno", testo: "Ultimi 12 mesi" },
  { id: "percentuale", testo: "% vittorie" },
  { id: "parita", testo: "A parità di cavallo" },
];
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const giudicabile = (a: Allenatore) => (a.affidabilita >= 0.2 ? a.effetto : null);

function SchedaAllenatore({ a, onClose }: { a: Allenatore; onClose?: () => void }) {
  const { data } = useQuery<DettaglioAllenatore>({
    queryKey: ["/api/allenatore", a.allenatore],
    queryFn: () => apiRequest("GET", `/api/allenatore/${encodeURIComponent(a.allenatore)}`).then(r => r.json()),
  });
  const e = giudicabile(a);
  const cavalli = (data?.cavalli ?? []).slice(0, 5);
  const guidatori = (data?.guidatori ?? []).slice(0, 3);
  const piste = (data?.piste ?? []).filter(p => p.track !== "ESTERO").slice(0, 4);
  const maxP = Math.max(1, ...piste.map(p => p.n_corse));
  return (
    <div className="ed-dettaglio" data-testid="scheda-allenatore">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Allenatore{a.attivo ? " · in attività" : " · non più in attività"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORE, marginTop: 2, overflowWrap: "anywhere" }}>{a.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
            corse dal {a.prima_corsa?.slice(0, 4) ?? "—"} al {a.ultima_corsa?.slice(0, 4) ?? "—"}
            {a.ippodromo_top && a.ippodromo_top !== "ESTERO" ? ` · soprattutto a ${nomePista(a.ippodromo_top)}` : ""}
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Vittorie" valore={num(a.n_vittorie)} colore="hsl(100 50% 60%)" sotto={`il ${pct(a.pct_vittorie)} delle corse · primi tre ${pct(a.pct_primi_tre)}`} />
        <Cifra titolo="Premi dal 2016" valore={euro(a.premi_totali)} colore="hsl(45 80% 62%)" sotto={`${euro(a.premi_per_corsa)} a corsa`} />
        <Cifra titolo="Ultimi 12 mesi" valore={a.premi_12_mesi > 0 ? euro(a.premi_12_mesi) : "—"} sotto={`${num(a.vittorie_12_mesi)} vittorie`} />
        <Cifra titolo="Corse" valore={num(a.n_corse)} sotto={`${num(a.n_cavalli)} cavalli · ${num(a.n_cavalli_recenti)} recenti`} />
      </div>

      <div className="ed-pannello" style={{ marginTop: 10, padding: 14 }}>
        <div className="ed-etich">A parità di cavallo</div>
        {e == null ? (
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 6, lineHeight: 1.6 }}>
            Non giudicabile: troppo pochi cavalli passati anche da altri allenatori per fare il confronto.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 8px" }}>
              <span className="tabular" style={{ fontSize: 24, fontWeight: 800, color: coloreEff(e) }}>{posizioni(e)}</span>
              <span style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>
                {e < -0.02 ? "con lui i cavalli arrivano più avanti del loro solito" : e > 0.02 ? "con lui i cavalli arrivano più indietro del loro solito" : "i cavalli arrivano come al solito"}
              </span>
            </div>
            <BarraCentro e={e} alta={10} />
            <div style={{ fontSize: 12, color: "var(--ed-muto)", marginTop: 8 }}>
              Quanto regge: <b style={{ color: "var(--ed-testo)" }}>{Math.round(a.affidabilita * 100)}% · {a.affidabilita_txt}</b> · {num(a.n_confronti)} confronti
            </div>
          </>
        )}
      </div>

      {cavalli.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I cavalli che hanno vinto di più</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {cavalli.map(c => (
              <Link key={`${c.nome}-${c.anno}`} href={`/horse/${encodeURIComponent(c.nome)}/${c.anno}`}>
                <a style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 8,
                  background: "var(--ed-fondo2)", textDecoration: "none", fontSize: 12.5 }}>
                  <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, color: "var(--ed-testo)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                    {c.grade && <GradeBadge grade={c.grade} />}
                  </span>
                  <span className="tabular" style={{ color: "var(--ed-muto)", whiteSpace: "nowrap" }}>{c.vittorie} vinte · {euro(c.premi)}</span>
                </a>
              </Link>
            ))}
          </div>
        </>
      )}
      {guidatori.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Chi guida i suoi cavalli</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {guidatori.map(g => (
              <Link key={g.driver} href={`/guidatore/${encodeURIComponent(g.driver)}`}>
                <a className="chip-filtro" style={{ textDecoration: "none" }}>{g.driver} · {num(g.n_corse)} corse</a>
              </Link>
            ))}
          </div>
        </>
      )}
      {piste.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Dove corre di più</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {piste.map(p => (
              <div key={p.track} style={{ fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                  <span style={{ color: colorePista(p.track), fontWeight: 700 }}>{nomePista(p.track)}</span>
                  <span className="tabular" style={{ color: "var(--ed-muto)" }}>{num(p.n_corse)} corse · vince il {pct(p.pct_vittorie)}</span>
                </div>
                <Barretta valore={p.n_corse} max={maxP} colore={colorePista(p.track)} alta={5} />
              </div>
            ))}
          </div>
        </>
      )}

      <Link href={`/allenatore/${encodeURIComponent(a.allenatore)}`}>
        <a data-testid="link-scheda-allenatore" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda completa <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function AllenatoriPage() {
  const desktop = useDesktop();
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [ordine, setOrdine] = useState<Ordine>("vittorie");
  const [quanti, setQuanti] = useState(PASSO);
  const [aperto, setAperto] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{
    disponibile: boolean; n: number; allenatori: Allenatore[]; copertura: number; aggiornato_al: string | null;
  }>({
    queryKey: ["/api/allenatori"],
    queryFn: () => apiRequest("GET", "/api/allenatori").then(r => r.json()),
  });

  const righe = useMemo(() => {
    let r = [...(data?.allenatori ?? [])];
    if (soloAttivi) r = r.filter(a => a.attivo === 1);
    const q = cerca.trim().toLowerCase();
    if (q) r = r.filter(a => a.nome.toLowerCase().includes(q) || a.allenatore.toLowerCase().includes(q));
    const chiave: Record<Ordine, (a: Allenatore) => number> = {
      vittorie: a => a.n_vittorie,
      premi: a => a.premi_totali,
      anno: a => a.premi_12_mesi,
      // Sotto le 100 corse la percentuale e' dominata dal caso: vanno in fondo.
      percentuale: a => (a.n_corse >= 100 ? a.pct_vittorie : -1),
      parita: a => (a.effetto == null || a.affidabilita < 0.4 ? -99 : -a.effetto),
    };
    r.sort((x, y) => chiave[ordine](y) - chiave[ordine](x));
    return r;
  }, [data, cerca, soloAttivi, ordine]);

  if (isLoading) return <Caricamento testo="Carico gli allenatori..." />;
  if (error) return <ErroreCaricamento titolo="Allenatori" cosa="i dati sugli allenatori" />;

  const filtra = (f: () => void) => { f(); setQuanti(PASSO); setAperto(null); };
  const visibili = righe.slice(0, quanti);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].allenatore : null);
  const sceltoA = righe.find(a => a.allenatore === scelto) ?? null;
  const attivi = (data?.allenatori ?? []).filter(a => a.attivo === 1);
  const primo12 = [...attivi].sort((a, b) => b.premi_12_mesi - a.premi_12_mesi)[0];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Timer} colore={COLORE} titolo="Allenatori" margineSotto={16}
        sottotitolo={`Chi allena i cavalli del trotto italiano: corse, vittorie e premi dal 2016${data?.aggiornato_al ? `, aggiornati al ${new Date(data.aggiornato_al).toLocaleDateString("it-IT")}` : ""}.`}>
        Vittorie e premi dicono soprattutto quali cavalli ha un allenatore. Per confrontare quanto li fa rendere c'è il conto
        «a parità di cavallo». Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      {!data?.disponibile ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13, lineHeight: 1.7 }}>
          Gli allenatori non sono ancora stati raccolti su questo archivio. Li raccoglie il lavoro notturno dai risultati ufficiali: saranno disponibili dal prossimo aggiornamento.
        </div>
      ) : (
        <>
          <div className="ed-cifre" style={{ marginBottom: 16 }}>
            <Cifra titolo="Allenatori" valore={num(data.n)} sotto="dal 2016 a oggi" />
            <Cifra titolo="In attività" valore={num(attivi.length)} sotto="dieci corse negli ultimi 18 mesi" />
            <Cifra titolo="Corse con l'allenatore" valore={`${num(data.copertura, 1)}%`} sotto="delle corse italiane dal 2016" />
            <Cifra titolo="Più premi in 12 mesi" valore={primo12 ? euro(primo12.premi_12_mesi) : "—"} colore="hsl(45 80% 62%)" sotto={primo12?.nome} />
          </div>

          <Spiegazione titolo="Da dove vengono questi numeri" compatta>
            <p>
              L'allenatore di ogni cavallo in ogni corsa viene dai risultati ufficiali MASAF, che lo riportano dal 2016. Le corse dal 2013 al 2015
              restano quindi senza allenatore. Oggi lo ha il {data.copertura.toLocaleString("it-IT")}% delle corse italiane dal 2016; il resto sono
              cavalli scritti in modo diverso nelle due fonti.
            </p>
            <p>
              <strong>A parità di cavallo.</strong> Per ogni corsa si guarda dove il cavallo è arrivato rispetto a dove arriva di solito. Se con un
              allenatore arriva più avanti del suo abituale, quell'allenatore ha aggiunto qualcosa. Il confronto esiste solo per i cavalli passati per
              almeno due allenatori: chi ha avuto sempre gli stessi cavalli resta «non giudicabile». Resta una misura del rendimento osservato: un
              cavallo cambia scuderia anche perché cresce, migliora o si rompe, e questo conto non lo separa del tutto.
            </p>
          </Spiegazione>

          <div className="ed-barra" style={{ marginTop: 16 }}>
            <label className="ed-cerca">
              <Search size={15} style={{ color: "var(--ed-muto)" }} />
              <input value={cerca} onChange={e => filtra(() => setCerca(e.target.value))} placeholder="Cerca un allenatore" aria-label="Cerca un allenatore" data-testid="input-cerca-allenatore" />
              {cerca && <button onClick={() => filtra(() => setCerca(""))} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
            </label>
            <div className="ed-segm" role="group" aria-label="Ordina per">
              {ORDINI.map(o => <button key={o.id} aria-pressed={ordine === o.id} onClick={() => filtra(() => setOrdine(o.id))}>{o.testo}</button>)}
            </div>
          </div>
          <div className="ed-barra" style={{ marginTop: -4 }}>
            <button className="chip-filtro" onClick={() => filtra(() => setSoloAttivi(v => !v))}
              style={{ borderColor: soloAttivi ? COLORE : undefined, color: soloAttivi ? COLORE : undefined }}>Solo in attività</button>
            <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{righe.length} su {data.n}</span>
          </div>
          {(ordine === "percentuale" || ordine === "parita") && (
            <div style={{ fontSize: 11.5, color: "var(--ed-fioco)", margin: "-4px 0 12px", lineHeight: 1.6 }}>
              {ordine === "percentuale"
                ? "In fondo chi ha meno di cento corse: su numeri piccoli la percentuale dipende dal caso."
                : "In fondo chi non ha abbastanza confronti a parità di cavallo perché il giudizio regga."}
            </div>
          )}

          {righe.length === 0 ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun allenatore con questi filtri.</div> : (
            <div className="ed-griglia">
              <div>
                <div className="ed-lista">
                  {visibili.map((a, i) => {
                    const att = scelto === a.allenatore;
                    const e = giudicabile(a);
                    const [v, et, col] = ordine === "premi" ? [euro(a.premi_totali), "premi", "hsl(45 80% 62%)"]
                      : ordine === "anno" ? [a.premi_12_mesi > 0 ? euro(a.premi_12_mesi) : "—", "ultimi 12 mesi", "hsl(45 80% 62%)"]
                      : ordine === "percentuale" ? [pct(a.pct_vittorie), "vittorie", "hsl(100 50% 60%)"]
                      : ordine === "parita" ? [e == null ? "—" : posizioni(e), "a parità di cavallo", e == null ? "var(--ed-fioco)" : coloreEff(e)]
                      : [num(a.n_vittorie), "vittorie", "hsl(100 50% 60%)"];
                    return (
                      <div key={a.allenatore} style={{ minWidth: 0 }}>
                        <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : a.allenatore)} data-testid={`row-allenatore-${i}`}>
                          <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="ed-nome" style={{ display: "block" }}>{a.nome}</span>
                            <span style={{ display: "block", margin: "6px 0 4px" }}><BarraCentro e={e} /></span>
                            <span className="ed-sotto" style={{ display: "block" }}>
                              {num(a.n_corse)} corse · {num(a.n_cavalli)} cavalli · vince il {pct(a.pct_vittorie)}
                              {e == null ? " · non giudicabile" : ""}
                            </span>
                          </span>
                          <span style={{ textAlign: "right" }}>
                            <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{v}</span>
                            <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{et}</span>
                          </span>
                        </button>
                        {!desktop && att && <div style={{ marginTop: 6 }}><SchedaAllenatore a={a} onClose={() => setAperto("")} /></div>}
                      </div>
                    );
                  })}
                </div>
                {righe.length > quanti && (
                  <div className="ed-pagine">
                    <button onClick={() => setQuanti(q => q + PASSO)} style={{ padding: "8px 14px", fontSize: 12.5, fontFamily: "inherit" }} data-testid="btn-altri">
                      Mostra altri {Math.min(PASSO, righe.length - quanti)}
                    </button>
                    <span>{quanti} di {righe.length}</span>
                  </div>
                )}
              </div>
              {desktop && (sceltoA ? <SchedaAllenatore key={sceltoA.allenatore} a={sceltoA} /> : <div className="ed-dettaglio ed-vuoto">Scegli un allenatore dall'elenco.</div>)}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", marginTop: 18, lineHeight: 1.6 }}>
            La barra «a parità di cavallo» parte dal centro: verso sinistra i cavalli rendono meglio del loro solito con questo allenatore, verso
            destra peggio; grigia vuol dire non giudicabile. Il numero è quanto vale in posizioni, su una corsa da dieci partenti. «In attività» vuol
            dire almeno dieci corse negli ultimi diciotto mesi. Hanno una scheda gli allenatori con almeno venti corse dal 2016.
          </p>
        </>
      )}

      <CollegamentiCorrelati voci={[
        { href: "/guidatori", titolo: "Guidatori", descrizione: "Chi porta i cavalli a rendere più del loro solito." },
        { href: "/gran-premi", titolo: "Gran Premi", descrizione: "I vincitori delle grandi corse dal 2014." },
        { href: "/cavalli", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati sull'archivio." },
      ]} />
    </div>
  );
}
