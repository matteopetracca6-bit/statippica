/**
 * PREVISIONI SULLA SCHEDA DEL CAVALLO (modelli XGBoost).
 *
 * 1. Prossima corsa: probabilita' di arrivare nei primi tre, con i motivi, e
 *    le stime delle corse passate messe accanto all'arrivo vero.
 * 2. Prossimi 12 mesi: premi attesi, come sono andati i cavalli con una stima
 *    simile, e la probabilita' di coprire il costo di un anno (modificabile).
 *
 * Compare solo per i cavalli che hanno corso nell'ultimo anno: per i puledri
 * mai scesi in pista servirebbe una previsione dai genitori, che il sito non
 * presenta come affidabile.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, Flag, ChevronDown, Check, X } from "lucide-react";
import { ESITO_COLORE } from "@/lib/esiti";
import { probDaPercentili, esitoSaldo } from "@/lib/probCopre";
import GraficoColonne from "./GraficoColonne";

const COSTI_CURVA = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400];
const migliaia = (n: number) => Math.round(n).toLocaleString("it-IT");

/** A che costo mensile conviene ancora: probabilita' di coprire la spesa per
 *  ogni costo, colorata con l'esito atteso a quel costo. */
function CurvaCosti({ attesi, percentili, mensile }: { attesi: number; percentili: number[]; mensile: number }) {
  const dati = COSTI_CURVA.map(c => {
    const pr = probDaPercentili(percentili, 12 * c);
    const saldo = attesi - 12 * c;
    const es = esitoSaldo(saldo, 12 * c);
    return {
      chiave: c, etichetta: migliaia(c), valore: Math.round(pr.p * 100),
      testo: pr.estremo === "sotto" ? "<5%" : pr.estremo === "sopra" ? ">95%" : `${Math.round(pr.p * 100)}%`,
      colore: ESITO_COLORE[es],
      scheda: [
        { testo: `${euro(c)} al mese` },
        { testo: `Coprire ${euro(12 * c)}: ${Math.round(pr.p * 100)}%` },
        { testo: `Saldo atteso ${euro(saldo)}`, colore: ESITO_COLORE[es] },
      ],
    };
  });
  // Pareggio "in media": il costo a cui i premi attesi coprono la spesa.
  const pareggioMedio = attesi / 12;
  // Costo oltre il quale coprire la spesa diventa meno probabile che no.
  const mezzo = percentili[9] / 12;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>A che costo conviene: probabilità di coprire la spesa, per costo al mese</div>
      <GraficoColonne dati={dati} altezza={150} massimo={100} formatoGuida={v => `${Math.round(v)}%`} nomeAsse="Costo al mese (€)" />
      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 6 }}>
        In media va in pari fino a <b style={{ color: "hsl(210 10% 88%)" }}>{euro(pareggioMedio)}</b> al mese.
        {mezzo > 0 ? <> Sopra <b style={{ color: "hsl(210 10% 88%)" }}>{euro(mezzo)}</b> al mese è più facile che non copra la spesa.</> : <> È più facile che non copra la spesa a qualunque costo.</>}
      </div>
    </div>
  );
}

const MUTED = "hsl(210 8% 52%)";
const DIM = "hsl(210 8% 40%)";
const euro = (n: number) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
const titolo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const PISTE: Record<string, string> = {
  BO: "Bologna", MI: "Milano", RM: "Roma", TO: "Torino", NA: "Napoli", CE: "Cesena", SR: "Siracusa", TV: "Treviso",
  MT: "Montecatini", CS: "Casarano", PA: "Palermo", PC: "Pontecagnano", MO: "Modena", FI: "Firenze", PD: "Padova",
  VI: "Villanova", CT: "Castelluccio", GA: "Garigliano", TS: "Trieste",
};
const giorno = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

const pannello: React.CSSProperties = {
  background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "12px", padding: "18px 22px", marginBottom: "22px",
};
const riquadro: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 15%)", borderRadius: "10px", padding: "12px 14px" };

function Intestazione({ icona, testo, extra }: { icona: React.ReactNode; testo: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      {icona}
      <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{testo}</span>
      {extra}
    </div>
  );
}

function Motivi({ m }: { m: { testo: string; verso?: number; pro?: boolean }[] }) {
  if (!m?.length) return null;
  // Il pronostico scrive "pro" (sì/no), la stima dei premi "verso" (+1/0/−1).
  const voci = m.map(x => ({ testo: x.testo, verso: x.verso ?? (x.pro ? 1 : -1) }));
  return (
    <div className="motivi-pronostico" style={{ marginTop: 8 }}>
      {voci.map((x, i) => (
        <span key={i} className={`motivo ${x.verso > 0 ? "pro" : x.verso < 0 ? "contro" : ""}`}>{x.verso > 0 ? "+ " : x.verso < 0 ? "− " : ""}{x.testo}</span>
      ))}
    </div>
  );
}

