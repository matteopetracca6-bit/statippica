/**
 * Albero genealogico fino a cinque generazioni (20/11/2026).
 *
 * Usato dalla pagina Pedigree e dalla scheda del cavallo (sezione Famiglia).
 * Ogni casella:
 *  - contorno blu per i maschi (stalloni) e rosa per le femmine (fattrici);
 *  - in ogni coppia il maschio sta sopra e la femmina sotto;
 *  - il voto da atleta (dalle corse) e il voto da stallone o da fattrice
 *    (dai figli), se ci sono; se non ce n'e' nessuno resta solo il contorno.
 * I voti arrivano dal server a ogni richiesta, quindi seguono i ricalcoli
 * notturni.
 */
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "./BandieraCavallo";
import CavalloCaricamento from "./CavalloCaricamento";
import { formatRecord } from "@/lib/record";

export interface VotiNodo { atleta: string | null; stallone: string | null; fattrice: string | null;
  /** Voto storico da riproduttore: figli tutti storici, scala a parte (24/11/2026). */
  stallone_storico?: boolean; fattrice_storica?: boolean }

export interface PedigreeNode {
  name: string;
  birth_year: number | null;
  sex: string | null;
  country: string | null;
  career_earnings: number | null;
  career_wins: number | null;
  career_races: number | null;
  /** Miglior tempo al km in carriera (24/11/2026). */
  record?: string | null;
  sire: PedigreeNode | null;
  dam: PedigreeNode | null;
  missing?: boolean;
  from_source?: boolean;
  /** Stesso nome di un cavallo dell'archivio, ma e' un altro (troppo giovane per stare qui). */
  omonimo?: boolean;
  omonimo_anno?: number | null;
  anno_max?: number | null;
  voti?: VotiNodo;
}


// Antenati ripetuti (23/11/2026): ognuno con un suo colore, sempre visibile,
// non solo passandoci sopra.
const COLORI_RIPETUTI = ["hsl(45 90% 58%)", "hsl(160 60% 50%)", "hsl(275 65% 70%)", "hsl(15 85% 62%)", "hsl(190 75% 55%)", "hsl(95 55% 55%)", "hsl(345 80% 66%)", "hsl(230 70% 72%)"];

/** Chiave di un antenato: il nome, piu' l'anno quando nell'albero lo stesso
 *  nome compare con anni diversi (due cavalli diversi). */
function chiavi(root: PedigreeNode, maxGen: number) {
  const anni = new Map<string, Set<number>>();
  const giro = (x: PedigreeNode | null, g: number) => {
    if (!x || g > maxGen) return;
    if (g > 0 && x.name && !x.omonimo && x.birth_year) {
      const k = x.name.toUpperCase();
      if (!anni.has(k)) anni.set(k, new Set());
      anni.get(k)!.add(x.birth_year);
    }
    giro(x.sire, g + 1); giro(x.dam, g + 1);
  };
  giro(root, 0);
  return (x: PedigreeNode): string | null => {
    if (!x.name || x.omonimo) return null;          // un omonimo non e' mai "lo stesso"
    const k = x.name.toUpperCase();
    const a = anni.get(k);
    if (a && a.size > 1) return x.birth_year ? `${k}|${x.birth_year}` : null;  // ambiguo: non si conta
    return k;
  };
}

/** Quante volte compare ogni antenato (escluso il cavallo), e da che lato.
 *  23/11/2026: si conta lo STESSO cavallo, non lo stesso nome. In CHICCA ROSS
 *  il LEMON DRA antenato di DANEA (1974) non e' il LEMON DRA del 1986 nonno
 *  paterno: il server lo segna come omonimo e qui non si somma. */
