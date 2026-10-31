/**
 * STAZIONI DI MONTA: i centri dove stanno gli stalloni, con la qualita'
 * media della loro produzione.
 *
 * Classifica a sinistra, scheda a destra con tutti gli stalloni della
 * stazione (presi dal catalogo stalloni, gia' scaricato per la pagina
 * Stalloni). Sul telefono la scheda si apre sotto la riga.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "../components/GradeBadge";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { Search, X } from "lucide-react";
import { Cifra, Barretta, useDesktop, num, euro, isNum } from "../components/DueColonne";

interface Farm {
  stud_farm: string;
  n_stallions: number;
  n_figli_totali: number;
  n_in_corsa: number;
  avg_score: number;
  avg_final_score: number;
  pct_top_S: number;
  n_SSS: number; n_SS: number; n_S: number;
  /** Somma dei guadagni medi per figlio dei suoi stalloni. */
  total_earnings: number;
  best_stallion: { name: string; final_score: number; grade: string; n_figli_totali: number; pct_top_S: number; stud_fee_eur: number; nationality: string } | null;
}
interface Stallone {
  name: string; stud_farm: string | null; stud_fee_eur: number | null; stud_status: string | null;
  final_score: number | null; grade: string | null; n_figli_totali: number | null; pct_top_S: number | null; nationality: string | null;
}

type SortKey = "final_score" | "earnings" | "top_S" | "figli" | "stallions";
const ORDINI: [SortKey, string][] = [["final_score", "Voto"], ["top_S", "Figli di vertice"], ["earnings", "Guadagni"], ["figli", "Figli"], ["stallions", "Stalloni"]];
const VERDE = "hsl(120 55% 52%)";
const ORO = "hsl(51 75% 58%)";

/** Guadagno medio per figlio: la media dei suoi stalloni, non la somma. */
const guadagnoMedio = (f: Farm) => (f.n_stallions > 0 ? (f.total_earnings || 0) / f.n_stallions : null);