const pct = (p: number | null, estremo?: string | null) =>
  p == null ? "—" : estremo === "sotto" ? "meno del 5%" : estremo === "sopra" ? "oltre il 95%" : `${Math.round(p)}%`;

export default function PrevisioniCavallo({ nome, anno }: { nome: string; anno: number }) {
  const [mensileScritto, setMensileScritto] = useState("");
  const [prova, setProva] = useState(false);
  const mensile = Number(mensileScritto) >= 100 ? String(Math.round(Number(mensileScritto))) : "";
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/horse/previsioni", nome, anno, mensile],
    queryFn: async () => (await apiRequest("GET", `/api/horse/${encodeURIComponent(nome)}/${anno}/previsioni?mensile=${mensile}`)).json(),
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });
  if (!d || (!d.prossima && !d.storico?.length && !d.premi)) return null;
  const p = d.premi;
  const v = d.verifica_premi;
  const esito = p ? (p.saldo_atteso >= 0.1 * p.costo_anno ? "profitto" : p.saldo_atteso >= -0.1 * p.costo_anno ? "pareggio" : "perdita") : null;

  return (
    <div id="sez-previsioni" style={pannello}>
      {/* ── Prossima corsa ── */}
      {(d.prossima || d.storico?.length > 0) && (
        <div style={{ marginBottom: p ? 22 : 0 }}>
          <Intestazione icona={<Flag size={15} style={{ color: "hsl(183 70% 55%)" }} />} testo="Primi tre: prossima corsa e stime passate" />
          {d.prossima ? (
            <div style={{ ...riquadro, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontSize: 12, color: MUTED }}>{giorno(d.prossima.data)} · {PISTE[d.prossima.pista] ?? d.prossima.pista} · {d.prossima.ora}</div>
                <div className="tabular" style={{ fontSize: 24, fontWeight: 800, color: "hsl(183 70% 60%)" }}>
                  {d.prossima.prob != null ? `${Math.round(d.prossima.prob)}%` : "—"}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED }}>
                  {d.prossima.prob != null ? `di arrivare nei primi tre, contro ${d.prossima.partenti - 1} avversari` : "corsa con tre partenti o meno: arrivano tutti nei primi tre"}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Motivi m={d.prossima.motivi} />
                {!d.prossima.affidabile && <div style={{ fontSize: 11, color: "hsl(40 70% 60%)", marginTop: 6 }}>Poche corse in archivio ({d.prossima.n_corse}): stima debole.</div>}
                <Link href="/calendario"><a style={{ display: "inline-block", fontSize: 11.5, color: "hsl(183 60% 55%)", marginTop: 6, textDecoration: "none" }}>Vedi la corsa nel calendario</a></Link>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: MUTED }}>Nessuna corsa in calendario per ora.</div>
          )}
          {d.storico?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: DIM, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Com'è andata nelle ultime corse</div>
              {d.storico.map((s: any, i: number) => (
                <div key={i} className="vc-riga" style={{ gridTemplateColumns: "1.3fr 1fr .8fr 20px" }}>
                  <span>{giorno(s.data)} · {titolo(s.pista)}{s.tipo === "ricostruito" && <small style={{ color: "hsl(40 60% 60%)" }}>ricostruita</small>}</span>
                  <span className="tabular"><span className="barretta"><span style={{ width: `${Math.min(100, s.prob)}%` }} /></span>{Math.round(s.prob)}%</span>
                  <span className="tabular" style={{ color: s.top3 ? "hsl(150 55% 60%)" : MUTED }}>{s.arrivo ?? "—"}</span>
                  <span>{s.top3 ? <Check size={14} color="hsl(150 55% 55%)" /> : <X size={14} color="hsl(10 60% 55%)" />}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Prossimi 12 mesi ── */}
      {p && (
        <div>
          <Intestazione icona={<TrendingUp size={15} style={{ color: "hsl(160 60% 50%)" }} />} testo="Premi attesi nei prossimi 12 mesi"
            extra={!p.verificato && <span style={{ fontSize: 10, color: "hsl(40 70% 60%)", border: "1px dashed hsl(40 50% 40%)", borderRadius: 5, padding: "0 6px" }}>sperimentale</span>} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 10, opacity: isFetching ? 0.6 : 1, transition: "opacity .2s" }}>
            <div style={riquadro}>
              <div style={{ fontSize: 12, color: MUTED }}>Stima del modello</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 800, color: "hsl(210 10% 92%)", margin: "4px 0 2px" }}>{euro(p.attesi)}</div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>Negli ultimi 12 mesi ne ha vinti {euro(p.ultimo_anno)} in {p.corse_ultimo_anno} corse.</div>
            </div>
            {p.simili && (
              <div style={riquadro}>
                <div style={{ fontSize: 12, color: MUTED }}>Cavalli con una stima simile</div>
                <div className="tabular" style={{ fontSize: 18, fontWeight: 800, color: "hsl(210 10% 88%)", margin: "6px 0 2px" }}>{euro(p.simili.basso)} – {euro(p.simili.alto)}</div>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                  Nel 2025-26 la metà di loro ha vinto fra queste cifre{p.simili.zero >= 0.05 ? `; il ${Math.round(p.simili.zero * 100)}% non ha vinto niente` : ""}.
                </div>
              </div>
            )}
            <div style={riquadro}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: MUTED }}>Coprire la spesa di un anno</span>
                {esito && <span style={{ fontSize: 11, fontWeight: 700, color: ESITO_COLORE[esito], border: `1px solid ${ESITO_COLORE[esito].replace(/\)$/, " / 0.4)")}`, borderRadius: 999, padding: "1px 8px" }}>
                  {esito === "profitto" ? "Profitto atteso" : esito === "pareggio" ? "Pareggio atteso" : "Perdita attesa"}</span>}
              </div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 800, color: esito ? ESITO_COLORE[esito] : "inherit", margin: "4px 0 2px" }}>{pct(p.prob_copre, p.prob_estremo)}</div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                di vincere almeno {euro(p.costo_anno)}. Saldo atteso: <b style={{ color: esito ? ESITO_COLORE[esito] : "inherit" }}>{euro(p.saldo_atteso)}</b>.
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED, marginTop: 8 }}>
                Costo al mese €
                <input type="number" min={100} step={100} inputMode="numeric" value={mensileScritto} placeholder={String(d.mensile)}
                  onChange={e => setMensileScritto(e.target.value)}
                  style={{ width: 90, background: "hsl(220 12% 6%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 7, color: "hsl(210 10% 92%)", padding: "4px 8px", fontSize: 12.5 }} />
              </label>
            </div>
          </div>
          <Motivi m={p.motivi} />
          {p.simili?.percentili && <CurvaCosti attesi={p.attesi} percentili={p.simili.percentili} mensile={Number(mensile) || d.mensile} />}

          {v && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setProva(!prova)} aria-expanded={prova}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "hsl(160 60% 55%)", fontSize: 12, padding: 0, fontFamily: "inherit" }}>
                Come è stata provata questa stima <ChevronDown size={14} style={{ transform: prova ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {prova && (
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 8 }}>
                  <p style={{ margin: "0 0 8px" }}>
                    Il modello ha imparato da fotografie trimestrali dal 2016 al 2023: per ogni cavallo, solo cosa era successo prima, confrontato con i premi
                    dei 12 mesi dopo. Poi è stato provato su {v.periodo.fotografie.toLocaleString("it-IT")} fotografie del 2025 ({v.periodo.cavalli.toLocaleString("it-IT")} cavalli), mai viste.
                  </p>
                  <div className="vc-riga intest" style={{ gridTemplateColumns: "1.6fr 1fr 1fr" }}><span>Metodo</span><span>Sbaglia in media di</span><span>Ordina i cavalli (0-1)</span></div>
                  {[["Questo modello", v.modello], ["Vincerà quanto l'anno scorso", v.anno_prima], ["Media della sua età", v.per_eta]].map(([n, m]: any) => (
                    <div key={n} className="vc-riga" style={{ gridTemplateColumns: "1.6fr 1fr 1fr" }}>
                      <span style={{ color: n === "Questo modello" ? "hsl(160 60% 60%)" : undefined }}>{n}</span>
                      <span className="tabular">{euro(m.errore_medio)}</span>
                      <span className="tabular">{m.correlazione_rango.toFixed(2).replace(".", ",")}</span>
                    </div>
                  ))}
                  <p style={{ margin: "8px 0 0" }}>
                    Fra i cavalli che il modello dava sopra {euro(v.soglia)}, li ha superati davvero il {Math.round(v.modello.indicati_sopra_giusti * 100)}%
                    (con "quanto l'anno scorso" il {Math.round(v.anno_prima.indicati_sopra_giusti * 100)}%). In media stimava {euro(v.medi_stimati)} e ne sono arrivati {euro(v.medi_reali)}.
                    La probabilità di coprire la spesa si legge da come sono andati i cavalli con una stima simile. Non conta rivendita, valore da riproduttore né infortuni futuri.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
