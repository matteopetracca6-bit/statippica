/**
 * Confronto fra stalloni sul prezzo della monta (pagina Catalogo stalloni).
 *
 * Per ogni stallone con prezzo e almeno 5 figli osservati: quanto vince in
 * media un suo figlio in carriera, quanto costa allevarlo e farlo correre, e
 * quindi l'utile atteso. Il grafico mette la monta contro il guadagno atteso:
 * chi sta in alto a sinistra da' figli buoni a poco prezzo, chi sta in basso a
 * destra costa piu' di quello che i figli restituiscono.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { STILE_SCHEDA } from "./GraficoColonne";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis } from "recharts";
import { Scale, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";

const MUTED = "hsl(210 8% 50%)";
const euro = (n: number) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
const k = (n: number) => "€" + Math.round(n / 1000).toLocaleString("it-IT") + "k";

interface Riga {
  nome: string; voto: string | null; monta: number; figli: number; affidabilita: number;
  utile_atteso: number; prob_profitto: number; guadagno_atteso: number; costo_atteso: number; esito: string;
}
type Ordine = "rapporto" | "utile" | "guadagno" | "monta";

export default function ConfrontoStalloni() {
  const [aperto, setAperto] = useState(true);
  const [mensile, setMensile] = useState(1200);
  const [ordine, setOrdine] = useState<Ordine>("utile");
  const { data, isLoading } = useQuery<{ mensile: number; stalloni: Riga[] }>({
    queryKey: ["/api/pareggio/stalloni", mensile],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/stalloni?mensile=${mensile}`)).json(),
    staleTime: 30 * 60 * 1000,
  });

  const righe = useMemo(() => {
    const r = [...(data?.stalloni ?? [])];
    const f: Record<Ordine, (a: Riga, b: Riga) => number> = {
      utile: (a, b) => b.utile_atteso - a.utile_atteso,
      guadagno: (a, b) => b.guadagno_atteso - a.guadagno_atteso,
      monta: (a, b) => a.monta - b.monta,
      rapporto: (a, b) => b.guadagno_atteso / b.monta - a.guadagno_atteso / a.monta,
    };
    return r.sort(f[ordine]);
  }, [data, ordine]);

  const bottone = (attivo: boolean): React.CSSProperties => ({
    padding: "5px 11px", borderRadius: "999px", cursor: "pointer", fontSize: "12px", fontWeight: 700,
    border: "1px solid " + (attivo ? "hsl(160 60% 50%)" : "hsl(220 10% 20%)"),
    background: attivo ? "hsl(160 60% 50% / 0.14)" : "transparent", color: attivo ? "hsl(160 60% 60%)" : MUTED,
  });
  const mediana = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const gMed = mediana(righe.map(r => r.guadagno_atteso));

  return (
    <div style={{ background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "14px", padding: "18px 20px", marginBottom: "20px" }}>
      <button onClick={() => setAperto(a => !a)} aria-expanded={aperto}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
        <Scale size={16} style={{ color: "hsl(160 60% 50%)" }} />
        <span style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>Confronto sul prezzo della monta</span>
        <ChevronDown size={15} style={{ marginLeft: "auto", color: MUTED, transform: aperto ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {aperto && (
        <div style={{ marginTop: "12px" }}>
          <p style={{ fontSize: "12.5px", color: MUTED, lineHeight: 1.65, margin: "0 0 12px", maxWidth: "900px" }}>
            Quanto vince in media in carriera un figlio di ogni stallone, contando anche chi non corre mai, e
            quanto resta dopo i costi (monta, allevamento, allenamento). In alto a sinistra gli stalloni che
            danno figli buoni a poco prezzo; in basso a destra quelli che costano più di quanto restituiscono.
            Con fattrice qualunque: una fattrice buona sposta il risultato.
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", color: MUTED }}>Costo al mese:</span>
            {[800, 1200].map(m => <button key={m} style={bottone(mensile === m)} onClick={() => setMensile(m)}>{euro(m)}</button>)}
          </div>
          {isLoading || !data ? <div className="skeleton" style={{ height: "320px", borderRadius: "8px" }} /> : (
            <>
              <div style={{ height: "320px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid stroke="hsl(220 10% 18%)" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="monta" scale="log" domain={[800, 40000]} ticks={[1000, 2000, 3000, 5000, 10000, 20000, 35000]} allowDataOverflow tickFormatter={k}
                      stroke={MUTED} fontSize={11} name="Monta"
                      label={{ value: "Prezzo della monta (scala logaritmica)", position: "insideBottom", offset: -18, fill: MUTED, fontSize: 11 }} />
                    <YAxis type="number" dataKey="guadagno_atteso" tickFormatter={k} stroke={MUTED} fontSize={11} name="Guadagno atteso"
                      label={{ value: "Vinto in media da un figlio", angle: -90, position: "insideLeft", fill: MUTED, fontSize: 11, dx: 4, dy: 70 }} />
                    <ZAxis type="number" dataKey="figli" range={[30, 260]} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                      const r = payload?.[0]?.payload as Riga | undefined;
                      if (!r) return null;
                      return (
                        <div style={STILE_SCHEDA}>
                          <b>{r.nome}</b><br />Monta {euro(r.monta)} · {r.figli} figli<br />
                          Vinto da un figlio {euro(r.guadagno_atteso)}<br />Utile atteso {euro(r.utile_atteso)} · in utile {r.prob_profitto}%
                        </div>
                      );
                    }} />
                    <Scatter data={righe} fill="hsl(160 60% 50%)" fillOpacity={0.75}
                      shape={(p: any) => <circle cx={p.cx} cy={p.cy} r={Math.max(3, Math.sqrt(p.payload.figli) * 0.9)}
                        fill={p.payload.guadagno_atteso >= gMed ? "hsl(160 60% 50%)" : "hsl(25 80% 58%)"} fillOpacity={0.35 + 0.55 * p.payload.affidabilita} />} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: "11.5px", color: MUTED, margin: "2px 0 14px" }}>
                Cerchio più grande = più figli osservati, più pieno = giudizio più affidabile. Verde: figli sopra la mediana, arancio: sotto.
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: MUTED }}>Ordina per:</span>
                <button style={bottone(ordine === "utile")} onClick={() => setOrdine("utile")}>Utile atteso</button>
                <button style={bottone(ordine === "rapporto")} onClick={() => setOrdine("rapporto")}>Resa per euro di monta</button>
                <button style={bottone(ordine === "guadagno")} onClick={() => setOrdine("guadagno")}>Vinto dai figli</button>
                <button style={bottone(ordine === "monta")} onClick={() => setOrdine("monta")}>Monta più bassa</button>
              </div>
              <div style={{ overflowX: "auto", maxHeight: "420px", overflowY: "auto" }}>
                <table className="tabular" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "760px" }}>
                  <thead style={{ position: "sticky", top: 0, background: "hsl(220 12% 10%)" }}>
                    <tr style={{ color: MUTED, fontSize: "11px" }}>
                      {["#", "Stallone", "Voto", "Monta", "Figli", "Vinto da un figlio", "Resa per €", "Utile atteso", "In utile", "Affidabilità"].map((t, i) => (
                        <th key={t} style={{ padding: "6px 8px", textAlign: i < 3 ? "left" : "right", fontWeight: 600, borderBottom: "1px solid hsl(220 10% 16%)" }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((r, i) => (
                      <tr key={r.nome} style={{ borderBottom: "1px solid hsl(220 10% 14%)" }}>
                        <td style={{ padding: "6px 8px", color: MUTED }}>{i + 1}</td>
                        <td style={{ padding: "6px 8px" }}><Link href={`/stallion/${encodeURIComponent(r.nome)}`}><a style={{ color: "hsl(210 10% 88%)", fontWeight: 600, textDecoration: "none" }}>{r.nome}</a></Link></td>
                        <td style={{ padding: "6px 8px" }}>{r.voto && <GradeBadge grade={r.voto} size="sm" />}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "hsl(51 70% 58%)" }}>{euro(r.monta)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: MUTED }}>{r.figli}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{euro(r.guadagno_atteso)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{(r.guadagno_atteso / r.monta).toLocaleString("it-IT", { maximumFractionDigits: 1 })}×</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: r.utile_atteso >= 0 ? "hsl(145 60% 50%)" : "hsl(0 65% 62%)" }}>{euro(r.utile_atteso)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.prob_profitto.toLocaleString("it-IT")}%</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: MUTED }}>{Math.round(r.affidabilita * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "11.5px", color: MUTED, lineHeight: 1.6, margin: "10px 0 0" }}>
                "Resa per €" è quanto vince in media un figlio per ogni euro di monta.
                {righe.length > 0 && righe.every(r => r.utile_atteso < 0) && <> Con questo costo mensile nessuno stallone, con fattrice
                qualunque, porta il figlio medio in utile: pesa soprattutto il costo di allenamento, non la monta.</>}
                {" "}I conti sono gli stessi della scheda <Link href="/pareggio"><a style={{ color: "hsl(160 60% 55%)" }}>Punto di pareggio</a></Link>.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
