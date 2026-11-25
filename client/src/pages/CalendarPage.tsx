import { colorePista, colorePistaTenue } from "@/lib/piste";
import { coloreScheda } from "@/lib/sezioni";
import { useState, useEffect } from "react";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import { CSS_DUE_COLONNE, Cifra } from "../components/DueColonne";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "../components/GradeBadge";
import BandieraCavallo from "../components/BandieraCavallo";
import { Calendar, MapPin, Clock, ChevronDown, AlertCircle, Star } from "lucide-react";
import VerificaPronostico from "../components/VerificaPronostico";
import VerificaGare from "../components/VerificaGare";
import DettaglioPronostico from "../components/DettaglioPronostico";
import CavalloCaricamento from "@/components/CavalloCaricamento";
import StellinaSegui from "../components/StellinaSegui";
import { useSeguiti } from "@/lib/seguiti";

interface CalendarEntry {
  horse_name: string;
  driver: string | null;
  start_pos: number | null;
  distance: number | null;
  grade: string | null;
  score: number | null;
  career_earnings: number | null;
  win_rate: number | null;
  career_races: number | null;
  career_wins: number | null;
  country: string | null;
  birth_year: number | null;
  sire: string | null;
  dam: string | null;
  win_estimate: number;
  km_previsto?: number | null;
  piu_veloce?: boolean;
  /** Probabilita' di arrivare nei primi tre (modello XGBoost). */
  top3?: { prob: number; affidabile: boolean; n_corse: number; motivi: { testo: string; pro: boolean }[]; vince?: number | null; mattino?: boolean };
  /** Rischio di squalifica per galoppo (modello provato sulle corse 2025–2026). */
  galoppo?: { prob: number; fascia: "basso" | "medio" | "alto"; n_corse: number; rotture: number };
}

interface RaceEvent {
  track: string;
  race_date: string;
  race_time: string;
  n_runners: number;
  entries: CalendarEntry[];
}

interface CalendarResponse {
  races: RaceEvent[];
  total: number;
  note?: string;
  pronostico?: { verificato: boolean; nome: string } | null;
  galoppo?: { supera: boolean; partenze: number; quota: number; fasce: Record<string, { quota_partenze: number; prevista: number; vera: number }> } | null;
}

/** Il numero da mostrare: la probabilita' dei primi tre se c'e', altrimenti la stima vecchia. */
const stima = (e: CalendarEntry) => (e.top3 ? e.top3.prob : e.win_estimate);

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatTime(time: string): string {
  if (!time) return "—";
  return time.substring(0, 5);
}

