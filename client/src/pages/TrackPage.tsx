import { colorePista } from "@/lib/piste";
/**
 * Scheda di un singolo ippodromo: numeri della pista, effetto del numero di
 * partenza su QUESTA pista, distanze su cui si corre, guidatori piu' vincenti.
 */

import { tempoKm } from "@/lib/record";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MapPin } from "lucide-react";
import IntestazioneScheda from "../components/IntestazioneScheda";
import { Cifra } from "../components/DueColonne";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento } from "../components/Caricamento";
import GraficoColonne, { COLORI_GRAFICO } from "../components/GraficoColonne";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const BORDER = "1px solid hsl(220 10% 18%)";
const CARD = { padding: "16px 20px" };

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
    <div className="page-shell">
      <IntestazioneScheda
        indietro={{ href: "/ippodromi", testo: "Tutti gli ippodromi" }}
        icona={MapPin} colore={colorePista(t.nome)} tipo="Ippodromo" titolo={t.nome}
        sotto={<>
          {t.n_gare.toLocaleString("it-IT")} gare &middot; {t.n_giornate.toLocaleString("it-IT")} giornate
          &middot; {t.n_cavalli.toLocaleString("it-IT")} cavalli
          {t.prima_gara && <> &middot; dal {t.prima_gara.slice(0, 4)}</>}
        </>}
        cifre={<>
          <Cifra titolo="Distanza tipica" valore={t.distanza_tipica ? `${t.distanza_tipica.toLocaleString("it-IT")} m` : "\u2014"} />
          <Cifra titolo="Tempo al km medio" valore={t.tempo_km_mediano ? tempoKm(t.tempo_km_mediano) : "\u2014"} colore="hsl(183 70% 60%)" />
          <Cifra titolo="Premio medio" valore={t.premio_medio ? euro(t.premio_medio) : "\u2014"} colore="hsl(51 70% 60%)" />
          <Cifra titolo="Premio più alto" valore={t.premio_massimo ? euro(t.premio_massimo) : "\u2014"} colore="hsl(51 70% 60%)" />
          <Cifra titolo="Partenti medi" valore={t.partenti_medi ? t.partenti_medi.toFixed(1).replace(".", ",") : "\u2014"} />
          <Cifra titolo="Guidatori diversi" valore={t.n_guidatori?.toLocaleString("it-IT") ?? "\u2014"} />
        </>}
      />

      {/* Numero di partenza su questa pista */}
      {t.partenze?.length > 2 && (
        <div className="pannello" style={{ ...CARD, marginBottom: "16px" }}>
          <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Il numero di partenza su questa pista
          </div>
          <GraficoColonne
            altezza={150}
            formatoGuida={v => `${v.toFixed(0)}%`}
            nomeAsse="quota di piazzamenti nei primi tre, per numero di partenza"
            dati={t.partenze.map((p: any) => ({
              chiave: p.start_pos, etichetta: String(p.start_pos), valore: p.pct_primi_tre,
              testo: `${p.pct_primi_tre.toFixed(0)}%`,
              colore: p.start_pos <= 5 ? COLORI_GRAFICO.quantita : p.start_pos <= 8 ? COLORI_GRAFICO.medio : COLORI_GRAFICO.scarso,
              scheda: [{ testo: `Numero ${p.start_pos}` }, { testo: `${p.pct_primi_tre.toFixed(1).replace(".", ",")}% nei primi tre` }],
            }))}
          />
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
          <div className="pannello" style={CARD}>
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
                      {d.tempo_km ? tempoKm(d.tempo_km) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {t.guidatori?.length > 0 && (
          <div className="pannello" style={CARD}>
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
        <div className="pannello" style={{ ...CARD, marginTop: "16px" }}>
          <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Gare all'anno
          </div>
          <GraficoColonne
            altezza={120}
            formatoGuida={v => Math.round(v).toLocaleString("it-IT")}
            dati={t.anni.map((a: any) => ({
              chiave: a.anno, etichetta: `'${String(a.anno).slice(2)}`, valore: a.n_gare,
              testo: String(a.n_gare),
              scheda: [{ testo: String(a.anno) }, { testo: `${a.n_gare} gare` }],
            }))}
          />
        </div>
      )}
    </div>
  );
}
