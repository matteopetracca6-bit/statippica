/**
 * Scheda di un singolo ippodromo: numeri della pista, effetto del numero di
 * partenza su QUESTA pista, distanze su cui si corre, guidatori piu' vincenti.
 */

import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft } from "lucide-react";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento } from "../components/Caricamento";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const BORDER = "1px solid hsl(220 10% 18%)";
const CARD = { background: "hsl(220 12% 10%)", border: BORDER, borderRadius: "12px", padding: "16px 20px" };

function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

export default function TrackPage() {
  const [, params] = useRoute("/ippodromo/:code");
  const codice = params?.code ? decodeURIComponent(params.code) : "";

  const { data: t, isLoading, error } = useQuery<any>({
    queryKey: ["/api/track", codice],
    queryFn: () => apiRequest("GET", `/api/track/${encodeURIComponent(codice)}`).then(r => r.json()),
    enabled: !!codice,
  });

  if (isLoading) return <Caricamento testo="Carico la scheda della pista..." />;
  if (error || !t || t.error) {
    return (
      <div style={{ maxWidth: "700px", margin: "40px auto", padding: "0 20px", color: MUTED }}>
        <Link href="/ippodromi"><a style={{ color: "hsl(183 75% 55%)", fontSize: "13px" }}>&larr; Tutti gli ippodromi</a></Link>
        <p style={{ marginTop: "14px" }}>Ippodromo non trovato.</p>
      </div>
    );
  }

  const maxPrimi = Math.max(...(t.partenze ?? []).map((p: any) => p.pct_primi_tre), 1);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px 18px 60px" }}>
      <Link href="/ippodromi">
        <a style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: MUTED, fontSize: "12.5px", textDecoration: "none", marginBottom: "16px" }}>
          <ArrowLeft size={14} /> Tutti gli ippodromi
        </a>
      </Link>

      <h1 style={{ fontSize: "26px", fontWeight: 800, color: "hsl(210 10% 91%)", margin: "0 0 4px", letterSpacing: "0.02em" }}>
        {t.nome}
      </h1>
      <div style={{ color: MUTED, fontSize: "12.5px", marginBottom: "18px" }}>
        {t.n_gare.toLocaleString("it-IT")} gare &middot; {t.n_giornate.toLocaleString("it-IT")} giornate
        &middot; {t.n_cavalli.toLocaleString("it-IT")} cavalli
        {t.prima_gara && <> &middot; dal {t.prima_gara.slice(0, 4)}</>}
      </div>

      <div style={{ ...CARD, marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px" }}>
          {[
            { l: "Distanza tipica", v: t.distanza_tipica ? `${t.distanza_tipica} m` : "\u2014", c: "hsl(210 10% 85%)" },
            { l: "Tempo al km medio", v: t.tempo_km_mediano ? `${t.tempo_km_mediano}"` : "\u2014", c: "hsl(210 10% 85%)" },
            { l: "Premio medio", v: t.premio_medio ? euro(t.premio_medio) : "\u2014", c: "hsl(51 70% 60%)" },
            { l: "Premio piu' alto", v: t.premio_massimo ? euro(t.premio_massimo) : "\u2014", c: "hsl(51 70% 60%)" },
            { l: "Partenti medi", v: t.partenti_medi ? t.partenti_medi.toFixed(1) : "\u2014", c: "hsl(210 10% 85%)" },
            { l: "Guidatori diversi", v: t.n_guidatori?.toLocaleString("it-IT") ?? "\u2014", c: "hsl(210 10% 85%)" },
          ].map(x => (
            <div key={x.l}>
              <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                {x.l}
              </div>
              <div className="tabular" style={{ fontSize: "19px", fontWeight: 800, color: x.c, lineHeight: 1.15 }}>
                {x.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Numero di partenza su questa pista */}
      {t.partenze?.length > 2 && (
        <div style={{ ...CARD, marginBottom: "16px" }}>
          <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Il numero di partenza su questa pista
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", height: "140px", marginBottom: "8px" }}>
            {t.partenze.map((p: any) => (
              <div key={p.start_pos} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                <div className="tabular" style={{ fontSize: "10.5px", fontWeight: 700, color: "hsl(210 10% 78%)" }}>
                  {p.pct_primi_tre.toFixed(0)}%
                </div>
                <div style={{
                  width: "100%",
                  height: `${Math.max(3, (p.pct_primi_tre / maxPrimi) * 100)}px`,
                  background: p.start_pos <= 5 ? "hsl(183 70% 45%)" : p.start_pos <= 8 ? "hsl(45 75% 50%)" : "hsl(15 70% 50%)",
                  borderRadius: "3px 3px 0 0",
                }} />
                <div style={{ fontSize: "10.5px", color: DIM, fontWeight: 600 }}>{p.start_pos}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: DIM, textAlign: "center" }}>
            quota di piazzamenti nei primi tre, per numero di partenza
          </div>
          {t.vantaggio_interno != null && (
            <div style={{ marginTop: "12px", fontSize: "12.5px", color: MUTED, lineHeight: 1.65 }}>
              Su questa pista partire dai primi tre numeri vale{" "}
              <strong style={{ color: "hsl(183 75% 60%)" }}>{t.vantaggio_interno.toFixed(0)} punti</strong> in
              piu' rispetto a partire dal settimo in poi.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        {t.distanze?.length > 0 && (
          <div style={CARD}>
            <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Distanze su cui si corre
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {t.distanze.map((d: any) => (
                  <tr key={d.distanza}>
                    <td className="tabular" style={{ padding: "5px 0", color: "hsl(210 10% 82%)", fontWeight: 600 }}>{d.distanza} m</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: MUTED }}>{d.n_gare.toLocaleString("it-IT")} gare</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: "hsl(183 70% 58%)", width: "70px" }}>
                      {d.tempo_km ? `${d.tempo_km}"` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {t.guidatori?.length > 0 && (
          <div style={CARD}>
            <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Guidatori piu' vincenti qui
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {t.guidatori.slice(0, 10).map((g: any) => (
                  <tr key={g.driver}>
                    <td style={{ padding: "5px 0" }}>
                      <Link href={`/guidatore/${encodeURIComponent(g.driver)}`}>
                        <a style={{ color: "hsl(210 10% 82%)", textDecoration: "none" }}>{g.driver}</a>
                      </Link>
                    </td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: MUTED }}>{g.n_gare} gare</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: "hsl(100 55% 55%)", width: "70px" }}>
                      {g.vittorie} v.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "9px", fontSize: "10.5px", color: DIM, lineHeight: 1.6 }}>
              Ordinati per vittorie, che pero' dipendono anche da quanti cavalli guidano
              e da quali. Per il rendimento vero si veda la scheda di ciascuno.
            </div>
          </div>
        )}
      </div>

      {t.anni?.length > 1 && (
        <div style={{ ...CARD, marginTop: "16px" }}>
          <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Gare all'anno
          </div>
          <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "80px" }}>
            {t.anni.map((a: any) => {
              const max = Math.max(...t.anni.map((x: any) => x.n_gare), 1);
              return (
                <div key={a.anno} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "100%", height: `${Math.max(2, (a.n_gare / max) * 58)}px`, background: "hsl(183 60% 38%)", borderRadius: "2px 2px 0 0" }} />
                  <div style={{ fontSize: "9px", color: DIM }}>{String(a.anno).slice(2)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
