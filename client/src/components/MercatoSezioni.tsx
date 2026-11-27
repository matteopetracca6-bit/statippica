/**
 * Pezzi della vecchia pagina MERCATO (24/11/2026), ora usati in "Chi rende di
 * piu'" (aste 2026, quanto rende ogni voto) e in "Generazioni" (generazione M).
 *
 * Tre linguette:
 *  - ASTE 2026: i puledri M delle aste di settembre, lotto per lotto;
 *    "Vedi il conto" apre "Prima di correre" gia' compilato;
 *  - GENERAZIONE M: la simulazione sperimentale dei nati 2025;
 *  - QUANTO RENDE OGNI VOTO: il cavallo tipico di ogni voto contro quello che
 *    costa (prima stava nel Punto di pareggio) e quanto pesa ogni costo.
 *
 * Prima aste e generazione M stavano in "Puledri e aste" insieme ai
 * calcolatori, e il voto per voto nel Punto di pareggio insieme a tutto il resto.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, ChevronLeft, ChevronRight, X, Calculator } from "lucide-react";
import Sagoma from "./Sagoma";
import { Spiegazione } from "./Spiegazione";
import { lettera } from "./PotenzialeCavallo";
import AggiungiScuderia from "./AggiungiScuderia";
import GradeBadge from "./GradeBadge";
import PesoCosti from "./PesoCosti";
import { Periodo, Risposta } from "./Periodo";
import { ESITO_COLORE } from "@/lib/esiti";
import { useScuderia } from "@/lib/scuderia";
import { Cifra, Barretta, useDesktop, nomeBello as titolo } from "./DueColonne";

const COLORE = coloreScheda("/rende");
import { VERDE, ROSSO, GIALLO, NEUTRO } from "@/lib/coloriEconomia";
const GRIGIO_BARRA = "hsl(210 10% 58%)";
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−\u2060€\u00a0" : "€\u00a0") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const pc = (p: number | null | undefined) => (p == null ? "—" : p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`);
const pct = (p: number | null | undefined) => (p == null ? "—" : p < 0.01 && p > 0 ? "<1%" : `${Math.round(p * 100)}%`);
const num = (n: number) => Math.round(n).toLocaleString("it-IT");
const NOME_ASTA: Record<string, string> = {
  "ITS Asta Selezionata Yearlings Trottatori 2026": "ITS Selezionata",
  "ITS Asta evento Face Time Bourbon 2026": "Face Time Bourbon",
  "Asta ANACT yearlings 2026": "ANACT",
};
const PER_PAGINA = 30;


export interface Scelta { padre: string; madre: string; prezzo: string; asta: boolean; nome: string }

export const CSS_PULEDRO = `
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
/* ASTE 2026                                                            */
/* ------------------------------------------------------------------ */

function coloreRipaga(x: number | null | undefined) {
  return x == null ? "var(--ed-muto)" : x >= 0.25 ? VERDE : x >= 0.1 ? GIALLO : ROSSO;
}

