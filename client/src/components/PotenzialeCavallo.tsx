/**
 * Potenziale dinamico (novembre 2026, potenziale.py).
 *
 * La posizione attesa del cavallo a fine anno dei 4 anni contro tutti i nati
 * del suo anno, con l'intervallo che dovrebbe contenere il vero 8 volte su 10.
 * La curva viene dal registro: ogni stima scritta resta com'era, quindi si
 * vede come e' cambiato il potenziale con l'arrivo di qualifiche e corse, e,
 * per i cavalli gia' maturi, dove sono arrivati davvero.
 */
import GradeBadge from "./GradeBadge";
import { Spiegazione } from "./Spiegazione";

export interface RigaPotenziale {
  data: string; eta_mesi: number; stadio: string; n_corse: number;
  potenziale: number; basso: number; alto: number; origine: "notte" | "ricostruita";
}
export interface Potenziale {
  versione: string;
  anno_traguardo: number | null;
  traguardo: number | null;
  ultima: RigaPotenziale & { etichetta: { esito: string; motivo: string | null } | null };
  storia: RigaPotenziale[];
  stadi: Record<string, string> | null;
}

const SCALA: [number, string][] = [[99, "SSS"], [95, "SS"], [90, "S"], [75, "A"], [60, "B"], [40, "C"], [25, "D"], [10, "E"]];
export function lettera(p: number): string {
  for (const [soglia, g] of SCALA) if (p > soglia) return g;
  return "F";
}
const num = (x: number) => x.toFixed(1).replace(".", ",");
const dataIt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function Curva({ p }: { p: Potenziale }) {
  const righe = p.storia;
  const W = 640, H = 210, L = 44, R = 16, T = 14, B = 30;
  const t = (d: string) => Date.parse(d);
  const fine = p.anno_traguardo ? t(`${p.anno_traguardo}-12-31`) : t(righe[righe.length - 1].data);
  const lo = t(righe[0].data), hi = Math.max(fine, t(righe[righe.length - 1].data));
  const X = (d: string) => L + ((t(d) - lo) / Math.max(1, hi - lo)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const banda = righe.map(r => `${X(r.data)},${Y(r.alto)}`).join(" ") + " " +
    [...righe].reverse().map(r => `${X(r.data)},${Y(r.basso)}`).join(" ");
  const linea = righe.map(r => `${X(r.data)},${Y(r.potenziale)}`).join(" ");
  const anni: number[] = [];
  for (let a = new Date(lo).getUTCFullYear() + 1; a <= new Date(hi).getUTCFullYear(); a++) anni.push(a);
  const cambioStadio = righe.filter((r, i) => i > 0 && r.stadio !== righe[i - 1].stadio && (r.stadio === "qualifiche" || righe[i - 1].stadio === "nascita" || righe[i - 1].stadio === "qualifiche"));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Come è cambiato il potenziale nel tempo" style={{ width: "100%", height: "auto", display: "block" }}>
      {[90, 75, 60, 40, 25, 10].map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="hsl(220 10% 30% / .45)" strokeDasharray="2 4" />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="10.5" fill="hsl(210 8% 55%)">{lettera(v + 0.5)}</text>
        </g>
      ))}
      <text x={L - 6} y={Y(5) + 4} textAnchor="end" fontSize="10.5" fill="hsl(210 8% 55%)">F</text>
      {anni.map(a => (
        <g key={a}>
          <line x1={X(`${a}-01-01`)} x2={X(`${a}-01-01`)} y1={T} y2={H - B} stroke="hsl(220 10% 30% / .35)" />
          <text x={X(`${a}-01-01`)} y={H - B + 16} textAnchor="middle" fontSize="10.5" fill="hsl(210 8% 55%)">{a}</text>
        </g>
      ))}
      <polygon points={banda} fill="hsl(265 80% 70% / .16)" stroke="none" />
      <polyline points={linea} fill="none" stroke="hsl(265 85% 74%)" strokeWidth="2" />
      {righe.map(r => (
        <circle key={r.data} cx={X(r.data)} cy={Y(r.potenziale)} r="3"
          fill={r.origine === "notte" ? "hsl(265 85% 74%)" : "hsl(220 13% 10%)"} stroke="hsl(265 85% 74%)" strokeWidth="1.25">
          <title>{`${dataIt(r.data)} · ${r.stadio}: ${lettera(r.potenziale)} (${num(r.potenziale)}), fra ${lettera(r.basso)} e ${lettera(r.alto)}${r.origine === "ricostruita" ? " · ricostruita" : ""}`}</title>
        </circle>
      ))}
      {cambioStadio.map(r => (
        <text key={`s${r.data}`} x={X(r.data)} y={Math.max(T + 10, Y(r.alto) - 6)} textAnchor="middle" fontSize="10" fill="hsl(210 8% 62%)">
          {r.stadio === "qualifiche" ? "qualifica" : "prima corsa"}
        </text>
      ))}
      {p.traguardo != null && p.anno_traguardo && (
        <g>
          <line x1={L} x2={W - R} y1={Y(p.traguardo)} y2={Y(p.traguardo)} stroke="hsl(145 60% 55%)" strokeWidth="1.25" strokeDasharray="6 4" />
          <circle cx={X(`${p.anno_traguardo}-12-31`)} cy={Y(p.traguardo)} r="4.5" fill="hsl(145 60% 55%)" />
          <text x={X(`${p.anno_traguardo}-12-31`) - 8} y={Y(p.traguardo) - 8} textAnchor="end" fontSize="10.5" fill="hsl(145 60% 62%)">
            arrivato: {lettera(p.traguardo)} ({num(p.traguardo)})
          </text>
        </g>
      )}
    </svg>
  );
}

