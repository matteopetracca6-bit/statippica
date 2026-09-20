/**
 * client/src/pages/ValidazionePage.tsx — StatIppica
 *
 * Pagina di verifica dell'Advisor. Risponde a una domanda sola:
 * il consiglio di accoppiamento funziona davvero, o e' una storia raccontata
 * bene? Mostra il test su puledri mai visti dal modello, il confronto con i
 * metodi alternativi, il tetto teorico che la genetica impone e le fonti
 * scientifiche su cui poggia l'impostazione padre + madre.
 *
 * Tutti i numeri arrivano da /api/advisor/validation, prodotti dallo script
 * di addestramento: nessun valore e' scritto a mano in questa pagina.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TrottingHorseLoader from "../components/TrottingHorseLoader";
import { BookOpen, FlaskConical, Ruler, Target, TrendingUp } from "lucide-react";

const MUTED = "hsl(210 8% 45%)";
const DIM = "hsl(210 8% 35%)";
const TEXT = "hsl(210 10% 78%)";
const BORDER = "1px solid hsl(220 10% 14%)";
const PANEL = "hsl(220 12% 8%)";
const CYAN = "hsl(183 80% 55%)";

interface ModelRow {
  label: string; spearman: number; pearson: number;
  mae: number; note?: string;
  /** true quando il metodo sbircia il futuro: mostrato ma escluso dal confronto. */
  leaky?: boolean;
  top_decile: { top_mean: number; population_mean: number; lift: number; n_top: number };
}
interface Segment {
  label: string; note: string; n: number;
  spearman_advisor: number; spearman_solo_padre: number;
  spearman_con_nonna_materna?: number; n_con_nonna_informativa?: number;
  nota_nonna?: string;
}
interface Fonte {
  autori: string; anno: number; titolo: string; rivista: string;
  doi?: string; url: string; rilevanza: string;
}
interface Validation {
  cutoff_year: number;
  n_train: number;
  n_test: number;
  train_years: [number, number];
  test_years: [number, number];
  models: ModelRow[];
  segments?: Segment[];
  theoretical_ceiling?: {
    formula: string; spiegazione: string;
    valori: Record<string, number>;
    heritability_usata: Record<string, number>;
    fonti: string[];
  };
  scatter?: { pred: number; actual: number }[];
  science?: {
    sintesi: string; implicazione_modello: string;
    perche_la_precisione_e_bassa: string; fonti: Fonte[];
  };
}

function Section({ title, icon, children, sub }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; sub?: string;
}) {
  return (
    <section style={{ marginBottom: "34px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: sub ? "6px" : "14px" }}>
        <span style={{ color: CYAN }}>{icon}</span>
        <h2 style={{ fontSize: "16px", fontWeight: 800, color: "hsl(210 10% 88%)", margin: 0 }}>{title}</h2>
      </div>
      {sub && <p style={{ fontSize: "13px", color: MUTED, lineHeight: 1.6, margin: "0 0 14px" }}>{sub}</p>}
      {children}
    </section>
  );
}

/** Nuvola di punti previsto/reale, disegnata come SVG senza librerie. */
function ScatterPlot({ points }: { points: { pred: number; actual: number }[] }) {
  const W = 460, H = 300, PAD = 38;
  const xs = points.map(p => p.pred), ys = points.map(p => p.actual);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = 0, yMax = Math.max(100, Math.max(...ys));
  const sx = (v: number) => PAD + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD - 12);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD - 12);

  // media dei valori reali per fascia di previsione: la linea che conta
  const BINS = 10;
  const step = (xMax - xMin) / BINS || 1;
  const bins = Array.from({ length: BINS }, () => [] as number[]);
  points.forEach(p => {
    const i = Math.min(BINS - 1, Math.max(0, Math.floor((p.pred - xMin) / step)));
    bins[i].push(p.actual);
  });
  const line = bins
    .map((b, i) => (b.length >= 5
      ? { x: xMin + step * (i + 0.5), y: b.reduce((a, c) => a + c, 0) / b.length }
      : null))
    .filter(Boolean) as { x: number; y: number }[];

  return (
    <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={PAD} y1={H - PAD} x2={W - 12} y2={H - PAD} stroke="hsl(220 10% 20%)" strokeWidth={1} />
        <line x1={PAD} y1={12} x2={PAD} y2={H - PAD} stroke="hsl(220 10% 20%)" strokeWidth={1} />
        {[0, 25, 50, 75, 100].filter(v => v <= yMax).map(v => (
          <g key={v}>
            <line x1={PAD} y1={sy(v)} x2={W - 12} y2={sy(v)} stroke="hsl(220 10% 16%)" strokeWidth={1} strokeDasharray="3 4" />
            <text x={PAD - 6} y={sy(v) + 4} textAnchor="end" fontSize={10} fill={DIM}>{v}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.pred)} cy={sy(p.actual)} r={1.6} fill={CYAN} opacity={0.18} />
        ))}
        {line.length > 1 && (
          <polyline
            points={line.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ")}
            fill="none" stroke="hsl(35 90% 58%)" strokeWidth={2.5} strokeLinejoin="round"
          />
        )}
        <text x={(W + PAD) / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={MUTED}>
          voto previsto dall'Advisor
        </text>
        <text x={12} y={H / 2} textAnchor="middle" fontSize={11} fill={MUTED}
          transform={`rotate(-90 12 ${H / 2})`}>voto realmente ottenuto</text>
      </svg>
      <div style={{ fontSize: "11px", color: DIM, marginTop: "8px", lineHeight: 1.5 }}>
        Ogni puntino e' un puledro nato dopo il 2019, che il modello non aveva mai visto.
        La linea arancione e' la media reale per fascia di previsione: se sale da sinistra
        a destra, vuol dire che una previsione piu' alta corrisponde davvero a cavalli
        migliori. La nuvola resta larga perche' il singolo puledro non e' prevedibile.
      </div>
    </div>
  );
}

