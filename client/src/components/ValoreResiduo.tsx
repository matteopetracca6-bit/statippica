import { Fuel, TrendingDown, TrendingUp, Activity, HelpCircle } from "lucide-react";

/**
 * Pannello "quanto puo' ancora guadagnare".
 *
 * Risponde alla domanda di chi valuta l'acquisto di un cavallo gia' in
 * attivita': i guadagni di carriera dicono cosa ha fatto, non cosa fara'.
 * Un cavallo che ha incassato molto puo' avere finito la benzina, e uno
 * che ha incassato poco puo' avere davanti la parte migliore.
 */

export interface AnnoFuturo {
  eta: number;
  prob_attivo: number;
  guadagno_mediano_anno: number;
  su_dati_della_fascia: boolean;
}

export interface ValoreCarriera {
  disponibile: boolean;
  motivo?: string;
  eta: number;
  fascia: string;
  gia_guadagnato: number;
  residuo_mediano: number;
  residuo_p25: number;
  residuo_p75: number;
  anni_attesi_ancora: number;
  quota_futura: number;
  tipico_a_questa_eta: number;
  rendimento_vs_pari: number;
  residuo_personalizzato: number;
  giudizio: "giovane" | "nel_pieno" | "in_calo" | "quasi_finito" | "non_stimabile";
  titolo: string;
  spiegazione: string;
  prossimi_anni: AnnoFuturo[];
  stima_solida: boolean;
  quota_su_dati_della_fascia: number;
  avvertenza?: string;
}

const MUTED = "hsl(210 8% 48%)";
const DIM = "hsl(210 8% 34%)";
const TEXT = "hsl(210 10% 82%)";

const STILE = {
  giovane:       { colore: "hsl(150 65% 55%)", bordo: "hsl(150 45% 28%)", Icona: TrendingUp },
  nel_pieno:     { colore: "hsl(183 80% 58%)", bordo: "hsl(183 45% 28%)", Icona: Activity },
  in_calo:       { colore: "hsl(38 85% 60%)",  bordo: "hsl(38 50% 30%)",  Icona: TrendingDown },
  quasi_finito:  { colore: "hsl(8 75% 60%)",   bordo: "hsl(8 50% 32%)",   Icona: Fuel },
  non_stimabile: { colore: "hsl(210 8% 50%)",  bordo: "hsl(220 10% 18%)", Icona: HelpCircle },
} as const;

const euro = (v: number) => "€" + Math.round(v).toLocaleString("it-IT");

