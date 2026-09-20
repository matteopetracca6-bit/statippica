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
  const confColor = p.confidence_label === "alta" ? "hsl(100 60% 50%)"
    : p.confidence_label === "media" ? "hsl(45 85% 55%)" : "hsl(25 80% 55%)";

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
          <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Attendibilita'
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
  nota: string;
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
