/**
 * QUANTO VALE UN PULEDRO: comprarlo (prezzo massimo) o venderlo (vendere o
 * far correre). E' un solo conto visto dai due lati, quello di
 * valutaPuledro in server/pareggio.ts: i premi attesi in carriera, caso per
 * caso (campione, buono, discreto, corre poco, non corre), meno
 * l'allenamento, con la regola "lo fermo quando una stagione non rende".
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tag } from "lucide-react";
import Sagoma from "../components/Sagoma";
import NameSelect from "../components/NameSelect";
import VendereOCorrere, { MercatoStalloni } from "../components/VendereOCorrere";
import { Spiegazione } from "../components/Spiegazione";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import AggiungiScuderia from "../components/AggiungiScuderia";
import { useScuderia } from "@/lib/scuderia";

const MUTED = "hsl(210 8% 55%)";
const TESTO = "hsl(210 10% 90%)";
const VERDE = "hsl(145 55% 52%)";
const ROSSO = "hsl(0 60% 62%)";
const ORO = "hsl(38 80% 58%)";
const ACCENTO = "hsl(25 75% 58%)";
const CARD: React.CSSProperties = { background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 18%)", borderRadius: 12, padding: "16px 18px" };
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−€" : "€") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const pc = (p: number | null | undefined) => (p == null ? "—" : p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`);
const titolo = (s: string) => (s || "").split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");

function Riquadro({ titolo, valore, nota, colore }: { titolo: string; valore: React.ReactNode; nota?: React.ReactNode; colore?: string }) {
  return (
    <div style={{ ...CARD, padding: "13px 15px" }}>
      <div style={{ fontSize: 11.5, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{titolo}</div>
      <div className="tabular" style={{ fontSize: 23, fontWeight: 800, color: colore ?? TESTO, marginTop: 4, lineHeight: 1.15 }}>{valore}</div>
      {nota && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>{nota}</div>}
    </div>
  );
}

function Compro() {
  const q = parametri();
  const { scuderia } = useScuderia();
  const [padre, setPadre] = useState(q.get("padre")?.toUpperCase() ?? "");
  const [madre, setMadre] = useState(q.get("madre")?.toUpperCase() ?? "");
  const [nome] = useState(q.get("nome") ?? "");
  const [prezzo, setPrezzo] = useState(q.get("prezzo") ?? "");
  const [mensile, setMensile] = useState(Number(q.get("mensile")) || scuderia.mensile || 1200);
  const [margine, setMargine] = useState(0);
  const [asta, setAsta] = useState(q.get("asta") === "1");
  const prezzoN = prezzo.trim() !== "" && Number(prezzo) >= 0 ? Math.round(Number(prezzo)) : null;

  const qs = `padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}&mensile=${mensile}&margine=${margine}&asta=${asta ? 1 : 0}&prezzo=${prezzoN ?? ""}`;
  const { data: d, isFetching } = useQuery<any>({
    queryKey: ["/api/puledro/valore", qs],
    queryFn: async () => (await apiRequest("GET", `/api/puledro/valore?${qs}`)).json(),
    enabled: !!padre,
    staleTime: 30 * 60 * 1000,
    placeholderData: (p: any) => p,
  });
  const r = d?.con_regola;
  const inp: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, color: TESTO, padding: "7px 10px", fontSize: 13, width: 120, fontFamily: "inherit" };
  const etich: React.CSSProperties = { fontSize: 12.5, color: MUTED, display: "flex", flexDirection: "column", gap: 5 };

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={CARD}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}>
          <div style={etich}>Padre<NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Stallone (almeno 2 lettere)" onChange={n => setPadre((n || "").toUpperCase())} /></div>
          <div style={etich}>Madre (facoltativa)<NameSelect value={madre} endpoint="/api/search/mare" placeholder="Fattrice" onChange={n => setMadre((n || "").toUpperCase())} /></div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, alignItems: "flex-end" }}>
          <label style={etich}>Prezzo chiesto o pagato (€)
            <input type="number" min={0} step={1000} inputMode="numeric" value={prezzo} placeholder="facoltativo" style={inp} onChange={e => setPrezzo(e.target.value)} />
          </label>
          <label style={etich}>Costo al mese (€)
            <input type="number" min={100} step={50} inputMode="numeric" value={mensile} style={inp} onChange={e => setMensile(Math.max(100, Number(e.target.value) || 1200))} />
          </label>
          <label style={etich}>Utile che vuoi in più
            <select value={margine} onChange={e => setMargine(Number(e.target.value))} style={{ ...inp, width: 150 }}>
              <option value={0}>nessuno (in pari)</option><option value={10}>10% della spesa</option>
              <option value={25}>25% della spesa</option><option value={50}>50% della spesa</option>
            </select>
          </label>
          <label style={{ fontSize: 12.5, color: "hsl(210 10% 82%)", display: "flex", alignItems: "center", gap: 7, paddingBottom: 8 }}>
            <input type="checkbox" checked={asta} onChange={e => setAsta(e.target.checked)} />
            scelto all'asta (premi × {d?.fattore_asta?.toLocaleString("it-IT") ?? "1,4"})
          </label>
        </div>
      </div>

      {!padre && <div style={{ ...CARD, color: MUTED, fontSize: 13, lineHeight: 1.6 }}>
        Scegli il padre (e se vuoi la madre). Per i puledri delle aste 2026 il prezzo massimo è già nella tabella di <Link href="/generazione-m" style={{ color: ORO }}>Aste e generazione M</Link>.
      </div>}
      {padre && !d && isFetching && <Sagoma riquadri={4} />}
      {d && r && !d.message && <>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 14, color: TESTO }}>
            {nome && <b>{titolo(nome)} · </b>}<b>{titolo(d.padre)}</b>{d.madre && <> × <b>{titolo(d.madre)}</b></>}
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Figli osservati: {d.figli_osservati.padre} del padre{d.madre ? `, ${d.figli_osservati.madre} della madre` : ""} · affidabilità {Math.round(d.affidabilita * 100)}%
              {d.affidabilita < 0.4 && " (pochi figli: conta di più la media di tutti i cavalli)"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AggiungiScuderia voce={{ tipo: "puledro", nome: nome || null, padre: d.padre, madre: d.madre, anno: new Date().getFullYear() - 1, prezzo: prezzoN, asta }} />
            <Link href={`/stallion/${encodeURIComponent(d.padre)}`} style={{ fontSize: 12.5, color: ORO, alignSelf: "center" }}>scheda di {titolo(d.padre)}</Link>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
          <Riquadro titolo="Prezzo massimo" colore={r.prezzo_massimo > 0 ? VERDE : ROSSO}
            valore={r.prezzo_massimo > 0 ? euro(r.prezzo_massimo) : "nessuno"}
            nota={r.prezzo_massimo > 0
              ? <>Pagandolo così, in media sei in pari{margine ? ` con il ${margine}% di utile` : ""}.</>
              : <>Anche regalato, in media perde {euro(-r.valore_atteso)}: i premi attesi non coprono l'allenamento.</>} />
          <Riquadro titolo="Premi attesi in carriera" valore={euro(r.premi_attesi)} nota={<>contro {euro(r.allenamento_atteso)} di allenamento e mantenimento</>} />
          {d.prezzo != null ? <>
            <Riquadro titolo={`Pagato ${euro(d.prezzo)}`} colore={r.con_prezzo.utile_atteso >= 0 ? VERDE : ROSSO} valore={euro(r.con_prezzo.utile_atteso)}
              nota={<>utile atteso; si ripaga in {pc(r.con_prezzo.prob_ripaga)} dei casi</>} />
            <Riquadro titolo="In pari se costa al mese" colore={d.mensile_di_pareggio ? ORO : ROSSO}
              valore={d.mensile_di_pareggio ? `meno di ${euro(d.mensile_di_pareggio)}` : "mai"}
              nota={d.mensile_di_pareggio ? "allenamento e mantenimento, a quel prezzo" : "nemmeno a 100 € al mese, a quel prezzo"} />
          </> : (
            <Riquadro titolo="Si ripaga, se regalato" valore={pc(r.prob_ripaga_gratis)} nota="casi su 100 in cui i premi coprono almeno l'allenamento" />
          )}
        </div>

        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: TESTO, margin: "0 0 4px" }}>Caso per caso</h2>
          <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 10px", lineHeight: 1.6 }}>
            Ogni riga è un modo in cui può andare la sua carriera, con la probabilità che viene dai figli del padre{d.madre ? " e della madre" : ""} e i premi veri dei cavalli
            nati 2014-2019 finiti in quel caso. Il cavallo si ferma a fine stagione, dai 3 anni in su, se in quella stagione ha vinto meno di metà del suo costo.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="tabella-tenere">
              <thead><tr><th>Caso</th><th className="num">Probabilità</th><th className="num">Premi in carriera</th>
                <th className="num nascondi-mobile">Tipico</th><th className="num nascondi-mobile">Anni pagati</th><th className="num nascondi-mobile">Allenamento</th><th className="num">Netto</th></tr></thead>
              <tbody>
                {r.scenari.map((s: any) => (
                  <tr key={s.chiave}>
                    <td><b style={{ color: TESTO }}>{s.nome}</b><div style={{ fontSize: 11, color: MUTED }}>{s.nota}</div></td>
                    <td className="num tabular" style={{ fontWeight: 700 }}>{pc(s.p)}</td>
                    <td className="num tabular">{euro(s.premi_medi)}</td>
                    <td className="num tabular nascondi-mobile">{euro(s.premi_tipici)}</td>
                    <td className="num tabular nascondi-mobile">{s.anni_medi.toLocaleString("it-IT")}</td>
                    <td className="num tabular nascondi-mobile">{euro(s.allenamento)}</td>
                    <td className="num tabular" style={{ fontWeight: 700, color: s.netto >= 0 ? VERDE : ROSSO }}>{euro(s.netto)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid hsl(220 10% 24%)" }}>
                  <td><b style={{ color: TESTO }}>In media</b></td><td className="num">100%</td>
                  <td className="num tabular" style={{ fontWeight: 700 }}>{euro(r.premi_attesi)}</td><td className="nascondi-mobile" />
                  <td className="nascondi-mobile" /><td className="num tabular nascondi-mobile">{euro(r.allenamento_atteso)}</td>
                  <td className="num tabular" style={{ fontWeight: 800, color: r.valore_atteso >= 0 ? VERDE : ROSSO }}>{euro(r.valore_atteso)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: MUTED, margin: "10px 0 0", lineHeight: 1.6 }}>
            Se invece lo tieni quanto hanno corso davvero i cavalli dell'archivio, senza fermarlo: premi {euro(d.senza_regola.premi_attesi)}, allenamento {euro(d.senza_regola.allenamento_atteso)},
            netto {euro(d.senza_regola.valore_atteso)}{d.senza_regola.prezzo_massimo > 0 ? <>, prezzo massimo {euro(d.senza_regola.prezzo_massimo)}</> : null}. Fermare chi non rende
            {d.senza_regola.valore_atteso < r.valore_atteso ? <> vale {euro(r.valore_atteso - d.senza_regola.valore_atteso)} a puledro.</> : " qui non migliora il conto."}
          </p>
        </div>

        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: TESTO, margin: "0 0 4px" }}>Se lo paghi…</h2>
          <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 10px", lineHeight: 1.6 }}>
            Per ogni prezzo: in quanti casi su 100 i premi coprono prezzo e allenamento, e l'utile medio.
            {d.aste_padre && <> All'asta i figli di {titolo(d.padre)} sono stati pagati in mediana {euro(d.aste_padre.mediana)} ({d.aste_padre.n} venduti).</>}
          </p>
          <div style={{ display: "grid", gap: 4 }}>
            {r.curva.map((c: any) => {
              const sopra = r.prezzo_massimo > 0 && c.prezzo <= r.prezzo_massimo;
              return (
                <div key={c.prezzo} style={{ display: "grid", gridTemplateColumns: "84px 1fr 52px 92px", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                  <span className="tabular" style={{ color: TESTO, textAlign: "right" }}>{c.prezzo === 0 ? "regalato" : euro(c.prezzo)}</span>
                  <div style={{ background: "hsl(220 10% 14%)", borderRadius: 4, height: 12, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, c.prob_ripaga)}%`, minWidth: c.prob_ripaga > 0 ? 2 : 0, height: "100%", background: sopra ? VERDE : ACCENTO }} />
                  </div>
                  <span className="tabular" style={{ color: TESTO, fontWeight: 700, textAlign: "right" }}>{pc(c.prob_ripaga)}</span>
                  <span className="tabular" style={{ color: c.utile_atteso >= 0 ? VERDE : ROSSO, textAlign: "right" }}>{euro(c.utile_atteso)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>}
    </div>
  );
}

export default function PuledroPage() {
  const [modo, setModo] = useState<"compro" | "vendo">(parametri().get("modo") === "vendo" ? "vendo" : "compro");
  const { scuderia } = useScuderia();
  useEffect(() => { window.scrollTo?.(0, 0); }, [modo]);
  const bottone = (attivo: boolean): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 9, cursor: "pointer", border: "none", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    background: attivo ? ACCENTO : "hsl(220 10% 14%)", color: attivo ? "hsl(220 13% 7%)" : MUTED,
  });
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 18px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Tag size={20} style={{ color: ACCENTO }} />
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TESTO, margin: 0 }}>Quanto vale un puledro</h1>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px", lineHeight: 1.6, maxWidth: 820 }}>
        Lo stesso conto visto dai due lati. Chi compra vuole sapere quanto può pagare al massimo, chi ha allevato il puledro se conviene venderlo o farlo correre.
        Il valore è quello che il puledro rende in pista, caso per caso, meno quello che costa farlo correre.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button style={bottone(modo === "compro")} onClick={() => setModo("compro")}>Lo compro: prezzo massimo</button>
        <button style={bottone(modo === "vendo")} onClick={() => setModo("vendo")}>Lo vendo: vendere o far correre</button>
      </div>
      {modo === "compro" ? <Compro /> : (
        <div style={CARD}>
          <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
            All'asta yearling, verso i 18 mesi, l'allevatore sceglie: incassare subito o tenere il puledro e pagarne l'allenamento.
            Allevamento e monta sono ormai spesi e non cambiano la scelta. Conviene vendere quando il prezzo supera il valore del puledro in pista,
            cioè il prezzo massimo che pagherebbe un compratore attento.
          </p>
          <VendereOCorrere mensile={scuderia.mensile || 1200} />
          <MercatoStalloni mensile={scuderia.mensile || 1200} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Spiegazione titolo="Come è fatto il conto, e cosa non contiene">
          <p>Le probabilità di ogni caso vengono dai voti dei figli del padre (e della madre) nati 2012-2021; con pochi figli si appoggiano alla media di tutti i cavalli,
          come per gli incroci. I premi e le stagioni di ogni caso sono quelli veri, stagione per stagione, dei cavalli nati 2014-2019 con quel voto.
          I premi netti sono già la parte del proprietario.</p>
          <p>Costi: un anno di doma e preparazione prima del debutto, più un anno per ogni stagione di corse, al costo mensile che scegli.
          La regola di fermarlo usa solo la stagione appena finita, come farebbe un proprietario: a volte ferma un cavallo che dopo sarebbe migliorato, e anche questo è nel conto.</p>
          <p>«Scelto all'asta»: i puledri delle aste 2024 e 2025 hanno vinto circa 1,4 volte quanto diceva il loro pedigree, a 2 e a 3 anni.
          Che il vantaggio continui dopo i 3 anni è un'ipotesi: non c'è ancora un'asta da cui verificarlo.</p>
          <p>Non contano: la rivendita, il valore di una femmina come fattrice, i premi all'allevatore. Sono tutti a favore: il prezzo massimo vero è un po' più alto.
          Il costo mensile è la leva più forte: provalo a 800 € oltre che a 1.200 €.</p>
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/scuderia", titolo: "La tua scuderia", descrizione: "Metti insieme i tuoi cavalli: cassa, rischio e valore" },
        { href: "/generazione-m", titolo: "Aste e generazione M", descrizione: "I puledri delle aste 2026 con il loro prezzo massimo" },
        { href: "/pareggio", titolo: "Punto di pareggio", descrizione: "Costi, voti e incroci" },
      ]} />
    </div>
  );
}
