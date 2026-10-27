import { colorePista } from "@/lib/piste";
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
import { Spiegazione } from "./Spiegazione";
import BandieraCavallo from "@/components/BandieraCavallo";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 42%)";

type Voce = { horse_name: string; birth_year: number | null; prob: number; favorito: boolean; affidabile: boolean; arrivo: number | null; arrivo_testo: string | null; top3: boolean | null };
type Mancante = { horse_name: string; birth_year: number | null; arrivo_testo: string | null; top3: boolean };
type Corsa = { race_date: string; pista: string; tipo: string; corsa: string | null; numero: number | null; partenti: number; favoriti_noti: number; favoriti_a_segno: number; voci: Voce[]; mancanti?: Mancante[]; incompleto?: boolean; controllo?: Controllo | null;
  vincitore?: { nome: string; prob: number | null; posto: number | null; su: number } | null; attesi?: number;
  sorprese?: { nome: string; prob: number; arrivo: string }[]; primo_favorito?: { nome: string; prob: number; arrivo: string | null; top3: boolean | null } | null };
type Controllo = { tentativi: number; ultimo: string; esito: string; dettaglio: string | null };
type Sintesi = { corse: number; favoriti_controllati: number; quota_favoriti: number | null; quota_tutti: number | null;
  attesi_per_corsa?: number | null; arrivati_per_corsa?: number | null; primo_favorito_top3?: number | null; primo_favorito_vince?: number | null;
  vincitore_tra_favoriti?: number | null; distribuzione?: number[]; fasce?: { da: number; a: number; n: number; stimato: number; reale: number }[] };
type Risposta = { corse: Corsa[]; sintesi: Record<string, Sintesi> | null; piste?: { pista: string; corse: number; quota_favoriti: number | null }[];
  andamento?: { data: string; corse: number; quota_favoriti: number | null; quota_tutti: number | null }[];
  confronto_mercato?: { corse: number; noi: number | null; mercato: number | null; in_comune: number | null } | null; in_attesa?: number;
  in_attesa_elenco?: { race_date: string; pista: string; corsa: string; cavalli_con_arrivo: number; partenti: number; controllo: Controllo | null }[]; tentativi_max?: number };

/** A che punto e' il ricontrollo notturno di una corsa senza arrivo completo. */
function testoControllo(c: Controllo | null | undefined, max: number): string {
  if (!c) return "sarà ricontrollata al prossimo aggiornamento notturno";
  const quando = c.ultimo ? ` (ultimo il ${c.ultimo.slice(8, 10)}/${c.ultimo.slice(5, 7)} alle ${c.ultimo.slice(11, 16)} UTC)` : "";
  if (c.esito === "abbandonato") return `ricontrollata ${c.tentativi} volte senza esito: ${c.dettaglio ?? "motivo non noto"}. Resta così`;
  if (c.esito === "recuperato") return c.dettaglio ?? "arrivo recuperato";
  return `ricontrollo ${c.tentativi} di ${max}${quando}: ${c.dettaglio ?? "in corso"}`;
}

