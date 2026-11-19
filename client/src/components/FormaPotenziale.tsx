/**
 * Forza e potenziale (novembre 2026, forza.py): prende il posto del
 * "potenziale ai 4 anni" nella scheda del cavallo.
 *
 * Due numeri sulla stessa scala 0-100 per tutti i cavalli: la FORZA di oggi
 * (cifre di velocita' degli ultimi 12 mesi, corrette per pista, distanza e
 * giornata) e il POTENZIALE, il punto piu' alto della curva di carriera. La
 * curva unisce le stagioni vere (fine anno, per eta') e quelle previste, con
 * la forbice che dovrebbe contenere il vero 8 volte su 10.
 */
import GradeBadge from "./GradeBadge";
import { Spiegazione } from "./Spiegazione";
import { lettera } from "./PotenzialeCavallo";

export interface Forza {
  forza: number | null; tendenza: number | null; corse_12_mesi: number;
  ultima_corsa: string | null; ferma: boolean;
  potenziale: number | null; potenziale_basso: number | null; potenziale_alto: number | null;
  potenziale_eta: number | null; picco: number | null; picco_eta: number | null; nato: number | null;
  stagioni: { eta: number; anno: number; forza: number; corse: number | null; ultimi_12_mesi?: number }[];
  curva: { eta: number; mediana: number; basso: number; alto: number }[];
  verifica: {
    forza: { esito: string; ordine_giusto: number; corse: number } | null;
    curva: { esito: string; errore_modello: number; errore_resta_com_e: number; copertura_80: number } | null;
  } | null;
}

const num = (x: number) => x.toFixed(1).replace(".", ",");
const dataIt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const VIOLA = "hsl(265 85% 74%)";

function Etichetta({ ok, testo, titolo }: { ok: boolean; testo: string; titolo?: string }) {
  return (
    <span title={titolo} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px",
      color: ok ? "hsl(145 60% 62%)" : "hsl(38 85% 62%)", background: ok ? "hsl(145 40% 16%)" : "hsl(38 60% 16%)",
      border: `1px solid ${ok ? "hsl(145 40% 30%)" : "hsl(38 50% 30%)"}` }}>
      {testo}
    </span>
  );
}

