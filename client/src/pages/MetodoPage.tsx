/**
 * Metodo e dati: come sono fatti i numeri del sito, e quanto sono freschi.
 *
 * E' la pagina che cerca per prima chi deve giudicare il lavoro (un relatore,
 * un allevatore diffidente): da dove vengono i dati, come si calcola ogni voto,
 * cosa NON si puo' concludere. In cima lo stato dal vivo dell'archivio, con
 * date vere prese dall'archivio e da GitHub, perche' "si aggiorna ogni notte"
 * detto senza una data e' solo una promessa.
 *
 * I numeri scritti nel testo (pesi, soglie, correlazioni) sono gli stessi del
 * codice che calcola i voti: se cambia uno, va cambiato anche qui.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { BookMarked, Database, RefreshCw, CheckCircle2, AlertTriangle, Clock, ChevronDown } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import { Caricamento } from "../components/Caricamento";

const MUTED = "hsl(210 8% 58%)";
const DIM = "hsl(210 8% 42%)";
const TESTO = "hsl(210 10% 80%)";
const BORDER = "1px solid hsl(220 10% 18%)";
const CARD = { background: "hsl(220 12% 10%)", border: BORDER, borderRadius: "12px", padding: "18px 22px" };

function data(d?: string | null) {
  if (!d) return "\u2014";
  const x = new Date(d.length === 10 ? d + "T12:00:00" : d);
  if (isNaN(x.getTime())) return d;
  return x.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function quantoFa(d?: string | null) {
  if (!d) return "";
  const ore = (Date.now() - new Date(d).getTime()) / 3600000;
  if (isNaN(ore)) return "";
  if (ore < 1) return "meno di un'ora fa";
  if (ore < 24) return `${Math.round(ore)} ore fa`;
  const g = Math.round(ore / 24);
  return g === 1 ? "ieri" : `${g} giorni fa`;
}

function n(x?: number | null) {
  // In italiano Intl non mette il punto nei numeri a quattro cifre (6195):
  // lo si aggiunge a mano, come nel resto del sito.
  return x == null ? "\u2014" : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Ogni sezione è una tendina chiusa: si legge il titolo e si apre quella che serve. */
function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <details className="sezione-metodo" style={{ ...CARD, marginBottom: "12px", padding: 0 }}>
      <summary style={{ padding: "14px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, listStyle: "none" }}>
        <ChevronDown size={16} className="freccia-metodo" style={{ color: "hsl(183 60% 55%)", flexShrink: 0, transition: "transform .2s" }} />
        <h2 style={{ fontSize: "15.5px", fontWeight: 700, color: "hsl(210 10% 90%)", margin: 0 }}>{titolo}</h2>
      </summary>
      <div className="testo-metodo" style={{ fontSize: "13.5px", color: TESTO, lineHeight: 1.75, padding: "0 22px 18px" }}>{children}</div>
    </details>
  );
}

function Notturno({ nome, run }: { nome: string; run?: { esito: string; quando: string } | null }) {
  if (!run) return <div style={{ color: DIM, fontSize: "12.5px" }}>{nome}: non disponibile</div>;
  const ok = run.esito === "success";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: MUTED }}>
      {ok ? <CheckCircle2 size={14} style={{ color: "hsl(100 60% 52%)" }} />
          : <AlertTriangle size={14} style={{ color: "hsl(35 85% 58%)" }} />}
      <span>{nome}: <strong style={{ color: ok ? "hsl(100 55% 62%)" : "hsl(35 85% 62%)" }}>{ok ? "riuscito" : "non riuscito"}</strong>, {quantoFa(run.quando)}</span>
    </div>
  );
}

