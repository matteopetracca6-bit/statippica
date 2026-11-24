/**
 * CHI RENDE DI PIU' (24/11/2026): stalloni, allenatori, ippodromi e puledri
 * d'asta messi in fila per quanto rendono. Le pagine "conviene?" rispondono
 * quasi sempre "no" con le spese vere; qui si vede chi perde meno e chi
 * guadagna. Conti sul server: server/rende.ts.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Trophy, Crown, UserCog, MapPin, Gavel, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Sagoma from "../components/Sagoma";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import SpeseBar from "../components/SpeseBar";
import { Periodo } from "../components/Periodo";
import { useScuderia } from "@/lib/scuderia";
import { CSS_DUE_COLONNE, Cifra, Barretta, nomeBello } from "../components/DueColonne";
import { VERDE, GIALLO, ROSSO, NEUTRO } from "@/lib/coloriEconomia";

const COLORE = coloreScheda("/rende");
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−€ " : "€ ") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const num = (n: number) => Math.round(n).toLocaleString("it-IT");
const pc = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("it-IT")}%`);
const PER_PAGINA = 40;
type Tab = "stalloni" | "allenatori" | "ippodromi" | "aste";
const get = (u: string) => apiRequest("GET", u).then(r => r.json());
const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");

/** Elenco con ricerca, ordine e pagine: lo stesso per le quattro linguette. */
function Classifica<T extends { nome: string }>({ voci, ordini, riga, chiave, vuoto }: {
  voci: T[]; ordini: { k: string; t: string; v: (x: T) => number | null }[];
  riga: (x: T, ordine: string, max: number) => { titolo: React.ReactNode; sotto: React.ReactNode; valore: React.ReactNode; nota: string; barra: number | null; colore?: string; href?: string };
  chiave?: (x: T) => string; vuoto?: string;
}) {
  const [ordine, setOrdine] = useState(ordini[0].k);
  const [cerca, setCerca] = useState("");
  const [pagina, setPagina] = useState(1);
  const o = ordini.find(x => x.k === ordine) ?? ordini[0];
  const filtrate = useMemo(() => {
    const c = cerca.trim().toUpperCase();
    return voci.filter(x => !c || x.nome.toUpperCase().includes(c) || JSON.stringify(x).toUpperCase().includes(c))
      .filter(x => o.v(x) != null).sort((a, b) => (o.v(b) ?? 0) - (o.v(a) ?? 0));
  }, [voci, cerca, ordine]);
  const max = Math.max(1, ...filtrate.map(x => Math.abs(o.v(x) ?? 0)));
  const pagine = Math.max(1, Math.ceil(filtrate.length / PER_PAGINA));
  const p = Math.min(pagina, pagine);
  return (
    <div>
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={cerca} onChange={e => { setCerca(e.target.value); setPagina(1); }} placeholder="Cerca un nome" aria-label="Cerca" />
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {ordini.map(x => <button key={x.k} aria-pressed={ordine === x.k} onClick={() => { setOrdine(x.k); setPagina(1); }}>{x.t}</button>)}
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(filtrate.length)} in classifica</span>
      </div>
      {!filtrate.length ? <div className="ed-pannello ed-vuoto">{vuoto ?? "Nessun risultato."}</div> : (
        <div className="ed-lista">
          {filtrate.slice((p - 1) * PER_PAGINA, p * PER_PAGINA).map((x, i) => {
            const r = riga(x, ordine, max);
            const pos = (p - 1) * PER_PAGINA + i + 1;
            const corpo = (
              <>
                <span className="ed-pos" data-podio={pos <= 3}>{pos}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="ed-nome" style={{ display: "block" }}>{r.titolo}</span>
                  <span className="ed-sotto" style={{ display: "block" }}>{r.sotto}</span>
                  {r.barra != null && <span style={{ display: "block", marginTop: 6 }}><Barretta valore={Math.max(0, r.barra)} max={max} colore={r.colore ?? COLORE} alta={5} /></span>}
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="tabular" style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: r.colore ?? NEUTRO, whiteSpace: "nowrap" }}>{r.valore}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{r.nota}</span>
                </span>
              </>
            );
            return r.href
              ? <Link key={chiave ? chiave(x) : x.nome} href={r.href} className="ed-riga" style={{ textDecoration: "none" }}>{corpo}</Link>
              : <div key={chiave ? chiave(x) : x.nome} className="ed-riga" style={{ cursor: "default" }}>{corpo}</div>;
          })}
          {pagine > 1 && (
            <div className="ed-pagine">
              <button disabled={p <= 1} onClick={() => setPagina(p - 1)} aria-label="Pagina precedente"><ChevronLeft size={14} /></button>
              pagina {p} di {pagine}
              <button disabled={p >= pagine} onClick={() => setPagina(p + 1)} aria-label="Pagina successiva"><ChevronRight size={14} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stalloni() {
  const { data: d } = useQuery<any>({ queryKey: ["/api/rende/stalloni"], queryFn: () => get("/api/rende/stalloni"), staleTime: 3600_000 });
  if (!d) return <Sagoma cornice righe={8} />;
  const migliore = [...d.voci].sort((a: any, b: any) => b.premi_per_nato - a.premi_per_nato)[0];
  const conMonta = d.voci.filter((x: any) => x.premi_per_euro_di_monta != null).sort((a: any, b: any) => b.premi_per_euro_di_monta - a.premi_per_euro_di_monta)[0];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="ed-cifre">
        <Cifra titolo="Un figlio qualunque" valore={euro(d.media_premi_per_nato)} sotto="vinto in media in carriera da un nato, chi non corre conta zero" />
        {migliore && <Cifra titolo="Il migliore per figlio" valore={nomeBello(migliore.nome)} sotto={`${euro(migliore.premi_per_nato)} a nato, ${migliore.nati} nati`} />}
        {conMonta && <Cifra titolo="Il migliore per euro di monta" valore={nomeBello(conMonta.nome)} sotto={`${conMonta.premi_per_euro_di_monta.toLocaleString("it-IT")} € vinti per ogni euro di monta di oggi`} />}
      </div>
      <Classifica voci={d.voci} ordini={[
        { k: "nato", t: "Premi per figlio", v: (x: any) => x.premi_per_nato },
        { k: "monta", t: "Per euro di monta", v: (x: any) => x.premi_per_euro_di_monta },
        { k: "campioni", t: "Figli sopra 100.000 €", v: (x: any) => x.sopra_100mila },
      ]} riga={(x: any, o) => ({
        titolo: nomeBello(x.nome), href: `/stallion/${encodeURIComponent(x.nome)}`,
        sotto: <>{x.nati} nati · corrono {pc(x.corsi)} · sopra 50.000 € {pc(x.sopra_50mila)} · monta {x.monta ? euro(x.monta) : "non in catalogo"}</>,
        valore: o === "monta" ? `${x.premi_per_euro_di_monta.toLocaleString("it-IT")} €` : o === "campioni" ? pc(x.sopra_100mila) : euro(x.premi_per_nato),
        nota: o === "monta" ? "vinti per euro di monta" : o === "campioni" ? "dei nati" : "vinti per figlio nato",
        barra: o === "monta" ? x.premi_per_euro_di_monta : o === "campioni" ? x.sopra_100mila : x.premi_per_nato,
      })} />
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>Per ogni stallone con almeno {d.minimo_nati} figli nati fra il {d.annate[0]} e il {d.annate[1]}: quanto hanno vinto in carriera, diviso per tutti i nati,
        anche quelli che non hanno mai corso (contano zero). Sono carriere quasi chiuse, quindi la media non cambia più molto.</p>
        <p>«Per euro di monta» divide i premi per figlio per il prezzo di monta di oggi, quello del catalogo: chi oggi costa di più ha spesso prodotto quei figli
        quando costava meno. Le madri non sono uguali per tutti: gli stalloni migliori coprono fattrici migliori, e parte del merito è loro.</p>
      </Spiegazione>
    </div>
  );
}

function Allenatori() {
  const { scuderia } = useScuderia();
  const m = scuderia.mensile || 1200;
  const { data: d } = useQuery<any>({ queryKey: ["/api/rende/allenatori", m], queryFn: () => get(`/api/rende/allenatori?mensile=${m}`), staleTime: 3600_000, placeholderData: (p: any) => p });
  if (!d) return <Sagoma cornice righe={8} />;
  const col = (e: number) => (e >= d.spesa_anno ? VERDE : e >= 0.6 * d.spesa_anno ? GIALLO : ROSSO);
  const coprono = d.voci.filter((x: any) => x.premi_per_cavallo >= d.spesa_anno).length;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="ed-cifre">
        <Cifra titolo="La spesa di un anno" valore={euro(d.spesa_anno)} sotto="per cavallo, con le tue spese" />
        <Cifra titolo="Allenatori sopra la spesa" valore={`${coprono} su ${d.voci.length}`} colore={coprono ? VERDE : ROSSO}
          sotto="i loro cavalli in media vincono più di quanto costano" />
      </div>
      <Classifica voci={d.voci} ordini={[
        { k: "cavallo", t: "Premi per cavallo", v: (x: any) => x.premi_per_cavallo },
        { k: "coprono", t: "Cavalli che coprono la spesa", v: (x: any) => x.coprono_la_spesa },
        { k: "vittorie", t: "Vittorie", v: (x: any) => x.vittorie },
      ]} riga={(x: any, o) => ({
        titolo: nomeBello(x.nome), href: `/allenatore/${encodeURIComponent(x.nome)}`,
        sotto: <>{x.cavalli} cavalli · {num(x.partenze)} partenze · vince il {pc(x.vittorie)} · il cavallo tipico {euro(x.premi_tipici)} · coprono la spesa {pc(x.coprono_la_spesa)}</>,
        valore: o === "coprono" ? pc(x.coprono_la_spesa) : o === "vittorie" ? pc(x.vittorie) : euro(x.premi_per_cavallo),
        nota: o === "coprono" ? "dei cavalli coprono la spesa" : o === "vittorie" ? "delle partenze vinte" : "vinti per cavallo in un anno",
        barra: o === "coprono" ? x.coprono_la_spesa : o === "vittorie" ? x.vittorie : x.premi_per_cavallo,
        colore: o === "cavallo" ? col(x.premi_per_cavallo) : undefined,
      })} />
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>Corse in Italia degli ultimi 12 mesi (fino al {new Date(d.fino_al).toLocaleDateString("it-IT")}), allenatori con almeno {d.minimo_cavalli} cavalli.
        Per ogni cavallo si sommano i premi vinti con quell'allenatore; «premi per cavallo» è la media, «il cavallo tipico» quello a metà della fila.
        Verde: in media i suoi cavalli vincono più della spesa di un anno; giallo: almeno il 60%; rosso: meno.</p>
        <p>Non è tutto merito dell'allenatore: chi ha i cavalli migliori vince di più. Serve a capire dove i cavalli rendono, non a dare un voto all'allenatore.</p>
      </Spiegazione>
    </div>
  );
}

function Ippodromi() {
  const { data: d } = useQuery<any>({ queryKey: ["/api/rende/ippodromi"], queryFn: () => get("/api/rende/ippodromi"), staleTime: 3600_000 });
  if (!d) return <Sagoma cornice righe={8} />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Classifica voci={d.voci} ordini={[
        { k: "partente", t: "Premi per partente", v: (x: any) => x.premi_per_partente },
        { k: "premiati", t: "Partenti premiati", v: (x: any) => x.premiati },
        { k: "corsa", t: "Premi per corsa", v: (x: any) => x.premi_per_corsa },
      ]} riga={(x: any, o) => ({
        titolo: nomeBello(x.nome),
        sotto: <>{num(x.corse)} corse · {x.partenti_per_corsa.toLocaleString("it-IT")} partenti a corsa · premiati {pc(x.premiati)} · {euro(x.premi_per_corsa)} a corsa</>,
        valore: o === "premiati" ? pc(x.premiati) : o === "corsa" ? euro(x.premi_per_corsa) : euro(x.premi_per_partente),
        nota: o === "premiati" ? "dei partenti prende un premio" : o === "corsa" ? "distribuiti a corsa" : "in media a ogni partenza",
        barra: o === "premiati" ? x.premiati : o === "corsa" ? x.premi_per_corsa : x.premi_per_partente,
      })} />
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>Corse degli ultimi 12 mesi (fino al {new Date(d.fino_al).toLocaleDateString("it-IT")}), ippodromi italiani con almeno {d.minimo_partenze} partenze.
        «Premi per partente»: tutti i premi netti distribuiti, divisi per le partenze. «Partenti premiati»: quanti escono con un premio.</p>
        <p>Gli ippodromi con i premi più alti hanno anche i cavalli più forti: un cavallo medio rende spesso di più dove i premi sono più bassi ma i partenti meno forti.</p>
      </Spiegazione>
    </div>
  );
}