export default function ValoreResiduo({ v }: { v: ValoreCarriera | null | undefined }) {
  if (!v) return null;
  const { colore, bordo, Icona } = STILE[v.giudizio] ?? STILE.non_stimabile;

  if (!v.disponibile) {
    return (
      <div style={{
        background: "hsl(220 12% 9%)", border: "1px solid hsl(220 10% 16%)",
        borderRadius: "12px", padding: "16px 18px", marginTop: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
          <HelpCircle size={15} style={{ color: MUTED }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: TEXT }}>
            Quanto puo' ancora guadagnare
          </span>
        </div>
        <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.55 }}>
          {v.motivo}
        </div>
      </div>
    );
  }

  /* La barra mostra a che punto e' la carriera TIPICA della sua fascia,
     non il rapporto fra i suoi guadagni e il residuo: quelle due cifre
     stanno su scale diverse e per un campione la barra risulterebbe
     tutta piena proprio quando ha appena cominciato. */
  const pctFatto = (1 - v.quota_futura) * 100;
  const scostamento = Math.abs(v.rendimento_vs_pari - 1) >= 0.15;

  return (
    <div
      data-testid="pannello-valore-residuo"
      style={{
        background: "hsl(220 12% 9%)", border: `1px solid ${bordo}`,
        borderRadius: "12px", padding: "16px 18px", marginTop: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
        <Icona size={16} style={{ color: colore }} />
        <span style={{ fontSize: "13px", fontWeight: 700, color: TEXT }}>
          Quanto puo' ancora guadagnare
        </span>
      </div>
      <div style={{ fontSize: "11px", color: DIM, marginBottom: "14px" }}>
        Su medie storiche dei cavalli con voto {v.fascia} alla stessa eta'
      </div>

      <div style={{ fontSize: "17px", fontWeight: 800, color: colore, marginBottom: "12px" }}>
        {v.titolo}
      </div>

      {/* Tre cifre chiave */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "12px", marginBottom: "14px",
      }}>
        <div>
          <div className="tabular" style={{ fontSize: "20px", fontWeight: 800, color: colore }}>
            {euro(v.residuo_personalizzato)}
          </div>
          <div style={{ fontSize: "11px", color: MUTED }}>ancora da incassare</div>
          <div className="tabular" style={{ fontSize: "10.5px", color: DIM, marginTop: "2px" }}>
            {scostamento
              ? `${euro(v.residuo_mediano)} per la sua fascia, riproporzionato`
              : `fascia ${euro(v.residuo_p25)} – ${euro(v.residuo_p75)}`}
          </div>
        </div>
        <div>
          <div className="tabular" style={{ fontSize: "20px", fontWeight: 800, color: TEXT }}>
            {v.anni_attesi_ancora.toFixed(1)}
          </div>
          <div style={{ fontSize: "11px", color: MUTED }}>stagioni ancora attese</div>
          <div style={{ fontSize: "10.5px", color: DIM, marginTop: "2px" }}>
            oggi ha {v.eta} anni
          </div>
        </div>
        <div>
          <div className="tabular" style={{ fontSize: "20px", fontWeight: 800, color: TEXT }}>
            {Math.round(v.quota_futura * 100)}%
          </div>
          <div style={{ fontSize: "11px", color: MUTED }}>della carriera resta</div>
          <div className="tabular" style={{ fontSize: "10.5px", color: DIM, marginTop: "2px" }}>
            {v.rendimento_vs_pari.toFixed(2)}× rispetto ai pari
          </div>
        </div>
      </div>

      {/* Barra: quanto ha gia' dato contro quanto resta */}
      <div style={{ marginBottom: "5px" }}>
        <div style={{
          display: "flex", height: "12px", borderRadius: "6px",
          overflow: "hidden", background: "hsl(220 10% 13%)",
        }}>
          <div
            className="barra-destra"
            style={{ width: `${pctFatto}%`, background: "hsl(220 8% 32%)" }}
            title={`Parte di carriera gia' percorsa: ${Math.round(pctFatto)}%`}
          />
          <div
            className="barra-destra"
            style={{ width: `${100 - pctFatto}%`, background: colore, animationDelay: "120ms" }}
            title={`Ancora da correre: ${Math.round(100 - pctFatto)}%`}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "10.5px", color: DIM }}>carriera gia' percorsa</span>
          <span style={{ fontSize: "10.5px", color: colore, fontWeight: 700 }}>ancora da correre</span>
        </div>
      </div>

      <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.6, marginTop: "12px" }}>
        {v.spiegazione}
      </div>

      {/* Anno per anno */}
      {v.prossimi_anni.length > 0 && (
        <div style={{ marginTop: "14px" }}>
          <div style={{
            fontSize: "10.5px", color: DIM, textTransform: "uppercase",
            letterSpacing: "0.07em", fontWeight: 700, marginBottom: "7px",
          }}>
            Anno per anno
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {v.prossimi_anni.map(a => (
              <div key={a.eta} style={{
                flex: "1 1 88px", minWidth: "88px",
                background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 15%)",
                borderRadius: "8px", padding: "8px 10px",
              }}>
                <div style={{ fontSize: "11px", color: MUTED, fontWeight: 700 }}>
                  {a.eta} anni
                </div>
                <div className="tabular" style={{ fontSize: "13px", fontWeight: 700, color: TEXT, marginTop: "2px" }}>
                  {euro(a.guadagno_mediano_anno)}
                </div>
                <div className="tabular" style={{ fontSize: "10.5px", color: DIM, marginTop: "1px" }}>
                  {Math.round(a.prob_attivo * 100)}% ancora in pista
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "10.5px", color: DIM, marginTop: "7px", lineHeight: 1.5 }}>
            Il guadagno indicato e' quello tipico di chi corre a quell'eta'.
            La percentuale accanto e' la probabilita' che il cavallo sia ancora
            in attivita': il totale qui sopra tiene conto di entrambe le cose.
          </div>
        </div>
      )}

      {v.avvertenza && (
        <div style={{
          marginTop: "12px", padding: "9px 12px", borderRadius: "8px",
          background: "hsl(38 45% 16% / 0.35)", border: "1px solid hsl(38 45% 26%)",
          fontSize: "11px", color: "hsl(38 55% 68%)", lineHeight: 1.5,
        }}>
          {v.avvertenza}
        </div>
      )}

      <div style={{ fontSize: "10.5px", color: DIM, marginTop: "12px", lineHeight: 1.5 }}>
        Media storica per fascia di voto, non una previsione su questo animale:
        infortuni, cambio di scuderia e qualita' del driver non sono considerati.
      </div>
    </div>
  );
}
