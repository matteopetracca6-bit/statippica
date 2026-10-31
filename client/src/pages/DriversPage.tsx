/**
 * Pagina dei guidatori.
 *
 * IL PUNTO DELICATO, che decide se questa pagina vale qualcosa: la percentuale
 * di vittorie NON misura il guidatore, misura i cavalli che gli affidano. Chi
 * guida per una grande scuderia vince spesso perche' ha sotto i cavalli
 * migliori. Se questa pagina ordinasse per vittorie sarebbe una classifica
 * delle scuderie travestita da classifica dei guidatori.
 *
 * Quindi si ordina per l'effetto misurato dentro lo stesso cavallo: quanto i
 * cavalli arrivano meglio della LORO media quando li guida questa persona,
 * corretto per il numero di partenza. Le vittorie restano, ma come
 * informazione di contorno e con scritto perche' non vanno usate per giudicare.
 *
 * Layout a due colonne come le altre pagine rifatte: elenco a sinistra, scheda
 * del guidatore scelto a destra (sul telefono sotto la riga).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X, Users, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento, ErroreCaricamento } from "../components/Caricamento";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import GradeBadge from "../components/GradeBadge";
import { colorePista, nomePista as sigla } from "@/lib/piste";
import { CSS_DUE_COLONNE, Cifra, Barretta, BarraCentro, coloreEffetto, posizioni, useDesktop, num, euro, nomeBello } from "../components/DueColonne";

const nomePista = (t: string) => nomeBello(sigla(t));

const COLORE = "hsl(200 70% 58%)";
const PASSO = 50;

interface Driver {
  driver: string; n_gare: number; n_gare_recenti: number; n_cavalli: number; n_vittorie: number;
  pct_vittorie: number; pct_primi_tre: number; effetto: number; effetto_corretto: number;
  affidabilita: number; affidabilita_txt: string; partenza_media: number | null; premi_totali: number;
  prima_gara: string | null; ultima_gara: string | null; ippodromo_top: string | null; attivo: number;
}
interface DettaglioDriver extends Driver {
  piste: { track: string; n_gare: number; pct_vittorie: number; pct_primi_tre: number }[];
  cavalli: { nome: string; anno: number; n_gare: number; vittorie: number; premi: number; grade: string | null }[];
}

type Ordine = "rende" | "gare" | "vittorie" | "premi";

const coloreAffidabilita = (a: number) => (a >= 0.6 ? "hsl(100 60% 52%)" : a >= 0.4 ? "hsl(45 85% 55%)" : "hsl(0 62% 58%)");
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const anno = (d: string | null) => (d ? d.slice(0, 4) : "—");
const dove = (t: string | null) => (!t ? null : t === "ESTERO" ? "corre soprattutto all'estero" : `soprattutto a ${nomePista(t)}`);

function SchedaGuidatore({ d, onClose }: { d: Driver; onClose?: () => void }) {
  const { data } = useQuery<DettaglioDriver>({
    queryKey: ["/api/driver", d.driver],
    queryFn: () => apiRequest("GET", `/api/driver/${encodeURIComponent(d.driver)}`).then(r => r.json()),
  });
  const piste = (data?.piste ?? []).filter(p => p.track !== "ESTERO").slice(0, 4);
  const cavalli = (data?.cavalli ?? []).slice(0, 5);
  const maxP = Math.max(1, ...piste.map(p => p.n_gare));
  return (
    <div className="ed-dettaglio" data-testid="scheda-guidatore">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Guidatore{d.attivo ? " · in attività" : " · non più in attività"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORE, marginTop: 2, overflowWrap: "anywhere" }}>{d.driver}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
            in archivio dal {anno(d.prima_gara)} al {anno(d.ultima_gara)}{dove(d.ippodromo_top) ? ` · ${dove(d.ippodromo_top)}` : ""}
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-pannello" style={{ marginTop: 14, padding: 14 }}>
        <div className="ed-etich">Quanto rende, a parità di cavallo</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 8px" }}>
          <span className="tabular" style={{ fontSize: 26, fontWeight: 800, color: coloreEffetto(d.effetto_corretto) }}>{posizioni(d.effetto_corretto)}</span>
          <span style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>
            {d.effetto_corretto < -0.02 ? "i cavalli arrivano più avanti del loro solito" : d.effetto_corretto > 0.02 ? "i cavalli arrivano più indietro del loro solito" : "i cavalli arrivano come al solito"}
          </span>
        </div>
        <BarraCentro e={d.effetto_corretto} alta={10} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ed-fioco)", marginTop: 4 }}>
          <span>meglio del solito</span><span>peggio del solito</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--ed-muto)", marginTop: 8 }}>
          Quanto regge il giudizio: <b style={{ color: coloreAffidabilita(d.affidabilita) }}>{Math.round(d.affidabilita * 100)}% · {d.affidabilita_txt}</b>
        </div>
      </div>

      <div className="ed-cifre" style={{ marginTop: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Gare" valore={num(d.n_gare)} sotto={`${num(d.n_cavalli)} cavalli · ${num(d.n_gare_recenti)} recenti`} />
        <Cifra titolo="Vittorie" valore={pct(d.pct_vittorie)} sotto={`${num(d.n_vittorie)} vinte · primi tre ${pct(d.pct_primi_tre)}`} />
        <Cifra titolo="Premi vinti" valore={euro(d.premi_totali)} colore="hsl(45 80% 62%)" />
        <Cifra titolo="Partenza media" valore={num(d.partenza_media, 1)} sotto="già scontata nel rendimento" />
      </div>

      {cavalli.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I cavalli che ha guidato di più</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {cavalli.map(c => (
              <Link key={`${c.nome}-${c.anno}`} href={`/horse/${encodeURIComponent(c.nome)}/${c.anno}`}>
                <a style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 8,
                  background: "var(--ed-fondo2)", textDecoration: "none", fontSize: 12.5 }}>
                  <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, color: "var(--ed-testo)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                    {c.grade && <GradeBadge grade={c.grade} />}
                  </span>
                  <span className="tabular" style={{ color: "var(--ed-muto)", whiteSpace: "nowrap" }}>{c.n_gare} gare · {c.vittorie} vinte</span>
                </a>
              </Link>
            ))}
          </div>
        </>
      )}
      {piste.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Dove guida di più</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {piste.map(p => (
              <div key={p.track} style={{ fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                  <span style={{ color: colorePista(p.track), fontWeight: 700 }}>{nomePista(p.track)}</span>
                  <span className="tabular" style={{ color: "var(--ed-muto)" }}>{num(p.n_gare)} gare · vince il {pct(p.pct_vittorie)}</span>
                </div>
                <Barretta valore={p.n_gare} max={maxP} colore={colorePista(p.track)} alta={5} />
              </div>
            ))}
          </div>
        </>
      )}

      <Link href={`/guidatore/${encodeURIComponent(d.driver)}`}>
        <a data-testid="link-scheda-guidatore" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda completa <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function DriversPage() {
  const desktop = useDesktop();
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [soloAffidabili, setSoloAffidabili] = useState(true);
  const [ordine, setOrdine] = useState<Ordine>("rende");
  const [quanti, setQuanti] = useState(PASSO);
  const [aperto, setAperto] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ disponibile: boolean; n: number; drivers: Driver[] }>({
    queryKey: ["/api/drivers"],
    queryFn: () => apiRequest("GET", "/api/drivers").then(r => r.json()),
  });

  const righe = useMemo(() => {
    let r = [...(data?.drivers ?? [])];
    if (soloAttivi) r = r.filter(d => d.attivo === 1);
    if (soloAffidabili) r = r.filter(d => d.affidabilita >= 0.5);
    const q = cerca.trim().toLowerCase();
    if (q) r = r.filter(d => d.driver.toLowerCase().includes(q));
    const k: Record<Ordine, (d: Driver) => number> = {
      rende: d => -d.effetto_corretto, gare: d => d.n_gare,
      vittorie: d => (d.n_gare >= 100 ? d.pct_vittorie : -1), premi: d => d.premi_totali,
    };
    return r.sort((a, b) => k[ordine](b) - k[ordine](a));
  }, [data, cerca, soloAttivi, soloAffidabili, ordine]);

  if (isLoading) return <Caricamento testo="Calcolo il rendimento dei guidatori..." />;
  if (error) return <ErroreCaricamento titolo="Guidatori" cosa="i dati sui guidatori" />;

  const filtra = (f: () => void) => { f(); setQuanti(PASSO); setAperto(null); };
  const visibili = righe.slice(0, quanti);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].driver : null);
  const sceltoD = righe.find(d => d.driver === scelto) ?? null;
  const attivi = (data?.drivers ?? []).filter(d => d.attivo === 1);
  const migliore = [...attivi].filter(d => d.affidabilita >= 0.5).sort((a, b) => a.effetto_corretto - b.effetto_corretto)[0];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Users} colore={COLORE} titolo="Guidatori" margineSotto={16}
        sottotitolo="Chi porta i cavalli a rendere più del loro solito, a parità di cavallo e di numero di partenza.">
        La classifica NON è per vittorie: quelle dipendono soprattutto da quali cavalli vengono affidati.
        Il confronto è fatto dentro lo stesso cavallo, e tiene conto del numero di partenza. Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      {!data?.disponibile ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13, lineHeight: 1.7 }}>
          I dati sui guidatori non sono ancora stati calcolati su questo archivio. Vengono prodotti dal lavoro notturno: saranno disponibili dal prossimo aggiornamento.
        </div>
      ) : (
        <>
          <div className="ed-cifre" style={{ marginBottom: 16 }}>
            <Cifra titolo="Guidatori in archivio" valore={num(data.n)} />
            <Cifra titolo="In attività" valore={num(attivi.length)} sotto="almeno una gara di recente" />
            <Cifra titolo="Con un giudizio che regge" valore={num(attivi.filter(d => d.affidabilita >= 0.5).length)} sotto="fra quelli in attività" />
            <Cifra titolo="Rende di più" valore={migliore ? posizioni(migliore.effetto_corretto) : "—"} colore={migliore ? coloreEffetto(migliore.effetto_corretto) : undefined} sotto={migliore?.driver} />
          </div>

          <Spiegazione titolo="Perché le vittorie non misurano il guidatore" compatta>
            <p>
              Un guidatore che lavora per una grande scuderia vince spesso perché ha sotto i cavalli migliori, e uno bravissimo con cavalli
              modesti perde lo stesso. Ordinare per vittorie darebbe una classifica delle scuderie travestita da classifica dei guidatori.
            </p>
            <p>
              Il confronto giusto si fa <strong>dentro lo stesso cavallo</strong>: per ogni gara si guarda dove quel cavallo è arrivato rispetto a
              dove arriva di solito. Se con una certa persona alla guida arriva più avanti del suo abituale, quel guidatore ha aggiunto qualcosa.
              Nell'archivio 12.224 cavalli sono stati guidati da almeno quattro persone diverse, quindi il confronto è possibile su larga scala.
            </p>
            <p>
              Si corregge anche per il <strong>numero di partenza</strong>, altrimenti si addebiterebbe al guidatore la sfortuna del sorteggio:
              partire dal dodici fa arrivare nei primi tre il 27% delle volte contro il 49% del primo.
            </p>
            <p>
              <strong>La verifica.</strong> Il rendimento fino al 2022 predice quello dal 2023 con correlazione +0,616 su 466 guidatori, cioè il 38%
              spiegato. Non è rumore: è lo stesso ordine di grandezza della valutazione degli stalloni sulla progenie. Resta però una misura di
              rendimento osservato, non una misura di bravura pura: un guidatore molto richiesto riceve anche cavalli in condizione migliore, e questo
              conto non lo separa del tutto.
            </p>
          </Spiegazione>

          <div className="ed-barra" style={{ marginTop: 16 }}>
            <label className="ed-cerca">
              <Search size={15} style={{ color: "var(--ed-muto)" }} />
              <input value={cerca} onChange={e => filtra(() => setCerca(e.target.value))} placeholder="Cerca un guidatore" aria-label="Cerca un guidatore" data-testid="input-cerca-guidatore" />
              {cerca && <button onClick={() => filtra(() => setCerca(""))} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
            </label>
            <div className="ed-segm" role="group" aria-label="Ordina per">
              {([["rende", "Quanto rende"], ["gare", "Gare"], ["vittorie", "% vittorie"], ["premi", "Premi"]] as const).map(([k, t]) =>
                <button key={k} aria-pressed={ordine === k} onClick={() => filtra(() => setOrdine(k))}>{t}</button>)}
            </div>
          </div>
          <div className="ed-barra" style={{ marginTop: -4 }}>
            <button className="chip-filtro" onClick={() => filtra(() => setSoloAttivi(v => !v))}
              style={{ borderColor: soloAttivi ? COLORE : undefined, color: soloAttivi ? COLORE : undefined }}>Solo in attività</button>
            <button className="chip-filtro" onClick={() => filtra(() => setSoloAffidabili(v => !v))}
              style={{ borderColor: soloAffidabili ? COLORE : undefined, color: soloAffidabili ? COLORE : undefined }}>Solo giudizi che reggono</button>
            <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{righe.length} su {data.n}</span>
          </div>
          {(soloAffidabili || ordine === "vittorie") && (
            <div style={{ fontSize: 11.5, color: "var(--ed-fioco)", margin: "-4px 0 12px", lineHeight: 1.6 }}>
              {soloAffidabili ? "Sono nascosti i guidatori con meno di un centinaio di gare: su numeri piccoli il rendimento è dominato dal caso. " : ""}
              {ordine === "vittorie" ? "Le vittorie dipendono soprattutto dai cavalli ricevuti: non vanno usate per confrontare due guidatori." : ""}
            </div>
          )}

          {righe.length === 0 ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun guidatore con questi filtri.</div> : (
            <div className="ed-griglia">
              <div>
                <div className="ed-lista">
                  {visibili.map((d, i) => {
                    const att = scelto === d.driver;
                    const [v, et, col] = ordine === "gare" ? [num(d.n_gare), "gare", "var(--ed-testo)"]
                      : ordine === "vittorie" ? [pct(d.pct_vittorie), "vittorie", "hsl(100 50% 60%)"]
                      : ordine === "premi" ? [euro(d.premi_totali), "premi", "hsl(45 80% 62%)"]
                      : [posizioni(d.effetto_corretto), "a parità di cavallo", coloreEffetto(d.effetto_corretto)];
                    return (
                      <div key={d.driver} style={{ minWidth: 0 }}>
                        <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : d.driver)} data-testid={`row-guidatore-${i}`}>
                          <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="ed-nome" style={{ display: "block" }}>{d.driver}</span>
                            <span style={{ display: "block", margin: "6px 0 4px" }}><BarraCentro e={d.effetto_corretto} /></span>
                            <span className="ed-sotto" style={{ display: "block" }}>
                              {num(d.n_gare)} gare · vince il {pct(d.pct_vittorie)}{d.ippodromo_top && d.ippodromo_top !== "ESTERO" ? ` · ${nomePista(d.ippodromo_top)}` : ""}
                            </span>
                          </span>
                          <span style={{ textAlign: "right" }}>
                            <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{v}</span>
                            <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{et}</span>
                          </span>
                        </button>
                        {!desktop && att && <div style={{ marginTop: 6 }}><SchedaGuidatore d={d} onClose={() => setAperto("")} /></div>}
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
              {desktop && (sceltoD ? <SchedaGuidatore key={sceltoD.driver} d={sceltoD} /> : <div className="ed-dettaglio ed-vuoto">Scegli un guidatore dall'elenco.</div>)}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", marginTop: 18, lineHeight: 1.6 }}>
            La barra parte dal centro: verso sinistra il guidatore porta i cavalli a rendere meglio del loro solito, verso destra peggio. Il numero
            accanto è quanto vale in posizioni, su una gara da dieci partenti. Le vittorie sono lì per completezza, ma non vanno usate per confrontare
            due guidatori: dipendono soprattutto dai cavalli che ricevono. La partenza media dice da quale numero partono di solito, ed è già scontata dal rendimento.
          </p>
        </>
      )}

      <CollegamentiCorrelati voci={[
        { href: "/allenatori", titolo: "Allenatori", descrizione: "Chi allena i cavalli, con lo stesso confronto a parità di cavallo." },
        { href: "/ippodromi", titolo: "Ippodromi", descrizione: "Le piste italiane, e quanto pesa partire dietro su ciascuna." },
        { href: "/calendario", titolo: "Calendario", descrizione: "Le corse dei prossimi giorni." },
      ]} />
    </div>
  );
}
