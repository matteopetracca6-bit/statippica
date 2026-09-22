/**
 * client/src/components/AdvisorInsights.tsx — StatIppica
 *
 * Blocchi della pagina Advisor che spiegano una singola coppia
 * stallone x fattrice:
 *   PredictionCard   voto atteso, fascia di incertezza, probabilita'
 *   ReasonsList      le ragioni della stima, in italiano
 *   InbreedingDetail consanguineita' calcolata sul pedigree
 *   RulesPanel       controllo rispetto al disciplinare UNIRE
 *
 * Sono componenti di sola lettura: ricevono i dati dall'API e li disegnano.
 */

import { AlertCircle, CheckCircle2, HelpCircle, Info, Scale, XCircle } from "lucide-react";
import GradeBadge from "./GradeBadge";

const MUTED = "hsl(210 8% 45%)";
const DIM = "hsl(210 8% 35%)";
const PANEL = "hsl(220 12% 8%)";
const BORDER = "1px solid hsl(220 10% 14%)";
const CYAN = "hsl(183 80% 55%)";

export interface Prediction {
  expected_score: number;
  expected_grade: string;
  population_mean: number;
  typical_low: number;
  typical_high: number;
  /** Fascia larga: 9 puledri su 10 cadono qui. */
  band_low: number;
  band_high: number;
  prob_top: number;
  prob_poor: number;
  confidence: number;
  confidence_label: string;
  sire: { effect: number; n_offspring: number; avg_score: number | null; source: string };
  dam: { effect: number; n_offspring: number; avg_score: number | null; source: string };
}

export interface InbreedingDetail {
  /** false quando manca il pedigree di uno dei due: nessun calcolo possibile. */
  available: boolean;
  coefficient_pct: number;
  level: string;
  label?: string;
  common_ancestors: { name: string; paths_sire: number; paths_dam: number; contribution_pct: number }[];
  note: string;
}

export interface RuleCheck {
  id: string; articolo: string; titolo: string;
  esito: "conforme" | "non_conforme" | "non_verificabile" | "attenzione";
  dettaglio: string;
}

export interface Eligibility {
  stallone: string; fattrice: string;
  controlli: RuleCheck[];
  esito_complessivo: string;
  avvertenza: string;
  fonte: { titolo: string; ente: string; base_legge: string; versione: string; url: string };
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px", color: "hsl(210 8% 42%)", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px",
      display: "flex", alignItems: "center", gap: "6px",
    }}>
      {icon}{children}
    </div>
  );
}

