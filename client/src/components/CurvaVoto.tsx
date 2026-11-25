/**
 * Curva del voto di carriera, compatta, dentro "In breve · Il voto" della
 * scheda cavallo (19/11/2026: prima era un pannello a se', troppo grande sul
 * computer).
 *
 * Ogni punto e' il voto di carriera a fine anno (stessa formula e lettere
 * della testata, forza.py); l'ultimo e' il voto di oggi. Le eta' future sono
 * previste, con la forbice; il cerchio e' il voto di fine carriera previsto.
 * Colori: quello della scheda (il colore del voto del cavallo) per linea e
 * banda; sull'asse le lettere hanno i colori dei distintivi del voto.
 */
import GradeBadge from "./GradeBadge";
import { Spiegazione } from "./Spiegazione";
import type { Forza } from "./FormaPotenziale";

// Gli stessi colori dei distintivi (index.css, .grade-*): sfondo, testo, bordo.
const DISTINTIVO: Record<string, [string, string, string]> = {
  SSS: ["hsl(51 100% 50% / .15)", "hsl(51 100% 60%)", "hsl(51 100% 50% / .45)"],
  SS: ["hsl(0 0% 75% / .1)", "hsl(0 0% 85%)", "hsl(0 0% 75% / .3)"],
  S: ["hsl(30 60% 50% / .15)", "hsl(30 80% 65%)", "hsl(30 60% 50% / .4)"],
  A: ["hsl(183 50% 35% / .2)", "hsl(183 70% 60%)", "hsl(183 50% 35% / .5)"],
  B: ["hsl(100 40% 30% / .2)", "hsl(100 50% 55%)", "hsl(100 40% 30% / .5)"],
  C: ["hsl(25 50% 30% / .2)", "hsl(25 60% 55%)", "hsl(25 50% 30% / .5)"],
  D: ["hsl(40 5% 25% / .4)", "hsl(40 5% 55%)", "hsl(40 5% 30% / .5)"],
  E: ["hsl(40 4% 18% / .6)", "hsl(40 4% 45%)", "hsl(40 4% 25% / .5)"],
  F: ["hsl(40 3% 12% / .8)", "hsl(40 3% 38%)", "hsl(40 3% 20% / .5)"],
};
const ORDINE = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const num = (x: number) => x.toFixed(1).replace(".", ",");

export function letteraDa(soglie: Forza["soglie"]) {
  const ord = [...soglie].sort((a, b) => b.soglia - a.soglia);
  return (v: number) => {
    for (const s of ord) if (v >= s.soglia) return s.grado;
    return "F";
  };
}

/** Pronta da usare? (archivio con la curva del voto) */
export function curvaPronta(f: Forza | null | undefined): f is Forza {
  return !!f && !!f.soglie?.length && (f.stagioni.length === 0 || typeof f.stagioni[0].voto === "number")
    && (f.stagioni.length > 0 || f.curva.length > 0);
}

