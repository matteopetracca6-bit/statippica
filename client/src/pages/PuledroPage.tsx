/**
 * PRIMA DI CORRERE (24/11/2026, prima "Puledri e aste"): un puledro che non
 * ha ancora corso. Tre linguette: quanto posso pagarlo, lo vendo o lo faccio
 * correre, un incrocio conviene. Aste 2026 e generazione M sono passate in
 * Mercato (MercatoPage).
 *
 * Com'era prima, quattro linguette:
 *  - QUANTO VALE: il prezzo massimo per comprarlo (valutaPuledro in
 *    server/pareggio.ts): premi attesi caso per caso meno l'allenamento, con
 *    la regola "lo fermo quando una stagione non rende";
 *  - VENDERE O FAR CORRERE: lo stesso conto visto da chi ha allevato;
 *  - ASTE 2026: i puledri M passati nelle aste di settembre 2026, uno per
 *    uno; toccando un lotto si apre "Quanto vale" gia' compilato;
 *  - GENERAZIONE M: la simulazione sperimentale dei nati 2025.
 *
 * Gli indirizzi vecchi (/generazione-m, /aste, /prezzo-massimo, /vendere)
 * aprono la linguetta giusta.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tag, Calculator, Repeat, GitMerge, ArrowRight } from "lucide-react";
import Sagoma from "../components/Sagoma";
import NameSelect from "../components/NameSelect";
import VendereOCorrere, { MercatoStalloni } from "../components/VendereOCorrere";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import AggiungiScuderia from "../components/AggiungiScuderia";
import { useScuderia } from "@/lib/scuderia";
import { CSS_DUE_COLONNE, Cifra, Barretta, nomeBello as titolo } from "../components/DueColonne";
import SpeseBar from "../components/SpeseBar";
import IncrocioConviene from "../components/IncrocioConviene";
import { Periodo } from "../components/Periodo";

const COLORE = coloreScheda("/puledro");
const VERDE = "hsl(145 55% 52%)";
const ROSSO = "hsl(0 60% 62%)";
const ORO = "hsl(45 85% 60%)";
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−\u2060€\u00a0" : "€\u00a0") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const pc = (p: number | null | undefined) => (p == null ? "—" : p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`);

const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");

type Tab = "valore" | "vendo" | "incrocio";
interface Scelta { padre: string; madre: string; prezzo: string; asta: boolean; nome: string }

const CSS_PULEDRO = `
.pu-griglia { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
.pu-sticky { position: sticky; top: 12px; }
@media (max-width: 1023px) { .pu-griglia { grid-template-columns: minmax(0, 1fr); } .pu-sticky { position: static; } }
.pu-form { display: flex; flex-direction: column; gap: 12px; }
.pu-form label, .pu-campo { font-size: 12px; color: var(--ed-muto); display: flex; flex-direction: column; gap: 5px; }
.pu-form input[type=number], .pu-form select { background: hsl(220 12% 7%); border: 1px solid var(--ed-bordo); border-radius: 8px;
  color: var(--ed-testo); padding: 8px 10px; font-size: 13px; font-family: inherit; width: 100%; box-sizing: border-box; }
.pu-due { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pu-hero { border-radius: 14px; padding: 18px; border: 1px solid; }
.pu-caso { display: grid; grid-template-columns: minmax(0, 1fr) 120px 92px; gap: 6px 14px; align-items: center; padding: 10px 12px;
  border-radius: 10px; background: var(--ed-fondo2); }
.pu-curva { display: grid; grid-template-columns: 84px minmax(0, 1fr) 46px 86px; gap: 8px; align-items: center; font-size: 12.5px; }
.pu-asta { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 10px; }
.pu-gen { display: grid; grid-template-columns: 110px minmax(0, 1fr) 70px; gap: 10px; align-items: center; font-size: 12.5px; }
@media (max-width: 640px) {
  .pu-caso { grid-template-columns: minmax(0, 1fr) 80px; }
  .pu-caso .pu-netto { grid-column: 1 / -1; text-align: left !important; }
  .pu-curva { grid-template-columns: 70px minmax(0, 1fr) 40px 74px; gap: 6px; font-size: 12px; }
  .pu-gen { grid-template-columns: 86px minmax(0, 1fr) 58px; }
}
`;

/* ------------------------------------------------------------------ */
/* QUANTO VALE                                                         */
/* ------------------------------------------------------------------ */

