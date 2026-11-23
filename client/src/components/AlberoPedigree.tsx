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
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "./BandieraCavallo";
import CavalloCaricamento from "./CavalloCaricamento";

export interface VotiNodo { atleta: string | null; stallone: string | null; fattrice: string | null }

export interface PedigreeNode {
  name: string;
  birth_year: number | null;
  sex: string | null;
  country: string | null;
  career_earnings: number | null;
  career_wins: number | null;
  career_races: number | null;
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

const BLU = "hsl(212 85% 62%)";
const ROSA = "hsl(330 75% 68%)";
const BLU_FONDO = "hsl(212 45% 12%)";
const ROSA_FONDO = "hsl(330 30% 12%)";

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

function Voto({ etichetta, grado, href, compatto }: { etichetta: string; grado: string; href?: string; compatto: boolean }) {
  const badge = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
      title={`Voto da ${etichetta.toLowerCase()}: ${grado}`}>
      <span style={{ fontSize: compatto ? 8.5 : 9.5, color: "hsl(210 8% 52%)", textTransform: compatto ? "none" : "uppercase", letterSpacing: compatto ? 0 : ".04em" }}>
        {compatto ? etichetta.slice(0, 3).toLowerCase() + "." : etichetta}
      </span>
      <span className={`grade-badge grade-${grado}`}
        style={{ fontSize: compatto ? 9 : 10, padding: compatto ? "0 4px" : "1px 5px", minWidth: compatto ? 18 : 22, lineHeight: compatto ? "13px" : undefined }}>
        {grado}
      </span>
    </span>
  );
  return href ? <Link href={href}><a style={{ textDecoration: "none" }} onClick={e => e.stopPropagation()}>{badge}</a></Link> : badge;
}

