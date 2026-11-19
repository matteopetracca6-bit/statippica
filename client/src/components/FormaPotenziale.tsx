/**
 * Curva del voto di carriera e forza (novembre 2026, forza.py): prende il
 * posto del "potenziale ai 4 anni" nella scheda del cavallo.
 *
 * La curva e' il VOTO DI CARRIERA anno per anno: per ogni 31 dicembre, il voto
 * che il cavallo avrebbe avuto se la carriera si fosse chiusa li', con la
 * stessa formula e le stesse lettere della testata della scheda. L'ultimo
 * punto vero e' il voto di oggi. Le eta' future sono previste (mediana e
 * forbice che dovrebbe contenere il vero 8 volte su 10): il potenziale e' il
 * voto di fine carriera previsto.
 *
 * La FORZA e' un'altra misura, la velocita' degli ultimi 12 mesi: si mostra
 * come percentuale fra tutte le stagioni, senza le lettere del voto, per non
 * confonderla con il voto (19/11/2026: TROI HOLZ, "picco A" con voto SS).
 */
import GradeBadge from "./GradeBadge";
import { Spiegazione } from "./Spiegazione";

export interface Forza {
  forza: number | null; tendenza: number | null; corse_12_mesi: number;
  ultima_corsa: string | null; ferma: boolean;
  potenziale: number | null; potenziale_basso: number | null; potenziale_alto: number | null;
  potenziale_eta: number | null; picco: number | null; picco_eta: number | null; nato: number | null;
  stagioni: { eta: number; anno: number; voto: number; corse: number | null; forza: number | null }[];
  curva: { eta: number; mediana: number; basso: number; alto: number }[];
  soglie: { grado: string; soglia: number }[];
  verifica: {
    forza: { esito: string; ordine_giusto: number; corse: number } | null;
    curva: { esito: string; errore_modello: number; errore_riferimento: number; copertura_80: number } | null;
  } | null;
}

const num = (x: number) => x.toFixed(1).replace(".", ",");
const dataIt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const VIOLA = "hsl(265 85% 74%)";

function letteraDa(soglie: Forza["soglie"]) {
  const ord = [...soglie].sort((a, b) => b.soglia - a.soglia);
  return (v: number) => {
    for (const s of ord) if (v >= s.soglia) return s.grado;
    return "F";
  };
}

function Etichetta({ ok, testo, titolo }: { ok: boolean; testo: string; titolo?: string }) {
  return (
    <span title={titolo} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px",
      color: ok ? "hsl(145 60% 62%)" : "hsl(38 85% 62%)", background: ok ? "hsl(145 40% 16%)" : "hsl(38 60% 16%)",
      border: `1px solid ${ok ? "hsl(145 40% 30%)" : "hsl(38 50% 30%)"}` }}>
      {testo}
    </span>
  );
}

