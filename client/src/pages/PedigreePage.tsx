import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import GradeBadge from "../components/GradeBadge";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { Dna, Search } from "lucide-react";

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
}

interface PedigreeData {
  horse: PedigreeNode;
  rating: { grade: string; score: number; career_earnings: number; career_races: number; career_wins: number; win_rate: number } | null;
  inbreeding_coefficient: number;
  common_ancestors: { name: string; contribution: number }[];
}

// Render a pedigree node as a small card
function PedNode({ node, gen, maxGen, hovered, onHover }: { node: PedigreeNode | null; gen: number; maxGen: number; hovered: string | null; onHover: (name: string | null) => void }) {
  if (!node || gen > maxGen) {
    return gen <= maxGen ? <div style={{ minWidth: "110px", padding: "8px", textAlign: "center", fontSize: "11px", color: "hsl(210 8% 25%)" }}>—</div> : null;
  }

  const isStallion = node.sex === "M";
  const isHighlighted = hovered && node.name && node.name.toUpperCase() === hovered.toUpperCase();

  return (
    <div
      onMouseEnter={() => node.name && onHover(node.name)}
      onMouseLeave={() => onHover(null)}
      style={{
        minWidth: "110px",
        maxWidth: "130px",
        padding: "8px 10px",
        borderRadius: "8px",
        background: node.missing ? "hsl(220 10% 8%)" : isHighlighted ? "hsl(183 60% 15%)" : "hsl(220 12% 12%)",
        border: `1.5px solid ${
          isHighlighted ? "hsl(183 100% 55%)" :
          node.missing ? "hsl(220 10% 14%)" :
          isStallion ? "hsl(183 60% 25%)" : "hsl(300 40% 25%)"
        }`,
        textAlign: "center",
        transition: "all 0.2s ease",
        transform: isHighlighted ? "scale(1.1)" : "scale(1)",
        boxShadow: isHighlighted ? "0 2px 12px hsl(183 100% 55% / 0.3)" : "none",
        cursor: node.missing ? "default" : "pointer",
        position: "relative",
      }}
    >
      {node.name && !node.missing ? (
        <Link href={isStallion ? `/stallion/${encodeURIComponent(node.name)}` : `/horse/${encodeURIComponent(node.name)}/0`}>
          <a style={{
            fontSize: "12px", fontWeight: 700, color: "hsl(210 10% 85%)", textDecoration: "none",
            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "hsl(183 80% 62%)"}
            onMouseLeave={e => e.currentTarget.style.color = "hsl(210 10% 85%)"}
          >
            {node.name}
          </a>
        </Link>
      ) : (
        <span style={{ fontSize: "12px", color: "hsl(210 8% 30%)" }}>{node.name || "—"}</span>
      )}
      {node.birth_year && (
        <div style={{ fontSize: "10px", color: "hsl(210 8% 42%)", marginTop: "2px" }}>
          {node.birth_year}{node.country ? ` · ${node.country}` : ""}
        </div>
      )}
      {node.career_earnings != null && node.career_earnings > 0 && (
        <div className="tabular" style={{ fontSize: "10px", color: "hsl(51 70% 50%)", marginTop: "2px" }}>
          €{(node.career_earnings / 1000).toFixed(0)}k
        </div>
      )}
      {node.sex && (
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

// Render a generation row
function GenRow({ nodes, gen, maxGen, hovered, onHover }: { nodes: (PedigreeNode | null)[]; gen: number; maxGen: number; hovered: string | null; onHover: (name: string | null) => void }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      gap: gen === 0 ? "0" : gen === 1 ? "16px" : gen === 2 ? "6px" : "3px",
      marginBottom: gen === 0 ? "16px" : "8px",
      transition: "gap 0.3s ease",
    }}>
      {nodes.map((node, i) => (
        <PedNode key={i} node={node} gen={gen} maxGen={maxGen} hovered={hovered} onHover={onHover} />
      ))}
    </div>
  );
}

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

  const maxGen = 4;
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
          Albero genealogico a 4 generazioni con coefficiente di inbreeding.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); }} style={{
        background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", padding: "16px 20px", marginBottom: "24px",
        display: "flex", gap: "12px", alignItems: "center",
        transition: "border-color 0.3s",
      }}>
        <Dna size={16} style={{ color: "hsl(210 8% 48%)", flexShrink: 0 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value.toUpperCase())}
          placeholder="Nome cavallo (es. VARENNE)..."
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: "hsl(210 10% 88%)", fontSize: "14px", letterSpacing: "0.04em",
          }}
        />
        <Search size={15} style={{ color: "hsl(210 8% 40%)" }} />
      </form>

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
              <div style={{ fontSize: "18px", fontWeight: 800, color: "hsl(210 10% 90%)" }}>
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

          {/* Pedigree tree */}
          <div style={{
            background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", padding: "24px 16px", overflowX: "auto",
          }}>
            <div style={{ minWidth: "900px" }}>
              {genRows.map((row, i) => (
                <GenRow
                  key={i}
                  nodes={row}
                  gen={i}
                  maxGen={maxGen}
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
