import { useState } from "react";
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
function PedNode({ node, gen, maxGen }: { node: PedigreeNode | null; gen: number; maxGen: number }) {
  if (!node || gen > maxGen) {
    return gen <= maxGen ? <div style={{ minWidth: "120px", padding: "8px", textAlign: "center", fontSize: "11px", color: "hsl(210 8% 30%)" }}>—</div> : null;
  }

  const isSire = gen > 0; // all ancestors are from sire or dam line
  const isHorse = node.sex === "M" || node.sex === "F";
  const isStallion = node.sex === "M";

  return (
    <div style={{
      minWidth: "120px",
      padding: "8px 10px",
      borderRadius: "8px",
      background: node.missing ? "hsl(220 10% 8%)" : "hsl(220 12% 12%)",
      border: `1px solid ${node.missing ? "hsl(220 10% 14%)" : isStallion ? "hsl(183 60% 25%)" : "hsl(300 40% 25%)"} `,
      textAlign: "center",
    }}>
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
        <span style={{ fontSize: "12px", color: "hsl(210 8% 35%)" }}>{node.name || "—"}</span>
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
          fontSize: "9px", marginTop: "2px", fontWeight: 700,
          color: node.sex === "M" ? "hsl(183 60% 55%)" : "hsl(300 40% 60%)",
        }}>
          {node.sex === "M" ? "♂" : "♀"}
        </div>
      )}
    </div>
  );
}

// Render a generation row
function GenRow({ nodes, gen, maxGen }: { nodes: (PedigreeNode | null)[]; gen: number; maxGen: number }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      gap: gen === 0 ? "0" : gen === 1 ? "20px" : "8px",
      marginBottom: gen === 0 ? "20px" : "12px",
    }}>
      {nodes.map((node, i) => (
        <PedNode key={i} node={node} gen={gen} maxGen={maxGen} />
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
  const genRows = data ? getGenerationRows(data.horse, maxGen) : [];

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
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

      {isLoading && <TrottingHorseLoader label="Costruzione albero genealogico..." />}

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
            borderRadius: "12px", padding: "18px 22px", marginBottom: "20px",
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
              </div>
            </div>
            {data.rating && (
              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginLeft: "auto" }}>
                {data.rating.grade && <GradeBadge grade={data.rating.grade} />}
                <div>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Score</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(183 80% 58%)" }}>
                    {data.rating.score?.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Guadagni</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                    €{(data.rating.career_earnings / 1000).toFixed(0)}k
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Inbreeding info */}
          <div style={{
            background: data.inbreeding_coefficient > 0 ? "hsl(25 40% 12%)" : "hsl(220 12% 10%)",
            border: data.inbreeding_coefficient > 0 ? "1px solid hsl(25 50% 30%)" : "1px solid hsl(220 10% 16%)",
            borderRadius: "12px", padding: "16px 20px", marginBottom: "20px",
            display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                Coefficiente di inbreeding
              </div>
              <div style={{
                fontSize: "24px", fontWeight: 800,
                color: data.inbreeding_coefficient > 5 ? "hsl(25 70% 55%)" : data.inbreeding_coefficient > 0 ? "hsl(25 50% 55%)" : "hsl(183 80% 55%)",
              }}>
                {data.inbreeding_coefficient.toFixed(1)}%
              </div>
            </div>
            {data.common_ancestors.length > 0 && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  Antenati comuni
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {data.common_ancestors.map(a => (
                    <span key={a.name} style={{
                      fontSize: "11px", padding: "3px 10px", borderRadius: "4px",
                      background: "hsl(25 50% 35% / 0.15)", border: "1px solid hsl(25 50% 35% / 0.3)",
                      color: "hsl(25 50% 60%)",
                    }}>
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
                <GenRow key={i} nodes={row} gen={i} maxGen={maxGen} />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{
            display: "flex", gap: "16px", marginTop: "12px",
            fontSize: "11px", color: "hsl(210 8% 42%)", flexWrap: "wrap",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "hsl(183 60% 25%)" }} /> Linea paterna
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "hsl(300 40% 25%)" }} /> Linea materna
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
