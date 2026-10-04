/**
 * PUNTO DI PAREGGIO.
 *
 * Risponde alla domanda manageriale del relatore: questo cavallo, o questo
 * incrocio, mi fa andare in perdita, in pareggio o in profitto?
 *
 * Tre decisioni, tre soglie:
 *  - TENERLO O FERMARLO (cavallo gia' in corsa): le spese passate non contano
 *    piu'; conviene continuare solo se in un anno rende quanto costa in un anno;
 *  - BILANCIO DI CARRIERA: quanto deve vincere in tutto per ripagare ingresso e
 *    anni di allenamento;
 *  - INCROCIO: l'utile atteso, pesando ogni esito possibile del puledro con la
 *    probabilita' osservata fra i figli dello stallone (e della fattrice).
 *
 * Tutti i conti stanno sul server (server/pareggio.ts): qui si scelgono le
 * ipotesi e si leggono i risultati.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Scale } from "lucide-react";
import GradeBadge from "../components/GradeBadge";
import NameSelect from "../components/NameSelect";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento, ErroreCaricamento } from "../components/Caricamento";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

const MUTED = "hsl(210 8% 55%)";
const BORDER = "1px solid hsl(220 10% 18%)";
const CARD: React.CSSProperties = {
  background: "hsl(220 12% 10%)", border: BORDER, borderRadius: "12px", padding: "18px 20px",
};
const COLORE_ESITO: Record<string, string> = {
  profitto: "hsl(145 60% 50%)", pareggio: "hsl(45 90% 58%)", perdita: "hsl(0 65% 60%)",
};
const ETICHETTA: Record<string, string> = { profitto: "Profitto", pareggio: "Pareggio", perdita: "Perdita" };

const euro = (n: number) => (n < 0 ? "\u2212" : "") + "\u20ac" + Math.abs(Math.round(n)).toLocaleString("it-IT");

function Esito({ e }: { e: string | null | undefined }) {
  if (!e) return <span style={{ color: MUTED, fontSize: "12px" }}>n.d.</span>;
  const c = COLORE_ESITO[e];
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700,
      color: c, background: c.replace(/\)$/, " / 0.12)"), border: `1px solid ${c.replace(/\)$/, " / 0.4)")}`,
    }}>{ETICHETTA[e]}</span>
  );
}

function Riquadro({ titolo, valore, nota, colore }: { titolo: string; valore: React.ReactNode; nota: string; colore?: string }) {
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={{ fontSize: "11.5px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{titolo}</div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: colore ?? "hsl(210 10% 92%)", fontVariantNumeric: "tabular-nums" }}>{valore}</div>
      <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.5, marginTop: "4px" }}>{nota}</div>
    </div>
  );
}

interface Voto {
  voto: string; n: number; guadagno_mediano: number; stagioni_mediane: number; guadagno_per_stagione: number;
  costo_mediano: number; utile_mediano: number; utile_medio: number; pct_in_utile: number; esito: string;
}
interface Base {
  ipotesi: { allevamento_fino_2_anni: number; costo_mensile: number; costo_mensile_basso: number; monta_mediana: number;
             asta_mediana: number | null; asta_n: number; cavalli_osservati: number; cavalli_mai_corsi: number;
             annate: [number, number]; fascia_pareggio: number; fonti: { nome: string; url: string }[] };
  mensile: number; ingresso: number;
  soglie: { carriera: number; stagioni_ipotizzate: number; annuale: number };
  voti: Voto[]; voto_di_pareggio: string | null;
}

const get = (u: string) => apiRequest("GET", u).then(r => r.json());

export default function PareggioPage() {
  const [mensile, setMensile] = useState(1200);
  const [modo, setModo] = useState<"allevo" | "compro">("allevo");
  const [monta, setMonta] = useState<number | null>(null);
  const [prezzo, setPrezzo] = useState<number | null>(null);

  // Prima lettura: servono le ipotesi (monta mediana, prezzo d'asta mediano).
  const { data: prime } = useQuery<Base>({ queryKey: ["/api/pareggio", "prime"], queryFn: () => get("/api/pareggio") });
  useEffect(() => {
    if (prime && prezzo == null) setPrezzo(prime.ipotesi.asta_mediana ?? 20000);
  }, [prime]);

  const allev = prime?.ipotesi.allevamento_fino_2_anni ?? 14800;
  // La monta non si inventa: finche' l'utente non la scrive, i conti che ne
  // dipendono restano vuoti.
  const manca = modo === "allevo" && monta == null;
  const ingresso = modo === "allevo" ? allev + (monta ?? 0) : (prezzo ?? 0);

  const { data, isLoading, error } = useQuery<Base>({
    queryKey: ["/api/pareggio", mensile, ingresso],
    queryFn: () => get(`/api/pareggio?mensile=${mensile}&ingresso=${ingresso}`),
    enabled: !!prime,
    placeholderData: prev => prev,
  });

  // Un cavallo
  const [cavallo, setCavallo] = useState<{ nome: string; anno?: number | null } | null>(null);
  const { data: cv, isFetching: cvCarica } = useQuery<any>({
    queryKey: ["/api/pareggio/cavallo", cavallo?.nome, cavallo?.anno, mensile, manca ? null : ingresso],
    queryFn: () => get(`/api/pareggio/cavallo?nome=${encodeURIComponent(cavallo!.nome)}&anno=${cavallo!.anno ?? ""}&mensile=${mensile}&ingresso=${manca ? "" : ingresso}`),
    enabled: !!cavallo,
  });

  // Un incrocio
  const [padre, setPadre] = useState("");
  const [madre, setMadre] = useState("");
  const [montaIncrocio, setMontaIncrocio] = useState<string>("");
  const { data: inc, isFetching: incCarica } = useQuery<any>({
    queryKey: ["/api/pareggio/incrocio", padre, madre, mensile, montaIncrocio],
    queryFn: () => get(`/api/pareggio/incrocio?padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}&mensile=${mensile}&monta=${montaIncrocio}`),
    enabled: !!padre,
  });

  if (error) return <ErroreCaricamento titolo="Punto di pareggio" cosa="i dati del punto di pareggio" />;
  if (!data || isLoading) return <Caricamento testo="Calcolo il punto di pareggio..." />;

  const ip = data.ipotesi;
  const inputStile: React.CSSProperties = {
    background: "hsl(220 12% 8%)", border: BORDER, borderRadius: "8px", color: "hsl(210 10% 90%)",
    padding: "7px 10px", fontSize: "13px", width: "120px", fontVariantNumeric: "tabular-nums",
  };
  const bottone = (attivo: boolean): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: "8px", cursor: "pointer", border: "none", fontSize: "12.5px", fontWeight: 700,
    background: attivo ? "hsl(160 60% 42%)" : "hsl(220 10% 14%)", color: attivo ? "hsl(220 13% 7%)" : MUTED,
  });

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "22px 18px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <Scale size={20} style={{ color: "hsl(160 60% 50%)" }} />
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "hsl(210 10% 90%)", margin: 0, letterSpacing: "0.02em" }}>
          Punto di pareggio
        </h1>
      </div>
      <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7, maxWidth: "860px", marginBottom: "20px" }}>
        Quanto deve vincere un cavallo per ripagare quello che costa, e quali voti ci arrivano davvero.
        I conti usano la carriera reale di {ip.cavalli_osservati.toLocaleString("it-IT")} cavalli nati
        fra il {ip.annate[0]} e il {ip.annate[1]}, che hanno corso almeno una volta e hanno ormai una
        carriera quasi completa. Si legge come una media storica, non come la previsione su un singolo cavallo.
      </p>

      {/* IPOTESI */}
      <div style={{ ...CARD, marginBottom: "18px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 88%)", margin: "0 0 12px" }}>Le tue ipotesi</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "22px", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: MUTED, minWidth: "260px" }}>
            Allenamento e mantenimento al mese: <b style={{ color: "hsl(210 10% 92%)", fontSize: "15px" }}>{euro(mensile)}</b>
            <input type="range" min={500} max={2000} step={50} value={mensile}
                   onChange={e => setMensile(Number(e.target.value))} aria-label="Costo mensile" />
            <span style={{ display: "flex", gap: "6px" }}>
              <button style={bottone(mensile === ip.costo_mensile_basso)} onClick={() => setMensile(ip.costo_mensile_basso)}>{euro(ip.costo_mensile_basso)} basso</button>
              <button style={bottone(mensile === ip.costo_mensile)} onClick={() => setMensile(ip.costo_mensile)}>{euro(ip.costo_mensile)} tipico</button>
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: MUTED }}>
            Come arriva il cavallo a 2 anni
            <span style={{ display: "flex", gap: "6px" }}>
              <button style={bottone(modo === "allevo")} onClick={() => setModo("allevo")}>Lo allevo io</button>
              <button style={bottone(modo === "compro")} onClick={() => setModo("compro")}>Lo compro all'asta</button>
            </span>
          </div>
          {modo === "allevo" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: MUTED }}>
              Prezzo della monta
              <input type="number" min={0} step={500} value={monta ?? ""} placeholder="scrivi il prezzo" style={inputStile}
                     aria-label="Prezzo della monta in euro"
                     onChange={e => setMonta(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
            </label>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: MUTED }}>
              Prezzo d'acquisto {ip.asta_mediana ? `(mediana di ${ip.asta_n} puledri venduti: ${euro(ip.asta_mediana)})` : ""}
              <input type="number" min={0} step={1000} value={prezzo ?? ""} style={inputStile}
                     onChange={e => setPrezzo(Math.max(0, Number(e.target.value)))} />
            </label>
          )}
          <div style={{ fontSize: "12.5px", color: MUTED, paddingBottom: "6px" }}>
            {manca
              ? <>Costo fino ai 2 anni: allevamento {euro(allev)} + la monta che scrivi</>
              : <>Costo fino ai 2 anni: <b style={{ color: "hsl(210 10% 92%)" }}>{euro(ingresso)}</b>
                {modo === "allevo" && <> (allevamento {euro(allev)} + monta)</>}</>}
          </div>
        </div>
      </div>

      {/* LE TRE SOGLIE */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        <Riquadro titolo="Soglia annuale" valore={euro(data.soglie.annuale)}
          nota="Per un cavallo già in corsa: conviene tenerlo solo se in un anno vince almeno questo. Le spese passate non contano più." />
        {manca ? (
          <div style={{ gridColumn: "span 2", minWidth: 0, fontSize: "13px", lineHeight: 1.6, color: "hsl(45 90% 62%)",
                        background: "hsl(45 90% 55% / 0.08)", border: "1px solid hsl(45 90% 55% / 0.3)", borderRadius: "12px", padding: "14px 16px" }}>
            Scrivi il prezzo della monta qui sopra: servono a calcolare la soglia di carriera, il voto di pareggio e la tabella voto per voto.
            In alternativa scegli «Lo compro all'asta».
          </div>
        ) : <>
        <Riquadro titolo={`Soglia di carriera (${data.soglie.stagioni_ipotizzate} stagioni)`} valore={euro(data.soglie.carriera)}
          nota="Quanto deve vincere in tutta la carriera per ripagare l'ingresso, l'anno prima del debutto e gli anni di corsa." />
        <Riquadro titolo="Voto di pareggio" colore={data.voto_di_pareggio ? COLORE_ESITO.pareggio : COLORE_ESITO.perdita}
          valore={data.voto_di_pareggio ?? "nessuno"}
          nota={data.voto_di_pareggio
            ? `Con queste ipotesi, solo dal voto ${data.voto_di_pareggio} in su il cavallo tipico non è in perdita.`
            : "Con queste ipotesi nessun voto, nel caso tipico, ripaga i costi."} />
        </>}
      </div>

      {/* TABELLA PER VOTO */}
      {!manca && <div style={{ ...CARD, marginBottom: "18px", overflowX: "auto" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 88%)", margin: "0 0 4px" }}>Voto per voto</h2>
        <p style={{ fontSize: "12.5px", color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
          Il cavallo tipico di ogni voto, con il costo calcolato sulle sue stagioni reali. "Pareggio" vuol dire
          entro il {Math.round(ip.fascia_pareggio * 100)}% del costo, sopra o sotto.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", fontVariantNumeric: "tabular-nums", minWidth: "760px" }}>
          <thead>
            <tr style={{ color: MUTED, fontSize: "11.5px", textAlign: "right" }}>
              {["Voto", "Cavalli", "Vinto in carriera", "Stagioni", "Vinto a stagione", "Costo", "Utile tipico", "In utile", "Esito"].map((t, i) => (
                <th key={t} style={{ padding: "6px 8px", textAlign: i === 0 || i === 8 ? "left" : "right", fontWeight: 600, borderBottom: BORDER }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.voti.map(v => (
              <tr key={v.voto} style={{ borderBottom: BORDER }}>
                <td style={{ padding: "7px 8px" }}><GradeBadge grade={v.voto} size="sm" /></td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: MUTED }}>{v.n.toLocaleString("it-IT")}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>{euro(v.guadagno_mediano)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.stagioni_mediane}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: v.guadagno_per_stagione >= data.soglie.annuale ? COLORE_ESITO.profitto : undefined }}>{euro(v.guadagno_per_stagione)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: MUTED }}>{euro(v.costo_mediano)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: COLORE_ESITO[v.esito] }}>{euro(v.utile_mediano)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.pct_in_utile.toLocaleString("it-IT")}%</td>
                <td style={{ padding: "7px 8px" }}><Esito e={v.esito} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: "14px", marginBottom: "18px" }}>
        {/* UN CAVALLO */}
        <div style={CARD}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 88%)", margin: "0 0 4px" }}>Un cavallo: tenerlo o fermarlo?</h2>
          <p style={{ fontSize: "12.5px", color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
            Confronta quello che ha vinto negli ultimi 12 mesi con quanto costa in un anno, e fa il bilancio della carriera fin qui.
          </p>
          <NameSelect value={cavallo?.nome ?? ""} endpoint="/api/search/horse" placeholder="Scegli un cavallo"
                      onChange={(nome, o) => setCavallo(nome ? { nome, anno: o?.birth_year ?? null } : null)} />
          {cvCarica && <p style={{ color: MUTED, fontSize: "12.5px" }}>Calcolo...</p>}
          {cv && !cvCarica && (
            <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "13px", color: "hsl(210 10% 88%)" }}>
                <b>{cv.nome}</b> ({cv.anno}) <GradeBadge grade={cv.voto} size="sm" />
                <span style={{ color: MUTED }}> · {cv.gare} gare in {cv.stagioni} stagioni · {euro(cv.guadagni_carriera)} vinti</span>
                {!cv.voto_da_corsa && <div style={{ color: MUTED, fontSize: "12px" }}>Non ha ancora corso: il voto viene solo dalla genealogia.</div>}
              </div>
              <div style={{ background: "hsl(220 12% 8%)", border: BORDER, borderRadius: "10px", padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                  <b style={{ fontSize: "13px" }}>Tenerlo un altro anno</b><Esito e={cv.gestione.esito} />
                </div>
                <div style={{ fontSize: "12.5px", color: MUTED, marginTop: "4px", lineHeight: 1.6 }}>
                  {cv.ultimi_12_mesi.gare === 0
                    ? "Nessuna corsa negli ultimi 12 mesi: non c'è un rendimento recente da confrontare."
                    : <>Ultimi 12 mesi: {euro(cv.gestione.rendimento_annuo)} in {cv.ultimi_12_mesi.gare} gare, contro {euro(cv.gestione.costo_annuo)} di costo annuo ({euro(cv.gestione.differenza)}).</>}
                </div>
              </div>
              <div style={{ background: "hsl(220 12% 8%)", border: BORDER, borderRadius: "10px", padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                  <b style={{ fontSize: "13px" }}>Bilancio della carriera</b>{cv.carriera && <Esito e={cv.carriera.esito} />}
                </div>
                <div style={{ fontSize: "12.5px", color: MUTED, marginTop: "4px", lineHeight: 1.6 }}>
                  {cv.carriera ? <>
                    Costo stimato {euro(cv.carriera.speso_stimato)}, bilancio {euro(cv.carriera.bilancio)}
                    {manca && cv.monta != null && <> (con la monta del padre dal catalogo, {euro(cv.monta)})</>}.
                    {cv.carriera.mancano_per_pareggio > 0 && <> Per arrivare in pari dovrebbe vincere ancora {euro(cv.carriera.mancano_per_pareggio)}.</>}
                  </> : <>La monta del padre non è nel catalogo: scrivila nel campo «Prezzo della monta» in alto per avere il bilancio.</>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* UN INCROCIO */}
        <div style={CARD}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 88%)", margin: "0 0 4px" }}>Un incrocio: conviene farlo?</h2>
          <p style={{ fontSize: "12.5px", color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
            Pesa ogni esito possibile del puledro, dal voto SSS al "non corre mai", con quanto è successo ai figli
            dello stallone (e della fattrice, se la indichi). Con pochi figli conta di più la media di tutti i cavalli.
          </p>
          <div style={{ display: "grid", gap: "8px" }}>
            <NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Stallone (scrivi almeno 2 lettere)" onChange={n => setPadre(n)} />
            <NameSelect value={madre} endpoint="/api/search/mare" placeholder="Fattrice (facoltativa)" onChange={n => setMadre(n)} />
            <label style={{ fontSize: "12.5px", color: MUTED, display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              Prezzo della monta, se diverso dal catalogo:
              <input type="number" min={0} step={500} value={montaIncrocio} placeholder="dal catalogo" style={inputStile}
                     onChange={e => setMontaIncrocio(e.target.value)} />
            </label>
          </div>
          {incCarica && <p style={{ color: MUTED, fontSize: "12.5px" }}>Calcolo...</p>}
          {inc && !incCarica && (
            <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <div style={{ fontSize: "13px" }}>
                  <b>{inc.padre}</b>{inc.madre ? <> × <b>{inc.madre}</b></> : null}
                  <div style={{ color: MUTED, fontSize: "12px" }}>
                    {inc.monta != null ? <>Monta {euro(inc.monta)}{inc.monta_da_catalogo ? " (catalogo)" : " (indicata da te)"}</> : <span style={{ color: "hsl(45 90% 62%)" }}>Monta non nel catalogo: scrivila nel campo sopra</span>} · figli osservati:
                    {" "}{inc.figli_osservati.padre} del padre{inc.madre ? `, ${inc.figli_osservati.madre} della madre` : ""} · affidabilità {Math.round(inc.affidabilita * 100)}%
                  </div>
                </div>
                <Esito e={inc.esito} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
                {inc.utile_atteso != null ? <>
                  <Riquadro titolo="Utile atteso" valore={euro(inc.utile_atteso)} colore={COLORE_ESITO[inc.esito]} nota={`su un costo atteso di ${euro(inc.costo_atteso)}`} />
                  <Riquadro titolo="Prob. di profitto" valore={`${inc.prob_profitto.toLocaleString("it-IT")}%`} nota="quota di puledri che si ripagano" />
                </> : <>
                  <Riquadro titolo="Vinto in media da un figlio" valore={euro(inc.guadagno_atteso)} nota="non dipende dalla monta" />
                  <Riquadro titolo="Utile atteso" valore="—" nota="serve il prezzo della monta" />
                </>}
                <Riquadro titolo="Monta massima" valore={inc.monta_massima_di_pareggio > 0 ? euro(inc.monta_massima_di_pareggio) : "nessuna"}
                  nota={inc.monta_massima_di_pareggio > 0 ? "prezzo della monta che porta l'utile atteso a zero" : "non va in pari neanche con la monta gratis"} />
              </div>
              <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "70px" }}>
                {inc.probabilita.map((p: any) => (
                  <div key={p.voto} style={{ flex: 1, textAlign: "center" }} title={`${p.voto}: ${p.p}%`}>
                    <div style={{ height: `${Math.max(2, p.p * 2.2)}px`, background: p.voto === "Non corre" ? "hsl(0 0% 35%)" : "hsl(160 60% 45%)", borderRadius: "3px 3px 0 0" }} />
                    <div style={{ fontSize: "10px", color: MUTED, marginTop: "3px" }}>{p.voto === "Non corre" ? "no" : p.voto}</div>
                    <div style={{ fontSize: "10px", color: "hsl(210 10% 80%)" }}>{Math.round(p.p)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Spiegazione titolo="Come è fatto il conto, e cosa non contiene">
        <p>Il costo di un cavallo è: costo fino ai 2 anni (allevamento più monta, oppure prezzo d'acquisto),
        più 12 mesi di allenamento prima del debutto, più 12 mesi per ogni stagione di corse. Il ricavo è il premio
        netto vinto, cioè la quota del proprietario: nella circolare ministeriale al proprietario vanno 42,5 parti
        su 50, il resto ad allenatore e guidatore.</p>
        <p>L'allevamento fino ai 2 anni ({euro(allev)}) viene dai listini di riproduzione e dalle tariffe UNIRE già usati
        nel capitolo economico. Fra i nati {ip.annate[0]}-{ip.annate[1]}, {ip.cavalli_mai_corsi.toLocaleString("it-IT")} non hanno
        mai corso: nell'incrocio sono l'esito "non corre", che costa fino ai 2 anni più un anno di allenamento e non rende nulla.</p>
        <p>Non sono contati: la rivendita del cavallo, il valore di una femmina come fattrice, i premi all'allevatore, i puledri
        mai iscritti a nulla. I primi tre sono a favore, l'ultimo a sfavore. Il costo mensile cambia molto da scuderia a scuderia:
        è la leva che sposta di più il risultato, per questo è regolabile.</p>
        <ul style={{ paddingLeft: "18px", marginTop: "8px" }}>
          {ip.fonti.map(f => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.nome}</a></li>)}
        </ul>
      </Spiegazione>

      <CollegamentiCorrelati voci={[
        { href: "/advisor", titolo: "Advisor", descrizione: "Scegli l'accoppiamento migliore per una fattrice" },
        { href: "/stalloni", titolo: "Catalogo stalloni", descrizione: "Prezzi di monta e figli di ogni stallone" },
        { href: "/metodo", titolo: "Metodo e dati", descrizione: "Come si calcolano i voti" },
      ]} />
    </div>
  );
}