function SchedaLotto({ l, onConto, onClose }: { l: any; onConto: () => void; onClose?: () => void }) {
  const pm = l.prezzo_massimo;
  const p = l.premi_2_3_anni;
  const maxP = Math.max(p.p75 || 1, l.prezzo || 0, 1);
  return (
    <div className="ed-dettaglio" data-testid="scheda-lotto">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">{NOME_ASTA[l.asta] ?? l.asta} · lotto {l.lotto}</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ed-testo)", marginTop: 2, overflowWrap: "anywhere" }}>
            {titolo(l.puledro)} <span style={{ fontSize: 12, color: "var(--ed-muto)", fontWeight: 600 }}>{l.sesso === "F" ? "femmina" : "maschio"}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
            <Link href={`/stallion/${encodeURIComponent(l.padre)}`} style={{ color: "var(--ed-testo)" }}>{titolo(l.padre)}</Link> ×{" "}
            {l.madre ? <Link href={`/fattrice/${encodeURIComponent(l.madre)}`} style={{ color: "var(--ed-testo)" }}>{titolo(l.madre)}</Link> : "—"}
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo={l.venduto ? "Pagato" : "Ricomprato"} valore={l.venduto ? euro(l.prezzo) : "—"} sotto={!l.venduto && l.prezzo ? `battuto a ${euro(l.prezzo)}` : l.venduto ? "all'asta" : "non venduto"} />
        <Cifra titolo="Prezzo massimo" valore={pm == null ? "—" : pm > 0 ? euro(pm) : "nessuno"}
          colore={!pm ? ROSSO : l.venduto && pm >= l.prezzo ? VERDE : GIALLO} sotto="in carriera, a 1.200 € al mese" />
        <Cifra titolo="Si ripaga" valore={l.venduto ? pct(l.ripaga_entro_3_anni) : "—"} colore={coloreRipaga(l.ripaga_entro_3_anni)} sotto="entro i 3 anni" />
        <Cifra titolo="In pari sotto" valore={!l.venduto ? "—" : l.mensile_di_pareggio ? euro(l.mensile_di_pareggio) : "mai"} sotto="di costo al mese" />
        {l.potenziale && <Cifra titolo="Potenziale a 4 anni" valore={<GradeBadge grade={lettera(l.potenziale.p50)} size="lg" />}
          sotto={`fra ${lettera(l.potenziale.p10)} e ${lettera(l.potenziale.p90)} · dai genitori · ${l.potenziale.etichetta?.esito ?? "in verifica"}`} />}
      </div>

      <div className="ed-etich" style={{ margin: "16px 0 8px" }}>Premi a 2 e 3 anni, nelle simulazioni</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {([["1 su 4 sotto", p.p25], ["tipico", p.mediana], ["1 su 4 sopra", p.p75]] as [string, number][]).map(([t, v]) => (
          <div key={t} style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 80px", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <span style={{ color: "var(--ed-muto)" }}>{t}</span>
            <Barretta valore={v} max={maxP} colore={COLORE} alta={9} />
            <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)", fontWeight: 700 }}>{euro(v)}</span>
          </div>
        ))}
        {l.venduto && l.prezzo > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 80px", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <span style={{ color: "var(--ed-muto)" }}>prezzo pagato</span>
            <Barretta valore={l.prezzo} max={maxP} colore="hsl(210 10% 60%)" alta={9} />
            <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)" }}>{euro(l.prezzo)}</span>
          </div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", lineHeight: 1.55, margin: "10px 0 0" }}>
        Corre a 2 anni in {pct(l.corre_a_2_anni)} delle simulazioni, a 3 anni in {pct(l.corre_a_3_anni)}.
        Pesano il padre per il {pct(l.peso_padre)} ({l.figli_padre} figli), la madre per il {pct(l.peso_madre)}, tutti i cavalli per il resto.
        Sul singolo puledro è un intervallo largo, non una previsione.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        <button onClick={onConto} data-testid="btn-conto-lotto"
          style={{ display: "flex", alignItems: "center", gap: 6, background: COLORE, color: "hsl(220 13% 7%)", border: "none", borderRadius: 9,
            padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          <Calculator size={15} /> Vedi il conto caso per caso
        </button>
        <AggiungiScuderia voce={{ tipo: "puledro", nome: l.puledro, padre: l.padre, madre: l.madre || null, anno: 2025, prezzo: l.venduto ? l.prezzo : null, asta: true }} />
      </div>
    </div>
  );
}

