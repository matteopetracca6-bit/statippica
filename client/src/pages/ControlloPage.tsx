/**
 * Controllo a posteriori: le stime del sito rifatte con i soli dati di una
 * data passata, e confrontate con com'è andata davvero.
 *
 * Una stima che non si può smentire non vale niente. Qui si torna al
 * 1° ottobre 2025 (una data che né il modello né le fasce hanno visto), si
 * rifanno «Tenere o fermare», il rischio della scuderia e il valore dei
 * puledri dell'asta 2024, e si guarda il risultato vero. I numeri vengono da
 * uno script che si rilancia a mano: non è un conto notturno.
 */
import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { History } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import { Spiegazione } from "../components/Spiegazione";
import Sagoma from "../components/Sagoma";
import { ErroreCaricamento } from "../components/Caricamento";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { ESITO_COLORE } from "@/lib/esiti";

const COLORE = "hsl(265 45% 68%)";
const MUTED = "hsl(210 8% 55%)";
const TESTO = "hsl(210 10% 90%)";
const ORO = "hsl(45 85% 58%)";
const CARD: React.CSSProperties = { background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 18%)", borderRadius: 12, padding: "16px 18px" };
const griglia: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))", marginBottom: 12 };

const num = (n: number | null | undefined) => n == null ? "—" : Math.round(n).toLocaleString("it-IT");
const euro = (n: number | null | undefined) => n == null ? "—" : `${Math.round(n).toLocaleString("it-IT")} €`;
const milioni = (n: number) => `${(n / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} milioni €`;
const pct = (n: number | null | undefined) => n == null ? "—" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const data = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1° ");
const titolo = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const NOME_ESITO: Record<string, string> = { perdita: "In perdita", pari: "Vicino al pari", profitto: "In utile" };
const NOME_TERZO: Record<string, string> = { basso: "Il terzo più basso", medio: "Il terzo di mezzo", alto: "Il terzo più alto" };

function Numero({ valore, etichetta, nota, colore }: { valore: string; etichetta: string; nota?: React.ReactNode; colore?: string }) {
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div className="tabular" style={{ fontSize: 24, fontWeight: 800, color: colore ?? TESTO, lineHeight: 1.15 }}>{valore}</div>
      <div style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", marginTop: 4 }}>{etichetta}</div>
      {nota && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{nota}</div>}
    </div>
  );
}

function Titoletto({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} style={{ fontSize: 17, fontWeight: 800, color: TESTO, margin: "30px 0 10px", letterSpacing: "0.01em" }}>{children}</h2>;
}

