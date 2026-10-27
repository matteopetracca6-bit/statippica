/**
 * Pagina degli allenatori.
 *
 * L'allenatore arriva dai risultati ufficiali MASAF, che lo riportano dal
 * 2016: tutti i numeri di questa pagina partono da li'.
 *
 * Come per i guidatori, vittorie e premi dicono soprattutto QUALI cavalli ha
 * in scuderia un allenatore, non quanto li fa rendere. Per questo accanto ai
 * conti semplici c'e' il rendimento "a parita' di cavallo", misurato solo sui
 * cavalli passati per piu' allenatori: e' l'unico posto dove il confronto
 * esiste davvero. Chi ha avuto sempre gli stessi cavalli resta "non
 * giudicabile" invece di uscire nella media per finta.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X, Timer } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento, ErroreCaricamento } from "../components/Caricamento";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

export const COLORE_ALLENATORI = "hsl(28 85% 60%)";

export interface Allenatore {
  allenatore: string; nome: string;
  n_corse: number; n_corse_recenti: number; n_cavalli: number; n_cavalli_recenti: number;
  n_vittorie: number; n_primi_tre: number; pct_vittorie: number; pct_primi_tre: number;
  premi_totali: number; premi_per_corsa: number; premi_12_mesi: number; vittorie_12_mesi: number;
  prima_corsa: string | null; ultima_corsa: string | null; ippodromo_top: string | null;
  attivo: number; effetto: number | null; n_confronti: number;
  affidabilita: number; affidabilita_txt: string;
}

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const BORDER = "1px solid hsl(220 10% 18%)";
const RIGA = "1px solid hsl(220 10% 13%)";

export function euro(n: number) {
  return "\u20ac" + Math.round(n).toLocaleString("it-IT");
}

export function coloreEffetto(e: number): string {
  if (e <= -0.05) return "hsl(100 60% 55%)";
  if (e <= -0.02) return "hsl(80 55% 55%)";
  if (e < 0.02) return "hsl(210 8% 65%)";
  if (e < 0.05) return "hsl(35 75% 58%)";
  return "hsl(0 62% 60%)";
}

type Ordine = "vittorie" | "premi" | "anno" | "percentuale" | "parita";
const ORDINI: { id: Ordine; testo: string }[] = [
  { id: "vittorie", testo: "Vittorie" },
  { id: "premi", testo: "Premi" },
  { id: "anno", testo: "Premi ultimi 12 mesi" },
  { id: "percentuale", testo: "% vittorie" },
  { id: "parita", testo: "A parità di cavallo" },
];

/** Barra che parte dal centro: a sinistra rende meglio del solito, a destra peggio. */
export function BarraEffetto({ e }: { e: number | null }) {
  if (e == null) return <span style={{ fontSize: "11px", color: DIM }}>non giudicabile</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ position: "relative", flex: 1, height: "13px", minWidth: "70px" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "1px", background: "hsl(220 10% 26%)" }} />
        <div style={{
          position: "absolute", top: "2px", height: "9px", borderRadius: "2px", background: coloreEffetto(e),
          ...(e < 0 ? { right: "50%", width: `${Math.min(50, (Math.abs(e) / 0.12) * 50)}%` }
                    : { left: "50%", width: `${Math.min(50, (e / 0.12) * 50)}%` }),
        }} />
      </div>
      <span className="tabular" style={{ fontSize: "11.5px", color: coloreEffetto(e), fontWeight: 700, whiteSpace: "nowrap", width: "62px", textAlign: "right" }}>
        {e < 0 ? "\u2212" : "+"}{Math.abs(e * 10).toFixed(1)} pos.
      </span>
    </div>
  );
}

