/**
 * I NUMERI DIETRO LE PERCENTUALI DI UNA CORSA.
 *
 * La percentuale da sola non dice perché un cavallo è davanti a un altro.
 * Qui, per ogni partente, i dati che il modello legge davvero (forma delle
 * ultime cinque corse, premi dell'ultimo anno, miglior tempo, guidatore,
 * risultati sulla pista, giorni di riposo) e dove ciascuno si colloca fra gli
 * avversari della stessa corsa. In fondo il passaggio che porta dalle stime
 * grezze alle percentuali mostrate: in una corsa i posti nei primi tre sono tre.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronDown, ListChecks } from "lucide-react";
import { Spiegazione } from "./Spiegazione";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 42%)";
const VERDE = "hsl(150 55% 55%)";
const ROSSO = "hsl(10 60% 60%)";
const tempo = (t: number) => `1'${t.toFixed(1).replace(".", "\"")}`;
const euro = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;
const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;

type Posto = { posto: number; su: number };
type Cavallo = {
  nome: string; anno: number | null; partenza: number | null; prob: number | null; prob_grezza: number | null; corse: number;
  ultime: { data: string; pista: string; arrivo: string; top3: boolean }[];
  forma: number | null; forma_su: number; giorni: number | null; premi_anno: number | null; record: number | null;
  carriera_top3: number | null; pista_corse: number; pista_top3: number;
  guidatore: string | null; guidatore_corse: number | null; guidatore_top3: number | null;
  posti?: Record<string, Posto>;
};

/** "1° su 9", colorato: verde nel primo terzo, rosso nell'ultimo. */
function PostoCorsa({ p }: { p?: Posto }) {
  if (!p || p.su < 3) return null;
  const c = p.posto <= Math.ceil(p.su / 3) ? VERDE : p.posto > Math.floor((p.su * 2) / 3) ? ROSSO : MUTED;
  return <small style={{ display: "block", color: c, fontSize: 10.5 }}>{p.posto}° su {p.su}</small>;
}

export default function DettaglioPronostico({ track, date, time }: { track: string; date: string; time: string }) {
  const [aperto, setAperto] = useState(false);
  const { data: d, isLoading, error } = useQuery<any>({
    queryKey: ["/api/calendar/dettaglio", track, date, time],
    queryFn: async () => (await apiRequest("GET", `/api/calendar/dettaglio?track=${encodeURIComponent(track)}&date=${date}&time=${encodeURIComponent(time)}`)).json(),
    enabled: aperto,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div style={{ padding: "0 16px 14px" }}>
      <button onClick={() => setAperto(a => !a)} aria-expanded={aperto} className="bottone-dettaglio">
        <ListChecks size={14} />
        I numeri dietro le percentuali
        <ChevronDown size={14} style={{ transform: aperto ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {aperto && (
        isLoading ? <div style={{ fontSize: 12, color: MUTED, padding: "10px 4px" }}>Leggo l'archivio…</div>
        : error || !d?.cavalli ? <div style={{ fontSize: 12, color: MUTED, padding: "10px 4px" }}>I dettagli di questa corsa non sono disponibili.</div>
        : (
          <div style={{ marginTop: 10 }}>
            <div style={{ overflowX: "auto", border: "1px solid hsl(220 10% 16%)", borderRadius: 10 }}>
              <table className="tabella-dettaglio">
                <thead>
                  <tr>
                    <th>Cavallo</th><th className="num">Stima</th><th>Ultime 5 corse</th><th className="num">Premi ultimo anno</th>
                    <th className="num">Miglior tempo</th><th className="num">Primi tre in carriera</th><th>Guidatore dell'ultima corsa</th>
                    <th className="num">Su questa pista</th><th className="num">Ferma da</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.cavalli as Cavallo[]).map(c => (
                    <tr key={c.nome}>
                      <td>
                        <Link href={`/horse/${encodeURIComponent(c.nome)}/${c.anno || 0}`}><a className="nome">{c.nome}</a></Link>
                        <small style={{ display: "block", color: DIM, fontSize: 10.5 }}>
                          {c.partenza != null ? `numero ${c.partenza} · ` : ""}{c.corse} corse in archivio
                        </small>
                      </td>
                      <td className="num tabular" style={{ fontWeight: 700, color: "hsl(183 60% 58%)" }}>{c.prob != null ? pct(c.prob) : "—"}</td>
                      <td>
                        {c.ultime.length ? (
                          <span className="arrivi">
                            {c.ultime.map((u, i) => (
                              <span key={i} className={u.top3 ? "ok" : ""} title={`${u.data} · ${u.pista}`}>{u.arrivo.replace("squalificato", "sq.").replace(/ \(.*\)/, "")}</span>
                            ))}
                          </span>
                        ) : <span style={{ color: DIM }}>mai corso</span>}
                        {c.forma != null && <small style={{ display: "block", color: MUTED, fontSize: 10.5 }}>{c.forma} su {c.forma_su} nei primi tre</small>}
                        <PostoCorsa p={c.posti?.forma} />
                      </td>
                      <td className="num tabular">{c.premi_anno != null ? euro(c.premi_anno) : "—"}<PostoCorsa p={c.posti?.premi_anno} /></td>
                      <td className="num tabular">{c.record != null ? tempo(c.record) : "—"}<PostoCorsa p={c.posti?.record} /></td>
                      <td className="num tabular">{c.carriera_top3 != null ? pct(c.carriera_top3) : "—"}<PostoCorsa p={c.posti?.carriera_top3} /></td>
                      <td>
                        {c.guidatore ?? <span style={{ color: DIM }}>—</span>}
                        {c.guidatore_top3 != null && <small style={{ display: "block", color: MUTED, fontSize: 10.5 }}>{pct(c.guidatore_top3)} nei primi tre su {c.guidatore_corse?.toLocaleString("it-IT")} corse</small>}
                        <PostoCorsa p={c.posti?.guidatore_top3} />
                      </td>
                      <td className="num tabular">{c.pista_corse ? `${c.pista_top3} su ${c.pista_corse}` : <span style={{ color: DIM }}>mai</span>}</td>
                      <td className="num tabular" style={{ color: c.giorni != null && c.giorni > 120 ? ROSSO : undefined }}>{c.giorni != null ? `${c.giorni} giorni` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 8 }}>
              Un cavallo scelto a caso fra i {d.partenti} partenti arriva nei primi tre circa {pct(d.a_caso)} delle volte.
              {d.somma_grezza > 0 && <> Le stime grezze del modello sommavano a {d.somma_grezza}%; i posti nei primi tre sono {Math.min(3, d.partenti)},
              quindi sono state riportate in proporzione fino a {Math.min(3, d.partenti) * 100}%.</>}
            </div>
            <Spiegazione compatta>
              Sono i numeri da cui parte il modello, riletti dall'archivio con le sole corse prima di questa. Sotto ogni numero c'è il posto del cavallo
              fra i partenti della corsa (verde nel terzo migliore, rosso nel terzo peggiore): il modello guarda soprattutto questo confronto, non il valore da solo.
              «Guidatore» è chi lo ha guidato nell'ultima corsa: il calendario non dice chi lo guiderà oggi. Pesa anche il numero di partenza, e conta
              quanti sono i partenti. Un arrivo in verde è un piazzamento nei primi tre; passa sopra un arrivo per vedere data e pista.
            </Spiegazione>
          </div>
        )
      )}
    </div>
  );
}
