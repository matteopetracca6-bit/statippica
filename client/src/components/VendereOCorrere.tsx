/**
 * VENDERE O FAR CORRERE.
 *
 * La decisione dell'allevatore all'asta yearling (circa 18 mesi): incassare
 * subito il prezzo, oppure tenere il puledro, pagarne l'allenamento e
 * sperare nei premi. Allevamento e monta sono gia' spesi e valgono per tutte
 * e due le scelte, quindi non entrano nel confronto.
 *
 * Due usi:
 *  - nella scheda di un cavallo giovane che non ha ancora corso (nome, anno);
 *  - nella scheda Punto di pareggio, scegliendo stallone e fattrice.
 * Il prezzo non si inventa: lo scrive l'utente, oppure e' quello pagato
 * davvero all'asta per quel puledro. Le aste dei figli del padre sono solo
 * un riferimento, da usare con un clic.
 */
import Sagoma from "./Sagoma";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Gavel } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import NameSelect from "./NameSelect";

const MUTED = "hsl(210 8% 50%)";
import { ESITO_COLORE } from "@/lib/esiti";
import LegendaEsiti from "./LegendaEsiti";
// Stessi colori dei risultati in tutto il sito; il blu e' solo per i pulsanti.
const VERDE = ESITO_COLORE.profitto, GIALLO = ESITO_COLORE.pareggio, ROSSO = ESITO_COLORE.perdita, BLU = "hsl(200 75% 60%)";
const euro = (n: number) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
const pct = (n: number) => n.toLocaleString("it-IT") + "%";

interface Riepilogo { n: number; mediana: number; minimo: number; massimo: number }
interface Vendita {
  nome: string | null; padre: string; madre: string | null; mensile: number;
  figli_osservati: { padre: number; madre: number }; affidabilita: number;
  prezzo: number | null; prezzo_da: "tu" | "asta" | null;
  aste_padre: Riepilogo | null; aste_tutte: Riepilogo | null;
  tenere: { valore_atteso: number; guadagno_atteso: number; costo_da_qui: number; prob_non_corre: number;
            prob_ripaga_allenamento: number; prob_batte_prezzo: number | null };
  prezzo_minimo: number; differenza: number | null; decisione: "vendere" | "tenere" | "indifferente" | null;
}

const box: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 15%)", borderRadius: "10px", padding: "12px 14px", minWidth: 0 };
const inputStile: React.CSSProperties = {
  width: "130px", background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: "8px",
  color: "hsl(210 10% 92%)", padding: "7px 10px", fontSize: "13px",
};
const chip: React.CSSProperties = {
  background: "transparent", border: "1px solid hsl(200 60% 50% / 0.4)", color: BLU, borderRadius: "999px",
  padding: "3px 10px", fontSize: "11.5px", cursor: "pointer",
};

function Blocco({ titolo, colore, valore, nota, badge }: { titolo: string; colore?: string; valore: string; nota: React.ReactNode; badge?: string }) {
  const c = colore ?? "hsl(210 10% 88%)";
  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: MUTED }}>{titolo}</span>
        {badge && <span style={{ fontSize: "11px", fontWeight: 700, color: c, border: `1px solid ${c.replace(/\)$/, " / 0.4)")}`, borderRadius: "999px", padding: "1px 8px" }}>{badge}</span>}
      </div>
      <div className="tabular" style={{ fontSize: "20px", fontWeight: 800, color: c, margin: "4px 0 2px" }}>{valore}</div>
      <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.55 }}>{nota}</div>
    </div>
  );
}