function Grafico({ f, colore, lettera }: { f: Forza; colore: string; lettera: (v: number) => string }) {
  const vere = f.stagioni;
  const future = f.curva;
  const eta = [...vere.map(s => s.eta), ...future.map(c => c.eta)];
  const e0 = Math.min(2, ...eta), e1 = Math.max(7, ...eta);
  const n = e1 - e0 + 1;
  const W = 520, H = 150, L = 40, R = 14, T = 8, B = 22;
  const X = (e: number) => L + ((e - e0) / Math.max(1, e1 - e0)) * (W - L - R);
  // Fasce uguali per lettera: le soglie alte sono a pochi punti l'una dall'altra.
  const soglie = [...f.soglie].filter(s => s.grado !== "F").sort((a, b) => b.soglia - a.soglia);
  const nodi = [0, ...soglie.map(s => s.soglia).sort((a, b) => a - b), 100];
  const Y = (v: number) => {
    let i = 0;
    while (i < nodi.length - 2 && v >= nodi[i + 1]) i++;
    const q = (i + Math.min(1, Math.max(0, (v - nodi[i]) / Math.max(1e-6, nodi[i + 1] - nodi[i])))) / (nodi.length - 1);
    return T + (1 - q) * (H - T - B);
  };
  const passo = n > 9 ? 2 : 1;
  const ultimaVera = vere.length ? vere[vere.length - 1] : null;
  const ponte = ultimaVera && future.length && future[0].eta === ultimaVera.eta + 1
    ? [{ eta: ultimaVera.eta, mediana: ultimaVera.voto, basso: ultimaVera.voto, alto: ultimaVera.voto }, ...future]
    : future;
  const banda = ponte.map(c => `${X(c.eta)},${Y(c.alto)}`).join(" ") + " " +
    [...ponte].reverse().map(c => `${X(c.eta)},${Y(c.basso)}`).join(" ");
  // Etichette dell'asse: una per fascia, al centro della fascia.
  const fasce = ORDINE.map((g, i) => {
    const giu = g === "F" ? 0 : (soglie.find(s => s.grado === g)?.soglia ?? null);
    const su = i === 0 ? 100 : (soglie.find(s => s.grado === ORDINE[i - 1])?.soglia ?? null);
    return giu == null || su == null ? null : { g, y: (Y(giu) + Y(su)) / 2, giu };
  }).filter(Boolean) as { g: string; y: number; giu: number }[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Voto di carriera anno per anno, vero e previsto"
         style={{ width: "100%", maxWidth: 560, height: "auto", display: "block" }}>
      {fasce.map(({ g, y, giu }) => {
        const [bg, fg, bd] = DISTINTIVO[g];
        const w = g.length > 2 ? 28 : g.length > 1 ? 22 : 16;
        return (
          <g key={g}>
            {g !== "F" && <line x1={L} x2={W - R} y1={Y(giu)} y2={Y(giu)} stroke="hsl(220 10% 30% / .4)" strokeDasharray="2 4" />}
            <rect x={L - 6 - w} y={y - 6.5} width={w} height={13} rx={3.5} fill={bg} stroke={bd} strokeWidth={0.8} />
            <text x={L - 6 - w / 2} y={y + 3.4} textAnchor="middle" fontSize="9" fontWeight="700" fill={fg}>{g}</text>
          </g>
        );
      })}
      {Array.from({ length: n }, (_, i) => e0 + i).map((e, i) => (
        <g key={e}>
          <line x1={X(e)} x2={X(e)} y1={T} y2={H - B} stroke="hsl(220 10% 30% / .25)" />
          {i % passo === 0 && <text x={X(e)} y={H - B + 14} textAnchor="middle" fontSize="10" fill="hsl(210 8% 55%)">{e}</text>}
        </g>
      ))}
      <text x={W - R} y={H - 1} textAnchor="end" fontSize="9" fill="hsl(210 8% 48%)">età</text>
      {ponte.length > 1 && <polygon points={banda} fill={colore} fillOpacity={0.14} stroke="none" />}
      {ponte.length > 1 && (
        <polyline points={ponte.map(c => `${X(c.eta)},${Y(c.mediana)}`).join(" ")} fill="none"
                  stroke={colore} strokeWidth="1.8" strokeDasharray="5 4" />
      )}
      {vere.length > 1 && <polyline points={vere.map(s => `${X(s.eta)},${Y(s.voto)}`).join(" ")} fill="none" stroke={colore} strokeWidth="2" />}
      {vere.map(s => (
        <circle key={`v${s.eta}`} cx={X(s.eta)} cy={Y(s.voto)} r={s.corse ? 3 : 2.2}
                fill={s.corse ? colore : "hsl(220 13% 10%)"} stroke={colore} strokeWidth="1.2">
          <title>{`${s.eta} anni (${s.anno}): ${lettera(s.voto)} (${num(s.voto)}) · ${s.corse ? `${s.corse} corse` : "nessuna corsa"}`}</title>
        </circle>
      ))}
      {future.map(c => (
        <circle key={`p${c.eta}`} cx={X(c.eta)} cy={Y(c.mediana)} r="2.6" fill="hsl(220 13% 10%)" stroke={colore} strokeWidth="1.2">
          <title>{`${c.eta} anni${f.nato ? ` (${f.nato + c.eta})` : ""}, previsto: ${lettera(c.mediana)} (${num(c.mediana)})${c.basso !== c.alto ? `, fra ${lettera(c.basso)} e ${lettera(c.alto)}` : ""}`}</title>
        </circle>
      ))}
      {f.potenziale != null && f.potenziale_eta != null && future.length > 0 && !f.ferma && (
        <circle cx={X(f.potenziale_eta)} cy={Y(f.potenziale)} r="5.5" fill="none" stroke={colore} strokeWidth="1.6" />
      )}
    </svg>
  );
}