export default function PotenzialeCavallo({ p, style }: { p: Potenziale; style?: React.CSSProperties }) {
  const u = p.ultima;
  const maturo = p.traguardo != null;
  const ok = u.etichetta?.esito === "affidabile";
  const ricostruita = p.storia.some(r => r.origine === "ricostruita");
  return (
    <div className="pannello" style={{ ...style, borderLeft: "3px solid hsl(265 80% 70%)" }} data-testid="pannello-potenziale">
      <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        {maturo ? `Potenziale previsto e traguardo dei 4 anni (${p.anno_traguardo})` : `Potenziale a 4 anni (fine ${p.anno_traguardo})`}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {!maturo ? (
          <>
            <GradeBadge grade={lettera(u.potenziale)} size="lg" />
            <span style={{ fontSize: 13.5, color: "hsl(210 10% 82%)" }}>
              posizione attesa {num(u.potenziale)} su 100 · fra <strong>{lettera(u.basso)}</strong> e <strong>{lettera(u.alto)}</strong>
            </span>
          </>
        ) : (
          <>
            <GradeBadge grade={lettera(p.traguardo!)} size="lg" />
            <span style={{ fontSize: 13.5, color: "hsl(210 10% 82%)" }}>
              arrivato a {num(p.traguardo!)} su 100 a fine {p.anno_traguardo}. L'ultima previsione prima del traguardo diceva {lettera(u.potenziale)}, fra {lettera(u.basso)} e {lettera(u.alto)}.
            </span>
          </>
        )}
        <span title={u.etichetta?.motivo ?? undefined} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px",
          color: ok ? "hsl(145 60% 62%)" : "hsl(38 85% 62%)", background: ok ? "hsl(145 40% 16%)" : "hsl(38 60% 16%)",
          border: `1px solid ${ok ? "hsl(145 40% 30%)" : "hsl(38 50% 30%)"}` }}>
          {u.stadio}: {u.etichetta?.esito ?? "in verifica"}
        </span>
      </div>
      <div style={{ marginTop: 12 }}><Curva p={p} /></div>
      <div style={{ fontSize: 11.5, color: "hsl(210 8% 55%)", marginTop: 4 }}>
        La banda è l'intervallo che dovrebbe contenere il vero 8 volte su 10.
        {ricostruita && " I punti vuoti sono ricostruiti: calcolati a ritroso con i soli dati di quel giorno."}
      </div>
      <Spiegazione titolo="Come si calcola e quanto fidarsi" compatta>
        Il potenziale è la posizione attesa a fine anno dei 4 anni contro tutti i nati dello stesso anno, contando fra gli ultimi
        chi non ha mai corso. Alla nascita si basa su padre, madre e padre della madre (come vanno i loro figli e nipoti già
        maturi); poi entrano la qualifica e le corse, e l'intervallo si stringe. Ogni stima resta scritta nel registro così
        com'era: per questo la curva non si può aggiustare dopo.
        {u.etichetta?.motivo ? <> Allo stadio «{u.stadio}» è ancora in verifica: {u.etichetta.motivo}.</> : null}
        {p.stadi ? <> Esito per stadio: {Object.entries(p.stadi).map(([k, v]) => `${k} ${v}`).join(", ")}.</> : null}
      </Spiegazione>
    </div>
  );
}