function QuantoVale({ iniziale, vaiAste }: { iniziale: Scelta; vaiAste: () => void }) {
  const { scuderia } = useScuderia();
  const [padre, setPadre] = useState(iniziale.padre);
  const [madre, setMadre] = useState(iniziale.madre);
  const [prezzo, setPrezzo] = useState(iniziale.prezzo);
  // il costo al mese e' quello della barretta "Le tue spese", uguale in tutte le pagine
  const mensile = scuderia.mensile || 1200;
  const [margine, setMargine] = useState(0);
  const [asta, setAsta] = useState(iniziale.asta);
  const nome = iniziale.nome;
  const prezzoN = prezzo.trim() !== "" && Number(prezzo) >= 0 ? Math.round(Number(prezzo)) : null;

  const qs = `padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}&mensile=${mensile}&margine=${margine}&asta=${asta ? 1 : 0}&prezzo=${prezzoN ?? ""}`;
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/puledro/valore", qs],
    queryFn: async () => (await apiRequest("GET", `/api/puledro/valore?${qs}`)).json(),
    enabled: !!padre,
    staleTime: 30 * 60 * 1000,
    placeholderData: (p: any) => p,
  });
  const r = d?.con_regola;
  const ok = r && r.prezzo_massimo > 0;
  const maxP = r ? Math.max(1, ...r.scenari.map((s: any) => s.p)) : 1;

  return (
    <div className="pu-griglia">
      <div className="ed-pannello pu-form pu-sticky" data-testid="form-puledro">
        <div className="ed-etich">Il puledro</div>
        {nome && <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ed-testo)" }}>{titolo(nome)}</div>}
        <div className="pu-campo">Padre<NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Stallone (almeno 2 lettere)" onChange={n => setPadre((n || "").toUpperCase())} /></div>
        <div className="pu-campo">Madre (facoltativa)<NameSelect value={madre} endpoint="/api/search/mare" placeholder="Fattrice" onChange={n => setMadre((n || "").toUpperCase())} /></div>
        <div className="ed-etich" style={{ marginTop: 6 }}>Il conto</div>
        <label>Prezzo (€)
          <input type="number" min={0} step={1000} inputMode="numeric" value={prezzo} placeholder="facoltativo" onChange={e => setPrezzo(e.target.value)} />
        </label>
        <label>Utile che vuoi in più
          <select value={margine} onChange={e => setMargine(Number(e.target.value))}>
            <option value={0}>nessuno (in pari)</option><option value={10}>10% della spesa</option>
            <option value={25}>25% della spesa</option><option value={50}>50% della spesa</option>
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "var(--ed-testo)", fontSize: 12.5 }}>
          <input type="checkbox" checked={asta} onChange={e => setAsta(e.target.checked)} />
          scelto all'asta (premi × {d?.fattore_asta?.toLocaleString("it-IT") ?? "1,4"})
        </label>
      </div>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {!padre && (
          <div className="ed-pannello ed-vuoto" style={{ borderStyle: "dashed" }}>
            Scegli il padre (e se vuoi la madre) per vedere quanto vale.
            <div style={{ marginTop: 12 }}>
              <button className="chip-filtro" onClick={vaiAste}>oppure scegli un puledro delle aste 2026 <ArrowRight size={13} style={{ verticalAlign: -2 }} /></button>
            </div>
          </div>
        )}
        {padre && !d && isFetching && <Sagoma riquadri={4} />}
        {d?.message && <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>{d.message}</div>}
        {d && r && !d.message && <>
          <div className="pu-hero" data-testid="hero-prezzo-massimo"
            style={{ borderColor: ok ? "color-mix(in srgb, " + VERDE + " 45%, transparent)" : "color-mix(in srgb, " + ROSSO + " 45%, transparent)",
              background: ok ? "color-mix(in srgb, " + VERDE + " 7%, var(--ed-fondo))" : "color-mix(in srgb, " + ROSSO + " 7%, var(--ed-fondo))" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className="ed-etich">Puoi pagarlo al massimo</span><Periodo testo="tutta la carriera" /></div>
                <div className="tabular" style={{ fontSize: 34, fontWeight: 900, color: ok ? VERDE : ROSSO, lineHeight: 1.1, marginTop: 4 }}>
                  {ok ? euro(r.prezzo_massimo) : "nessuno"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ed-testo)", marginTop: 6, lineHeight: 1.5, maxWidth: 440 }}>
                  {ok ? <>Pagandolo così, in media sei in pari{margine ? ` con il ${margine}% di utile` : ""}.</>
                    : <>Anche regalato, in media perde {euro(-r.valore_atteso)}: i premi attesi non coprono l'allenamento.</>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <AggiungiScuderia voce={{ tipo: "puledro", nome: nome || null, padre: d.padre, madre: d.madre, anno: new Date().getFullYear() - 1, prezzo: prezzoN, asta }} />
                <Link href={`/stallion/${encodeURIComponent(d.padre)}`} style={{ fontSize: 12, color: COLORE }}>scheda di {titolo(d.padre)}</Link>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--ed-muto)", marginTop: 10, borderTop: "1px solid var(--ed-bordo)", paddingTop: 8 }}>
              <b style={{ color: "var(--ed-testo)" }}>{titolo(d.padre)}</b>{d.madre && <> × <b style={{ color: "var(--ed-testo)" }}>{titolo(d.madre)}</b></>}
              {" · "}{d.figli_osservati.padre} figli del padre{d.madre ? `, ${d.figli_osservati.madre} della madre` : ""} · affidabilità {Math.round(d.affidabilita * 100)}%
              {d.affidabilita < 0.4 && " (pochi figli: conta di più la media di tutti i cavalli)"}
            </div>
          </div>

          <div className="ed-cifre">
            <Cifra titolo="Premi attesi" valore={euro(r.premi_attesi)} colore={ORO} sotto="in tutta la carriera" />
            <Cifra titolo="Allenamento" valore={euro(r.allenamento_atteso)} sotto="e mantenimento, in media" />
            {d.prezzo != null ? <>
              <Cifra titolo={`Pagato ${euro(d.prezzo)}`} valore={euro(r.con_prezzo.utile_atteso)} colore={r.con_prezzo.utile_atteso >= 0 ? VERDE : ROSSO}
                sotto={<>utile atteso; si ripaga in {pc(r.con_prezzo.prob_ripaga)} dei casi</>} />
              <Cifra titolo="In pari se al mese" valore={d.mensile_di_pareggio ? `< ${euro(d.mensile_di_pareggio)}` : "mai"} colore={d.mensile_di_pareggio ? ORO : ROSSO}
                sotto={d.mensile_di_pareggio ? "a quel prezzo" : "nemmeno a 100 € al mese"} />
            </> : (
              <Cifra titolo="Si ripaga, regalato" valore={pc(r.prob_ripaga_gratis)} sotto="casi su 100 in cui i premi coprono l'allenamento" />
            )}
          </div>

          <div className="ed-pannello">
            <div className="ed-tit" style={{ marginTop: 0 }}>Come può andare, caso per caso</div>
            <Spiegazione compatta>
              Ogni riga è un modo in cui può andare la sua carriera, con la probabilità che viene dai figli del padre{d.madre ? " e della madre" : ""} e i premi veri dei cavalli
              nati 2014-2019 finiti in quel caso. Il cavallo si ferma a fine stagione, dai 3 anni in su, se in quella stagione ha vinto meno di metà del suo costo.
            </Spiegazione>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {r.scenari.map((s: any) => (
                <div key={s.chiave} className="pu-caso" data-testid={`caso-${s.chiave}`}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ed-testo)" }}>{s.nome}</div>
                    <div style={{ fontSize: 11, color: "var(--ed-muto)", marginTop: 1 }}>{s.nota}</div>
                    <div style={{ fontSize: 11, color: "var(--ed-fioco)", marginTop: 3 }}>
                      premi {euro(s.premi_medi)} (tipico {euro(s.premi_tipici)}) · {s.anni_medi.toLocaleString("it-IT")} anni · allenamento {euro(s.allenamento)}
                    </div>
                  </div>
                  <div>
                    <div className="tabular" style={{ fontSize: 15, fontWeight: 800, color: "var(--ed-testo)", textAlign: "right" }}>{pc(s.p)}</div>
                    <div style={{ marginTop: 4 }}><Barretta valore={s.p} max={maxP} colore={COLORE} /></div>
                  </div>
                  <div className="pu-netto tabular" style={{ fontSize: 14, fontWeight: 800, textAlign: "right", color: s.netto >= 0 ? VERDE : ROSSO }}>
                    {euro(s.netto)}<span style={{ display: "block", fontSize: 10.5, fontWeight: 500, color: "var(--ed-fioco)" }}>netto</span>
                  </div>
                </div>
              ))}
              <div className="pu-caso" style={{ background: "transparent", border: "1px solid var(--ed-bordo)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ed-testo)" }}>In media
                  <div style={{ fontSize: 11, fontWeight: 400, color: "var(--ed-fioco)" }}>premi {euro(r.premi_attesi)} · allenamento {euro(r.allenamento_atteso)}</div></div>
                <div className="tabular" style={{ textAlign: "right", fontSize: 13, color: "var(--ed-muto)" }}>100%</div>
                <div className="pu-netto tabular" style={{ fontSize: 15, fontWeight: 900, textAlign: "right", color: r.valore_atteso >= 0 ? VERDE : ROSSO }}>{euro(r.valore_atteso)}</div>
              </div>
            </div>
            <Spiegazione compatta titolo="E se non lo fermi">
              Se invece lo tieni quanto hanno corso davvero i cavalli dell'archivio, senza fermarlo: premi {euro(d.senza_regola.premi_attesi)}, allenamento {euro(d.senza_regola.allenamento_atteso)},
              netto {euro(d.senza_regola.valore_atteso)}{d.senza_regola.prezzo_massimo > 0 ? <>, prezzo massimo {euro(d.senza_regola.prezzo_massimo)}</> : null}. Fermare chi non rende
              {d.senza_regola.valore_atteso < r.valore_atteso ? <> vale {euro(r.valore_atteso - d.senza_regola.valore_atteso)} a puledro.</> : " qui non migliora il conto."}
            </Spiegazione>
          </div>

          <div className="ed-pannello">
            <div className="ed-tit" style={{ marginTop: 0 }}>Se lo paghi…</div>
            <Spiegazione compatta>
              Per ogni prezzo: in quanti casi su 100 i premi coprono prezzo e allenamento, e l'utile medio. In verde i prezzi fino al prezzo massimo.
              {d.aste_padre && <> All'asta i figli di {titolo(d.padre)} sono stati pagati in mediana {euro(d.aste_padre.mediana)} ({d.aste_padre.n} venduti).</>}
            </Spiegazione>
            <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
              {r.curva.map((c: any) => {
                const sopra = r.prezzo_massimo > 0 && c.prezzo <= r.prezzo_massimo;
                return (
                  <div key={c.prezzo} className="pu-curva">
                    <span className="tabular" style={{ color: "var(--ed-testo)", textAlign: "right" }}>{c.prezzo === 0 ? "regalato" : euro(c.prezzo)}</span>
                    <Barretta valore={c.prob_ripaga} colore={sopra ? VERDE : COLORE} alta={11} />
                    <span className="tabular" style={{ color: "var(--ed-testo)", fontWeight: 700, textAlign: "right" }}>{pc(c.prob_ripaga)}</span>
                    <span className="tabular" style={{ color: c.utile_atteso >= 0 ? VERDE : ROSSO, textAlign: "right" }}>{euro(c.utile_atteso)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PAGINA                                                               */
/* ------------------------------------------------------------------ */

export default function PuledroPage() {
  const [percorso, naviga] = useLocation();
  const linguettaDa = (perc: string): Tab => {
    const q = parametri();
    return perc.startsWith("/vendere") || q.get("modo") === "vendo" ? "vendo" : q.get("modo") === "incrocio" ? "incrocio" : "valore";
  };
  const sceltaDa = (): Scelta => {
    const q = parametri();
    return { padre: q.get("padre")?.toUpperCase() ?? "", madre: q.get("madre")?.toUpperCase() ?? "",
      prezzo: q.get("prezzo") ?? "", asta: q.get("asta") === "1", nome: q.get("nome") ?? "" };
  };
  const [tab, setTab] = useState<Tab>(() => linguettaDa(percorso));
  const [scelta, setScelta] = useState<Scelta>(sceltaDa);
  const [versione, setVersione] = useState(0);
  // Un collegamento che resta in questa pagina (dalle aste, da un'altra
  // linguetta) non la rimonta: si seguono l'indirizzo e i suoi parametri.
  useEffect(() => {
    const f = () => {
      setTab(linguettaDa(window.location.hash.replace(/^#/, "").split("?")[0]));
      setScelta(sceltaDa()); setVersione(v => v + 1);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const { scuderia } = useScuderia();
  useEffect(() => { window.scrollTo?.(0, 0); }, [tab]);

  const tabs: { key: Tab; label: string; hint: string; icon: any }[] = [
    { key: "valore", label: "Quanto posso pagarlo", hint: "Il prezzo massimo per comprarlo", icon: Calculator },
    { key: "vendo", label: "Lo vendo o lo faccio correre", hint: "Per chi l'ha allevato", icon: Repeat },
    { key: "incrocio", label: "Un incrocio conviene?", hint: "Stallone e fattrice, prima della monta", icon: GitMerge },
  ];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE + CSS_PULEDRO}</style>
      <IntestazionePagina icona={Tag} colore={COLORE} titolo="Prima di correre" margineSotto={14}
        sottotitolo="Un puledro che non ha ancora corso: quanto pagarlo al massimo, se venderlo e se un incrocio conviene.">
        Il valore di un puledro è quello che rende in pista, caso per caso, meno quello che costa farlo correre. Sul singolo puledro la stima è larga:
        rifatta sull'asta 2024 con i dati di allora, ha indovinato bene il totale dei premi ma non quali puledri sarebbero andati meglio
        (vedi <Link href="/controllo" style={{ color: COLORE }}>Controllo a posteriori</Link>). Le aste 2026 lotto per lotto sono in <Link href="/mercato" style={{ color: COLORE }}>Mercato</Link>.
      </IntestazionePagina>

      <SpeseBar periodo="tutta la carriera del puledro" conMonta={tab === "incrocio"} colore={COLORE} />

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

      {tab === "valore" && <QuantoVale key={`v${versione}`} iniziale={scelta} vaiAste={() => naviga("/mercato")} />}
      {tab === "vendo" && (
        <div className="ed-pannello">
          <Spiegazione compatta>
            All'asta yearling, verso i 18 mesi, l'allevatore sceglie: incassare subito o tenere il puledro e pagarne l'allenamento.
            Allevamento e monta sono ormai spesi e non cambiano la scelta. Conviene vendere quando il prezzo supera il valore del puledro in pista,
            cioè il prezzo massimo che pagherebbe un compratore attento.
          </Spiegazione>
          <VendereOCorrere mensile={scuderia.mensile || 1200} />
          <MercatoStalloni mensile={scuderia.mensile || 1200} />
        </div>
      )}
      {tab === "incrocio" && <IncrocioConviene key={`i${versione}`} padreIniziale={scelta.padre} madreIniziale={scelta.madre} />}

      {(tab === "valore" || tab === "vendo") && (
        <div style={{ marginTop: 16 }}>
          <Spiegazione titolo="Come è fatto il conto e cosa non dice">
            <p>Le probabilità di ogni caso vengono dai voti dei figli del padre (e della madre) nati 2012-2021; con pochi figli si appoggiano alla media di tutti i cavalli,
            come per gli incroci. I premi e le stagioni di ogni caso sono quelli veri, stagione per stagione, dei cavalli nati 2014-2019 con quel voto.
            I premi netti sono già la parte del proprietario.</p>
            <p>Costi: un anno di doma e preparazione prima del debutto, più un anno per ogni stagione di corse, al costo mensile delle tue spese.
            La regola di fermarlo usa solo la stagione appena finita, come farebbe un proprietario: a volte ferma un cavallo che dopo sarebbe migliorato, e anche questo è nel conto.</p>
            <p>«Scelto all'asta»: i puledri delle aste 2024 e 2025 hanno vinto circa 1,4 volte quanto diceva il loro pedigree, a 2 e a 3 anni.
            Che il vantaggio continui dopo i 3 anni è un'ipotesi: non c'è ancora un'asta da cui verificarlo.</p>
            <p>Non contano: la rivendita, il valore di una femmina come fattrice, i premi all'allevatore. Sono tutti a favore: il prezzo massimo vero è un po' più alto.
            Il costo mensile è la leva più forte: provalo a 800 € oltre che a 1.200 €.</p>
          </Spiegazione>
        </div>
      )}
      <CollegamentiCorrelati voci={[
        { href: "/mercato", titolo: "Mercato", descrizione: "Aste 2026, generazione M e quanto rende ogni voto" },
        { href: "/scuderia", titolo: "La tua scuderia", descrizione: "Metti insieme i tuoi cavalli: cassa, rischio e valore" },
        { href: "/advisor", titolo: "Advisor", descrizione: "Scegli lo stallone migliore per una fattrice" },
      ]} />
    </div>
  );
}
