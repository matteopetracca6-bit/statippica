/**
 * TENERE O FERMARE.
 *
 * Tutti i cavalli che hanno corso nell'ultimo anno, ciascuno con i premi
 * attesi nei prossimi 12 mesi (modello XGBoost, stima_premi.py), la
 * probabilita' di coprire la spesa di un anno e l'esito atteso al costo
 * scelto. E' lo strumento chiesto dal relatore visto su tutti i cavalli
 * insieme. La scheda "Per stallone" raggruppa gli stessi cavalli per padre:
 * e' un dato misurato sui figli che corrono, non una previsione dai genitori.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Scale, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Sagoma from "../components/Sagoma";
import GradeBadge from "../components/GradeBadge";
import LegendaEsiti from "../components/LegendaEsiti";
import { Spiegazione } from "../components/Spiegazione";
import { ESITO_COLORE } from "@/lib/esiti";
import { testoProb } from "@/lib/probCopre";

const MUTED = "hsl(210 8% 55%)";
const CARD: React.CSSProperties = { background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 18%)", borderRadius: 12, padding: "16px 18px" };
const euro = (n: number) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
const titolo = (s: string) => s.split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
const ETICHETTA: Record<string, string> = { profitto: "Profitto", pareggio: "Pareggio", perdita: "Perdita" };

function useRitardo<T>(v: T, ms = 300) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

function Pastiglia({ esito }: { esito: string }) {
  const c = ESITO_COLORE[esito];
  return <span style={{ fontSize: 11, fontWeight: 700, color: c, border: `1px solid ${c.replace(/\)$/, " / 0.4)")}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>{ETICHETTA[esito]}</span>;
}

function BarraProb({ p, estremo }: { p: number | null; estremo?: string | null }) {
  const c = p == null ? MUTED : p >= 50 ? ESITO_COLORE.profitto : p >= 25 ? ESITO_COLORE.pareggio : ESITO_COLORE.perdita;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span className="barretta-tabella"><span style={{ width: `${p ?? 0}%`, background: c }} /></span>
      <span className="tabular" style={{ color: c, fontWeight: 700, minWidth: 34 }}>{testoProb(p, estremo).replace("meno del ", "<").replace("oltre il ", ">")}</span>
    </span>
  );
}

function ElencoCavalli({ mensile }: { mensile: string }) {
  const [esito, setEsito] = useState("");
  const [etaMin, setEtaMin] = useState("");
  const [etaMax, setEtaMax] = useState("");
  const [sesso, setSesso] = useState("");
  const [cercaScritto, setCercaScritto] = useState("");
  const [ordina, setOrdina] = useState("prob");
  const [pagina, setPagina] = useState(1);
  const cerca = useRitardo(cercaScritto);
  useEffect(() => setPagina(1), [esito, etaMin, etaMax, sesso, cerca, ordina, mensile]);
  const qs = new URLSearchParams({ mensile, esito, eta_min: etaMin, eta_max: etaMax, sesso, cerca, ordina, pagina: String(pagina) }).toString();
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/tenere", qs],
    queryFn: async () => (await apiRequest("GET", `/api/tenere?${qs}`)).json(),
    placeholderData: (p: any) => p,
  });
  if (!d) return <Sagoma cornice righe={8} />;
  if (!d.totale && !cerca && !esito && !etaMin && !etaMax && !sesso) return (
    <div style={{ ...CARD, color: MUTED, fontSize: 13 }}>Le stime arrivano con l'aggiornamento automatico della notte.</div>
  );
  const sel: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, color: "hsl(210 10% 90%)", padding: "6px 9px", fontSize: 12.5, fontFamily: "inherit" };
  return (
    <div>
      <div className="tenere-sintesi">
        {(["profitto", "pareggio", "perdita"] as const).map(k => (
          <button key={k} onClick={() => setEsito(esito === k ? "" : k)} className={`tenere-conto${esito === k ? " attivo" : ""}`} style={{ ["--c" as any]: ESITO_COLORE[k] }}>
            <span className="tabular valore">{(d.conti[k] ?? 0).toLocaleString("it-IT")}</span>
            <span className="etichetta">{k === "profitto" ? "in utile atteso" : k === "pareggio" ? "in pari atteso" : "in perdita attesa"}</span>
            <span className="quota tabular">{d.totale ? Math.round((100 * (d.conti[k] ?? 0)) / d.totale) : 0}%</span>
          </button>
        ))}
        <div className="tenere-conto" style={{ ["--c" as any]: "hsl(183 70% 55%)", cursor: "default" }}>
          <span className="tabular valore">{d.prob_media != null ? `${Math.round(d.prob_media)}%` : "—"}</span>
          <span className="etichetta">probabilità media di coprire {euro(d.costo_anno)}</span>
          <span className="quota tabular">{d.totale.toLocaleString("it-IT")} cavalli</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "14px 0 10px" }}>
        <label style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, color: MUTED }} />
          <input value={cercaScritto} onChange={e => setCercaScritto(e.target.value)} placeholder="Cerca un cavallo" style={{ ...sel, width: "100%", paddingLeft: 28 }} />
        </label>
        <select value={etaMin} onChange={e => setEtaMin(e.target.value)} style={sel} aria-label="Età minima">
          <option value="">età da</option>{[2, 3, 4, 5, 6, 7, 8, 10].map(n => <option key={n} value={n}>{n} anni</option>)}
        </select>
        <select value={etaMax} onChange={e => setEtaMax(e.target.value)} style={sel} aria-label="Età massima">
          <option value="">età fino a</option>{[2, 3, 4, 5, 6, 7, 8, 10, 12].map(n => <option key={n} value={n}>{n} anni</option>)}
        </select>
        <select value={sesso} onChange={e => setSesso(e.target.value)} style={sel} aria-label="Sesso">
          <option value="">maschi e femmine</option><option value="M">maschi</option><option value="F">femmine</option><option value="C">castroni</option>
        </select>
        <select value={ordina} onChange={e => setOrdina(e.target.value)} style={sel} aria-label="Ordina">
          <option value="prob">più probabili a coprire</option><option value="peggiori">meno probabili</option>
          <option value="attesi">premi attesi</option><option value="saldo">saldo atteso</option><option value="eta">più giovani</option><option value="nome">nome</option>
        </select>
      </div>

      <div style={{ ...CARD, padding: 0, overflowX: "auto", opacity: isFetching ? 0.65 : 1, transition: "opacity .2s" }}>
        <table className="tabella-tenere">
          <thead><tr>
            <th>Cavallo</th><th className="num">Età</th><th className="nascondi-mobile">Padre</th>
            <th className="num nascondi-mobile">Ultimi 12 mesi</th><th className="num">Premi attesi</th>
            <th>Coprire la spesa</th><th className="num nascondi-mobile">Saldo atteso</th><th>Esito</th>
          </tr></thead>
          <tbody>
            {d.righe.map((r: any) => (
              <tr key={r.nome}>
                <td>
                  <Link href={`/horse/${encodeURIComponent(r.nome)}/${r.anno || 0}`}><a className="nome">{r.nome}</a></Link>
                  {r.voto && <span style={{ marginLeft: 6 }}><GradeBadge grade={r.voto} size="sm" /></span>}
                </td>
                <td className="num tabular">{r.eta ?? "—"}</td>
                <td className="nascondi-mobile">{r.padre ? <Link href={`/stallion/${encodeURIComponent(r.padre)}`}><a className="padre">{titolo(r.padre)}</a></Link> : "—"}</td>
                <td className="num tabular nascondi-mobile" style={{ color: MUTED }}>{euro(r.ultimo)}</td>
                <td className="num tabular" style={{ fontWeight: 700 }}>{euro(r.attesi)}</td>
                <td><BarraProb p={r.prob} estremo={r.estremo} /></td>
                <td className="num tabular nascondi-mobile" style={{ color: ESITO_COLORE[r.esito] }}>{euro(r.saldo)}</td>
                <td><Pastiglia esito={r.esito} /></td>
              </tr>
            ))}
            {!d.righe.length && <tr><td colSpan={8} style={{ color: MUTED, padding: 18 }}>Nessun cavallo con questi filtri.</td></tr>}
          </tbody>
        </table>
      </div>
      {d.pagine > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginTop: 12, fontSize: 12.5, color: MUTED }}>
          <button className="chip-filtro" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Pagina precedente"><ChevronLeft size={14} /></button>
          pagina {pagina} di {d.pagine} · {d.filtrati.toLocaleString("it-IT")} cavalli
          <button className="chip-filtro" disabled={pagina >= d.pagine} onClick={() => setPagina(pagina + 1)} aria-label="Pagina successiva"><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

function PerStallone({ mensile }: { mensile: string }) {
  const [minimo, setMinimo] = useState("10");
  const [ordina, setOrdina] = useState<"prob" | "figli" | "saldo">("prob");
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/tenere/stalloni", mensile, minimo],
    queryFn: async () => (await apiRequest("GET", `/api/tenere/stalloni?mensile=${mensile}&minimo=${minimo}`)).json(),
    placeholderData: (p: any) => p,
  });
  if (!d) return <Sagoma cornice righe={8} />;
  const righe = [...d.stalloni].sort((a: any, b: any) => ordina === "figli" ? b.figli - a.figli : ordina === "saldo" ? b.saldo_medio - a.saldo_medio : b.prob_media - a.prob_media);
  const sel: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, color: "hsl(210 10% 90%)", padding: "6px 9px", fontSize: 12.5, fontFamily: "inherit" };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 12.5, color: MUTED }}>
        Almeno
        <select value={minimo} onChange={e => setMinimo(e.target.value)} style={sel}>{[5, 10, 20, 40].map(n => <option key={n} value={n}>{n}</option>)}</select>
        figli in attività ·
        <select value={ordina} onChange={e => setOrdina(e.target.value as any)} style={sel}>
          <option value="prob">probabilità media</option><option value="figli">numero di figli</option><option value="saldo">saldo medio</option>
        </select>
        <span style={{ marginLeft: "auto" }}>{righe.length} stalloni</span>
      </div>
      <div style={{ ...CARD, padding: 0, overflowX: "auto", opacity: isFetching ? 0.65 : 1 }}>
        <table className="tabella-tenere">
          <thead><tr>
            <th>Stallone</th><th className="num">Figli in attività</th><th>Probabilità media di coprire</th>
            <th className="nascondi-mobile">Utile · pari · perdita</th><th className="num nascondi-mobile">Premi attesi (mediana)</th>
            <th className="num">Saldo medio</th><th className="nascondi-mobile">Figlio migliore</th>
          </tr></thead>
          <tbody>
            {righe.map((s: any) => {
              const t = s.figli;
              return (
                <tr key={s.padre}>
                  <td><Link href={`/stallion/${encodeURIComponent(s.padre)}`}><a className="nome">{s.padre}</a></Link></td>
                  <td className="num tabular">{t}</td>
                  <td><BarraProb p={s.prob_media} /></td>
                  <td className="nascondi-mobile">
                    <span className="striscia-esiti" title={`${s.in_utile} in utile, ${s.in_pari} in pari, ${s.in_perdita} in perdita`}>
                      <span style={{ width: `${(100 * s.in_utile) / t}%`, background: ESITO_COLORE.profitto }} />
                      <span style={{ width: `${(100 * s.in_pari) / t}%`, background: ESITO_COLORE.pareggio }} />
                      <span style={{ width: `${(100 * s.in_perdita) / t}%`, background: ESITO_COLORE.perdita }} />
                    </span>
                    <span className="tabular" style={{ fontSize: 11, color: MUTED, marginLeft: 6 }}>{s.in_utile} · {s.in_pari} · {s.in_perdita}</span>
                  </td>
                  <td className="num tabular nascondi-mobile">{euro(s.attesi_mediani)}</td>
                  <td className="num tabular" style={{ color: s.saldo_medio >= 0 ? ESITO_COLORE.profitto : ESITO_COLORE.perdita }}>{euro(s.saldo_medio)}</td>
                  <td className="nascondi-mobile">
                    <Link href={`/horse/${encodeURIComponent(s.migliore.nome)}/${s.migliore.anno || 0}`}><a className="padre">{titolo(s.migliore.nome)}</a></Link>
                    <span className="tabular" style={{ color: MUTED, fontSize: 11, marginLeft: 6 }}>{euro(s.migliore.attesi)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>
        Conta solo i figli che hanno corso nell'ultimo anno: chi ha smesso o non ha mai corso non c'è, quindi il quadro è più favorevole di quello di
        tutta la produzione. Per il rendimento di un intero raccolto c'è la scheda Punto di pareggio.
      </div>
    </div>
  );
}

export default function TenerePage() {
  const [scheda, setScheda] = useState<"cavalli" | "stalloni">("cavalli");
  const [mensileScritto, setMensileScritto] = useState("1200");
  const mensile = useRitardo(Number(mensileScritto) >= 100 ? String(Math.round(Number(mensileScritto))) : "1200", 400);
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 18px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Scale size={20} style={{ color: "hsl(160 60% 50%)" }} />
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "hsl(210 10% 90%)", margin: 0, letterSpacing: "0.02em" }}>Tenere o fermare</h1>
      </div>
      <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, maxWidth: 860, marginBottom: 16 }}>
        Per ogni cavallo che ha corso nell'ultimo anno: quanto vincerà probabilmente nei prossimi 12 mesi e quanto è probabile che copra la spesa
        di un anno. Le spese passate non contano più: si confronta solo quello che costa da oggi con quello che può rendere da oggi.
      </p>

      <div style={{ ...CARD, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "hsl(210 10% 85%)" }}>
          Costo al mese di allenamento e mantenimento €
          <input type="number" min={100} step={100} inputMode="numeric" value={mensileScritto} onChange={e => setMensileScritto(e.target.value)}
            style={{ width: 100, background: "hsl(220 12% 7%)", border: "1px solid hsl(220 10% 24%)", borderRadius: 8, color: "hsl(210 10% 92%)", padding: "6px 9px", fontSize: 13 }} />
        </label>
        <input type="range" min={400} max={3000} step={100} value={Number(mensileScritto) || 1200} onChange={e => setMensileScritto(e.target.value)}
          style={{ flex: "1 1 180px", maxWidth: 320, accentColor: "hsl(160 60% 48%)" }} aria-label="Costo al mese" />
        <span style={{ fontSize: 12.5, color: MUTED }}>un anno: <b style={{ color: "hsl(210 10% 90%)" }}>{euro(12 * (Number(mensile) || 1200))}</b></span>
      </div>

      <div className="schede-calendario" style={{ margin: "0 0 14px" }}>
        <button className={`chip-filtro${scheda === "cavalli" ? " attivo" : ""}`} onClick={() => setScheda("cavalli")}>Cavalli</button>
        <button className={`chip-filtro${scheda === "stalloni" ? " attivo" : ""}`} onClick={() => setScheda("stalloni")}>Per stallone</button>
      </div>

      {scheda === "cavalli" ? <ElencoCavalli mensile={mensile} /> : <PerStallone mensile={mensile} />}

      <LegendaEsiti style={{ marginTop: 12 }} />
      <Spiegazione titolo="Da dove vengono questi numeri">
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
