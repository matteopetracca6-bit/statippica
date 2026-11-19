/**
 * Pagina dei proprietari.
 *
 * Il proprietario arriva dai risultati ufficiali MASAF, come l'allenatore,
 * che lo riportano dal 2016: tutti i numeri di questa pagina partono da li'.
 *
 * Stessa grafica di Allenatori e Guidatori: elenco a sinistra, scheda a
 * destra. Al posto del confronto "a parita' di cavallo" (che per chi non
 * guida e non allena non ha senso) c'e' il PREMIO A CAVALLO ALL'ANNO: quanto
 * vince in media in una stagione un cavallo di quella scuderia.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X, KeyRound, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento, ErroreCaricamento } from "../components/Caricamento";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import GradeBadge from "../components/GradeBadge";
import { colorePista, nomePista as sigla } from "@/lib/piste";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, nomeBello } from "../components/DueColonne";

export const COLORE_PROPRIETARI = coloreScheda("/proprietari");
const COLORE = COLORE_PROPRIETARI;
const ORO = "hsl(45 80% 62%)";
const VERDE = "hsl(100 50% 60%)";
const PASSO = 50;
const nomePista = (t: string) => nomeBello(sigla(t));

export interface Proprietario {
  proprietario: string; nome: string;
  n_corse: number; n_corse_recenti: number; n_cavalli: number; n_cavalli_recenti: number;
  n_vittorie: number; n_primi_tre: number; pct_vittorie: number; pct_primi_tre: number;
  premi_totali: number; premi_per_corsa: number; premi_12_mesi: number; vittorie_12_mesi: number;
  prima_corsa: string | null; ultima_corsa: string | null; ippodromo_top: string | null;
  allenatore_top: string | null; guidatore_top: string | null;
  attivo: number; premi_cavallo_anno: number; n_allenatori: number;
}
interface DettaglioProprietario extends Proprietario {
  piste: { track: string; n_corse: number; vittorie: number; pct_vittorie: number }[];
  cavalli: { nome: string; anno: number; n_corse: number; vittorie: number; premi: number; grade: string | null }[];
  allenatori: { allenatore: string; nome: string | null; n_corse: number; n_cavalli: number; vittorie: number }[];
}

export function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

type Ordine = "vittorie" | "premi" | "anno" | "percentuale" | "cavallo";
const ORDINI: { id: Ordine; testo: string }[] = [
  { id: "vittorie", testo: "Vittorie" },
  { id: "premi", testo: "Premi" },
  { id: "anno", testo: "Ultimi 12 mesi" },
  { id: "percentuale", testo: "% vittorie" },
  { id: "cavallo", testo: "A cavallo all'anno" },
];
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
// Sotto i tre cavalli il premio medio dipende da un cavallo solo.
const confrontabile = (p: Proprietario) => p.n_cavalli >= 3;

function SchedaProprietario({ p, maxCavallo, onClose }: { p: Proprietario; maxCavallo: number; onClose?: () => void }) {
  const { data } = useQuery<DettaglioProprietario>({
    queryKey: ["/api/proprietario", p.proprietario],
    queryFn: () => apiRequest("GET", `/api/proprietario/${encodeURIComponent(p.proprietario)}`).then(r => r.json()),
  });
  const cavalli = (data?.cavalli ?? []).slice(0, 5);
  const allenatori = (data?.allenatori ?? []).slice(0, 3);
  const piste = (data?.piste ?? []).filter(x => x.track !== "ESTERO").slice(0, 4);
  const maxP = Math.max(1, ...piste.map(x => x.n_corse));
  return (
    <div className="ed-dettaglio" data-testid="scheda-proprietario">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Proprietario{p.attivo ? " · in attività" : " · non più in attività"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORE, marginTop: 2, overflowWrap: "anywhere" }}>{p.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
            corse dal {p.prima_corsa?.slice(0, 4) ?? "—"} al {p.ultima_corsa?.slice(0, 4) ?? "—"}
            {p.ippodromo_top && p.ippodromo_top !== "ESTERO" ? ` · soprattutto a ${nomePista(p.ippodromo_top)}` : ""}
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Vittorie" valore={num(p.n_vittorie)} colore={VERDE} sotto={`il ${pct(p.pct_vittorie)} delle corse · primi tre ${pct(p.pct_primi_tre)}`} />
        <Cifra titolo="Premi dal 2016" valore={euro(p.premi_totali)} colore={ORO} sotto={`${euro(p.premi_per_corsa)} a corsa`} />
        <Cifra titolo="Ultimi 12 mesi" valore={p.premi_12_mesi > 0 ? euro(p.premi_12_mesi) : "—"} sotto={`${num(p.vittorie_12_mesi)} vittorie`} />
        <Cifra titolo="Cavalli" valore={num(p.n_cavalli)} sotto={`${num(p.n_cavalli_recenti)} negli ultimi 18 mesi · ${num(p.n_corse)} corse`} />
      </div>

      <div className="ed-pannello" style={{ marginTop: 10, padding: 14 }}>
        <div className="ed-etich">Premi a cavallo all'anno</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 8px" }}>
          <span className="tabular" style={{ fontSize: 24, fontWeight: 800, color: ORO }}>{euro(p.premi_cavallo_anno)}</span>
          <span style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>
            vinti in media da un suo cavallo in una stagione
          </span>
        </div>
        <Barretta valore={p.premi_cavallo_anno} max={maxCavallo} colore={ORO} alta={8} />
        <div style={{ fontSize: 12, color: "var(--ed-muto)", marginTop: 8 }}>
          {confrontabile(p)
            ? <>Su {num(p.n_cavalli)} cavalli, affidati a {num(p.n_allenatori)} {p.n_allenatori === 1 ? "allenatore" : "allenatori"}.</>
            : <>Con meno di tre cavalli la media dipende quasi tutta da un cavallo solo.</>}
        </div>
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
      {allenatori.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>A chi affida i cavalli</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allenatori.map(a => a.nome ? (
              <Link key={a.allenatore} href={`/allenatore/${encodeURIComponent(a.allenatore)}`}>
                <a className="chip-filtro" style={{ textDecoration: "none" }}>{a.nome} · {num(a.n_corse)} corse</a>
              </Link>
            ) : <span key={a.allenatore} className="chip-filtro">{a.allenatore} · {num(a.n_corse)} corse</span>)}
          </div>
        </>
      )}
      {piste.length > 0 && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Dove corrono i suoi cavalli</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {piste.map(x => (
              <div key={x.track} style={{ fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                  <span style={{ color: colorePista(x.track), fontWeight: 700 }}>{nomePista(x.track)}</span>
                  <span className="tabular" style={{ color: "var(--ed-muto)" }}>{num(x.n_corse)} corse · vince il {pct(x.pct_vittorie)}</span>
                </div>
                <Barretta valore={x.n_corse} max={maxP} colore={colorePista(x.track)} alta={5} />
              </div>
            ))}
          </div>
        </>
      )}

      <Link href={`/proprietario/${encodeURIComponent(p.proprietario)}`}>
        <a data-testid="link-scheda-proprietario" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda completa <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function ProprietariPage() {
  const desktop = useDesktop();
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [ordine, setOrdine] = useState<Ordine>("vittorie");
  const [quanti, setQuanti] = useState(PASSO);
  const [aperto, setAperto] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{
    disponibile: boolean; n: number; proprietari: Proprietario[]; copertura: number;
    aggiornato_al: string | null; dal: string | null;
  }>({
    queryKey: ["/api/proprietari"],
    queryFn: () => apiRequest("GET", "/api/proprietari").then(r => r.json()),
  });

  const righe = useMemo(() => {
    let r = [...(data?.proprietari ?? [])];
    if (soloAttivi) r = r.filter(p => p.attivo === 1);
    const q = cerca.trim().toLowerCase();
    if (q) r = r.filter(p => p.nome.toLowerCase().includes(q) || p.proprietario.toLowerCase().includes(q));
    const chiave: Record<Ordine, (p: Proprietario) => number> = {
      vittorie: p => p.n_vittorie,
      premi: p => p.premi_totali,
      anno: p => p.premi_12_mesi,
      // Sotto le 100 corse la percentuale e' dominata dal caso: vanno in fondo.
      percentuale: p => (p.n_corse >= 100 ? p.pct_vittorie : -1),
      cavallo: p => (confrontabile(p) ? p.premi_cavallo_anno : -1),
    };
    r.sort((x, y) => chiave[ordine](y) - chiave[ordine](x));
    return r;
  }, [data, cerca, soloAttivi, ordine]);

  // Per la barretta: il 95° percentile fra i confrontabili (le poche
  // scuderie sopra riempiono la barretta), cosi' un caso estremo non
  // schiaccia tutte le altre.
  const maxCavallo = useMemo(() => {
    const v = (data?.proprietari ?? []).filter(confrontabile).map(p => p.premi_cavallo_anno).sort((a, b) => a - b);
    return v.length ? Math.max(1, v[Math.floor(v.length * 0.95)]) : 1;
  }, [data]);

  if (isLoading) return <Caricamento testo="Carico i proprietari..." />;
  if (error) return <ErroreCaricamento titolo="Proprietari" cosa="i dati sui proprietari" />;

  const filtra = (f: () => void) => { f(); setQuanti(PASSO); setAperto(null); };
  const visibili = righe.slice(0, quanti);
  const scelto = aperto ?? (desktop && visibili.length ? visibili[0].proprietario : null);
  const sceltoP = righe.find(p => p.proprietario === scelto) ?? null;
  const attivi = (data?.proprietari ?? []).filter(p => p.attivo === 1);
  const primo12 = [...attivi].sort((a, b) => b.premi_12_mesi - a.premi_12_mesi)[0];
  const annoDal = data?.dal?.slice(0, 4) ?? "2016";

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={KeyRound} colore={COLORE} titolo="Proprietari" margineSotto={16}
        sottotitolo={`Chi possiede i cavalli del trotto italiano: corse, vittorie e premi dal ${annoDal}${data?.aggiornato_al ? `, aggiornati al ${new Date(data.aggiornato_al).toLocaleDateString("it-IT")}` : ""}.`}>
        Vittorie e premi dicono quanti e quali cavalli ha una scuderia. Per confrontare scuderie grandi e piccole c'è il premio
        «a cavallo all'anno». Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      {!data?.disponibile ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13, lineHeight: 1.7 }}>
          I proprietari non sono ancora stati raccolti su questo archivio. Li raccoglie il lavoro notturno dai risultati ufficiali,
          insieme agli allenatori: saranno disponibili dal prossimo aggiornamento.
        </div>
      ) : (
        <>
          <div className="ed-cifre" style={{ marginBottom: 16 }}>
            <Cifra titolo="Proprietari" valore={num(data.n)} sotto={`con almeno venti corse dal ${annoDal}`} />
            <Cifra titolo="In attività" valore={num(attivi.length)} sotto="dieci corse negli ultimi 18 mesi" />
            <Cifra titolo="Corse con il proprietario" valore={`${num(data.copertura, 1)}%`} sotto="delle corse italiane dal 2016" />
            <Cifra titolo="Più premi in 12 mesi" valore={primo12 ? euro(primo12.premi_12_mesi) : "—"} colore={ORO} sotto={primo12?.nome} />
          </div>

          <Spiegazione titolo="Da dove vengono questi numeri" compatta>
            <p>
              Il proprietario di ogni cavallo in ogni corsa viene dai risultati ufficiali MASAF, gli stessi da cui arriva l'allenatore, che lo
              riportano dal 2016. Oggi lo ha il {data.copertura.toLocaleString("it-IT")}% delle corse italiane dal 2016: le altre sono ancora da
              leggere o hanno il cavallo scritto in modo diverso nelle due fonti. La stessa scuderia scritta in modi diversi negli anni
              («Sc Rossi SRL», «Scuderia Rossi») conta come una sola.
            </p>
            <p>
              <strong>Premi a cavallo all'anno.</strong> I premi della scuderia divisi per le stagioni corse dai suoi cavalli: un cavallo che ha
              corso tre anni per lei conta tre volte. Serve a confrontare una scuderia con due cavalli e una con cinquanta. Non dice quanto
              guadagna il proprietario: mancano le spese e i soldi della compravendita. Per i conti di un cavallo c'è la pagina Punto di pareggio.
            </p>
          </Spiegazione>

          <div className="ed-barra" style={{ marginTop: 16 }}>
            <label className="ed-cerca">
              <Search size={15} style={{ color: "var(--ed-muto)" }} />
              <input value={cerca} onChange={e => filtra(() => setCerca(e.target.value))} placeholder="Cerca un proprietario" aria-label="Cerca un proprietario" data-testid="input-cerca-proprietario" />
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
          {(ordine === "percentuale" || ordine === "cavallo") && (
            <div style={{ fontSize: 11.5, color: "var(--ed-fioco)", margin: "-4px 0 12px", lineHeight: 1.6 }}>
              {ordine === "percentuale"
                ? "In fondo chi ha meno di cento corse: su numeri piccoli la percentuale dipende dal caso."
                : "In fondo chi ha meno di tre cavalli: la media dipenderebbe da un cavallo solo."}
            </div>
          )}

          {righe.length === 0 ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun proprietario con questi filtri.</div> : (
            <div className="ed-griglia">
              <div>
                <div className="ed-lista">
                  {visibili.map((p, i) => {
                    const att = scelto === p.proprietario;
                    const [v, et, col] = ordine === "premi" ? [euro(p.premi_totali), "premi", ORO]
                      : ordine === "anno" ? [p.premi_12_mesi > 0 ? euro(p.premi_12_mesi) : "—", "ultimi 12 mesi", ORO]
                      : ordine === "percentuale" ? [pct(p.pct_vittorie), "vittorie", VERDE]
                      : ordine === "cavallo" ? [euro(p.premi_cavallo_anno), "a cavallo all'anno", confrontabile(p) ? ORO : "var(--ed-fioco)"]
                      : [num(p.n_vittorie), "vittorie", VERDE];
                    return (
                      <div key={p.proprietario} style={{ minWidth: 0 }}>
                        <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : p.proprietario)} data-testid={`row-proprietario-${i}`}>
                          <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="ed-nome" style={{ display: "block" }}>{p.nome}</span>
                            <span style={{ display: "block", margin: "6px 0 4px" }}>
                              <Barretta valore={p.premi_cavallo_anno} max={maxCavallo} colore={confrontabile(p) ? ORO : "var(--ed-fioco)"} alta={6} />
                            </span>
                            <span className="ed-sotto" style={{ display: "block" }}>
                              {num(p.n_corse)} corse · {num(p.n_cavalli)} cavalli · vince il {pct(p.pct_vittorie)}
                            </span>
                          </span>
                          <span style={{ textAlign: "right" }}>
                            <span className="tabular" style={{ display: "block", fontSize: 16, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{v}</span>
                            <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{et}</span>
                          </span>
                        </button>
                        {!desktop && att && <div style={{ marginTop: 6 }}><SchedaProprietario p={p} maxCavallo={maxCavallo} onClose={() => setAperto("")} /></div>}
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
              {desktop && (sceltoP ? <SchedaProprietario key={sceltoP.proprietario} p={sceltoP} maxCavallo={maxCavallo} /> : <div className="ed-dettaglio ed-vuoto">Scegli un proprietario dall'elenco.</div>)}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", marginTop: 18, lineHeight: 1.6 }}>
            La barretta sotto il nome è il premio a cavallo all'anno: piena per il 5% delle scuderie che vincono di più a cavallo; grigia vuol
            dire meno di tre cavalli. «In attività» vuol dire almeno dieci corse negli ultimi diciotto mesi. Hanno una scheda i proprietari con almeno venti
            corse dal 2016.
          </p>
        </>
      )}

      <CollegamentiCorrelati voci={[
        { href: "/allenatori", titolo: "Allenatori", descrizione: "Chi allena i cavalli, con il confronto a parità di cavallo." },
        { href: "/guidatori", titolo: "Guidatori", descrizione: "Chi porta i cavalli a rendere più del loro solito." },
        { href: "/pareggio", titolo: "Punto di pareggio", descrizione: "Quanto deve vincere un cavallo per ripagarsi." },
      ]} />
    </div>
  );
}