function Casella({ node, gen, maxGen, hovered, onHover, colore, volte }: {
  node: PedigreeNode | null; gen: number; maxGen: number;
  hovered: string | null; onHover: (n: string | null) => void;
  colore?: string; volte?: number;
}) {
  const compatto = gen >= 4;
  if (!node) {
    return <div style={{ flex: 1, minHeight: compatto ? 24 : 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "hsl(210 8% 24%)" }}>—</div>;
  }
  const maschio = node.sex === "M";
  // Omonimo: stesso nome di un cavallo dell'archivio, ma e' un altro cavallo
  // (troppo vecchio per esserlo). Grigio, senza link alla scheda sbagliata.
  const om = !!node.omonimo;
  const spiegaOm = om
    ? `Non è il ${node.name}${node.omonimo_anno ? ` nato nel ${node.omonimo_anno}` : " dell'archivio"}: qui è un altro cavallo con lo stesso nome, ` +
      `antenato di un cavallo nato${node.anno_max ? ` entro il ${node.anno_max + 2}` : " prima"}. Non si conta fra gli antenati ripetuti.`
    : undefined;
  const evidenziato = !node.omonimo && !!(hovered && node.name && node.name.toUpperCase() === hovered.toUpperCase());
  const bordo = evidenziato ? "hsl(25 85% 58%)" : om ? "hsl(210 8% 38%)" : maschio ? BLU : ROSA;
  const v = node.voti;
  const voti: { etichetta: string; grado: string; href?: string }[] = [];
  if (v?.atleta) voti.push({ etichetta: "Atleta", grado: v.atleta });
  if (v?.stallone) voti.push({ etichetta: "Stallone", grado: v.stallone, href: `/stallion/${encodeURIComponent(node.name)}` });
  if (v?.fattrice) voti.push({ etichetta: "Fattrice", grado: v.fattrice, href: `/fattrice/${encodeURIComponent(node.name)}` });
  const nomeSize = gen === 0 ? 13.5 : gen >= 4 ? 10 : gen === 3 ? 11 : 12;
  const linkCavallo = `/horse/${encodeURIComponent(node.name)}/${node.birth_year ?? 0}`;

  return (
    <div
      onMouseEnter={() => node.name && !om && onHover(node.name)}
      onMouseLeave={() => onHover(null)}
      title={spiegaOm}
      style={{
        width: "100%", minWidth: 0,
        padding: compatto ? "2px 6px" : gen === 0 ? "10px 11px" : "6px 9px",
        borderRadius: 8,
        background: evidenziato ? "hsl(25 50% 14%)" : om ? "hsl(220 8% 13%)" : maschio ? BLU_FONDO : ROSA_FONDO,
        border: `1.5px solid ${bordo}`,
        borderLeftWidth: compatto ? 3 : 4,
        borderLeftColor: colore && !evidenziato ? colore : bordo,
        borderStyle: om ? "dashed" : "solid",
        boxShadow: evidenziato ? "0 2px 12px hsl(25 85% 58% / .3)" : "none",
        transition: "background .15s, box-shadow .15s",
        opacity: node.missing && !voti.length ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {om ? (
          <span style={{ fontSize: nomeSize, fontWeight: 700, color: "hsl(210 8% 62%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {node.name}
          </span>
        ) : (
          <Link href={linkCavallo}>
            <a style={{
              fontSize: nomeSize, fontWeight: 700, color: "hsl(210 10% 88%)", textDecoration: "none",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
            }}
              onMouseEnter={e => e.currentTarget.style.color = maschio ? BLU : ROSA}
              onMouseLeave={e => e.currentTarget.style.color = "hsl(210 10% 88%)"}>
              {node.name}
            </a>
          </Link>
        )}
        {om && (
          <span style={{ flexShrink: 0, fontSize: compatto ? 8.5 : 9.5, fontWeight: 700, color: "hsl(210 8% 70%)", border: "1px solid hsl(210 8% 40%)",
                         borderRadius: 999, padding: "0 5px", lineHeight: compatto ? "12px" : "14px", whiteSpace: "nowrap" }}>
            {compatto ? "omonimo" : "omonimo – altro cavallo"}
          </span>
        )}
        {colore && (
          <span title={`Compare ${volte} volte nell'albero`} className="tabular"
            style={{ flexShrink: 0, fontSize: compatto ? 8.5 : 9.5, fontWeight: 800, color: "hsl(220 15% 10%)", background: colore,
                     borderRadius: 999, padding: compatto ? "0 4px" : "0 5px", lineHeight: compatto ? "12px" : "14px", whiteSpace: "nowrap" }}>
            ×{volte}
          </span>
        )}
        {!compatto && node.birth_year && (
          <span style={{ fontSize: 10, color: "hsl(210 8% 48%)", whiteSpace: "nowrap", flexShrink: 0 }}>
            <BandieraCavallo nome={node.name} paese={node.country} ignoto_se_vuoto /> {node.birth_year}
          </span>
        )}
      </div>
      {voti.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: compatto ? 5 : 8, marginTop: compatto ? 1 : 4 }}>
          {voti.map(x => <Voto key={x.etichetta} {...x} compatto={compatto} />)}
        </div>
      )}
    </div>
  );
}

export default function AlberoPedigree({ root, generazioni, hovered = null, onHover = () => {} }: {
  root: PedigreeNode; generazioni: number;
  hovered?: string | null; onHover?: (n: string | null) => void;
}) {
  const righe = righeGenerazioni(root, generazioni);
  const { rip, colore, chiave } = antenatiRipetuti(root, generazioni);
  // Altezza di una riga dell'ultima colonna: deve contenere nome e voti.
  const riga = generazioni >= 5 ? 34 : generazioni === 4 ? 40 : generazioni === 3 ? 56 : 80;
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "stretch",
          minWidth: generazioni >= 5 ? 980 : generazioni === 4 ? 860 : generazioni === 3 ? 680 : 520,
          height: Math.max(generazioni <= 2 ? 300 : 380, Math.pow(2, generazioni) * riga),
        }}>
          {righe.map((col, g) => (
            <div key={g} style={{ flex: g === 0 ? "0 0 165px" : g >= 4 ? "1 1 125px" : "1 1 150px", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "hsl(210 8% 40%)", textAlign: "center", marginBottom: 8, whiteSpace: "nowrap" }}>
                {GEN_TITOLI[g] || `${g}ª gen.`}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: g >= 4 ? 2 : 4 }}>
                {col.map((n, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}>
                    <Casella node={n} gen={g} maxGen={generazioni} hovered={hovered} onHover={onHover}
                      colore={n && g > 0 ? colore.get(chiave(n) ?? "") : undefined}
                      volte={n && g > 0 ? rip.find(([k]) => k === chiave(n))?.[1].n : undefined} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "hsl(210 8% 48%)", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: BLU_FONDO, border: `1.5px solid ${BLU}` }} /> Maschio / stallone
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: ROSA_FONDO, border: `1.5px solid ${ROSA}` }} /> Femmina / fattrice
        </span>
        {rip.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, borderLeft: `4px solid ${COLORI_RIPETUTI[0]}`, border: "1.5px solid hsl(210 8% 35%)" }} /> Antenato che compare più volte (×N)
          </span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "hsl(220 8% 13%)", border: "1.5px dashed hsl(210 8% 38%)" }} /> Omonimo: stesso nome, altro cavallo
        </span>
        <span>Atleta = voto dalle sue corse · Stallone / Fattrice = voto dai figli</span>
        <span>Clicca un nome per la scheda, un voto da riproduttore per la sua pagina</span>
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