/** Voto atteso con fascia di incertezza disegnata su una scala 0-100. */
export function PredictionCard({ p }: { p: Prediction }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const left = clamp(p.band_low);
  const width = Math.max(1, clamp(p.band_high) - left);
  const tLeft = clamp(p.typical_low);
  const tWidth = Math.max(1, clamp(p.typical_high) - tLeft);
  // Lo scarto dalla media generale si ricava qui: e' una sottrazione, non
  // serve che arrivi dal server.
  const delta = p.expected_score - p.population_mean;
  // Il colore segue la quantita' di dati sui genitori. Non e' un semaforo sulla
  // bonta' del consiglio: quella e' un'altra cosa, e la dice l'avviso qui sotto.
  const confColor = p.confidence_label === "molti dati" ? "hsl(100 60% 50%)"
    : p.confidence_label === "dati sufficienti" ? "hsl(45 85% 55%)" : "hsl(25 80% 55%)";

  return (
    <div style={{ marginBottom: "18px" }}>
      <SectionTitle icon={<Info size={12} />}>Voto atteso del puledro</SectionTitle>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "14px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "hsl(210 10% 88%)", lineHeight: 1 }}>
            {p.expected_score.toFixed(1)}
          </div>
          <GradeBadge grade={p.expected_grade} size="sm" />
        </div>
        <div style={{ fontSize: "12px", color: MUTED, paddingBottom: "3px" }}>
          media di tutti i puledri {p.population_mean.toFixed(1)} ·{" "}
          <span style={{ color: delta >= 0 ? "hsl(100 60% 55%)" : "hsl(0 60% 58%)", fontWeight: 700 }}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}
          </span>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", paddingBottom: "2px" }}>
          {/* Si chiamava "Attendibilita'", e non lo era: questo numero dice
              soltanto quanti figli valutati hanno i due genitori, cioe' quanto
              e' ben misurato l'indizio di partenza. Un indizio ben misurato
              resta un indizio debole se il modello che lo usa spiega il 2,3%
              dei risultati. La parola vecchia prometteva quello che il modello
              non mantiene. */}
          <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Dati sui genitori
          </div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: confColor }}>{p.confidence_label}</div>
        </div>
      </div>

      {/* Fascia di incertezza */}
      <div style={{ position: "relative", height: "34px", marginBottom: "6px" }}>
        <div style={{ position: "absolute", top: "12px", left: 0, right: 0, height: "8px", background: "hsl(220 10% 12%)", borderRadius: "4px" }} />
        <div title="Intervallo largo: 9 puledri su 10 cadono qui" style={{
          position: "absolute", top: "12px", left: `${left}%`, width: `${width}%`,
          height: "8px", background: "hsl(183 40% 30% / 0.55)", borderRadius: "4px",
        }} />
        <div title="Fascia tipica: 5 puledri su 10 cadono qui" style={{
          position: "absolute", top: "10px", left: `${tLeft}%`, width: `${tWidth}%`,
          height: "12px", background: `linear-gradient(90deg, hsl(183 60% 35%), ${CYAN})`,
          borderRadius: "4px",
        }} />
        <div style={{
          position: "absolute", top: "4px", left: `${clamp(p.expected_score)}%`,
          width: "3px", height: "24px", background: "hsl(210 10% 92%)",
          borderRadius: "2px", transform: "translateX(-1.5px)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: DIM, marginBottom: "12px" }}>
        <span>0</span>
        <span style={{ color: MUTED }}>
          meta' dei puledri fra {p.typical_low.toFixed(0)} e {p.typical_high.toFixed(0)} ·
          quasi tutti fra {p.band_low.toFixed(0)} e {p.band_high.toFixed(0)}
        </span>
        <span>100</span>
      </div>

      {/* Probabilita' e contributi */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        {[
          { label: "Figlio di alto livello", value: `${p.prob_top.toFixed(0)}%`, color: "hsl(100 60% 55%)", note: "voto 60 o piu'" },
          { label: "Figlio deludente", value: `${p.prob_poor.toFixed(0)}%`, color: "hsl(0 60% 58%)", note: "voto sotto 20" },
          {
            label: "Indizio dal padre",
            value: p.sire.avg_score !== null ? p.sire.avg_score.toFixed(1) : "—",
            color: CYAN,
            note: `${p.sire.n_offspring} figli osservati`,
          },
          {
            label: "Indizio dalla madre",
            value: p.dam.avg_score !== null ? p.dam.avg_score.toFixed(1) : "—",
            color: "hsl(280 60% 65%)",
            note: p.dam.source,
          },
        ].map(b => (
          <div key={b.label} style={{ background: "hsl(220 10% 11%)", border: BORDER, borderRadius: "8px", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.label}</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: b.color, margin: "2px 0" }}>{b.value}</div>
            <div style={{ fontSize: "10px", color: DIM }}>{b.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Le ragioni della stima, scritte in italiano dal motore. */
export function ReasonsList({ reasons }: { reasons: string[] }) {
  if (!reasons?.length) return null;
  return (
    <div style={{ marginBottom: "18px" }}>
      <SectionTitle icon={<HelpCircle size={12} />}>Perche' questa stima</SectionTitle>
      <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "5px" }}>
        {reasons.map((r, i) => (
          <li key={i} style={{ fontSize: "12.5px", color: "hsl(210 8% 62%)", lineHeight: 1.5 }}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/** Consanguineita': coefficiente di Wright e antenati in comune. */
export function InbreedingPanel({ inb }: { inb: InbreedingDetail }) {
  // Senza pedigree non si puo' dire "nessuna consanguineita'": sarebbe una
  // rassicurazione non guadagnata. Si dichiara che il controllo non e' stato
  // possibile.
  if (inb.available === false) {
    return (
      <div style={{ marginBottom: "18px" }}>
        <SectionTitle icon={<AlertCircle size={12} />}>Consanguineita'</SectionTitle>
        <div style={{ background: "hsl(220 10% 11%)", border: BORDER, borderRadius: "8px", padding: "12px 14px" }}>
          <div style={{ fontSize: "13px", color: "hsl(45 70% 58%)", fontWeight: 700, marginBottom: "4px" }}>
            Non verificabile
          </div>
          <div style={{ fontSize: "11.5px", color: MUTED, lineHeight: 1.55 }}>{inb.note}</div>
        </div>
      </div>
    );
  }
  const color = inb.level === "alta" ? "hsl(0 65% 58%)"
    : inb.level === "media" ? "hsl(35 85% 58%)"
    : inb.level === "bassa" ? "hsl(60 70% 55%)" : "hsl(100 55% 50%)";
  const bg = inb.level === "alta" ? "hsl(0 50% 20% / 0.28)"
    : inb.level === "media" ? "hsl(35 50% 20% / 0.25)" : "hsl(220 10% 11%)";

  return (
    <div style={{ marginBottom: "18px" }}>
      <SectionTitle icon={<AlertCircle size={12} />}>Consanguineita'</SectionTitle>
      <div style={{ background: bg, border: `1px solid ${inb.level === "nessuna" ? "hsl(220 10% 14%)" : color}`, borderRadius: "8px", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color }}>{inb.coefficient_pct.toFixed(2)}%</div>
          <div style={{ fontSize: "12.5px", color: "hsl(210 8% 62%)" }}>
            {inb.label || `consanguineita' ${inb.level}`}
          </div>
        </div>
        {(inb.common_ancestors?.length ?? 0) > 0 && (
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {inb.common_ancestors.slice(0, 6).map(a => (
              <div key={a.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", gap: "10px" }}>
                <span style={{ color: "hsl(210 8% 68%)" }}>{a.name}</span>
                <span className="tabular" style={{ color: MUTED, whiteSpace: "nowrap" }}>
                  lato padre {a.paths_sire} · lato madre {a.paths_dam} · {a.contribution_pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: "10.5px", color: DIM, marginTop: "10px", lineHeight: 1.5 }}>{inb.note}</div>
      </div>
    </div>
  );
}

const ESITO_STYLE: Record<string, { color: string; icon: React.ReactNode; testo: string }> = {
  conforme: { color: "hsl(100 55% 50%)", icon: <CheckCircle2 size={14} />, testo: "requisito soddisfatto" },
  non_conforme: { color: "hsl(0 65% 58%)", icon: <XCircle size={14} />, testo: "ostacolo" },
  attenzione: { color: "hsl(35 85% 58%)", icon: <AlertCircle size={14} />, testo: "attenzione" },
  non_verificabile: { color: "hsl(210 8% 50%)", icon: <HelpCircle size={14} />, testo: "da verificare" },
};

/** Controllo della coppia rispetto al disciplinare del Libro genealogico. */
export function RulesPanel({ el }: { el: Eligibility }) {
  const esitoColor = el.esito_complessivo === "ostacolo rilevato" ? "hsl(0 65% 58%)"
    : el.esito_complessivo === "verifiche necessarie" ? "hsl(35 85% 58%)" : "hsl(100 55% 50%)";

  return (
    <div style={{ marginBottom: "18px" }}>
      <SectionTitle icon={<Scale size={12} />}>Regole del Libro genealogico</SectionTitle>
      <div style={{ background: "hsl(220 10% 11%)", border: BORDER, borderRadius: "8px", padding: "12px 14px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: esitoColor, marginBottom: "10px" }}>
          {el.esito_complessivo.charAt(0).toUpperCase() + el.esito_complessivo.slice(1)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {el.controlli.map(c => {
            const st = ESITO_STYLE[c.esito] ?? ESITO_STYLE.non_verificabile;
            return (
              <div key={c.id} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
                <span style={{ color: st.color, marginTop: "2px", flexShrink: 0 }}>{st.icon}</span>
                <div>
                  <div style={{ fontSize: "12.5px", color: "hsl(210 10% 75%)", fontWeight: 600 }}>
                    {c.titolo}{" "}
                    <span style={{ fontSize: "10.5px", fontWeight: 500, color: st.color }}>({st.testo})</span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: MUTED, lineHeight: 1.5, marginTop: "2px" }}>{c.dettaglio}</div>
                  <div style={{ fontSize: "10px", color: DIM, marginTop: "2px" }}>{c.articolo}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: "10.5px", color: DIM, marginTop: "12px", paddingTop: "10px", borderTop: BORDER, lineHeight: 1.5 }}>
          {el.avvertenza} Fonte: {el.fonte.titolo} — {el.fonte.ente} ({el.fonte.versione}), {el.fonte.base_legge}.
        </div>
      </div>
    </div>
  );
}

export { PANEL, BORDER, MUTED, DIM, CYAN };

// ────────────────────────────────────────────────────────────────
// Fascia di ritorno economico
// ────────────────────────────────────────────────────────────────

export interface RoiRange {
  roi_mediano_pct: number;
  roi_medio_pct: number;
  roi_p10_pct: number;
  roi_p25_pct: number;
  roi_p75_pct: number;
  roi_p90_pct: number;
  prob_pareggio_pct: number;
  prob_perdita_grave_pct: number;
  guadagno_mediano: number;
  guadagno_medio: number;
  guadagno_p90: number;
  costo_atteso: number;
  n_simulazioni: number;
  peso_dati_stallone: number;
  n_figli_valutati: number;
  anno_maturita: number;
  base_figli: "maturi" | "tutti" | "nessuna";
  pareggio: {
    grado_minimo: string | null;
    guadagno_tipico_del_grado: number;
    probabilita_pct: number;
    serve: number;
  };
  nota: string;
  avvertenza: string;
}

export interface Rivendita {
  /** Da dove viene la fascia: i figli veri dello stallone, o la tassa di monta. */
  base: "figli_veri" | "tassa_monta";
  /** Quanti yearling di questo stallone sono stati realmente venduti. */
  n_vendite_osservate: number;
  prezzo_p25: number;
  prezzo_mediano: number;
  prezzo_p75: number;
  prezzo_minimo?: number;
  prezzo_massimo?: number;
  prob_vendita_pct: number;
  costo_fino_a_yearling: number;
  utile_mediano: number;
  roi_p25_pct: number;
  roi_mediano_pct: number;
  roi_p75_pct: number;
  roi_ponderato_pct: number;
  ricavo_ponderato: number;
  solidita: string;
  fonti: { nome: string; url: string }[];
  avvertenza: string;
}

function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

function segno(n: number) {
  return (n > 0 ? "+" : "") + n.toFixed(0) + "%";
}

/**
 * Mostra il ritorno come fascia. La barra va da -100% (perdita totale)
 * al massimo fra +100% e il novantesimo percentile, cosi' i casi molto
 * fortunati non schiacciano visivamente tutto il resto.
 */
export function RoiRangePanel({ r }: { r: RoiRange }) {
  const min = -100;
  const max = Math.max(100, r.roi_p90_pct);
  const pos = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;

  const left25 = pos(r.roi_p25_pct);
  const width50 = Math.max(1, pos(r.roi_p75_pct) - left25);
  const leftWhisk = pos(r.roi_p10_pct);
  const widthWhisk = Math.max(1, pos(r.roi_p90_pct) - leftWhisk);
  const zero = pos(0);

  const colMediano = r.roi_mediano_pct >= 0 ? "hsl(100 60% 55%)" : "hsl(0 60% 58%)";

  return (
    <div style={{ marginBottom: "18px" }}>
      <SectionTitle icon={<Scale size={12} />}>Quanto si rischia davvero</SectionTitle>
      <div style={{ background: "hsl(220 10% 11%)", border: BORDER, borderRadius: "8px", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          <div style={{ fontSize: "26px", fontWeight: 800, color: colMediano }}>
            {segno(r.roi_mediano_pct)}
          </div>
          <div style={{ fontSize: "12px", color: MUTED }}>
            ritorno del puledro tipico &middot; meta&#39; dei casi fra{" "}
            <strong style={{ color: "hsl(210 8% 75%)" }}>{segno(r.roi_p25_pct)}</strong> e{" "}
            <strong style={{ color: "hsl(210 8% 75%)" }}>{segno(r.roi_p75_pct)}</strong>
          </div>
        </div>

        {/* barra: baffi 10-90, scatola 25-75, tacca sulla mediana */}
        <div style={{ position: "relative", height: "34px", marginBottom: "6px" }}>
          <div style={{ position: "absolute", top: "15px", left: 0, right: 0, height: "3px", background: "hsl(220 8% 18%)", borderRadius: "2px" }} />
          <div style={{ position: "absolute", top: "15px", left: leftWhisk + "%", width: widthWhisk + "%", height: "3px", background: "hsl(183 30% 32%)", borderRadius: "2px" }} />
          <div style={{ position: "absolute", top: "8px", left: left25 + "%", width: width50 + "%", height: "17px", background: "hsl(183 45% 30%)", border: "1px solid hsl(183 55% 42%)", borderRadius: "4px" }} />
          <div style={{ position: "absolute", top: "4px", left: pos(r.roi_mediano_pct) + "%", width: "3px", height: "25px", background: colMediano, borderRadius: "2px" }} />
          <div style={{ position: "absolute", top: "2px", left: zero + "%", width: 0, height: "30px", borderLeft: "1px dashed hsl(45 60% 55%)" }} />
        </div>
        <div style={{ position: "relative", height: "14px", marginBottom: "12px" }}>
          <span style={{ position: "absolute", left: 0, fontSize: "10px", color: "hsl(210 8% 42%)" }}>perdita totale</span>
          <span style={{
            position: "absolute", left: zero + "%", transform: "translateX(-50%)",
            fontSize: "10px", color: "hsl(45 60% 58%)", whiteSpace: "nowrap",
          }}>
            pari spesa
          </span>
          <span style={{ position: "absolute", right: 0, fontSize: "10px", color: "hsl(210 8% 42%)" }}>
            {segno(r.roi_p90_pct)} nel 10% piu&#39; fortunato
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px", marginBottom: "12px" }}>
          <Stat label="Ripaga i costi" value={r.prob_pareggio_pct.toFixed(0) + "%"} color="hsl(100 55% 55%)" sub="dei puledri simulati" />
          <Stat label="Perde meta' o piu'" value={r.prob_perdita_grave_pct.toFixed(0) + "%"} color="hsl(0 60% 58%)" sub="dell'investimento" />
          <Stat label="Guadagno tipico" value={euro(r.guadagno_mediano)} color="hsl(51 70% 58%)" sub={"costo " + euro(r.costo_atteso)} />
          <Stat label="Guadagno medio" value={euro(r.guadagno_medio)} color="hsl(210 8% 62%)" sub="gonfiato dai campioni" />
        </div>

        <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.55, borderTop: BORDER, paddingTop: "10px" }}>
          <div style={{ marginBottom: "5px" }}>
            Il <strong style={{ color: "hsl(210 8% 72%)" }}>guadagno medio</strong> ({euro(r.guadagno_medio)}) e&#39; molto piu&#39; alto
            di quello <strong style={{ color: "hsl(210 8% 72%)" }}>tipico</strong> ({euro(r.guadagno_mediano)}): pochi cavalli
            eccezionali alzano la media, ma la maggior parte dei puledri sta molto sotto. Per decidere se pagare una monta conta
            il valore tipico, non la media.
          </div>
          <div>{r.nota}</div>
          <div style={{ marginTop: "5px", color: "hsl(210 8% 42%)" }}>{r.avvertenza}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div>
      <div style={{ fontSize: "9.5px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
        {label}
      </div>
      <div className="tabular" style={{ fontSize: "17px", fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: "10px", color: "hsl(210 8% 40%)" }}>{sub}</div>
    </div>
  );
}


// ────────────────────────────────────────────────────────────────
// Conclusione economica, in fondo alla tendina
// ────────────────────────────────────────────────────────────────

/**
 * Chiude la scheda rispondendo alla sola domanda che conta per chi paga la
 * monta: conviene o no, e a che condizione.
 *
 * Prima qui c'era un unico "ROI atteso" calcolato sulle medie dei guadagni.
 * Era in contraddizione con la fascia mostrata piu' in alto: per un
 * accoppiamento poteva dire +48% in verde mentre il puledro tipico perdeva
 * il 62%. La media e' alta perche' pochi cavalli eccezionali la tirano su,
 * e chi decide una monta non compra la media: compra un puledro.
 */
export function ConclusioneEconomica({
  r,
  roiMedioStorico,
  ricavoMedio,
  riv,
}: {
  r: RoiRange;
  /** ROI calcolato sulle medie, mantenuto solo come confronto dichiarato. */
  roiMedioStorico: number;
  ricavoMedio: number;
  /** Stima di rivendita come yearling, se disponibile. */
  riv?: Rivendita | null;
}) {
  const perditaTipica = r.guadagno_mediano - r.costo_atteso;
  const inPari = r.roi_mediano_pct >= 0;

  // Il verdetto non guarda solo il caso tipico: un accoppiamento puo' essere
  // in perdita nel caso tipico e comunque sensato se la coda buona e' grossa.
  const verdetto = inPari
    ? { testo: "Sostenibile nel caso tipico", col: "hsl(100 58% 52%)", bg: "hsl(100 30% 10%)", bd: "hsl(100 45% 26%)" }
    : r.prob_pareggio_pct >= 25
      ? { testo: "In perdita nel caso tipico, ma la scommessa e' aperta", col: "hsl(45 80% 58%)", bg: "hsl(45 30% 10%)", bd: "hsl(45 45% 26%)" }
      : { testo: "In perdita nel caso tipico, e il colpo e' raro", col: "hsl(0 62% 58%)", bg: "hsl(0 30% 10%)", bd: "hsl(0 45% 26%)" };

  return (
    <div style={{ marginTop: "4px" }}>
      <SectionTitle icon={<Scale size={12} />}>In conclusione: conviene?</SectionTitle>
      <div style={{ background: verdetto.bg, border: "1px solid " + verdetto.bd, borderRadius: "10px", padding: "14px 18px" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: verdetto.col, marginBottom: "12px" }}>
          {verdetto.testo}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "12px", marginBottom: "14px" }}>
          <Stat
            label="Spesa complessiva"
            value={euro(r.costo_atteso)}
            color="hsl(15 70% 58%)"
            sub="monta e 2 anni e mezzo"
          />
          <Stat
            label="Incassa, tipicamente"
            value={euro(r.guadagno_mediano)}
            color="hsl(51 70% 58%)"
            sub="in premi di carriera"
          />
          <Stat
            label={perditaTipica >= 0 ? "Utile tipico" : "Perdita tipica"}
            value={(perditaTipica >= 0 ? "+" : "\u2212") + euro(Math.abs(perditaTipica)).replace("\u20ac", "\u20ac")}
            color={perditaTipica >= 0 ? "hsl(100 58% 55%)" : "hsl(0 62% 58%)"}
            sub={(r.roi_mediano_pct > 0 ? "+" : "") + r.roi_mediano_pct.toFixed(0) + "% sul capitale"}
          />
          <Stat
            label="Chiude in pari o meglio"
            value={r.prob_pareggio_pct.toFixed(0) + "%"}
            color="hsl(183 75% 55%)"
            sub="dei casi simulati"
          />
        </div>

        {r.pareggio.grado_minimo && (
          <div style={{
            background: "hsl(220 12% 9%)", border: BORDER, borderRadius: "8px",
            padding: "10px 13px", marginBottom: "12px", fontSize: "12px",
            color: "hsl(210 8% 68%)", lineHeight: 1.6,
          }}>
            Per rientrare della spesa il puledro deve arrivare almeno al livello{" "}
            <strong style={{ color: "hsl(183 75% 60%)" }}>{r.pareggio.grado_minimo}</strong>, dove i cavalli
            guadagnano tipicamente {euro(r.pareggio.guadagno_tipico_del_grado)}. Con questo accoppiamento la
            probabilita&#39; di arrivarci e&#39;{" "}
            <strong style={{ color: r.pareggio.probabilita_pct >= 25 ? "hsl(100 58% 58%)" : "hsl(45 80% 60%)" }}>
              {r.pareggio.probabilita_pct.toFixed(0)} su 100
            </strong>.
          </div>
        )}

        {riv && <ScenariRivendita r={r} riv={riv} />}

        <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.6, borderTop: BORDER, paddingTop: "10px" }}>
          <div style={{ marginBottom: "6px" }}>
            Calcolato sul puledro tipico. Lo stesso conto fatto sulle <em>medie</em> dei guadagni darebbe{" "}
            <strong style={{ color: "hsl(210 8% 62%)" }}>
              {(roiMedioStorico > 0 ? "+" : "") + roiMedioStorico.toFixed(1)}%
            </strong>{" "}
            con un ricavo di {euro(ricavoMedio)}: un risultato piu&#39; generoso ma fuorviante, perche&#39; la
            media e&#39; sollevata dai pochi campioni e non descrive il puledro che nascera&#39; davvero.
          </div>
          {!riv && (
            <div style={{ color: "hsl(210 8% 40%)" }}>
              Nei conti non entra il valore di rivendita del puledro, che per un allevatore e&#39; spesso il
              vero ricavo: il ritorno qui e&#39; quindi il piu&#39; prudente possibile, quello ottenuto correndo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * Due strade per lo stesso puledro: farlo correre o venderlo da yearling.
 * Sono scenari alternativi con costi diversi, quindi vanno confrontati
 * affiancati e non sommati: chi vende a un anno non paga addestramento
 * ne' attivita' agonistica.
 */
function ScenariRivendita({ r, riv }: { r: RoiRange; riv: Rivendita }) {
  const megliovendere = riv.roi_mediano_pct > r.roi_mediano_pct;

  const Colonna = ({
    titolo, sottotitolo, spesa, incasso, incassoNota, roi, vince,
  }: {
    titolo: string; sottotitolo: string; spesa: number; incasso: string;
    incassoNota: string; roi: number; vince: boolean;
  }) => (
    <div style={{
      flex: "1 1 190px", background: "hsl(220 12% 9%)",
      border: vince ? "1px solid hsl(100 45% 32%)" : BORDER,
      borderRadius: "8px", padding: "12px 14px",
    }}>
      <div style={{ fontSize: "12.5px", fontWeight: 700, color: vince ? "hsl(100 58% 58%)" : "hsl(210 8% 72%)" }}>
        {titolo}
      </div>
      <div style={{ fontSize: "10.5px", color: "hsl(210 8% 42%)", marginBottom: "9px" }}>{sottotitolo}</div>
      <div className="tabular" style={{ fontSize: "21px", fontWeight: 800, color: roi >= 0 ? "hsl(100 58% 55%)" : "hsl(0 62% 58%)", lineHeight: 1.1 }}>
        {(roi > 0 ? "+" : "") + roi.toFixed(0)}%
      </div>
      <div style={{ fontSize: "11px", color: MUTED, marginTop: "6px", lineHeight: 1.55 }}>
        spende {euro(spesa)}<br />
        incassa {incasso}
        <span style={{ color: "hsl(210 8% 38%)" }}> &middot; {incassoNota}</span>
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: "13px" }}>
      <div style={{ fontSize: "10.5px", color: "hsl(210 8% 45%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
        Due strade per lo stesso puledro
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "9px" }}>
        <Colonna
          titolo="Farlo correre"
          sottotitolo="due anni e mezzo di costi, premi di carriera"
          spesa={r.costo_atteso}
          incasso={euro(r.guadagno_mediano)}
          incassoNota="premi tipici"
          roi={r.roi_mediano_pct}
          vince={!megliovendere}
        />
        <Colonna
          titolo="Venderlo da yearling"
          sottotitolo={riv.base === "figli_veri"
            ? `su ${riv.n_vendite_osservate} figli suoi venduti in asta`
            : "stima dalla tassa di monta"}
          spesa={riv.costo_fino_a_yearling}
          incasso={euro(riv.prezzo_mediano)}
          incassoNota={"fascia " + euro(riv.prezzo_p25) + "\u2013" + euro(riv.prezzo_p75)}
          roi={riv.roi_mediano_pct}
          vince={megliovendere}
        />
      </div>
      <div style={{
        background: "hsl(220 12% 9%)", border: BORDER, borderRadius: "8px",
        padding: "10px 13px", fontSize: "11px", color: MUTED, lineHeight: 1.6,
      }}>
        <div style={{ marginBottom: "5px", color: "hsl(210 8% 60%)" }}>
          {megliovendere
            ? "Con questo accoppiamento la vendita da yearling rende piu' della carriera: il prezzo d'asta arriva subito, i premi arrivano dopo anni di spese."
            : "Qui la vendita da yearling non migliora il conto: la monta costa piu' di quanto il mercato paghi per il puledro."}
        </div>
        {/* IL RITORNO VA DATO COME FASCIA. Un numero solo suggerisce una
            precisione che non c'e': i figli dello stesso stallone si vendono a
            prezzi molto diversi, e il ritorno segue quella dispersione. */}
        <div style={{ marginBottom: "5px" }}>
          A seconda di come va la giornata d'asta il ritorno va da{" "}
          <strong style={{ color: riv.roi_p25_pct >= 0 ? "hsl(100 58% 58%)" : "hsl(0 62% 58%)" }}>
            {(riv.roi_p25_pct > 0 ? "+" : "") + riv.roi_p25_pct.toFixed(0)}%
          </strong>{" "}
          a{" "}
          <strong style={{ color: riv.roi_p75_pct >= 0 ? "hsl(100 58% 58%)" : "hsl(0 62% 58%)" }}>
            {(riv.roi_p75_pct > 0 ? "+" : "") + riv.roi_p75_pct.toFixed(0)}%
          </strong>{" "}
          nella meta' centrale dei casi
          {riv.prezzo_minimo != null && riv.prezzo_massimo != null && (
            <>; i figli di questo stallone sono stati battuti da {euro(riv.prezzo_minimo)} a{" "}
              {euro(riv.prezzo_massimo)}</>
          )}.
        </div>
        <div>
          Solo {riv.prob_vendita_pct.toFixed(0)} lotti su 100 trovano un compratore: tenendo conto
          del rischio di non vendere il ricavo atteso scende a {euro(riv.ricavo_ponderato)}, cioe'{" "}
          <strong style={{ color: riv.roi_ponderato_pct >= 0 ? "hsl(100 58% 58%)" : "hsl(0 62% 58%)" }}>
            {(riv.roi_ponderato_pct > 0 ? "+" : "") + riv.roi_ponderato_pct.toFixed(0)}%
          </strong>.
        </div>
        <div style={{ marginTop: "5px", color: "hsl(45 60% 62%)" }}>{riv.solidita}</div>
        <div style={{ marginTop: "5px", color: "hsl(210 8% 40%)" }}>{riv.avvertenza}</div>
        <div style={{ marginTop: "5px", color: "hsl(210 8% 38%)" }}>
          Fonti prezzi:{" "}
          {riv.fonti.map((f, i) => (
            <span key={f.url}>
              {i > 0 && " \u00b7 "}
              <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "hsl(183 55% 50%)" }}>{f.nome}</a>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