function Curva({ f, lettera }: { f: Forza; lettera: (v: number) => string }) {
  const vere = f.stagioni;
  const future = f.curva;
  const eta = [...vere.map(s => s.eta), ...future.map(c => c.eta)];
  const e0 = Math.min(2, ...eta), e1 = Math.max(7, ...eta);
  const n = e1 - e0 + 1;
  const W = 640, H = 230, L = 40, R = 26, T = 16, B = 34;
  const X = (e: number) => L + ((e - e0) / Math.max(1, e1 - e0)) * (W - L - R);
  // Scala a fasce: ogni lettera ha la stessa altezza (sulla scala 0-100 le
  // soglie di SSS, SS e S sono a pochi punti l'una dall'altra e si
  // accavallavano). Dentro la fascia la posizione resta proporzionale.
  const nodi = [0, ...[...f.soglie].filter(s => s.grado !== "F").map(s => s.soglia).sort((a, b) => a - b), 100];
  const Y = (v: number) => {
    let i = 0;
    while (i < nodi.length - 2 && v >= nodi[i + 1]) i++;
    const q = (i + Math.min(1, Math.max(0, (v - nodi[i]) / Math.max(1e-6, nodi[i + 1] - nodi[i])))) / (nodi.length - 1);
    return T + (1 - q) * (H - T - B);
  };
  // Con tante eta' le etichette si accavallano sul telefono: una si', una no.
  const passo = n > 9 ? 2 : 1;
  const ultimaVera = vere.length ? vere[vere.length - 1] : null;
  const ponte = ultimaVera && future.length && future[0].eta === ultimaVera.eta + 1
    ? [{ eta: ultimaVera.eta, mediana: ultimaVera.voto, basso: ultimaVera.voto, alto: ultimaVera.voto }, ...future]
    : future;
  const banda = ponte.map(c => `${X(c.eta)},${Y(c.alto)}`).join(" ") + " " +
    [...ponte].reverse().map(c => `${X(c.eta)},${Y(c.basso)}`).join(" ");
  const soglie = [...f.soglie].filter(s => s.grado !== "F").sort((a, b) => b.soglia - a.soglia);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Voto di carriera anno per anno, vero e previsto" style={{ width: "100%", height: "auto", display: "block" }}>
      {soglie.map((s, i) => {
        const sopra = i === 0 ? 100 : soglie[i - 1].soglia;
        return (
          <g key={s.grado}>
            <line x1={L} x2={W - R} y1={Y(s.soglia)} y2={Y(s.soglia)} stroke="hsl(220 10% 30% / .45)" strokeDasharray="2 4" />
            <text x={L - 6} y={(Y(s.soglia) + Y(sopra)) / 2 + 4} textAnchor="end" fontSize="11" fill="hsl(210 8% 55%)">{s.grado}</text>
          </g>
        );
      })}
      <text x={L - 6} y={(Y(0) + Y(soglie.length ? soglie[soglie.length - 1].soglia : 0)) / 2 + 4} textAnchor="end" fontSize="11" fill="hsl(210 8% 55%)">F</text>
      {Array.from({ length: n }, (_, i) => e0 + i).map((e, i) => (
        <g key={e}>
          <line x1={X(e)} x2={X(e)} y1={T} y2={H - B} stroke="hsl(220 10% 30% / .35)" />
          {i % passo === 0 && (
            <text x={X(e)} y={H - B + 17} textAnchor="middle" fontSize="12" fill="hsl(210 8% 58%)">{e}</text>
          )}
        </g>
      ))}
      <text x={W - R} y={H - 3} textAnchor="end" fontSize="10.5" fill="hsl(210 8% 50%)">età</text>
      {ponte.length > 1 && <polygon points={banda} fill="hsl(265 80% 70% / .16)" stroke="none" />}
      {ponte.length > 1 && (
        <polyline points={ponte.map(c => `${X(c.eta)},${Y(c.mediana)}`).join(" ")} fill="none"
          stroke={VIOLA} strokeWidth="2" strokeDasharray="6 4" />
      )}
      {vere.length > 1 && (
        <polyline points={vere.map(s => `${X(s.eta)},${Y(s.voto)}`).join(" ")} fill="none" stroke={VIOLA} strokeWidth="2.25" />
      )}
      {vere.map(s => (
        <circle key={`v${s.eta}`} cx={X(s.eta)} cy={Y(s.voto)} r={s.corse ? 3.6 : 2.4}
          fill={s.corse ? VIOLA : "hsl(220 13% 10%)"} stroke={VIOLA} strokeWidth="1.25">
          <title>{`${s.eta} anni (${s.anno}): voto ${lettera(s.voto)} (${num(s.voto)}) · ${s.corse ? `${s.corse} corse` : "nessuna corsa"}`}</title>
        </circle>
      ))}
      {future.map(c => (
        <circle key={`p${c.eta}`} cx={X(c.eta)} cy={Y(c.mediana)} r="3" fill="hsl(220 13% 10%)" stroke={VIOLA} strokeWidth="1.25">
          <title>{`${c.eta} anni${f.nato ? ` (${f.nato + c.eta})` : ""}, previsto: ${lettera(c.mediana)} (${num(c.mediana)})${c.basso !== c.alto ? `, fra ${lettera(c.basso)} e ${lettera(c.alto)}` : ""}`}</title>
        </circle>
      ))}
      {f.potenziale != null && f.potenziale_eta != null && future.length > 0 && (
        <circle cx={X(f.potenziale_eta)} cy={Y(f.potenziale)} r="6.5" fill="none" stroke="hsl(145 60% 55%)" strokeWidth="1.75" />
      )}
    </svg>
  );
}