export function antenatiRipetuti(root: PedigreeNode, maxGen: number) {
  const conta = new Map<string, { n: number; padre: number; madre: number; gens: number[] }>();
  const chiave = chiavi(root, maxGen);
  const visita = (x: PedigreeNode | null, g: number, lato: "padre" | "madre" | null) => {
    if (!x || g > maxGen) return;
    const k = g > 0 ? chiave(x) : null;
    if (k) {
      const c = conta.get(k) ?? { n: 0, padre: 0, madre: 0, gens: [] };
      c.n++; if (lato) c[lato]++; c.gens.push(g); conta.set(k, c);
    }
    visita(x.sire, g + 1, lato ?? "padre");
    visita(x.dam, g + 1, lato ?? "madre");
  };
  visita(root, 0, null);
  const rip = Array.from(conta.entries()).filter(([, c]) => c.n >= 2)
    .sort((a, b) => Math.min(...a[1].gens) - Math.min(...b[1].gens) || b[1].n - a[1].n);
  const colore = new Map<string, string>();
  rip.forEach(([k], i) => colore.set(k, COLORI_RIPETUTI[i % COLORI_RIPETUTI.length]));
  return { rip, colore, chiave };
}

/** La linea maschile: padre, padre del padre... */
function lineaMaschile(x: PedigreeNode | null, max = 6): PedigreeNode[] {
  const out: PedigreeNode[] = [];
  while (x && out.length < max) { out.push(x); x = x.sire; }
  return out;
}

const GEN_TITOLI = ["Cavallo", "Genitori", "Nonni", "Bisnonni", "Trisavoli", "5ª generazione"];

/** Le generazioni in colonne: per ogni casella prima il padre, poi la madre. */
export function righeGenerazioni(root: PedigreeNode, maxGen: number): (PedigreeNode | null)[][] {
  const righe: (PedigreeNode | null)[][] = [];
  let att: (PedigreeNode | null)[] = [root];
  for (let g = 0; g <= maxGen; g++) {
    righe.push(att);
    if (g < maxGen) att = att.flatMap(n => [n?.sire ?? null, n?.dam ?? null]);
  }
  return righe;
}

/** Voto in una posizione fissa (prima atleta, poi riproduttore), coi colori del
 *  sito; se manca resta un trattino, cosi' i voti si leggono in colonna. */
function Bollino({ grado, titolo, piccolo, storico = false }: { grado: string | null; titolo: string; piccolo: boolean; storico?: boolean }) {
  return (
    <span title={grado ? titolo : "Voto non disponibile"}
      style={{ display: "inline-flex", alignItems: "center", gap: 1, width: piccolo ? 28 : 38, flexShrink: 0, whiteSpace: "nowrap" }}>
      {grado ? (
        <span className={`grade-badge grade-${grado}`}
          style={{ fontSize: piccolo ? 9 : 10.5, padding: piccolo ? "0 3px" : "0 5px", minWidth: piccolo ? 18 : 26, lineHeight: piccolo ? "13px" : "16px", fontWeight: 800, textAlign: "center" }}>
          {grado}
        </span>
      ) : (
        <span style={{ display: "inline-block", minWidth: piccolo ? 18 : 26, textAlign: "center", fontSize: piccolo ? 9 : 10.5, color: "hsl(210 8% 32%)", lineHeight: piccolo ? "13px" : "16px" }}>–</span>
      )}
      {storico && grado && <span style={{ fontSize: piccolo ? 7 : 8, color: "hsl(210 8% 50%)", alignSelf: "flex-start" }}>st</span>}
    </span>
  );
}

/** I voti di un antenato: dalle corse (atleta) e dai figli (stallone o fattrice). */
function votiDi(node: PedigreeNode) {
  const v = node.voti;
  const atleta = v?.atleta ?? null;
  const ripr = node.sex === "F" ? (v?.fattrice ?? null) : (v?.stallone ?? v?.fattrice ?? null);
  const storico = node.sex === "F" ? !!v?.fattrice_storica : !!(v?.stallone_storico || (!v?.stallone && v?.fattrice_storica));
  return { atleta, ripr, storico };
}
const ORDINE_VOTI = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const migliore = (a: string | null, b: string | null) =>
  [a, b].filter(Boolean).sort((x, y) => ORDINE_VOTI.indexOf(x!) - ORDINE_VOTI.indexOf(y!))[0] ?? null;

