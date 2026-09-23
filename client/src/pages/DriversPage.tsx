/**
 * Pagina dei guidatori.
 *
 * IL PUNTO DELICATO, che decide se questa pagina vale qualcosa: la percentuale
 * di vittorie NON misura il guidatore, misura i cavalli che gli affidano. Chi
 * guida per una grande scuderia vince spesso perche' ha sotto i cavalli
 * migliori. Se questa pagina ordinasse per vittorie sarebbe una classifica
 * delle scuderie travestita da classifica dei guidatori.
 *
 * Quindi si ordina per l'effetto misurato dentro lo stesso cavallo: quanto i
 * cavalli arrivano meglio della LORO media quando li guida questa persona,
 * corretto per il numero di partenza. Le vittorie restano in tabella, ma come
 * informazione di contorno e con scritto perche' non vanno usate per giudicare.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X, Users, TrendingDown } from "lucide-react";
import { Spiegazione } from "../components/Spiegazione";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

interface Driver {
  driver: string;
  n_gare: number;
  n_gare_recenti: number;
  n_cavalli: number;
  n_vittorie: number;
  pct_vittorie: number;
  pct_primi_tre: number;
  effetto: number;
  effetto_corretto: number;
  affidabilita: number;
  affidabilita_txt: string;
  partenza_media: number | null;
  premi_totali: number;
  prima_gara: string | null;
  ultima_gara: string | null;
  ippodromo_top: string | null;
  attivo: number;
}

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const BORDER = "1px solid hsl(220 10% 18%)";

function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

function coloreEffetto(e: number): string {
  if (e <= -0.05) return "hsl(100 60% 55%)";
  if (e <= -0.02) return "hsl(80 55% 55%)";
  if (e < 0.02) return "hsl(210 8% 65%)";
  if (e < 0.05) return "hsl(35 75% 58%)";
  return "hsl(0 62% 60%)";
}

function coloreAffidabilita(a: number): string {
  if (a >= 0.6) return "hsl(100 60% 52%)";
  if (a >= 0.4) return "hsl(45 85% 55%)";
  return "hsl(0 62% 58%)";
}

export default function DriversPage() {
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [soloAffidabili, setSoloAffidabili] = useState(true);

  const { data, isLoading } = useQuery<{
    disponibile: boolean;
    n: number;
    drivers: Driver[];
    spiegazione: string;
  }>({
    queryKey: ["/api/drivers"],
    queryFn: () => apiRequest("GET", "/api/drivers").then(r => r.json()),
  });

  const righe = useMemo(() => {
    let r = data?.drivers ?? [];
    if (soloAttivi) r = r.filter(d => d.attivo === 1);
    if (soloAffidabili) r = r.filter(d => d.affidabilita >= 0.5);
    const q = cerca.trim().toLowerCase();
    if (q) r = r.filter(d => d.driver.toLowerCase().includes(q));
    return r;
  }, [data, cerca, soloAttivi, soloAffidabili]);

  if (isLoading) {
    return (
      <div style={{ padding: "40px 20px", color: MUTED, textAlign: "center" }}>
        Calcolo il rendimento dei guidatori...
      </div>
    );
  }

  if (!data?.disponibile) {
    return (
      <div style={{ maxWidth: "700px", margin: "40px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: "22px", color: "hsl(210 10% 88%)" }}>Guidatori</h1>
        <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7 }}>
          I dati sui guidatori non sono ancora stati calcolati su questo archivio.
          Vengono prodotti dal lavoro notturno: saranno disponibili dal prossimo
          aggiornamento.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "22px 18px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <Users size={20} style={{ color: "hsl(183 75% 55%)" }} />
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 90%)", margin: 0, letterSpacing: "0.02em" }}>
          Guidatori
        </h1>
      </div>
      <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7, maxWidth: "820px", marginBottom: "16px" }}>
        Chi porta i cavalli a rendere piu' del loro solito. La classifica NON e' per
        vittorie: quelle dipendono soprattutto da quali cavalli vengono affidati.
        Il confronto e' fatto dentro lo stesso cavallo, e tiene conto del numero di
        partenza.
      </p>

      <Spiegazione titolo="Perche' le vittorie non misurano il guidatore">
        <p>
          Un guidatore che lavora per una grande scuderia vince spesso perche' ha
          sotto i cavalli migliori, e uno bravissimo con cavalli modesti perde lo
          stesso. Ordinare per vittorie darebbe una classifica delle scuderie
          travestita da classifica dei guidatori.
        </p>
        <p>
          Il confronto giusto si fa <strong>dentro lo stesso cavallo</strong>: per ogni
          gara si guarda dove quel cavallo e' arrivato rispetto a dove arriva di
          solito. Se con una certa persona alla guida arriva piu' avanti del suo
          abituale, quel guidatore ha aggiunto qualcosa. Nell'archivio 12.224 cavalli
          sono stati guidati da almeno quattro persone diverse, quindi il confronto
          e' possibile su larga scala.
        </p>
        <p>
          Si corregge anche per il <strong>numero di partenza</strong>, altrimenti si
          addebiterebbe al guidatore la sfortuna del sorteggio: partire dal dodici fa
          arrivare nei primi tre il 27% delle volte contro il 49% del primo.
        </p>
        <p>
          <strong>La verifica.</strong> Il rendimento fino al 2022 predice quello dal
          2023 con correlazione +0,616 su 466 guidatori, cioe' il 38% spiegato. Non e'
          rumore: e' lo stesso ordine di grandezza della valutazione degli stalloni
          sulla progenie. Resta pero' una misura di rendimento osservato, non una
          misura di bravura pura: un guidatore molto richiesto riceve anche cavalli in
          condizione migliore, e questo conto non lo separa del tutto.
        </p>
      </Spiegazione>

      {/* Filtri */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", margin: "18px 0 14px" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "340px" }}>
          <Search size={14} style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: DIM }} />
          <input
            value={cerca}
            onChange={e => setCerca(e.target.value)}
            placeholder="Cerca guidatore..."
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
        {[
          { attivo: soloAttivi, set: setSoloAttivi, testo: "Solo in attivita'" },
          { attivo: soloAffidabili, set: setSoloAffidabili, testo: "Solo giudizi che reggono" },
        ].map(f => (
          <button key={f.testo} onClick={() => f.set(!f.attivo)}
            style={{
              padding: "8px 13px", fontSize: "12px", borderRadius: "8px", cursor: "pointer",
              background: f.attivo ? "hsl(183 100% 38% / 0.14)" : "hsl(220 12% 10%)",
              border: f.attivo ? "1px solid hsl(183 100% 38% / 0.45)" : BORDER,
              color: f.attivo ? "hsl(183 75% 62%)" : MUTED, fontWeight: f.attivo ? 700 : 400,
            }}>
            {f.testo}
          </button>
        ))}
        <span style={{ fontSize: "12px", color: DIM, marginLeft: "auto" }}>
          {righe.length} su {data.n}
        </span>
      </div>

      {soloAffidabili && (
        <div style={{ fontSize: "11.5px", color: DIM, marginBottom: "12px", lineHeight: 1.6 }}>
          Sono nascosti i guidatori con meno di un centinaio di gare: su numeri piccoli
          il rendimento e' dominato dal caso e il giudizio non significherebbe niente.
        </div>
      )}

      {/* Tabella */}
      <div style={{ overflowX: "auto", border: BORDER, borderRadius: "10px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "780px" }}>
          <thead>
            <tr style={{ background: "hsl(220 12% 9%)" }}>
              {["Guidatore", "Quanto rende", "Affidabilita'", "Gare", "Cavalli", "Vittorie", "Partenza media"].map((h, i) => (
                <th key={h} style={{
                  padding: "10px 12px", textAlign: i === 0 ? "left" : "right",
                  color: DIM, fontSize: "10.5px", textTransform: "uppercase",
                  letterSpacing: "0.05em", fontWeight: 600, borderBottom: BORDER, whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map((d, i) => (
              <tr key={d.driver} style={{ background: i % 2 ? "hsl(220 12% 8%)" : "transparent" }}>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid hsl(220 10% 13%)" }}>
                  <Link href={`/guidatore/${encodeURIComponent(d.driver)}`}>
                    <a style={{ color: "hsl(210 10% 86%)", textDecoration: "none", fontWeight: 700, letterSpacing: "0.02em" }}>
                      {d.driver}
                    </a>
                  </Link>
                  {d.ippodromo_top && (
                    <div style={{ fontSize: "10.5px", color: "hsl(210 8% 38%)" }}>
                      {/* "ESTERO" non e' una citta': "soprattutto a estero" e'
                          sgrammaticato e si legge male. */}
                      {d.ippodromo_top === "ESTERO"
                        ? "corre soprattutto all'estero"
                        : `soprattutto a ${d.ippodromo_top.toLowerCase()}`}
                    </div>
                  )}
                </td>
                {/* UNA BARRA, NON UNA PAROLA RIPETUTA. La prima versione
                    scriveva "meglio" in ogni riga: con cinquecento righe
                    ordinate per rendimento, la stessa parola ripetuta
                    cinquecento volte non dice piu' niente e nasconde il fatto
                    che fra il primo e il centesimo c'e' una differenza. La
                    barra parte dal centro: verso sinistra rende meglio del
                    solito del cavallo, verso destra peggio. */}
                <td style={{ padding: "9px 12px", borderBottom: "1px solid hsl(220 10% 13%)", minWidth: "210px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <div style={{ position: "relative", flex: 1, height: "13px", minWidth: "90px" }}>
                      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "1px", background: "hsl(220 10% 26%)" }} />
                      <div style={{
                        position: "absolute", top: "2px", height: "9px", borderRadius: "2px",
                        background: coloreEffetto(d.effetto_corretto),
                        // La scala satura a 0,12, che copre tutti i casi reali:
                        // il migliore sta a -0,094 e il peggiore a +0,13.
                        ...(d.effetto_corretto < 0
                          ? { right: "50%", width: `${Math.min(50, (Math.abs(d.effetto_corretto) / 0.12) * 50)}%` }
                          : { left: "50%", width: `${Math.min(50, (d.effetto_corretto / 0.12) * 50)}%` }),
                      }} />
                    </div>
                    <span className="tabular" style={{ fontSize: "11.5px", color: coloreEffetto(d.effetto_corretto), fontWeight: 700, whiteSpace: "nowrap", width: "76px", textAlign: "right" }}>
                      {d.effetto_corretto < 0 ? "\u2212" : "+"}{Math.abs(d.effetto_corretto * 10).toFixed(1)} pos.
                    </span>
                  </div>
                </td>
                <td className="tabular" style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid hsl(220 10% 13%)", color: coloreAffidabilita(d.affidabilita), fontWeight: 700 }}>
                  {(d.affidabilita * 100).toFixed(0)}%
                  <span style={{ color: DIM, fontWeight: 400, fontSize: "10.5px" }}> {d.affidabilita_txt}</span>
                </td>
                <td className="tabular" style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid hsl(220 10% 13%)", color: "hsl(210 8% 70%)" }}>
                  {d.n_gare.toLocaleString("it-IT")}
                </td>
                <td className="tabular" style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid hsl(220 10% 13%)", color: MUTED }}>
                  {d.n_cavalli.toLocaleString("it-IT")}
                </td>
                <td className="tabular" style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid hsl(220 10% 13%)", color: MUTED }}>
                  {d.pct_vittorie.toFixed(1)}%
                </td>
                <td className="tabular" style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid hsl(220 10% 13%)", color: DIM }}>
                  {d.partenza_media != null ? d.partenza_media.toFixed(1) : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {righe.length === 0 && (
        <div style={{ padding: "30px", textAlign: "center", color: MUTED, fontSize: "13px" }}>
          Nessun guidatore con questi filtri.
        </div>
      )}

      <div style={{ marginTop: "14px", fontSize: "11.5px", color: DIM, lineHeight: 1.7, display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <TrendingDown size={13} style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          La barra parte dal centro: verso sinistra il guidatore porta i cavalli a
          rendere meglio del loro solito, verso destra peggio. Il numero accanto e'
          quanto vale in posizioni, su una gara da dieci partenti.
          La colonna delle vittorie e' li' per completezza, ma non va usata per
          confrontare due guidatori: dipende soprattutto dai cavalli che ricevono.
          La colonna della partenza media dice da quale numero partono di solito, ed
          e' gia' scontata dal rendimento.
        </div>
      </div>

      <CollegamentiCorrelati
        voci={[
          { href: "/ippodromi", titolo: "Ippodromi", descrizione: "Le 26 piste italiane, e quanto pesa partire dietro su ciascuna." },
          { href: "/cavalli", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati sull'archivio." },
          { href: "/calendario", titolo: "Calendario", descrizione: "Le corse dei prossimi giorni." },
        ]}
      />
    </div>
  );
}
