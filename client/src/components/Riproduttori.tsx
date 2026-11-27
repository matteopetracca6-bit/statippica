/**
 * Schede di stallone e fattrice (27/11/2026): il voto da riproduttore negli
 * anni e, per lo stallone, gli incroci migliori (padre della madre).
 * Dati da server/riproduttori.ts.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";
import { Spiegazione } from "./Spiegazione";
import { COLORE_VOTO } from "@/lib/coloreVoto";

const MUTO = "hsl(210 8% 55%)";
const TIT: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em" };
const v1 = (x: number) => x.toFixed(1).replace(".", ",");
const euro = (x: number) => `€ ${Math.round(x).toLocaleString("it-IT")}`;
/** Media dei pesi delle lettere -> lettera piu' vicina (stessi pesi del voto). */
const letteraMedia = (m: number) => m >= 92.5 ? "SSS" : m >= 77.5 ? "SS" : m >= 62.5 ? "S" : m >= 47.5 ? "A" : m >= 32.5 ? "B" : m >= 20 ? "C" : m >= 11.5 ? "D" : m >= 5 ? "E" : "F";

type Punto = { anno: number; figli: number; punteggio: number; voto: string; nuovi: number; migliore: string | null };

export function VotoNegliAnni({ tipo, nome, colore }: { tipo: "stallone" | "fattrice"; nome: string; colore: string }) {
  const { data } = useQuery<{ punti: Punto[]; n_figli: number; oggi: { punteggio: number; voto: string } | null }>({
    queryKey: ["/api/riproduttore/anni", tipo, nome],
    queryFn: async () => (await apiRequest("GET", `/api/riproduttore/anni?tipo=${tipo}&nome=${encodeURIComponent(nome)}`)).json(),
    enabled: !!nome, staleTime: 3600_000,
  });
  const [sel, setSel] = useState<number | null>(null);
  const p = data?.punti ?? [];
  if (p.length < 2) return null;
  const W = 640, H = 170, ml = 34, mr = 12, mt = 14, mb = 26;
  const ys = p.map(x => x.punteggio);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 6) { const c = (hi + lo) / 2; lo = c - 3; hi = c + 3; }
  lo = Math.max(0, lo - 2); hi = Math.min(100, hi + 2);
  const X = (i: number) => ml + (i / (p.length - 1)) * (W - ml - mr);
  const Y = (v: number) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);
  const path = p.map((q, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(q.punteggio).toFixed(1)}`).join(" ");
  const passo = Math.max(1, Math.ceil(p.length / 8));
  const scelto = sel != null ? p[sel] : p[p.length - 1];
  const cambi = p.filter((q, i) => i === 0 || q.voto !== p[i - 1].voto);
  return (
    <div className="pannello" style={{ padding: "16px 20px", marginBottom: 18 }} data-testid={`voto-anni-${tipo}`}>
      <div style={TIT}>Il voto da {tipo === "stallone" ? "stallone" : "fattrice"} negli anni</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: "hsl(210 10% 80%)", margin: "8px 0 4px" }}>
        <span className="tabular">Con i figli nati fino al {scelto.anno}:</span>
        <GradeBadge grade={scelto.voto} size="sm" />
        <span className="tabular" style={{ color: MUTO }}>{v1(scelto.punteggio)} punti · {scelto.figli} figli{scelto.migliore ? ` · nuovo: ${scelto.migliore}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 200 }} onMouseLeave={() => setSel(null)} role="img"
        aria-label={`Voto negli anni: da ${p[0].voto} nel ${p[0].anno} a ${p[p.length - 1].voto} nel ${p[p.length - 1].anno}`}>
        {[lo, (lo + hi) / 2, hi].map(v => (
          <g key={v}>
            <line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} stroke="hsl(220 10% 18%)" strokeDasharray="3 4" />
            <text x={ml - 6} y={Y(v) + 4} textAnchor="end" fontSize="10" fill="hsl(210 8% 48%)">{Math.round(v)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={colore} strokeWidth={2.2} />
        {p.map((q, i) => (
          <g key={q.anno} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
            <rect x={X(i) - (W - ml - mr) / p.length / 2} y={mt} width={(W - ml - mr) / p.length} height={H - mt - mb} fill="transparent" />
            <circle cx={X(i)} cy={Y(q.punteggio)} r={sel === i ? 5 : 3.2} fill={COLORE_VOTO[q.voto] ?? colore} stroke="hsl(220 13% 8%)" strokeWidth={1.2} />
            {(i % passo === 0 || i === p.length - 1) && <text x={X(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="hsl(210 8% 50%)">{q.anno}</text>}
          </g>
        ))}
        {cambi.map(q => { const i = p.indexOf(q); return (
          <text key={`l${q.anno}`} x={X(i)} y={Y(q.punteggio) - 8} textAnchor="middle" fontSize="10.5" fontWeight={700} fill={COLORE_VOTO[q.voto] ?? colore}>{q.voto}</text>
        ); })}
      </svg>
      <Spiegazione titolo="Come si legge" compatta>
        Ogni punto è il voto da {tipo} che avrebbe se contassero solo i figli nati fino a quell&apos;anno, con la stessa formula del voto di
        oggi e le soglie delle lettere di oggi. Il voto di ogni figlio è quello attuale, non quello che aveva allora: la curva dice come i
        figli nati via via hanno spostato il giudizio, non cosa si sapeva in quell&apos;anno. Le lettere sopra la linea segnano dove cambia.
        {tipo === "stallone" ? " Con pochi figli il voto di uno stallone resta vicino alla media di tutti: si muove man mano che i figli diventano tanti." : ""}
      </Spiegazione>
    </div>
  );
}

type Gruppo = { padre_madre: string; figli: number; media: number; stimata: number; top: number; guadagno_medio: number; migliore: { nome: string; anno: number; voto: string } | null };

export function IncrociStallone({ nome }: { nome: string }) {
  const { data } = useQuery<{ gruppi: Gruppo[]; media: number | null; top_tutti?: number; n_figli: number; con_padre_madre?: number; minimo?: number }>({
    queryKey: ["/api/stallion/incroci", nome],
    queryFn: async () => (await apiRequest("GET", `/api/stallion/${encodeURIComponent(nome)}/incroci`)).json(),
    enabled: !!nome, staleTime: 3600_000,
  });
  const [tutti, setTutti] = useState(false);
  if (!data) return <div style={{ fontSize: 12.5, color: MUTO, padding: 8 }}>Carico gli incroci…</div>;
  const g = data.gruppi;
  if (!g.length || data.media == null) {
    return <div style={{ fontSize: 12.5, color: MUTO, padding: 8 }}>Nessun padre della madre con almeno {data.minimo ?? 5} figli valutati.</div>;
  }
  const max = Math.max(...g.map(x => x.stimata), data.media) + 3;
  const righe = tutti ? g : g.slice(0, 10);
  return (
    <div className="pannello" style={{ padding: "16px 20px", marginBottom: 18 }} data-testid="incroci-stallone">
      <div style={TIT}>Con quali padri della madre rende di più</div>
      <div style={{ fontSize: 12.5, color: MUTO, margin: "6px 0 10px" }}>
        Media di tutti i suoi figli: <GradeBadge grade={letteraMedia(data.media)} size="sm" /> {v1(data.media)} · {g.length} incroci con almeno {data.minimo} figli
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
              {["Padre della madre", "Figli", "Voto medio", "S o meglio", "Guadagno medio", "Il migliore"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "5px 8px", fontSize: 10.5, fontWeight: 600, color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map(x => {
              const sopra = x.stimata - data.media!;
              return (
                <tr key={x.padre_madre} style={{ borderBottom: "1px solid hsl(220 10% 14%)" }}>
                  <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                    <Link href={`/stallion/${encodeURIComponent(x.padre_madre)}`} style={{ color: "hsl(210 10% 88%)", fontWeight: 700, textDecoration: "none" }}>{x.padre_madre}</Link>
                  </td>
                  <td className="tabular" style={{ padding: "7px 8px", color: MUTO }}>{x.figli}</td>
                  <td style={{ padding: "7px 8px", minWidth: 150 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <GradeBadge grade={letteraMedia(x.media)} size="sm" />
                      <div style={{ position: "relative", flex: 1, height: 6, background: "hsl(220 10% 16%)", borderRadius: 3, minWidth: 50 }}>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(x.stimata / max) * 100}%`, borderRadius: 3,
                          background: sopra >= 2 ? "hsl(120 55% 50%)" : sopra <= -2 ? "hsl(8 60% 55%)" : "hsl(210 8% 50%)" }} />
                        <div style={{ position: "absolute", left: `${(data.media! / max) * 100}%`, top: -3, bottom: -3, width: 1.5, background: "hsl(210 10% 80%)" }} title="Media di tutti i suoi figli" />
                      </div>
                      <span className="tabular" style={{ color: sopra >= 2 ? "hsl(120 55% 60%)" : sopra <= -2 ? "hsl(8 60% 65%)" : MUTO, fontSize: 11.5, minWidth: 34, textAlign: "right" }}>
                        {sopra >= 0 ? "+" : "−"}{v1(Math.abs(sopra))}
                      </span>
                    </div>
                  </td>
                  <td className="tabular" style={{ padding: "7px 8px", color: x.top > (data.top_tutti ?? 0) ? "hsl(51 80% 60%)" : MUTO }}>{v1(x.top)}%</td>
                  <td className="tabular" style={{ padding: "7px 8px", color: "hsl(51 80% 60%)" }}>{euro(x.guadagno_medio)}</td>
                  <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                    {x.migliore && <Link href={`/horse/${encodeURIComponent(x.migliore.nome)}/${x.migliore.anno}`} style={{ color: "hsl(210 10% 80%)", textDecoration: "none", display: "inline-flex", gap: 5, alignItems: "center" }}>
                      {x.migliore.nome} <GradeBadge grade={x.migliore.voto} size="sm" /></Link>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {g.length > 10 && (
        <button type="button" className="lista-altre" onClick={() => setTutti(v => !v)}>{tutti ? "Mostra meno" : `Mostra tutti (${g.length})`}</button>
      )}
      <Spiegazione titolo="Come si legge" compatta>
        I figli dello stallone divisi per padre della madre (solo i gruppi con almeno {data.minimo} figli valutati). Il voto medio è la media
        delle lettere dei figli; la barra e il numero dicono quanto il gruppo sta sopra o sotto la media di tutti i suoi figli (la riga chiara),
        dopo aver tirato i gruppi piccoli verso la media perché cinque figli fortunati non bastino a fare un incrocio. «S o meglio» è la quota di
        figli con voto S, SS o SSS (in tutti i suoi figli: {v1(data.top_tutti ?? 0)}%). Sono dati del passato, non una garanzia per il prossimo puledro.
        {data.con_padre_madre != null && ` Il padre della madre è noto per ${data.con_padre_madre} figli su ${data.n_figli}.`}
      </Spiegazione>
    </div>
  );
}