function SchedaStazione({ f, stalloni, onClose }: { f: Farm; stalloni: Stallone[]; onClose?: () => void }) {
  const suoi = stalloni.filter(s => s.stud_farm === f.stud_farm)
    .sort((a, b) => (b.final_score ?? -1) - (a.final_score ?? -1));
  const top = (f.n_SSS || 0) + (f.n_SS || 0) + (f.n_S || 0);
  return (
    <div className="ed-dettaglio" data-testid="scheda-stazione">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Stazione di monta</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ed-testo)", overflowWrap: "anywhere", marginTop: 2 }}>{f.stud_farm}</div>
          <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
            {f.n_stallions} {f.n_stallions === 1 ? "stallone" : "stalloni"} · {num(f.n_figli_totali)} figli valutati
          </div>
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14 }}>
        <Cifra titolo="Voto medio" valore={num(f.avg_final_score, 1)} colore="var(--ed-acc)" sotto="dei suoi stalloni" />
        <Cifra titolo="Di vertice" valore={`${num(f.pct_top_S, 1)}%`} colore={VERDE} sotto={`${num(top)} figli S o più`} />
        <Cifra titolo="In gara" valore={num(f.n_in_corsa)} sotto="figli che corrono" />
        <Cifra titolo="Guadagno medio" valore={euro(guadagnoMedio(f))} colore={ORO} sotto="per figlio" />
      </div>

      <div className="ed-etich" style={{ margin: "16px 0 8px" }}>Figli di vertice</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {([["SSS", f.n_SSS], ["SS", f.n_SS], ["S", f.n_S]] as [string, number][]).map(([g, n]) => (
          <div key={g} style={{ display: "grid", gridTemplateColumns: "38px minmax(0, 1fr) 46px", gap: 8, alignItems: "center" }}>
            <GradeBadge grade={g} size="sm" />
            <Barretta valore={n} max={Math.max(f.n_SSS || 0, f.n_SS || 0, f.n_S || 0, 1)} alta={10}
              colore={g === "SSS" ? "hsl(183 100% 55%)" : g === "SS" ? "hsl(150 80% 50%)" : "hsl(120 60% 50%)"} />
            <span className="tabular" style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: "var(--ed-testo)" }}>{num(n)}</span>
          </div>
        ))}
      </div>

      <div className="ed-etich" style={{ margin: "18px 0 8px" }}>Gli stalloni ({suoi.length || f.n_stallions})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
        {(suoi.length ? suoi : f.best_stallion ? [{ ...f.best_stallion, stud_farm: f.stud_farm, stud_status: null } as any] : []).map((s: Stallone) => (
          <Link key={s.name} href={`/stallion/${encodeURIComponent(s.name)}`}>
            <a style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "8px 10px",
              borderRadius: 8, background: "var(--ed-fondo2)", textDecoration: "none" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--ed-testo)", overflowWrap: "anywhere" }}>
                  <BandieraCavallo nome={s.name} paese={s.nationality ?? undefined} ignoto_se_vuoto /> {s.name}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--ed-muto)", marginTop: 1 }}>
                  {num(s.n_figli_totali)} figli{isNum(s.pct_top_S) ? ` · ${num(s.pct_top_S, 1)}% di vertice` : ""}
                  {s.stud_status === "deceased" ? " · morto" : ""}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tabular" style={{ fontSize: 12, color: isNum(s.stud_fee_eur) && s.stud_fee_eur > 0 ? ORO : "var(--ed-fioco)" }}>
                  {isNum(s.stud_fee_eur) && s.stud_fee_eur > 0 ? euro(s.stud_fee_eur) : "monta —"}
                </span>
                {s.grade && <GradeBadge grade={s.grade} size="sm" />}
              </span>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function StudFarmsPage(_props: { embedded?: boolean } = {}) {
  const desktop = useDesktop();
  const [sortBy, setSortBy] = useState<SortKey>("final_score");
  const [search, setSearch] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);

  const { data: farms, isLoading } = useQuery<Farm[]>({
    queryKey: ["/api/stud-farms"],
    queryFn: () => apiRequest("GET", "/api/stud-farms").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const { data: stalloni } = useQuery<Stallone[]>({
    queryKey: ["/api/stallions"],
    queryFn: () => apiRequest("GET", "/api/stallions").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const lista = useMemo(() => {
    if (!farms) return [];
    const s = search.trim().toLowerCase();
    const l = s ? farms.filter(f => f.stud_farm.toLowerCase().includes(s)) : farms;
    return [...l].sort((a, b) => {
      if (sortBy === "final_score") return (b.avg_final_score || 0) - (a.avg_final_score || 0);
      if (sortBy === "earnings") return (guadagnoMedio(b) || 0) - (guadagnoMedio(a) || 0);
      if (sortBy === "top_S") return (b.pct_top_S || 0) - (a.pct_top_S || 0);
      if (sortBy === "figli") return (b.n_figli_totali || 0) - (a.n_figli_totali || 0);
      return b.n_stallions - a.n_stallions;
    });
  }, [farms, search, sortBy]);

  const scelto = aperto ?? (desktop && lista.length ? lista[0].stud_farm : null);
  const sceltoFarm = lista.find(f => f.stud_farm === scelto) ?? null;
  const maxVoto = Math.max(1, ...lista.map(f => f.avg_final_score || 0));

  /** Il numero grande a destra di ogni riga segue l'ordine scelto. */
  const valoreRiga = (f: Farm): [string, string, string] => {
    if (sortBy === "top_S") return [`${num(f.pct_top_S, 1)}%`, "di vertice", VERDE];
    if (sortBy === "earnings") return [euro(guadagnoMedio(f)), "per figlio", ORO];
    if (sortBy === "figli") return [num(f.n_figli_totali), "figli", "var(--ed-testo)"];
    if (sortBy === "stallions") return [num(f.n_stallions), "stalloni", "var(--ed-testo)"];
    return [num(f.avg_final_score, 1), "voto medio", "var(--ed-acc)"];
  };

  return (
    <div>
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca una stazione di monta" aria-label="Cerca una stazione di monta" />
          {search && <button onClick={() => setSearch("")} aria-label="Cancella ricerca"
            style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {ORDINI.map(([k, t]) => <button key={k} aria-pressed={sortBy === k} onClick={() => setSortBy(k)}>{t}</button>)}
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ed-muto)", marginLeft: "auto" }}>{num(lista.length)} stazioni</span>
      </div>

      {isLoading ? <CavalloCaricamento label="Carico le stazioni di monta..." /> : lista.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuna stazione di monta trovata.</div>
      ) : (
        <div className="ed-griglia">
          <div className="ed-lista">
            {lista.map((f, i) => {
              const att = scelto === f.stud_farm;
              const [v, et, col] = valoreRiga(f);
              return (
                <div key={f.stud_farm} style={{ minWidth: 0 }}>
                  <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? null : f.stud_farm)} data-testid={`row-stazione-${i}`}>
                    <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ed-nome" style={{ display: "block" }}>{f.stud_farm}</span>
                      <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={f.avg_final_score} max={maxVoto} /></span>
                      <span className="ed-sotto" style={{ display: "block" }}>
                        {f.n_stallions} {f.n_stallions === 1 ? "stallone" : "stalloni"} · {num(f.n_figli_totali)} figli
                        {f.best_stallion ? ` · il migliore: ${f.best_stallion.name}` : ""}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="tabular" style={{ display: "block", fontSize: 18, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{v}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>{et}</span>
                    </span>
                  </button>
                  {!desktop && att && <div style={{ marginTop: 6 }}><SchedaStazione f={f} stalloni={stalloni ?? []} onClose={() => setAperto(null)} /></div>}
                </div>
              );
            })}
          </div>
          {desktop && (sceltoFarm ? <SchedaStazione key={sceltoFarm.stud_farm} f={sceltoFarm} stalloni={stalloni ?? []} />
            : <div className="ed-dettaglio ed-vuoto">Scegli una stazione dall'elenco.</div>)}
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--ed-fioco)", marginTop: 22, lineHeight: 1.6 }}>
        Il voto medio è la media dei voti dei suoi stalloni, calcolati sui figli. «Di vertice»: la quota media di figli con voto S, SS o SSS.
      </p>
    </div>
  );
}
