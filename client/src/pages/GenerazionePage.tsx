/**
 * ASTE E GENERAZIONE M.
 *
 * La simulazione sperimentale dei nati del 2025 (lettera M, in pista a 2 anni
 * nel 2027) e dei 274 puledri passati nelle tre aste italiane del settembre
 * 2026. I numeri vengono da scripts/simula_generazione.py e stanno in un file
 * fisso: la pagina li mostra e basta.
 *
 * Due livelli, con affidabilita' molto diversa, e la pagina lo dice:
 *  - la generazione intera e i totali per asta: provati sul passato, tengono;
 *  - il singolo puledro: un intervallo largo. Sul passato ne' il pedigree ne'
 *    il prezzo hanno saputo dire in anticipo quale lotto avrebbe vinto.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Gavel, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Sagoma from "../components/Sagoma";
import AggiungiScuderia from "../components/AggiungiScuderia";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";

const MUTED = "hsl(210 8% 55%)";
const TESTO = "hsl(210 10% 90%)";
const ORO = "hsl(38 80% 58%)";
const CARD: React.CSSProperties = { padding: "16px 18px" };
const euro = (n: number | null | undefined) => (n == null ? "—" : "€" + Math.round(n).toLocaleString("it-IT"));
const num = (n: number) => Math.round(n).toLocaleString("it-IT");
const pct = (p: number | null | undefined) => (p == null ? "—" : p < 0.01 && p > 0 ? "<1%" : `${Math.round(p * 100)}%`);
const titolo = (s: string) => (s || "").split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
const NOME_ASTA: Record<string, string> = {
  "ITS Asta Selezionata Yearlings Trottatori 2026": "ITS Selezionata",
  "ITS Asta evento Face Time Bourbon 2026": "Face Time Bourbon",
  "Asta ANACT yearlings 2026": "ANACT",
};
const PER_PAGINA = 40;

function Numero({ valore, etichetta, nota, colore }: { valore: string; etichetta: string; nota?: string; colore?: string }) {
  return (
    <div className="pannello" style={{ ...CARD, padding: "14px 16px" }}>
      <div className="tabular" style={{ fontSize: 24, fontWeight: 800, color: colore ?? TESTO, lineHeight: 1.15 }}>{valore}</div>
      <div style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", marginTop: 4 }}>{etichetta}</div>
      {nota && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{nota}</div>}
    </div>
  );
}

function Titoletto({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 800, color: TESTO, margin: "26px 0 10px", letterSpacing: "0.01em" }}>{children}</h2>;
}

/** In breve: quanti lotti hanno un prezzo massimo, e quanti sono stati pagati meno. */
function PrezziMassimi({ lotti }: { lotti: any[] }) {
  const v = lotti.filter(l => l.venduto && l.prezzo > 0 && l.prezzo_massimo != null);
  if (!v.length) return null;
  const positivi = v.filter(l => l.prezzo_massimo > 0).length;
  const sotto = v.filter(l => l.prezzo_massimo > 0 && l.prezzo <= l.prezzo_massimo).length;
  const m = v.map(l => l.mensile_di_pareggio).filter((x: number | null) => x != null).sort((a: number, b: number) => a - b);
  const mediana = m.length ? m[Math.floor(m.length / 2)] : null;
  const griglia: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", marginBottom: 12 };
  return (
    <div style={griglia}>
      <Numero valore={`${positivi} su ${v.length}`} etichetta="venduti con un prezzo massimo sopra zero"
              nota="Per gli altri, a 1.200 € al mese, anche regalati i premi attesi non coprono l'allenamento." colore={ORO} />
      <Numero valore={`${sotto}`} etichetta={sotto === 1 ? "pagato meno del suo prezzo massimo" : "pagati meno del loro prezzo massimo"}
              nota="Chi compra all'asta paga anche la speranza del campione, la rivendita e, per le femmine, il valore da fattrice." />
      <Numero valore={mediana ? `${euro(mediana)} al mese` : "—"} etichetta="costo mensile tipico per andare in pari"
              nota={`Per i ${m.length} venduti che possono andare in pari al prezzo pagato; gli altri ${v.length - m.length} non ci vanno nemmeno a 100 € al mese.`} />
    </div>
  );
}

