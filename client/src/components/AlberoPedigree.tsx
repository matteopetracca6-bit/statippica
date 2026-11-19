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
  voti?: VotiNodo;
}

const BLU = "hsl(212 85% 62%)";
const ROSA = "hsl(330 75% 68%)";
const BLU_FONDO = "hsl(212 45% 12%)";
const ROSA_FONDO = "hsl(330 30% 12%)";

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

function Casella({ node, gen, maxGen, hovered, onHover }: {
  node: PedigreeNode | null; gen: number; maxGen: number;
  hovered: string | null; onHover: (n: string | null) => void;
}) {
  const compatto = gen >= 4;
  if (!node) {
    return <div style={{ flex: 1, minHeight: compatto ? 24 : 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "hsl(210 8% 24%)" }}>—</div>;
  }
  const maschio = node.sex === "M";
  const evidenziato = !!(hovered && node.name && node.name.toUpperCase() === hovered.toUpperCase());
  const bordo = evidenziato ? "hsl(25 85% 58%)" : maschio ? BLU : ROSA;
  const v = node.voti;
  const voti: { etichetta: string; grado: string; href?: string }[] = [];
  if (v?.atleta) voti.push({ etichetta: "Atleta", grado: v.atleta });
  if (v?.stallone) voti.push({ etichetta: "Stallone", grado: v.stallone, href: `/stallion/${encodeURIComponent(node.name)}` });
  if (v?.fattrice) voti.push({ etichetta: "Fattrice", grado: v.fattrice, href: `/fattrice/${encodeURIComponent(node.name)}` });
  const nomeSize = gen === 0 ? 13.5 : gen >= 4 ? 10 : gen === 3 ? 11 : 12;
  const linkCavallo = `/horse/${encodeURIComponent(node.name)}/${node.birth_year ?? 0}`;

  return (
    <div
      onMouseEnter={() => node.name && onHover(node.name)}
      onMouseLeave={() => onHover(null)}
      style={{
        width: "100%", minWidth: 0,
        padding: compatto ? "2px 6px" : gen === 0 ? "10px 11px" : "6px 9px",
        borderRadius: 8,
        background: evidenziato ? "hsl(25 50% 14%)" : maschio ? BLU_FONDO : ROSA_FONDO,
        border: `1.5px solid ${bordo}`,
        borderLeftWidth: compatto ? 1.5 : 4,
        boxShadow: evidenziato ? "0 2px 12px hsl(25 85% 58% / .3)" : "none",
        transition: "background .15s, box-shadow .15s",
        opacity: node.missing && !voti.length ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
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
  // Altezza di una riga dell'ultima colonna: deve contenere nome e voti.
  const riga = generazioni >= 5 ? 34 : generazioni === 4 ? 44 : 62;
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "stretch",
          minWidth: generazioni >= 5 ? 980 : generazioni === 4 ? 800 : 620,
          height: Math.max(380, Math.pow(2, generazioni) * riga),
        }}>
          {righe.map((col, g) => (
            <div key={g} style={{ flex: g === 0 ? "0 0 165px" : g >= 4 ? "1 1 125px" : "1 1 150px", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "hsl(210 8% 40%)", textAlign: "center", marginBottom: 8, whiteSpace: "nowrap" }}>
                {GEN_TITOLI[g] || `${g}ª gen.`}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: g >= 4 ? 2 : 4 }}>
                {col.map((n, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}>
                    <Casella node={n} gen={g} maxGen={generazioni} hovered={hovered} onHover={onHover} />
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
        <span>Atleta = voto dalle sue corse · Stallone / Fattrice = voto dai figli</span>
        <span>Clicca un nome per la scheda, un voto da riproduttore per la sua pagina</span>
      </div>
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
  if (isLoading) return <div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0" }}>Costruzione dell'albero…</div>;
  if (error || !data?.horse) return <div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0" }}>Albero non disponibile.</div>;
  return <AlberoPedigree root={data.horse} generazioni={generazioni} hovered={hovered} onHover={setHovered} />;
}
