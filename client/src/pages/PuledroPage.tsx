/**
 * PULEDRI E ASTE: una sola pagina per tutto quello che riguarda i puledri.
 *
 * Quattro linguette:
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
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tag, Search, ChevronLeft, ChevronRight, X, Calculator, Repeat, Gavel, Sparkles, ArrowRight } from "lucide-react";
import Sagoma from "../components/Sagoma";
import NameSelect from "../components/NameSelect";
import VendereOCorrere, { MercatoStalloni } from "../components/VendereOCorrere";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import AggiungiScuderia from "../components/AggiungiScuderia";
import { useScuderia } from "@/lib/scuderia";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, nomeBello as titolo } from "../components/DueColonne";

const COLORE = "hsl(25 75% 58%)";
const VERDE = "hsl(145 55% 52%)";
const ROSSO = "hsl(0 60% 62%)";
const ORO = "hsl(45 85% 60%)";
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−€ " : "€ ") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const pc = (p: number | null | undefined) => (p == null ? "—" : p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`);
const pct = (p: number | null | undefined) => (p == null ? "—" : p < 0.01 && p > 0 ? "<1%" : `${Math.round(p * 100)}%`);
const num = (n: number) => Math.round(n).toLocaleString("it-IT");
const NOME_ASTA: Record<string, string> = {
  "ITS Asta Selezionata Yearlings Trottatori 2026": "ITS Selezionata",
  "ITS Asta evento Face Time Bourbon 2026": "Face Time Bourbon",
  "Asta ANACT yearlings 2026": "ANACT",
};
const PER_PAGINA = 30;

const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");

type Tab = "valore" | "vendo" | "aste" | "generazione";
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
  const q = parametri();
  const [padre, setPadre] = useState(iniziale.padre);
  const [madre, setMadre] = useState(iniziale.madre);
  const [prezzo, setPrezzo] = useState(iniziale.prezzo);
  const [mensile, setMensile] = useState(Number(q.get("mensile")) || scuderia.mensile || 1200);
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
        <div className="pu-due">
          <label>Prezzo (€)
            <input type="number" min={0} step={1000} inputMode="numeric" value={prezzo} placeholder="facoltativo" onChange={e => setPrezzo(e.target.value)} />
          </label>
          <label>Costo al mese (€)
            <input type="number" min={100} step={50} inputMode="numeric" value={mensile} onChange={e => setMensile(Math.max(100, Number(e.target.value) || 1200))} />
          </label>
        </div>
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
        <p style={{ fontSize: 11.5, color: "var(--ed-fioco)", margin: 0, lineHeight: 1.5 }}>
          Il costo al mese è la leva più forte: prova 800 € oltre a 1.200 €.
        </p>
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
                <div className="ed-etich">Prezzo massimo</div>
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
/* ASTE 2026                                                            */
/* ------------------------------------------------------------------ */