export function Aste({ d, apriConto }: { d: any; apriConto: (s: Scelta) => void }) {
  const desktop = useDesktop();
  const a = d.puledri_in_asta;
  const lotti: any[] = a.lotti_elenco;
  const [asta, setAsta] = useState("");
  const [cerca, setCerca] = useState("");
  const [soloVenduti, setSoloVenduti] = useState(false);
  const [ordine, setOrdine] = useState<"lotto" | "prezzo" | "massimo" | "ripaga">("prezzo");
  const [pagina, setPagina] = useState(1);
  const [aperto, setAperto] = useState<string | null>(null);

  const filtrati = useMemo(() => {
    const c = cerca.trim().toUpperCase();
    const f = lotti.filter(l => (!asta || l.asta === asta) && (!soloVenduti || l.venduto)
      && (!c || l.puledro.includes(c) || l.padre.includes(c) || (l.madre || "").includes(c)));
    if (ordine === "lotto") return f;
    const k = (l: any) => ordine === "prezzo" ? (l.venduto ? l.prezzo : -1) : ordine === "massimo" ? (l.prezzo_massimo ?? -1) : (l.venduto ? l.ripaga_entro_3_anni ?? -1 : -1);
    return [...f].sort((x, y) => k(y) - k(x));
  }, [lotti, asta, cerca, soloVenduti, ordine]);
  const pagine = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const p = Math.min(pagina, pagine);
  const righe = filtrati.slice((p - 1) * PER_PAGINA, p * PER_PAGINA);
  const chiave = (l: any) => l.asta + "|" + l.lotto;
  const scelto = aperto ?? (desktop && righe.length ? chiave(righe[0]) : null);
  const sceltoL = lotti.find(l => chiave(l) === scelto) ?? null;
  const conto = (l: any) => apriConto({ padre: l.padre, madre: l.madre ?? "", prezzo: l.venduto ? String(l.prezzo) : "", asta: true, nome: l.puledro });

  // in breve: quanti hanno un prezzo massimo e quanti sono stati pagati meno
  const v = lotti.filter(l => l.venduto && l.prezzo > 0 && l.prezzo_massimo != null);
  const positivi = v.filter(l => l.prezzo_massimo > 0).length;
  const sotto = v.filter(l => l.prezzo_massimo > 0 && l.prezzo <= l.prezzo_massimo).length;
  const maxPrezzo = Math.max(1, ...lotti.map(l => (l.venduto ? l.prezzo : 0)));
  const reset = () => setPagina(1);

  return (
    <div>
      <div className="ed-cifre">
        <Cifra titolo="Venduti davvero" valore={`${a.venduti} su ${a.lotti}`} sotto="gli altri ricomprati dal venditore" />
        <Cifra titolo="Spesa dei compratori" valore={euro(a.spesa_totale)} />
        <Cifra titolo="Premi attesi" valore={euro(a.premi_al_proprietario_attesi)} colore={NEUTRO} sotto={`fino ai 3 anni, contro ${euro(a.costo_totale_fino_a_3_anni)} fra prezzo e allenamento`} />
        <Cifra titolo="Si ripaga in media" valore={pct(a.ripaga_entro_3_anni_medio)} colore={ROSSO} sotto="entro i 3 anni: conto prudente" />
      </div>

      <div className="ed-tit">Le tre aste</div>
      <div className="pu-asta">
        {a.per_asta.map((x: any) => (
          <button key={x.asta} className="ed-riga" data-attiva={asta === x.asta} style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}
            onClick={() => { setAsta(asta === x.asta ? "" : x.asta); reset(); setAperto(null); }} data-testid={`card-asta-${x.asta}`}>
            <span className="ed-nome">{NOME_ASTA[x.asta] ?? x.asta}</span>
            <span className="ed-sotto">{x.venduti} venduti su {x.lotti} · prezzo medio <b style={{ color: "var(--ed-testo)" }}>{euro(x.prezzo_medio)}</b></span>
            <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <span><span className="ed-etich">Premi attesi</span><span className="tabular" style={{ display: "block", fontWeight: 800, color: NEUTRO }}>{euro(x.premi_2_3_anni_medi_attesi)}</span></span>
              <span><span className="ed-etich">Si ripaga</span><span className="tabular" style={{ display: "block", fontWeight: 800, color: coloreRipaga(x.ripaga_entro_3_anni_medio) }}>{pct(x.ripaga_entro_3_anni_medio)}</span></span>
            </span>
          </button>
        ))}
      </div>
      {v.length > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ed-muto)", lineHeight: 1.6, margin: "10px 0 0" }}>
          <b style={{ color: "var(--ed-testo)" }}>{positivi} venduti su {v.length}</b> hanno un prezzo massimo sopra zero; <b style={{ color: "var(--ed-testo)" }}>{sotto}</b>{" "}
          {sotto === 1 ? "è stato pagato" : "sono stati pagati"} meno del loro prezzo massimo. Chi compra all'asta paga anche la speranza del campione,
          la rivendita e, per le femmine, il valore da fattrice.
        </p>
      )}

      <div className="ed-tit">I puledri M in asta, uno per uno</div>
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={cerca} onChange={e => { setCerca(e.target.value); reset(); setAperto(null); }} placeholder="Puledro, padre o madre" aria-label="Cerca" />
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {([["prezzo", "Prezzo"], ["massimo", "Prezzo massimo"], ["ripaga", "Si ripaga"], ["lotto", "Lotto"]] as const).map(([k, t]) =>
            <button key={k} aria-pressed={ordine === k} onClick={() => { setOrdine(k); reset(); setAperto(null); }}>{t}</button>)}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ed-testo)" }}>
          <input type="checkbox" checked={soloVenduti} onChange={e => { setSoloVenduti(e.target.checked); reset(); setAperto(null); }} /> solo venduti
        </label>
        {asta && <button className="chip-filtro" onClick={() => { setAsta(""); reset(); }}>{NOME_ASTA[asta]} <X size={12} style={{ verticalAlign: -2 }} /></button>}
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{filtrati.length} puledri</span>
      </div>

      {!righe.length ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun puledro con questi filtri.</div> : (
        <div className="ed-griglia">
          <div className="ed-lista">
            {righe.map((l, i) => {
              const k = chiave(l);
              const att = scelto === k;
              const pm = l.prezzo_massimo;
              return (
                <div key={k} style={{ minWidth: 0 }}>
                  <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? null : k)} data-testid={`row-lotto-${i}`}>
                    <span className="ed-pos">{(p - 1) * PER_PAGINA + i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ed-nome" style={{ display: "block" }}>{l.puledro} <span style={{ color: "var(--ed-fioco)", fontWeight: 600, fontSize: 11 }}>{l.sesso}</span>
                        {l.potenziale && <span title={`Potenziale a 4 anni: ${lettera(l.potenziale.p50)}, fra ${lettera(l.potenziale.p10)} e ${lettera(l.potenziale.p90)}`}
                          style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--ed-fioco)", fontWeight: 600, verticalAlign: 1 }}>a 4 anni <GradeBadge grade={lettera(l.potenziale.p50)} size="sm" /></span>}</span>
                      <span className="ed-sotto" style={{ display: "block" }}>{titolo(l.padre)} × {l.madre ? titolo(l.madre) : "—"}</span>
                      <span style={{ display: "block", marginTop: 5 }}><Barretta valore={l.venduto ? l.prezzo : 0} max={maxPrezzo} colore="hsl(210 10% 55%)" alta={4} /></span>
                      <span className="ed-sotto" style={{ display: "block" }}>{NOME_ASTA[l.asta] ?? l.asta} · lotto {l.lotto} · {l.venduto ? euro(l.prezzo) : "ricomprato"}</span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="tabular" style={{ display: "block", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap",
                        color: !pm ? ROSSO : l.venduto && pm >= l.prezzo ? VERDE : GIALLO }}>{pm == null ? "—" : pm > 0 ? euro(pm) : "nessuno"}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>prezzo massimo</span>
                    </span>
                  </button>
                  {!desktop && att && <div style={{ marginTop: 6 }}><SchedaLotto l={l} onConto={() => conto(l)} onClose={() => setAperto(null)} /></div>}
                </div>
              );
            })}
            {pagine > 1 && (
              <div className="ed-pagine">
                <button disabled={p <= 1} onClick={() => { setPagina(p - 1); setAperto(null); }} aria-label="Pagina precedente"><ChevronLeft size={14} /></button>
                pagina {p} di {pagine}
                <button disabled={p >= pagine} onClick={() => { setPagina(p + 1); setAperto(null); }} aria-label="Pagina successiva"><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
          {desktop && (sceltoL ? <SchedaLotto key={scelto!} l={sceltoL} onConto={() => conto(sceltoL)} />
            : <div className="ed-dettaglio ed-vuoto">Scegli un puledro dall'elenco.</div>)}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Cosa vogliono dire i numeri">
          «Premi tipici»: quanto vince a 2 e 3 anni il puledro a metà della fila delle simulazioni. «Si ripaga»: quante volte su cento la sua
          quota di premi copre prezzo e allenamento fino ai 3 anni. «Prezzo massimo»: quanto si poteva pagare per essere in pari in media su tutta
          la carriera, fermandolo quando non rende, a 1.200 € al mese («Vedi il conto caso per caso» apre «Fai il conto» già compilato).
          «In pari sotto»: il costo mensile a cui il prezzo pagato va in pari.
        </Spiegazione>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GENERAZIONE M                                                        */
/* ------------------------------------------------------------------ */

export function GenerazioneM({ d }: { d: any }) {
  const g = d.generazione_intera, pr = d.prova_sul_passato;
  const ult = g.confronto_generazioni[g.confronto_generazioni.length - 1];
  const piu2 = ult ? Math.round(100 * (g.premi_2_anni_per_nato / ult.premi_2_anni_per_nato - 1)) : null;
  const pa = pr.lotti_asta_2024;
  const righe = [...g.confronto_generazioni.map((x: any) => ({ ...x, m: false })),
    { generazione: "M (simulata)", nati: g.nati_ufficiali, premi_2_anni_per_nato: g.premi_2_anni_per_nato, premi_3_anni_per_nato: g.premi_3_anni_per_nato, m: true }];
  const max2 = Math.max(...righe.map((x: any) => x.premi_2_anni_per_nato || 0), 1);
  const max3 = Math.max(...righe.map((x: any) => x.premi_3_anni_per_nato || 0), 1);
  const maxN = Math.max(...righe.map((x: any) => x.nati || 0), 1);
  const maxF = Math.max(...pa.per_fascia_di_prezzo.map((x: any) => Math.max(x.premi_2_anni_medi || 0, x.premi_3_anni_finora_medi || 0)), 1);

  return (
    <div>
      <div className="ed-pannello" style={{ borderColor: "color-mix(in srgb, " + GIALLO + " 45%, transparent)", fontSize: 12.5, color: "var(--ed-testo)", lineHeight: 1.6, marginBottom: 14 }}
        data-testid="avviso-sperimentale">
        <b style={{ color: GIALLO }}>Sperimentale.</b> I nati nel 2025 (nomi con la M) debutteranno a 2 anni nel 2027.
        <Spiegazione titolo="Quanto fidarsi" compatta>
        I numeri della generazione intera sono provati sul passato e tengono; quelli del singolo puledro sono un intervallo largo, non una previsione.
        Questo non è il modello di allevamento del sito.
        </Spiegazione>
      </div>

      <div className="ed-cifre">
        <Cifra titolo="Nati nel 2025" valore={num(g.nati_ufficiali)} sotto="il numero più basso degli ultimi anni" />
        <Cifra titolo="Correranno a 2 anni" valore={`~${num(g.corrono_a_2_anni[1])}`} sotto={`fra ${num(g.corrono_a_2_anni[0])} e ${num(g.corrono_a_2_anni[2])}: il ${pct(g.quota_corrono_2_anni)} dei nati`} />
        <Cifra titolo="Correranno a 3 anni" valore={`~${num(g.corrono_a_3_anni[1])}`} sotto={`fra ${num(g.corrono_a_3_anni[0])} e ${num(g.corrono_a_3_anni[2])}`} />
        <Cifra titolo="Premi a 2 anni" valore={euro(g.premi_2_anni_per_nato)} colore={NEUTRO} sotto={piu2 != null ? `per nato, circa il ${piu2}% più della generazione ${ult.generazione}` : "per nato"} />
      </div>

      <div className="ed-griglia" style={{ marginTop: 16 }}>
        <div className="ed-pannello" style={{ minWidth: 0 }}>
          <div className="ed-tit" style={{ marginTop: 0 }}>Generazione per generazione</div>
          <p style={{ fontSize: 12, color: "var(--ed-muto)", margin: "0 0 12px", lineHeight: 1.5 }}>
            I premi per i giovani sono quasi fissi: con meno puledri, a ciascuno tocca una fetta più grande.
          </p>
          {([["Nati", "nati", maxN, "hsl(210 10% 58%)", (v: number) => num(v)],
            ["Premi a 2 anni, per nato", "premi_2_anni_per_nato", max2, GRIGIO_BARRA, euro],
            ["Premi a 3 anni, per nato", "premi_3_anni_per_nato", max3, GRIGIO_BARRA, euro]] as const).map(([t, k, mx, col, f]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <div className="ed-etich" style={{ marginBottom: 6 }}>{t}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {righe.map((x: any) => (
                  <div key={x.generazione} className="pu-gen">
                    <span style={{ color: x.m ? COLORE : "var(--ed-testo)", fontWeight: x.m ? 800 : 600 }}>{x.generazione}</span>
                    <Barretta valore={x[k]} max={mx} colore={x.m ? COLORE : col} alta={10} />
                    <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)", fontWeight: x.m ? 800 : 500 }}>
                      {x[k] == null ? "in corso" : (f as any)(x[k])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Spiegazione titolo="Premi previsti e puledro tipico" compatta>
            Premi netti previsti: {euro(g.torta_2_anni_prevista_2027)} per i 2 anni nel 2027 e {euro(g.torta_3_anni_prevista_2028)} per i 3 anni nel 2028,
            la media degli ultimi tre anni. Fra chi corre, il puledro tipico vince {euro(g.premi_2_e_3_anni_mediana_di_chi_corre)} in due stagioni;
            circa {num(g.almeno_10000_euro_in_due_stagioni[1])} arriveranno ad almeno 10.000 € e circa {num(g.almeno_50000_euro_in_due_stagioni[1])} ad almeno 50.000 €.
          </Spiegazione>
        </div>

        <div className="ed-pannello" style={{ minWidth: 0 }}>
          <div className="ed-tit" style={{ marginTop: 0 }}>La prova: i puledri dell'asta 2024</div>
          <p style={{ color: "var(--ed-testo)", fontSize: 12.5, lineHeight: 1.6, margin: "0 0 12px" }}>
            Dei {pa.venduti_ritrovati} puledri venduti, <b style={{ color: VERDE }}>{pa.gia_ripagati_a_ottobre_2026}</b> hanno già ripagato prezzo e allenamento:
            costati in media {euro(pa.prezzo_medio_venduti)}, hanno vinto finora {euro(pa.premi_2_e_3_anni_finora_medi_venduti)}.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pa.per_fascia_di_prezzo.map((x: any) => (
              <div key={x.fascia} style={{ padding: "9px 11px", borderRadius: 10, background: "var(--ed-fondo2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                  <b style={{ color: "var(--ed-testo)" }}>pagati {x.fascia} €</b>
                  <span style={{ color: "var(--ed-muto)" }}>{x.lotti} puledri · {pct(x.corsi_a_2_anni)} corsi a 2 anni</span>
                </div>
                {([["2 anni", x.premi_2_anni_medi, COLORE, `tipico ${euro(x.premi_2_anni_mediana)}`], ["3 anni finora", x.premi_3_anni_finora_medi, GRIGIO_BARRA, ""]] as const).map(([t, val, col, nota]) => (
                  <div key={t} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) 76px", gap: 8, alignItems: "center", fontSize: 12, marginTop: 5 }}>
                    <span style={{ color: "var(--ed-muto)" }}>{t}</span>
                    <Barretta valore={val} max={maxF} colore={col} alta={8} />
                    <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)" }} title={nota}>{euro(val)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--ed-muto)", lineHeight: 1.6, margin: "10px 0 0" }}>
            Chi ha pagato di più ha vinto di più a 3 anni, ma molto meno di quanto ha speso.
            {" "}<Link href="/controllo" style={{ color: COLORE }}>La prova rifatta</Link>.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Spiegazione titolo="Come è fatta la simulazione e cosa non dice">
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
            (accordo fra ordine previsto e ordine vero vicino a zero a 2 anni, appena sopra con il prezzo a 3 anni). Per questo il «tipico»
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
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QUANTO RENDE OGNI VOTO                                               */
/* ------------------------------------------------------------------ */

interface Voto {
  voto: string; n: number; guadagno_mediano: number; stagioni_mediane: number; guadagno_per_stagione: number;
  costo_mediano: number; utile_mediano: number; utile_medio: number; pct_in_utile: number; esito: string;
}
interface Base {
  ipotesi: { allevamento_fino_2_anni: number; costo_mensile: number; costo_mensile_basso: number; monta_mediana: number;
             asta_mediana: number | null; asta_n: number; cavalli_osservati: number; cavalli_mai_corsi: number;
             annate: [number, number]; fascia_pareggio: number; fonti: { nome: string; url: string }[] };
  mensile: number; ingresso: number;
  soglie: { carriera: number; stagioni_ipotizzate: number; annuale: number };
  voti: Voto[]; voto_di_pareggio: string | null;
}


const BORDER = "1px solid hsl(220 10% 18%)";
const MUTED = "hsl(210 8% 55%)";
const ETICHETTA_ESITO: Record<string, string> = { profitto: "Profitto", pareggio: "Pareggio", perdita: "Perdita" };
function Esito({ e }: { e: string | null | undefined }) {
  if (!e) return <span style={{ color: MUTED, fontSize: "12px" }}>n.d.</span>;
  const c = ESITO_COLORE[e];
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700,
    color: c, background: c.replace(/\)$/, " / 0.12)"), border: `1px solid ${c.replace(/\)$/, " / 0.4)")}` }}>{ETICHETTA_ESITO[e]}</span>;
}
const COLORE_ESITO = ESITO_COLORE;
const euroP = (n: number) => (n < 0 ? "\u2212" : "") + "\u20ac" + Math.abs(Math.round(n)).toLocaleString("it-IT");

export function RendeOgniVoto() {
  const { scuderia } = useScuderia();
  const mensile = scuderia.mensile || 1200;
  const [modo, setModo] = useState<"allevo" | "compro">("allevo");
  const [prezzo, setPrezzo] = useState<number | null>(null);
  const get = (u: string) => apiRequest("GET", u).then(r => r.json());
  const { data: prime } = useQuery<Base>({ queryKey: ["/api/pareggio", "prime"], queryFn: () => get("/api/pareggio") });
  useEffect(() => { if (prime && prezzo == null) setPrezzo(prime.ipotesi.asta_mediana ?? 20000); }, [prime]);
  const allev = prime?.ipotesi.allevamento_fino_2_anni ?? 14800;
  const monta = scuderia.monta ?? prime?.ipotesi.monta_mediana ?? 0;
  const ingresso = modo === "allevo" ? allev + monta : (prezzo ?? 0);
  const { data, isLoading, error } = useQuery<Base>({
    queryKey: ["/api/pareggio", mensile, ingresso],
    queryFn: () => get(`/api/pareggio?mensile=${mensile}&ingresso=${ingresso}`),
    enabled: !!prime, placeholderData: prev => prev,
  });
  if (error) return <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Non riesco a calcolare adesso. Riprova tra poco.</div>;
  if (!data || isLoading) return <Sagoma cornice righe={8} />;
  const ip = data.ipotesi;
  const bottone = (attivo: boolean): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: "8px", cursor: "pointer", border: "none", fontSize: "12.5px", fontWeight: 700, fontFamily: "inherit",
    background: attivo ? COLORE : "hsl(220 10% 14%)", color: attivo ? "hsl(220 13% 7%)" : MUTED,
  });
  const vp = data.voto_di_pareggio;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Risposta etichetta="Da che voto un cavallo si ripaga" periodo="tutta la carriera, media storica"
        colore={vp ? COLORE_ESITO.pareggio : COLORE_ESITO.perdita}
        valore={vp ? <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span>dal voto</span><span className={`grade-badge grade-${vp}`} style={{ fontSize: 24, padding: "2px 12px", lineHeight: 1.2 }}>{vp}</span></span> : "nessun voto"}
        verdetto={vp ? "in su" : "con queste spese"}
        testo={vp ? <>Con le tue spese, solo dal voto {vp} in su il cavallo tipico non è in perdita.</> : <>Con queste spese nessun voto, nel caso tipico, ripaga i costi.</>}
        sotto={<>Carriere vere di {ip.cavalli_osservati.toLocaleString("it-IT")} cavalli nati fra il {ip.annate[0]} e il {ip.annate[1]}. Si legge come una media storica, non come la previsione su un cavallo.</>} />
      <div className="ed-pannello" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: MUTED }}>Come arriva il cavallo a 2 anni</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button style={bottone(modo === "allevo")} onClick={() => setModo("allevo")}>Lo allevo io</button>
          <button style={bottone(modo === "compro")} onClick={() => setModo("compro")}>Lo compro all'asta</button>
        </span>
        {modo === "compro" ? (
          <label style={{ fontSize: 12.5, color: MUTED, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Prezzo d'acquisto (€)
            <input type="number" min={0} step={1000} value={prezzo ?? ""} onChange={e => setPrezzo(Math.max(0, Number(e.target.value)))}
              style={{ width: 110, background: "hsl(220 12% 8%)", border: BORDER, borderRadius: 8, color: "hsl(210 10% 90%)", padding: "6px 9px", fontSize: 13, fontFamily: "inherit" }} />
          </label>
        ) : (
          <span style={{ fontSize: 12.5, color: MUTED }}>allevamento {euroP(allev)} + monta {euroP(monta)}{scuderia.monta == null ? " (mediana del catalogo: la tua si scrive in «Cambia»)" : ""}</span>
        )}
        <span style={{ fontSize: 12.5, color: MUTED, marginLeft: "auto" }}>costo fino ai 2 anni <b style={{ color: "hsl(210 10% 92%)" }}>{euroP(ingresso)}</b></span>
      </div>
      <div className="ed-cifre">
        <Cifra titolo="Soglia annuale" valore={euroP(data.soglie.annuale)} sotto="quanto deve vincere in un anno un cavallo già in corsa per valere la spesa" />
        <Cifra titolo={`Soglia di carriera`} valore={euroP(data.soglie.carriera)} sotto={`in ${data.soglie.stagioni_ipotizzate} stagioni, per ripagare ingresso e allenamento`} />
      </div>
      <div className="ed-pannello">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div className="ed-tit" style={{ margin: 0 }}>Voto per voto</div><Periodo testo="tutta la carriera" />
        </div>
        <Spiegazione compatta>
          Il cavallo tipico di ogni voto, con il costo calcolato sulle sue stagioni reali. «Pareggio» vuol dire entro il {Math.round(ip.fascia_pareggio * 100)}% del costo, sopra o sotto.
        </Spiegazione>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", fontVariantNumeric: "tabular-nums", minWidth: "760px" }}>
          <thead>
            <tr style={{ color: MUTED, fontSize: "11.5px", textAlign: "right" }}>
              {["Voto", "Cavalli", "Vinto in carriera", "Stagioni", "Vinto a stagione", "Costo", "Utile tipico", "In utile", "Esito"].map((t, i) => (
                <th key={t} style={{ padding: "6px 8px", textAlign: i === 0 || i === 8 ? "left" : "right", fontWeight: 600, borderBottom: BORDER }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.voti.map(v => (
              <tr key={v.voto} style={{ borderBottom: BORDER }}>
                <td style={{ padding: "7px 8px" }}><GradeBadge grade={v.voto} size="sm" /></td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: MUTED }}>{v.n.toLocaleString("it-IT")}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>{euroP(v.guadagno_mediano)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.stagioni_mediane}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: v.guadagno_per_stagione >= data.soglie.annuale ? COLORE_ESITO.profitto : undefined }}>{euroP(v.guadagno_per_stagione)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: MUTED }}>{euroP(v.costo_mediano)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: COLORE_ESITO[v.esito] }}>{euroP(v.utile_mediano)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.pct_in_utile.toLocaleString("it-IT")}%</td>
                <td style={{ padding: "7px 8px" }}><Esito e={v.esito} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <div className="ed-pannello">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div className="ed-tit" style={{ margin: 0 }}>Quanto pesa ogni costo</div><Periodo testo="tutta la carriera" />
        </div>
        <Spiegazione compatta>Con le tue spese, quale voce sposta di più il risultato di un cavallo qualunque: dove conviene risparmiare e cosa servirebbe per andare in pari.</Spiegazione>
        <PesoCosti mensile={mensile} monta={modo === "allevo" ? monta : undefined} prezzo={modo === "compro" ? prezzo : undefined} />
      </div>
      <Spiegazione titolo="Come è fatto il conto e cosa non dice">
        <p>Il costo di un cavallo è: costo fino ai 2 anni (allevamento più monta, oppure prezzo d'acquisto), più 12 mesi di allenamento prima del debutto,
        più 12 mesi per ogni stagione di corse. Il ricavo è il premio netto vinto, che è già la quota del proprietario.</p>
        <p>L'allevamento fino ai 2 anni ({euroP(allev)}) viene dai listini di riproduzione e dalle tariffe UNIRE. Fra i nati {ip.annate[0]}-{ip.annate[1]},
        {" "}{ip.cavalli_mai_corsi.toLocaleString("it-IT")} non hanno mai corso. Non sono contati la rivendita, il valore di una femmina come fattrice e i premi all'allevatore.</p>
        <ul style={{ paddingLeft: "18px", marginTop: "8px" }}>
          {ip.fonti.map(f => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.nome}</a></li>)}
        </ul>
      </Spiegazione>
    </div>
  );
}