/** "Oggi", "Domani", "Gio 26". */
function nomeGiorno(iso: string): string {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round((d.getTime() - oggi.getTime()) / 864e5);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" }).replace(/^./, c => c.toUpperCase());
}
function nomeGiornoLungo(iso: string): string {
  const t = new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const g = nomeGiorno(iso);
  return (g === "Oggi" || g === "Domani" ? `${g} · ` : "") + t.replace(/^./, c => c.toUpperCase());
}
const nomePistaCal = (t: string) => TRACK_NAMES[t] || (t.charAt(0) + t.slice(1).toLowerCase());
/** La distanza della corsa: quella dei piu' (chi parte dietro ne ha qualcuna in piu'). */
function distanzaCorsa(r: RaceEvent): number | null {
  const c = new Map<number, number>();
  for (const e of r.entries) if (e.distance && e.distance >= 1000) c.set(e.distance, (c.get(e.distance) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

const TRACK_NAMES: Record<string, string> = {
  BO: "Bologna", MI: "Milano", RM: "Roma", TO: "Torino",
  NA: "Napoli", CE: "Cesena", SR: "Siracusa", TV: "Treviso",
  MT: "Montecatini", CS: "Casarano", PA: "Palermo", PC: "Pontecagnano", MO: "Modena",
  FI: "Firenze", BA: "Bari", VA: "Varese", GA: "Garigliano",
  PD: "Padova", VI: "Villanova", CT: "Castelluccio", AN: "Ancona",
  TS: "Trieste", FR: "Frosinone", SS: "San Severo",
  MG: "Montegiorgio", AV: "Aversa", TA: "Taranto", FO: "Follonica", CV: "Civitanova", FE: "Ferrara",
  MON: "Montegiorgio",
};

/** 14.39 (come time_km) -> 1'14"4 */
function kmTesto(k: number): string {
  const s = k < 40 ? 60 + k : k;
  const m = Math.floor(s / 60), r = s - 60 * m;
  return `${m}'${r.toFixed(1).replace(".", '"')}`;
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRace, setExpandedRace] = useState<string | null>(null);
  // Prossime gare oppure verifica delle gare gia' corse.
  const [scheda, setScheda] = useState<"prossime" | "verifica">("prossime");

  // Era `useState(() => ...)`: funzionava per caso, perche' React esegue quella
  // funzione una volta sola per calcolare il valore iniziale. Il posto giusto
  // per una chiamata di rete e' useEffect.
  useEffect(() => {
    apiRequest("GET", "/api/calendar?limit=100")
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        // Auto-expand the first race
        if (d.races && d.races.length > 0) {
          setExpandedRace(`${d.races[0].track}-${d.races[0].race_date}-${d.races[0].race_time}`);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const raceKey = (r: RaceEvent) => `${r.track}-${r.race_date}-${r.race_time}`;
  const [giorno, setGiorno] = useState<string>("tutti");
  const [pista, setPista] = useState<string>("tutte");
  const [soloMiei, setSoloMiei] = useState(false);
  const [chiuse, setChiuse] = useState<Set<string>>(new Set());
  const { seguiti, segue } = useSeguiti();
  const tutte = data?.races ?? [];
  // Numero della corsa nella giornata: l'ordine di partenza nella riunione.
  const numeroCorsa = new Map<string, number>();
  {
    const per = new Map<string, RaceEvent[]>();
    for (const r of tutte) { const k = `${r.race_date}|${r.track}`; per.set(k, [...(per.get(k) ?? []), r]); }
    per.forEach(l => [...l].sort((x, y) => x.race_time.localeCompare(y.race_time)).forEach((r, i) => numeroCorsa.set(raceKey(r), i + 1)));
  }
  const giorni = [...new Set(tutte.map(r => r.race_date))].sort();
  const piste = [...new Set(tutte.filter(r => giorno === "tutti" || r.race_date === giorno).map(r => r.track))].sort((a, b) => nomePistaCal(a).localeCompare(nomePistaCal(b)));
  const conMiei = (r: RaceEvent) => r.entries.some(e => segue(e.horse_name, e.birth_year));
  const corseConMiei = tutte.filter(conMiei).length;
  const filtrate = tutte.filter(r => (giorno === "tutti" || r.race_date === giorno) && (pista === "tutte" || r.track === pista) && (!soloMiei || conMiei(r)));
  const gruppi: { data: string; riunioni: { track: string; corse: RaceEvent[]; miei: number }[] }[] = [];
  for (const r of [...filtrate].sort((x, y) => x.race_date.localeCompare(y.race_date) || x.race_time.localeCompare(y.race_time))) {
    let g = gruppi.find(x => x.data === r.race_date);
    if (!g) { g = { data: r.race_date, riunioni: [] }; gruppi.push(g); }
    let ri = g.riunioni.find(x => x.track === r.track);
    if (!ri) { ri = { track: r.track, corse: [], miei: 0 }; g.riunioni.push(ri); }
    ri.corse.push(r);
    ri.miei += r.entries.filter(e => segue(e.horse_name, e.birth_year)).length;
  }

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: coloreScheda("/calendario") }}>
      <style>{CSS_DUE_COLONNE + CSS_CALENDARIO}</style>
      <IntestazionePagina icona={Calendar} colore={coloreScheda("/calendario")} titolo="Calendario gare" margineSotto={16}
        sottotitolo="Le prossime corse con gli iscritti e il loro voto, e come è andato il pronostico delle gare già corse." />

      {data && data.total > 0 && scheda === "prossime" && (
        <div className="ed-cifre" style={{ marginBottom: 16 }}>
          <Cifra titolo="Corse in programma" valore={data.total.toLocaleString("it-IT")} colore={coloreScheda("/calendario")} />
          <Cifra titolo="Partenti" valore={data.races.reduce((t, r) => t + r.n_runners, 0).toLocaleString("it-IT")} />
          <Cifra titolo="Ippodromi" valore={new Set(data.races.map(r => r.track)).size} />
        </div>
      )}

      <div className="ed-linguette" role="tablist">
        <button className="ed-linguetta" role="tab" aria-selected={scheda === "prossime"} onClick={() => setScheda("prossime")} data-testid="tab-prossime">
          <span><b>Prossime gare</b><small>iscritti e voti</small></span>
        </button>
        <button className="ed-linguetta" role="tab" aria-selected={scheda === "verifica"} onClick={() => setScheda("verifica")} data-testid="tab-verifica">
          <span><b>Com'è andato il pronostico</b><small>le gare già corse</small></span>
        </button>
      </div>

      {scheda === "verifica" ? <VerificaGare /> : loading ? (
        <CavalloCaricamento label="Caricamento" />
      ) : !data || data.races.length === 0 ? (
        <div className="pannello" style={{ padding: "48px 24px", textAlign: "center" }}>
          <AlertCircle size={32} style={{ color: "hsl(210 8% 40%)", marginBottom: "12px" }} />
          <p style={{ fontSize: "15px", color: "hsl(210 8% 55%)", margin: "0 0 8px" }}>
            {data?.note || "Nessuna gara in calendario."}
          </p>
          <p style={{ fontSize: "12px", color: "hsl(210 8% 40%)", margin: 0 }}>
            Le gare future vengono aggiornate automaticamente ogni notte.
          </p>
        </div>
      ) : (
        <>
          {data.pronostico && (
            <p style={{ fontSize: 12.5, color: "hsl(210 8% 58%)", margin: "0 0 12px", lineHeight: 1.5 }}>
              La percentuale grande è la probabilità di arrivare nei primi tre (in ogni corsa sommano a 3), quella piccola di vincere. Il giorno della
              corsa il pronostico si rifà la mattina, con la ferratura dichiarata. Tocca una corsa per i partenti.
            </p>
          )}
          <div className="cal-filtri">
            <div className="cal-chips" role="group" aria-label="Giorno">
              <button className={`chip-filtro${giorno === "tutti" ? " attivo" : ""}`} onClick={() => setGiorno("tutti")}>Tutti i giorni</button>
              {giorni.map(g => (
                <button key={g} className={`chip-filtro${giorno === g ? " attivo" : ""}`} onClick={() => setGiorno(g)}>{nomeGiorno(g)}</button>
              ))}
            </div>
            <div className="cal-chips" role="group" aria-label="Ippodromo">
              <button className={`chip-filtro${pista === "tutte" ? " attivo" : ""}`} onClick={() => setPista("tutte")}>Tutti gli ippodromi</button>
              {piste.map(t => (
                <button key={t} className={`chip-filtro${pista === t ? " attivo" : ""}`} onClick={() => setPista(t)}
                  style={pista === t ? { borderColor: colorePista(t), color: colorePista(t) } : undefined}>{nomePistaCal(t)}</button>
              ))}
            </div>
            {seguiti.length > 0 && (
              <button className={`chip-filtro${soloMiei ? " attivo" : ""}`} onClick={() => setSoloMiei(!soloMiei)} data-testid="solo-miei"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start" }}>
                <Star size={12} fill={soloMiei ? "hsl(51 85% 58%)" : "none"} color="hsl(51 85% 58%)" />
                Solo i miei cavalli ({corseConMiei} {corseConMiei === 1 ? "corsa" : "corse"})
              </button>
            )}
          </div>

          {gruppi.length === 0 && <div className="pannello" style={{ padding: 20, color: "hsl(210 8% 55%)", fontSize: 13 }}>Nessuna corsa con questi filtri.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {gruppi.map(g => (
              <section key={g.data}>
                <h2 className="cal-giorno">{nomeGiornoLungo(g.data)}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {g.riunioni.map(ri => {
                    const kr = `${g.data}|${ri.track}`;
                    const chiusa = chiuse.has(kr);
                    const colP = colorePista(ri.track);
                    return (
                      <div key={kr} className="cal-riunione" style={{ ["--cp" as any]: colP }}>
                        <button className="cal-riunione-testa" onClick={() => setChiuse(c => { const n = new Set(c); n.has(kr) ? n.delete(kr) : n.add(kr); return n; })} aria-expanded={!chiusa}>
                          <MapPin size={15} color={colP} />
                          <b style={{ color: colP }}>{nomePistaCal(ri.track)}</b>
                          <span>{ri.corse.length} {ri.corse.length === 1 ? "corsa" : "corse"} · dalle {formatTime(ri.corse[0].race_time)}</span>
                          {ri.miei > 0 && <span className="cal-miei"><Star size={11} fill="hsl(51 85% 58%)" color="hsl(51 85% 58%)" /> {ri.miei}</span>}
                          <ChevronDown size={16} style={{ marginLeft: "auto", color: "hsl(210 8% 45%)", transform: chiusa ? "rotate(-90deg)" : "none", transition: "transform .2s" }} />
                        </button>
                        {!chiusa && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 0 4px" }}>
                            {ri.corse.map(race => {
                              const key = raceKey(race);
                              const expanded = expandedRace === key;
                              const top3 = race.entries.slice(0, 3);
                              const num = numeroCorsa.get(key);
                              const dist = distanzaCorsa(race);
                              const miei = race.entries.filter(e => segue(e.horse_name, e.birth_year)).length;
                              return (
                                <div key={key} className="pannello cal-corsa" style={{ overflow: "hidden", ["--colore-pannello" as any]: colP }}>
                                  <div className="cal-corsa-testa" onClick={() => setExpandedRace(expanded ? null : key)} role="button" aria-expanded={expanded}>
                                    <div className="cal-corsa-dati">
                                      <span className="cal-num" style={{ color: colP, borderColor: colorePistaTenue(ri.track, 0.45), background: colorePistaTenue(ri.track, 0.1) }}>
                                        {num ? `Corsa ${num}` : "Corsa"}
                                      </span>
                                      <span className="tabular cal-ora"><Clock size={12} /> {formatTime(race.race_time)}</span>
                                      {dist && <span className="tabular">{dist.toLocaleString("it-IT")} m</span>}
                                      <span>{race.n_runners} partenti</span>
                                      {miei > 0 && <span className="cal-miei"><Star size={11} fill="hsl(51 85% 58%)" color="hsl(51 85% 58%)" /> {miei === 1 ? "un tuo cavallo" : `${miei} tuoi cavalli`}</span>}
                                      {/* 25/11/2026: un <a> dentro <Link> diventava un link doppio; il clic, fermato per non
                                          aprire la corsa, non arrivava a wouter e il browser andava a /simulatore senza il #:
                                          si finiva sulla pagina iniziale. Ora e' un link semplice con il #. */}
                                      <a href={`#/simulatore?tipo=prossima&pista=${encodeURIComponent(race.track)}&data=${race.race_date}&ora=${encodeURIComponent(race.race_time)}`}
                                        onClick={e => e.stopPropagation()} className="cal-simula" data-testid="simula">▶ Simula</a>
                                      <ChevronDown size={17} style={{ marginLeft: "auto", color: "hsl(210 8% 45%)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                                    </div>
                                    {top3.length >= 3 && race.n_runners > 3 && (
                                      <div className="cal-favoriti">
                                        <span className="cal-fav-etich">favoriti</span>
                                        {top3.map((e, idx) => (
                                          <span key={idx} className="cal-fav">
                                            <b style={{ color: idx === 0 ? "hsl(210 10% 92%)" : "hsl(210 10% 80%)" }}>{e.horse_name}</b>
                                            {e.grade && <GradeBadge grade={e.grade} size="sm" />}
                                            {(e.top3 || !data.pronostico) && <span className="tabular" style={{ color: "hsl(183 60% 58%)", fontWeight: 700 }}>{stima(e).toFixed(0)}%</span>}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {expanded && (
                                    <div style={{ borderTop: "1px solid hsl(220 10% 16%)" }}>
                                      {data.galoppo?.supera && (
                                        <div className="nota-galoppo">
                                          <span className="chip-galoppo medio" aria-hidden>galoppo</span>
                                          Sotto ogni cavallo, la probabilità che venga squalificato per galoppo. Dove diceva «alto» ha rotto {conArticolo(Math.round((data.galoppo.fasce.alto?.vera ?? 0) * 100))} dei cavalli,
                                          dove diceva «basso» {conArticolo(Math.round((data.galoppo.fasce.basso?.vera ?? 0) * 100))}.
                                        </div>
                                      )}
                                      {data.pronostico && race.n_runners <= 3 && (
                                        <div style={{ padding: "8px 16px", fontSize: "12px", color: "hsl(210 8% 55%)" }}>
                                          Con {race.n_runners} partenti arrivano tutti nei primi tre, se finiscono la corsa: qui la stima non serve.
                                        </div>
                                      )}
                                      <div style={{ padding: "6px 8px 8px" }}>
                                        {race.entries.map((entry, idx) => {
                                          const podio = idx < 3;
                                          const p = entry.top3 ? entry.top3.prob : data.pronostico ? null : entry.win_estimate;
                                          const mio = segue(entry.horse_name, entry.birth_year);
                                          return (
                                            <div key={`${entry.horse_name}-${idx}`} className={`cal-riga${podio ? " podio" : ""}${mio ? " mio" : ""}`}>
                                              <span className="tabular cal-pos">{idx + 1}</span>
                                              <div style={{ minWidth: 0 }}>
                                                <div className="cal-nome">
                                                  <Link href={`/horse/${encodeURIComponent(entry.horse_name)}/${entry.birth_year || 0}`}>
                                                    <a><BandieraCavallo nome={entry.horse_name} paese={entry.country} solo_estero /> {entry.horse_name}</a>
                                                  </Link>
                                                  {entry.grade ? <GradeBadge grade={entry.grade} size="sm" /> : null}
                                                  <StellinaSegui nome={entry.horse_name} anno={entry.birth_year} piccola />
                                                </div>
                                                <div className="cal-meta">
                                                  {entry.start_pos != null && <span>n. {entry.start_pos}</span>}
                                                  {entry.driver && <span>{entry.driver.replace(/\s*-\d+-\s*$/, "")}</span>}
                                                  {entry.birth_year && <span>{new Date().getFullYear() - entry.birth_year} anni</span>}
                                                  {entry.sire && <span>da {entry.sire}</span>}
                                                  {entry.career_races != null && <span>{entry.career_races === 0 ? "debutto" : `${entry.career_races} ${entry.career_races === 1 ? "corsa" : "corse"}`}{entry.win_rate ? `, ${entry.win_rate.toFixed(0)}% vinte` : ""}</span>}
                                                  {entry.km_previsto != null && (
                                                    <span title="Tempo al km previsto da XGBoost per questa corsa: errore medio in prova 0,94 secondi" style={entry.piu_veloce ? { color: "hsl(45 90% 62%)", fontWeight: 700 } : undefined}>
                                                      km previsto {kmTesto(entry.km_previsto)}{entry.piu_veloce ? " · il più veloce" : ""}
                                                    </span>
                                                  )}
                                                </div>
                                                {entry.galoppo && <ChipGaloppo g={entry.galoppo} />}
                                                {entry.top3 && entry.top3.motivi.length > 0 && (
                                                  <div className="motivi-pronostico">
                                                    {entry.top3.motivi.map((m, k) => (
                                                      <span key={k} className={m.pro ? "motivo pro" : "motivo contro"}>{m.pro ? "+" : "−"} {m.testo}</span>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                              <div className="cal-prob">
                                                <span className="tabular" style={{ color: podio ? "hsl(210 10% 94%)" : "hsl(183 60% 58%)" }}>
                                                  {p != null ? `${p.toFixed(0)}%` : race.n_runners <= 3 ? "" : "—"}
                                                </span>
                                                <span className="cal-barra"><i style={{ width: `${Math.min(100, p ?? 0)}%` }} /></span>
                                                {entry.top3?.vince != null && <span className="tabular" style={{ fontSize: 11, color: "hsl(210 8% 58%)" }} title="Probabilità di vincere (modello XGBoost per la vittoria)">vince {entry.top3.vince.toFixed(0)}%</span>}
                                                {data.pronostico && entry.top3 && !entry.top3.affidabile && <small title={`Solo ${entry.top3.n_corse} corse in archivio: la stima è debole`}>poche corse</small>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {data.pronostico && race.n_runners > 3 && (
                                        <DettaglioPronostico track={race.track} date={race.race_date} time={race.race_time} />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {scheda === "prossime" && data?.pronostico && <VerificaPronostico />}

      {/* Disclaimer */}
      {scheda === "prossime" && data && data.races.length > 0 && (
        <div className="pannello" style={{
          marginTop: "20px", padding: "14px 18px" }}>
          <Spiegazione titolo="Come è fatto il conto e cosa non dice" compatta>
            {data.pronostico
              ? "La percentuale è la probabilità di arrivare nei primi tre, stimata da un modello di apprendimento automatico (XGBoost) con quello che si sa prima della partenza: forma recente, premi, tempi, guidatore dichiarato per la corsa, numero di partenza e confronto con gli avversari. In ogni corsa le percentuali sommano a tre, perché i posti sono tre. È una lettura statistica, non un consiglio di scommessa: non conosciamo le quote né lo stato del cavallo il giorno della gara."
              : "Le probabilità di vittoria sono stime indicative basate sul punteggio StatIppica e non tengono conto di fattori come partenza, condizioni di pista, stato di forma recente e strategie di gara. Non costituiscono consiglio di scommessa."}
          </Spiegazione>
        </div>
      )}
    </div>
  );
}

/** Rischio di galoppo: piccola etichetta colorata sotto il nome del cavallo. */
function ChipGaloppo({ g }: { g: NonNullable<CalendarEntry["galoppo"]> }) {
  const titolo = g.n_corse
    ? `Ha rotto ${g.rotture} volte su ${g.n_corse} corse in archivio`
    : "Debutto: nessuna corsa in archivio, la stima è più incerta";
  return (
    <div style={{ marginTop: 4 }}>
      <span className={`chip-galoppo ${g.fascia}`} title={titolo}>
        galoppo {g.prob.toFixed(0)}% · {g.fascia}
      </span>
    </div>
  );
}

const CSS_CALENDARIO = `
.cal-filtri { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.cal-chips { display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.cal-chips .chip-filtro { flex-shrink: 0; }
.cal-giorno { font-size: 16px; font-weight: 800; color: hsl(210 10% 92%); margin: 0 0 8px; }
.cal-riunione { border-left: 3px solid var(--cp); padding-left: 10px; }
.cal-riunione-testa { all: unset; cursor: pointer; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 2px 10px; font-size: 13px; color: hsl(210 8% 58%); }
.cal-riunione-testa b { font-size: 15px; }
.cal-miei { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 700; color: hsl(51 85% 62%); }
.cal-corsa-testa { padding: 12px 14px; cursor: pointer; display: grid; gap: 8px; }
.cal-corsa-testa:hover { background: hsl(220 10% 13%); }
.cal-corsa-dati { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; font-size: 12.5px; color: hsl(210 8% 58%); }
.cal-num { font-size: 12px; font-weight: 800; border: 1px solid; border-radius: 7px; padding: 2px 8px; }
.cal-ora { display: inline-flex; align-items: center; gap: 4px; color: hsl(210 10% 85%); font-weight: 700; }
.cal-simula { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; color: hsl(220 15% 8%); background: hsl(355 70% 62%);
  border-radius: 8px; padding: 4px 10px; text-decoration: none; }
.cal-favoriti { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; font-size: 12px; }
.cal-fav-etich { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: hsl(210 8% 45%); }
.cal-fav { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.cal-fav b { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
.cal-riga { display: grid; grid-template-columns: 24px minmax(0, 1fr) 86px; gap: 10px; align-items: start; padding: 9px 10px; border-radius: 9px; }
.cal-riga.podio { background: hsl(220 14% 12%); }
.cal-riga.mio { box-shadow: inset 3px 0 0 hsl(51 85% 58%); }
.cal-pos { font-size: 13px; font-weight: 800; color: hsl(210 8% 50%); text-align: center; padding-top: 1px; }
.cal-riga.podio .cal-pos { color: hsl(210 10% 90%); }
.cal-nome { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.cal-nome a { font-size: 13.5px; font-weight: 700; color: hsl(210 10% 90%); text-decoration: none; overflow-wrap: anywhere; }
.cal-meta { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11.5px; color: hsl(210 8% 50%); margin-top: 3px; }
.cal-prob { display: grid; justify-items: end; gap: 4px; }
.cal-prob > span:first-child { font-size: 16px; font-weight: 800; }
.cal-prob small { font-size: 10px; color: hsl(40 70% 55%); }
.cal-barra { width: 100%; height: 6px; background: hsl(220 12% 8%); border-radius: 4px; overflow: hidden; display: block; }
.cal-barra i { display: block; height: 100%; background: hsl(183 60% 48%); border-radius: 4px; }
@media (max-width: 520px) { .cal-riga { grid-template-columns: 20px minmax(0, 1fr) 62px; gap: 8px; padding: 8px 6px; } .cal-fav b { max-width: 120px; } }
`;

/** "il 37%", "l'8%", "l'11%": l'articolo giusto davanti a una percentuale. */
function conArticolo(n: number) {
  const elide = n === 8 || n === 11 || (n >= 80 && n < 90) || n === 1;
  return `${elide ? "l'" : "il "}${n}%`;
}