export default function VendereOCorrere({ nome, anno, mensile = 1200, inScheda = false }:
  { nome?: string; anno?: number | null; mensile?: number; inScheda?: boolean }) {
  const [padre, setPadre] = useState("");
  const [madre, setMadre] = useState("");
  const [prezzoScritto, setPrezzoScritto] = useState("");
  const prezzo = prezzoScritto.trim() !== "" && Number(prezzoScritto) >= 0 ? String(Math.round(Number(prezzoScritto))) : "";

  const qs = nome
    ? `nome=${encodeURIComponent(nome)}&anno=${anno ?? ""}`
    : `padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}`;
  const { data: d, isFetching } = useQuery<Vendita>({
    queryKey: ["/api/pareggio/vendita", qs, mensile, prezzo],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/vendita?${qs}&mensile=${mensile}&prezzo=${prezzo}`)).json(),
    enabled: !!nome || !!padre,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });
  if (inScheda && !d && (!!nome || !!padre)) return <Sagoma cornice />;
  if (inScheda && (!d || (d as any).message)) return null;

  const t = d?.tenere;
  const colDec = d?.decisione === "vendere" ? GIALLO : d?.decisione === "tenere" ? VERDE : BLU;
  const nomePadre = d?.padre ?? padre;

  const corpo = d && t && !(d as any).message ? (
    <>
      {/* Il prezzo: scritto dall'utente o pagato davvero all'asta */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontSize: "12.5px", color: MUTED, marginBottom: "8px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          Prezzo offerto all'asta: €
          <input type="number" min={0} step={1000} inputMode="numeric" value={prezzoScritto}
                 placeholder={d.prezzo_da === "asta" && d.prezzo != null ? String(d.prezzo) : "scrivi il prezzo"}
                 aria-label="Prezzo offerto all'asta in euro" style={inputStile}
                 onChange={e => setPrezzoScritto(e.target.value)} />
        </label>
        {d.aste_padre && d.aste_padre.n >= 2 && (
          <button style={chip} onClick={() => setPrezzoScritto(String(d.aste_padre!.mediana))}>
            usa la mediana dei figli di {nomePadre} ({euro(d.aste_padre.mediana)})
          </button>
        )}
        {d.aste_tutte && (
          <button style={chip} onClick={() => setPrezzoScritto(String(d.aste_tutte!.mediana))}>
            usa la mediana di tutte le aste ({euro(d.aste_tutte.mediana)})
          </button>
        )}
      </div>
      <div style={{ fontSize: "11.5px", color: MUTED, marginBottom: "12px", lineHeight: 1.55 }}>
        {d.prezzo_da === "asta" && <>Questo puledro è stato venduto all'asta a {euro(d.prezzo!)}: il conto parte da lì. </>}
        {d.aste_padre
          ? <>Figli di {nomePadre} venduti alle aste yearling raccolte: {d.aste_padre.n}, da {euro(d.aste_padre.minimo)} a {euro(d.aste_padre.massimo)}.</>
          : <>Nessun figlio di {nomePadre} nelle aste yearling raccolte ({d.aste_tutte?.n ?? 0} vendite ITS e ANACT 2024-25).</>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "10px",
                    opacity: isFetching ? 0.6 : 1, transition: "opacity .2s" }}>
        <Blocco titolo="Vendere subito" valore={d.prezzo != null ? euro(d.prezzo) : "—"}
          nota={d.prezzo != null ? "Incasso sicuro, oggi. Nessun altro costo." : "Scrivi il prezzo offerto, oppure usa una delle mediane d'asta."} />
        <Blocco titolo="Tenerlo e farlo correre" colore={t.valore_atteso >= 0 ? VERDE : ROSSO} valore={euro(t.valore_atteso)}
          nota={<>In media vince {euro(t.guadagno_atteso)} contro {euro(t.costo_da_qui)} di allenamento da qui in avanti.
            Non corre mai nel {pct(t.prob_non_corre)} dei casi; ripaga l'allenamento il {pct(t.prob_ripaga_allenamento)}.</>} />
        {d.decisione ? (
          <Blocco titolo="Cosa conviene" colore={colDec}
            badge={d.decisione === "vendere" ? "Vendere" : d.decisione === "tenere" ? "Tenere" : "Si equivalgono"}
            valore={d.decisione === "indifferente" ? "≈ pari" : (d.differenza! > 0 ? "+" : "") + euro(Math.abs(d.differenza!))}
            nota={<>{d.decisione === "vendere" ? "Vendendo si ottiene in media questo in più." : d.decisione === "tenere" ? "Tenendolo si ottiene in media questo in più." : "Le due scelte danno in media lo stesso risultato."}
              {t.prob_batte_prezzo != null && <> Tenerlo frutta più del prezzo solo nel {pct(t.prob_batte_prezzo)} dei casi.</>}</>} />
        ) : (
          <Blocco titolo="Prezzo sotto cui tenerlo" colore={d.prezzo_minimo > 0 ? VERDE : GIALLO}
            valore={d.prezzo_minimo > 0 ? euro(d.prezzo_minimo) : "nessuno"}
            nota={d.prezzo_minimo > 0
              ? "Se l'offerta è più bassa di così, in media conviene tenerlo."
              : "In media l'allenamento costa più di quanto il puledro vince: qualunque offerta conviene, salvo puntare sul caso raro di un campione."} />
        )}
      </div>
      <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "10px", lineHeight: 1.55 }}>
        Ipotesi: {euro(d.mensile)} al mese, un anno di preparazione prima del debutto. Allevamento e monta sono già spesi e non contano:
        valgono per tutte e due le scelte. Le probabilità vengono da {d.figli_osservati.padre} figli di {nomePadre}
        {d.madre && d.figli_osservati.madre > 0 && <> e {d.figli_osservati.madre} di {d.madre}</>} (affidabilità {Math.round(d.affidabilita * 100)}%).
        È una media storica, non una previsione sul singolo puledro.
      </div>
      <LegendaEsiti style={{ marginTop: "8px" }} />
    </>
  ) : null;

  if (inScheda) {
    return (
      <div style={{ background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "12px", padding: "18px 22px", marginBottom: "22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Gavel size={15} style={{ color: GIALLO }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>Vendere o far correre?</span>
          <Link href="/pareggio"><a style={{ marginLeft: "auto", fontSize: "11.5px", color: "hsl(160 60% 55%)", textDecoration: "none" }}>Cambia le ipotesi</a></Link>
        </div>
        {corpo}
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "8px", marginBottom: "12px" }}>
        <NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Padre del puledro" onChange={n => setPadre(n)} />
        <NameSelect value={madre} endpoint="/api/search/mare" placeholder="Madre (facoltativa)" onChange={n => setMadre(n)} />
      </div>
      {padre ? corpo : <p style={{ fontSize: "12.5px", color: MUTED, margin: 0 }}>Scegli il padre del puledro per vedere il confronto.</p>}
    </div>
  );
}

/** Tabella: per gli stalloni con figli venduti all'asta, il prezzo che paga
 *  il mercato contro il valore medio di tenere un loro figlio. */
export function MercatoStalloni({ mensile }: { mensile: number }) {
  const { data } = useQuery<{ stalloni: any[] }>({
    queryKey: ["/api/pareggio/mercato", mensile],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/mercato?mensile=${mensile}`)).json(),
    staleTime: 60 * 60 * 1000,
  });
  const [tutti, setTutti] = useState(false);
  const tutte = (data?.stalloni ?? []).filter(r => r.figli >= 5).sort((a, b) => b.valore_tenere - a.valore_tenere);
  const righe = tutti ? tutte : tutte.slice(0, 10);
  if (!tutte.length) return null;
  const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, borderBottom: "1px solid hsl(220 10% 16%)", textAlign: "right" };
  const td: React.CSSProperties = { padding: "7px 8px", textAlign: "right", borderBottom: "1px solid hsl(220 10% 14%)" };
  return (
    <div style={{ overflowX: "auto", marginTop: "16px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", marginBottom: "4px" }}>Il mercato contro la pista</div>
      <p style={{ fontSize: "12px", color: MUTED, margin: "0 0 10px", lineHeight: 1.55 }}>
        Stalloni con almeno 3 figli venduti alle aste yearling e 5 figli già valutati in corsa. «Valore di tenerlo» è quanto rende in media un loro figlio
        dopo l'allenamento, senza contare il prezzo pagato. Se è sotto il prezzo d'asta, chi vende fa meglio, in media, di chi compra per far correre.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", fontVariantNumeric: "tabular-nums", minWidth: "620px" }}>
        <thead>
          <tr style={{ color: MUTED, fontSize: "11.5px" }}>
            <th style={{ ...th, textAlign: "left" }}>Stallone</th><th style={th}>Venduti</th><th style={th}>Prezzo mediano</th>
            <th style={th}>Valore di tenerlo</th><th style={th}>Batte il prezzo</th><th style={th}>Figli in corsa</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => (
            <tr key={r.padre}>
              <td style={{ ...td, textAlign: "left" }}>
                <Link href={`/stallion/${encodeURIComponent(r.padre)}`}><a style={{ color: "hsl(185 70% 55%)", textDecoration: "none", fontWeight: 600 }}>{r.padre}</a></Link>
              </td>
              <td style={{ ...td, color: MUTED }}>{r.venduti}</td>
              <td style={td}>{euro(r.prezzo_mediano)}</td>
              <td style={{ ...td, fontWeight: 700, color: r.valore_tenere >= 0 ? VERDE : ROSSO }}>{euro(r.valore_tenere)}</td>
              <td style={td}>{pct(r.prob_batte_prezzo)}</td>
              <td style={{ ...td, color: MUTED }}>{r.figli}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tutte.length > 10 && (
        <button style={{ ...chip, marginTop: "10px" }} onClick={() => setTutti(!tutti)}>
          {tutti ? "Mostra solo i primi 10" : `Mostra tutti i ${tutte.length} stalloni`}
        </button>
      )}
    </div>
  );
}