function Curva({ f }: { f: Forza }) {
  const vere = f.stagioni.filter(s => s.eta >= 2);
  const future = f.curva;
  const eta = [...vere.map(s => s.eta), ...future.map(c => c.eta)];
  const e0 = Math.min(2, ...eta), e1 = Math.max(8, ...eta);
  const W = 640, H = 220, L = 44, R = 42, T = 16, B = 30;
  const X = (e: number) => L + ((e - e0) / Math.max(1, e1 - e0)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / 100) * (H - T - B);
  // La previsione parte dall'ultima stagione vera, cosi' le due linee si toccano.
  const ultimaVera = vere.length ? vere[vere.length - 1] : null;
  const ponte = ultimaVera && future.length && future[0].eta === ultimaVera.eta + 1
    ? [{ eta: ultimaVera.eta, mediana: ultimaVera.forza, basso: ultimaVera.forza, alto: ultimaVera.forza }, ...future]
    : future;
  const banda = ponte.map(c => `${X(c.eta)},${Y(c.alto)}`).join(" ") + " " +
    [...ponte].reverse().map(c => `${X(c.eta)},${Y(c.basso)}`).join(" ");
  const etaPot = f.potenziale_eta;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva di carriera: stagioni vere e previste" style={{ width: "100%", height: "auto", display: "block" }}>
      {[90, 75, 60, 40, 25, 10].map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="hsl(220 10% 30% / .45)" strokeDasharray="2 4" />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="10.5" fill="hsl(210 8% 55%)">{lettera(v + 0.5)}</text>
        </g>
      ))}
      <text x={L - 6} y={Y(5) + 4} textAnchor="end" fontSize="10.5" fill="hsl(210 8% 55%)">F</text>
      {Array.from({ length: e1 - e0 + 1 }, (_, i) => e0 + i).map(e => (
        <g key={e}>
          <line x1={X(e)} x2={X(e)} y1={T} y2={H - B} stroke="hsl(220 10% 30% / .35)" />
          <text x={X(e)} y={H - B + 16} textAnchor="middle" fontSize="10.5" fill="hsl(210 8% 55%)">
            {e} anni{f.nato ? ` · ${f.nato + e}` : ""}
          </text>
        </g>
      ))}
      {ponte.length > 1 && <polygon points={banda} fill="hsl(265 80% 70% / .16)" stroke="none" />}
      {ponte.length > 1 && (
        <polyline points={ponte.map(c => `${X(c.eta)},${Y(c.mediana)}`).join(" ")} fill="none"
          stroke={VIOLA} strokeWidth="2" strokeDasharray="6 4" />
      )}
      {vere.length > 1 && (
        <polyline points={vere.map(s => `${X(s.eta)},${Y(s.forza)}`).join(" ")} fill="none" stroke={VIOLA} strokeWidth="2.25" />
      )}
      {vere.map(s => (
        <circle key={`v${s.eta}`} cx={X(s.eta)} cy={Y(s.forza)} r="3.5" fill={VIOLA} stroke={VIOLA} strokeWidth="1.25">
          <title>{`${s.eta} anni (${s.ultimi_12_mesi ? "ultimi 12 mesi" : s.anno}): ${lettera(s.forza)} (${num(s.forza)})${s.corse ? ` · ${s.corse} corse` : ""}`}</title>
        </circle>
      ))}
      {future.map(c => (
        <circle key={`p${c.eta}`} cx={X(c.eta)} cy={Y(c.mediana)} r="3" fill="hsl(220 13% 10%)" stroke={VIOLA} strokeWidth="1.25">
          <title>{`${c.eta} anni, previsto: ${lettera(c.mediana)} (${num(c.mediana)}), fra ${lettera(c.basso)} e ${lettera(c.alto)}`}</title>
        </circle>
      ))}
      {f.potenziale != null && etaPot != null && (
        <g>
          <circle cx={X(etaPot)} cy={Y(f.potenziale)} r="6.5" fill="none" stroke="hsl(145 60% 55%)" strokeWidth="1.75" />
          <text x={X(etaPot)} y={Math.max(T + 10, Y(f.potenziale) - 11)} textAnchor="middle" fontSize="10.5" fill="hsl(145 60% 62%)">
            {f.picco_eta === etaPot && f.picco === f.potenziale ? "picco" : "potenziale"}
          </text>
        </g>
      )}
    </svg>
  );
}

