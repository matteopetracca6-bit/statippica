import { useQuery } from "@tanstack/react-query";
import { coloreScheda } from "@/lib/sezioni";
import { formatRecord } from "@/lib/record";
import { useLocation, useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import LineaMaterna from "../components/LineaMaterna";
import GradeBadge from "../components/GradeBadge";
import { Heart } from "lucide-react";
import IntestazioneScheda from "../components/IntestazioneScheda";
import { Cifra } from "../components/DueColonne";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento } from "../components/Caricamento";

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
    n_gare?: number;   // gare nell'archivio: se > 0 c'e' la scheda da atleta
  } | null;
  offspring: Offspring[];
  // Figli nati prima che la cavalla avesse due anni: sono di un'omonima.
  figli_omonima?: { name: string; birth_year: number | null }[];
}

function eur(v: number | null | undefined): string {
  if (!v) return "—";
  return "€ " + Math.round(v).toLocaleString("it-IT");
}

const TITOLO_SEZ: React.CSSProperties = {
  fontSize: "10.5px", color: "hsl(210 8% 48%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10, background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 17%)",
      minWidth: "140px",
      flex: "1 1 140px" }}>
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
    return <Caricamento testo="Carico la scheda..." />;
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
    <div className="page-shell">
      <IntestazioneScheda
        indietro={{ href: "/fattrici", testo: "Tutte le fattrici" }}
        icona={Heart} colore={coloreScheda("/fattrici")} tipo="Fattrice" titolo={data.dam}
        accanto={s ? <GradeBadge grade={s.grade} /> : undefined}
        sotto={<>
          {own?.birth_year ? `Nata nel ${own.birth_year}` : "Anno di nascita non disponibile"}
          {own?.sire ? <> · figlia di <Link href={`/stallion/${encodeURIComponent(own.sire)}`} className="collegamento-scheda">{own.sire}</Link></> : ""}
          {own?.dam ? ` e di ${own.dam}` : ""}
          {own?.birth_year && (own.n_gare ?? 0) > 0 ? <> · <Link href={`/horse/${encodeURIComponent(own.name)}/${own.birth_year}`}
            className="collegamento-scheda" data-testid="link-scheda-atleta">vedi la sua scheda da atleta ({own.n_gare} gare) →</Link></> : null}
        </>}
        cifre={s ? <>
          <Cifra titolo="Voto progenie" valore={s.final_score.toFixed(1).replace(".", ",")} colore={coloreScheda("/fattrici")} sotto={`grado ${s.grade}`} />
          <Cifra titolo="Figli valutati" valore={String(s.n_valutati)} sotto={`su ${s.n_figli_totali} citati`} />
          <Cifra titolo="Figli in attività" valore={String(s.n_in_corsa || 0)} sotto="ultimi 6 mesi" />
          <Cifra titolo="Figli di vertice" valore={`${s.n_SSS + s.n_SS + s.n_S}`} colore="hsl(183 80% 55%)" sotto={`${s.pct_top_S?.toFixed(0)}% della progenie`} />
          <Cifra titolo="Guadagno medio figli" valore={eur(s.avg_earnings)} colore="hsl(45 80% 62%)" />
        </> : undefined}
        avviso={!s ? (
          <div style={{ fontSize: 13, color: "hsl(210 8% 65%)" }}>
            Nessun figlio ha ancora un voto, quindi non è possibile calcolare il voto della progenie.
          </div>
        ) : undefined}
      />

      {/* Carriera propria: un riquadro col titolo piccolo in alto, come nelle
          altre schede singole (allenatore, proprietario, guidatore). */}
      <div className="pannello" style={{ padding: "16px 18px", marginBottom: "22px" }} data-testid="carriera-fattrice">
      <div style={TITOLO_SEZ}>La sua carriera</div>
      <Spiegazione titolo="Dove trovo le sue gare" compatta>
        Qui ci sono i totali di carriera. Quando le sue corse sono nell'archivio, l'elenco gara per
        gara è nella sua scheda da atleta (il collegamento è sotto il nome). Ogni notte il sito
        recupera la carriera di altre fattrici che hanno corso, se la fonte la rende disponibile.
        I totali non incidono sul voto della progenie, servono a leggerlo.
      </Spiegazione>
      {ownRaces > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <Stat label="Corse" value={String(ownRaces)} />
          <Stat label="Vittorie" value={String(s?.own_wins ?? own?.career_wins ?? 0)} />
          <Stat label="Guadagni" value={eur(s?.own_earnings ?? own?.career_earnings)} />
          <Stat label="Record" value={formatRecord(s?.own_record || own?.record_career)} />
          {s?.own_grade && <Stat label="Suo voto da atleta" value={s.own_grade} />}
        </div>
      ) : (
        <div style={{ fontSize: "13px", color: "hsl(210 8% 65%)" }}>
          Carriera non ancora recuperata. Il lavoro notturno recupera i totali dei riproduttori a
          gruppi: questa fattrice è in coda.
        </div>
      )}
      </div>

      {/* Progenie */}
      <div className="pannello" style={{ overflowX: "auto" }}>
        <div style={{ ...TITOLO_SEZ, padding: "14px 16px 0" }}>Progenie · {data.offspring.length} {data.offspring.length === 1 ? "figlio" : "figli"}</div>
        {data.offspring.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                <td style={{ ...cell, textAlign: "right" }}>{formatRecord(o.record_career)}</td>
              </tr>
            ))}
          </tbody>
        </table>}
        {data.offspring.length === 0 && (
          <div style={{ padding: "12px 16px", fontSize: 13, color: "hsl(210 8% 60%)" }}>Nessun figlio di questa cavalla in archivio.</div>
        )}
        {(data.figli_omonima?.length ?? 0) > 0 && (
          <div data-testid="nota-omonima" style={{ margin: "4px 16px 14px", padding: "10px 12px", borderRadius: 8,
            background: "hsl(40 60% 50% / 0.08)", border: "1px solid hsl(40 60% 50% / 0.3)", fontSize: 13, lineHeight: 1.5 }}>
            {data.figli_omonima!.map((f, i) => (
              <span key={f.name}>{i > 0 ? (i === data.figli_omonima!.length - 1 ? " e " : ", ") : ""}
                <Link href={`/horse/${encodeURIComponent(f.name)}/${f.birth_year}`} className="collegamento-scheda">{f.name}</Link>
                {f.birth_year ? ` (${f.birth_year})` : ""}</span>
            ))}
            {data.figli_omonima!.length === 1 ? " risulta figlio" : " risultano figli"} di un'altra {data.dam}, nata prima,
            che non è nel nostro archivio: {own?.birth_year ? `questa è nata nel ${own.birth_year} e ` : ""}non può esserne la madre.
          </div>
        )}
      </div>

      {/* Novembre 2026: madre, nonna e bisnonna della fattrice con i loro figli */}
      <div style={{ marginTop: 24 }}>
        <LineaMaterna nome={data.dam} titolo={`La famiglia di ${data.dam}`} />
      </div>
    </div>
  );
}
