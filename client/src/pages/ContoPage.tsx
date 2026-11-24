/**
 * FAI IL CONTO (24/11/2026): una pagina sola al posto di "Prima di correre" e
 * "In corsa". In alto si sceglie cosa si ha:
 *  - un PULEDRO: padre, madre e se si vuole il prezzo. Una risposta sola:
 *    quanto pagarlo al massimo, quando conviene venderlo, se allevarlo conviene;
 *  - un CAVALLO CHE CORRE: il nome. La risposta: tienilo o fermalo, con premi
 *    attesi e spesa dei prossimi 12 mesi.
 * Al massimo quattro cifre visibili; tutto il resto sta in "Mostra il conto
 * completo", chiuso. La pagina non parte vuota: c'e' gia' un esempio.
 * Conti sul server: /api/puledro/valore, /api/pareggio/incrocio, /api/tenere.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, Baby, Activity, ChevronDown, ChevronUp } from "lucide-react";
import Sagoma from "../components/Sagoma";
import NameSelect from "../components/NameSelect";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import AggiungiScuderia from "../components/AggiungiScuderia";
import SpeseBar from "../components/SpeseBar";
import GradeBadge from "../components/GradeBadge";
import GraficoColonne, { COLORI_GRAFICO } from "../components/GraficoColonne";
import { Risposta } from "../components/Periodo";
import { CSS_DUE_COLONNE, Cifra, Barretta, nomeBello } from "../components/DueColonne";
import { useScuderia } from "@/lib/scuderia";
import { testoProb, probDaPercentili } from "@/lib/probCopre";
import { VERDE, GIALLO, ROSSO, NEUTRO, SPENTO, COLORE_VOTO } from "@/lib/coloriEconomia";

const COLORE = coloreScheda("/conto");
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−€ " : "€ ") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const pc = (p: number | null | undefined) => (p == null ? "—" : p > 0 && p < 1 ? "meno di 1" : `${Math.round(p)}`);
const get = (u: string) => apiRequest("GET", u).then(r => r.json());
const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");
const VOTI_CASO: Record<string, string[]> = { campione: ["SSS", "SS", "S"], buono: ["A", "B"], discreto: ["C", "D"], poco: ["E", "F"] };
const ESEMPIO_PADRE = "FACE TIME BOURBON";
type Modo = "puledro" | "cavallo";

const CSS_CONTO = `
.co-scelta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.co-scelta button { all: unset; cursor: pointer; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 13px;
  border: 1px solid var(--ed-bordo); background: var(--ed-fondo); }
.co-scelta button[aria-pressed="true"] { border-color: color-mix(in srgb, var(--ed-acc) 70%, transparent); background: color-mix(in srgb, var(--ed-acc) 10%, var(--ed-fondo)); }
.co-scelta b { display: block; font-size: 14.5px; color: var(--ed-testo); }
.co-scelta small { display: block; font-size: 11.5px; color: var(--ed-muto); margin-top: 2px; }
.co-modulo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 10px; align-items: end; }
.co-modulo label, .co-campo { font-size: 12px; color: var(--ed-muto); display: flex; flex-direction: column; gap: 5px; }
.co-modulo input[type=number] { background: hsl(220 12% 7%); border: 1px solid var(--ed-bordo); border-radius: 8px; color: var(--ed-testo);
  padding: 8px 10px; font-size: 13px; font-family: inherit; width: 100%; box-sizing: border-box; }
.co-completo > * { min-width: 0; }
.co-fascia { display: grid; gap: 4px; font-size: 12.5px; }
.co-fascia-testa { display: flex; justify-content: space-between; gap: 10px; }
.co-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.co-tab th, .co-tab td { padding: 6px 6px; border-bottom: 1px solid var(--ed-bordo); }
@media (max-width: 480px) { .co-tab { font-size: 11.5px; } .co-tab th, .co-tab td { padding: 5px 4px; } .co-tab .co-nasc { display: none; } }
.co-domanda { font-size: 21px; font-weight: 900; color: var(--ed-testo); margin: 18px 0 10px; line-height: 1.25; }
.co-caso { display: grid; grid-template-columns: minmax(0, 1fr) 110px 96px; gap: 6px 14px; align-items: center; padding: 9px 12px; border-radius: 10px; background: var(--ed-fondo2); }
@media (max-width: 640px) { .co-scelta { grid-template-columns: 1fr; } .co-caso { grid-template-columns: minmax(0, 1fr) 90px; } .co-caso .co-netto { grid-column: 1 / -1; text-align: left !important; } }
`;

function Completo({ children }: { children: React.ReactNode }) {
  const [aperto, setAperto] = useState(false);
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={() => setAperto(!aperto)} data-testid="conto-completo"
        style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: COLORE }}>
        {aperto ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {aperto ? "Nascondi il conto completo" : "Mostra il conto completo"}
      </button>
      {/* minmax(0, 1fr): senza, una tabella larga dentro un riquadro allargava
          tutta la colonna e sul telefono i riquadri uscivano dallo schermo. */}
      {aperto && <div className="co-completo" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, marginTop: 12 }}>{children}</div>}
    </div>
  );
}