function Casella({ node, gen, hovered, onHover, colore, volte, scelto, onScegli }: {
  node: PedigreeNode | null; gen: number; maxGen: number;
  hovered: string | null; onHover: (n: string | null) => void;
  colore?: string; volte?: number; scelto: boolean; onScegli: (n: PedigreeNode) => void;
}) {
  const piccolo = gen >= 4;
  if (!node) {
    return <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "hsl(210 8% 26%)", borderRadius: 8, border: "1px dashed hsl(220 10% 18%)" }}>—</div>;
  }
  const maschio = node.sex === "M";
  const om = !!node.omonimo;
  const evidenziato = scelto || (!om && !!(hovered && node.name && node.name.toUpperCase() === hovered.toUpperCase()));
  const bordo = evidenziato ? "hsl(25 85% 58%)" : "hsl(220 10% 22%)";
  const { atleta, ripr, storico } = votiDi(node);
  const rec = node.record ? formatRecord(node.record) : null;
  const nomeSize = gen === 0 ? 14 : gen >= 4 ? 10.5 : gen === 3 ? 11.5 : 12.5;
  return (
    <button type="button"
      onClick={() => onScegli(node)}
      onMouseEnter={() => node.name && !om && onHover(node.name)}
      onMouseLeave={() => onHover(null)}
      title={om ? "Omonimo: stesso nome di un cavallo dell'archivio, ma è un altro cavallo" : "Tocca per i dettagli"}
      style={{
        all: "unset", cursor: "pointer", boxSizing: "border-box",
        width: "100%", minWidth: 0, height: "100%", overflow: "hidden",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: piccolo ? 1 : 4,
        padding: piccolo ? "2px 6px" : gen === 0 ? "10px 12px" : "6px 9px",
        borderRadius: 8,
        background: evidenziato ? "hsl(25 45% 14%)" : om ? "hsl(220 8% 12%)" : "hsl(220 14% 11%)",
        border: `1px solid ${evidenziato ? bordo : "hsl(220 10% 20%)"}`,
        borderLeft: colore && !evidenziato ? `${piccolo ? 3 : 4}px solid ${colore}` : `1px ${om ? "dashed" : "solid"} ${bordo}`,
        boxShadow: evidenziato ? "0 2px 12px hsl(25 85% 58% / .25)" : "none",
      }}>
      <span style={{ display: "flex", alignItems: "center", gap: piccolo ? 3 : 5, minWidth: 0 }}>
        {!om && (
          <span style={{ flexShrink: 0, display: "inline-flex", fontSize: piccolo ? 9 : 11, lineHeight: 1 }}>
            <BandieraCavallo nome={node.name} paese={node.country} ignoto_se_vuoto />
          </span>
        )}
        <span style={{ fontSize: nomeSize, fontWeight: 700, color: om ? "hsl(210 8% 60%)" : maschio ? "hsl(212 60% 82%)" : "hsl(330 55% 84%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {node.name}
        </span>
        {colore && (
          <span className="tabular" title={`Compare ${volte} volte nell'albero`}
            style={{ flexShrink: 0, fontSize: piccolo ? 8.5 : 9.5, fontWeight: 800, color: "hsl(220 15% 10%)", background: colore, borderRadius: 999, padding: "0 4px", lineHeight: piccolo ? "12px" : "14px" }}>
            ×{volte}
          </span>
        )}
      </span>
      {gen <= 2 && node.birth_year ? (
        <span className="tabular" style={{ fontSize: 10, lineHeight: "11px", color: "hsl(210 8% 46%)", whiteSpace: "nowrap", marginTop: -2 }}>
          nato nel {node.birth_year}
        </span>
      ) : null}
      <span style={{ display: "flex", alignItems: "center", gap: piccolo ? 4 : 7, minWidth: 0, overflow: "hidden" }}>
        {om ? <span style={{ fontSize: piccolo ? 8.5 : 9.5, color: "hsl(210 8% 55%)", whiteSpace: "nowrap" }}>omonimo</span> : <>
          <Bollino grado={atleta} piccolo={piccolo} titolo={`Voto da atleta (dalle sue corse): ${atleta}`} />
          <Bollino grado={ripr} piccolo={piccolo} storico={storico}
            titolo={`Voto da ${maschio ? "stallone" : "fattrice"} (dai figli${storico ? " nati prima del 2012, scala storica" : ""}): ${ripr}`} />
          {rec && rec !== "—" && <span className="tabular" title="Miglior tempo al km in carriera"
            style={{ fontSize: piccolo ? 9 : 10.5, color: "hsl(183 55% 62%)", whiteSpace: "nowrap", marginLeft: "auto", flexShrink: 0 }}>{rec}</span>}
        </>}
      </span>
    </button>
  );
}

/** Il riquadro con tutto di un antenato, sopra l'albero. */
function DettaglioAntenato({ node, volte, onChiudi }: { node: PedigreeNode; volte?: number; onChiudi: () => void }) {
  const { atleta, ripr, storico } = votiDi(node);
  const rec = node.record ? formatRecord(node.record) : null;
  const maschio = node.sex === "M";
  const euro = (x?: number | null) => (x ? `€ ${Math.round(x).toLocaleString("it-IT")}` : "—");
  const cella = (t: string, v: ReactNode, sotto?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "hsl(210 8% 46%)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "hsl(210 10% 90%)", marginTop: 2 }}>{v}</div>
      {sotto && <div style={{ fontSize: 11, color: "hsl(210 8% 50%)" }}>{sotto}</div>}
    </div>
  );
  return (
    <div className="pannello" data-testid="dettaglio-antenato" style={{ padding: "12px 14px", marginBottom: 12, borderColor: "hsl(25 70% 40% / .6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: maschio ? "hsl(212 80% 70%)" : "hsl(330 70% 75%)" }}>{node.name}</span>
        <span style={{ fontSize: 12, color: "hsl(210 8% 52%)" }}>
          {node.birth_year ?? ""} {node.country ? <BandieraCavallo nome={node.name} paese={node.country} ignoto_se_vuoto /> : null}
          {node.sire?.name ? ` · ${node.sire.name} × ${node.dam?.name ?? "?"}` : ""}
        </span>
        <button type="button" onClick={onChiudi} aria-label="Chiudi" style={{ marginLeft: "auto", background: "none", border: "none", color: "hsl(210 8% 55%)", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>
      {node.omonimo ? (
        <div style={{ fontSize: 12.5, color: "hsl(210 8% 65%)" }}>
          Omonimo: nell'archivio c'è un altro {node.name}{node.omonimo_anno ? ` (nato nel ${node.omonimo_anno})` : ""}; questo antenato non ha una scheda.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
            {cella("Voto dalle corse", atleta ? <span className={`grade-badge grade-${atleta}`} style={{ fontSize: 13, padding: "1px 8px" }}>{atleta}</span> : "—", "atleta")}
            {cella(maschio ? "Voto da stallone" : "Voto da fattrice", ripr ? <span className={`grade-badge grade-${ripr}`} style={{ fontSize: 13, padding: "1px 8px" }}>{ripr}</span> : "—", ripr ? (storico ? "dai figli, scala storica" : "dai figli") : "pochi figli valutati")}
            {cella("Miglior km", rec && rec !== "—" ? rec : "—")}
            {cella("Corse", node.career_races ?? "—", node.career_wins != null && node.career_races ? `${node.career_wins} vinte` : undefined)}
            {cella("Guadagni", euro(node.career_earnings))}
            {volte ? cella("Nell'albero", `${volte} volte`) : null}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12.5 }}>
            <Link href={`/horse/${encodeURIComponent(node.name)}/${node.birth_year ?? 0}`}><a style={{ color: "hsl(183 70% 60%)", fontWeight: 700 }}>Apri la scheda</a></Link>
            {ripr && <Link href={maschio ? `/stallion/${encodeURIComponent(node.name)}` : `/fattrice/${encodeURIComponent(node.name)}`}><a style={{ color: "hsl(183 70% 60%)", fontWeight: 700 }}>{maschio ? "Pagina dello stallone" : "Pagina della fattrice"}</a></Link>}
            <a href={`#/pedigree?nome=${encodeURIComponent(node.name)}`} onClick={() => setTimeout(() => window.location.reload(), 30)} style={{ color: "hsl(183 70% 60%)", fontWeight: 700 }}>Il suo pedigree</a>
          </div>
        </>
      )}
    </div>
  );
}

/** Sintesi sopra l'albero: quanti antenati forti per lato. */
function Sintesi({ root, generazioni }: { root: PedigreeNode; generazioni: number }) {
  const conta = (x: PedigreeNode | null, g: number, acc: { n: number; forti: number }) => {
    if (!x || g > generazioni) return acc;
    if (g > 0 && !x.omonimo) {
      acc.n++;
      const { atleta, ripr } = votiDi(x);
      const m = migliore(atleta, ripr);
      if (m && ORDINE_VOTI.indexOf(m) <= 2) acc.forti++;
    }
    conta(x.sire, g + 1, acc); conta(x.dam, g + 1, acc);
    return acc;
  };
  const p = conta(root.sire, 1, { n: 0, forti: 0 }), m = conta(root.dam, 1, { n: 0, forti: 0 });
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: "hsl(210 8% 62%)", marginBottom: 10 }}>
      <span>Antenati con voto S o più: <strong style={{ color: "hsl(212 80% 70%)" }}>lato padre {p.forti} su {p.n}</strong> · <strong style={{ color: "hsl(330 70% 75%)" }}>lato madre {m.forti} su {m.n}</strong></span>
      <span style={{ color: "hsl(210 8% 46%)" }}>Tocca un nome per i dettagli</span>
    </div>
  );
}

