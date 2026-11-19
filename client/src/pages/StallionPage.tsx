import { periodoMonta } from "@/lib/periodoMonta";
import { COLORE_SCHEDA_VOTO } from "@/lib/coloreVoto";
import { PareggioStallone, FigliInAttivita } from "../components/PareggioScheda";
import { Spiegazione } from "../components/Spiegazione";
import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "../components/GradeBadge";
import { COLORE_VOTO } from "@/lib/coloreVoto";
import { ArrowLeft, Search, X, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import IntestazioneScheda from "../components/IntestazioneScheda";
import { Cifra } from "../components/DueColonne";
import { formatRecord } from "@/lib/record";

interface Pedigree {
  sire: string | null;
  dam: string | null;
  sire_sire: string | null;
  sire_dam: string | null;
  dam_sire: string | null;
  dam_dam: string | null;
}

interface StallionData {
  sire: string;
  n_figli_totali: number;
  n_in_corsa: number;
  n_SSS: number; n_SS: number; n_S: number;
  n_A: number; n_B: number; n_C: number; n_D: number; n_E: number; n_F: number;
  avg_score: number;
  avg_earnings: number;
  max_earnings: number;
  avg_win_rate: number;
  pct_top_S: number;
  grade: string | null;
  vp_boost: number;
  final_score: number | null;
  // Quanto ci si puo' fidare del voto: dipende da quanti figli hanno corso.
  affidabilita: number | null;
  affidabilita_txt: string | null;
  n_figli_corsi: number | null;
  no_offspring_data?: boolean;
  stud?: {
    stud_fee_eur: number;
    stud_farm: string;
    stud_status: string;
    progeny_earnings_2024: number;
    media_in_corsa: number;
    tot_prod: number;
    stud_farm_address?: string | null;
    record_1600?: string | null;
    record_2000?: string | null;
    catalog_earnings_eur?: number | null;
    catalog_birth_year?: number | null;
    catalog_sire?: string | null;
    catalog_dam?: string | null;
    catalog_dam_sire?: string | null;
    catalog_notes?: string | null;
    catalog_url?: string | null;
    catalog_synced_at?: string | null;
  };
  children: Child[];
  gradeDist: { grade: string; cnt: number }[];
  pedigree: Pedigree | null;
  nationality?: string | null;
  // Nascita, anni in monta e generazione (server/alberoStalloni.ts).
  attivita?: {
    nato: number | null; figli: number; primo_figlio: number | null; ultimo_figlio: number | null; anno_punta: number | null;
    monta_dal: number | null; monta_al: number | null; in_monta: boolean; fuori_catalogo_recente: boolean;
    morto: { data: string | null; fonte: string | null; url: string | null } | null; seme_congelato: boolean;
    generazione: number; nome_generazione: string | null; nell_albero: boolean; voto_confrontabile: boolean;
    posto_generazione: number | null; su_generazione: number | null; per_anno: { anno: number; n: number }[];
  } | null;
  // Come nonno paterno: i figli dei suoi figli stalloni (server/classifiche.ts).
  nonno?: {
    figli_stalloni: number; nipoti: number; nipoti_corsi: number; vincite: number; media_nipote: number; vittorie: number;
    di_vertice: number; posto: number; su: number;
    figli: { nome: string; nipoti: number; nipoti_corsi: number; vincite: number }[];
  } | null;
}

interface Child {
  name: string;
  birth_year: number;
  grade: string;
  score: number;
  career_earnings: number;
  record_career: string;
  win_rate: number;
  sire_percentile: number;
}

interface SearchResult {
  name: string;
  n_figli_totali: number;
  n_in_corsa: number;
  avg_score: number;
  n_SSS: number; n_SS: number; n_S: number;
  pct_top_S: number;
}

interface Neighbors {
  prev: { name: string; grade: string; final_score: number } | null;
  next: { name: string; grade: string; final_score: number } | null;
}

interface StallionStats {
  offspringByYear: { birth_year: number; total: number; top_count: number; avg_score: number; avg_earn: number }[];
  topOffspring: Child[];
  gradeEarnings: { grade: string; avg_earn: number; cnt: number }[];
}

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
// Colori ufficiali dei voti (SSS oro, SS argento, S bronzo...), uguali in tutto il sito.
const GRADE_COLORS: Record<string, string> = COLORE_SCHEDA_VOTO;

/**
 * Applica una trasparenza a un colore HSL. La concatenazione di un codice
 * esadecimale ("hsl(...)55") non e' CSS valido e fa scartare il colore:
 * la notazione giusta e' "hsl(H S% L% / alfa)".
 */
function conAlfa(hsl: string, alfa: number): string {
  return hsl.replace(/^hsl\((.*)\)$/, (_m, dentro) => `hsl(${dentro} / ${alfa})`);
}


const panelStyle: React.CSSProperties = {
  padding: "20px 22px",
  marginBottom: "22px",
};

const panelTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "hsl(210 8% 50%)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "14px",
};