/* ------------------------------ PULEDRO ------------------------------ */

function Puledro({ iniziale }: { iniziale: { padre: string; madre: string; prezzo: string; asta: boolean; nome: string } }) {
  const { scuderia } = useScuderia();
  const mensile = scuderia.mensile || 1200;
  const esempio = !iniziale.padre;
  const [padre, setPadre] = useState(iniziale.padre || ESEMPIO_PADRE);
  const [madre, setMadre] = useState(iniziale.madre);
  const [prezzo, setPrezzo] = useState(iniziale.prezzo);
  const [asta, setAsta] = useState(iniziale.asta);
  const prezzoN = prezzo.trim() !== "" && Number(prezzo) >= 0 ? Math.round(Number(prezzo)) : null;
  const qs = `padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}&mensile=${mensile}&margine=0&asta=${asta ? 1 : 0}&prezzo=${prezzoN ?? ""}`;
  const { data: d, isFetching } = useQuery<any>({ queryKey: ["/api/puledro/valore", qs], queryFn: () => get(`/api/puledro/valore?${qs}`), enabled: !!padre, placeholderData: (p: any) => p, staleTime: 30 * 60_000 });
  const { data: inc } = useQuery<any>({
    queryKey: ["/api/pareggio/incrocio", padre, madre, mensile, scuderia.monta],
    queryFn: () => get(`/api/pareggio/incrocio?padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}&mensile=${mensile}&monta=${scuderia.monta ?? ""}`),
    enabled: !!padre, placeholderData: (p: any) => p, staleTime: 30 * 60_000,
  });
  const r = d?.con_regola;
  const ok = r && r.prezzo_massimo > 0;
  const maxP = r ? Math.max(1, ...r.scenari.map((s: any) => s.p)) : 1;
  return (
    <>
      <div className="ed-pannello co-modulo" data-testid="modulo-puledro">
        <div className="co-campo">Padre<NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Stallone" onChange={n => setPadre((n || "").toUpperCase())} /></div>
        <div className="co-campo">Madre (facoltativa)<NameSelect value={madre} endpoint="/api/search/mare" placeholder="Fattrice" onChange={n => setMadre((n || "").toUpperCase())} /></div>
        <label>Prezzo che ti chiedono (facoltativo)
          <input type="number" min={0} step={1000} inputMode="numeric" value={prezzo} placeholder="€" onChange={e => setPrezzo(e.target.value)} />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "var(--ed-testo)", fontSize: 12.5, paddingBottom: 8 }}>
          <input type="checkbox" checked={asta} onChange={e => setAsta(e.target.checked)} /> scelto all'asta
        </label>
      </div>
      {esempio && padre === ESEMPIO_PADRE && <p style={{ fontSize: 12, color: "var(--ed-fioco)", margin: "8px 0 0" }}>Esempio: un figlio di {nomeBello(ESEMPIO_PADRE)}. Cambia i nomi per il tuo puledro.</p>}

      <div className="co-domanda">Quanto posso pagare questo puledro?</div>
      {!d && isFetching && <Sagoma riquadri={4} />}
      {d?.message && <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>{d.message}</div>}
      {d && r && !d.message && <>
        <Risposta etichetta="Al massimo" periodo="tutta la carriera" colore={ok ? VERDE : ROSSO}
          valore={ok ? euro(r.prezzo_massimo) : "nessun prezzo"} verdetto={ok ? "per stare in pari" : "non si ripaga"}
          testo={d.prezzo != null
            ? <>Pagandolo {euro(d.prezzo)}, in media {r.con_prezzo.utile_atteso >= 0 ? "guadagni" : "perdi"} {euro(Math.abs(r.con_prezzo.utile_atteso))}: si ripaga {pc(r.con_prezzo.prob_ripaga)} volte su 100.</>
            : ok ? <>Pagandolo così, in media vai in pari. Sopra questo prezzo, in media perdi.</>
              : <>Anche regalato, in media perdi {euro(-r.valore_atteso)}: i premi che vincerà non coprono l'allenamento.</>}
          destra={<AggiungiScuderia voce={{ tipo: "puledro", nome: iniziale.nome || null, padre: d.padre, madre: d.madre, anno: new Date().getFullYear() - 1, prezzo: prezzoN, asta }} />} />
        <div className="ed-cifre" style={{ marginTop: 10 }}>
          <Cifra titolo="Se l'hai allevato" valore={ok ? `vendi sopra ${euro(r.prezzo_massimo)}` : "vendilo"} colore={NEUTRO}
            sotto={ok ? "sotto questo prezzo rende di più farlo correre" : "a qualsiasi prezzo rende più che farlo correre"} />
          <Cifra titolo="Vincerà in media" valore={euro(r.premi_attesi)} colore={NEUTRO} sotto="in tutta la carriera" />
          <Cifra titolo="Allenamento" valore={euro(r.allenamento_atteso)} colore={NEUTRO} sotto={`a ${euro(mensile)} al mese, fino a quando conviene`} />
          <Cifra titolo="Allevarlo conviene?" colore={inc?.utile_atteso == null ? NEUTRO : inc.utile_atteso >= 0 ? VERDE : ROSSO}
            valore={inc?.utile_atteso == null ? "manca la monta" : inc.utile_atteso >= 0 ? `guadagni ${euro(inc.utile_atteso)}` : `perdi ${euro(-inc.utile_atteso)}`}
            sotto={inc?.utile_atteso == null ? "scrivi il prezzo della monta in «Cambia» qui sopra" : `in media, con la monta a ${euro(inc.monta)} e l'allevamento`} />
        </div>

        <Completo>
          <div className="ed-pannello">
            <div className="ed-tit" style={{ marginTop: 0 }}>Come può andare</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {r.scenari.map((s: any) => (
                <div key={s.chiave} className="co-caso">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ed-testo)" }}>{s.nome}</span>
                      {(VOTI_CASO[s.chiave] ?? []).map(v => <GradeBadge key={v} grade={v} size="sm" />)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ed-fioco)", marginTop: 3 }}>vince in media {euro(s.premi_medi)} · {s.anni_medi.toLocaleString("it-IT")} anni di allenamento</div>
                  </div>
                  <div>
                    <div className="tabular" style={{ fontSize: 14, fontWeight: 800, color: "var(--ed-testo)", textAlign: "right" }}>{pc(s.p)}%</div>
                    <div style={{ marginTop: 4 }}><Barretta valore={s.p} max={maxP} colore={COLORE} /></div>
                  </div>
                  <div className="co-netto tabular" style={{ fontSize: 13.5, fontWeight: 800, textAlign: "right", color: s.netto >= 0 ? VERDE : ROSSO }}>
                    {s.netto >= 0 ? "guadagni" : "perdi"} {euro(Math.abs(s.netto))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="ed-pannello">
            <div className="ed-tit" style={{ marginTop: 0 }}>Se lo paghi…</div>
            <div style={{ display: "grid", gap: 5 }}>
              {r.curva.map((c: any) => (
                <div key={c.prezzo} style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) 40px 84px", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)" }}>{c.prezzo === 0 ? "regalato" : euro(c.prezzo)}</span>
                  <Barretta valore={c.prob_ripaga} colore={r.prezzo_massimo > 0 && c.prezzo <= r.prezzo_massimo ? VERDE : SPENTO} alta={10} />
                  <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)" }}>{pc(c.prob_ripaga)}%</span>
                  <span className="tabular" style={{ textAlign: "right", color: c.utile_atteso >= 0 ? VERDE : ROSSO }}>{c.utile_atteso >= 0 ? "+" : "−"}{euro(Math.abs(c.utile_atteso)).replace("−", "")}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: "var(--ed-muto)", margin: "8px 0 0" }}>Per ogni prezzo: quante volte su 100 si ripaga, e quanto guadagni o perdi in media.</p>
          </div>
          {inc?.probabilita && (
            <div className="ed-pannello">
              <div className="ed-tit" style={{ marginTop: 0 }}>Che voto può prendere</div>
              <GraficoColonne altezza={130} colore={COLORI_GRAFICO.buono} nomeAsse="probabilità del voto · grigio: non arriva a correre"
                dati={inc.probabilita.map((p: any) => ({ chiave: p.voto, etichetta: p.voto === "Non corre" ? "no" : p.voto, valore: p.p, testo: `${Math.round(p.p)}%`,
                  colore: p.voto === "Non corre" ? SPENTO : COLORE_VOTO[p.voto], scheda: [{ testo: p.voto === "Non corre" ? "Non corre" : `Voto ${p.voto}` }, { testo: `${p.p.toLocaleString("it-IT")}%` }] }))} />
              <p style={{ fontSize: 11.5, color: "var(--ed-muto)", margin: "8px 0 0", lineHeight: 1.5 }}>
                Dai figli veri di {nomeBello(padre)}{madre ? ` e di ${nomeBello(madre)}` : ""} ({Math.round(100 * (inc.peso_figli ?? 0))}% del peso) e dal modello del potenziale alla nascita.
              </p>
            </div>
          )}
          <Spiegazione titolo="Come è fatto il conto">
            <p>Le probabilità di ogni caso vengono dai figli del padre (e della madre), i premi e gli anni da quelli veri dei cavalli nati 2014-2019 finiti in quel caso.
            Il cavallo si ferma quando una stagione non rende almeno metà del suo costo. «Scelto all'asta» alza i premi di 1,4 volte, quanto hanno reso in più i puledri d'asta.</p>
            <p>Non contano la rivendita, il valore di una femmina come fattrice e i premi all'allevatore: sono tutti a favore, quindi il prezzo massimo vero è un po' più alto.</p>
          </Spiegazione>
        </Completo>
      </>}
    </>
  );
}

