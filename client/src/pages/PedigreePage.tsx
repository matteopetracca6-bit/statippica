import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { getFlag } from "@/lib/flags";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { Dna } from "lucide-react";
import NameSelect from "../components/NameSelect";
import InbreedingPanel from "../components/InbreedingPanel";

interface PedigreeNode {
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
}

interface PedigreeData {
  horse: PedigreeNode;
  rating: { grade: string; score: number; career_earnings: number; career_races: number; career_wins: number; win_rate: number } | null;
  inbreeding_coefficient: number;
  common_ancestors: { name: string; contribution: number }[];
  max_generations?: number;
  has_source_pedigree?: boolean;
}

// Render a pedigree node as a small card
function PedNode({ node, gen, maxGen, hovered, onHover }: { node: PedigreeNode | null; gen: number; maxGen: number; hovered: string | null; onHover: (name: string | null) => void }) {
  // Piu' si va indietro nelle generazioni, piu' le caselle sono strette:
  // nella quinta ce ne sono trentadue in colonna.
  const compact = gen >= 4;
  const nameSize = gen >= 4 ? "10px" : gen === 3 ? "11px" : "12px";

  if (!node || gen > maxGen) {
    return gen <= maxGen
      ? <div style={{ flex: 1, minHeight: compact ? "22px" : "34px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "hsl(210 8% 24%)" }}>—</div>
      : null;
  }

  const isStallion = node.sex === "M";
  const isHighlighted = hovered && node.name && node.name.toUpperCase() === hovered.toUpperCase();

  return (
    <div
      onMouseEnter={() => node.name && onHover(node.name)}
      onMouseLeave={() => onHover(null)}
      style={{
        width: "100%",
        padding: compact ? "3px 6px" : "7px 9px",
        borderRadius: "8px",
        background: node.missing ? "hsl(220 10% 8%)" : isHighlighted ? "hsl(183 60% 15%)" : "hsl(220 12% 12%)",
        border: `1.5px solid ${
          isHighlighted ? "hsl(183 100% 55%)" :
          node.missing ? "hsl(220 10% 14%)" :
          isStallion ? "hsl(183 60% 25%)" : "hsl(300 40% 25%)"
        }`,
        textAlign: "center",
        transition: "all 0.2s ease",
        transform: isHighlighted ? "scale(1.06)" : "scale(1)",
        boxShadow: isHighlighted ? "0 2px 12px hsl(183 100% 55% / 0.3)" : "none",
        cursor: node.missing ? "default" : "pointer",
        position: "relative",
      }}
    >
      {node.name && !node.missing ? (
        <Link href={isStallion ? `/stallion/${encodeURIComponent(node.name)}` : `/horse/${encodeURIComponent(node.name)}/0`}>
          <a style={{
            fontSize: nameSize, fontWeight: 700, color: "hsl(210 10% 85%)", textDecoration: "none",
            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "hsl(183 80% 62%)"}
            onMouseLeave={e => e.currentTarget.style.color = "hsl(210 10% 85%)"}
          >
            {node.name}
          </a>
        </Link>
      ) : (
        <span style={{ fontSize: nameSize, fontWeight: 600, color: "hsl(210 8% 58%)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name || "—"}</span>
      )}
      {node.birth_year && !compact && (
        <div style={{ fontSize: "10px", color: "hsl(210 8% 42%)", marginTop: "2px" }}>
          {node.birth_year}{node.country ? ` · ${node.country}` : ""}
        </div>
      )}
      {node.career_earnings != null && node.career_earnings > 0 && !compact && (
        <div className="tabular" style={{ fontSize: "10px", color: "hsl(51 70% 50%)", marginTop: "2px" }}>
          €{(node.career_earnings / 1000).toFixed(0)}k
        </div>
      )}
      {node.sex && !compact && (
        <div style={{
          fontSize: "9px", marginTop: "3px", fontWeight: 700,
          color: node.sex === "M" ? "hsl(183 60% 55%)" : "hsl(300 40% 60%)",
        }}>
          {node.sex === "M" ? "♂ Stallone" : "♀ Fattrice"}
        </div>
      )}
      {/* Highlight indicator for common ancestors */}
      {isHighlighted && (
        <div style={{
          position: "absolute", top: "-6px", right: "-6px",
          width: "10px", height: "10px", borderRadius: "50%",
          background: "hsl(25 80% 55%)", border: "1.5px solid hsl(220 14% 8%)",
        }} />
      )}
    </div>
  );
}

/**
 * Una generazione = una colonna. Le caselle si dividono l'altezza in parti
 * uguali, cosi' il padre sta all'altezza dei suoi due genitori: e' il modo in
 * cui i pedigree si leggono di solito, e regge anche le trentadue caselle
 * della quinta generazione senza diventare una striscia illeggibile.
 */
function GenColumn({ nodes, gen, maxGen, hovered, onHover, title }: { nodes: (PedigreeNode | null)[]; gen: number; maxGen: number; hovered: string | null; onHover: (name: string | null) => void; title: string }) {
  return (
    <div style={{ flex: gen === 0 ? "0 0 150px" : gen >= 4 ? "1 1 105px" : "1 1 125px", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{
        fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em",
        color: "hsl(210 8% 38%)", textAlign: "center", marginBottom: "8px", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
      }}>{title}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: gen >= 4 ? "2px" : "4px" }}>
        {nodes.map((node, i) => (
          <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}>
            <PedNode node={node} gen={gen} maxGen={maxGen} hovered={hovered} onHover={onHover} />
          </div>
        ))}
      </div>
    </div>
  );
}

const GEN_TITLES = ["Soggetto", "Genitori", "Nonni", "Bisnonni", "Trisavoli", "5ª generazione"];

// Flatten tree into generation rows
function getGenerationRows(root: PedigreeNode, maxGen: number): (PedigreeNode | null)[][] {
  const rows: (PedigreeNode | null)[][] = [];
  let current: (PedigreeNode | null)[] = [root];
  for (let g = 0; g <= maxGen; g++) {
    rows.push(current);
    if (g < maxGen) {
      const next: (PedigreeNode | null)[] = [];
      for (const n of current) {
        next.push(n?.sire ?? null);
        next.push(n?.dam ?? null);
      }
      current = next;
    }
  }
  return rows;
}

export default function PedigreePage() {
  const [search, setSearch] = useState("");
  const [gens, setGens] = useState(5);
  const [hoveredAncestor, setHoveredAncestor] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PedigreeData>({
    queryKey: ["/api/pedigree", search],
    queryFn: () => apiRequest("GET", `/api/pedigree/${encodeURIComponent(search)}`).then(r => {
      if (!r.ok) throw new Error("Non trovato");
      return r.json();
    }),
    enabled: search.length >= 2,
    retry: false,
    staleTime: 120000,
  });

  const maxGen = gens;
  const genRows = useMemo(() => data ? getGenerationRows(data.horse, maxGen) : [], [data]);

  // Collect all ancestor names for highlighting
  const allNames = useMemo(() => {
    if (!data) return new Set<string>();
    const names = new Set<string>();
    function collect(node: PedigreeNode | null) {
      if (!node || !node.name || node.missing) return;
      names.add(node.name.toUpperCase());
      collect(node.sire);
      collect(node.dam);
    }
    collect(data.horse);
    return names;
  }, [data]);

  // Common ancestor names
  const commonNames = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.common_ancestors.map(a => a.name.toUpperCase()));
  }, [data]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 92%)", marginBottom: "4px" }}>
          Analisi Pedigree
        </h1>
        <p style={{ fontSize: "13px", color: "hsl(210 8% 50%)" }}>
          Albero genealogico completo fino a cinque generazioni, coefficiente di
          consanguineita' e incroci ripetuti, per qualunque cavallo in archivio.
        </p>
      </div>

      {/* Scelta del cavallo: tendina con ricerca, non piu' solo testo libero */}
      <div style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", padding: "16px 20px", marginBottom: "24px",
        display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <Dna size={16} style={{ color: "hsl(210 8% 48%)", flexShrink: 0, marginBottom: "12px" }} />
        <NameSelect
          label="Cavallo"
          value={search}
          onChange={n => setSearch(n.toUpperCase())}
          endpoint="/api/search/horse"
          placeholder="Scegli un cavallo dall'elenco o scrivi il nome"
        />
        <div>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(210 8% 50%)", marginBottom: "6px" }}>
            Generazioni
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[3, 4, 5].map(g => (
              <button
                key={g}
                onClick={() => setGens(g)}
                style={{
                  padding: "9px 14px", borderRadius: "8px", cursor: "pointer",
                  fontSize: "13px", fontWeight: 700,
                  background: gens === g ? "hsl(183 100% 45% / 0.16)" : "hsl(220 14% 11%)",
                  border: `1px solid ${gens === g ? "hsl(183 100% 45%)" : "hsl(220 12% 22%)"}`,
                  color: gens === g ? "hsl(183 80% 68%)" : "hsl(210 8% 58%)",
                }}
              >{g}</button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <TrottingHorseLoader label="Costruzione albero genealogico..." size={120} />}

      {error && search && !isLoading && (
        <div style={{
          background: "hsl(220 12% 10%)", border: "1px solid hsl(0 50% 35% / 0.4)",
          borderRadius: "12px", padding: "20px 22px",
          color: "hsl(0 62% 55%)", fontSize: "13px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          Cavallo "{search}" non trovato nel database.
        </div>
      )}

      {data && !isLoading && (
        <div className="fade-in">
          {/* Horse header */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(183 100% 38% / 0.25)",
            borderRadius: "12px", padding: "18px 22px", marginBottom: "16px",
            display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: "11px", color: "hsl(183 60% 45%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                Soggetto
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "hsl(210 10% 90%)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "20px" }}>{getFlag(data.horse.country, data.horse.name)}</span>
                {data.horse.name}
              </div>
              <div style={{ fontSize: "12px", color: "hsl(210 8% 52%)", marginTop: "3px" }}>
                {data.horse.birth_year || "—"} · {data.horse.sex === "M" ? "♂ Stallone" : data.horse.sex === "F" ? "♀ Fattrice" : "—"}
                {data.horse.country ? ` · ${data.horse.country}` : ""}
                {data.horse.career_races ? ` · ${data.horse.career_races} corse` : ""}
              </div>
            </div>
            {data.rating && (
              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginLeft: "auto" }}>
                {data.rating.grade && <GradeBadge grade={data.rating.grade} />}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Score</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(183 80% 58%)" }}>
                    {data.rating.score?.toFixed(1)}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Guadagni</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                    €{(data.rating.career_earnings / 1000).toFixed(0)}k
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Win rate</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(100 50% 55%)" }}>
                    {data.rating.win_rate?.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Inbreeding info */}
          <div style={{
            background: data.inbreeding_coefficient > 0 ? "hsl(25 40% 12%)" : "hsl(220 12% 10%)",
            border: data.inbreeding_coefficient > 0 ? "1px solid hsl(25 50% 30%)" : "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", padding: "16px 20px", marginBottom: "16px",
            display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap",
            transition: "all 0.3s",
          }}>
            <div>
              <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                Coefficiente di inbreeding
              </div>
              <div style={{
                fontSize: "26px", fontWeight: 800,
                color: data.inbreeding_coefficient > 5 ? "hsl(25 70% 55%)" : data.inbreeding_coefficient > 0 ? "hsl(25 50% 55%)" : "hsl(183 80% 55%)",
                transition: "color 0.3s",
              }}>
                {data.inbreeding_coefficient.toFixed(1)}%
              </div>
            </div>
            {data.common_ancestors.length > 0 && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  Antenati comuni — passa sopra per evidenziare nell'albero
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {data.common_ancestors.map(a => (
                    <span
                      key={a.name}
                      onMouseEnter={() => setHoveredAncestor(a.name)}
                      onMouseLeave={() => setHoveredAncestor(null)}
                      style={{
                        fontSize: "11px", padding: "3px 10px", borderRadius: "4px",
                        background: hoveredAncestor === a.name ? "hsl(25 60% 40%)" : "hsl(25 50% 35% / 0.15)",
                        border: `1px solid ${hoveredAncestor === a.name ? "hsl(25 70% 50%)" : "hsl(25 50% 35% / 0.3)"}`,
                        color: hoveredAncestor === a.name ? "hsl(25 80% 70%)" : "hsl(25 50% 60%)",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {a.name} · {(a.contribution * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Albero genealogico */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", padding: "20px 16px", overflowX: "auto",
          }}>
            <div style={{
              display: "flex", gap: "8px", alignItems: "stretch",
              minWidth: gens >= 5 ? "820px" : gens === 4 ? "700px" : "560px",
              height: `${Math.max(360, Math.pow(2, gens) * (gens >= 5 ? 26 : 34))}px`,
            }}>
              {genRows.map((col, i) => (
                <GenColumn
                  key={i}
                  nodes={col}
                  gen={i}
                  maxGen={maxGen}
                  title={GEN_TITLES[i] || `${i}ª gen.`}
                  hovered={hoveredAncestor}
                  onHover={setHoveredAncestor}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{
            display: "flex", gap: "16px", marginTop: "12px",
            fontSize: "11px", color: "hsl(210 8% 42%)", flexWrap: "wrap",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "hsl(183 60% 25%)", border: "1px solid hsl(183 60% 25%)" }} /> Linea paterna
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "hsl(300 40% 25%)", border: "1px solid hsl(300 40% 25%)" }} /> Linea materna
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "hsl(25 80% 55%)" }} /> Antenato comune
            </span>
            <span>Clicca su un nome per andare alla scheda</span>
          </div>

          {/* Consanguineita' e genealogia estesa della seconda fonte */}
          <div style={{ marginTop: "22px" }}>
            <InbreedingPanel horseName={data.horse.name} />
          </div>
        </div>
      )}

      {!search && !isLoading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "hsl(210 8% 38%)", fontSize: "14px" }}>
          Cerca un cavallo per visualizzare il suo pedigree.
        </div>
      )}
    </div>
  );
}