export default function FormaPotenziale({ f, style }: { f: Forza; style?: React.CSSProperties }) {
  const vf = f.verifica?.forza, vc = f.verifica?.curva;
  const piccoToccato = f.potenziale != null && f.picco === f.potenziale && f.picco_eta === f.potenziale_eta;
  const tend = f.tendenza;
  return (
    <div className="pannello" style={{ ...style, borderLeft: "3px solid hsl(265 80% 70%)" }} data-testid="pannello-forza">
      <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        Forza e potenziale in carriera
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginBottom: 4 }}>{f.ferma ? "Forza all'ultima corsa" : "Forza oggi"}</div>
          {f.forza != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <GradeBadge grade={lettera(f.forza)} size="lg" />
              <span style={{ fontSize: 13.5, color: "hsl(210 10% 82%)" }}>
                {num(f.forza)} su 100
                {tend != null && !f.ferma && (
                  <span style={{ marginLeft: 8, color: tend > 2 ? "hsl(145 60% 62%)" : tend < -2 ? "hsl(0 70% 66%)" : "hsl(210 8% 60%)" }}>
                    {tend > 2 ? "▲ in crescita" : tend < -2 ? "▼ in calo" : "■ stabile"}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 13.5, color: "hsl(210 10% 70%)" }}>nessuna corsa con il tempo negli ultimi 12 mesi</span>
          )}
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
            {f.corse_12_mesi} corse negli ultimi 12 mesi{f.ultima_corsa ? ` · ultima il ${dataIt(f.ultima_corsa)}` : ""}
          </div>
        </div>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginBottom: 4 }}>
            {piccoToccato ? "Potenziale (picco toccato)" : "Potenziale previsto"}
          </div>
          {f.potenziale != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <GradeBadge grade={lettera(f.potenziale)} size="lg" />
              <span style={{ fontSize: 13.5, color: "hsl(210 10% 82%)" }}>
                {num(f.potenziale)}{f.potenziale_eta != null ? ` a ${f.potenziale_eta} anni` : ""}
                {!piccoToccato && f.potenziale_basso != null && f.potenziale_alto != null && (
                  <> · fra <strong>{lettera(f.potenziale_basso)}</strong> e <strong>{lettera(f.potenziale_alto)}</strong></>
                )}
              </span>
            </div>
          ) : <span style={{ fontSize: 13.5, color: "hsl(210 10% 70%)" }}>non stimabile</span>}
          {f.ferma && (
            <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
              Carriera ferma da oltre sei mesi: la curva mostra solo le stagioni corse.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignSelf: "center" }}>
          {vf && <Etichetta ok={vf.esito === "affidabile"} testo={`forza: ${vf.esito}`}
            titolo={`Ordine d'arrivo giusto in ${Math.round(vf.ordine_giusto * 100)} coppie di cavalli su 100 (${vf.corse} corse dell'ultimo anno)`} />}
          {vc && f.curva.length > 0 && <Etichetta ok={vc.esito === "affidabile"} testo={`curva: ${vc.esito}`}
            titolo={`Errore medio ${num(vc.errore_modello)} punti contro ${num(vc.errore_resta_com_e)} di chi prevede "resta com'è"; forbice giusta ${Math.round(vc.copertura_80 * 100)} volte su 100`} />}
        </div>
      </div>
      <div style={{ marginTop: 12 }}><Curva f={f} /></div>
      <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
        Linea piena: le stagioni corse (forza a fine anno; per l'anno in corso, gli ultimi 12 mesi). Tratteggio e banda: le stagioni previste, con la forbice che
        dovrebbe contenere il vero 8 volte su 10. Il cerchio verde è il potenziale.
      </div>
      <Spiegazione titolo="Come si calcola e quanto fidarsi" compatta>
        La forza parte dal tempo al km di ogni corsa, confrontato con il tempo tipico di quella pista, distanza e mese e
        corretto per la giornata (pioggia, pista pesante): ne esce una cifra di velocità confrontabile fra età, piste ed
        epoche. La forza è la media delle migliori cifre degli ultimi 12 mesi, con le corse recenti che pesano di più, letta
        sulla scala di tutte le stagioni corse dal 2016 (50 è la stagione tipica, 90 meglio di nove su dieci). La curva stima
        la forza a fine anno per ogni età futura partendo da età, forza e tendenza, corse fatte, miglior stagione, sesso e
        figli del padre; il potenziale è il suo punto più alto, o il picco già toccato.
        {vf ? <> Verifica della forza: nelle {vf.corse} corse dell'ultimo anno, fra due cavalli quello con la forza più alta è
          arrivato davanti {Math.round(vf.ordine_giusto * 100)} volte su 100.</> : null}
        {vc ? <> Verifica della curva, con la formula allenata fino al 2021 e provata sul 2022-2025: errore medio
          {" "}{num(vc.errore_modello)} punti contro {num(vc.errore_resta_com_e)} di chi prevede che il cavallo resti com'è; la
          forbice ha contenuto il vero {Math.round(vc.copertura_80 * 100)} volte su 100.</> : null}
      </Spiegazione>
    </div>
  );
}