function ElencoLotti({ lotti }: { lotti: any[] }) {
  const [asta, setAsta] = useState("");
  const [cerca, setCerca] = useState("");
  const [soloVenduti, setSoloVenduti] = useState(false);
  const [pagina, setPagina] = useState(1);
  const filtrati = useMemo(() => {
    const c = cerca.trim().toUpperCase();
    return lotti.filter(l => (!asta || l.asta === asta) && (!soloVenduti || l.venduto)
      && (!c || l.puledro.includes(c) || l.padre.includes(c) || (l.madre || "").includes(c)));
  }, [lotti, asta, cerca, soloVenduti]);
  const pagine = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const p = Math.min(pagina, pagine);
  const righe = filtrati.slice((p - 1) * PER_PAGINA, p * PER_PAGINA);
  const sel: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, color: TESTO, padding: "6px 9px", fontSize: 12.5, fontFamily: "inherit" };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <label style={{ ...sel, display: "flex", alignItems: "center", gap: 6, flex: "1 1 200px", maxWidth: 320 }}>
          <Search size={14} style={{ color: MUTED }} />
          <input value={cerca} onChange={e => { setCerca(e.target.value); setPagina(1); }} placeholder="Puledro, padre o madre"
            style={{ background: "transparent", border: 0, outline: "none", color: TESTO, width: "100%", fontSize: 12.5 }} aria-label="Cerca" />
        </label>
        <select value={asta} onChange={e => { setAsta(e.target.value); setPagina(1); }} style={sel} aria-label="Asta">
          <option value="">tutte le aste</option>
          {Object.entries(NOME_ASTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "hsl(210 10% 80%)" }}>
          <input type="checkbox" checked={soloVenduti} onChange={e => { setSoloVenduti(e.target.checked); setPagina(1); }} /> solo venduti
        </label>
      </div>
      <div className="pannello" style={{ ...CARD, padding: 0, overflowX: "auto" }}>
        <table className="tabella-tenere">
          <thead><tr>
            <th>Puledro</th><th className="nascondi-mobile">Padre × madre</th><th className="nascondi-mobile">Asta</th>
            <th className="num">Prezzo</th><th className="num nascondi-mobile">Premi tipici</th>
            <th className="num nascondi-mobile">Metà dei casi fra</th><th className="num">Ripaga</th>
            <th className="num" style={{ whiteSpace: "normal" }} title="In carriera, con la regola di fermarlo quando non rende, a 1.200 € al mese">Prezzo massimo</th>
            <th className="num nascondi-mobile" title="Costo mensile sotto il quale il prezzo pagato va in pari in media">In pari sotto</th>
          </tr></thead>
          <tbody>
            {righe.map(l => (
              <tr key={l.asta + l.lotto}>
                <td style={{ whiteSpace: "normal", minWidth: 96 }}>
                  <Link href={`/puledro?padre=${encodeURIComponent(l.padre)}&madre=${encodeURIComponent(l.madre ?? "")}&asta=1&nome=${encodeURIComponent(l.puledro)}${l.venduto ? `&prezzo=${l.prezzo}` : ""}`}
                        style={{ color: TESTO, fontWeight: 700 }} title="Quanto vale, caso per caso">{titolo(l.puledro)}</Link>
                  <span style={{ color: MUTED, marginLeft: 5, fontSize: 11 }} title={l.sesso === "F" ? "femmina" : "maschio"}>{l.sesso}</span>
                  <span style={{ marginLeft: 6 }}><AggiungiScuderia icona voce={{ tipo: "puledro", nome: l.puledro, padre: l.padre, madre: l.madre || null, anno: 2025, prezzo: l.venduto ? l.prezzo : null, asta: true }} /></span></td>
                <td className="nascondi-mobile">
                  <Link href={`/stallion/${encodeURIComponent(l.padre)}`}><a className="padre">{titolo(l.padre)}</a></Link>
                  <span style={{ color: MUTED }}> × </span>
                  {l.madre ? <Link href={`/fattrice/${encodeURIComponent(l.madre)}`}><a className="padre">{titolo(l.madre)}</a></Link> : "—"}
                </td>
                <td className="nascondi-mobile" style={{ color: MUTED }}>{NOME_ASTA[l.asta] ?? l.asta} · {l.lotto}</td>
                <td className="num tabular" style={{ fontWeight: 700, color: l.venduto ? TESTO : MUTED }}>
                  {l.venduto ? euro(l.prezzo) : <span title={l.prezzo ? `battuto a ${euro(l.prezzo)}` : ""}>ricomprato</span>}
                </td>
                <td className="num tabular nascondi-mobile">{euro(l.premi_2_3_anni.mediana)}</td>
                <td className="num tabular nascondi-mobile" style={{ color: MUTED }}>{euro(l.premi_2_3_anni.p25)} – {euro(l.premi_2_3_anni.p75)}</td>
                <td className="num tabular" style={{ fontWeight: 700, color: l.ripaga_entro_3_anni == null ? MUTED : l.ripaga_entro_3_anni >= 0.25 ? "hsl(145 55% 52%)" : l.ripaga_entro_3_anni >= 0.1 ? ORO : "hsl(0 60% 62%)" }}>
                  {l.venduto ? pct(l.ripaga_entro_3_anni) : "—"}
                </td>
                <td className="num tabular" style={{ fontWeight: 700, color: !l.prezzo_massimo ? "hsl(0 60% 62%)" : l.venduto && l.prezzo_massimo >= l.prezzo ? "hsl(145 55% 52%)" : ORO }}>
                  {l.prezzo_massimo == null ? "—" : l.prezzo_massimo > 0 ? euro(l.prezzo_massimo) : "nessuno"}
                </td>
                <td className="num tabular nascondi-mobile" style={{ color: l.mensile_di_pareggio ? TESTO : MUTED }}>
                  {!l.venduto ? "—" : l.mensile_di_pareggio ? `${euro(l.mensile_di_pareggio)}/mese` : "mai"}
                </td>
              </tr>
            ))}
            {!righe.length && <tr><td colSpan={9} style={{ color: MUTED, padding: 18 }}>Nessun puledro con questi filtri.</td></tr>}
          </tbody>
        </table>
      </div>
      {pagine > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginTop: 12, fontSize: 12.5, color: MUTED }}>
          <button className="chip-filtro" disabled={p <= 1} onClick={() => setPagina(p - 1)} aria-label="Pagina precedente"><ChevronLeft size={14} /></button>
          pagina {p} di {pagine} · {filtrati.length} puledri
          <button className="chip-filtro" disabled={p >= pagine} onClick={() => setPagina(p + 1)} aria-label="Pagina successiva"><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function GenerazionePage() {
  const { data: d, error } = useQuery<any>({
    queryKey: ["/api/generazione-m"],
    queryFn: async () => (await apiRequest("GET", "/api/generazione-m")).json(),
    staleTime: 60 * 60_000,
  });
  const griglia: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 };
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 18px 60px" }}>
      <IntestazionePagina icona={Gavel} colore={ORO} titolo="Aste e generazione M" etichetta="sperimentale"
        sottotitolo="I nati 2025 (nomi con la M) simulati tutti insieme, e i puledri delle aste di settembre 2026 uno per uno.">
        I trottatori nati nel 2025 hanno il nome che comincia per M e debutteranno a 2 anni nel 2027. Qui c'è la generazione intera simulata e,
        uno per uno, i puledri M passati nelle aste di settembre 2026. I numeri della generazione e delle aste sono provati sul passato;
        quelli del singolo puledro sono un intervallo largo, non una previsione.
      </IntestazionePagina>

      {error ? <div className="pannello" style={{ ...CARD, color: MUTED, fontSize: 13 }}>La simulazione non è ancora disponibile.</div>
        : !d ? <Sagoma cornice righe={8} />
        : (() => {
          const g = d.generazione_intera, a = d.puledri_in_asta, pr = d.prova_sul_passato;
          const ult = g.confronto_generazioni[g.confronto_generazioni.length - 1];
          const piu2 = ult ? Math.round(100 * (g.premi_2_anni_per_nato / ult.premi_2_anni_per_nato - 1)) : null;
          const pa = pr.lotti_asta_2024;
          return (
            <>
              <Titoletto>La generazione intera</Titoletto>
              <div style={griglia}>
                <Numero valore={num(g.nati_ufficiali)} etichetta="puledri nati nel 2025" nota="Il numero più basso degli ultimi anni (2.178 nel 2024, 2.368 nel 2022)." />
                <Numero valore={`circa ${num(g.corrono_a_2_anni[1])}`} etichetta="correranno a 2 anni, nel 2027" nota={`Fra ${num(g.corrono_a_2_anni[0])} e ${num(g.corrono_a_2_anni[2])}: il ${pct(g.quota_corrono_2_anni)} dei nati, come nelle ultime generazioni.`} />
                <Numero valore={`circa ${num(g.corrono_a_3_anni[1])}`} etichetta="correranno a 3 anni, nel 2028" nota={`Fra ${num(g.corrono_a_3_anni[0])} e ${num(g.corrono_a_3_anni[2])}.`} />
                <Numero valore={euro(g.premi_2_anni_per_nato)} etichetta="premi a 2 anni per ogni nato" colore={ORO}
                  nota={piu2 != null ? `Circa il ${piu2}% in più della generazione ${ult.generazione}: i premi per i giovani sono quasi fissi e i puledri sono meno.` : undefined} />
              </div>

              <div className="pannello" style={{ ...CARD, padding: 0, overflowX: "auto", marginTop: 10 }}>
                <table className="tabella-tenere">
                  <thead><tr><th>Generazione</th><th className="num">Nati</th><th className="num">2 anni, per nato</th><th className="num">3 anni, per nato</th></tr></thead>
                  <tbody>
                    {g.confronto_generazioni.map((x: any) => (
                      <tr key={x.generazione}><td>{x.generazione}</td><td className="num tabular">{num(x.nati)}</td>
                        <td className="num tabular">{euro(x.premi_2_anni_per_nato)}</td><td className="num tabular">{x.premi_3_anni_per_nato == null ? "in corso" : euro(x.premi_3_anni_per_nato)}</td></tr>
                    ))}
                    <tr><td style={{ color: ORO, fontWeight: 700 }}>M (simulata)</td><td className="num tabular">{num(g.nati_ufficiali)}</td>
                      <td className="num tabular" style={{ color: ORO, fontWeight: 700 }}>{euro(g.premi_2_anni_per_nato)}</td>
                      <td className="num tabular" style={{ color: ORO, fontWeight: 700 }}>{euro(g.premi_3_anni_per_nato)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>
                Premi netti previsti: {euro(g.torta_2_anni_prevista_2027)} per i 2 anni nel 2027 e {euro(g.torta_3_anni_prevista_2028)} per i 3 anni nel 2028,
                la media degli ultimi tre anni. Fra chi corre, il puledro tipico vince {euro(g.premi_2_e_3_anni_mediana_di_chi_corre)} in due stagioni;
                circa {num(g.almeno_10000_euro_in_due_stagioni[1])} arriveranno ad almeno 10.000 € e circa {num(g.almeno_50000_euro_in_due_stagioni[1])} ad almeno 50.000 €.
              </p>

              <Titoletto>Le aste di settembre 2026</Titoletto>
              <div style={griglia}>
                <Numero valore={`${a.venduti} su ${a.lotti}`} etichetta="puledri venduti davvero" nota="Gli altri sono stati ricomprati dal venditore: non contano come vendite." />
                <Numero valore={euro(a.spesa_totale)} etichetta="spesa dei compratori" />
                <Numero valore={euro(a.premi_al_proprietario_attesi)} etichetta="premi attesi al proprietario fino ai 3 anni" colore={ORO}
                  nota={`Contro ${euro(a.costo_totale_fino_a_3_anni)} fra prezzo e allenamento (1.200 € al mese per 27 mesi).`} />
                <Numero valore={pct(a.ripaga_entro_3_anni_medio)} etichetta="probabilità media di ripagarsi entro i 3 anni" colore="hsl(0 60% 62%)"
                  nota="Senza rivendita, valore da riproduttore e corse dopo i 3 anni: è un conto prudente." />
              </div>
              <div className="pannello" style={{ ...CARD, padding: 0, overflowX: "auto", marginTop: 10 }}>
                <table className="tabella-tenere">
                  <thead><tr><th>Asta</th><th className="num nascondi-mobile">Venduti</th><th className="num">Prezzo medio</th><th className="num">Premi attesi</th><th className="num">Ripaga</th></tr></thead>
                  <tbody>
                    {a.per_asta.map((x: any) => (
                      <tr key={x.asta}><td>{NOME_ASTA[x.asta] ?? x.asta}</td><td className="num tabular nascondi-mobile">{x.venduti} su {x.lotti}</td>
                        <td className="num tabular">{euro(x.prezzo_medio)}</td><td className="num tabular">{euro(x.premi_2_3_anni_medi_attesi)}</td>
                        <td className="num tabular">{pct(x.ripaga_entro_3_anni_medio)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Titoletto>Com'è andata ai puledri dell'asta 2024</Titoletto>
              <p style={{ color: "hsl(210 10% 82%)", fontSize: 13, lineHeight: 1.6, maxWidth: 900, margin: "0 0 10px" }}>
                Dei {pa.venduti_ritrovati} puledri venduti, {pa.gia_ripagati_a_ottobre_2026} hanno già ripagato prezzo e allenamento:
                costati in media {euro(pa.prezzo_medio_venduti)}, hanno vinto finora {euro(pa.premi_2_e_3_anni_finora_medi_venduti)}.
              </p>
              <div className="pannello" style={{ ...CARD, padding: 0, overflowX: "auto" }}>
                <table className="tabella-tenere">
                  <thead><tr><th>Prezzo pagato</th><th className="num nascondi-mobile">Puledri</th><th className="num nascondi-mobile">Corsi a 2 anni</th>
                    <th className="num">2 anni (media)</th><th className="num nascondi-mobile">2 anni (tipico)</th><th className="num">3 anni finora</th></tr></thead>
                  <tbody>
                    {pa.per_fascia_di_prezzo.map((x: any) => (
                      <tr key={x.fascia}><td>{x.fascia} €</td><td className="num tabular nascondi-mobile">{x.lotti}</td><td className="num tabular nascondi-mobile">{pct(x.corsi_a_2_anni)}</td>
                        <td className="num tabular">{euro(x.premi_2_anni_medi)}</td><td className="num tabular nascondi-mobile">{euro(x.premi_2_anni_mediana)}</td>
                        <td className="num tabular">{euro(x.premi_3_anni_finora_medi)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Spiegazione>
                La generazione I, venduta all'asta ITS nel 2024, ha finito la stagione dei 2 anni e sta finendo quella dei 3: è la prova più concreta
                di come vanno i puledri d'asta. Chi ha pagato di più ha vinto di più a 3 anni, ma molto meno di quanto ha speso. A 2 anni il prezzo
                non distingueva quasi nulla. La stessa prova, rifatta con i soli dati di settembre 2024, è
                in <Link href="/controllo" style={{ color: ORO }}>Controllo a posteriori</Link>.
              </Spiegazione>

              <Titoletto>I puledri M in asta, uno per uno</Titoletto>
              <Spiegazione>
                «Premi tipici»: quanto vince a 2 e 3 anni il puledro a metà della fila delle simulazioni. «Ripaga»: quante volte su cento la sua
                quota di premi copre prezzo e allenamento fino ai 3 anni. «Prezzo massimo»: quanto si poteva pagare per essere in pari in media su tutta
                la carriera, fermandolo quando non rende, a 1.200 € al mese (il conto di <Link href="/puledro" style={{ color: ORO }}>Quanto vale un puledro</Link>:
                tocca il nome per vederlo caso per caso). «In pari sotto»: il costo mensile a cui il prezzo pagato va in pari.
              </Spiegazione>
              <PrezziMassimi lotti={a.lotti_elenco} />
              <ElencoLotti lotti={a.lotti_elenco} />

              <Spiegazione titolo="Come è fatto il conto e cosa non dice">
                <p>
                  I premi per i cavalli di 2 e di 3 anni sono quasi una torta fissa che si divide fra i puledri di quell'anno. Per questo ogni cavallo
                  nato fra il 2016 e il 2022 è descritto dalla fetta che ha preso. Un puledro nuovo pesca il suo destino fra i figli dello stesso padre,
                  i fratelli della stessa madre e, per il resto, fra tutti i cavalli: un padre con centinaia di figli pesa molto, uno con pochi quasi
                  niente. La simulazione si ripete {num(d.ipotesi.simulazioni_per_puledro)} volte per ogni puledro.
                </p>
                <p>
                  Prova sul passato: la generazione I è stata simulata con i soli dati di settembre 2024. La torta dei 2 anni prevista era
                  {" "}{euro(pr.gruppo.torta_2_anni_prevista)}, quella vera {euro(pr.gruppo.torta_2_anni_vera)}. I puledri che hanno corso a 2 anni erano
                  previsti {num(pr.gruppo.corsi_a_2_anni_previsti)} e sono stati {num(pr.gruppo.corsi_a_2_anni_veri)}: la quota di chi corre scende da anni
                  e la stima resta un po' alta.
                </p>
                <p>
                  I puledri d'asta sono scelti: a parità di padre e madre hanno vinto {pr.lotti_asta_2024.vero_su_previsto} volte più della media. La
                  simulazione li corregge di questo fattore. La verifica sull'asta 2025, che corre adesso a 2 anni, dà {pr.verifica_asta_2025?.vero_su_previsto}:
                  la correzione regge.
                </p>
                <p>
                  Il limite più importante: fra i puledri della stessa asta né il pedigree né il prezzo hanno saputo dire in anticipo chi avrebbe vinto
                  (accordo fra ordine previsto e ordine vero vicino a zero a 2 anni, appena sopra con il prezzo a 3 anni). Per questo la colonna «tipico»
                  e l'intervallo servono a capire il rischio, non a scegliere un puledro. Questo non è il modello di allevamento del sito.
                </p>
                <p>
                  Fonti: nati per anno da <a href="https://www.grandeippicaitaliana.it/news/allevamento-cavallo-italiano-il-quadro-delle-nascite-tra-conferme-e-nuove-sfide/" target="_blank" rel="noreferrer">Grande Ippica Italiana</a>;
                  risultati delle aste da GAET: <a href="https://www.gaet.it/notizie/daily/its-risultati-definitivi" target="_blank" rel="noreferrer">ITS</a>,
                  {" "}<a href="https://www.gaet.it/asta_FTB/" target="_blank" rel="noreferrer">Face Time Bourbon</a>,
                  {" "}<a href="https://www.gaet.it/notizie/daily/asta-anact-risultati-ufficiali" target="_blank" rel="noreferrer">ANACT</a>.
                  Aggiornato il {new Date(d.aggiornato).toLocaleDateString("it-IT")}.
                </p>
                <p>
                  Correzione del 18 ottobre 2026: nella prima versione i premi netti erano ridotti una seconda volta alla parte del proprietario (42,5 su 50),
                  ma i premi netti dell'archivio sono già quella parte. I premi attesi al proprietario erano quindi circa il 15% troppo bassi; ora sono giusti.
                </p>
              </Spiegazione>
            </>
          );
        })()}
    </div>
  );
}