function coloreRipaga(x: number | null | undefined) {
  return x == null ? "var(--ed-muto)" : x >= 0.25 ? VERDE : x >= 0.1 ? ORO : ROSSO;
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
          colore={!pm ? ROSSO : l.venduto && pm >= l.prezzo ? VERDE : ORO} sotto="in carriera, a 1.200 € al mese" />
        <Cifra titolo="Si ripaga" valore={l.venduto ? pct(l.ripaga_entro_3_anni) : "—"} colore={coloreRipaga(l.ripaga_entro_3_anni)} sotto="entro i 3 anni" />
        <Cifra titolo="In pari sotto" valore={!l.venduto ? "—" : l.mensile_di_pareggio ? euro(l.mensile_di_pareggio) : "mai"} sotto="di costo al mese" />
      </div>

      <div className="ed-etich" style={{ margin: "16px 0 8px" }}>Premi a 2 e 3 anni, nelle simulazioni</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {([["1 su 4 sotto", p.p25], ["tipico", p.mediana], ["1 su 4 sopra", p.p75]] as [string, number][]).map(([t, v]) => (
          <div key={t} style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 80px", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <span style={{ color: "var(--ed-muto)" }}>{t}</span>
            <Barretta valore={v} max={maxP} colore={ORO} alta={9} />
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

function Aste({ d, apriConto }: { d: any; apriConto: (s: Scelta) => void }) {
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
        <Cifra titolo="Premi attesi" valore={euro(a.premi_al_proprietario_attesi)} colore={ORO} sotto={`fino ai 3 anni, contro ${euro(a.costo_totale_fino_a_3_anni)} fra prezzo e allenamento`} />
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
              <span><span className="ed-etich">Premi attesi</span><span className="tabular" style={{ display: "block", fontWeight: 800, color: ORO }}>{euro(x.premi_2_3_anni_medi_attesi)}</span></span>
              <span><span className="ed-etich">Si ripaga</span><span className="tabular" style={{ display: "block", fontWeight: 800, color: coloreRipaga(x.ripaga_entro_3_anni_medio) }}>{pct(x.ripaga_entro_3_anni_medio)}</span></span>
            </span>
          </button>
        ))}
      </div>
      {v.length > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ed-muto)", lineHeight: 1.6, margin: "10px 0 0" }}>
          <b style={{ color: ORO }}>{positivi} venduti su {v.length}</b> hanno un prezzo massimo sopra zero; <b style={{ color: "var(--ed-testo)" }}>{sotto}</b>{" "}
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
                      <span className="ed-nome" style={{ display: "block" }}>{l.puledro} <span style={{ color: "var(--ed-fioco)", fontWeight: 600, fontSize: 11 }}>{l.sesso}</span></span>
                      <span className="ed-sotto" style={{ display: "block" }}>{titolo(l.padre)} × {l.madre ? titolo(l.madre) : "—"}</span>
                      <span style={{ display: "block", marginTop: 5 }}><Barretta valore={l.venduto ? l.prezzo : 0} max={maxPrezzo} colore="hsl(210 10% 55%)" alta={4} /></span>
                      <span className="ed-sotto" style={{ display: "block" }}>{NOME_ASTA[l.asta] ?? l.asta} · lotto {l.lotto} · {l.venduto ? euro(l.prezzo) : "ricomprato"}</span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="tabular" style={{ display: "block", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap",
                        color: !pm ? ROSSO : l.venduto && pm >= l.prezzo ? VERDE : ORO }}>{pm == null ? "—" : pm > 0 ? euro(pm) : "nessuno"}</span>
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
          la carriera, fermandolo quando non rende, a 1.200 € al mese («Vedi il conto caso per caso» apre la linguetta Quanto vale già compilata).
          «In pari sotto»: il costo mensile a cui il prezzo pagato va in pari.
        </Spiegazione>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GENERAZIONE M                                                        */
/* ------------------------------------------------------------------ */

function GenerazioneM({ d }: { d: any }) {
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
      <div className="ed-pannello" style={{ borderColor: "color-mix(in srgb, " + ORO + " 45%, transparent)", fontSize: 12.5, color: "var(--ed-testo)", lineHeight: 1.6, marginBottom: 14 }}
        data-testid="avviso-sperimentale">
        <b style={{ color: ORO }}>Sperimentale.</b> I trottatori nati nel 2025 hanno il nome che comincia per M e debutteranno a 2 anni nel 2027.
        I numeri della generazione intera sono provati sul passato e tengono; quelli del singolo puledro sono un intervallo largo, non una previsione.
        Questo non è il modello di allevamento del sito.
      </div>

      <div className="ed-cifre">
        <Cifra titolo="Nati nel 2025" valore={num(g.nati_ufficiali)} sotto="il numero più basso degli ultimi anni" />
        <Cifra titolo="Correranno a 2 anni" valore={`~${num(g.corrono_a_2_anni[1])}`} sotto={`fra ${num(g.corrono_a_2_anni[0])} e ${num(g.corrono_a_2_anni[2])}: il ${pct(g.quota_corrono_2_anni)} dei nati`} />
        <Cifra titolo="Correranno a 3 anni" valore={`~${num(g.corrono_a_3_anni[1])}`} sotto={`fra ${num(g.corrono_a_3_anni[0])} e ${num(g.corrono_a_3_anni[2])}`} />
        <Cifra titolo="Premi a 2 anni" valore={euro(g.premi_2_anni_per_nato)} colore={ORO} sotto={piu2 != null ? `per nato, circa il ${piu2}% più della generazione ${ult.generazione}` : "per nato"} />
      </div>

      <div className="ed-griglia" style={{ marginTop: 16 }}>
        <div className="ed-pannello" style={{ minWidth: 0 }}>
          <div className="ed-tit" style={{ marginTop: 0 }}>Generazione per generazione</div>
          <p style={{ fontSize: 12, color: "var(--ed-muto)", margin: "0 0 12px", lineHeight: 1.5 }}>
            I premi per i giovani sono quasi fissi: con meno puledri, a ciascuno tocca una fetta più grande.
          </p>
          {([["Nati", "nati", maxN, "hsl(210 10% 58%)", (v: number) => num(v)],
            ["Premi a 2 anni, per nato", "premi_2_anni_per_nato", max2, ORO, euro],
            ["Premi a 3 anni, per nato", "premi_3_anni_per_nato", max3, COLORE, euro]] as const).map(([t, k, mx, col, f]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <div className="ed-etich" style={{ marginBottom: 6 }}>{t}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {righe.map((x: any) => (
                  <div key={x.generazione} className="pu-gen">
                    <span style={{ color: x.m ? ORO : "var(--ed-testo)", fontWeight: x.m ? 800 : 600 }}>{x.generazione}</span>
                    <Barretta valore={x[k]} max={mx} colore={x.m ? ORO : col} alta={10} />
                    <span className="tabular" style={{ textAlign: "right", color: "var(--ed-testo)", fontWeight: x.m ? 800 : 500 }}>
                      {x[k] == null ? "in corso" : (f as any)(x[k])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p style={{ color: "var(--ed-muto)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            Premi netti previsti: {euro(g.torta_2_anni_prevista_2027)} per i 2 anni nel 2027 e {euro(g.torta_3_anni_prevista_2028)} per i 3 anni nel 2028,
            la media degli ultimi tre anni. Fra chi corre, il puledro tipico vince {euro(g.premi_2_e_3_anni_mediana_di_chi_corre)} in due stagioni;
            circa {num(g.almeno_10000_euro_in_due_stagioni[1])} arriveranno ad almeno 10.000 € e circa {num(g.almeno_50000_euro_in_due_stagioni[1])} ad almeno 50.000 €.
          </p>
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
                {([["2 anni", x.premi_2_anni_medi, ORO, `tipico ${euro(x.premi_2_anni_mediana)}`], ["3 anni finora", x.premi_3_anni_finora_medi, COLORE, ""]] as const).map(([t, val, col, nota]) => (
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
            Chi ha pagato di più ha vinto di più a 3 anni, ma molto meno di quanto ha speso. A 2 anni il prezzo non distingueva quasi nulla.
            La stessa prova, rifatta con i soli dati di settembre 2024, è in <Link href="/controllo" style={{ color: COLORE }}>Controllo a posteriori</Link>.
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
/* PAGINA                                                               */
/* ------------------------------------------------------------------ */

export default function PuledroPage() {
  const [percorso] = useLocation();
  const q = parametri();
  const iniz: Tab = percorso.startsWith("/generazione-m") || percorso.startsWith("/aste") ? "aste"
    : percorso.startsWith("/vendere") || q.get("modo") === "vendo" ? "vendo"
    : q.get("modo") === "generazione" ? "generazione" : q.get("modo") === "aste" ? "aste" : "valore";
  const [tab, setTab] = useState<Tab>(iniz);
  const [scelta, setScelta] = useState<Scelta>(() => ({
    padre: q.get("padre")?.toUpperCase() ?? "", madre: q.get("madre")?.toUpperCase() ?? "",
    prezzo: q.get("prezzo") ?? "", asta: q.get("asta") === "1", nome: q.get("nome") ?? "",
  }));
  const [versione, setVersione] = useState(0);
  const { scuderia } = useScuderia();
  useEffect(() => { window.scrollTo?.(0, 0); }, [tab]);

  const { data: gen, error } = useQuery<any>({
    queryKey: ["/api/generazione-m"],
    queryFn: async () => (await apiRequest("GET", "/api/generazione-m")).json(),
    staleTime: 60 * 60_000,
  });

  const apriConto = (s: Scelta) => { setScelta(s); setVersione(v => v + 1); setTab("valore"); };

  const tabs: { key: Tab; label: string; hint: string; icon: any }[] = [
    { key: "valore", label: "Quanto vale", hint: "Il prezzo massimo per comprarlo", icon: Calculator },
    { key: "vendo", label: "Vendere o far correre", hint: "Per chi l'ha allevato", icon: Repeat },
    { key: "aste", label: "Aste 2026", hint: "I puledri M lotto per lotto", icon: Gavel },
    { key: "generazione", label: "Generazione M", hint: "I nati 2025, sperimentale", icon: Sparkles },
  ];

  const senzaDati = error ? <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>La simulazione non è ancora disponibile.</div>
    : <Sagoma cornice righe={8} />;

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE + CSS_PULEDRO}</style>
      <IntestazionePagina icona={Tag} colore={COLORE} titolo="Puledri e aste" margineSotto={16}
        sottotitolo="Quanto pagare un puledro al massimo, se conviene venderlo, e i puledri delle aste 2026 uno per uno.">
        Un solo conto visto da più lati: il valore di un puledro è quello che rende in pista, caso per caso, meno quello che costa farlo correre.
        Chi compra vuole il prezzo massimo, chi ha allevato vuole sapere se vendere. Le aste di settembre 2026 e la generazione M (i nati 2025) usano lo stesso conto.
        Sul singolo puledro la stima è larga: rifatta sull'asta 2024 con i dati di allora, ha indovinato bene il totale dei premi ma non quali puledri
        sarebbero andati meglio (vedi <Link href="/controllo" style={{ color: COLORE }}>Controllo a posteriori</Link>).
      </IntestazionePagina>

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

      {tab === "valore" && <QuantoVale key={versione} iniziale={scelta} vaiAste={() => setTab("aste")} />}
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
      {tab === "aste" && (gen ? <Aste d={gen} apriConto={apriConto} /> : senzaDati)}
      {tab === "generazione" && (gen ? <GenerazioneM d={gen} /> : senzaDati)}

      {(tab === "valore" || tab === "vendo") && (
        <div style={{ marginTop: 16 }}>
          <Spiegazione titolo="Come è fatto il conto e cosa non dice">
            <p>Le probabilità di ogni caso vengono dai voti dei figli del padre (e della madre) nati 2012-2021; con pochi figli si appoggiano alla media di tutti i cavalli,
            come per gli incroci. I premi e le stagioni di ogni caso sono quelli veri, stagione per stagione, dei cavalli nati 2014-2019 con quel voto.
            I premi netti sono già la parte del proprietario.</p>
            <p>Costi: un anno di doma e preparazione prima del debutto, più un anno per ogni stagione di corse, al costo mensile che scegli.
            La regola di fermarlo usa solo la stagione appena finita, come farebbe un proprietario: a volte ferma un cavallo che dopo sarebbe migliorato, e anche questo è nel conto.</p>
            <p>«Scelto all'asta»: i puledri delle aste 2024 e 2025 hanno vinto circa 1,4 volte quanto diceva il loro pedigree, a 2 e a 3 anni.
            Che il vantaggio continui dopo i 3 anni è un'ipotesi: non c'è ancora un'asta da cui verificarlo.</p>
            <p>Non contano: la rivendita, il valore di una femmina come fattrice, i premi all'allevatore. Sono tutti a favore: il prezzo massimo vero è un po' più alto.
            Il costo mensile è la leva più forte: provalo a 800 € oltre che a 1.200 €.</p>
          </Spiegazione>
        </div>
      )}
      <CollegamentiCorrelati voci={[
        { href: "/scuderia", titolo: "La tua scuderia", descrizione: "Metti insieme i tuoi cavalli: cassa, rischio e valore" },
        { href: "/pareggio", titolo: "Punto di pareggio", descrizione: "Costi, voti e incroci" },
        { href: "/controllo", titolo: "Controllo a posteriori", descrizione: "Le stime rifatte sul passato e confrontate con com'è andata" },
      ]} />
    </div>
  );
}