export default function AllenatoriPage() {
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [ordine, setOrdine] = useState<Ordine>("vittorie");

  const { data, isLoading, error } = useQuery<{
    disponibile: boolean; n: number; allenatori: Allenatore[]; copertura: number; aggiornato_al: string | null;
  }>({
    queryKey: ["/api/allenatori"],
    queryFn: () => apiRequest("GET", "/api/allenatori").then(r => r.json()),
  });

  const righe = useMemo(() => {
    let r = [...(data?.allenatori ?? [])];
    if (soloAttivi) r = r.filter(a => a.attivo === 1);
    const q = cerca.trim().toLowerCase();
    if (q) r = r.filter(a => a.nome.toLowerCase().includes(q) || a.allenatore.toLowerCase().includes(q));
    const chiave: Record<Ordine, (a: Allenatore) => number> = {
      vittorie: a => a.n_vittorie,
      premi: a => a.premi_totali,
      anno: a => a.premi_12_mesi,
      // Sotto le 100 corse la percentuale e' dominata dal caso: vanno in fondo.
      percentuale: a => (a.n_corse >= 100 ? a.pct_vittorie : -1),
      parita: a => (a.effetto == null || a.affidabilita < 0.4 ? -99 : -a.effetto),
    };
    r.sort((x, y) => chiave[ordine](y) - chiave[ordine](x));
    return r;
  }, [data, cerca, soloAttivi, ordine]);

  if (isLoading) return <Caricamento testo="Carico gli allenatori..." />;
  if (error) return <ErroreCaricamento titolo="Allenatori" cosa="i dati sugli allenatori" />;
  if (!data?.disponibile) {
    return (
      <div style={{ maxWidth: "700px", margin: "40px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: "22px", color: "hsl(210 10% 88%)" }}>Allenatori</h1>
        <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7 }}>
          Gli allenatori non sono ancora stati raccolti su questo archivio. Li raccoglie
          il lavoro notturno dai risultati ufficiali: saranno disponibili dal prossimo
          aggiornamento.
        </p>
      </div>
    );
  }

  const th = (i: number): React.CSSProperties => ({
    padding: "10px 12px", textAlign: i === 0 ? "left" : "right", color: DIM, fontSize: "10.5px",
    textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, borderBottom: BORDER, whiteSpace: "nowrap",
  });
  const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: "9px 12px", textAlign: "right", borderBottom: RIGA, color: MUTED, ...extra,
  });

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "22px 18px 60px" }}>
      <IntestazionePagina icona={Timer} colore={COLORE_ALLENATORI} titolo="Allenatori"
        sottotitolo={`Chi allena i cavalli del trotto italiano: corse, vittorie e premi dal 2016${data.aggiornato_al ? `, aggiornati al ${new Date(data.aggiornato_al).toLocaleDateString("it-IT")}` : ""}.`}>
        Vittorie e premi dicono soprattutto quali cavalli ha un allenatore. Per confrontare
        quanto li fa rendere c'è la colonna «a parità di cavallo».
      </IntestazionePagina>

      <Spiegazione titolo="Da dove vengono questi numeri">
        <p>
          L'allenatore di ogni cavallo in ogni corsa viene dai risultati ufficiali MASAF,
          che lo riportano dal 2016. Le corse dal 2013 al 2015 restano quindi senza
          allenatore. Oggi lo ha il {data.copertura.toLocaleString("it-IT")}% delle corse
          italiane dal 2016; il resto sono cavalli scritti in modo diverso nelle due fonti.
        </p>
        <p>
          <strong>A parità di cavallo.</strong> Per ogni corsa si guarda dove il cavallo è
          arrivato rispetto a dove arriva di solito. Se con un allenatore arriva più avanti
          del suo abituale, quell'allenatore ha aggiunto qualcosa. Il confronto esiste
          solo per i cavalli passati per almeno due allenatori: chi ha avuto sempre gli
          stessi cavalli resta «non giudicabile». Resta una misura del rendimento
          osservato: un cavallo cambia scuderia anche perché cresce, migliora o si
          rompe, e questo conto non lo separa del tutto.
        </p>
      </Spiegazione>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", margin: "18px 0 10px" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "340px" }}>
          <Search size={14} style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: DIM }} />
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca allenatore..."
            style={{ width: "100%", padding: "9px 30px 9px 32px", background: "hsl(220 12% 10%)", border: BORDER,
                     borderRadius: "8px", color: "hsl(210 10% 85%)", fontSize: "13px" }} />
          {cerca && (
            <button onClick={() => setCerca("")} aria-label="Cancella la ricerca"
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: DIM, cursor: "pointer" }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button onClick={() => setSoloAttivi(!soloAttivi)}
          style={{
            padding: "8px 13px", fontSize: "12px", borderRadius: "8px", cursor: "pointer",
            background: soloAttivi ? "hsl(28 85% 55% / 0.14)" : "hsl(220 12% 10%)",
            border: soloAttivi ? "1px solid hsl(28 85% 55% / 0.45)" : BORDER,
            color: soloAttivi ? "hsl(28 90% 68%)" : MUTED, fontWeight: soloAttivi ? 700 : 400,
          }}>
          Solo in attività
        </button>
        <span style={{ fontSize: "12px", color: DIM, marginLeft: "auto" }}>{righe.length} su {data.n}</span>
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
        <span style={{ fontSize: "11.5px", color: DIM, marginRight: "4px" }}>Ordina per</span>
        {ORDINI.map(o => (
          <button key={o.id} onClick={() => setOrdine(o.id)}
            style={{
              padding: "5px 11px", fontSize: "11.5px", borderRadius: "999px", cursor: "pointer",
              background: ordine === o.id ? "hsl(28 85% 55% / 0.16)" : "transparent",
              border: ordine === o.id ? "1px solid hsl(28 85% 55% / 0.5)" : BORDER,
              color: ordine === o.id ? "hsl(28 90% 70%)" : MUTED, fontWeight: ordine === o.id ? 700 : 400,
            }}>{o.testo}</button>
        ))}
      </div>
      {(ordine === "percentuale" || ordine === "parita") && (
        <div style={{ fontSize: "11.5px", color: DIM, marginBottom: "12px", lineHeight: 1.6 }}>
          {ordine === "percentuale"
            ? "In fondo chi ha meno di cento corse: su numeri piccoli la percentuale dipende dal caso."
            : "In fondo chi non ha abbastanza confronti a parità di cavallo perché il giudizio regga."}
        </div>
      )}

      <div className="pannello" style={{ overflowX: "auto", ["--colore-pannello" as any]: COLORE_ALLENATORI }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "860px" }}>
          <thead>
            <tr style={{ background: "hsl(220 12% 9%)" }}>
              {["Allenatore", "Corse", "Cavalli", "Vittorie", "Primi tre", "Premi", "Ultimi 12 mesi", "A parità di cavallo"].map((h, i) => (
                <th key={h} style={th(i)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.slice(0, 400).map((a, i) => (
              <tr key={a.allenatore} style={{ background: i % 2 ? "hsl(220 12% 8%)" : "transparent" }}>
                <td style={{ padding: "9px 12px", borderBottom: RIGA }}>
                  <Link href={`/allenatore/${encodeURIComponent(a.allenatore)}`}>
                    <a className="collegamento-scheda" style={{ color: "hsl(210 10% 88%)", fontWeight: 700 }}>{a.nome}</a>
                  </Link>
                  {a.ippodromo_top && a.ippodromo_top !== "ESTERO" && (
                    <div style={{ fontSize: "10.5px", color: "hsl(210 8% 40%)" }}>soprattutto a {a.ippodromo_top.toLowerCase()}</div>
                  )}
                </td>
                <td className="tabular" style={td({ color: "hsl(210 8% 72%)" })}>{a.n_corse.toLocaleString("it-IT")}</td>
                <td className="tabular" style={td()}>{a.n_cavalli.toLocaleString("it-IT")}</td>
                <td className="tabular" style={td({ color: "hsl(100 50% 60%)", fontWeight: 700 })}>
                  {a.n_vittorie.toLocaleString("it-IT")}
                  <span style={{ color: DIM, fontWeight: 400, fontSize: "11px" }}> · {a.pct_vittorie.toFixed(1).replace(".", ",")}%</span>
                </td>
                <td className="tabular" style={td()}>{a.pct_primi_tre.toFixed(1).replace(".", ",")}%</td>
                <td className="tabular" style={td({ color: "hsl(45 80% 62%)" })}>{euro(a.premi_totali)}</td>
                <td className="tabular" style={td()}>{a.premi_12_mesi > 0 ? euro(a.premi_12_mesi) : "\u2014"}</td>
                <td style={{ ...td(), minWidth: "170px" }}><BarraEffetto e={a.affidabilita >= 0.2 ? a.effetto : null} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {righe.length > 400 && (
        <div style={{ fontSize: "11.5px", color: DIM, marginTop: "8px" }}>
          Mostrati i primi 400: usa la ricerca per trovare gli altri.
        </div>
      )}
      {righe.length === 0 && (
        <div style={{ padding: "30px", textAlign: "center", color: MUTED, fontSize: "13px" }}>Nessun allenatore con questi filtri.</div>
      )}

      <Spiegazione>
        La barra «a parità di cavallo» parte dal centro: verso sinistra i cavalli rendono
        meglio del loro solito con questo allenatore, verso destra peggio. Il numero è
        quanto vale in posizioni, su una corsa da dieci partenti. «In attività» vuol dire
        almeno dieci corse negli ultimi diciotto mesi. Hanno una scheda gli allenatori con
        almeno venti corse dal 2016.
      </Spiegazione>

      <CollegamentiCorrelati voci={[
        { href: "/guidatori", titolo: "Guidatori", descrizione: "Chi porta i cavalli a rendere più del loro solito." },
        { href: "/gran-premi", titolo: "Gran Premi", descrizione: "I vincitori delle grandi corse dal 2014." },
        { href: "/cavalli", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati sull'archivio." },
      ]} />
    </div>
  );
}