export default function MetodoPage() {
  const { data: st, isLoading } = useQuery<any>({
    queryKey: ["/api/stato-dati"],
    queryFn: () => apiRequest("GET", "/api/stato-dati").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const a = st?.archivio;

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "22px 18px 70px" }}>
      <style>{`
        .testo-metodo p { margin: 0 0 10px; }
        .testo-metodo p:last-child { margin-bottom: 0; }
        .testo-metodo ul { margin: 6px 0 10px; padding-left: 20px; list-style: disc; }
        .testo-metodo li::marker { color: hsl(183 70% 50%); }
        .testo-metodo li { margin-bottom: 5px; }
        .testo-metodo strong { color: hsl(210 10% 92%); }
        .testo-metodo table { border-collapse: collapse; margin: 8px 0 12px; font-size: 12.5px; }
        .testo-metodo td, .testo-metodo th { padding: 5px 14px 5px 0; text-align: left; border-bottom: 1px solid hsl(220 10% 15%); }
        .sezione-metodo > summary::-webkit-details-marker { display: none; }
        .sezione-metodo[open] .freccia-metodo { transform: rotate(180deg); }
        .sezione-metodo > summary:hover h2 { color: hsl(183 70% 62%); }
        .testo-metodo th { color: hsl(210 8% 45%); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
      `}</style>

      <IntestazionePagina icona={BookMarked} colore="hsl(40 40% 72%)" titolo="Metodo e dati" margineSotto={20}
        sottotitolo="Da dove vengono i numeri del sito, come si calcola ogni voto e cosa non se ne può concludere. Apri la sezione che ti serve." />

      {/* STATO DAL VIVO */}
      <section style={{ ...CARD, marginBottom: "20px", borderColor: "hsl(183 60% 30% / 0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <RefreshCw size={15} style={{ color: "hsl(183 75% 55%)" }} />
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)", margin: 0 }}>L'archivio adesso</h2>
        </div>
        {isLoading ? <Caricamento testo="Leggo lo stato dell'archivio..." /> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              {[
                { l: "Ultima gara registrata", v: data(a?.ultima_gara), s: quantoFa(a?.ultima_gara) },
                { l: "Archivio pubblicato", v: data(st?.archivio_pubblicato), s: quantoFa(st?.archivio_pubblicato) },
                { l: "Gare nell'archivio", v: n(a?.gare), s: a?.prima_gara ? `dal ${data(a.prima_gara)}` : "" },
                { l: "Corse in programma fino al", v: data(a?.prossima_gara), s: "dal calendario ufficiale" },
              ].map(x => (
                <div key={x.l}>
                  <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{x.l}</div>
                  <div className="tabular" style={{ fontSize: "17px", fontWeight: 800, color: "hsl(210 10% 90%)" }}>{x.v}</div>
                  <div style={{ fontSize: "11.5px", color: DIM, marginTop: "2px" }}>{x.s}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
              <Notturno nome="Aggiornamento notturno dei risultati" run={st?.notturno_risultati} />
              <Notturno nome="Manutenzione notturna dell'archivio" run={st?.notturno_manutenzione} />
              {!st?.github_raggiungibile && (
                <div style={{ fontSize: "12px", color: DIM }}>
                  Al momento GitHub non dice com'e' andato ogni lavoro notturno. La data di pubblicazione qui sopra e' quella del file dell'archivio, e i dati restano validi.
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px", fontSize: "12.5px", color: MUTED, paddingTop: "12px", borderTop: "1px solid hsl(220 10% 15%)" }}>
              <span><strong style={{ color: TESTO }}>{n(a?.cavalli_valutati)}</strong> cavalli con voto</span>
              <span><strong style={{ color: TESTO }}>{n(a?.stalloni_valutati)}</strong> stalloni</span>
              <span><strong style={{ color: TESTO }}>{n(a?.fattrici_valutate)}</strong> fattrici</span>
              <span><strong style={{ color: TESTO }}>{n(a?.guidatori)}</strong> guidatori</span>
              <span><strong style={{ color: TESTO }}>{n(a?.ippodromi)}</strong> ippodromi</span>
            </div>
            {a?.da_controllare > 0 && (
              <div style={{ display: "flex", gap: "7px", alignItems: "flex-start", marginTop: "12px", fontSize: "12px", color: DIM, lineHeight: 1.6 }}>
                <Clock size={13} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  {n(a.da_controllare)} cavalli aspettano ancora il controllo delle gare piu' vecchie della loro
                  carriera. Il lavoro notturno ne controlla alcune centinaia a notte e finisce da solo.
                </span>
              </div>
            )}
          </>
        )}
      </section>

      <Sezione titolo="Da dove vengono i dati">
        <ul>
          <li><strong>Trottoweb</strong>: le gare corse, con piazzamento, tempo al chilometro, guidatore, numero di partenza e premio, e il calendario delle corse in programma.</li>
          <li><strong>Banca dati UNIRE e ANACT</strong>: la genealogia, cioe' padre, madre e nonni.</li>
          <li><strong>VendoPuledri</strong>: le qualifiche dei cavalli giovani, gli allevatori, gli alberi genealogici a cinque generazioni e le classifiche degli stalloni 2017-2025.</li>
          <li><strong>Aste ITS e ANACT</strong>: 539 puledri messi all'asta, di cui 422 venduti davvero, con il prezzo. Servono alla stima della rivendita da yearling.</li>
          <li><strong>Cataloghi delle stazioni di monta</strong>: stalloni disponibili e tasse di monta della stagione.</li>
        </ul>
        <p>Sono tutte fonti pubbliche. Nessun dato viene inserito o corretto a mano: ogni riparazione passa da un programma che si puo' rileggere e rifare.</p>
      </Sezione>

      <Sezione titolo="Chi entra nei conti">
        <p>
          Il sito valuta come <strong>atleti</strong> i cavalli nati dal 2012 in poi. Un trottatore debutta a
          due anni, quindi la prima gara dell'archivio e' dell'estate 2014. I cavalli nati prima servono solo
          come <strong>riproduttori</strong>: entrano nella genealogia e nel giudizio sui figli, ma hanno una
          classifica storica a parte, perche' di loro online esistono solo i totali di carriera e i montepremi
          di allora non sono confrontabili con quelli di oggi.
        </p>
      </Sezione>

      <Sezione titolo="Il voto dei cavalli">
        <p>Ogni cavallo riceve un punteggio da 0 a 100, fatto di cinque parti. Ogni parte e' un confronto con gli altri atleti, non un valore assoluto.</p>
        <table>
          <thead><tr><th>Parte</th><th>Peso</th><th>Cosa misura</th></tr></thead>
          <tbody>
            <tr><td>Guadagni</td><td>60%</td><td>quanto ha vinto in carriera: per meta' la posizione fra gli atleti, per meta' quanti soldi in piu'</td></tr>
            <tr><td>Record</td><td>10%</td><td>il miglior tempo al chilometro</td></tr>
            <tr><td>Vittorie</td><td>7,5%</td><td>quota di corse vinte, corretta per il numero di corse</td></tr>
            <tr><td>Tenuta</td><td>11,25%</td><td>quante stagioni ha corso</td></tr>
            <tr><td>Continuita'</td><td>11,25%</td><td>stagioni corse su quelle che poteva correre</td></tr>
          </tbody>
        </table>
        <p>
          <strong>Perche' i guadagni pesano di piu'.</strong> Contati solo come posizione in classifica si
          appiattivano in cima: un cavallo con 223.779 euro stava gia' al 98,8%, uno con 3,5 milioni al 100%, e
          quindici volte i soldi valevano poco piu' di un punto. Per questo meta' del peso va a una scala dei soldi
          veri, dove il cavallo che ha vinto di piu' vale 100 e ogni raddoppio dei guadagni aggiunge lo stesso
          tratto: in cima ogni milione in piu' conta ancora.
        </p>
        <p>
          <strong>Perche' le vittorie sono corrette.</strong> Otto vittorie su otto corse non valgono piu' di
          venticinque su novanta: con poche prove non si distingue il campione dal fortunato. Per questo alla
          quota del cavallo si aggiungono venti "corse medie" della popolazione. Con poche corse pesa la media,
          con molte il cavallo.
        </p>
        <p>
          <strong>Perche' il record pesa poco.</strong> E' il singolo giorno migliore di una carriera. I guadagni
          e la tenuta dicono molto di piu' sul valore di un cavallo, anche economico.
        </p>
        <p>
          <strong>Le lettere</strong> dipendono dalla posizione nella classifica: SSS e' l'1% migliore, SS il 5%,
          S il 10%, A il 25%, B il 40%, C il 60%, D il 75%, E il 90%, F il resto. Un cavallo giovane con poche
          corse puo' ancora cambiare lettera, e la sua scheda dice quanto e' probabile.
        </p>
      </Sezione>

      <Sezione titolo="Stalloni e fattrici: il giudizio sui figli">
        <p>
          Uno stallone si giudica dalla media dei voti dei figli che hanno corso, con una piccola correzione, al
          massimo cinque punti, dai guadagni della sua progenie nelle classifiche VendoPuledri. Le fattrici si
          giudicano allo stesso modo, sui loro figli.
        </p>
        <p>
          <strong>L'affidabilita'.</strong> Un giudizio su tre figli e uno su duecento non valgono uguale. Accanto
          a ogni stallone c'e' quanto ci si puo' fidare del suo voto, calcolato con la formula classica della prova
          di progenie: figli / (figli + 12,3). Con 12 figli in pista si arriva al 50%, con 50 all'80%. La formula
          e' stata verificata su questo archivio dividendo a caso i figli di ogni stallone in due meta' e guardando
          quanto la prima predice la seconda: da dieci figli in su il risultato coincide con quello atteso.
        </p>
      </Sezione>

      <Sezione titolo="Guidatori e numero di partenza">
        <p>
          La classifica dei <Link href="/guidatori"><a className="collegamento-scheda">guidatori</a></Link> non e'
          per vittorie, che dipendono soprattutto dai cavalli ricevuti. Si guarda quanto i cavalli arrivano meglio
          della loro media quando li guida una certa persona, e si toglie l'effetto del numero di partenza. La
          verifica: il rendimento fino al 2022 predice quello dal 2023 con correlazione 0,62 su 466 guidatori.
        </p>
        <p>
          Il numero di partenza e' l'effetto piu' netto dell'archivio: dal primo si arriva nei primi tre il 49%
          delle volte, dal dodicesimo il 27%. Una parte del divario pero' non e' la posizione ma chi ci viene
          messo: in molte corse i numeri esterni vanno per regolamento ai cavalli con piu' vittorie.
        </p>
      </Sezione>

      <Sezione titolo="Advisor e rivendita: strumenti sperimentali">
        <p>
          L'<strong>Advisor</strong> stima il figlio di un accoppiamento dai dati dei genitori. E' stato
          costruito solo sui cavalli nati fino al 2019 e verificato sui 6.201 nati dopo, che non aveva mai visto:
          la correlazione fra previsione e risultato e' 0,17, contro 0,14 guardando solo il padre. La genetica
          pone un tetto fra 0,21 e 0,42, perche' gran parte della carriera dipende da allenamento, guidatore,
          salute e sorte. E' un segnale reale ma piccolo: lo strumento serve a esplorare, non a decidere una monta. Il dettaglio e' nella pagina{" "}
          <Link href="/validazione"><a className="collegamento-scheda">Verifica</a></Link>.
        </p>
        <p>
          La <strong>rivendita da yearling</strong> usa i prezzi veri d'asta dove ci sono: per 42 stalloni con
          almeno tre figli venduti si mostra la fascia effettivamente pagata. Per gli altri il prezzo si stima dalla
          tassa di monta, e quella stima spiega circa un quarto delle differenze di prezzo: e' indicata come tale.
        </p>
      </Sezione>

      <Sezione titolo="Le stime rifatte nel passato">
        <p>Le stime economiche sono state rifatte con i soli dati di una data passata (il 1° ottobre 2025, che i modelli non avevano visto) e confrontate
        con com'è andata: dei cavalli dati «in perdita» solo 5 su 100 hanno poi coperto la spesa, e il rischio della scuderia è risultato misurato bene.
        Sui puledri dell'asta 2024 la stima ha indovinato il totale dei premi ma non quali puledri sarebbero andati meglio.
        Tutti i numeri sono in <Link href="/controllo"><a style={{ color: "hsl(265 45% 68%)" }}>Controllo a posteriori</a></Link>.</p>
      </Sezione>

      <Sezione titolo="Cosa non si puo' concludere">
        <ul>
          <li>Un voto descrive la carriera corsa, non il valore genetico del cavallo.</li>
          <li>I cavalli con poche corse o i giudizi con pochi figli sono segnalati: vanno letti come impressioni, non come misure.</li>
          <li>I guidatori sono visti solo dal 2014, e solo mentre guidano cavalli nati dal 2012.</li>
          <li>Le gare all'estero contano nelle carriere, ma la fonte le raccoglie sotto un'unica voce e non hanno una scheda per pista.</li>
          <li>Nessuna stima del sito e' un consiglio d'acquisto: dove l'incertezza e' grande, la pagina lo dice.</li>
        </ul>
      </Sezione>

      <Sezione titolo="Come si aggiorna">
        <p>
          Ogni notte un lavoro automatico scarica i nuovi risultati e le corse in programma, ricalcola tutti i voti,
          controlla la qualita' dei dati e pubblica l'archivio aggiornato; subito dopo il sito lo riprende. Un
          secondo lavoro notturno ripassa i cavalli in attivita' e colma i buchi delle carriere. Ogni settimana si
          aggiornano il catalogo degli stalloni, la loro genealogia e il modello dell'Advisor.
        </p>
        <p>
          Dopo ogni giro un controllo verifica che ogni dato mostrato dal sito abbia chi lo aggiorna e che le date
          dentro l'archivio siano recenti: un lavoro puo' avere l'orario giusto e fallire in silenzio, e solo le
          date lo rivelano.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px", color: DIM, marginTop: "6px" }}>
          <Database size={13} />
          <span>Il codice e i dati sono pubblici e si possono ricontrollare dall'inizio alla fine.</span>
        </div>
      </Sezione>
    </div>
  );
}
