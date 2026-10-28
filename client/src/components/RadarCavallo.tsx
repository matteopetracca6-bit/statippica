/**
 * Il grafico a sei punte in testata alla scheda del cavallo.
 *
 * Ogni punta va da 0 al centro a 100 sul bordo e dice quanti cavalli
 * confrontabili questo cavallo lascia dietro di se' (il calcolo e' nel
 * server, radarCavallo). Il colore e' quello del voto. Una punta senza dato
 * (per esempio un cavallo con meno di 5 corse) resta al
 * centro, tratteggiata, con la scritta "n.d." al posto del numero.
 */
export interface PuntaRadar {
  chiave: string;
  etichetta: string;
  valore: number | null;
  nota?: string;
}

const SPIEGAZIONI: Record<string, string> = {
  velocita: "Miglior tempo al km, contro i nati nello stesso anno",
  rendimento: "Premio medio vinto per ogni corsa, contro i nati nello stesso anno (almeno 5 corse)",
  costanza: "Quante volte arriva nei primi tre, contro i nati nello stesso anno (almeno 5 corse)",
  classe: "Livello delle corse disputate, stimato dal premio del vincitore, contro i nati nello stesso anno",
  frequenza: "Quante corse fa in media in una stagione in cui corre, contro i nati nello stesso anno (almeno 5 corse)",
  pedigree: "Valore di padre (60%) e madre (40%) come riproduttori, contro gli altri riproduttori con figli in gara",
};

export default function RadarCavallo({ punte, colore, dimensione = 230 }: {
  punte: PuntaRadar[]; colore: string; dimensione?: number;
}) {
  if (!punte?.length) return null;
  const W = 300, H = 250, cx = W / 2, cy = H / 2 + 2, R = 78;
  const n = punte.length;
  const angolo = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const punto = (i: number, v: number) => {
    const a = angolo(i), r = (R * Math.max(0, Math.min(100, v))) / 100;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const anello = (v: number) => punte.map((_, i) => punto(i, v).join(",")).join(" ");
  const forma = punte.map((p, i) => punto(i, p.valore ?? 0).join(",")).join(" ");

  return (
    <figure className="radar-cavallo" style={{ ["--c-radar" as any]: colore, margin: 0, width: Math.round(dimensione * 300 / 250) }}
      aria-label={"Profilo del cavallo: " + punte.map(p => `${p.etichetta} ${p.valore == null ? "non disponibile" : Math.round(p.valore)}`).join(", ")}>
      <svg viewBox={`0 0 ${W} ${H}`} width={dimensione * W / H} height={dimensione} role="img">
        {[25, 50, 75, 100].map(v => (
          <polygon key={v} points={anello(v)} fill="none"
            stroke="hsl(220 10% 24%)" strokeWidth={v === 100 ? 1.2 : 0.8} strokeDasharray={v === 100 ? undefined : "2 3"} />
        ))}
        {punte.map((p, i) => {
          const [x, y] = punto(i, 100);
          return <line key={p.chiave} x1={cx} y1={cy} x2={x} y2={y} stroke="hsl(220 10% 22%)" strokeWidth={0.8}
                       strokeDasharray={p.valore == null ? "3 3" : undefined} />;
        })}
        <polygon points={forma} fill={colore} fillOpacity={0.22} stroke={colore} strokeWidth={2} strokeLinejoin="round"
                 className="radar-forma" />
        {punte.map((p, i) => {
          if (p.valore == null) return null;
          const [x, y] = punto(i, p.valore);
          return <circle key={p.chiave} cx={x} cy={y} r={3.2} fill={colore} stroke="hsl(220 14% 10%)" strokeWidth={1.2} />;
        })}
        {punte.map((p, i) => {
          const a = angolo(i), c = Math.cos(a), s = Math.sin(a);
          const x = cx + (R + 16) * c, y = cy + (R + 14) * s;
          const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
          const dy = s < -0.5 ? -12 : s > 0.5 ? 4 : -4;
          return (
            <g key={p.chiave}>
              <title>{SPIEGAZIONI[p.chiave] ?? p.etichetta}{p.nota ? ` (${p.nota})` : ""}</title>
              <text x={x} y={y + dy} textAnchor={anchor} fontSize={11} fill="hsl(210 8% 60%)" fontWeight={600}>{p.etichetta}</text>
              <text x={x} y={y + dy + 14} textAnchor={anchor} fontSize={13} fontWeight={800}
                    fill={p.valore == null ? "hsl(210 8% 40%)" : "hsl(210 10% 92%)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                {p.valore == null ? "n.d." : Math.round(p.valore)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
