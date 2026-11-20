import { useState, useMemo } from "react";
import { coloreScheda } from "@/lib/sezioni";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "../components/GradeBadge";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { Dna, Network } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";

const COLORE_PED = coloreScheda("/pedigree");
import NameSelect from "../components/NameSelect";
import InbreedingPanel from "../components/InbreedingPanel";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import AlberoPedigree, { type PedigreeNode } from "../components/AlberoPedigree";

interface PedigreeData {
  horse: PedigreeNode;
  rating: { grade: string; score: number; career_earnings: number; career_races: number; career_wins: number; win_rate: number } | null;
  inbreeding_coefficient: number;
  common_ancestors: { name: string; contribution: number; sire_gens?: number[]; dam_gens?: number[] }[];
  ripetuti_un_lato?: { name: string; lato: "padre" | "madre"; gens: number[] }[];
  max_generations?: number;
  has_source_pedigree?: boolean;
  figli?: number;
  affidabilita?: { livello?: "provvisorio" | "in_via_di_conferma" | "consolidato" } | null;
}

function sessoSoggetto(d: PedigreeData) {
  const rip = (d.figli ?? 0) > 0;
  if (d.horse.sex === "M") return rip ? "♂ Stallone" : "♂ Maschio";
  if (d.horse.sex === "F") return rip ? "♀ Fattrice" : "♀ Femmina";
  return "—";
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
    <div className="page-shell">
      <IntestazionePagina icona={Network} colore={COLORE_PED} titolo="Pedigree" margineSotto={18}
        sottotitolo="Albero genealogico fino alla quinta generazione, consanguineità e incroci ripetuti, per qualunque cavallo in archivio." />

      {/* Scelta del cavallo: tendina con ricerca, non piu' solo testo libero */}
      <div className="pannello" style={{ padding: "16px 20px", marginBottom: "24px",
        display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
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
            Fino a
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {([[2, "Nonni"], [3, "Bisnonni"], [4, "Trisavoli"], [5, "5ª generazione"]] as [number, string][]).map(([g, etichetta]) => (
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
              >{etichetta}</button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <CavalloCaricamento label="Costruzione albero genealogico..." size={120} />}

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
                <BandieraCavallo nome={data.horse.name} paese={data.horse.country} grande />
                {data.horse.name}
              </div>
              <div style={{ fontSize: "12px", color: "hsl(210 8% 52%)", marginTop: "3px" }}>
                {data.horse.birth_year || "—"} · {sessoSoggetto(data)}
                {data.horse.career_races ? ` · ${data.horse.career_races} corse` : " · non ha corso"}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 12 }}>
                <Link href={`/horse/${encodeURIComponent(data.horse.name)}/${data.horse.birth_year ?? ""}`}><a style={{ color: "hsl(183 70% 55%)" }}>Apri la scheda del cavallo</a></Link>
                {(data.figli ?? 0) > 0 && data.horse.sex === "M" && (
                  <Link href={`/stallion/${encodeURIComponent(data.horse.name)}`}><a style={{ color: "hsl(183 70% 55%)" }}>Apri la scheda da stallone ({data.figli} figli)</a></Link>
                )}
                {(data.figli ?? 0) > 0 && data.horse.sex === "F" && (
                  <Link href={`/fattrice/${encodeURIComponent(data.horse.name)}`}><a style={{ color: "hsl(183 70% 55%)" }}>Apri la scheda da fattrice ({data.figli} figli)</a></Link>
                )}
              </div>
            </div>
            {data.rating && (
              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }} data-testid="voto-corse">
                {data.rating.grade && <GradeBadge grade={data.rating.grade} />}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Voto dalle corse</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(183 80% 58%)" }}>
                    {data.rating.score?.toFixed(1)}
                  </div>
                  {data.affidabilita?.livello && (
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: data.affidabilita.livello === "provvisorio" ? "hsl(28 85% 62%)" : data.affidabilita.livello === "in_via_di_conferma" ? "hsl(51 75% 60%)" : "hsl(140 50% 55%)" }}>
                      {data.affidabilita.livello === "provvisorio" ? "provvisorio" : data.affidabilita.livello === "in_via_di_conferma" ? "in via di conferma" : "consolidato"}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Guadagni</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(51 70% 55%)" }}>
                    €{Math.round(data.rating.career_earnings).toLocaleString("it-IT")}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "hsl(210 8% 38%)", textTransform: "uppercase" }}>Vittorie</div>
                  <div className="tabular" style={{ fontSize: "16px", fontWeight: 700, color: "hsl(100 50% 55%)" }}>
                    {data.rating.career_wins} su {data.rating.career_races}
                  </div>
                </div>
              </div>
            )}
            <div style={{ flexBasis: "100%", fontSize: 11.5, color: "var(--muted)" }}>
              {data.rating
                ? "Il voto viene dalle corse di questo cavallo, non dal suo pedigree. Il pedigree qui sotto mostra solo gli antenati."
                : "Questo cavallo non ha ancora un voto dalle corse. Il pedigree qui sotto mostra solo gli antenati."}
            </div>
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
                      {a.name}{a.sire_gens && a.dam_gens ? ` (${a.sire_gens.join("+")} × ${a.dam_gens.join("+")})` : ""} · {(a.contribution * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(data.ripetuti_un_lato?.length ?? 0) > 0 && (
              <div style={{ flexBasis: "100%" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  Ripetuti su un lato solo — non entrano nel coefficiente
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {data.ripetuti_un_lato!.map(a => (
                    <span
                      key={a.name + a.lato}
                      onMouseEnter={() => setHoveredAncestor(a.name)}
                      onMouseLeave={() => setHoveredAncestor(null)}
                      title={`Compare ${a.gens.length} volte dal lato ${a.lato === "padre" ? "del padre" : "della madre"}: rende consanguineo ${a.lato === "padre" ? "il padre" : "la madre"}, non questo cavallo.`}
                      style={{
                        fontSize: "11px", padding: "3px 10px", borderRadius: "4px", cursor: "pointer",
                        background: hoveredAncestor === a.name ? "hsl(210 20% 30%)" : "hsl(210 15% 30% / 0.15)",
                        border: "1px solid hsl(210 15% 35% / 0.4)", color: "hsl(210 10% 70%)",
                      }}
                    >
                      {a.name} · {a.gens.join("+")} lato {a.lato}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Albero genealogico */}
          <div className="pannello" style={{ padding: "20px 16px" }}>
            <AlberoPedigree root={data.horse} generazioni={gens} hovered={hoveredAncestor} onHover={setHoveredAncestor} />
          </div>

          {/* Consanguineita' e genealogia estesa della seconda fonte */}
          <div style={{ marginTop: "22px" }}>
            <InbreedingPanel horseName={data.horse.name} />
          </div>
        </div>
      )}

      <CollegamentiCorrelati voci={[
        { href: "/compare", titolo: "Comparazione", descrizione: "Metti due cavalli a confronto su statistiche e carriera." },
        { href: "/advisor", titolo: "Advisor", descrizione: "Verifica un accoppiamento prima di farlo, consanguineita' inclusa." },
        { href: "/leaderboard", titolo: "Leaderboard", descrizione: "Cerca un cavallo da cui partire." },
      ]} />
    </div>
  );
}