export default function AlberoPedigree({ root, generazioni, hovered = null, onHover = () => {} }: {
  root: PedigreeNode; generazioni: number;
  hovered?: string | null; onHover?: (n: string | null) => void;
}) {
  const righe = righeGenerazioni(root, generazioni);
  const { rip, colore, chiave } = antenatiRipetuti(root, generazioni);
  const GAP = 18;
  const [scelto, setScelto] = useState<PedigreeNode | null>(null);
  // 24/11/2026: griglia vera invece di colonne indipendenti. Ogni casella
  // occupa esattamente le righe dei suoi antenati (2^(ultima-gen) righe), quindi
  // il padre sta sempre a meta' fra i suoi due genitori e le famiglie restano
  // allineate anche quando una casella ha piu' voti o etichette. Le caselle di
  // una stessa generazione hanno tutte la stessa altezza e il testo che non ci
  // sta si accorcia con i puntini invece di allargarle.
  const riga = generazioni >= 5 ? 36 : generazioni === 4 ? 44 : generazioni === 3 ? 58 : 80;
  const righeTot = Math.pow(2, generazioni);
  const altezzaCasella = (g: number) => {
    const spazio = Math.pow(2, generazioni - g) * riga - 4;
    return Math.min(spazio, g === 0 ? 96 : g === 1 ? 76 : g === 2 ? 64 : 52);
  };
  const colonne = righe.map((_, g) => g === 0 ? (generazioni <= 3 ? "minmax(120px, 0.9fr)" : "165px") : g >= 4 ? "minmax(125px, 1fr)" : "minmax(130px, 1fr)").join(" ");
  const larghezzaMin = generazioni >= 5 ? 1080 : generazioni === 4 ? 940 : generazioni === 3 ? 700 : 520;
  return (
    <div>
      <Sintesi root={root} generazioni={generazioni} />
      {scelto && <DettaglioAntenato node={scelto} volte={rip.find(([k]) => k === chiave(scelto))?.[1].n} onChiudi={() => setScelto(null)} />}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: larghezzaMin }}>
          <div style={{ display: "grid", gridTemplateColumns: colonne, columnGap: GAP, marginBottom: 8 }}>
            {righe.map((_, g) => (
              <div key={g} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "hsl(210 8% 40%)", textAlign: "center", whiteSpace: "nowrap" }}>
                {GEN_TITOLI[g] || `${g}ª gen.`}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: colonne, gridTemplateRows: `repeat(${righeTot}, ${riga}px)`, columnGap: GAP }}>
            {/* Le due fasce: lato del padre sopra, lato della madre sotto. */}
            {generazioni >= 1 && [0, 1].map(lato => (
              <div key={`fascia-${lato}`} aria-hidden style={{
                gridColumn: `2 / ${generazioni + 2}`, gridRow: `${lato * righeTot / 2 + 1} / span ${righeTot / 2}`,
                margin: lato === 0 ? "0 -6px 3px -6px" : "3px -6px 0 -6px", borderRadius: 12,
                background: lato === 0 ? "hsl(212 60% 50% / .07)" : "hsl(330 55% 55% / .07)",
                border: `1px solid ${lato === 0 ? "hsl(212 60% 50% / .18)" : "hsl(330 55% 55% / .18)"}`,
              }} />
            ))}
            {generazioni >= 1 && [0, 1].map(lato => (
              <div key={`nome-fascia-${lato}`} style={{
                gridColumn: 1, gridRow: `${lato * righeTot / 2 + 1} / span ${righeTot / 2}`,
                display: "flex", alignItems: lato === 0 ? "flex-start" : "flex-end", justifyContent: "flex-end",
                padding: lato === 0 ? "4px 2px 0 0" : "0 2px 4px 0",
                fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                color: lato === 0 ? "hsl(212 70% 68%)" : "hsl(330 60% 74%)",
              }}>{lato === 0 ? "Lato padre →" : "Lato madre →"}</div>
            ))}
            {righe.map((col, g) => col.map((n, i) => {
              const span = Math.pow(2, generazioni - g);
              const figli = g < generazioni && !!n && !!(n.sire || n.dam);
              const linea = "hsl(220 10% 34%)";
              return (
                <div key={`${g}-${i}`} style={{ gridColumn: g + 1, gridRow: `${i * span + 1} / span ${span}`, display: "flex", alignItems: "center", minWidth: 0, minHeight: 0, position: "relative", zIndex: 1 }}>
                  {/* Linee che uniscono ogni cavallo a padre e madre. */}
                  {g > 0 && n && <>
                    <span aria-hidden style={{ position: "absolute", left: -GAP / 2, width: GAP / 2, top: "50%", borderTop: `1px solid ${linea}` }} />
                    <span aria-hidden style={{ position: "absolute", left: -GAP / 2, top: i % 2 === 0 ? "50%" : 0, height: "50%", borderLeft: `1px solid ${linea}` }} />
                  </>}
                  {figli && <span aria-hidden style={{ position: "absolute", right: -GAP / 2, width: GAP / 2, top: "50%", borderTop: `1px solid ${linea}` }} />}
                  <div style={{ width: "100%", height: altezzaCasella(g), display: "flex", minWidth: 0 }}>
                    <Casella node={n} gen={g} maxGen={generazioni} hovered={hovered} onHover={onHover}
                      colore={n && g > 0 ? colore.get(chiave(n) ?? "") : undefined}
                      volte={n && g > 0 ? rip.find(([k]) => k === chiave(n))?.[1].n : undefined}
                      scelto={!!n && scelto === n} onScegli={x => setScelto(scelto === x ? null : x)} />
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "hsl(210 8% 48%)", flexWrap: "wrap", alignItems: "center" }}>
        <span>Primo voto = da <b style={{ color: "hsl(210 8% 70%)" }}>atleta</b> (dalle sue corse) · secondo = da <b style={{ color: "hsl(210 8% 70%)" }}>stallone o fattrice</b> (dai figli) · «st» = scala storica, figli nati prima del 2012 · – = non disponibile</span>
        <span><span style={{ color: "hsl(183 55% 62%)" }}>1.11.2</span> = miglior km in carriera</span>
        <span>Nome azzurro = maschio, rosa = femmina · bordo colorato e ×N = antenato ripetuto</span>
      </div>
      <LineeERipetuti root={root} rip={rip} colore={colore} chiave={chiave} hovered={hovered} onHover={onHover} />
    </div>
  );
}

/** Linee maschili e antenati ripetuti, sotto l'albero (23/11/2026). */
function LineeERipetuti({ root, rip, colore, chiave, hovered, onHover }: {
  root: PedigreeNode; rip: [string, { n: number; padre: number; madre: number; gens: number[] }][];
  colore: Map<string, string>; chiave: (x: PedigreeNode) => string | null; hovered: string | null; onHover: (n: string | null) => void;
}) {
  const paterna = lineaMaschile(root.sire);
  const materna = lineaMaschile(root.dam?.sire ?? null);
  if (!paterna.length && !materna.length && !rip.length) return null;
  const nodo = (x: PedigreeNode, i: number, arr: PedigreeNode[]) => {
    const c = colore.get(chiave(x) ?? "");
    if (x.omonimo) return (
      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span title="Omonimo: stesso nome di un altro cavallo dell'archivio" style={{ color: "hsl(210 8% 62%)", fontStyle: "italic", whiteSpace: "nowrap" }}>{x.name} (omonimo)</span>
        {i < arr.length - 1 && <span style={{ color: "hsl(210 8% 40%)" }}>←</span>}
      </span>
    );
    return (
      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link href={`/horse/${encodeURIComponent(x.name)}/${x.birth_year ?? 0}`}>
          <a onMouseEnter={() => onHover(x.name)} onMouseLeave={() => onHover(null)}
            style={{ color: hovered?.toUpperCase() === x.name.toUpperCase() ? "hsl(25 85% 65%)" : "hsl(210 10% 86%)", fontWeight: i === 0 ? 800 : 600, textDecoration: "none",
                     borderBottom: c ? `2px solid ${c}` : "none", whiteSpace: "nowrap" }}>
            {x.name}{x.birth_year ? <span style={{ color: "hsl(210 8% 48%)", fontWeight: 400 }}> {x.birth_year}</span> : null}
          </a>
        </Link>
        {i < arr.length - 1 && <span style={{ color: "hsl(210 8% 40%)" }}>←</span>}
      </span>
    );
  };
  const box: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 18%)", minWidth: 0 };
  const tit: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "hsl(210 8% 55%)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 10, marginTop: 14 }} data-testid="linee-ripetuti">
      {(paterna.length > 0 || materna.length > 0) && (
        <div style={box}>
          <div style={tit}>Linee maschili</div>
          {paterna.length > 0 && <div style={{ fontSize: 12.5, lineHeight: 1.7, display: "flex", flexWrap: "wrap", gap: "0 6px", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "hsl(212 70% 65%)", marginRight: 2 }}>Dal padre:</span>{paterna.map(nodo)}
          </div>}
          {materna.length > 0 && <div style={{ fontSize: 12.5, lineHeight: 1.7, display: "flex", flexWrap: "wrap", gap: "0 6px", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "hsl(330 60% 70%)", marginRight: 2 }}>Dal padre della madre:</span>{materna.map(nodo)}
          </div>}
          <div style={{ fontSize: 11, color: "hsl(210 8% 48%)", marginTop: 6 }}>
            La linea maschile è la catena padre → padre del padre → … fino a dove arriva l'albero.
          </div>
        </div>
      )}
      {rip.length > 0 && (
        <div style={box}>
          <div style={tit}>Antenati ripetuti</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rip.slice(0, 10).map(([k, c]) => (
              <div key={k} onMouseEnter={() => onHover(k.split("|")[0])} onMouseLeave={() => onHover(null)}
                style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, cursor: "default" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colore.get(k), flexShrink: 0, alignSelf: "center" }} />
                <span style={{ fontWeight: 700, color: hovered?.toUpperCase() === k.split("|")[0] ? "hsl(25 85% 65%)" : "hsl(210 10% 86%)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.split("|")[0]}{k.includes("|") ? ` (${k.split("|")[1]})` : ""}</span>
                <span className="tabular" style={{ color: "hsl(210 8% 55%)", fontSize: 11.5, whiteSpace: "nowrap", marginLeft: "auto" }}>
                  {c.n} volte · {c.padre > 0 && c.madre > 0 ? `${c.padre} dal padre, ${c.madre} dalla madre` : c.padre > 0 ? "solo dal padre" : "solo dalla madre"}
                  {" "}· gen. {Array.from(new Set(c.gens)).sort().join(", ")}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "hsl(210 8% 48%)", marginTop: 6 }}>
            Comparire sia dal padre sia dalla madre è consanguineità; più vicina è la generazione, più conta.
          </div>
        </div>
      )}
    </div>
  );
}

/** L'albero di un cavallo, letto dal server: per la scheda del cavallo. */
export function AlberoPedigreeCavallo({ nome, generazioni = 5 }: { nome: string; generazioni?: number }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<{ horse: PedigreeNode }>({
    queryKey: ["/api/pedigree", nome.toUpperCase()],
    queryFn: () => apiRequest("GET", `/api/pedigree/${encodeURIComponent(nome.toUpperCase())}`).then(r => {
      if (!r.ok) throw new Error("Non trovato");
      return r.json();
    }),
    retry: false,
    staleTime: 120000,
  });
  if (isLoading) return <CavalloCaricamento label="Costruzione dell'albero" />;
  if (error || !data?.horse) return <div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0" }}>Albero non disponibile.</div>;
  return <AlberoPedigree root={data.horse} generazioni={generazioni} hovered={hovered} onHover={setHovered} />;
}