function Aste() {
  const { data: d } = useQuery<any>({ queryKey: ["/api/rende/aste"], queryFn: () => get("/api/rende/aste"), staleTime: 3600_000 });
  const [vista, setVista] = useState<"puledri" | "padri">("puledri");
  if (!d) return <Sagoma cornice righe={8} />;
  const ripagati = d.voci.filter((x: any) => x.saldo >= 0).length;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="ed-cifre">
        <Cifra titolo="Puledri ritrovati" valore={`${d.ritrovati} su ${d.lotti_venduti}`} sotto="venduti alle aste 2024 e 2025" />
        <Cifra titolo="Hanno già vinto il prezzo" valore={`${ripagati}`} colore={ripagati ? VERDE : ROSSO} sotto="premi finora sopra il prezzo pagato, allenamento escluso" />
      </div>
      <div className="ed-segm" role="group" aria-label="Vista">
        <button aria-pressed={vista === "puledri"} onClick={() => setVista("puledri")}>Puledro per puledro</button>
        <button aria-pressed={vista === "padri"} onClick={() => setVista("padri")}>Per stallone</button>
      </div>
      {vista === "puledri" ? (
        <Classifica voci={d.voci} chiave={(x: any) => `${x.nome}|${x.anno}`} ordini={[
          { k: "saldo", t: "Premi meno prezzo", v: (x: any) => x.saldo },
          { k: "euro", t: "Premi per euro pagato", v: (x: any) => x.rende_per_euro },
          { k: "premi", t: "Premi", v: (x: any) => x.premi },
        ]} riga={(x: any, o) => ({
          titolo: <>{nomeBello(x.nome)} <span style={{ fontSize: 11, color: "var(--ed-fioco)", fontWeight: 600 }}>asta {x.asta}</span></>,
          href: `/horse/${encodeURIComponent(x.nome)}/${x.anno}`,
          sotto: <>{nomeBello(x.padre)}{x.madre ? ` × ${nomeBello(x.madre)}` : ""} · pagato {euro(x.prezzo)} · vinto {euro(x.premi)} in {x.corse} corse</>,
          valore: o === "euro" ? `${x.rende_per_euro.toLocaleString("it-IT")} €` : o === "premi" ? euro(x.premi) : euro(x.saldo),
          nota: o === "euro" ? "vinti per euro pagato" : o === "premi" ? "vinti finora" : "premi finora meno prezzo",
          barra: o === "euro" ? x.rende_per_euro : o === "premi" ? x.premi : x.saldo,
          colore: o === "saldo" ? (x.saldo >= 0 ? VERDE : ROSSO) : undefined,
        })} />
      ) : (
        <Classifica voci={d.per_padre} ordini={[
          { k: "euro", t: "Premi per euro pagato", v: (x: any) => x.rende_per_euro },
          { k: "premi", t: "Premi medi", v: (x: any) => x.premi_medi },
        ]} riga={(x: any, o) => ({
          titolo: nomeBello(x.nome), href: `/stallion/${encodeURIComponent(x.nome)}`,
          sotto: <>{x.lotti} puledri venduti · prezzo medio {euro(x.prezzo_medio)} · vinto in media {euro(x.premi_medi)}</>,
          valore: o === "premi" ? euro(x.premi_medi) : `${x.rende_per_euro.toLocaleString("it-IT")} €`,
          nota: o === "premi" ? "vinti in media a puledro" : "vinti per euro pagato all'asta",
          barra: o === "premi" ? x.premi_medi : x.rende_per_euro,
        })} />
      )}
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>I puledri venduti alle aste yearling 2024 (nati 2023, oggi di 3 anni) e 2025 (nati 2024, al primo anno di corse), ritrovati nell'archivio per nome
        o per madre e anno. «Premi meno prezzo» non conta l'allenamento: è quanto manca, o avanza, solo per ripagare l'acquisto. I nati 2024 hanno appena
        cominciato a correre, quindi sono quasi tutti sotto. «Per stallone» tiene i padri con almeno quattro puledri venduti.</p>
      </Spiegazione>
    </div>
  );
}

