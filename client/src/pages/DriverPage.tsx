/**
 * Scheda di un singolo guidatore.
 *
 * Mostra il rendimento con la sua affidabilita' dichiarata, l'andamento negli
 * anni, le piste su cui gira e i cavalli che guida piu' spesso.
 */

import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, MapPin } from "lucide-react";
import GradeBadge from "../components/GradeBadge";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento } from "../components/Caricamento";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const BORDER = "1px solid hsl(220 10% 18%)";
const CARD = { background: "hsl(220 12% 10%)", border: BORDER, borderRadius: "12px", padding: "16px 20px" };

function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

function coloreEffetto(e: number) {
  if (e <= -0.05) return "hsl(100 60% 55%)";
  if (e <= -0.02) return "hsl(80 55% 55%)";
  if (e < 0.02) return "hsl(210 8% 68%)";
  if (e < 0.05) return "hsl(35 75% 58%)";
  return "hsl(0 62% 60%)";
}

export default function DriverPage() {
  const [, params] = useRoute("/guidatore/:name");
  const nome = params?.name ? decodeURIComponent(params.name) : "";

  const { data: d, isLoading, error } = useQuery<any>({
    queryKey: ["/api/driver", nome],
    queryFn: () => apiRequest("GET", `/api/driver/${encodeURIComponent(nome)}`).then(r => r.json()),
    enabled: !!nome,
  });

  if (isLoading) {
    return <Caricamento testo="Carico la scheda..." />;
  }
  if (error || !d || d.error) {
    return (
      <div style={{ maxWidth: "700px", margin: "40px auto", padding: "0 20px", color: MUTED }}>
        <Link href="/guidatori"><a style={{ color: "hsl(183 75% 55%)", fontSize: "13px" }}>&larr; Tutti i guidatori</a></Link>
        <p style={{ marginTop: "14px", lineHeight: 1.7 }}>{nome ? <><strong>{nome}</strong> non ha una scheda: ha meno di trenta gare con piazzamento nell'archivio, troppo poche per dire qualcosa sul suo rendimento.</> : "Guidatore non trovato."}</p>
      </div>
    );
  }

  const affidabile = d.affidabilita >= 0.5;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px 18px 60px" }}>
      <Link href="/guidatori">
        <a style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: MUTED, fontSize: "12.5px", textDecoration: "none", marginBottom: "16px" }}>
          <ArrowLeft size={14} /> Tutti i guidatori
        </a>
      </Link>

      <h1 style={{ fontSize: "26px", fontWeight: 800, color: "hsl(210 10% 91%)", margin: "0 0 4px", letterSpacing: "0.02em" }}>
        {d.driver}
      </h1>
      <div style={{ color: MUTED, fontSize: "12.5px", marginBottom: "18px" }}>
        {d.n_gare.toLocaleString("it-IT")} gare &middot; {d.n_cavalli.toLocaleString("it-IT")} cavalli diversi
        {d.prima_gara && <> &middot; dal {d.prima_gara.slice(0, 4)}</>}
        {d.attivo ? <> &middot; <span style={{ color: "hsl(100 55% 55%)" }}>in attivita'</span></> : <> &middot; <span style={{ color: DIM }}>non recente</span></>}
      </div>

      {/* I numeri principali */}
      <div style={{ ...CARD, marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
              Rende
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: coloreEffetto(d.effetto_corretto), lineHeight: 1.1 }}>
              {d.effetto_corretto <= -0.02 ? "meglio" : d.effetto_corretto >= 0.02 ? "peggio" : "nella media"}
            </div>
            <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "4px" }}>
              {Math.abs(d.effetto_corretto * 10).toFixed(1)} posizioni su dieci partenti
            </div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
              Affidabilita' del giudizio
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: affidabile ? "hsl(100 60% 52%)" : "hsl(0 62% 58%)", lineHeight: 1.1 }}>
              {(d.affidabilita * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "4px" }}>{d.affidabilita_txt}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
              Vittorie
            </div>
            <div className="tabular" style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 85%)", lineHeight: 1.1 }}>
              {d.pct_vittorie.toFixed(1)}%
            </div>
            <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "4px" }}>
              {d.n_vittorie.toLocaleString("it-IT")} su {d.n_gare.toLocaleString("it-IT")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
              Partenza media
            </div>
            <div className="tabular" style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 85%)", lineHeight: 1.1 }}>
              {d.partenza_media != null ? d.partenza_media.toFixed(1) : "\u2014"}
            </div>
            <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "4px" }}>gia' scontata dal rendimento</div>
          </div>
        </div>
      </div>

      {!affidabile && (
        <div style={{
          background: "hsl(0 40% 11%)", border: "1px solid hsl(0 50% 34%)", borderRadius: "10px",
          padding: "13px 17px", marginBottom: "16px", fontSize: "12.5px", lineHeight: 1.65, color: "hsl(0 20% 85%)",
        }}>
          <strong style={{ color: "hsl(0 70% 66%)" }}>Giudizio poco attendibile.</strong>{" "}
          Poggia su {d.n_gare} gare, troppe poche perche' il rendimento si distingua dal
          caso: qualche corsa fortunata o sfortunata sposta tutto. Il numero e' mostrato
          per trasparenza, non per confrontare questa persona con altre.
        </div>
      )}

      <Spiegazione titolo="Cosa vuol dire &quot;rende meglio&quot;" compatta>
        Non e' la percentuale di vittorie, che dipende soprattutto da quali cavalli
        vengono affidati. E' quanto i cavalli arrivano meglio della <em>loro</em> media
        quando li guida questa persona, corretto per il numero di partenza. Resta una
        misura di rendimento osservato: chi e' molto richiesto riceve anche cavalli in
        condizione migliore, e questo conto non lo separa del tutto.
      </Spiegazione>

      {/* Andamento negli anni */}
      {d.anni?.length > 1 && (
        <div style={{ ...CARD, marginTop: "16px" }}>
          <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Andamento negli anni
          </div>
          <div style={{ display: "flex", gap: "5px", alignItems: "flex-end", height: "90px", marginBottom: "8px" }}>
            {d.anni.map((a: any) => {
              const max = Math.max(...d.anni.map((x: any) => x.pct_primi_tre || 0), 1);
              return (
                <div key={a.anno} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <div style={{ fontSize: "9.5px", color: MUTED }}>{(a.pct_primi_tre ?? 0).toFixed(0)}%</div>
                  <div style={{
                    width: "100%", height: `${Math.max(3, ((a.pct_primi_tre || 0) / max) * 62)}px`,
                    background: "hsl(183 70% 42%)", borderRadius: "3px 3px 0 0",
                  }} />
                  <div style={{ fontSize: "9.5px", color: DIM }}>{String(a.anno).slice(2)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "11px", color: DIM }}>
            Quota di gare chiuse nei primi tre, anno per anno. Solo gli anni con almeno
            dieci corse.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "16px", marginTop: "16px" }}>
        {/* Piste */}
        {d.piste?.length > 0 && (
          <div style={CARD}>
            <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <MapPin size={12} /> Dove corre
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {d.piste.slice(0, 10).map((p: any) => (
                  <tr key={p.track}>
                    <td style={{ padding: "5px 0", color: "hsl(210 10% 80%)" }}>
                      <Link href={`/ippodromo/${encodeURIComponent(p.track)}`}>
                        <a style={{ color: "hsl(210 10% 80%)", textDecoration: "none" }}>{p.track}</a>
                      </Link>
                    </td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: MUTED }}>{p.n_gare} gare</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: "hsl(183 70% 58%)", width: "62px" }}>
                      {p.pct_vittorie}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cavalli */}
        {d.cavalli?.length > 0 && (
          <div style={CARD}>
            <div style={{ fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Cavalli guidati piu' spesso
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {d.cavalli.slice(0, 10).map((c: any) => (
                  <tr key={c.nome}>
                    <td style={{ padding: "5px 0", color: "hsl(210 10% 80%)" }}>
                      {c.anno ? (
                        <Link href={`/horse/${encodeURIComponent(c.nome)}/${c.anno}`} className="collegamento-scheda">
                          {c.nome}
                        </Link>
                      ) : c.nome}
                      {c.grade && <span style={{ marginLeft: "6px" }}><GradeBadge grade={c.grade} size="sm" /></span>}
                    </td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: MUTED }}>{c.n_gare} gare</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: "hsl(100 55% 55%)", width: "62px" }}>
                      {c.vittorie} v.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