export default function ValidazionePage() {
  const { data, isLoading } = useQuery<Validation>({
    queryKey: ["/api/advisor/validation"],
    queryFn: () => apiRequest("GET", "/api/advisor/validation").then(r => r.json()),
    staleTime: 600000,
  });

  if (isLoading) return <TrottingHorseLoader label="Carico la verifica del modello..." />;
  // Guardia: se la verifica non e' stata ancora generata, meglio un messaggio
  // che una pagina bianca. Senza questo controllo un campo mancante faceva
  // sparire tutto il sito, non solo questa sezione.
  if (!data || !data.models || data.models.length === 0) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 20px", color: MUTED, fontSize: "14px", lineHeight: 1.6 }}>
        La verifica del modello non e' ancora disponibile. Viene rigenerata
        insieme all'aggiornamento notturno dei dati.
      </div>
    );
  }

  const best = Math.max(...data.models.map(m => Math.abs(m.spearman)));
  const ceil = data.theoretical_ceiling;
  const advisor = data.models[0];

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "28px 20px 60px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 90%)", margin: "0 0 8px" }}>
        Il consiglio funziona davvero?
      </h1>
      <p style={{ fontSize: "14px", color: MUTED, lineHeight: 1.65, margin: "0 0 30px" }}>
        Un consiglio di accoppiamento e' facile da scrivere e difficile da dimostrare.
        Questa pagina mette alla prova l'Advisor nell'unico modo onesto: gli si nascondono
        i puledri nati dopo il {data.cutoff_year}, lo si addestra solo su quelli nati prima,
        e poi gli si chiede di ordinare i figli che non ha mai visto. Se l'ordine che
        propone somiglia a quello vero, il metodo funziona.
      </p>

      <Section
        title="Come e' stata fatta la prova"
        icon={<FlaskConical size={17} />}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
          {[
            { k: "Puledri per imparare", v: data.n_train.toLocaleString("it-IT"), n: `nati fino al ${data.cutoff_year}` },
            { k: "Puledri per la prova", v: data.n_test.toLocaleString("it-IT"), n: `nati dal ${data.test_years[0]} al ${data.test_years[1]}, mai visti` },
            { k: "Accordo con la realta'", v: advisor.spearman.toFixed(3), n: "0 = a caso, 1 = ordine perfetto" },
            { k: "Guadagno sul podio", v: `+${advisor.top_decile.lift.toFixed(1)}`, n: "punti di voto in piu' nel 10% piu' consigliato" },
          ].map(b => (
            <div key={b.k} style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px" }}>
              <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.k}</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: CYAN, margin: "3px 0" }}>{b.v}</div>
              <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.4 }}>{b.n}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Confronto con i metodi alternativi"
        icon={<TrendingUp size={17} />}
        sub="Ogni riga e' un modo diverso di scegliere lo stallone, messo alla prova sugli stessi puledri. La barra misura quanto l'ordine proposto somiglia a quello reale."
      >
        <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px" }}>
          {data.models.map(m => {
            const w = (Math.abs(m.spearman) / (best || 1)) * 100;
            const falsato = m.leaky === true;
            const color = falsato ? "hsl(35 85% 55%)" : m.spearman <= 0 ? "hsl(0 55% 50%)" : CYAN;
            return (
              <div key={m.label} style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "4px", gap: "10px" }}>
                  <span style={{ color: falsato ? "hsl(35 85% 60%)" : TEXT, fontWeight: 600 }}>
                    {m.label}{falsato && " — non valido"}
                  </span>
                  <span className="tabular" style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {m.spearman >= 0 ? "+" : ""}{m.spearman.toFixed(3)}
                  </span>
                </div>
                <div style={{ height: "8px", background: "hsl(220 10% 12%)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${Math.max(1, w)}%`, borderRadius: "4px",
                    background: falsato
                      ? "repeating-linear-gradient(45deg, hsl(35 70% 40%), hsl(35 70% 40%) 4px, hsl(35 85% 55%) 4px, hsl(35 85% 55%) 8px)"
                      : `linear-gradient(90deg, hsl(183 50% 30%), ${color})`,
                  }} />
                </div>
                {m.note && (
                  <div style={{ fontSize: "10.5px", color: falsato ? "hsl(35 60% 52%)" : DIM, marginTop: "3px", lineHeight: 1.45 }}>
                    {m.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {ceil && (
        <Section
          title="Quanto si puo' arrivare al massimo"
          icon={<Ruler size={17} />}
          sub={ceil.spiegazione}
        >
          <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "16px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Tetto teorico sui guadagni
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "hsl(35 85% 58%)" }}>
                  {ceil.valori.guadagni_basso?.toFixed(2)} – {ceil.valori.guadagni_alto?.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Risultato dell'Advisor
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: CYAN }}>{advisor.spearman.toFixed(3)}</div>
              </div>
            </div>
            <p style={{ fontSize: "12.5px", color: TEXT, lineHeight: 1.65, margin: 0 }}>
              L'ereditabilita' dei guadagni nel trotto misurata dalla letteratura sta fra{" "}
              {ceil.heritability_usata.guadagni_basso} e {ceil.heritability_usata.guadagni_alto}.
              Da questa si ricava, con {ceil.formula}, il massimo che qualunque previsione
              basata sui genitori puo' raggiungere sul singolo figlio. L'Advisor arriva a{" "}
              {advisor.spearman.toFixed(3)}: vicino al limite inferiore di quel tetto.
              Un modello che dichiarasse 0,80 su questi dati non sarebbe bravo, starebbe
              sbagliando la prova.
            </p>
            <div style={{ fontSize: "10.5px", color: DIM, marginTop: "10px", lineHeight: 1.5 }}>
              Ereditabilita' di riferimento da: {ceil.fonti.join(" · ")}
            </div>
          </div>
        </Section>
      )}

      {data.segments && data.segments.length > 0 && (
        <Section
          title="Dove il consiglio e' solido e dove no"
          icon={<Target size={17} />}
          sub="Lo stesso modello non ha la stessa precisione per tutte le fattrici. Dichiararlo e' parte del risultato."
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
            {data.segments.map(s => (
              <div key={s.label} style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: TEXT, marginBottom: "3px" }}>{s.label}</div>
                <div style={{ fontSize: "11px", color: DIM, marginBottom: "10px" }}>
                  {s.n.toLocaleString("it-IT")} puledri nella prova
                </div>
                {[
                  ["Advisor (padre + madre)", s.spearman_advisor, CYAN],
                  ["Solo il padre", s.spearman_solo_padre, "hsl(210 8% 55%)"],
                  ...(s.spearman_con_nonna_materna !== undefined
                    ? [["Con la nonna materna", s.spearman_con_nonna_materna, "hsl(280 60% 65%)"] as const]
                    : []),
                ].map(([l, v, c]) => (
                  <div key={l as string} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0" }}>
                    <span style={{ color: MUTED }}>{l}</span>
                    <span className="tabular" style={{ color: c as string, fontWeight: 700 }}>
                      {(v as number) >= 0 ? "+" : ""}{(v as number).toFixed(3)}
                    </span>
                  </div>
                ))}
                <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.55, marginTop: "9px", paddingTop: "9px", borderTop: BORDER }}>
                  {s.note}{s.nota_nonna ? " " + s.nota_nonna : ""}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.scatter && data.scatter.length > 0 && (
        <Section title="Previsto contro reale" icon={<Target size={17} />}>
          <ScatterPlot points={data.scatter} />
        </Section>
      )}

      {data.science && (
        <Section
          title="Basi scientifiche"
          icon={<BookOpen size={17} />}
          sub={data.science.sintesi}
        >
          <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "16px 18px", marginBottom: "14px" }}>
            <p style={{ fontSize: "12.5px", color: TEXT, lineHeight: 1.65, margin: "0 0 10px" }}>
              {data.science.implicazione_modello}
            </p>
            <p style={{ fontSize: "12.5px", color: TEXT, lineHeight: 1.65, margin: 0 }}>
              {data.science.perche_la_precisione_e_bassa}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {data.science.fonti.map(f => (
              <div key={f.titolo} style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "13px 16px" }}>
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "13px", fontWeight: 700, color: CYAN, textDecoration: "none", lineHeight: 1.45 }}>
                  {f.titolo}
                </a>
                <div style={{ fontSize: "11.5px", color: MUTED, margin: "3px 0 6px" }}>
                  {f.autori} ({f.anno}) — {f.rivista}{f.doi ? ` · DOI ${f.doi}` : ""}
                </div>
                <div style={{ fontSize: "12px", color: "hsl(210 8% 60%)", lineHeight: 1.6 }}>{f.rilevanza}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
