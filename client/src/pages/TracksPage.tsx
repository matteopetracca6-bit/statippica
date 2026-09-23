/**
 * Pagina degli ippodromi.
 *
 * Il pezzo forte non sono le schede delle piste ma la tabella dei numeri di
 * partenza: e' il dato piu' netto che questo archivio contiene, misurato su
 * oltre quattrocentomila gare, e finora non era mostrato da nessuna parte.
 * Partire dal dodici fa arrivare nei primi tre meno della meta' delle volte
 * rispetto a partire dal primo. Non e' una previsione, e' una descrizione: per
 * questo va prima di tutto il resto.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MapPin, Search, X } from "lucide-react";
import { Spiegazione } from "../components/Spiegazione";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

interface Track {
  track: string;
  nome: string;
  n_gare: number;
  n_cavalli: number;
  n_giornate: number;
  prima_gara: string | null;
  ultima_gara: string | null;
  distanza_tipica: number | null;
  tempo_km_mediano: number | null;
  premio_medio: number | null;
  premio_massimo: number | null;
  partenti_medi: number | null;
  vantaggio_interno: number | null;
  n_guidatori: number;
  attivo: number;
}

interface Partenza {
  start_pos: number;
  n_gare: number;
  pct_vittorie: number;
  pct_primi_tre: number;
}

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const BORDER = "1px solid hsl(220 10% 18%)";

function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

export default function TracksPage() {
  const [cerca, setCerca] = useState("");

  const { data, isLoading } = useQuery<{
    disponibile: boolean;
    n: number;
    tracks: Track[];
    partenze: Partenza[];
  }>({
    queryKey: ["/api/tracks"],
    queryFn: () => apiRequest("GET", "/api/tracks").then(r => r.json()),
  });

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const t = data?.tracks ?? [];
    return q ? t.filter(x => x.nome.toLowerCase().includes(q) || x.track.toLowerCase().includes(q)) : t;
  }, [data, cerca]);

  if (isLoading) {
    return <div style={{ padding: "40px", textAlign: "center", color: MUTED }}>Carico gli ippodromi...</div>;
  }

  if (!data?.disponibile) {
    return (
      <div style={{ maxWidth: "700px", margin: "40px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: "22px", color: "hsl(210 10% 88%)" }}>Ippodromi</h1>
        <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7 }}>
          I dati sugli ippodromi non sono ancora stati calcolati su questo archivio.
          Li produce il lavoro notturno: saranno disponibili dal prossimo aggiornamento.
        </p>
      </div>
    );
  }

  const maxPrimi = Math.max(...(data.partenze ?? []).map(p => p.pct_primi_tre), 1);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "22px 18px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <MapPin size={20} style={{ color: "hsl(183 75% 55%)" }} />
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 90%)", margin: 0, letterSpacing: "0.02em" }}>
          Ippodromi
        </h1>
      </div>
      <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7, maxWidth: "820px", marginBottom: "22px" }}>
        Le {data.n} piste italiane presenti nell'archivio, e quanto pesa il numero di
        partenza su ciascuna.
      </p>

      {/* IL NUMERO DI PARTENZA: prima di tutto, perche' e' il dato piu' netto. */}
      {data.partenze?.length > 0 && (
        <div style={{
          background: "hsl(220 12% 10%)", border: BORDER, borderRadius: "12px",
          padding: "18px 20px", marginBottom: "24px",
        }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 88%)", margin: "0 0 4px" }}>
            Quanto conta il numero di partenza
          </h2>
          <p style={{ fontSize: "12.5px", color: MUTED, lineHeight: 1.65, margin: "0 0 16px", maxWidth: "760px" }}>
            Quota di gare chiuse nei primi tre, per numero di partenza, su tutte le corse
            dell'archivio con almeno cinque partenti. Non e' un pronostico: e' quello che
            e' successo.
          </p>

          <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", height: "160px", marginBottom: "10px" }}>
            {data.partenze.map(p => {
              const h = (p.pct_primi_tre / maxPrimi) * 118;
              // Il colore cambia dove il vantaggio finisce: dal sesto numero in
              // poi la quota crolla, e si vede meglio se il grafico lo dice.
              const col = p.start_pos <= 5 ? "hsl(183 70% 45%)"
                : p.start_pos <= 8 ? "hsl(45 75% 50%)"
                  : "hsl(15 70% 50%)";
              return (
                <div key={p.start_pos} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                  <div className="tabular" style={{ fontSize: "11px", fontWeight: 700, color: "hsl(210 10% 80%)" }}>
                    {p.pct_primi_tre.toFixed(0)}%
                  </div>
                  <div style={{ width: "100%", height: `${Math.max(3, h)}px`, background: col, borderRadius: "3px 3px 0 0" }} />
                  <div style={{ fontSize: "11px", color: DIM, fontWeight: 600 }}>{p.start_pos}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "11px", color: DIM, textAlign: "center", marginBottom: "12px" }}>
            numero di partenza
          </div>

          <Spiegazione titolo="Come si legge, e cosa NON dice" compatta>
            Fino al quinto numero la quota resta intorno al 50%; dal sesto scende, e dal
            decimo in poi si dimezza. La differenza fra il primo e il dodicesimo e' di
            circa venti punti, ed e' uno degli effetti piu' grossi che questo archivio
            contenga. Attenzione a cosa non dice: i numeri esterni non sono solo
            svantaggiati dalla posizione, ma in molte corse vengono assegnati ai cavalli
            con piu' vittorie alle spalle, che partono dietro per regolamento. Una parte
            del divario e' quindi la posizione, una parte e' chi ci viene messo.
          </Spiegazione>
        </div>
      )}

      {/* Ricerca */}
      <div style={{ position: "relative", maxWidth: "320px", marginBottom: "14px" }}>
        <Search size={14} style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: DIM }} />
        <input
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          placeholder="Cerca ippodromo..."
          style={{
            width: "100%", padding: "9px 30px 9px 32px", background: "hsl(220 12% 10%)",
            border: BORDER, borderRadius: "8px", color: "hsl(210 10% 85%)", fontSize: "13px",
          }}
        />
        {cerca && (
          <button onClick={() => setCerca("")} aria-label="Cancella la ricerca"
            style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: DIM, cursor: "pointer" }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Le piste */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "13px" }}>
        {righe.map(t => (
          <Link key={t.track} href={`/ippodromo/${encodeURIComponent(t.track)}`}>
            <a style={{ textDecoration: "none" }}>
              <div style={{
                background: "hsl(220 12% 10%)", border: BORDER, borderRadius: "11px",
                padding: "14px 16px", height: "100%",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "hsl(210 10% 88%)", letterSpacing: "0.02em" }}>
                    {t.nome}
                  </div>
                  {!t.attivo && (
                    <span style={{ fontSize: "9.5px", color: DIM, border: BORDER, borderRadius: "4px", padding: "2px 5px", whiteSpace: "nowrap" }}>
                      non recente
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 12px", fontSize: "11.5px" }}>
                  <div>
                    <div style={{ color: DIM, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Gare</div>
                    <div className="tabular" style={{ color: "hsl(210 10% 82%)", fontWeight: 700 }}>
                      {t.n_gare.toLocaleString("it-IT")}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: DIM, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Distanza tipica</div>
                    <div className="tabular" style={{ color: "hsl(210 10% 82%)", fontWeight: 700 }}>
                      {t.distanza_tipica ? `${t.distanza_tipica} m` : "\u2014"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: DIM, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Premio medio</div>
                    <div className="tabular" style={{ color: "hsl(51 70% 60%)", fontWeight: 700 }}>
                      {t.premio_medio ? euro(t.premio_medio) : "\u2014"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: DIM, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Partire dentro vale</div>
                    <div className="tabular" style={{ color: "hsl(183 70% 58%)", fontWeight: 700 }}>
                      {t.vantaggio_interno != null ? `+${t.vantaggio_interno.toFixed(0)} punti` : "\u2014"}
                    </div>
                  </div>
                </div>
              </div>
            </a>
          </Link>
        ))}
      </div>

      {righe.length === 0 && (
        <div style={{ padding: "30px", textAlign: "center", color: MUTED, fontSize: "13px" }}>
          Nessun ippodromo con questo nome.
        </div>
      )}

      <div style={{ marginTop: "16px", fontSize: "11.5px", color: DIM, lineHeight: 1.7, maxWidth: "820px" }}>
        "Partire dentro vale" e' la differenza, su quella pista, fra la quota di
        piazzamenti nei primi tre partendo dai primi tre numeri e partendo dal settimo
        in poi. Le gare corse all'estero sono nell'archivio e contano nelle carriere dei
        cavalli, ma non hanno una scheda: la fonte le raccoglie tutte sotto un'unica
        voce, e sono decine di piste diverse in paesi diversi.
      </div>

      <CollegamentiCorrelati
        voci={[
          { href: "/guidatori", titolo: "Guidatori", descrizione: "Chi porta i cavalli a rendere piu' del loro solito." },
          { href: "/calendario", titolo: "Calendario", descrizione: "Le corse dei prossimi giorni, pista per pista." },
          { href: "/cavalli", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati sull'archivio." },
        ]}
      />
    </div>
  );
}
