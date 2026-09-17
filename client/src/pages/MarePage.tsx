import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import { ArrowLeft } from "lucide-react";

/**
 * Scheda di una FATTRICE: voto sulla progenie + elenco dei figli.
 * La carriera propria (own_*) sono i TOTALI recuperati da UNIRE, non le singole
 * gare: per i riproduttori la fonte fornisce solo gli aggregati.
 */

interface Offspring {
  name: string;
  birth_year: number;
  sex: string | null;
  sire: string | null;
  grade: string | null;
  score: number | null;
  career_races: number | null;
  career_wins: number | null;
  career_earnings: number | null;
  record_career: string | null;
}

interface MareDetail {
  dam: string;
  stats: {
    n_figli_totali: number;
    n_valutati: number;
    n_in_corsa: number;
    final_score: number;
    grade: string;
    n_SSS: number;
    n_SS: number;
    n_S: number;
    pct_top_S: number;
    avg_earnings: number;
    own_races: number | null;
    own_wins: number | null;
    own_earnings: number | null;
    own_record: string | null;
    own_grade: string | null;
  } | null;
  own: {
    name: string;
    birth_year: number | null;
    sire: string | null;
    dam: string | null;
    country: string | null;
    career_races: number | null;
    career_wins: number | null;
    career_earnings: number | null;
    record_career: string | null;
  } | null;
  offspring: Offspring[];
}

function eur(v: number | null | undefined): string {
  if (!v) return "—";
  return "€ " + Math.round(v).toLocaleString("it-IT");
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{
      background: "hsl(220 12% 10%)",
      border: "1px solid hsl(220 10% 16%)",
      borderRadius: "10px",
      padding: "12px 14px",
      minWidth: "140px",
      flex: "1 1 140px",
    }}>
      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "hsl(210 8% 55%)", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: "19px", fontWeight: 800, color: "hsl(210 10% 93%)", marginTop: "4px" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: "11px", color: "hsl(210 8% 50%)", marginTop: "2px" }}>{hint}</div>}
    </div>
  );
}