export default function CurvaVoto({ f, colore }: { f: Forza; colore: string }) {
  const lettera = letteraDa(f.soglie);
  const vc = f.verifica?.curva;
  const previsto = f.curva.length > 0 && !f.ferma;
  return (
    <div data-testid="curva-voto" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{f.ferma ? "A fine carriera" : "A fine carriera (previsto)"}</span>
        {f.potenziale != null && <GradeBadge grade={lettera(f.potenziale)} size="sm" />}
        {f.potenziale != null && (
          <span className="tabular" style={{ fontSize: 12, color: "hsl(210 10% 78%)" }}>
            {num(f.potenziale)}
            {previsto && f.potenziale_basso != null && f.potenziale_alto != null
              ? ` · fra ${lettera(f.potenziale_basso)} e ${lettera(f.potenziale_alto)}` : ""}
          </span>
        )}
        {f.ferma && <span style={{ fontSize: 11, color: "var(--muted)" }}>· carriera ferma da oltre sei mesi</span>}
      </div>
      {f.picco != null && f.picco_eta != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6, fontSize: 11.5, color: "var(--muted)" }}>
          <span>Picco già raggiunto</span>
          <GradeBadge grade={lettera(f.picco)} size="sm" />
          <span className="tabular" style={{ color: "hsl(210 10% 78%)" }}>{num(f.picco)} a {f.picco_eta} anni</span>
          {f.potenziale != null && f.potenziale < f.picco - 1 && (
            <span style={{ color: "hsl(38 70% 62%)" }}>· dopo il picco: il voto di carriera scende se le stagioni corse restano poche rispetto a quelle possibili</span>
          )}
        </div>
      )}
      {(f.corse_estero_12_mesi ?? 0) > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
          Corre all'estero ({f.corse_estero_12_mesi} corse negli ultimi 12 mesi): contano nel voto e nella curva, non nella velocità,
          perché l'archivio non sa su quale pista estera si correva.
        </div>
      )}
      <Grafico f={f} colore={colore} lettera={lettera} />
      <Spiegazione titolo="Come si legge la curva" compatta>
        Ogni punto è il voto di carriera che il cavallo avrebbe avuto se la carriera si fosse chiusa quel 31 dicembre: stessa
        formula del voto in testata, con le corse fino a quell'anno. L'ultimo punto pieno è il voto di oggi; i punti vuoti sono
        anni senza corse. {previsto ? "Il tratteggio e la banda sono gli anni previsti, con la forbice che dovrebbe contenere il vero 8 volte su 10; il cerchio è il voto di fine carriera previsto. " : ""}
        {f.ferma ? "Per una carriera ferma non c'è previsione: il voto cambia solo per le stagioni che avrebbe potuto correre, fino ai 7 anni. " : ""}
        {vc ? <>Verifica con la formula allenata fino al 2021 e provata sul 2022-2025: errore medio {num(vc.errore_modello)} punti
          contro {num(vc.errore_riferimento)} di chi aggiunge al voto di oggi la crescita tipica di quell'età; forbice giusta
          {" "}{Math.round(vc.copertura_80 * 100)} volte su 100.</> : null}
      </Spiegazione>
    </div>
  );
}
