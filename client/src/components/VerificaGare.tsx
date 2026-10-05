/**
 * VERIFICA GARA PER GARA.
 *
 * Per ogni corsa gia' disputata: cosa diceva il pronostico prima della
 * partenza e com'e' andata davvero. In cima il conto complessivo: quante volte
 * i tre cavalli con la stima piu' alta sono arrivati nei primi tre, contro un
 * cavallo qualunque delle stesse corse.
 *
 * Due tipi di stima, sempre dichiarati:
 *  - "del giorno": quella mostrata nel calendario prima della gara;
 *  - "ricostruita": per le corse precedenti all'arrivo del pronostico,
 *    calcolata dopo ma con i soli dati di prima della gara. Il modello e'
 *    allenato fino al 2024, quindi non le ha mai viste.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Check, X, ChevronDown, MapPin } from "lucide-react";
import Sagoma from "./Sagoma";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 42%)";

type Voce = { horse_name: string; birth_year: number | null; prob: number; favorito: boolean; affidabile: boolean; arrivo: number | null; arrivo_testo: string | null; top3: boolean | null };
type Corsa = { race_date: string; pista: string; tipo: string; corsa: string | null; numero: number | null; partenti: number; favoriti_noti: number; favoriti_a_segno: number; voci: Voce[] };
type Sintesi = { corse: number; favoriti_controllati: number; quota_favoriti: number | null; quota_tutti: number | null };

const titolo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
function data(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}
const coloreSegno = (n: number, su: number) => (su === 0 ? DIM : n / su >= 2 / 3 ? "hsl(150 55% 55%)" : n / su >= 1 / 3 ? "hsl(45 75% 55%)" : "hsl(10 65% 60%)");

export default function VerificaGare() {
  const [giorni, setGiorni] = useState(14);
  const [aperta, setAperta] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"tutte" | "del_giorno" | "ricostruito">("tutte");
  const { data: d, isLoading } = useQuery<{ corse: Corsa[]; sintesi: Record<string, Sintesi> | null }>({
    queryKey: ["/api/calendar/verifica", giorni],
    queryFn: async () => (await apiRequest("GET", `/api/calendar/verifica?giorni=${giorni}`)).json(),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !d) return <Sagoma cornice riquadri={3} righe={6} />;
  const corse = d.corse.filter(c => tipo === "tutte" || c.tipo === tipo);
  const sg = d.sintesi?.del_giorno;
  const sr = d.sintesi?.ricostruito;

  return (
    <div>
      <div className="verifica-sintesi-griglia">
        {[{ s: sg, nome: "Stime del giorno", nota: "mostrate nel calendario prima della gara" },
          { s: sr, nome: "Stime ricostruite", nota: "calcolate dopo, con i soli dati di prima della gara" }].map(({ s, nome, nota }) => (
          <div key={nome} className="verifica-riquadro">
            <div className="etichetta">{nome}</div>
            {s && s.quota_favoriti != null ? (
              <>
                <div className="valore tabular">{s.quota_favoriti.toLocaleString("it-IT")}%</div>
                <div className="spiega">
                  dei favoriti arrivati nei primi tre, su {s.corse} corse. Un cavallo qualunque delle stesse corse: {s.quota_tutti?.toLocaleString("it-IT")}%.
                </div>
              </>
            ) : (
              <div className="spiega" style={{ marginTop: 6 }}>Ancora nessuna corsa da controllare: i primi risultati arrivano con l'aggiornamento della notte dopo la gara.</div>
            )}
            <div className="nota">{nota}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", margin: "14px 0 12px" }}>
        {([["tutte", "Tutte"], ["del_giorno", "Del giorno"], ["ricostruito", "Ricostruite"]] as const).map(([k, t]) => (
          <button key={k} className={`chip-filtro${tipo === k ? " attivo" : ""}`} onClick={() => setTipo(k)}>{t}</button>
        ))}
        <span style={{ width: 12 }} />
        {[7, 14, 30].map(g => (
          <button key={g} className={`chip-filtro${giorni === g ? " attivo" : ""}`} onClick={() => setGiorni(g)}>ultimi {g} giorni</button>
        ))}
      </div>

      {corse.length === 0 ? (
        <div className="riga-vuota">Nessuna corsa con il risultato in archivio in questo periodo.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {corse.map(c => {
            const k = `${c.race_date}|${c.pista}|${c.corsa ?? c.numero}`;
            const ap = aperta === k;
            const col = coloreSegno(c.favoriti_a_segno, c.favoriti_noti);
            return (
              <div key={k} className="verifica-corsa">
                <button className="verifica-corsa-testa" onClick={() => setAperta(ap ? null : k)} aria-expanded={ap}>
                  <span className="vc-data">{data(c.race_date)}</span>
                  <span className="vc-pista"><MapPin size={12} /> {titolo(c.pista)}{c.corsa ? ` · ${c.corsa}` : c.numero ? ` · corsa ${c.numero}` : ""}</span>
                  {c.tipo === "ricostruito" && <span className="vc-tipo">ricostruita</span>}
                  <span className="vc-segno tabular" style={{ color: col, borderColor: col }}>
                    {c.favoriti_noti ? `${c.favoriti_a_segno} su ${c.favoriti_noti}` : "—"}
                  </span>
                  <span className="vc-favoriti">
                    {c.voci.filter(v => v.favorito).map(v => (
                      <span key={v.horse_name} className={v.top3 == null ? "" : v.top3 ? "ok" : "no"}>{v.horse_name}</span>
                    ))}
                  </span>
                  <ChevronDown size={15} style={{ marginLeft: "auto", color: MUTED, transform: ap ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
                </button>
                {ap && (
                  <div className="verifica-corsa-corpo">
                    <div className="vc-riga intest"><span>Cavallo</span><span>Stima primi tre</span><span>Arrivo</span><span /></div>
                    {c.voci.map(v => (
                      <div key={v.horse_name} className={`vc-riga${v.favorito ? " fav" : ""}`}>
                        <span>
                          <Link href={`/horse/${encodeURIComponent(v.horse_name)}/${v.birth_year || 0}`}><a>{v.horse_name}</a></Link>
                          {v.favorito && <small>favorito</small>}
                        </span>
                        <span className="tabular">
                          <span className="barretta"><span style={{ width: `${Math.min(100, v.prob)}%` }} /></span>{Math.round(v.prob)}%
                        </span>
                        <span className="tabular" style={{ color: v.top3 ? "hsl(150 55% 60%)" : v.top3 === false ? MUTED : DIM }}>
                          {v.arrivo_testo ?? "non in archivio"}
                        </span>
                        <span>{v.top3 == null ? null : v.top3 ? <Check size={14} color="hsl(150 55% 55%)" /> : <X size={14} color="hsl(10 60% 55%)" />}</span>
                      </div>
                    ))}
                    <div className="vc-nota">
                      {c.tipo === "ricostruito"
                        ? `Stima ricostruita: l'archivio conosce ${c.partenti} partenti di questa corsa, quindi il confronto è fra loro e le percentuali non sommano a tre.`
                        : "Stima mostrata nel calendario prima della gara. «Non in archivio»: il cavallo non è fra quelli che l'archivio segue, quindi il suo arrivo non si conosce."}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