/* ------------------------------ CAVALLO ------------------------------ */

/** Il conto completo di un cavallo che corre: come possono andare i prossimi
 *  12 mesi, cosa cambia con la spesa, perche' la stima, la carriera fin qui,
 *  stagione per stagione e il cavallo tipico del suo voto. */
function ContoCavallo({ r, mensile, costo }: { r: any; mensile: number; costo: number }) {
  const anno = r.anno || 0;
  const { data: pv } = useQuery<any>({ queryKey: ["previsioni", r.nome, anno, mensile],
    queryFn: () => get(`/api/horse/${encodeURIComponent(r.nome)}/${anno}/previsioni?mensile=${mensile}`), staleTime: 30 * 60_000 });
  const { data: pc2 } = useQuery<any>({ queryKey: ["/api/pareggio/cavallo", r.nome, anno, mensile],
    queryFn: () => get(`/api/pareggio/cavallo?nome=${encodeURIComponent(r.nome)}&anno=${anno}&mensile=${mensile}`), staleTime: 30 * 60_000 });
  const st = pv?.premi;
  const q: number[] | null = st?.simili?.percentili?.length >= 18 ? st.simili.percentili : null;
  const fasce = q ? [["1 volta su 10 vince meno di", q[1]], ["1 volta su 4 meno di", q[4]], ["metà delle volte meno di", q[9]],
    ["1 volta su 4 più di", q[14]], ["1 volta su 10 più di", q[17]]] as [string, number][] : [];
  const maxF = q ? Math.max(costo, q[17], 1) : 1;
  const ca = pc2?.carriera, tip = pc2?.tipico_del_voto, stag: any[] = pc2?.stagioni_premi ?? [];
  const oggi = new Date().getFullYear();
  return (
    <>
      <div className="ed-pannello">
        <div className="ed-tit" style={{ marginTop: 0 }}>Come possono andare i prossimi 12 mesi</div>
        {!pv ? <Sagoma righe={4} /> : !q ? <p style={{ fontSize: 12.5, color: "var(--ed-muto)", margin: 0 }}>Per questo cavallo non c'è ancora la stima del modello.</p> : <>
          <p style={{ fontSize: 12.5, color: "var(--ed-muto)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Quanto hanno vinto davvero nei 12 mesi dopo {st.simili.n.toLocaleString("it-IT")} cavalli con una stima simile alla sua ({euro(r.attesi)}).
            La linea è la tua spesa di un anno, {euro(costo)}.
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {fasce.map(([t, v]) => (
              <div key={t} className="co-fascia">
                <span className="co-fascia-testa">
                  <span style={{ color: "var(--ed-muto)", minWidth: 0 }}>{t}</span>
                  <span className="tabular" style={{ fontWeight: 700, color: v >= costo ? VERDE : "var(--ed-testo)", whiteSpace: "nowrap" }}>{euro(v)}</span>
                </span>
                <span style={{ position: "relative", display: "block" }}>
                  <Barretta valore={v} max={maxF} colore={v >= costo ? VERDE : SPENTO} alta={9} />
                  <span style={{ position: "absolute", top: -3, bottom: -3, left: `${Math.min(100, 100 * costo / maxF)}%`, borderLeft: `2px solid ${GIALLO}` }} />
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--ed-muto)", margin: "10px 0 0" }}>
            Non vince niente {Math.round(100 * (st.simili.zero ?? 0))} volte su 100. Copre la spesa {testoProb(r.prob, r.estremo)} delle volte.
          </p>
        </>}
      </div>

      {q && (
        <div className="ed-pannello">
          <div className="ed-tit" style={{ marginTop: 0 }}>Se cambi la spesa</div>
          <p style={{ fontSize: 12, color: "var(--ed-muto)", margin: "0 0 8px" }}>Spesa al mese, quanto guadagni (+) o perdi (−) in media in un anno, e quante volte copre la spesa. ★ = la tua.</p>
          <div>
            <table className="co-tab">
              <thead><tr style={{ color: "var(--ed-muto)", fontSize: 11 }}>
                {["Al mese", "In un anno", "In media", "Copre"].map((t, i) => <th key={t} className={i === 1 ? "co-nasc" : undefined} style={{ textAlign: i ? "right" : "left", fontWeight: 600 }}>{t}</th>)}
              </tr></thead>
              <tbody>
                {[800, 1000, 1200, 1500, 1800, 2200].map(m => {
                  const sp = 12 * m, sal = r.attesi - sp, pr = probDaPercentili(q, sp);
                  return (
                    <tr key={m} style={{ borderBottom: "1px solid var(--ed-bordo)", background: m === mensile ? "color-mix(in srgb, var(--ed-acc) 10%, transparent)" : undefined }}>
                      <td style={{ fontWeight: m === mensile ? 800 : 500, whiteSpace: "nowrap" }}>{euro(m)}{m === mensile ? " ★" : ""}</td>
                      <td className="co-nasc" style={{ textAlign: "right" }}>{euro(sp)}</td>
                      <td style={{ textAlign: "right", color: sal >= 0 ? VERDE : ROSSO }}>{sal >= 0 ? "+" : "−"}{euro(Math.abs(sal))}</td>
                      <td style={{ textAlign: "right" }}>{testoProb(100 * pr.p, pr.estremo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {st?.motivi?.length > 0 && (
        <div className="ed-pannello">
          <div className="ed-tit" style={{ marginTop: 0 }}>Perché questa stima</div>
          <div style={{ display: "grid", gap: 6 }}>
            {st.motivi.map((m: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, color: "var(--ed-testo)" }}>
                <span style={{ color: m.verso > 0 ? VERDE : m.verso < 0 ? ROSSO : "var(--ed-muto)", fontWeight: 900 }}>{m.verso > 0 ? "▲" : m.verso < 0 ? "▼" : "•"}</span>
                <span>{m.testo}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", margin: "8px 0 0" }}>▲ alza la stima, ▼ la abbassa. Ultimi 12 mesi: {euro(st.ultimo_anno)} in {st.corse_ultimo_anno ?? 0} corse.</p>
        </div>
      )}

      <div className="ed-pannello">
        <div className="ed-tit" style={{ marginTop: 0 }}>La carriera fin qui</div>
        {!pc2 ? <Sagoma righe={3} /> : <>
          <div className="ed-cifre">
            <Cifra titolo="Ha vinto" valore={euro(pc2.guadagni_carriera)} colore={NEUTRO} sotto={`in ${pc2.gare} corse, ${pc2.stagioni} stagioni`} />
            {ca ? <>
              <Cifra titolo="È costato" valore={euro(ca.speso_stimato)} colore={NEUTRO} sotto={`allevamento${pc2.monta != null ? ` e monta (${euro(pc2.monta)})` : ""} più l'allenamento a ${euro(mensile)} al mese`} />
              <Cifra titolo="Bilancio" valore={`${ca.bilancio >= 0 ? "+" : "−"}${euro(Math.abs(ca.bilancio))}`} colore={ca.bilancio >= 0 ? VERDE : ROSSO}
                sotto={ca.bilancio >= 0 ? "si è già ripagato" : `mancano ${euro(ca.mancano_per_pareggio)} per andare in pari`} />
            </> : <Cifra titolo="Bilancio" valore="—" sotto="la monta del padre non è nel catalogo: il costo d'ingresso non si sa" />}
          </div>
          {stag.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="ed-etich" style={{ marginBottom: 6 }}>Stagione per stagione · in verde gli anni che hanno coperto la spesa</div>
              <GraficoColonne altezza={140} colore={COLORI_GRAFICO.euro} nomeAsse="premi per stagione"
                dati={stag.map(x => ({ chiave: x.anno, etichetta: String(x.anno), valore: x.premi, testo: x.premi >= 1000 ? `${Math.round(x.premi / 1000)}k` : String(x.premi),
                  colore: x.premi >= costo ? VERDE : COLORI_GRAFICO.euro, tratteggio: x.anno === oggi,
                  scheda: [{ testo: `${x.anno}${x.anno === oggi ? " (in corso)" : ""}` }, { testo: `${euro(x.premi)} vinti` }, { testo: `${x.corse} corse, ${x.vittorie} vittorie, ${x.primi_tre} nei primi tre` }] }))} />
            </div>
          )}
        </>}
      </div>

      {tip && (
        <div className="ed-pannello">
          <div className="ed-tit" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>Il cavallo tipico con il suo voto <GradeBadge grade={tip.voto} size="sm" /></div>
          <div className="ed-cifre">
            <Cifra titolo="Vince in carriera" valore={euro(tip.guadagno_mediano)} colore={NEUTRO} sotto={`in ${tip.stagioni_mediane} stagioni, ${euro(tip.guadagno_per_stagione)} a stagione`} />
            <Cifra titolo="Costa" valore={euro(tip.costo_mediano)} colore={NEUTRO} sotto="dalla nascita a fine carriera" />
            <Cifra titolo="Si ripaga" valore={`${Math.round(tip.pct_in_utile)}%`} colore={tip.pct_in_utile >= 50 ? VERDE : tip.pct_in_utile >= 25 ? GIALLO : ROSSO} sotto={`dei ${tip.n.toLocaleString("it-IT")} cavalli con il voto ${tip.voto}`} />
          </div>
        </div>
      )}

      {pv?.prossima && (
        <div className="ed-pannello" style={{ fontSize: 13, color: "var(--ed-testo)" }}>
          <div className="ed-tit" style={{ marginTop: 0 }}>La prossima corsa</div>
          {pv.prossima.pista} · {new Date(pv.prossima.data).toLocaleDateString("it-IT")}{pv.prossima.ora ? ` alle ${pv.prossima.ora}` : ""} · {pv.prossima.partenti} partenti
          {pv.prossima.prob != null && <> · nei primi tre {Math.round(pv.prossima.prob)} volte su 100</>}
        </div>
      )}

      <div className="ed-pannello" style={{ fontSize: 13, color: "var(--ed-testo)", lineHeight: 1.6 }}>
        {r.padre && <>Figlio di <Link href={`/stallion/${encodeURIComponent(r.padre)}`} style={{ color: COLORE }}>{nomeBello(r.padre)}</Link>, </>}
        {r.eta ? `${r.eta} anni. ` : ""}Tutta la sua storia è nella <Link href={`/horse/${encodeURIComponent(r.nome)}/${anno}`} style={{ color: COLORE }}>sua scheda</Link>.
        Se ti hanno fatto un'offerta, mettilo nella <Link href="/scuderia" style={{ color: COLORE }}>scuderia</Link> e scrivila accanto: ti dice se vendere.
      </div>
      <Spiegazione titolo="Come è fatto il conto">
        <p>Quanto vincerà nei prossimi 12 mesi lo stima un modello XGBoost allenato sui cavalli fra il 2016 e il 2023 e provato sul 2025
        {pv?.verifica_premi?.modello?.errore_medio ? <> (sbaglia in media di {euro(pv.verifica_premi.modello.errore_medio)})</> : null}.
        Come possono andare i 12 mesi e quante volte copre la spesa si leggono da come sono andati davvero i cavalli con una stima simile.
        Le spese già fatte non contano per decidere se tenerlo: contano solo nel bilancio della carriera.</p>
        <p>Il bilancio usa il costo fino ai 2 anni (allevamento più la monta del padre dal catalogo) e un anno di allenamento per ogni stagione più quello prima del debutto.
        Non conta la rivendita, il valore da riproduttore, gli infortuni e le spese straordinarie.</p>
      </Spiegazione>
    </>
  );
}

function Cavallo({ iniziale }: { iniziale: string }) {
  const { scuderia } = useScuderia();
  const mensile = scuderia.mensile || 1200;
  const [nome, setNome] = useState(iniziale.toUpperCase());
  const cerca = nome ? `cerca=${encodeURIComponent(nome)}` : "ordina=attesi";
  const { data: d, isFetching } = useQuery<any>({ queryKey: ["/api/tenere", cerca, mensile], queryFn: () => get(`/api/tenere?${cerca}&mensile=${mensile}`), placeholderData: (p: any) => p, staleTime: 30 * 60_000 });
  const righe: any[] = d?.righe ?? [];
  const r = nome ? (righe.find(x => x.nome === nome) ?? righe[0]) : righe[0];
  const esempio = !nome && !!r;
  const costo = d?.costo_anno ?? 12 * mensile;
  const verdetto = r?.esito === "profitto" ? "Tienilo" : r?.esito === "pareggio" ? "Circa in pari" : "Fermalo";
  const colore = r?.esito === "profitto" ? VERDE : r?.esito === "pareggio" ? GIALLO : ROSSO;
  return (
    <>
      <div className="ed-pannello co-modulo" data-testid="modulo-cavallo">
        <div className="co-campo">Il cavallo<NameSelect value={nome} endpoint="/api/search/horse" placeholder="Scrivi il nome" onChange={n => setNome((n || "").toUpperCase())} /></div>
      </div>
      {esempio && <p style={{ fontSize: 12, color: "var(--ed-fioco)", margin: "8px 0 0" }}>Esempio: {nomeBello(r.nome)}. Scrivi il nome del tuo cavallo.</p>}
      <div className="co-domanda">Lo tengo o lo fermo?</div>
      {!d && isFetching && <Sagoma riquadri={4} />}
      {d && !r && <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Questo cavallo non ha corso nell'ultimo anno: il conto si fa solo per i cavalli in attività.</div>}
      {r && <>
        <Risposta etichetta={nomeBello(r.nome)} periodo="i prossimi 12 mesi" colore={colore}
          valore={verdetto} verdetto={`${r.saldo >= 0 ? "guadagni" : "perdi"} ${euro(Math.abs(r.saldo))} in media`}
          testo={<>Con {euro(costo)} di spesa in un anno, copre la spesa {testoProb(r.prob, r.estremo)} delle volte.</>}
          destra={<>
            {r.voto && <GradeBadge grade={r.voto} size="md" />}
            <AggiungiScuderia voce={{ tipo: "cavallo", nome: r.nome, anno: r.anno ?? null }} />
          </>} />
        <div className="ed-cifre" style={{ marginTop: 10 }}>
          <Cifra titolo="Vincerà" valore={euro(r.attesi)} colore={NEUTRO} sotto="in media nei prossimi 12 mesi" />
          <Cifra titolo="Spenderai" valore={euro(costo)} colore={NEUTRO} sotto={`a ${euro(mensile)} al mese`} />
          <Cifra titolo="Copre la spesa" valore={testoProb(r.prob, r.estremo)} colore={(r.prob ?? 0) >= 50 ? VERDE : (r.prob ?? 0) >= 25 ? GIALLO : ROSSO} sotto="delle volte" />
          <Cifra titolo="Ultimi 12 mesi" valore={euro(r.ultimo)} colore={NEUTRO} sotto="già vinti" />
        </div>
        <Completo>
          <ContoCavallo r={r} mensile={mensile} costo={costo} />
        </Completo>
      </>}
    </>
  );
}

/* ------------------------------ PAGINA ------------------------------ */

export default function ContoPage() {
  const [percorso] = useLocation();
  const leggi = () => {
    const q = parametri();
    const perc = window.location.hash.replace(/^#/, "").split("?")[0] || percorso;
    const modo: Modo = q.get("modo") === "cavallo" || perc.startsWith("/tenere") || q.get("cavallo") ? "cavallo" : "puledro";
    return { modo, cavallo: q.get("cavallo") ?? "", puledro: {
      padre: q.get("padre")?.toUpperCase() ?? "", madre: q.get("madre")?.toUpperCase() ?? "", prezzo: q.get("prezzo") ?? "",
      asta: q.get("asta") === "1", nome: q.get("nome") ?? "" } };
  };
  const [stato, setStato] = useState(leggi);
  const [versione, setVersione] = useState(0);
  useEffect(() => {
    const f = () => { setStato(leggi()); setVersione(v => v + 1); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const modo = stato.modo;
  const scegli = (m: Modo) => setStato(s => ({ ...s, modo: m }));
  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE + CSS_CONTO}</style>
      <IntestazionePagina icona={Calculator} colore={COLORE} titolo="Fai il conto" margineSotto={14}
        sottotitolo="Dimmi cosa hai e ti dico se conviene, con le tue spese." />
      <div className="co-scelta" role="group" aria-label="Cosa hai">
        <button aria-pressed={modo === "puledro"} onClick={() => scegli("puledro")} data-testid="scegli-puledro">
          <Baby size={22} color={modo === "puledro" ? COLORE : "hsl(210 8% 50%)"} />
          <span><b>Ho un puledro</b><small>da comprare, da vendere o da far nascere</small></span>
        </button>
        <button aria-pressed={modo === "cavallo"} onClick={() => scegli("cavallo")} data-testid="scegli-cavallo">
          <Activity size={22} color={modo === "cavallo" ? COLORE : "hsl(210 8% 50%)"} />
          <span><b>Ho un cavallo che corre</b><small>lo tengo o lo fermo?</small></span>
        </button>
      </div>
      <SpeseBar periodo={modo === "puledro" ? "tutta la carriera del puledro" : "i prossimi 12 mesi"} conMonta={modo === "puledro"} colore={COLORE} />
      {modo === "puledro" ? <Puledro key={`p${versione}`} iniziale={stato.puledro} /> : <Cavallo key={`c${versione}`} iniziale={stato.cavallo} />}
    </div>
  );
}