/** Barre affiancate: quanto aveva detto la stima, quanto è successo. */
function Calibrazione({ righe, etichetta }: { righe: { da: number; a: number; detta: number; vera: number; n: number }[]; etichetta: string }) {
  const max = Math.max(...righe.flatMap(r => [r.detta, r.vera]), 1);
  return (
    <div style={{ ...CARD, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: MUTED, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "hsl(210 8% 45%)", marginRight: 5 }} />detto dalla stima</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: COLORE, marginRight: 5 }} />successo davvero</span>
      </div>
      {righe.map(r => (
        <div key={r.da} style={{ display: "grid", gridTemplateColumns: "minmax(92px, 130px) 1fr", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "hsl(210 10% 80%)" }}>
            {etichetta} {r.da}–{r.a}%<div style={{ fontSize: 10.5, color: MUTED }}>{num(r.n)}</div>
          </div>
          <div style={{ display: "grid", gap: 3 }}>
            {[["hsl(210 8% 45%)", r.detta], [COLORE, r.vera]].map(([c, v], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ height: 9, width: `${Math.max(1, (Number(v) / max) * 100)}%`, background: String(c), borderRadius: 3, maxWidth: "calc(100% - 46px)" }} />
                <span className="tabular" style={{ fontSize: 11, color: i ? TESTO : MUTED }}>{pct(Number(v))}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ControlloPage() {
  const { data: d, error } = useQuery<any>({
    queryKey: ["/api/controllo-a-posteriori"],
    queryFn: async () => (await apiRequest("GET", "/api/controllo-a-posteriori")).json(),
    staleTime: 30 * 60 * 1000,
  });

  const intestazione = (
    <IntestazionePagina icona={History} colore={COLORE} titolo="Controllo a posteriori"
      sottotitolo="Le stime del sito rifatte con i soli dati di una data passata, confrontate con com'è andata davvero.">
      Si torna a una data passata, si rifanno i conti con quello che si sapeva quel giorno e si guarda cosa è successo nei 12 mesi dopo.
      La data principale è il 1° ottobre 2025: né il modello dei premi né le fasce di rischio l'avevano vista, quindi è una prova pulita.
      Per i puledri si rifà la stima dell'asta yearling 2024 com'era a ottobre 2024. Il controllo si rilancia a mano quando cambiano i modelli: non è aggiornato ogni notte.
    </IntestazionePagina>
  );

  if (error) return <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 18px 60px" }}>{intestazione}<ErroreCaricamento titolo="Controllo a posteriori" cosa="il controllo a posteriori" /></div>;
  if (!d) return <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 18px 60px" }}>{intestazione}<Sagoma riquadri={4} /></div>;
  if (d.message || !d.principale) return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 18px 60px" }}>{intestazione}
      <div style={{ ...CARD, color: MUTED, fontSize: 13 }}>Il controllo non è ancora stato calcolato su questo archivio.</div></div>
  );

  const p = d.principale, t = p.tenere, sc = p.scuderie, a = d.asta_2024;
  const esito = (k: string) => t.per_esito.find((x: any) => x.esito === k) ?? {};
  const perdita = esito("perdita"), profitto = esito("profitto");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 18px 60px" }}>
      {intestazione}

      <div style={{ ...CARD, borderColor: "hsl(265 45% 68% / 0.45)", fontSize: 13.5, lineHeight: 1.65, color: "hsl(210 10% 86%)" }}>
        <b style={{ color: COLORE }}>In breve.</b> Sui cavalli già in corsa le stime reggono: dei cavalli dati «in perdita» solo {pct(perdita.hanno_coperto)} ha poi coperto
        la spesa, e il totale dei premi stimati ({milioni(t.premi_totali_stimati)}) è vicino a quello vero ({milioni(t.premi_totali_veri)}).
        Anche il rischio della scuderia è misurato bene. Sui puledri dell'asta invece la stima azzecca il totale ma non sa dire quali andranno meglio:
        lì il prezzo pagato ha ordinato i puledri meglio della stima.
      </div>

      {/* 1. TENERE O FERMARE */}
      <Titoletto id="tenere">1. Tenere o fermare, rifatto al {data(p.data)}</Titoletto>
      <div style={griglia}>
        <Numero valore={num(t.cavalli)} etichetta="cavalli in attività quel giorno" />
        <Numero valore={pct(perdita.hanno_coperto)} colore={ESITO_COLORE.perdita} etichetta={`dei ${num(perdita.cavalli)} dati «in perdita» ha poi coperto la spesa`}
          nota={`Il ${pct(perdita.non_hanno_piu_corso)} non ha più corso.`} />
        <Numero valore={pct(profitto.hanno_coperto)} colore={ESITO_COLORE.profitto} etichetta={`dei ${num(profitto.cavalli)} dati «in utile» l'ha coperta davvero`}
          nota="Gli altri sono rimasti sotto: chi è dato in utile non è sicuro." />
        <Numero valore={milioni(t.premi_totali_veri)} etichetta={`premi veri, contro ${milioni(t.premi_totali_stimati)} stimati`} colore={ORO} />
      </div>
      <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
        <table className="tabella-tenere">
          <thead><tr><th>Cosa diceva il sito</th><th className="num">Cavalli</th><th className="num">Premi stimati</th><th className="num">Premi veri</th>
            <th className="num nascondi-mobile">Valore tipico</th><th className="num">Hanno coperto {euro(d.costo_anno)}</th></tr></thead>
          <tbody>
            {t.per_esito.map((x: any) => (
              <tr key={x.esito}>
                <td style={{ color: ESITO_COLORE[x.esito === "pari" ? "pareggio" : x.esito], fontWeight: 700 }}>{NOME_ESITO[x.esito] ?? x.esito}</td>
                <td className="num tabular">{num(x.cavalli)}</td>
                <td className="num tabular">{euro(x.stima_media)}</td>
                <td className="num tabular">{euro(x.vero_medio)}</td>
                <td className="num tabular nascondi-mobile">{euro(x.vero_mediano)}</td>
                <td className="num tabular" style={{ fontWeight: 700 }}>{pct(x.hanno_coperto)}</td>
              </tr>
            ))}
            {t.regola_semplice && (
              <tr>
                <td style={{ color: MUTED }}>Regola semplice: l'anno scorso meno di un terzo del costo</td>
                <td className="num tabular">{num(t.regola_semplice.cavalli)}</td>
                <td className="num tabular">—</td>
                <td className="num tabular">{euro(t.regola_semplice.vero_medio)}</td>
                <td className="num tabular nascondi-mobile">—</td>
                <td className="num tabular" style={{ fontWeight: 700 }}>{pct(t.regola_semplice.hanno_coperto)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Spiegazione>
        Premi medi a cavallo nei 12 mesi dopo il {data(p.data)}. «Valore tipico» è il cavallo a metà della fila: la media è tirata su da pochi cavalli forti.
        La spesa di un anno è {euro(d.costo_anno)} (1.200 € al mese). La regola semplice dice che anche senza modello un cavallo che l'anno prima ha vinto
        meno di un terzo del suo costo quasi mai si ripaga l'anno dopo.
      </Spiegazione>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: TESTO, margin: "20px 0 8px" }}>La probabilità di coprire la spesa era giusta?</h3>
      <Calibrazione etichetta="detto" righe={t.calibrazione_copre.map((r: any) => ({ da: r.da, a: r.a, detta: r.detta, vera: r.vera, n: r.cavalli }))} />
      <Spiegazione>
        Si mettono insieme i cavalli a cui il sito dava una probabilità simile di coprire la spesa e si conta quanti l'hanno coperta davvero.
        Se le due barre sono lunghe uguali, la probabilità è onesta. Le differenze più grandi sono agli estremi: chi era dato quasi senza speranza
        è andato ancora peggio del previsto, chi era dato molto bene è andato un po' meglio.
      </Spiegazione>

      {/* 2. SCUDERIA */}
      <Titoletto id="scuderia">2. Il rischio della scuderia</Titoletto>
      <div style={griglia}>
        <Numero valore={`${pct(sc.a_caso.in_pari_vero)}`} etichetta={`scuderie di ${d.cavalli_per_scuderia} cavalli a caso chiuse in pari`}
          nota={`Il sito diceva ${pct(sc.a_caso.in_pari_detto)} (${num(sc.a_caso.scuderie)} scuderie).`} />
        <Numero valore={pct(sc.a_caso.dentro_forchetta_10_90)} etichetta="risultati dentro la forchetta fra anno brutto e anno buono"
          nota="Doveva essere 80%: la forchetta va dal 10% peggiore al 10% migliore." colore={COLORE} />
        <Numero valore={pct(sc.stesso_guidatore.in_pari_vero)} etichetta="scuderie con lo stesso guidatore chiuse in pari"
          nota={`Il sito diceva ${pct(sc.stesso_guidatore.in_pari_detto)} (${num(sc.stesso_guidatore.scuderie)} scuderie).`} />
        <Numero valore={pct(sc.stesso_guidatore.dentro_forchetta_10_90)} etichetta="dentro la forchetta, scuderie con lo stesso guidatore"
          nota="Non escono dalla forchetta più delle scuderie a caso." colore={COLORE} />
      </div>
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>Si formano scuderie di {d.cavalli_per_scuderia} cavalli in attività al {data(p.data)}: in un caso pescati a caso, nell'altro guidati di solito dallo stesso guidatore.
        Il secondo gruppo serve a vedere se cavalli «della stessa scuderia» vanno bene o male tutti insieme, cosa che il sito non mette nel conto.
        Se fosse così, i risultati veri uscirebbero dalla forchetta più spesso dell'atteso; non succede.</p>
        <p>L'archivio non conosce allenatori e proprietari: il guidatore è l'approssimazione migliore disponibile. Una scuderia vera, con lo stesso allenatore,
        potrebbe essere un po' più legata di così.</p>
      </Spiegazione>

      {d.altre_date?.length > 0 && <>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: TESTO, margin: "20px 0 8px" }}>Lo stesso controllo in altre date</h3>
        <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
          <table className="tabella-tenere">
            <thead><tr><th>Data</th><th className="num">«In perdita» che hanno coperto</th><th className="num">«In utile» che hanno coperto</th>
              <th className="num nascondi-mobile">Premi stimati / veri</th><th className="num">Scuderie in pari, detto / vero</th></tr></thead>
            <tbody>
              {d.altre_date.map((x: any) => (
                <tr key={x.data}><td>{data(x.data)}</td><td className="num tabular">{pct(x.perdita_hanno_coperto)}</td><td className="num tabular">{pct(x.profitto_hanno_coperto)}</td>
                  <td className="num tabular nascondi-mobile">{milioni(x.premi_stimati)} / {milioni(x.premi_veri)}</td>
                  <td className="num tabular">{pct(x.scuderie_in_pari_detto)} / {pct(x.scuderie_in_pari_vero)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Spiegazione>
          Queste date cadono nel periodo che il modello ha usato per scegliere le fasce, quindi la prova è meno severa di quella del 2025.
          Il quadro però è lo stesso: pochi cavalli «in perdita» si ripagano, e le scuderie chiudono in pari un po' più spesso di quanto detto.
        </Spiegazione>
      </>}

      {/* 3. ASTA 2024 */}
      {a && <>
        <Titoletto id="asta">3. I puledri dell'asta 2024</Titoletto>
        <div style={griglia}>
          <Numero valore={`${a.venduti} su ${a.lotti}`} etichetta="puledri venduti" nota={`${a.in_archivio} ritrovati nell'archivio delle corse.`} />
          <Numero valore={euro(a.vero_totale_2_anni)} etichetta={`premi veri a 2 anni, contro ${euro(a.stima_totale_2_anni)} stimati`} colore={ORO} />
          <Numero valore={euro(a.vero_totale_3_anni_finora)} etichetta={`premi a 3 anni finora, contro ${euro(a.stima_totale_3_anni_finora)} stimati`}
            nota={`È corso il ${Math.round(a.quota_stagione_3_anni_gia_corsa * 100)}% della stagione: la stima è già riproporzionata.`} colore={ORO} />
          <Numero valore={`${a.ripagati_con_due_anni} su ${a.venduti}`} etichetta="puledri ripagati entro due stagioni"
            nota={`Pagati in tutto ${euro(a.prezzi_pagati)}, vinti ${euro(a.premi_venduti_due_anni)}.`} colore="hsl(0 60% 62%)" />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
          {[["Divisi per la stima del sito", a.per_terzi_di_stima], ["Divisi per il prezzo pagato", a.per_terzi_di_prezzo]].map(([nome, righe]: any) => (
            <div key={nome} style={{ ...CARD, padding: 0, overflowX: "auto" }}>
              <div style={{ padding: "12px 14px 4px", fontSize: 13, fontWeight: 700, color: TESTO }}>{nome}</div>
              <table className="tabella-tenere">
                <thead><tr><th>Gruppo</th><th className="num">Da – a</th><th className="num">Premi veri medi</th><th className="num nascondi-mobile">Hanno corso a 2 anni</th></tr></thead>
                <tbody>
                  {righe.map((x: any) => (
                    <tr key={x.terzo}><td>{NOME_TERZO[x.terzo] ?? x.terzo}</td><td className="num tabular">{euro(x.da)} – {euro(x.a)}</td>
                      <td className="num tabular" style={{ fontWeight: 700 }}>{euro(x.vero_medio)}</td><td className="num tabular nascondi-mobile">{pct(x.hanno_corso_a_2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <Spiegazione>
          Se una stima sa scegliere, il terzo «alto» vince più del terzo di mezzo e questo più del terzo «basso». Con la stima del sito non succede:
          il terzo di mezzo ha vinto più di quello alto. Con il prezzo pagato invece la scala c'è: chi ha visto i puledri dal vivo sapeva qualcosa che
          i soli genitori non dicono. In numeri, l'accordo fra stima e premi veri è {a.correlazione_stima.toLocaleString("it-IT")}, fra prezzo e premi
          veri {a.correlazione_prezzo.toLocaleString("it-IT")} (0 vuol dire nessun accordo, 1 accordo perfetto): tutti e due bassi.
        </Spiegazione>

        {a.migliori?.length > 0 && <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: TESTO, margin: "20px 0 8px" }}>I dieci che hanno vinto di più</h3>
          <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
            <table className="tabella-tenere">
              <thead><tr><th>Puledro</th><th className="nascondi-mobile">Padre</th><th className="num">Pagato</th><th className="num nascondi-mobile">Stima</th><th className="num">Vinto finora</th></tr></thead>
              <tbody>
                {a.migliori.map((x: any) => (
                  <tr key={x.puledro}>
                    <td><Link href={`/horse/${encodeURIComponent(x.puledro)}/2023`} style={{ color: COLORE }}>{titolo(x.puledro)}</Link></td>
                    <td className="nascondi-mobile">{titolo(x.padre ?? "")}</td>
                    <td className="num tabular">{euro(x.prezzo)}</td>
                    <td className="num tabular nascondi-mobile">{euro(x.stima)}</td>
                    <td className="num tabular" style={{ color: ORO, fontWeight: 700 }}>{euro(x.vero)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Spiegazione>
            «Stima» è quanto il sito si aspettava a ottobre 2024 in premi a 2 e 3 anni. I migliori sono stati stimati come tutti gli altri:
            la stima non li aveva visti arrivare, ed è proprio questo il suo limite sul singolo puledro.
          </Spiegazione>
        </>}

        <Spiegazione titolo="Come è fatto il conto e cosa non dice">
          <p>Per ogni puledro venduto si è usata la stima di «Quanto vale un puledro» con i soli dati al {data(a.data_stima)}: figli del padre nati 2018-2021,
          con la stessa correzione per i puledri scelti all'asta (premi × 1,4). Poi si guardano i premi veri a 2 anni e quelli a 3 anni corsi fin qui
          (ultimo dato: {data(a.ultimo_dato)}).</p>
          <p>La stagione dei 3 anni non è finita, e restano fuori rivendita, valore da riproduttore e corse dopo i 3 anni: il conto del ritorno è incompleto e prudente.</p>
        </Spiegazione>
      </>}

      {/* 4. CONCLUSIONI */}
      <Titoletto id="conclusioni">4. Cosa ne segue</Titoletto>
      <div style={{ ...CARD, fontSize: 13.5, lineHeight: 1.7, color: "hsl(210 10% 86%)" }}>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li><b>Tenere o fermare</b> si può usare: un cavallo dato «in perdita» si ripaga circa una volta su venti.</li>
          <li><b>La tua scuderia</b> dà un rischio credibile: la forchetta fra anno brutto e anno buono contiene il risultato vero quasi 8 volte su 10, come promesso.</li>
          <li><b>Quanto vale un puledro</b> va letto come una media: dice bene quanto rende in media un gruppo di puledri, non quale puledro scegliere.</li>
          <li><b>L'Advisor di accoppiamento</b> resta sperimentale per lo stesso motivo: dai soli genitori non si prevede il singolo figlio.</li>
        </ul>
      </div>

      <CollegamentiCorrelati voci={[
        { href: "/tenere", titolo: "Tenere o fermare", descrizione: "La stima di oggi per ogni cavallo in attività" },
        { href: "/scuderia", titolo: "La tua scuderia", descrizione: "Il rischio dei tuoi cavalli messi insieme" },
        { href: "/puledro", titolo: "Quanto vale un puledro", descrizione: "Prezzo massimo e vendere o far correre" },
        { href: "/metodo", titolo: "Metodo e dati", descrizione: "Da dove vengono i numeri" },
      ]} />
    </div>
  );
}