export default function FormaPotenziale({ f, style }: { f: Forza; style?: React.CSSProperties }) {
  // Archivio non ancora ricalcolato con la curva del voto: niente pannello.
  if (!f.soglie?.length || (f.stagioni.length > 0 && typeof f.stagioni[0].voto !== "number")) return null;
  const lettera = letteraDa(f.soglie ?? []);
  const vf = f.verifica?.forza, vc = f.verifica?.curva;
  const tend = f.tendenza;
  const previsto = f.curva.length > 0 && !f.ferma;
  return (
    <div className="pannello" style={{ ...style, borderLeft: "3px solid hsl(265 80% 70%)" }} data-testid="pannello-forza">
      <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        Voto di carriera anno per anno e potenziale
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 210 }}>
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginBottom: 4 }}>
            {f.ferma ? "Voto a fine carriera" : "Voto a fine carriera previsto"}
          </div>
          {f.potenziale != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <GradeBadge grade={lettera(f.potenziale)} size="lg" />
              <span style={{ fontSize: 13.5, color: "hsl(210 10% 82%)" }}>
                {num(f.potenziale)}
                {previsto && f.potenziale_basso != null && f.potenziale_alto != null && (
                  <> · fra <strong>{lettera(f.potenziale_basso)}</strong> e <strong>{lettera(f.potenziale_alto)}</strong></>
                )}
              </span>
            </div>
          ) : <span style={{ fontSize: 13.5, color: "hsl(210 10% 70%)" }}>non stimabile</span>}
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
            {f.ferma
              ? "Carriera ferma da oltre sei mesi: nessuna previsione. Se non torna a correre, il voto cambia solo per le stagioni che avrebbe potuto correre (fino ai 7 anni)."
              : "Stessa scala e stesse lettere del voto in testata."}
          </div>
        </div>
        <div style={{ minWidth: 210 }}>
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginBottom: 4 }}>Velocità negli ultimi 12 mesi</div>
          {f.forza != null ? (
            <div style={{ fontSize: 13.5, color: "hsl(210 10% 82%)" }}>
              meglio del <strong>{Math.round(f.forza)}%</strong> delle stagioni
              {tend != null && !f.ferma && (
                <span style={{ marginLeft: 8, color: tend > 2 ? "hsl(145 60% 62%)" : tend < -2 ? "hsl(0 70% 66%)" : "hsl(210 8% 60%)" }}>
                  {tend > 2 ? "▲ in crescita" : tend < -2 ? "▼ in calo" : "■ stabile"}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13.5, color: "hsl(210 10% 70%)" }}>nessuna corsa con il tempo negli ultimi 12 mesi</span>
          )}
          <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
            {f.corse_12_mesi} corse negli ultimi 12 mesi{f.ultima_corsa ? ` · ultima il ${dataIt(f.ultima_corsa)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignSelf: "center" }}>
          {vc && previsto && <Etichetta ok={vc.esito === "affidabile"} testo={`previsione: ${vc.esito}`}
            titolo={`Errore medio ${num(vc.errore_modello)} punti contro ${num(vc.errore_riferimento)} della crescita tipica; forbice giusta ${Math.round(vc.copertura_80 * 100)} volte su 100`} />}
          {vf && f.forza != null && <Etichetta ok={vf.esito === "affidabile"} testo={`velocità: ${vf.esito}`}
            titolo={`Ordine d'arrivo giusto in ${Math.round(vf.ordine_giusto * 100)} coppie di cavalli su 100 (${vf.corse} corse dell'ultimo anno)`} />}
        </div>
      </div>
      <div style={{ marginTop: 12 }}><Curva f={f} lettera={lettera} /></div>
      <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
        Linea piena: il voto di carriera a fine di ogni anno (punti pieni gli anni con corse, vuoti quelli senza).
        {previsto && " Tratteggio e banda: gli anni previsti, con la forbice che dovrebbe contenere il vero 8 volte su 10; il cerchio verde è il voto di fine carriera previsto."}
      </div>
      <Spiegazione titolo="Come si calcola e quanto fidarsi" compatta>
        Ogni punto è il voto di carriera che il cavallo avrebbe avuto se la carriera si fosse chiusa quel 31 dicembre: stessa
        formula del voto in testata (guadagni, record, vittorie, stagioni corse e stagioni che poteva correre), con le corse fino a
        quell'anno, confrontato con tutti gli atleti. L'ultimo punto è il voto di oggi: la curva arriva sempre al voto in testata, e chi corre a lungo la vede salire con la
        carriera. Gli anni futuri si prevedono da
        età, voto e sua crescita, corse fatte, velocità, sesso e carriere dei figli del padre.
        {vc ? <> Verifica, con la formula allenata fino al 2021 e provata sul 2022-2025: errore medio {num(vc.errore_modello)} punti
          contro {num(vc.errore_riferimento)} di chi aggiunge al voto di oggi la crescita tipica di quell'età; la forbice ha contenuto
          il vero {Math.round(vc.copertura_80 * 100)} volte su 100.</> : null}
        {" "}La velocità è un'altra misura: il tempo al km di ogni corsa corretto per pista, distanza, mese e giornata, letto fra
        tutte le stagioni corse dal 2016.
        {vf ? <> Nelle {vf.corse} corse dell'ultimo anno, fra due cavalli quello più veloce sulla carta è arrivato davanti
          {" "}{Math.round(vf.ordine_giusto * 100)} volte su 100.</> : null}
      </Spiegazione>
    </div>
  );
}