const p1 = (n: number | null | undefined) => n == null ? "—" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const dec = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** Il riepilogo del periodo: solo le stime del giorno, quelle mostrate davvero prima della gara. */
function Riepilogo({ d, giorni }: { d: Risposta; giorni: number }) {
  const s = d.sintesi?.del_giorno;
  if (!s || !s.corse) return null;
  const dist = s.distribuzione ?? [0, 0, 0, 0];
  const totDist = dist.reduce((a, b) => a + b, 0) || 1;
  const maxDist = Math.max(...dist, 1);
  const andamento = (d.andamento ?? []).filter(a => a.quota_favoriti != null);
  return (
    <div style={{ marginTop: 14 }}>
      <h3 className="verifica-titolo" style={{ margin: "0 0 2px" }}>Com'è andato negli ultimi {giorni} giorni</h3>
      <div style={{ fontSize: 12, color: MUTED }}>
        Solo le stime del giorno: {s.corse} corse con tutti i partenti e l'arrivo in archivio.
        {d.in_attesa ? (d.in_attesa === 1
          ? <> Un'altra corsa aspetta l'arrivo completo: il giro notturno la ricontrolla finché Trottoweb non lo pubblica.</>
          : <> Altre {d.in_attesa} corse aspettano l'arrivo completo: il giro notturno le ricontrolla finché Trottoweb non lo pubblica.</>) : null}
      </div>
      {(d.in_attesa_elenco ?? []).length > 0 && (
        <details style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          <summary style={{ cursor: "pointer" }}>Le corse in attesa e il motivo</summary>
          <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
            {d.in_attesa_elenco!.map(c => (
              <div key={`${c.race_date}${c.pista}${c.corsa}`}>
                <b style={{ color: "hsl(210 10% 80%)" }}>{c.race_date.split("-").reverse().join("/")} {titolo(c.pista)} {c.corsa}</b>
                {" · "}{c.cavalli_con_arrivo} arrivi su {c.partenti} · {testoControllo(c.controllo, d.tentativi_max ?? 8)}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="riepilogo-griglia">
        <div className="verifica-riquadro">
          <div className="etichetta">Primo favorito</div>
          <div className="valore tabular">{p1(s.primo_favorito_top3)}</div>
          <div className="spiega">è arrivato nei primi tre; ha vinto nel {p1(s.primo_favorito_vince)} delle corse.</div>
        </div>
        <div className="verifica-riquadro">
          <div className="etichetta">Il vincitore</div>
          <div className="valore tabular">{p1(s.vincitore_tra_favoriti)}</div>
          <div className="spiega">delle volte era fra i tre favoriti del pronostico.</div>
        </div>
        <div className="verifica-riquadro">
          <div className="etichetta">Attesi e arrivati</div>
          <div className="valore tabular" style={{ color: "hsl(210 10% 90%)" }}>{dec(s.arrivati_per_corsa)} <span style={{ fontSize: 14, color: MUTED }}>su 3</span></div>
          <div className="spiega">favoriti nei primi tre per corsa; il pronostico se ne aspettava {dec(s.attesi_per_corsa)}.</div>
        </div>
        {d.confronto_mercato && (
          <div className="verifica-riquadro">
            <div className="etichetta">I favoriti del pubblico</div>
            <div className="valore tabular" style={{ color: "hsl(210 10% 90%)" }}>{p1(d.confronto_mercato.mercato)}</div>
            <div className="spiega">
              nei primi tre, sulle stesse {d.confronto_mercato.corse} corse (i nostri: {p1(d.confronto_mercato.noi)}). Sono le tre quote più basse
              del totalizzatore alla partenza: il pubblico sa cose che la sera prima non si conoscono. In comune con i nostri: {p1(d.confronto_mercato.in_comune)}.
            </div>
          </div>
        )}
      </div>

      <div className="riepilogo-griglia" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}>
        <div className="verifica-riquadro">
          <div className="etichetta" style={{ marginBottom: 8 }}>Quanti favoriti a segno, corsa per corsa</div>
          <div className="barre-orizz">
            {[3, 2, 1, 0].map(k => (
              <div key={k} className="riga">
                <span>{k} su 3</span>
                <span className="traccia"><i style={{ width: `${(dist[k] / maxDist) * 80}%`, background: coloreSegno(k, 3) }} /><b>{dist[k]} corse · {Math.round((dist[k] / totDist) * 100)}%</b></span>
              </div>
            ))}
          </div>
        </div>
        {s.fasce && s.fasce.length > 0 && (
          <div className="verifica-riquadro">
            <div className="etichetta" style={{ marginBottom: 8 }}>Le percentuali erano giuste?</div>
            <div className="barre-orizz">
              {s.fasce.map(f => (
                <div key={f.da} className="riga">
                  <span>dati {f.da}–{f.a}%<small style={{ display: "block", color: DIM, fontSize: 10 }}>{f.n} cavalli</small></span>
                  <span style={{ display: "grid", gap: 2 }}>
                    <span className="traccia"><i style={{ width: `${f.stimato * 0.8}%`, background: "hsl(210 8% 45%)" }} /><b style={{ color: MUTED }}>{p1(f.stimato)}</b></span>
                    <span className="traccia"><i style={{ width: `${f.reale * 0.8}%`, background: "hsl(183 60% 48%)" }} /><b>{p1(f.reale)}</b></span>
                  </span>
                </div>
              ))}
            </div>
            <div className="nota">Barra grigia: la stima media della fascia. Barra azzurra: quanti sono arrivati davvero nei primi tre.</div>
          </div>
        )}
      </div>

      <div className="riepilogo-griglia" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}>
        {andamento.length > 1 && (
          <div className="verifica-riquadro">
            <div className="etichetta">Giorno per giorno: favoriti a segno</div>
            <div className="andamento">
              {andamento.map(a => (
                <div key={a.data} title={`${data(a.data)}: ${p1(a.quota_favoriti)} dei favoriti nei primi tre, ${a.corse} corse; a caso ${p1(a.quota_tutti)}`}>
                  <div className="colonna" style={{ height: `${a.quota_favoriti ?? 0}%` }}>
                    <span className="caso" style={{ bottom: `${((a.quota_tutti ?? 0) / Math.max(a.quota_favoriti ?? 1, 1)) * 100}%` }} />
                  </div>
                  <small>{new Date(a.data + "T00:00:00").getDate()}</small>
                </div>
              ))}
            </div>
            <div className="nota">Colonna: quota dei favoriti nei primi tre quel giorno. Linea gialla: un cavallo qualunque delle stesse corse.</div>
          </div>
        )}
        {(d.piste ?? []).length > 0 && (
          <div className="verifica-riquadro">
            <div className="etichetta" style={{ marginBottom: 8 }}>Per ippodromo</div>
            <div className="barre-orizz">
              {(d.piste ?? []).slice(0, 10).map(p => (
                <div key={p.pista} className="riga">
                  <span style={{ color: colorePista(p.pista) }}>{titolo(p.pista)}<small style={{ display: "block", color: DIM, fontSize: 10 }}>{p.corse} corse</small></span>
                  <span className="traccia"><i style={{ width: `${(p.quota_favoriti ?? 0) * 0.8}%`, background: "hsl(183 60% 48%)" }} /><b>{p1(p.quota_favoriti)}</b></span>
                </div>
              ))}
            </div>
            <div className="nota">Con poche corse per pista le differenze sono in gran parte caso.</div>
          </div>
        )}
      </div>
      <Spiegazione>
        «Favoriti» sono i tre cavalli con la stima più alta fra quelli partiti davvero. «Attesi» è la somma delle loro percentuali: se il pronostico
        dà 60%, 50% e 40%, si aspetta in media 1,5 favoriti nei primi tre. Se attesi e arrivati sono vicini, le percentuali sono oneste.
        Le corse con partenti mancanti nel pronostico non entrano nel conto; le stime ricostruite sono escluse da questo riepilogo
        perché non sono state mostrate prima della gara.
      </Spiegazione>
    </div>
  );
}

const titolo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
function data(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}
const coloreSegno = (n: number, su: number) => (su === 0 ? DIM : n / su >= 2 / 3 ? "hsl(150 55% 55%)" : n / su >= 1 / 3 ? "hsl(45 75% 55%)" : "hsl(10 65% 60%)");

const COLORE_STATO: Record<string, string> = {
  "in linea": "hsl(150 55% 52%)", attenzione: "hsl(10 65% 60%)", "pochi dati": "hsl(210 8% 45%)", "in attesa": "hsl(45 70% 55%)",
};
const nomeMese = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" });

/** Controllo automatico mese per mese, rifatto ogni notte. */
function ControlloMensile() {
  const { data } = useQuery<{ mesi: any[] }>({ queryKey: ["/api/controllo-modelli"], staleTime: 30 * 60 * 1000 });
  const mesi = data?.mesi ?? [];
  const top3 = mesi.filter(m => m.modello === "primi_tre");
  const premi = mesi.filter(m => m.modello === "premi_12_mesi");
  const allarme = top3.find(m => m.stato === "attenzione");
  return (
    <div className="verifica-riquadro" style={{ marginBottom: 12, borderColor: allarme ? "hsl(10 60% 40%)" : undefined }}>
      <div className="etichetta">Controllo mensile automatico</div>
      {allarme && (
        <div style={{ fontSize: 12.5, color: "hsl(10 70% 66%)", margin: "6px 0" }}>
          Attenzione: a {nomeMese(allarme.mese)} il pronostico è andato peggio di quanto promesso dalla prova ({Math.round(allarme.quota_favoriti * 100)}% dei favoriti nei primi tre).
        </div>
      )}
      {top3.length ? (
        <div className="controllo-mesi">
          {top3.map(m => (
            <div key={m.mese} className="controllo-mese" style={{ ["--c" as any]: COLORE_STATO[m.stato] ?? "gray" }}>
              <div><b style={{ textTransform: "capitalize" }}>{nomeMese(m.mese)}</b> · {m.corse} corse</div>
              <div className="tabular">favoriti a segno <b>{Math.round(m.quota_favoriti * 100)}%</b> · a caso {Math.round(m.quota_a_caso * 100)}%</div>
              <div style={{ color: COLORE_STATO[m.stato] }}>{m.stato}{m.riferimento ? ` (prova: ${Math.round(m.riferimento * 100)}%)` : ""}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="spiega" style={{ marginTop: 6 }}>Il primo mese si giudica quando ci sono almeno 40 corse con la stima del giorno e l'arrivo.</div>
      )}
      {premi.length > 0 && (
        <div className="spiega" style={{ marginTop: 8 }}>
          Premi dei prossimi 12 mesi: {premi[0].stato === "in attesa" ? premi[premi.length - 1].nota : `${premi[0].stato}, ${premi[0].nota}`}.
        </div>
      )}
      <div className="nota">Solo le stime del giorno contano: favoriti a segno contro la scelta a caso e contro la prova fatta all'allenamento. Se scende di oltre 8 punti sotto la prova, compare un avviso.</div>
    </div>
  );
}

export default function VerificaGare() {
  const [giorni, setGiorni] = useState(14);
  const [aperta, setAperta] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"tutte" | "del_giorno" | "ricostruito">("tutte");
  const { data: d, isLoading } = useQuery<Risposta>({
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
      <ControlloMensile />
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

      <Riepilogo d={d} giorni={giorni} />

      <h3 className="verifica-titolo" style={{ margin: "22px 0 0" }}>Corsa per corsa</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", margin: "10px 0 12px" }}>
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
              <div key={k} className="verifica-corsa pannello" style={{ ["--colore-pannello" as any]: colorePista(c.pista) }}>
                <button className="verifica-corsa-testa" onClick={() => setAperta(ap ? null : k)} aria-expanded={ap}>
                  <span className="vc-data">{data(c.race_date)}</span>
                  <span className="vc-pista" style={{ color: colorePista(c.pista) }}><MapPin size={12} style={{ color: colorePista(c.pista) }} /> {titolo(c.pista)}{c.corsa ? ` · ${c.corsa}` : c.numero ? ` · corsa ${c.numero}` : ""}</span>
                  {c.tipo === "ricostruito" && <span className="vc-tipo">ricostruita</span>}
                  {c.incompleto && <span className="vc-tipo" title="Il pronostico non aveva tutti i partenti: non conta nella media">incompleto</span>}
                  {c.favoriti_noti < 3 && c.controllo?.esito !== "recuperato" && (
                    <span className="vc-tipo" title={testoControllo(c.controllo, 8)}>{c.controllo?.esito === "abbandonato" ? "arrivo non trovato" : "in controllo"}</span>
                  )}
                  <span className="vc-segno tabular" style={{ color: col, borderColor: col }}>
                    {c.favoriti_noti ? `${c.favoriti_a_segno} su ${c.favoriti_noti}` : "—"}
                  </span>
                  <span className="vc-favoriti">
                    {c.voci.filter(v => v.favorito).map(v => (
                      <span key={v.horse_name} className={v.top3 == null ? "" : v.top3 ? "ok" : "no"}>{v.horse_name}</span>
                    ))}
                  </span>
                  {c.vincitore && <span className="vc-vincitore" title="Il vincitore e il suo posto nel pronostico">1° {c.vincitore.nome}{c.vincitore.posto != null ? ` · era ${c.vincitore.posto}° nel pronostico` : ""}</span>}
                  <ChevronDown size={15} style={{ marginLeft: "auto", color: MUTED, transform: ap ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
                </button>
                {ap && (
                  <div className="verifica-corsa-corpo">
                    <div className="vc-sommario">
                      {c.vincitore && (
                        <div>
                          <b>Ha vinto {c.vincitore.nome}</b>
                          {c.vincitore.posto != null
                            ? <>: per il pronostico era il {c.vincitore.posto}° su {c.vincitore.su}, dato al {Math.round(c.vincitore.prob ?? 0)}% di arrivare nei primi tre.</>
                            : <>: non era nel pronostico.</>}
                        </div>
                      )}
                      {c.primo_favorito && c.primo_favorito.top3 != null && (
                        <div>Il primo favorito, {c.primo_favorito.nome} ({Math.round(c.primo_favorito.prob)}%), è arrivato {c.primo_favorito.arrivo ?? "—"}.</div>
                      )}
                      {c.attesi != null && c.favoriti_noti === 3 && (
                        <div>Dei tre favoriti il pronostico se ne aspettava {dec(c.attesi)} nei primi tre; ne sono arrivati {c.favoriti_a_segno}.</div>
                      )}
                      {(c.sorprese ?? []).length > 0 && (
                        <div>Sorpres{c.sorprese!.length === 1 ? "a" : "e"}: {c.sorprese!.map(x => `${x.nome} (${Math.round(x.prob)}%, ${x.arrivo})`).join(", ")}.</div>
                      )}
                    </div>
                    <div className="vc-riga intest"><span>Cavallo</span><span>Stima primi tre</span><span>Arrivo</span><span /></div>
                    {c.voci.map(v => (
                      <div key={v.horse_name} className={`vc-riga${v.favorito ? " fav" : ""}`}>
                        <span>
                          <BandieraCavallo nome={v.horse_name} /> <Link href={`/horse/${encodeURIComponent(v.horse_name)}/${v.birth_year || 0}`}><a>{v.horse_name}</a></Link>
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
                    {(c.mancanti ?? []).map(m => (
                      <div key={m.horse_name} className="vc-riga" style={{ opacity: 0.85 }}>
                        <span>
                          <BandieraCavallo nome={m.horse_name} /> <Link href={`/horse/${encodeURIComponent(m.horse_name)}/${m.birth_year || 0}`}><a>{m.horse_name}</a></Link>
                          <small style={{ color: "hsl(35 80% 60%)" }}>non nel pronostico</small>
                        </span>
                        <span className="tabular" style={{ color: DIM }}>—</span>
                        <span className="tabular" style={{ color: m.top3 ? "hsl(150 55% 60%)" : MUTED }}>{m.arrivo_testo ?? "—"}</span>
                        <span />
                      </div>
                    ))}
                    {c.favoriti_noti < 3 && c.controllo?.esito !== "recuperato" && (
                      <div className="vc-nota" style={{ color: "hsl(35 80% 62%)" }}>
                        {3 - c.favoriti_noti === 1 ? "Manca l'arrivo di un favorito" : `Manca l'arrivo di ${3 - c.favoriti_noti} favoriti`}: {testoControllo(c.controllo, 8)}.
                      </div>
                    )}
                    {c.incompleto && (
                      <div className="vc-nota" style={{ color: "hsl(35 80% 62%)" }}>
                        Pronostico incompleto: {c.mancanti!.length === 1 ? "mancava 1 partente" : `mancavano ${c.mancanti!.length} partenti`}.
                        Fino all'11 ottobre i cavalli accoppiati (stessa scuderia) non venivano letti dal calendario. Questa corsa non conta nella media.
                      </div>
                    )}
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