function StallionSearchBar({ onSelect }: { onSelect: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: results = [] } = useQuery<SearchResult[]>({
    queryKey: ["/api/search/stallion", q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const r = await apiRequest("GET", `/api/search/stallion?q=${encodeURIComponent(q)}`);
      return r.json();
    },
    enabled: q.length >= 2,
  });

  return (
    <div style={{ position: "relative", maxWidth: "480px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 20%)",
        borderRadius: "10px", padding: "10px 14px",
      }}>
        <Search size={16} style={{ color: "hsl(210 8% 50%)" }} />
        <input
          value={q}
          onChange={e => { setQ(e.target.value.toUpperCase()); setOpen(true); }}
          placeholder="Cerca stallone..."
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "hsl(210 10% 88%)", fontSize: "14px", letterSpacing: "0.03em" }}
        />
        {q && <button onClick={() => { setQ(""); setOpen(false); }}><X size={14} style={{ color: "hsl(210 8% 45%)" }} /></button>}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px", overflow: "hidden", zIndex: 100,
          boxShadow: "0 8px 32px hsl(220 20% 5% / 0.6)",
        }}>
          {results.map((s, i) => (
            <button
              key={s.name}
              onClick={() => { onSelect(s.name); setQ(s.name); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid hsl(220 10% 16%)" : "none",
                textAlign: "left", transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 15%)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", letterSpacing: "0.03em" }}>{s.name}</div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)" }}>
                  {s.n_in_corsa} in corsa · avg {s.avg_score?.toFixed(1)} · {s.pct_top_S?.toFixed(0)}% top-S
                </div>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {s.n_SSS > 0 && <GradeBadge grade="SSS" size="sm" />}
                {s.n_SS > 0 && <GradeBadge grade="SS" size="sm" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PedigreeNode({ label, name, highlight }: { label: string; name: string | null; highlight?: boolean }) {
  const [, navigate] = useLocation();
  if (!name) {
    return (
      <div style={{ padding: "10px 14px", borderRadius: "8px", background: "hsl(220 12% 9%)", border: "1px dashed hsl(220 10% 18%)" }}>
        <div style={{ fontSize: "10px", color: "hsl(210 8% 35%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
        <div style={{ fontSize: "12px", color: "hsl(210 8% 38%)", fontStyle: "italic" }}>—</div>
      </div>
    );
  }
  return (
    <button
      onClick={() => navigate(`/stallion/${encodeURIComponent(name)}`)}
      style={{
        padding: "10px 14px", borderRadius: "8px", cursor: "pointer", textAlign: "left", width: "100%",
        background: highlight ? "hsl(183 30% 10%)" : "hsl(220 12% 11%)",
        border: highlight ? "1px solid hsl(183 40% 25%)" : "1px solid hsl(220 10% 18%)",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = highlight ? "hsl(183 30% 14%)" : "hsl(220 12% 15%)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = highlight ? "hsl(183 30% 10%)" : "hsl(220 12% 11%)"; }}
    >
      <div style={{ fontSize: "10px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
      <div style={{
        fontSize: highlight ? "13px" : "12px",
        fontWeight: highlight ? 700 : 600,
        color: highlight ? "hsl(183 70% 65%)" : "hsl(210 8% 75%)",
        letterSpacing: "0.03em",
      }}>
        {name}
      </div>
    </button>
  );
}

function StallionNavArrow({ direction, neighbor, onClick }: {
  direction: "prev" | "next";
  neighbor: { name: string; grade: string; final_score: number } | null;
  onClick: (name: string) => void;
}) {
  if (!neighbor) return <div style={{ flex: 1 }} />;
  const isNext = direction === "next";
  return (
    <button
      onClick={() => onClick(neighbor.name)}
      className="pannello pannello-cliccabile" style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        cursor: "pointer",
        flex: 1,
        maxWidth: "240px",
        justifyContent: isNext ? "flex-end" : "flex-start",
        transition: "background 0.15s, border-color 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(220 12% 16%)"; e.currentTarget.style.borderColor = "hsl(183 40% 30%)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "hsl(220 12% 12%)"; e.currentTarget.style.borderColor = "hsl(220 10% 18%)"; }}
    >
      {!isNext && <ChevronLeft size={18} style={{ color: "hsl(210 8% 45%)", flexShrink: 0 }} />}
      <div style={{ textAlign: isNext ? "right" : "left", overflow: "hidden" }}>
        <div style={{ fontSize: "10px", color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {isNext ? "Voto più alto" : "Voto più basso"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: isNext ? "flex-end" : "flex-start" }}>
          <GradeBadge grade={neighbor.grade} size="sm" />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 75%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {neighbor.name}
          </span>
          <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 45%)", flexShrink: 0 }}>{neighbor.final_score?.toFixed(1).replace(".", ",")}</span>
        </div>
      </div>
      {isNext && <ChevronRight size={18} style={{ color: "hsl(210 8% 45%)", flexShrink: 0 }} />}
    </button>
  );
}

/* Gli anni in monta: i figli in archivio nati anno per anno. Dice quando lo
   stallone e' stato piu' in attivita' e perche' il voto di uno stallone
   vecchio e' basso (i suoi figli hanno corso prima dell'archivio). */
function AnniInMonta({ a, nome }: { a: NonNullable<StallionData["attivita"]>; nome: string }) {
  const da = a.per_anno[0].anno, al = Math.max(a.per_anno[a.per_anno.length - 1].anno, da);
  const max = Math.max(1, ...a.per_anno.map(p => p.n));
  const anni = Array.from({ length: al - da + 1 }, (_, i) => da + i);
  const n = new Map(a.per_anno.map(p => [p.anno, p.n]));
  const passo = anni.length > 24 ? 5 : anni.length > 12 ? 2 : 1;
  return (
    <div className="pannello" style={{ padding: "18px 22px", marginBottom: "18px" }} data-testid="anni-in-monta">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Anni in monta</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {a.monta_dal != null ? <>in monta {periodoMonta(a)}</> : null}
          {a.anno_punta ? <> · più figli nati nel {a.anno_punta}</> : null}
          {a.nome_generazione && a.nell_albero ? <> · <Link href={`/stalloni/albero?s=${encodeURIComponent(nome)}`}><a style={{ color: "hsl(120 55% 58%)" }}>{a.nome_generazione} nell'albero degli stalloni</a></Link></> : null}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 70 }} aria-label="Figli nati per anno">
        {anni.map(y => (
          <div key={y} title={`${y}: ${n.get(y) ?? 0} figli`} style={{ flex: 1, minWidth: 2, height: `${Math.max(n.get(y) ? 4 : 0, ((n.get(y) ?? 0) / max) * 100)}%`, background: y === a.anno_punta ? "hsl(51 90% 62%)" : "hsl(120 45% 45%)", borderRadius: "2px 2px 0 0" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {anni.map(y => <div key={y} className="tabular" style={{ flex: 1, minWidth: 2, fontSize: 10, color: "var(--muted)", textAlign: "center", overflow: "visible", whiteSpace: "nowrap" }}>{(y - da) % passo === 0 ? y : ""}</div>)}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
        Figli in archivio nati anno per anno ({a.figli.toLocaleString("it-IT")} in tutto). La monta è l'anno prima della nascita.
        {!a.voto_confrontabile ? " Il voto conta solo i figli che hanno corso negli anni dell'archivio: per questo stallone sono pochi, quindi il voto dice poco su quanto valeva." : ""}
        {a.posto_generazione ? ` Nella sua generazione è ${a.posto_generazione}° su ${a.su_generazione} per punteggio.` : ""}
      </div>
    </div>
  );
}

/* Come nonno paterno: quanto vincono i figli dei suoi figli stalloni. */
function ComeNonno({ n, nome }: { n: NonNullable<StallionData["nonno"]>; nome: string }) {
  const max = Math.max(1, ...n.figli.map(f => f.vincite));
  const euro = (v: number) => `€ ${Math.round(v).toLocaleString("it-IT")}`;
  return (
    <div className="pannello" style={{ padding: "18px 22px", marginBottom: "18px" }} data-testid="come-nonno">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Come nonno</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {n.posto}° su {n.su} per vincite dei nipoti ·{" "}
          <Link href={`/stalloni/classifiche?tab=nonni&s=${encodeURIComponent(nome)}`}><a style={{ color: "hsl(120 55% 58%)" }}>classifica completa</a></Link>
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--fg, hsl(210 10% 88%))", lineHeight: 1.55, marginBottom: 10 }}>
        Attraverso {n.figli_stalloni} {n.figli_stalloni === 1 ? "figlio stallone" : "figli stalloni"} ha {n.nipoti_corsi.toLocaleString("it-IT")} nipoti
        che hanno corso, con {euro(n.vincite)} vinti ({euro(n.media_nipote)} a nipote){n.di_vertice ? ` e ${n.di_vertice} di vertice` : ""}.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px 16px" }}>
        {n.figli.slice(0, 6).map(f => (
          <div key={f.nome} style={{ fontSize: 12.5, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <Link href={`/stallion/${encodeURIComponent(f.nome)}`}><a style={{ color: "hsl(51 80% 62%)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</a></Link>
              <span className="tabular" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{euro(f.vincite)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "hsl(220 10% 16%)", marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${(f.vincite / max) * 100}%`, height: "100%", background: "hsl(120 45% 45%)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ minWidth: wide ? "260px" : "120px", flex: wide ? "1 1 320px" : "0 0 auto" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.1em", color: "hsl(210 8% 45%)", marginBottom: "4px" }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: "13px", color: "hsl(210 10% 88%)", lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}

export default function StallionPage() {
  const [match, params] = useRoute("/stallion/:name");
  const [, navigate] = useLocation();
  const stallionName = params?.name ? decodeURIComponent(params.name) : "";

  const isSearch = !stallionName || stallionName === "search";

  const { data: stallion, isLoading } = useQuery<StallionData>({
    queryKey: ["/api/stallion", stallionName],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/stallion/${encodeURIComponent(stallionName)}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !isSearch,
  });

  const { data: neighbors } = useQuery<Neighbors>({
    queryKey: ["/api/stallion", stallionName, "neighbors"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/stallion/${encodeURIComponent(stallionName)}/neighbors`);
      if (!r.ok) return { prev: null, next: null };
      return r.json();
    },
    enabled: !isSearch,
  });

  const { data: stats } = useQuery<StallionStats>({
    queryKey: ["/api/stallion", stallionName, "stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/stallion/${encodeURIComponent(stallionName)}/stats`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !isSearch,
  });

  const totalDist = stallion?.gradeDist.reduce((s, g) => s + g.cnt, 0) ?? 1;

  const navigateTo = (sName: string) => {
    navigate(`/stallion/${encodeURIComponent(sName)}`);
  };

  return (
    <div className="page-shell fade-in">
      {/* Come nella scheda cavallo: elenco, ricerca e stalloni vicini su una fascia sola. */}
      <div className="barra-scheda">
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flex: "1 1 420px", flexWrap: "wrap" }}>
          <Link href="/stalloni" style={{ display: "flex", alignItems: "center", gap: "6px", color: "hsl(210 8% 50%)", fontSize: "13px", textDecoration: "none", flexShrink: 0 }} data-testid="link-tutti-stalloni">
            <ArrowLeft size={16} /> Tutti gli stalloni
          </Link>
          <StallionSearchBar onSelect={name => navigate(`/stallion/${encodeURIComponent(name)}`)} />
        </div>
        {neighbors && (neighbors.prev || neighbors.next) && (
          <div className="navigazione-vicini" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StallionNavArrow direction="prev" neighbor={neighbors.prev} onClick={navigateTo} />
            <StallionNavArrow direction="next" neighbor={neighbors.next} onClick={navigateTo} />
          </div>
        )}
      </div>

      {isSearch && (
        <div style={{ fontSize: "14px", color: "hsl(210 8% 45%)", marginTop: "12px" }}>
          Cerca uno stallone per nome.
        </div>
      )}

      {isLoading && !isSearch && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="skeleton" style={{ height: "50px", width: "280px", borderRadius: "10px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "76px", borderRadius: "10px" }} />)}
          </div>
        </div>
      )}

      {!isSearch && !isLoading && stallion && (
        <>
          {/* Intestazione, uguale a quella della scheda cavallo: striscia
              col colore del voto, nome, e una fila di numeri chiave. */}
          {(() => {
            const migliore = [...(stallion.children ?? [])].sort((a, b) => (b.career_earnings ?? 0) - (a.career_earnings ?? 0))[0];
            const st = stallion.stud;
            const monta = st?.stud_fee_eur
              ? { testo: `€${st.stud_fee_eur.toLocaleString("it-IT")}`, colore: "hsl(51 90% 62%)" }
              : st?.stud_status === "free" ? { testo: "gratuita", colore: "hsl(150 45% 55%)" }
                : st?.stud_status === "da_concordare" ? { testo: "da concordare", colore: "hsl(40 70% 55%)" }
                  : { testo: "non in catalogo", colore: "hsl(210 8% 55%)" };
            const euro = (n?: number | null) => (n != null ? `€${Math.round(n).toLocaleString("it-IT")}` : "—");
            return (
              <IntestazioneScheda
                icona={Crown} colore={COLORE_VOTO[stallion.grade ?? ""] ?? "hsl(183 70% 55%)"} tipo="Stallone"
                titolo={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <BandieraCavallo nome={stallion.sire} paese={stallion.nationality} ignoto_se_vuoto grande />{stallion.sire}
                </span>}
                accanto={stallion.grade ? <GradeBadge grade={stallion.grade} size="lg" /> : undefined}
                sotto={<>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {st?.stud_farm && <span>{st.stud_farm}</span>}
                    {stallion.final_score != null && <>{st?.stud_farm && <span>·</span>}<span className="tabular">punti {stallion.final_score.toFixed(1).replace(".", ",")}</span></>}
                    {stallion.affidabilita_txt && <><span>·</span><span>affidabilità {stallion.affidabilita_txt}</span></>}
                  </span>
                  {(() => {
                    // Anno di nascita e periodo in monta, sempre in vista.
                    const at = stallion.attivita;
                    const nato = at?.nato ?? st?.catalog_birth_year ?? null;
                    if (!nato && !at?.monta_dal) return null;
                    return (
                      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }} data-testid="stallone-attivita">
                        {nato ? <span>nato nel {nato}</span> : null}
                        {at?.monta_dal != null && <>{nato ? <span>·</span> : null}<span>in monta {periodoMonta(at)}</span></>}
                        {at?.nome_generazione && at.nell_albero && <><span>·</span>
                          <Link href={`/stalloni/albero?s=${encodeURIComponent(stallion.sire)}`}><a style={{ color: "hsl(120 55% 58%)", textDecoration: "none" }}>generazione: {at.nome_generazione.toLowerCase()}</a></Link></>}
                      </span>
                    );
                  })()}
                  {stallion.attivita?.morto && (
                    <span style={{ display: "block", marginTop: 2, color: "hsl(210 10% 82%)", fontWeight: 600 }} data-testid="stallone-deceduto">
                      {stallion.attivita.morto.data ? `Deceduto il ${stallion.attivita.morto.data.slice(8, 10)}/${stallion.attivita.morto.data.slice(5, 7)}/${stallion.attivita.morto.data.slice(0, 4)}` : "Deceduto"}
                      {stallion.attivita.morto.url ? <> (<a href={stallion.attivita.morto.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{stallion.attivita.morto.fonte}</a>)</> : null}
                    </span>
                  )}
                  {stallion.pedigree?.sire && (
                    <span style={{ display: "block", marginTop: 2 }}>
                      {stallion.pedigree.sire}{stallion.pedigree.dam ? <> × {stallion.pedigree.dam}</> : null}
                    </span>
                  )}
                  {stallion.no_offspring_data && (
                    <span style={{ display: "block", color: "hsl(40 60% 55%)", marginTop: 2 }}>Dati dei figli non ancora disponibili</span>
                  )}
                </>}
                cifre={<>
                  <Cifra titolo="Figli" valore={stallion.n_figli_totali ?? "—"} sotto={stallion.n_in_corsa != null ? `${stallion.n_in_corsa} in corsa` : undefined} />
                  <Cifra titolo="Guadagno medio di un figlio" valore={euro(stallion.avg_earnings)} colore="hsl(51 90% 62%)" />
                  <Cifra titolo="Corse vinte dai figli" valore={stallion.avg_win_rate != null ? `${stallion.avg_win_rate.toFixed(1).replace(".", ",")}%` : "—"} />
                  <Cifra titolo="Figlio migliore"
                    valore={migliore ? (
                      <Link href={`/horse/${encodeURIComponent(migliore.name)}/${migliore.birth_year}`}>
                        <a style={{ textDecoration: "none", color: "var(--ed-testo)", fontSize: 15, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <BandieraCavallo nome={migliore.name} /> {migliore.name}
                        </a>
                      </Link>
                    ) : "—"}
                    sotto={migliore ? euro(migliore.career_earnings) : undefined} />
                  <Cifra titolo="Monta" valore={<span style={{ fontSize: st?.stud_fee_eur ? undefined : 15 }}>{monta.testo}</span>} colore={monta.colore} />
                </>}
              />
            );
          })()}

          {/* Scheda monta: dati del catalogo stalloni della stagione */}
          {stallion.stud && (stallion.stud.stud_farm_address || stallion.stud.record_1600
            || stallion.stud.record_2000 || stallion.stud.catalog_sire) && (
            <div className="pannello" style={{ padding: "18px 22px", marginBottom: "18px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.12em", color: "hsl(183 60% 55%)", marginBottom: "12px" }}>
                {["active", "da_concordare", "free"].includes(stallion.stud.stud_status || "")
                  ? "STAGIONE DI MONTA"
                  : stallion.stud.stud_status === "deceased" ? "DATI DI MONTA — DECEDUTO"
                  : "DATI DI MONTA — NON IN CATALOGO 2026"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "22px 34px" }}>
                {stallion.stud.stud_farm_address && (
                  <Fact label="Funziona presso" value={stallion.stud.stud_farm_address} wide />
                )}
                {stallion.stud.catalog_sire && (
                  <Fact
                    label="Genealogia da catalogo"
                    value={`${stallion.stud.catalog_sire}${stallion.stud.catalog_dam ? " x " + stallion.stud.catalog_dam : ""}${stallion.stud.catalog_dam_sire ? " (" + stallion.stud.catalog_dam_sire + ")" : ""}`}
                    wide
                  />
                )}
                {stallion.stud.record_1600 && <Fact label="Record 1600 m" value={stallion.stud.record_1600} />}
                {stallion.stud.record_2000 && <Fact label="Record 2000 m" value={stallion.stud.record_2000} />}
                {stallion.stud.catalog_earnings_eur != null && stallion.stud.catalog_earnings_eur > 0 && (
                  <Fact label="Vincite in carriera" value={"\u20ac" + Math.round(stallion.stud.catalog_earnings_eur).toLocaleString("it-IT")} />
                )}
                {stallion.stud.catalog_birth_year && <Fact label="Anno di nascita" value={String(stallion.stud.catalog_birth_year)} />}
              </div>
              <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", marginTop: "14px" }}>
                {["active", "da_concordare", "free"].includes(stallion.stud.stud_status || "")
                  ? "Per prenotare la monta contatta direttamente l'allevamento indicato sopra."
                  : stallion.stud.stud_status === "deceased" ? "Per sapere se la monta è ancora possibile contatta l'allevamento indicato sopra."
                  : "Questo stallone non risulta nel catalogo monte della stagione 2026: i dati qui sopra sono quelli dell'ultima stagione rilevata."}
              </div>
            </div>
          )}

          {stallion.attivita && stallion.attivita.per_anno.length > 0 && <AnniInMonta a={stallion.attivita} nome={stallion.sire} />}
          {stallion.nonno && stallion.nonno.nipoti_corsi > 0 && <ComeNonno n={stallion.nonno} nome={stallion.sire} />}

          {/* Punto di pareggio della monta */}
          {!stallion.no_offspring_data && <PareggioStallone nome={stallionName.toUpperCase()} />}
          {!stallion.no_offspring_data && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "12.5px", margin: "-4px 0 14px" }}>
              <Link href={`/puledro?padre=${encodeURIComponent(stallionName.toUpperCase())}`} style={{ color: "hsl(25 75% 62%)" }}>
                Quanto vale un suo puledro: prezzo massimo, caso per caso →
              </Link>
              <Link href="/generazione-m" style={{ color: "hsl(38 80% 62%)" }}>I suoi figli alle aste 2026 →</Link>
            </div>
          )}
          <FigliInAttivita nome={stallionName.toUpperCase()} />

          {/* Rating card */}
          {!stallion.no_offspring_data && stallion.final_score != null && (
            <div className="pannello" style={{ padding: "18px 22px", marginBottom: "18px",
              display: "flex", alignItems: "center", gap: "28px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rating Stallone</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                  {stallion.grade && <GradeBadge grade={stallion.grade} size="lg" />}
                  <span className="tabular" style={{ fontSize: "26px", fontWeight: 800, color: "hsl(210 10% 90%)" }}>
                    {stallion.final_score.toFixed(1)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score base</div>
                <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(210 10% 75%)" }}>
                  {stallion.avg_score?.toFixed(1) ?? "—"}
                </div>
              </div>
              {(stallion.vp_boost ?? 0) > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>VP Boost</div>
                  <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(120 50% 55%)" }}>
                    +{(stallion.vp_boost ?? 0).toFixed(2)}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>% top-S</div>
                <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(183 60% 55%)" }}>
                  {stallion.pct_top_S != null ? `${stallion.pct_top_S.toFixed(1)}%` : "—"}
                </div>
              </div>

              {/* AFFIDABILITA' — sta accanto al voto, non in fondo alla pagina.
                  Un voto costruito su 2 figli e uno su 400 avevano lo stesso
                  aspetto: chi legge non poteva distinguere una misura da
                  un'impressione. Il colore segue il livello, cosi' si capisce
                  a colpo d'occhio. */}
              {stallion.affidabilita != null && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Affidabilità</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
                    <span className="tabular" style={{
                      fontSize: "18px", fontWeight: 700,
                      color: stallion.affidabilita >= 0.6 ? "hsl(120 45% 58%)"
                           : stallion.affidabilita >= 0.4 ? "hsl(45 70% 58%)"
                           : "hsl(8 65% 60%)",
                    }}>
                      {Math.round(stallion.affidabilita * 100)}%
                    </span>
                    <span style={{ fontSize: "11px", color: "hsl(210 8% 50%)" }}>
                      {stallion.affidabilita_txt}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Avvertenza quando il giudizio non regge. Sotto il 50% di
              affidabilita' — che con questa ereditabilita' vuol dire meno di
              tredici figli in pista — il voto non e' una misura: e' il caso.
              Prima la pagina mostrava comunque una lettera, e uno stallone
              con un figlio solo risultava "F" come se fosse stato valutato. */}
          {stallion.affidabilita != null && stallion.affidabilita < 0.5 && (
            <div style={{
              background: "hsl(8 40% 12%)", border: "1px solid hsl(8 45% 26%)",
              borderRadius: "10px", padding: "13px 16px", marginBottom: "18px",
              fontSize: "12.5px", lineHeight: 1.6, color: "hsl(8 25% 80%)",
            }}>
              <strong style={{ color: "hsl(8 60% 72%)" }}>Giudizio non attendibile: poggia su {stallion.n_figli_corsi ?? 0}{" "}
              {stallion.n_figli_corsi === 1 ? "figlio che ha" : "figli che hanno"} corso.</strong>
              <Spiegazione titolo="Perché" compatta>
              Con così pochi risultati la parte dovuta al caso supera quella
              dovuta allo stallone: due figli fortunati o sfortunati spostano
              tutto. Il voto è mostrato per trasparenza, non per orientare una
              scelta. Serve almeno una dozzina di figli in pista perché il
              giudizio cominci a reggere, e la solidità cresce con il numero.
              </Spiegazione>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", marginBottom: "22px" }}>
            {[
              { label: "Avg score", value: stallion.avg_score?.toFixed(1) ?? "—" },
              { label: "% top-S", value: stallion.pct_top_S != null ? `${stallion.pct_top_S.toFixed(1)}%` : "—" },
              { label: "Guadagni medi", value: stallion.avg_earnings != null ? `€${stallion.avg_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—" },
              { label: "Massimo figlio", value: stallion.max_earnings != null ? `€${stallion.max_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—" },
              { label: "Win rate medio", value: stallion.avg_win_rate != null ? `${stallion.avg_win_rate.toFixed(1)}%` : "—" },
              ...(stallion.stud?.progeny_earnings_2024 ? [{ label: "Prod. 2024", value: `€${(stallion.stud.progeny_earnings_2024 / 1000).toFixed(0)}k` }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="pannello" style={{ padding: "14px 16px" }}>
                <div className="tabular" style={{ fontSize: "18px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>{value}</div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginTop: "4px" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Genealogy */}
          {stallion.pedigree && (stallion.pedigree.sire || stallion.pedigree.dam) && (
            <div className="pannello" style={panelStyle}>
              <div style={panelTitle}>Genealogia (clicca per navigare tra stalloni)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingRight: "16px" }}>
                  <PedigreeNode label="Nonno pat." name={stallion.pedigree.sire_sire} />
                  <PedigreeNode label="Nonna pat." name={stallion.pedigree.sire_dam} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "0 20px", position: "relative" }}>
                  <PedigreeNode label="Padre (Sire)" name={stallion.pedigree.sire} highlight />
                  <PedigreeNode label="Madre (Dam)" name={stallion.pedigree.dam} highlight />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "16px" }}>
                  <PedigreeNode label="Nonno mat." name={stallion.pedigree.dam_sire} />
                  <PedigreeNode label="Nonna mat." name={stallion.pedigree.dam_dam} />
                </div>
              </div>
            </div>
          )}

          {/* Grade distribution */}
          <div className="pannello" style={panelStyle}>
            <div style={panelTitle}>Distribuzione figli (in corsa)</div>
            <div style={{ display: "flex", height: "24px", borderRadius: "4px", overflow: "hidden", gap: "2px", marginBottom: "10px" }}>
              {GRADE_ORDER.map(g => {
                const cnt = stallion.gradeDist.find(d => d.grade === g)?.cnt ?? 0;
                if (!cnt) return null;
                return (
                  <div key={g} title={`${g}: ${cnt}`} style={{
                    flex: cnt,
                    background: conAlfa(GRADE_COLORS[g], 0.33),
                    borderTop: `3px solid ${GRADE_COLORS[g]}`,
                  }} />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {GRADE_ORDER.map(g => {
                const cnt = stallion.gradeDist.find(d => d.grade === g)?.cnt ?? 0;
                if (!cnt) return null;
                return (
                  <div key={g} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <GradeBadge grade={g} size="sm" />
                    <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 50%)" }}>{cnt}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Offspring by year (new panel) */}
          {stats?.offspringByYear && stats.offspringByYear.length > 0 && (
            <div className="pannello" style={panelStyle}>
              <div style={panelTitle}>Produzione per anno</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
                      {["Anno", "Figli totali", "Top (SSS+SS+S)", "Score medio", "Guadagno medio"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.offspringByYear.map((y, i) => (
                      <tr key={y.birth_year} style={{ borderBottom: i < stats.offspringByYear.length - 1 ? "1px solid hsl(220 10% 14%)" : "none" }}>
                        <td className="tabular" style={{ padding: "8px 10px", color: "hsl(210 8% 60%)", fontWeight: 600 }}>{y.birth_year}</td>
                        <td className="tabular" style={{ padding: "8px 10px", color: "hsl(210 8% 50%)" }}>{y.total}</td>
                        <td className="tabular" style={{ padding: "8px 10px", color: y.top_count > 0 ? "hsl(51 80% 55%)" : "hsl(210 8% 40%)" }}>{y.top_count}</td>
                        <td className="tabular" style={{ padding: "8px 10px", color: "hsl(183 60% 55%)" }}>{y.avg_score?.toFixed(1) ?? "—"}</td>
                        <td className="tabular" style={{ padding: "8px 10px", color: "hsl(51 80% 55%)" }}>€{y.avg_earn?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top children */}
          <div className="pannello" style={panelStyle}>
            <div style={panelTitle}>Top prodotti (per guadagni)</div>
            {/* Otto colonne non si stringono sotto una certa larghezza: invece
                di tagliarle fuori dallo schermo, la tabella scorre dentro il
                suo riquadro. */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
                  {["Cavallo", "Anno", "Voto", "Score", "Guadagni", "Record", "Win%", "% vs fratelli"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px 10px", fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(stats?.topOffspring ?? stallion.children).map((c, i, arr) => (
                  <tr key={`${c.name}-${c.birth_year}`} style={{ borderBottom: i < arr.length - 1 ? "1px solid hsl(220 10% 14%)" : "none", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <td style={{ padding: "9px 10px" }}>
                      <Link href={`/horse/${encodeURIComponent(c.name)}/${c.birth_year}`}>
                        <a style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 80%)", textDecoration: "none", letterSpacing: "0.03em", display: "flex", alignItems: "center", gap: "5px" }}>
                          <BandieraCavallo nome={c.name} /><span>{c.name}</span>
                        </a>
                      </Link>
                    </td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{c.birth_year}</td>
                    <td style={{ padding: "9px 10px" }}><GradeBadge grade={c.grade} size="sm" /></td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>{c.score?.toFixed(1)}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(51 80% 60%)" }}>€{c.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(183 70% 55%)" }}>{formatRecord(c.record_career)}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{c.win_rate != null ? `${c.win_rate.toFixed(1)}%` : "—"}</td>
                    <td className="tabular" style={{ padding: "9px 10px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>{c.sire_percentile != null ? `${c.sire_percentile.toFixed(0)}°` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Grade earnings map (context for ROI) */}
          {stats?.gradeEarnings && stats.gradeEarnings.length > 0 && (
            <div className="pannello" style={panelStyle}>
              <div style={panelTitle}>Guadagni medi per voto (tutta la popolazione)</div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {GRADE_ORDER.map(g => {
                  const ge = stats.gradeEarnings.find(e => e.grade === g);
                  if (!ge) return null;
                  return (
                    <div key={g} style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                      padding: "10px 14px", borderRadius: "8px",
                      background: "hsl(220 12% 12%)", border: "1px solid hsl(220 10% 17%)",
                      minWidth: "90px",
                    }}>
                      <GradeBadge grade={g} size="sm" />
                      <div className="tabular" style={{ fontSize: "13px", fontWeight: 700, color: "hsl(51 80% 60%)" }}>
                        €{ge.avg_earn >= 1000 ? `${(ge.avg_earn / 1000).toFixed(0)}k` : Math.round(ge.avg_earn)}
                      </div>
                      <div style={{ fontSize: "10px", color: "hsl(210 8% 40%)" }}>{ge.cnt} cavalli</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: "11px", color: "hsl(210 8% 40%)", marginTop: "10px" }}>
                Dati reali dal database StatIppica. Usati dal modello ROI per stimare il ritorno economico degli accoppiamenti.
              </div>
            </div>
          )}
        </>
      )}

      {!isSearch && !isLoading && !stallion && (
        <div style={{ fontSize: "14px", color: "hsl(0 62% 55%)" }}>Stallone non trovato.</div>
      )}
    </div>
  );
}
