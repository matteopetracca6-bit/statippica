/**
 * TENERE O FERMARE.
 *
 * Tutti i cavalli che hanno corso nell'ultimo anno, ciascuno con i premi
 * attesi nei prossimi 12 mesi (modello XGBoost, stima_premi.py), la
 * probabilita' di coprire la spesa di un anno e l'esito atteso al costo
 * scelto. E' lo strumento chiesto dal relatore visto su tutti i cavalli
 * insieme. La scheda "Per stallone" raggruppa gli stessi cavalli per padre:
 * e' un dato misurato sui figli che corrono, non una previsione dai genitori.
 *
 * Layout a due colonne come le altre pagine rifatte: elenco a sinistra,
 * scheda a destra (sotto la riga su telefono).
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, ChevronLeft, ChevronRight, Search, X, ArrowRight } from "lucide-react";
import Sagoma from "../components/Sagoma";
import AggiungiScuderia from "../components/AggiungiScuderia";
import GradeBadge from "../components/GradeBadge";
import LegendaEsiti from "../components/LegendaEsiti";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import { ESITO_COLORE } from "@/lib/esiti";
import { testoProb } from "@/lib/probCopre";
import BandieraCavallo from "@/components/BandieraCavallo";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num } from "../components/DueColonne";

const COLORE = "hsl(145 55% 52%)";
const euro = (n: number | null | undefined) => n == null ? "—" : (n < 0 ? "−" : "") + "€ " + Math.abs(Math.round(n)).toLocaleString("it-IT");
const titolo = (s: string) => s.split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
const ETICHETTA: Record<string, string> = { profitto: "In utile", pareggio: "In pari", perdita: "In perdita" };
const SCORRE = { flexWrap: "nowrap" as const, overflowX: "auto" as const, maxWidth: "100%", whiteSpace: "nowrap" as const };
const stileSelect: React.CSSProperties = {
  background: "var(--ed-fondo)", border: "1px solid var(--ed-bordo)", borderRadius: 9, padding: "8px 10px",
  color: "var(--ed-testo)", fontSize: 12.5, outline: "none", cursor: "pointer", fontFamily: "inherit",
};
const coloreProb = (p: number | null) => p == null ? "var(--ed-muto)" : p >= 50 ? ESITO_COLORE.profitto : p >= 25 ? ESITO_COLORE.pareggio : ESITO_COLORE.perdita;

function useRitardo<T>(v: T, ms = 300) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

function Pastiglia({ esito }: { esito: string }) {
  const c = ESITO_COLORE[esito];
  return <span style={{ fontSize: 11, fontWeight: 700, color: c, border: `1px solid ${c.replace(/\)$/, " / 0.4)")}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>{ETICHETTA[esito]}</span>;
}

function Striscia({ u, p, l }: { u: number; p: number; l: number }) {
  const t = u + p + l || 1;
  return (
    <span style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "hsl(220 10% 16%)" }} title={`${u} in utile, ${p} in pari, ${l} in perdita`}>
      <span style={{ width: `${(100 * u) / t}%`, background: ESITO_COLORE.profitto }} />
      <span style={{ width: `${(100 * p) / t}%`, background: ESITO_COLORE.pareggio }} />
      <span style={{ width: `${(100 * l) / t}%`, background: ESITO_COLORE.perdita }} />
    </span>
  );
}

function BottoneScheda({ href, testo }: { href: string; testo: string }) {
  return (
    <Link href={href}>
      <a style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
        borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
        {testo} <ArrowRight size={14} />
      </a>
    </Link>
  );
}

function SchedaCavallo({ r, costo, onClose }: { r: any; costo: number; onClose?: () => void }) {
  const c = ESITO_COLORE[r.esito];
  return (
    <div className="ed-dettaglio" data-testid="scheda-tenere">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">{r.sesso === "F" ? "Femmina" : r.sesso === "C" ? "Castrone" : "Maschio"}{r.eta ? ` · ${r.eta} anni` : ""}{r.corse ? ` · ${r.corse} corse nell'ultimo anno` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <BandieraCavallo nome={r.nome} />
            <span style={{ fontSize: 20, fontWeight: 800, color: COLORE, overflowWrap: "anywhere" }}>{r.nome}</span>
            {r.voto && <GradeBadge grade={r.voto} size="md" />}
            <AggiungiScuderia icona voce={{ tipo: "cavallo", nome: r.nome, anno: r.anno ?? null }} />
          </div>
          {r.padre && (
            <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
              figlio di <Link href={`/stallion/${encodeURIComponent(r.padre)}`} className="collegamento-scheda">{titolo(r.padre)}</Link>
            </div>
          )}
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid ${c.replace(/\)$/, " / 0.4)")}`, background: c.replace(/\)$/, " / 0.08)") }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{ETICHETTA[r.esito]} atteso</div>
        <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3, lineHeight: 1.5 }}>
          Con una spesa di {euro(costo)} all'anno, la probabilità di coprirla è {testoProb(r.prob, r.estremo)}.
        </div>
        <div style={{ marginTop: 8 }}><Barretta valore={r.prob} max={100} colore={coloreProb(r.prob)} /></div>
      </div>

      <div className="ed-cifre" style={{ marginTop: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Premi attesi" valore={euro(r.attesi)} colore="hsl(45 80% 62%)" sotto="nei prossimi 12 mesi" />
        <Cifra titolo="Saldo atteso" valore={euro(r.saldo)} colore={c} sotto="premi attesi meno la spesa" />
        <Cifra titolo="Ultimi 12 mesi" valore={euro(r.ultimo)} sotto="premi già vinti" />
        <Cifra titolo="Coprire la spesa" valore={testoProb(r.prob, r.estremo)} colore={coloreProb(r.prob)} />
      </div>

      <div style={{ fontSize: 12, color: "var(--ed-fioco)", marginTop: 12, lineHeight: 1.5 }}>
        Nella scheda completa ci sono i motivi della stima e la curva dei costi.
      </div>
      <BottoneScheda href={`/horse/${encodeURIComponent(r.nome)}/${r.anno || 0}`} testo="Scheda completa" />
    </div>
  );
}

function ElencoCavalli({ mensile, costo }: { mensile: string; costo: number }) {
  const desktop = useDesktop();
  const [esito, setEsito] = useState("");
  const [etaMin, setEtaMin] = useState("");
  const [etaMax, setEtaMax] = useState("");
  const [sesso, setSesso] = useState("");
  const [cercaScritto, setCercaScritto] = useState("");
  const [ordina, setOrdina] = useState("prob");
  const [pagina, setPagina] = useState(1);
  const [aperto, setAperto] = useState<string | null>(null);
  const cerca = useRitardo(cercaScritto);
  useEffect(() => { setPagina(1); setAperto(null); }, [esito, etaMin, etaMax, sesso, cerca, ordina, mensile]);
  const qs = new URLSearchParams({ mensile, esito, eta_min: etaMin, eta_max: etaMax, sesso, cerca, ordina, pagina: String(pagina) }).toString();
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/tenere", qs],
    queryFn: async () => (await apiRequest("GET", `/api/tenere?${qs}`)).json(),
    placeholderData: (p: any) => p,
  });
  if (!d) return <Sagoma cornice righe={8} />;
  if (!d.totale && !cerca && !esito && !etaMin && !etaMax && !sesso) return (
    <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Le stime arrivano con l'aggiornamento automatico della notte.</div>
  );
  const righe: any[] = d.righe ?? [];
  const scelto = aperto ?? (desktop && righe.length ? righe[0].nome : null);
  const sceltoR = righe.find(r => r.nome === scelto) ?? null;
  const ORDINI: [string, string][] = [["prob", "Più probabili"], ["peggiori", "Meno probabili"], ["attesi", "Premi attesi"], ["saldo", "Saldo"], ["eta", "Più giovani"], ["nome", "Nome"]];

  return (
    <div>
      <div className="ed-cifre" style={{ marginBottom: 14 }}>
        {(["profitto", "pareggio", "perdita"] as const).map(k => (
          <button key={k} onClick={() => setEsito(esito === k ? "" : k)} aria-pressed={esito === k} data-testid={`conto-${k}`}
            className="ed-cifra" style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
              borderColor: esito === k ? ESITO_COLORE[k] : undefined, background: esito === k ? ESITO_COLORE[k].replace(/\)$/, " / 0.1)") : undefined }}>
            <div className="ed-etich">{k === "profitto" ? "In utile atteso" : k === "pareggio" ? "In pari atteso" : "In perdita attesa"}</div>
            <div className="v" style={{ color: ESITO_COLORE[k] }}>{num(d.conti[k] ?? 0)}</div>
            <div className="s">{d.totale ? Math.round((100 * (d.conti[k] ?? 0)) / d.totale) : 0}% dei cavalli · {esito === k ? "tocca per togliere il filtro" : "tocca per filtrare"}</div>
          </button>
        ))}
        <Cifra titolo="Probabilità media" valore={d.prob_media != null ? `${Math.round(d.prob_media)}%` : "—"} colore={coloreProb(d.prob_media)}
          sotto={`di coprire ${euro(d.costo_anno)} · ${num(d.totale)} cavalli`} />
      </div>

      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={cercaScritto} onChange={e => setCercaScritto(e.target.value)} placeholder="Cerca un cavallo" aria-label="Cerca un cavallo" data-testid="input-cerca-tenere" />
          {cercaScritto && <button onClick={() => setCercaScritto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <select value={etaMin} onChange={e => setEtaMin(e.target.value)} style={stileSelect} aria-label="Età minima">
          <option value="">età da</option>{[2, 3, 4, 5, 6, 7, 8, 10].map(n => <option key={n} value={n}>{n} anni</option>)}
        </select>
        <select value={etaMax} onChange={e => setEtaMax(e.target.value)} style={stileSelect} aria-label="Età massima">
          <option value="">età fino a</option>{[2, 3, 4, 5, 6, 7, 8, 10, 12].map(n => <option key={n} value={n}>{n} anni</option>)}
        </select>
        <select value={sesso} onChange={e => setSesso(e.target.value)} style={stileSelect} aria-label="Sesso">
          <option value="">maschi e femmine</option><option value="M">maschi</option><option value="F">femmine</option><option value="C">castroni</option>
        </select>
      </div>
      <div className="ed-barra" style={{ marginTop: -4 }}>
        <div className="ed-segm" role="group" aria-label="Ordina per" style={SCORRE}>
          {ORDINI.map(([k, t]) => <button key={k} aria-pressed={ordina === k} onClick={() => setOrdina(k)}>{t}</button>)}
        </div>
      </div>

      {!righe.length ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun cavallo con questi filtri.</div>
      ) : (
        <div className="ed-griglia" style={{ opacity: isFetching ? 0.7 : 1, transition: "opacity .2s" }}>
          <div>
            <div className="ed-lista">
              {righe.map((r, i) => {
                const att = scelto === r.nome;
                return (
                  <div key={r.nome} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : r.nome)} data-testid={`row-tenere-${i}`}>
                      <span className="ed-pos">{(pagina - 1) * 50 + i + 1}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <BandieraCavallo nome={r.nome} />
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.nome}</span>
                          {r.voto && <GradeBadge grade={r.voto} size="sm" />}
                        </span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={r.prob} max={100} colore={coloreProb(r.prob)} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {r.eta ? `${r.eta} anni` : "età n.d."}{r.padre ? ` · da ${titolo(r.padre)}` : ""} · attesi {euro(r.attesi)}
                        </span>
                      </span>
                      <span style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span className="tabular" style={{ fontSize: 17, fontWeight: 800, color: coloreProb(r.prob) }}>{testoProb(r.prob, r.estremo).replace("meno del ", "<").replace("oltre il ", ">")}</span>
                        <Pastiglia esito={r.esito} />
                      </span>
                    </button>
                    {!desktop && att && <div style={{ marginTop: 6 }}><SchedaCavallo r={r} costo={d.costo_anno} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            {d.pagine > 1 && (
              <div className="ed-pagine">
                <button disabled={pagina <= 1} onClick={() => { setPagina(pagina - 1); setAperto(null); }} aria-label="Pagina precedente"><ChevronLeft size={15} /></button>
                <span>Pagina {pagina} di {num(d.pagine)} · {num(d.filtrati)} cavalli</span>
                <button disabled={pagina >= d.pagine} onClick={() => { setPagina(pagina + 1); setAperto(null); }} aria-label="Pagina successiva"><ChevronRight size={15} /></button>
              </div>
            )}
          </div>
          {desktop && (sceltoR ? <SchedaCavallo key={sceltoR.nome} r={sceltoR} costo={d.costo_anno ?? costo} /> : <div className="ed-dettaglio ed-vuoto">Scegli un cavallo dall'elenco.</div>)}
        </div>
      )}
    </div>
  );
}

function SchedaStallone({ s, costo, onClose }: { s: any; costo: number; onClose?: () => void }) {
  const t = s.figli || 1;
  return (
    <div className="ed-dettaglio" data-testid="scheda-tenere-stallone">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Stallone · {s.figli} figli in attività</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORE, overflowWrap: "anywhere", marginTop: 3 }}>{s.padre}</div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>
      <div className="ed-cifre" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Probabilità media" valore={`${Math.round(s.prob_media)}%`} colore={coloreProb(s.prob_media)} sotto={`che un figlio copra ${euro(costo)}`} />
        <Cifra titolo="Saldo medio" valore={euro(s.saldo_medio)} colore={s.saldo_medio >= 0 ? ESITO_COLORE.profitto : ESITO_COLORE.perdita} sotto="per figlio, nei prossimi 12 mesi" />
        <Cifra titolo="Premi attesi" valore={euro(s.attesi_mediani)} colore="hsl(45 80% 62%)" sotto="il figlio a metà classifica" />
        <Cifra titolo="Figli in utile" valore={`${s.in_utile} su ${s.figli}`} colore={ESITO_COLORE.profitto} sotto={`${Math.round((100 * s.in_utile) / t)}% dei figli in attività`} />
      </div>
      <div className="ed-etich" style={{ margin: "14px 0 6px" }}>Utile, pari e perdita fra i figli</div>
      <Striscia u={s.in_utile} p={s.in_pari} l={s.in_perdita} />
      <div style={{ display: "flex", gap: 12, fontSize: 11.5, marginTop: 5, color: "var(--ed-muto)" }}>
        <span><b style={{ color: ESITO_COLORE.profitto }}>{s.in_utile}</b> in utile</span>
        <span><b style={{ color: ESITO_COLORE.pareggio }}>{s.in_pari}</b> in pari</span>
        <span><b style={{ color: ESITO_COLORE.perdita }}>{s.in_perdita}</b> in perdita</span>
      </div>
      {s.migliore && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 6px" }}>Il figlio con i premi attesi più alti</div>
          <Link href={`/horse/${encodeURIComponent(s.migliore.nome)}/${s.migliore.anno || 0}`}>
            <a style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "var(--ed-fondo2)", textDecoration: "none", fontSize: 12.5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <BandieraCavallo nome={s.migliore.nome} />
                <b style={{ color: "var(--ed-testo)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.migliore.nome}</b>
                {s.migliore.voto && <GradeBadge grade={s.migliore.voto} size="sm" />}
              </span>
              <span className="tabular" style={{ color: "hsl(45 80% 62%)", fontWeight: 700, whiteSpace: "nowrap" }}>{euro(s.migliore.attesi)}</span>
            </a>
          </Link>
        </>
      )}
      <BottoneScheda href={`/stallion/${encodeURIComponent(s.padre)}`} testo="Scheda dello stallone" />
    </div>
  );
}

function PerStallone({ mensile, costo }: { mensile: string; costo: number }) {
  const desktop = useDesktop();
  const [minimo, setMinimo] = useState("10");
  const [ordina, setOrdina] = useState<"prob" | "figli" | "saldo">("prob");
  const [aperto, setAperto] = useState<string | null>(null);
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/tenere/stalloni", mensile, minimo],
    queryFn: async () => (await apiRequest("GET", `/api/tenere/stalloni?mensile=${mensile}&minimo=${minimo}`)).json(),
    placeholderData: (p: any) => p,
  });
  useEffect(() => setAperto(null), [minimo, ordina, mensile]);
  if (!d) return <Sagoma cornice righe={8} />;
  const righe: any[] = [...d.stalloni].sort((a: any, b: any) => ordina === "figli" ? b.figli - a.figli : ordina === "saldo" ? b.saldo_medio - a.saldo_medio : b.prob_media - a.prob_media);
  const scelto = aperto ?? (desktop && righe.length ? righe[0].padre : null);
  const sceltoS = righe.find(s => s.padre === scelto) ?? null;
  return (
    <div>
      <div className="ed-barra">
        <div className="ed-segm" role="group" aria-label="Figli in attività">
          {["5", "10", "20", "40"].map(n => <button key={n} aria-pressed={minimo === n} onClick={() => setMinimo(n)}>{n}+ figli</button>)}
        </div>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {([["prob", "Probabilità"], ["figli", "Figli"], ["saldo", "Saldo"]] as const).map(([k, t]) => <button key={k} aria-pressed={ordina === k} onClick={() => setOrdina(k)}>{t}</button>)}
        </div>
        <span style={{ fontSize: 12, color: "var(--ed-muto)", marginLeft: "auto" }}>{righe.length} stalloni</span>
      </div>
      {!righe.length ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuno stallone con così tanti figli in attività.</div> : (
        <div className="ed-griglia" style={{ opacity: isFetching ? 0.7 : 1 }}>
          <div className="ed-lista">
            {righe.map((s, i) => {
              const att = scelto === s.padre;
              return (
                <div key={s.padre} style={{ minWidth: 0 }}>
                  <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : s.padre)} data-testid={`row-tenere-stallone-${i}`}>
                    <span className="ed-pos" data-podio={ordina === "prob" && i < 3}>{i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ed-nome">{s.padre}</span>
                      <span style={{ display: "block", margin: "6px 0 4px" }}><Striscia u={s.in_utile} p={s.in_pari} l={s.in_perdita} /></span>
                      <span className="ed-sotto" style={{ display: "block" }}>{s.figli} figli in attività · {s.in_utile} in utile · saldo medio {euro(s.saldo_medio)}</span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: coloreProb(s.prob_media) }}>{Math.round(s.prob_media)}%</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>copre</span>
                    </span>
                  </button>
                  {!desktop && att && <div style={{ marginTop: 6 }}><SchedaStallone s={s} costo={d.costo_anno ?? costo} onClose={() => setAperto("")} /></div>}
                </div>
              );
            })}
          </div>
          {desktop && (sceltoS ? <SchedaStallone key={sceltoS.padre} s={sceltoS} costo={d.costo_anno ?? costo} /> : <div className="ed-dettaglio ed-vuoto">Scegli uno stallone dall'elenco.</div>)}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Spiegazione compatta>
          Conta solo i figli che hanno corso nell'ultimo anno: chi ha smesso o non ha mai corso non c'è, quindi il quadro è più favorevole di quello di
          tutta la produzione. Per il rendimento di un intero raccolto c'è la scheda Punto di pareggio.
        </Spiegazione>
      </div>
    </div>
  );
}

export default function TenerePage() {
  const [scheda, setScheda] = useState<"cavalli" | "stalloni">("cavalli");
  const [mensileScritto, setMensileScritto] = useState("1200");
  const mensile = useRitardo(Number(mensileScritto) >= 100 ? String(Math.round(Number(mensileScritto))) : "1200", 400);
  const costo = 12 * (Number(mensile) || 1200);
  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={TrendingUp} colore={COLORE} titolo="Tenere o fermare" margineSotto={16}
        sottotitolo="Ogni cavallo in attività: premi attesi nei prossimi 12 mesi contro la spesa di un anno.">
        Per ogni cavallo che ha corso nell'ultimo anno: quanto vincerà probabilmente nei prossimi 12 mesi e quanto è probabile che copra la spesa
        di un anno. Le spese passate non contano più: si confronta solo quello che costa da oggi con quello che può rendere da oggi.
        Rifatto sul passato (al 1° ottobre 2025), dei cavalli che il sito avrebbe dato «in perdita» solo 5 su 100 hanno poi coperto la spesa:
        i dettagli sono in <Link href="/controllo" style={{ color: COLORE }}>Controllo a posteriori</Link>.
      </IntestazionePagina>

      <div className="ed-pannello" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ed-testo)", flexWrap: "wrap" }}>
          Spesa al mese per allenamento e mantenimento
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>€
            <input type="number" min={100} step={100} inputMode="numeric" value={mensileScritto} onChange={e => setMensileScritto(e.target.value)} data-testid="input-mensile"
              style={{ width: 92, background: "var(--ed-fondo)", border: "1px solid var(--ed-bordo)", borderRadius: 8, color: "var(--ed-testo)", padding: "6px 9px", fontSize: 13, fontFamily: "inherit" }} />
          </span>
        </label>
        <input type="range" min={400} max={3000} step={100} value={Number(mensileScritto) || 1200} onChange={e => setMensileScritto(e.target.value)}
          style={{ flex: "1 1 180px", maxWidth: 320, accentColor: COLORE }} aria-label="Spesa al mese" />
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>in un anno: <b style={{ color: "var(--ed-testo)" }}>{euro(costo)}</b></span>
      </div>

      <div className="ed-linguette" role="tablist">
        <button className="ed-linguetta" role="tab" aria-selected={scheda === "cavalli"} onClick={() => setScheda("cavalli")} data-testid="tab-cavalli">
          <span><b>Cavalli</b><small>ogni cavallo in attività</small></span>
        </button>
        <button className="ed-linguetta" role="tab" aria-selected={scheda === "stalloni"} onClick={() => setScheda("stalloni")} data-testid="tab-stalloni">
          <span><b>Per stallone</b><small>i figli in attività di ogni padre</small></span>
        </button>
      </div>

      {scheda === "cavalli" ? <ElencoCavalli mensile={mensile} costo={costo} /> : <PerStallone mensile={mensile} costo={costo} />}

      <LegendaEsiti style={{ marginTop: 14 }} />
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>
          I premi attesi vengono da un modello XGBoost che ha imparato da fotografie trimestrali dei cavalli fra il 2016 e il 2023 ed è stato
          provato sul 2025: sbaglia in media di circa 4.200 €, contro 5.200 € di «vincerà quanto l'anno scorso». La probabilità di coprire la spesa
          si legge da come sono andati davvero, nel 2025-26, i cavalli con una stima simile. L'esito è «pari» quando il saldo atteso sta entro il 10%
          della spesa di un anno.
        </p>
        <p>
          Non conta rivendita, valore da riproduttore, infortuni futuri né spese straordinarie. Ogni cavallo ha la sua scheda con i motivi
          della stima e la curva dei costi.
        </p>
      </Spiegazione>
    </div>
  );
}