export default function RendePage() {
  const [percorso] = useLocation();
  const daIndirizzo = (): Tab => {
    const v = parametri().get("vista");
    return v === "allenatori" || v === "ippodromi" || v === "aste" ? v : "stalloni";
  };
  const [tab, setTab] = useState<Tab>(daIndirizzo);
  useEffect(() => {
    const f = () => setTab(daIndirizzo());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  void percorso;
  const tabs: { key: Tab; label: string; hint: string; icon: any }[] = [
    { key: "stalloni", label: "Stalloni", hint: "Premi per figlio e per euro di monta", icon: Crown },
    { key: "allenatori", label: "Allenatori", hint: "Quanto vince un loro cavallo in un anno", icon: UserCog },
    { key: "ippodromi", label: "Ippodromi", hint: "Dove una partenza rende di più", icon: MapPin },
    { key: "aste", label: "Puledri d'asta", hint: "Premi vinti contro il prezzo pagato", icon: Gavel },
  ];
  const periodo = tab === "stalloni" ? "tutta la carriera dei figli nati 2014-2019" : tab === "aste" ? "le carriere fin qui" : "gli ultimi 12 mesi";
  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Trophy} colore={COLORE} titolo="Chi rende di più" margineSotto={14}
        sottotitolo="Stalloni, allenatori, ippodromi e puledri d'asta messi in fila per quanto rendono davvero.">
        Con le spese vere quasi ogni cavallo è in perdita, e chiedersi «conviene?» dà quasi sempre «no». Qui la domanda è un'altra: fra le scelte possibili,
        quale rende di più? Sono numeri misurati sulle corse vere, non previsioni.
      </IntestazionePagina>
      <SpeseBar periodo={periodo} colore={COLORE} />
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}><Periodo testo={periodo} /></div>
      {tab === "stalloni" && <Stalloni />}
      {tab === "allenatori" && <Allenatori />}
      {tab === "ippodromi" && <Ippodromi />}
      {tab === "aste" && <Aste />}
      <CollegamentiCorrelati voci={[
        { href: "/puledro", titolo: "Prima di correre", descrizione: "Il conto di un puledro preciso" },
        { href: "/tenere", titolo: "In corsa", descrizione: "Lo tengo o lo fermo: i prossimi 12 mesi" },
        { href: "/mercato", titolo: "Mercato", descrizione: "Aste 2026 lotto per lotto e quanto rende ogni voto" },
      ]} />
    </div>
  );
}