export default function MarePage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const name = decodeURIComponent(params.name || "");

  const { data, isLoading, isError } = useQuery<MareDetail>({
    queryKey: ["/api/mare", name],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/mare/${encodeURIComponent(name)}`);
      return r.json();
    },
  });

  if (isLoading) {
    return <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 55%)", fontSize: "13px" }}>Caricamento…</div>;
  }
  if (isError || !data) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "hsl(210 8% 60%)", fontSize: "13px" }}>
        Fattrice non trovata.
        <div style={{ marginTop: "12px" }}>
          <Link href="/fattrici"><a style={{ color: "hsl(183 80% 60%)" }}>Torna all'elenco fattrici</a></Link>
        </div>
      </div>
    );
  }

  const s = data.stats;
  const own = data.own;
  const ownRaces = s?.own_races || own?.career_races || 0;

  const head: React.CSSProperties = {
    padding: "10px 12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.04em", color: "hsl(210 8% 58%)", textAlign: "left", whiteSpace: "nowrap",
    borderBottom: "1px solid hsl(220 10% 16%)",
  };
  const cell: React.CSSProperties = {
    padding: "10px 12px", fontSize: "13px", color: "hsl(210 10% 88%)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "20px 20px 48px" }}>
      <Link href="/fattrici">
        <a style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "hsl(210 8% 60%)", textDecoration: "none", marginBottom: "14px" }}>
          <ArrowLeft size={14} /> Fattrici
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
        <h1 style={{ fontSize: "27px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: 0 }}>{data.dam}</h1>
        {s && <GradeBadge grade={s.grade} />}
      </div>
      <p style={{ fontSize: "12px", color: "hsl(210 8% 58%)", margin: "0 0 18px" }}>
        {own?.birth_year ? `Nata nel ${own.birth_year}` : "Anno di nascita non disponibile"}
        {own?.sire ? ` · padre ${own.sire}` : ""}
        {own?.dam ? ` · madre ${own.dam}` : ""}
      </p>

      {s ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "22px" }}>
          <Stat label="Voto progenie" value={s.final_score.toFixed(1)} hint={`grado ${s.grade}`} />
          <Stat label="Figli valutati" value={String(s.n_valutati)} hint={`su ${s.n_figli_totali} citati`} />
          <Stat label="Figli in attività" value={String(s.n_in_corsa || 0)} hint="ultimi 6 mesi" />
          <Stat label="Figli di vertice" value={`${s.n_SSS + s.n_SS + s.n_S}`} hint={`${s.pct_top_S?.toFixed(0)}% della progenie`} />
          <Stat label="Guadagno medio figli" value={eur(s.avg_earnings)} />
        </div>
      ) : (
        <div style={{
          border: "1px solid hsl(220 10% 16%)", background: "hsl(220 12% 10%)",
          borderRadius: "10px", padding: "14px", marginBottom: "22px",
          fontSize: "13px", color: "hsl(210 8% 65%)",
        }}>
          Nessun figlio ha ancora un voto, quindi non è possibile calcolare il voto della progenie.
        </div>
      )}

      {/* Carriera propria */}
      <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)", margin: "0 0 8px" }}>
        La sua carriera
      </h2>
      <p style={{ fontSize: "12px", color: "hsl(210 8% 55%)", margin: "0 0 10px", maxWidth: "720px", lineHeight: 1.5 }}>
        Sono i totali di carriera, non l'elenco delle singole corse: per i riproduttori la fonte
        fornisce solo i dati aggregati. Non incidono sul voto della progenie, servono a leggerlo.
      </p>
      {ownRaces > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
          <Stat label="Corse" value={String(ownRaces)} />
          <Stat label="Vittorie" value={String(s?.own_wins ?? own?.career_wins ?? 0)} />
          <Stat label="Guadagni" value={eur(s?.own_earnings ?? own?.career_earnings)} />
          <Stat label="Record" value={s?.own_record || own?.record_career || "—"} />
          {s?.own_grade && <Stat label="Suo voto da atleta" value={s.own_grade} />}
        </div>
      ) : (
        <div style={{
          border: "1px solid hsl(220 10% 16%)", background: "hsl(220 12% 10%)",
          borderRadius: "10px", padding: "14px", marginBottom: "24px",
          fontSize: "13px", color: "hsl(210 8% 65%)",
        }}>
          Carriera non ancora recuperata. Il lavoro notturno recupera i totali dei riproduttori a
          gruppi: questa fattrice è in coda.
        </div>
      )}

      {/* Progenie */}
      <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)", margin: "0 0 10px" }}>
        Progenie ({data.offspring.length})
      </h2>
      <div style={{ overflowX: "auto", border: "1px solid hsl(220 10% 16%)", borderRadius: "10px", background: "hsl(220 12% 9%)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>Figlio</th>
              <th style={head}>Anno</th>
              <th style={head}>Sesso</th>
              <th style={head}>Padre</th>
              <th style={head}>Voto</th>
              <th style={{ ...head, textAlign: "right" }}>Corse</th>
              <th style={{ ...head, textAlign: "right" }}>Vittorie</th>
              <th style={{ ...head, textAlign: "right" }}>Guadagni</th>
              <th style={{ ...head, textAlign: "right" }}>Record</th>
            </tr>
          </thead>
          <tbody>
            {data.offspring.map((o, i) => (
              <tr
                key={`${o.name}-${o.birth_year}`}
                onClick={() => navigate(`/horse/${encodeURIComponent(o.name)}/${o.birth_year}`)}
                style={{
                  cursor: "pointer",
                  background: i % 2 ? "hsl(220 12% 10%)" : "transparent",
                  borderTop: "1px solid hsl(220 10% 13%)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "hsl(220 12% 14%)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 ? "hsl(220 12% 10%)" : "transparent"; }}
              >
                <td style={{ ...cell, fontWeight: 600 }}>{o.name}</td>
                <td style={cell}>{o.birth_year ?? "—"}</td>
                <td style={cell}>{o.sex || "—"}</td>
                <td style={cell}>{o.sire || "—"}</td>
                <td style={cell}>{o.grade ? <GradeBadge grade={o.grade} /> : <span style={{ color: "hsl(210 8% 48%)" }}>non valutato</span>}</td>
                <td style={{ ...cell, textAlign: "right" }}>{o.career_races ?? "—"}</td>
                <td style={{ ...cell, textAlign: "right" }}>{o.career_wins ?? "—"}</td>
                <td style={{ ...cell, textAlign: "right" }}>{eur(o.career_earnings)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{o.record_career || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
