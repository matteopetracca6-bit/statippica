import AltreProve, { type AltraProva } from "@/components/AltreProve";
import { useEffect, useState } from "react";
import RottureGaloppo from "@/components/RottureGaloppo";
import BandieraCavallo, { paeseCavallo } from "../components/BandieraCavallo";
import { PareggioCavallo } from "../components/PareggioScheda";
import PrevisioniCavallo from "../components/PrevisioniCavallo";
import VendereOCorrere from "../components/VendereOCorrere";
import AggiungiScuderia from "../components/AggiungiScuderia";
import SezioneScheda, { ListaCorta } from "../components/SezioneScheda";
import MantoSesso from "../components/MantoSesso";
import { useRoute, useLocation, Link } from "wouter";
import { LinkPista, LinkGuidatore, LinkAllenatore, LinkProprietario } from "../components/Collegamenti";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { COLORE_VOTO, COLORE_SCHEDA_VOTO, classeVoto } from "@/lib/coloreVoto";
import RadarCavallo from "@/components/RadarCavallo";
import LineaMaterna from "../components/LineaMaterna";
import GradeBadge from "../components/GradeBadge";
import HorseSearchBar from "../components/HorseSearchBar";
import { CoppaGara } from "@/components/CoppaGara";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Trophy, Clock, Flag, Coins, MapPin, Heart, Medal, Timer, KeyRound, GitCompare } from "lucide-react";
import IntestazioneScheda from "../components/IntestazioneScheda";
import { Cifra } from "../components/DueColonne";
import { palmares, nomeGara, GARE_GP, type VittoriaGP } from "@/data/granPremi";

// Cavalli con un cuoricino viola accanto al nome. CHICCA ROSS e' stata il
// cavallo di riferimento su cui e' stato provato il voto.
const CUORI: Record<string, string> = {
  "CHICCA ROSS": "Il cavallo di riferimento: è stata il benchmark",
};
import { formatRecord, tempoKm } from "@/lib/record";
import InbreedingPanel from "../components/InbreedingPanel";
import { DistanzaCavallo, EtichettaProfilo, kmTesto, kmSotto, type Distanza } from "../components/DistanzaCavallo";
import ValoreResiduo, { type ValoreCarriera } from "../components/ValoreResiduo";
import CurvaVoto, { curvaPronta } from "../components/CurvaVoto";
import { AlberoPedigreeCavallo } from "../components/AlberoPedigree";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { Spiegazione } from "../components/Spiegazione";
import NomePista from "../components/NomePista";
import { nomePista } from "@/lib/piste";

interface HorseData {
  name: string;
  birth_year: number;
  sex: string;
  coat_color?: string | null;
  country: string;
  sire: string;
  dam: string;
  career_races: number;
  career_wins: number;
  career_places: number;
  career_top3?: number | null;
  career_earnings: number;
  record_career: string;
  record_short: string;
  record_long: string;
  grade: string;
  score: number;
  earn_percentile: number;
  time_percentile: number;
  stagioni_corse?: number | null;
  stagioni_possibili?: number | null;
  tenuta_percentile?: number | null;
  integrita_percentile?: number | null;
  gare_italia?: number | null;
  gare_estero?: number | null;
  vitt_italia?: number | null;
  vitt_estero?: number | null;
  guad_italia?: number | null;
  guad_estero?: number | null;
  grade_annata?: string | null;
  pos_annata?: number | null;
  tot_annata?: number | null;
  affidabilita_voto?: {
    disponibile: boolean;
    motivo?: string;
    livello?: "provvisorio" | "in_via_di_conferma" | "consolidato";
    frase?: string;
    resta?: number;
    sale?: number;
    scende?: number;
    n?: number;
    eta_usata?: number;
  } | null;
  qualifica?: {
    data: string; pista: string | null; tempo: string | null; tempo_scartato?: string | null; allenatore: string | null;
    eta: number; prove: number; estero?: boolean; tardiva?: boolean; altre?: AltraProva[]; posizione_annata: number | null; cavalli_annata: number | null;
  } | null;
  voto_previsto?: {
    eta: number; voto_coetanei: string; voto_previsto: string; voto_basso: string; voto_alto: string;
    calcolato_il: string;
    prova: { cavalli: number; giusta_modello: number; giusta_attuale: number; accanto_modello: number;
             accanto_attuale: number; copertura: number; periodo: string };
  } | null;
  sire_percentile: number;
  rating_mode: string;
  win_rate: number;
  races: Race[];
  siblings: Sibling[];
  anno_ultima_gara?: number | null;
  in_attivita?: boolean;
  valore_carriera?: ValoreCarriera | null;
  pedigree: {
    sire: string | null;
    dam: string | null;
    sire_sire: string | null;
    sire_dam: string | null;
    dam_sire: string | null;
    dam_dam: string | null;
  } | null;
}

interface Race {
  race_date: string;
  track: string;
  placement: number;
  placement_raw: string;
  time_km: number;
  distance: number;
  driver: string;
  prize_net: number;
  prize_gross: number;
  race_code: string;
}

interface Sibling {
  name: string;
  birth_year: number;
  grade: string;
  score: number;
  career_earnings: number;
}

interface Neighbors {
  prev: { name: string; birth_year: number; grade: string; score: number } | null;
  next: { name: string; birth_year: number; grade: string; score: number } | null;
}

interface HorseStats {
  yearlyStats: { year: string; races: number; wins: number; places: number; earnings: number; best_time: number; avg_time: number }[];
  bestRaces: Race[];
  trackStats: { track: string; races: number; wins: number; places: number; earnings: number }[];
}

// Da computer i riquadri si stringono (index.css, "Scheda del cavallo su due colonne").
const panelStyle: React.CSSProperties = {
  padding: "var(--pad-pannello, 20px 22px)",
  marginBottom: "var(--spazio-pannello, 22px)",
};

const panelTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "hsl(210 8% 50%)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "14px",
};

/** Chi ha allenato il cavallo nel tempo (dal 2016), con il rendimento con ciascuno. */
/* La prova di qualifica: il primo tempo ufficiale, prima del debutto.
   Chi si qualifica a 2 anni arriva in media a un voto molto piu' alto di chi
   si qualifica a 4 (vedi la pagina Qualifiche), percio' l'eta' sta in evidenza. */
function QualificaCavallo({ q }: { q: HorseData["qualifica"] }) {
  if (!q) return null;
  const data = q.data?.length === 10 ? `${q.data.slice(8, 10)}/${q.data.slice(5, 7)}/${q.data.slice(0, 4)}` : q.data;
  const cella = (titolo: string, valore: React.ReactNode, colore?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{titolo}</div>
      <div className="tabular" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.15, color: colore ?? "hsl(210 10% 92%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valore}</div>
    </div>
  );
  return (
    <div id="sez-qualifica" className="sotto-sezione" data-testid="qualifica-cavallo">
      <div style={{ ...panelTitle, display: "flex", alignItems: "center", gap: 8 }}>
        <Timer size={14} className="icona-voto" /> Qualifica
        <Link href="/qualifiche"><a style={{ marginLeft: "auto", fontSize: 11.5, textTransform: "none", letterSpacing: 0, color: "hsl(183 70% 60%)", textDecoration: "none", fontWeight: 500 }}>Tutte le qualifiche</a></Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 14 }}>
        {cella("Data", data)}
        {cella("A che età", `${q.eta} ${q.eta === 1 ? "anno" : "anni"}`, q.eta <= 2 ? "hsl(150 60% 55%)" : undefined)}
        {cella("Tempo al km", q.tempo ? formatRecord(q.tempo) : "—", "hsl(183 70% 60%)")}
        {cella("Ippodromo", q.pista ? <NomePista pista={q.pista} colorato testo={nomePista(q.pista).charAt(0) + nomePista(q.pista).slice(1).toLowerCase()} /> : "—")}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
        {q.posizione_annata && q.cavalli_annata
          ? <>Tempo {q.posizione_annata.toLocaleString("it-IT")}° su {q.cavalli_annata.toLocaleString("it-IT")} della sua annata.</>
          : null}
        {q.tempo_scartato ? <> La fonte scrive «{q.tempo_scartato}»: per una qualifica non è un tempo credibile (quasi tutte stanno fra 1.14 e 1.24 al km), quindi non lo usiamo.</> : null}
        {q.allenatore ? <> Allenatore alla prova: {q.allenatore}.</> : null}
        {q.estero ? <> La fonte ha solo tempi fatti all'estero: non si confrontano con le qualifiche italiane.</> : null}
        {q.tardiva ? <> La fonte ha solo prove fatte da adulto (riqualifiche dopo una sosta): non si confrontano con le qualifiche dei puledri.</> : null}
        {(q.altre?.length ?? 0) > 0 ? <> Qui conta la {q.estero || q.tardiva ? "prima prova" : "prima qualifica fatta in Italia da giovane"}; la fonte ha anche {q.altre!.length === 1 ? "un'altra prova" : `altre ${q.altre!.length} prove`}, che non entrano nei confronti:</> : null}
      </div>
      {(q.altre?.length ?? 0) > 0 && <div style={{ marginTop: 8 }}><AltreProve altre={q.altre!} colore="hsl(183 70% 60%)" /></div>}
    </div>
  );
}

function AllenatoriCavallo({ nome }: { nome: string }) {
  const { data } = useQuery<{ disponibile: boolean; periodi: any[] }>({
    queryKey: ["/api/horse-trainers", nome],
    queryFn: () => apiRequest("GET", `/api/horse-trainers/${encodeURIComponent(nome)}`).then(r => r.json()),
    staleTime: 10 * 60_000,
  });
  const periodi = data?.periodi ?? [];
  if (!periodi.length) return null;
  const anno = (d: string) => d.slice(0, 4);
  const mese = (d: string) => new Date(d).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
  const attuale = periodi[periodi.length - 1];
  return (
    // Prende il colore del voto del cavallo, come gli altri riquadri della scheda.
    <div className="pannello" style={panelStyle}>
      <div style={{ ...panelTitle, display: "flex", alignItems: "center", gap: "8px" }}>
        <Timer size={15} className="icona-voto" />
        {periodi.length === 1 ? "Allenatore" : `Allenatori · ${new Set(periodi.map(p => p.allenatore)).size} dal ${anno(periodi[0].dal)}`}
      </div>
      <div className="allenatori-cavallo">
        {[...periodi].reverse().map((p, i) => (
          <div key={i} className={"periodo" + (p === attuale ? " attuale" : "")}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "hsl(210 10% 90%)" }}>
                {p.nome ? <LinkAllenatore chiave={p.allenatore} nome={p.nome} />
                  : p.allenatore.toLowerCase().replace(/(^|[\s'-])\S/g, (c: string) => c.toUpperCase())}
                {p === attuale && <span className="etichetta-attuale">ultimo</span>}
              </div>
              <div style={{ fontSize: "11.5px", color: "hsl(210 8% 52%)" }}>
                {p.dal === p.al ? mese(p.dal) : `${mese(p.dal)} – ${mese(p.al)}`}
              </div>
            </div>
            <div className="tabular numeri">
              <span>{p.n_corse} {p.n_corse === 1 ? "corsa" : "corse"}</span>
              <span style={{ color: "hsl(100 50% 60%)" }}>{p.vittorie} v.</span>
              <span>{Math.round(100 * p.primi_tre / p.n_corse)}% primi tre</span>
              <span style={{ color: "hsl(45 80% 62%)" }}>€{p.premi.toLocaleString("it-IT")}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", marginTop: "8px" }}>
        Dai risultati ufficiali, che riportano l'allenatore dal 2016.
      </div>
    </div>
  );
}

/** I proprietari del cavallo nel tempo, come gli allenatori qui sopra. */
function ProprietariCavallo({ nome }: { nome: string }) {
  const { data } = useQuery<{ disponibile: boolean; periodi: any[] }>({
    queryKey: ["/api/horse-owners", nome],
    queryFn: () => apiRequest("GET", `/api/horse-owners/${encodeURIComponent(nome)}`).then(r => r.json()),
    staleTime: 10 * 60_000,
  });
  const periodi = data?.periodi ?? [];
  if (!periodi.length) return null;
  const anno = (d: string) => d.slice(0, 4);
  const mese = (d: string) => new Date(d).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
  const attuale = periodi[periodi.length - 1];
  const bello = (t: string) => t.toLowerCase().replace(/(^|[\s'-])\S/g, (c: string) => c.toUpperCase());
  return (
    <div className="pannello" style={{ ...panelStyle, marginTop: "16px" }} data-testid="proprietari-cavallo">
      <div style={{ ...panelTitle, display: "flex", alignItems: "center", gap: "8px" }}>
        <KeyRound size={15} className="icona-voto" />
        {periodi.length === 1 ? "Proprietario" : `Proprietari · ${new Set(periodi.map(p => p.proprietario)).size} dal ${anno(periodi[0].dal)}`}
      </div>
      <div className="allenatori-cavallo">
        {[...periodi].reverse().map((p, i) => (
          <div key={i} className={"periodo" + (p === attuale ? " attuale" : "")}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "hsl(210 10% 90%)" }}>
                {p.nome ? <LinkProprietario chiave={p.proprietario} nome={p.nome} /> : bello(p.proprietario)}
                {p === attuale && <span className="etichetta-attuale">ultimo</span>}
              </div>
              <div style={{ fontSize: "11.5px", color: "hsl(210 8% 52%)" }}>
                {p.dal === p.al ? mese(p.dal) : `${mese(p.dal)} – ${mese(p.al)}`}
              </div>
            </div>
            <div className="tabular numeri">
              <span>{p.n_corse} {p.n_corse === 1 ? "corsa" : "corse"}</span>
              <span style={{ color: "hsl(100 50% 60%)" }}>{p.vittorie} v.</span>
              <span style={{ color: "hsl(45 80% 62%)" }}>€{p.premi.toLocaleString("it-IT")}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)", marginTop: "8px" }}>
        Dai risultati ufficiali, che riportano il proprietario dal 2016.
      </div>
    </div>
  );
}

/** Le vittorie del cavallo nei Gran Premi, raggruppate per corsa. */
function Palmares({ nome, anno }: { nome: string; anno: number }) {
  const vittorie = palmares(nome, anno);
  if (!vittorie.length) return null;
  const perGara = new Map<string, VittoriaGP[]>();
  for (const v of vittorie) perGara.set(v.gara, [...(perGara.get(v.gara) ?? []), v]);
  const ordine = GARE_GP.map(g => g.id).filter(id => perGara.has(id))
    .sort((a, b) => perGara.get(b)!.length - perGara.get(a)!.length || perGara.get(a)![0].anno - perGara.get(b)![0].anno);
  return (
    <div className="pannello" style={panelStyle}>
      <div style={{ ...panelTitle, display: "flex", alignItems: "center", gap: "8px" }}>
        <Medal size={15} color="hsl(45 90% 60%)" />
        Palmares · {vittorie.length} {vittorie.length === 1 ? "Gran Premio vinto" : "Gran Premi vinti"}
      </div>
      <div className="palmares-lista">
        {ordine.map(id => {
          const vs = perGara.get(id)!;
          return (
            <a key={id} href={`#/gran-premi?gara=${id}`} className="palmares-voce collegamento-scheda">
              <span className="coppa-gp piccola"><CoppaGara gara={id} size={24} /></span>
              <span style={{ fontWeight: 700, color: "hsl(210 10% 92%)" }}>{nomeGara(id)}</span>
              {vs.length > 1 && <span style={{ fontSize: "12px", color: "hsl(45 90% 66%)", fontWeight: 700 }}>×{vs.length}</span>}
              <span className="anni">
                {vs.map(v => (
                  <span key={v.anno + (v.divisione ?? "")} className="anno"
                        title={[v.data ? v.data.split("-").reverse().join("/") : null, v.pista, v.driver, v.tempo].filter(Boolean).join(" · ")}>
                    {v.anno}
                  </span>
                ))}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}


function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="pannello" style={{
      padding: "14px 16px" }}>
      <div className="tabular" style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 90%)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="tabular" style={{ fontSize: "11px", color: "hsl(183 80% 55%)", marginTop: "2px" }}>{sub}</div>}
      <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

function PercentileBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 90 ? "hsl(51 100% 55%)" : pct >= 70 ? "hsl(183 100% 45%)" : pct >= 40 ? "hsl(100 50% 50%)" : "hsl(25 55% 50%)";
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px", color: "hsl(210 8% 55%)" }}>{label}</span>
        <span className="tabular" style={{ fontSize: "12px", fontWeight: 600, color }}>{pct.toFixed(1)}°</span>
      </div>
      <div style={{ height: "6px", background: "hsl(220 10% 18%)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}


function NavArrow({ direction, neighbor, onClick }: {
  direction: "prev" | "next";
  neighbor: { name: string; birth_year: number; grade: string; score: number } | null;
  onClick: (name: string, year: number) => void;
}) {
  if (!neighbor) return <div style={{ flex: 1 }} />;
  const isNext = direction === "next";
  return (
    <button
      onClick={() => onClick(neighbor.name, neighbor.birth_year)}
      className="pannello pannello-cliccabile" style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        cursor: "pointer",
        flex: 1,
        maxWidth: "240px",
        justifyContent: isNext ? "flex-end" : "flex-start",
        transition: "background 0.15s, border-color 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(220 12% 16%)"; e.currentTarget.style.borderColor = "hsl(183 40% 30%)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "hsl(220 12% 12%)"; e.currentTarget.style.borderColor = "hsl(220 10% 18%)"; }}
    >
      {!isNext && <ChevronLeft size={18} style={{ color: "hsl(210 8% 45%)", flexShrink: 0 }} />}
      <div style={{ textAlign: isNext ? "right" : "left", overflow: "hidden" }}>
        <div style={{ fontSize: "10px", color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {isNext ? "Voto più alto" : "Voto più basso"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: isNext ? "flex-end" : "flex-start" }}>
          <GradeBadge grade={neighbor.grade} size="sm" />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 75%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {neighbor.name}
          </span>
          <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 45%)", flexShrink: 0 }}>{neighbor.score?.toFixed(1).replace(".", ",")}</span>
        </div>
      </div>
      {isNext && <ChevronRight size={18} style={{ color: "hsl(210 8% 45%)", flexShrink: 0 }} />}
    </button>
  );
}


// Lingue di Wikipedia, per dire da dove viene il dato.
const LINGUA_WIKI: Record<string, string> = { fr: "francese", sv: "svedese", en: "inglese", it: "italiana" };

function soldiMondo(g: { importo: number; valuta: string } | null | undefined) {
  if (!g) return "—";
  const n = g.importo.toLocaleString("it-IT");
  if (g.valuta === "EUR") return `€${n}`;
  if (g.valuta === "USD") return `$${n}`;
  if (g.valuta === "SEK") return `${n} kr`;
  return `${n} ${g.valuta}`;
}

/* I totali dei cavalli storici vengono dall'anagrafe italiana, che conta solo
   le corse in Italia. Per i grandi campioni che hanno corso anche all'estero
   si mostra accanto la carriera intera, presa da Wikipedia con la fonte. */
function CarrieraMondo({ italia, mondo }: { italia: any; mondo: any }) {
  if (!mondo) {
    return (
      <div className="carriera-mondo vuota">
        I numeri qui sopra contano solo le corse in Italia: le corse all&apos;estero non sono nell&apos;archivio.
      </div>
    );
  }
  const uguale = mondo.corse === italia.career_races && mondo.vittorie === italia.career_wins;
  const pct = mondo.corse ? Math.round((mondo.vittorie / mondo.corse) * 1000) / 10 : null;
  return (
    <div className="carriera-mondo">
      <div className="cm-titolo">
        {uguale ? "Carriera nel mondo: coincide con quella in Italia" : "In tutto il mondo, estero compreso"}
        <span className="cm-nota">I numeri sopra contano solo le corse in Italia</span>
      </div>
      {!uguale && (
        <div className="cm-dati">
          <div><b>{mondo.corse}</b> corse</div>
          <div><b>{mondo.vittorie}</b> vittorie{pct != null && <span className="cm-sotto"> ({pct.toLocaleString("it-IT")}%)</span>}</div>
          <div><b style={{ color: "hsl(51 90% 62%)" }}>{soldiMondo(mondo.guadagni)}</b> {mondo.guadagni?.valuta === "SEK" ? "(corone svedesi)" : mondo.guadagni?.valuta === "USD" ? "(dollari)" : ""}</div>
          {mondo.record && <div>record <b>{mondo.record}</b></div>}
        </div>
      )}
      <div className="cm-fonte">
        Fonte:{" "}
        {mondo.fonti.map((f: any, i: number) => (
          <span key={f.url}>{i > 0 && ", "}<a href={f.url} target="_blank" rel="noreferrer">Wikipedia {LINGUA_WIKI[f.wiki] ?? f.wiki}</a></span>
        ))}
        {mondo.altre_corse && <> · altre fonti contano {mondo.altre_corse.join(" o ")} corse</>}
      </div>
    </div>
  );
}

/* I soldi in una riga: quanto ha vinto e, se la stima c'e', quanto si
   pensa possa vincere ancora. Usata nel riepilogo e come riassunto della
   sezione Economia. */
function RigaSoldi({ horse, breve = false }: { horse: HorseData; breve?: boolean }) {
  const e = (v: number) => "€" + Math.round(v).toLocaleString("it-IT");
  const v = horse.valore_carriera;
  const stima = v && v.disponibile && v.residuo_personalizzato > 0 ? v.residuo_personalizzato : null;
  const vinto = horse.career_earnings ?? 0;
  if (breve) {
    return <>{vinto > 0 ? `Ha vinto ${e(vinto)}` : "Non ha ancora vinto premi"}{stima != null ? ` · si stima ancora ${e(stima)}` : ""} · previsioni, pareggio</>;
  }
  return (
    <div className="in-breve-soldi">
      <div><span className="tabular grande" style={{ color: "hsl(51 90% 62%)" }}>{e(vinto)}</span><span className="sotto">vinti in carriera</span></div>
      {stima != null && (
        <div><span className="tabular grande" style={{ color: "hsl(183 70% 60%)" }}>{e(stima)}</span><span className="sotto">si stima possa vincere ancora (stima)</span></div>
      )}
      {v && v.disponibile && v.titolo && <div className="sotto">{v.titolo}</div>}
    </div>
  );
}

export default function HorsePage() {
  const [match, params] = useRoute("/horse/:name/:year");
  const [, navigate] = useLocation();
  // Sul telefono la testata mostra 4 cifre; le altre con "Mostra tutte".
  const [tutteCifre, setTutteCifre] = useState(false);

  const name = params?.name ? decodeURIComponent(params.name) : "";
  const year = params?.year ?? "0";

  if (year === "0" || !name) {
    return (
      <div style={{ padding: "28px 32px", maxWidth: "600px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "hsl(210 10% 90%)", marginBottom: "20px" }}>Cerca Cavallo</h1>
        <HorseSearchBar placeholder="Nome cavallo..." />
      </div>
    );
  }

  const { data: horse, isLoading, error } = useQuery<HorseData>({
    queryKey: ["/api/horse", name, year],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/horse/${encodeURIComponent(name)}/${year}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!name && year !== "0",
  });

  // Scheda da stallone di un cavallo che corre ancora con la sigla del paese:
  // si passa alla scheda da corsa, che e' quella completa.
  const vaiA = (horse as any)?.redirect as { name: string; birth_year: number } | undefined;
  useEffect(() => {
    if (vaiA) navigate(`/horse/${encodeURIComponent(vaiA.name)}/${vaiA.birth_year}`, { replace: true });
  }, [vaiA?.name, vaiA?.birth_year]);
  // Riproduttore senza gare ne' carriera (stalloni che hanno corso solo
  // all'estero, fattrici senza dati): la scheda sarebbe vuota, si va alla
  // pagina da stallone o da fattrice.
  const paginaRiproduttore = (horse as any)?.vai_a_pagina as string | null | undefined;
  useEffect(() => {
    if (paginaRiproduttore) navigate(paginaRiproduttore, { replace: true });
  }, [paginaRiproduttore]);

  const { data: neighbors } = useQuery<Neighbors>({
    queryKey: ["/api/horse", name, year, "neighbors"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/horse/${encodeURIComponent(name)}/${year}/neighbors`);
      if (!r.ok) return { prev: null, next: null };
      return r.json();
    },
    enabled: !!name && year !== "0",
  });

  const { data: stats } = useQuery<HorseStats>({
    queryKey: ["/api/horse", name, year, "stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/horse/${encodeURIComponent(name)}/${year}/stats`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!name && year !== "0",
  });

  if (isLoading) return (
    <div style={{ padding: "28px 32px" }}>
      {/* 20/11/2026: e' l'attesa piu' lunga del sito, quindi anche qui il
          cavallo al galoppo con le frasi ippiche e la barretta blu. */}
      <CavalloCaricamento label="Apro la scheda del cavallo" />
    </div>
  );

  if (vaiA) return (
    <div style={{ padding: "28px 32px", fontSize: "13px", color: "hsl(210 8% 55%)" }}>Apro la scheda da corsa di {vaiA.name}…</div>
  );

  if (error || !horse) return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: "14px", color: "hsl(0 62% 55%)" }}>Cavallo non trovato.</div>
      <div style={{ marginTop: "20px", maxWidth: "400px" }}><HorseSearchBar /></div>
    </div>
  );

  const SEX_LABEL: Record<string, string> = { M: "Maschio", F: "Femmina", C: "Castrone" };
  // Tre scale diverse, e vanno chiamate per nome: confonderle era il difetto
  // che portava Varenne (46 corse, 41 vittorie, nessuna gara in archivio) a
  // comparire come un grado A qualunque accanto ai cavalli in attivita'.
  const parziale = (horse as any).carriera_parziale as { n: number; dal: string; al: string; premi_stimati: number } | null;
  const MODE_LABEL =
    horse.rating_mode === "performance" ? "Gare"
      : horse.rating_mode === "storico" ? (parziale ? "Storico · carriera parziale" : "Storico")
        : parziale ? "Carriera parziale"
          : "Pedigree";
  const eStorico = horse.rating_mode === "storico";

  const navigateTo = (hName: string, hYear: number) => {
    navigate(`/horse/${encodeURIComponent(hName)}/${hYear}`);
  };
  // Le ultime cinque corse, dalla piu' vecchia alla piu' recente: come sta
  // andando adesso, subito sotto il voto.
  const ultimeCorse = [...(horse.races ?? [])]
    .filter(r => r.race_date)
    .sort((a, b) => b.race_date.localeCompare(a.race_date))
    .slice(0, 5)
    .reverse();

  return (
    // Tutti i riquadri della scheda prendono il colore del voto del cavallo
    // (index.css, "Scheda del cavallo secondo il voto").
    <div className={`page-shell fade-in scheda-voto ${classeVoto(horse.grade)}`}
      style={COLORE_SCHEDA_VOTO[horse.grade ?? ""] ? { ["--colore-pannello" as any]: COLORE_SCHEDA_VOTO[horse.grade ?? ""] } : undefined}>
      {/* Indietro, ricerca e cavalli vicini: da computer stanno su una fascia sola. */}
      <div className="barra-scheda">
      <div style={{ display: "flex", gap: "16px", alignItems: "center", flex: "1 1 420px" }}>
        {/* Come nelle altre schede singole: si torna all'elenco di tutti. */}
        <Link href="/leaderboard" style={{ display: "flex", alignItems: "center", gap: "6px", color: "hsl(210 8% 50%)", fontSize: "13px", textDecoration: "none", flexShrink: 0 }} data-testid="link-tutti-cavalli">
          <ArrowLeft size={16} /> Tutti i cavalli
        </Link>
      </div>

      {/* Prev/Next navigation */}
      {neighbors && (neighbors.prev || neighbors.next) && (
        <div className="navigazione-vicini" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <NavArrow direction="prev" neighbor={neighbors.prev} onClick={navigateTo} />
          <NavArrow direction="next" neighbor={neighbors.next} onClick={navigateTo} />
        </div>
      )}
      </div>

      {/* Intestazione: la stessa delle altre schede singole (cavallo,
          stallone, fattrice, guidatore, allenatore, ippodromo), col colore
          del voto del cavallo. */}
      <style>{`
        .cifra-altre { display: none; }
        @media (max-width: 640px) {
          .scheda-testata[data-tutte="false"] .cifra-extra { display: none; }
          .cifra-altre { display: flex; grid-column: 1 / -1; justify-content: center; }
        }
        .cifra-extra { display: contents; }
      `}</style>
      <div className="scheda-testata" data-tutte={tutteCifre ? "true" : "false"}>
      <IntestazioneScheda
        icona={Trophy} colore={COLORE_VOTO[horse.grade ?? ""] ?? "hsl(51 80% 55%)"}
        tipo={<>Cavallo · {MODE_LABEL}</>}
        titolo={<span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <BandieraCavallo nome={horse.name} paese={horse.country} />
          {horse.name}
          {CUORI[horse.name.toUpperCase()] && (
            <span title={CUORI[horse.name.toUpperCase()]} aria-label={CUORI[horse.name.toUpperCase()]} role="img"
                  style={{ display: "inline-flex", flexShrink: 0 }}>
              <Heart size={20} fill="hsl(275 75% 62%)" color="hsl(275 75% 62%)" />
            </span>
          )}
        </span>}
        accanto={<GradeBadge grade={horse.grade ?? "N/A"} size="lg" />}
        sotto={<>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{horse.birth_year}</span>
            <span>·</span>
            <span>{SEX_LABEL[horse.sex] ?? horse.sex}</span>
            {(() => { const pc = paeseCavallo(horse.name, horse.country); return pc ? <><span>·</span><span>{pc.nome}</span></> : null; })()}
            {horse.score != null && <><span>·</span><span className="tabular">punti {horse.score.toFixed(1).replace(".", ",")}</span></>}
          </span>
          {horse.pedigree?.sire && (
            <span style={{ display: "block", marginTop: 2 }}>
              {horse.pedigree.sire}{horse.pedigree.dam ? <> × {horse.pedigree.dam}</> : null}
            </span>
          )}
          {(horse as any).stallone && (() => {
            const st = (horse as any).stallone as { nome: string; n_figli: number | null; voto: string | null };
            return (
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <Link href={`/stallion/${encodeURIComponent(st.nome)}`}>
                  <a data-testid="stemma-stallone" title="Vai alla pagina da stallone: figli, voto da stallone e statistiche"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none", borderRadius: 999,
                      padding: "3px 11px", color: "hsl(145 65% 64%)", background: "hsl(145 45% 15%)",
                      border: "1px solid hsl(145 45% 34%)" }}>
                    ♞ Stallone{st.voto ? ` · voto ${st.voto}` : ""}{st.n_figli ? ` · ${st.n_figli} figli` : ""} →
                  </a>
                </Link>
              </span>
            );
          })()}
          {(horse as any).voto_non_comparabile && (
            <span data-testid="nota-voto-estero" style={{ display: "block", marginTop: 6, fontSize: 12.5, lineHeight: 1.45,
              color: "hsl(45 85% 70%)" }}>
              Voto non confrontabile: ha corso soprattutto all'estero, e qui contano solo le corse in Italia
              {(horse.career_races ?? 0) > 0 ? ` (${horse.career_races})` : " (nessuna)"}.
            </span>
          )}
          {(horse as any).come_fattrice && (() => {
            const cf = (horse as any).come_fattrice as { nome: string; n_figli: number; punti: number | null; grado: string | null };
            return (
              <span style={{ display: "block", marginTop: 4 }}>
                <Link href={`/fattrice/${encodeURIComponent(cf.nome)}`}>
                  <a style={{ color: "hsl(320 60% 68%)", textDecoration: "none" }} data-testid="link-pagina-fattrice">
                    È anche fattrice: ha avuto {cf.n_figli} {cf.n_figli === 1 ? "figlio" : "figli"}
                    {cf.punti != null ? <> · voto da fattrice {cf.punti.toFixed(1).replace(".", ",")}{cf.grado ? ` (grado ${cf.grado})` : ""}</> : null}
                    {" "}· vedi la pagina da fattrice →
                  </a>
                </Link>
              </span>
            );
          })()}
          {/* Collegamenti all'economia: la scuderia e, per i giovani, il valore del puledro. */}
          <span style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <AggiungiScuderia voce={{ tipo: "cavallo", nome: horse.name, anno: horse.birth_year }} />
            <Link href={`/compare?a=${encodeURIComponent(`${horse.name}__${horse.birth_year}`)}`} data-testid="link-confronta"
                  title="Apri la Comparazione con questo cavallo già scelto" style={{
                    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", borderRadius: 8, fontWeight: 700,
                    padding: "6px 11px", fontSize: 12.5, textDecoration: "none", border: "1px solid hsl(46 70% 40%)",
                    background: "hsl(46 50% 11%)", color: "hsl(46 95% 62%)" }}>
              <GitCompare size={13} /> Confronta con…
            </Link>
            {!horse.career_races && horse.birth_year >= new Date().getFullYear() - 3 && horse.pedigree?.sire && (
              <Link href={`/puledro?padre=${encodeURIComponent(horse.pedigree.sire)}&madre=${encodeURIComponent(horse.pedigree.dam ?? "")}&nome=${encodeURIComponent(horse.name)}`}
                    style={{ fontSize: "12.5px", color: "hsl(25 75% 62%)" }}>
                Quanto vale questo puledro →
              </Link>
            )}
          </span>
        </>}
        azioni={<>
          {(horse as any).radar && (
            <RadarCavallo punte={(horse as any).radar} colore={COLORE_SCHEDA_VOTO[horse.grade ?? ""] ?? "hsl(183 70% 50%)"} dimensione={235} />
          )}
          <MantoSesso coat={horse.coat_color} sex={horse.sex} />
        </>}
        cifre={<>
          <Cifra titolo="Corse" valore={horse.career_races ?? "—"} />
          <Cifra titolo="Vittorie" valore={horse.career_wins ?? "—"}
            sotto={horse.win_rate != null && horse.career_races ? `${horse.win_rate.toFixed(1).replace(".", ",")}% vinte` : undefined} />
          <span className="cifra-extra"><Cifra titolo="Piazzamenti" valore={horse.career_top3 ?? "—"}
            sotto={horse.career_top3 != null && horse.career_races ? `${(horse.career_top3 / horse.career_races * 100).toFixed(1).replace(".", ",")}% nei primi 3` : "arrivi nei primi tre"} /></span>
          <Cifra titolo="Guadagni" colore={horse.career_earnings ? "hsl(51 90% 62%)" : undefined}
            valore={horse.career_earnings != null ? `€ ${horse.career_earnings.toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"} />
          <Cifra titolo="Record al km" valore={horse.record_career ? formatRecord(horse.record_career) : "—"} colore="hsl(183 70% 60%)" />
          {(horse as any).distanza && <span className="cifra-extra">
            <Cifra titolo="Km gara corta" valore={kmTesto((horse as any).distanza.corto)} colore="hsl(28 85% 64%)"
              sotto={kmSotto((horse as any).distanza.corto, "corto")} />
            <Cifra titolo="Km gara lunga" valore={kmTesto((horse as any).distanza.lungo)} colore="hsl(205 75% 66%)"
              sotto={(horse as any).distanza.profilo
                ? <EtichettaProfilo profilo={((horse as any).distanza as Distanza).profilo} />
                : kmSotto((horse as any).distanza.lungo, "lungo")} />
          </span>}
          <button type="button" className="cifra-altre" onClick={() => setTutteCifre(v => !v)} data-testid="cifre-tutte"
            style={{ background: "none", border: "1px dashed hsl(220 10% 26%)", borderRadius: 10, color: "hsl(183 70% 60%)",
                     fontSize: 12.5, fontWeight: 700, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {tutteCifre ? "Mostra meno" : `Mostra tutte (${(horse as any).distanza ? 3 : 1} in più)`}
          </button>
        </>}
        avviso={(horse as any).carriera_completa ? (
            <div data-testid="nota-carriera-completa" style={{ fontSize: 12.5, lineHeight: 1.5, color: "hsl(205 70% 78%)",
                 border: "1px solid hsl(205 60% 45% / .45)", background: "hsl(205 50% 12% / .5)", borderRadius: 10, padding: "9px 12px" }}>
              {(() => { const cc = (horse as any).carriera_completa; return <>
              Carriera completa, in tutto il mondo: {cc.corse} corse, {cc.vittorie} vittorie
              {cc.primi_tre != null ? <>, {cc.primi_tre} volte nei primi tre</> : null}
              {cc.record ? <>, record {formatRecord(cc.record)}{cc.record_luogo ? <> ({cc.record_luogo})</> : null}</> : null}.
              {" "}Fonte: {cc.url ? <a href={cc.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{cc.fonte}</a> : cc.fonte}.
              {cc.valuta_originale ? <> I guadagni sono {Math.round(cc.importo_originale).toLocaleString("it-IT")} {cc.valuta_originale === "SEK" ? "corone svedesi" : cc.valuta_originale === "USD" ? "dollari" : cc.valuta_originale},
                convertiti in euro al cambio medio della BCE degli anni di corsa ({String(cc.cambio).replace(".", ",")} per un euro): circa.</> : null}
              {" "}Il voto è calcolato su questi totali, senza spostare la scala degli altri cavalli, che contano solo le corse in Italia
              {cc.stagioni_stimate ? <>; le stagioni di corsa non sono nella fonte e sono stimate dalle corse (una ogni 12)</> : null}.
              {" "}Le gare una per una qui sotto sono solo quelle corse in Italia.
              </>; })()}
            </div>
          ) : (horse as any).ospite_estero ? (
            <div data-testid="nota-ospite-estero" style={{ fontSize: 12.5, lineHeight: 1.5, color: "hsl(205 70% 78%)",
                 border: "1px solid hsl(205 60% 45% / .45)", background: "hsl(205 50% 12% / .5)", borderRadius: 10, padding: "9px 12px" }}>
              Corre soprattutto all&apos;estero: {(horse as any).ospite_estero.gare_italia} corse in Italia su {(horse as any).ospite_estero.gare_totali}.
              {" "}Il voto conta tutta la carriera, come per gli altri cavalli, ma non entra nel calcolo delle soglie delle lettere:
              le corse all&apos;estero pagano in media quasi quattro volte quelle italiane, e i suoi premi alzerebbero l&apos;asticella a chi corre in Italia.
            </div>
          ) : eStorico && !parziale ? <CarrieraMondo italia={horse} mondo={(horse as any).totali_mondiali} />
          : parziale ? (
            <div data-testid="nota-carriera-parziale" style={{ fontSize: 12.5, lineHeight: 1.5, color: "hsl(45 85% 70%)",
                 border: "1px solid hsl(45 70% 45% / .45)", background: "hsl(45 60% 12% / .5)", borderRadius: 10, padding: "9px 12px" }}>
              Carriera parziale: questi numeri contano solo le {parziale.n} gare che abbiamo
              (dal {parziale.dal.slice(8, 10)}/{parziale.dal.slice(5, 7)}/{parziale.dal.slice(0, 4)}), lette dai risultati ufficiali.
              {eStorico
                ? <> La carriera completa non è disponibile: il voto storico è calcolato su queste gare, sulla stessa scala degli altri storici, e per una carriera iniziata prima del 2016 o corsa in parte all&apos;estero probabilmente sottostima il cavallo.</>
                : <> La carriera completa non è disponibile, quindi il cavallo non ha un voto.</>}
              {parziale.premi_stimati > 0 && <> In {parziale.premi_stimati} gare il premio è stimato dalla tabella del regolamento.</>}
            </div>
          ) : undefined}
      />
      </div>

      {/* Novembre 2026, scheda compattata. In alto il riepilogo, sempre
          aperto: palmares, il voto in breve, le tre gare migliori e i soldi in
          una riga. Sotto, quattro sezioni che si aprono con un clic (voto in
          dettaglio, carriera e gare, economia, famiglia): da computer
          "Carriera e gare" parte aperta, sul telefono partono tutte chiuse.
          Ogni sezione ricorda se l'utente l'ha aperta o chiusa. */}
      <div className="scheda-corpo scheda-compatta">
      {eStorico && (
        <div className="blocco-storico">
          <div className="pannello" style={{ ...panelStyle, borderLeft: "3px solid hsl(51 70% 50%)" }}>
            <div style={panelTitle}>Voto storico, non confrontabile con i cavalli in gara</div>
            {/* L'avvertenza resta in chiaro: e' il punto, non un dettaglio. Il
                perche' tecnico va invece sotto la tendina. */}
            <div style={{ fontSize: 13, color: "hsl(210 10% 78%)", lineHeight: 1.55, maxWidth: "70ch" }}>
              Confrontato solo con gli altri cavalli storici, su guadagni, record e percentuale
              di vittorie.
            </div>
            <Spiegazione titolo="Perché ha una scala a parte">
              {parziale ? <>
                Di questo cavallo l&apos;archivio non ha i totali ufficiali di carriera, solo le
                gare corse dal 2016 in poi (quelle precedenti non esistono online): il voto è
                calcolato su quelle, con le stesse soglie degli altri storici, quindi non sposta
                la scala ma può essere più basso di quanto il cavallo meriterebbe.
              </> : <>
                Di questo cavallo l&apos;archivio conosce i totali di carriera presi
                dall&apos;anagrafe ufficiale, ma non le singole gare: per gli anni in cui ha corso
                non esistono online.
              </>}
              {" "}Confrontarlo con i cavalli di oggi sarebbe doppiamente
              sbagliato, perche&apos; correvano in un&apos;altra epoca e con altri montepremi.
              <br />
              La tenuta, che per i cavalli in attivita&apos; vale un quarto del voto, qui non
              e&apos; misurabile perche&apos; servirebbero le date delle corse: il suo peso viene
              ridistribuito sulle tre voci note, mantenendone le proporzioni.
            </Spiegazione>
          </div>
        </div>
      )}
      <section id="sez-palmares"><Palmares nome={horse.name} anno={horse.birth_year} /></section>

      {horse.rating_mode === "performance" && (
      <div className="pannello in-breve" style={panelStyle}>
        <div style={panelTitle}>In breve</div>
        <div className="in-breve-griglia">
          {horse.rating_mode === "performance" && (horse.grade_annata || horse.affidabilita_voto?.disponibile || horse.voto_previsto || curvaPronta((horse as any).forza)) && (
            <div className="in-breve-parte in-breve-larga">
              <div className="in-breve-titolo">Il voto</div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 14,
            }}>
              {horse.grade_annata && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                      Contro tutti
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{horse.grade}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                      Nella sua annata
                    </div>
                    <div style={{
                      fontSize: 22, fontWeight: 700, lineHeight: 1.1,
                      color: horse.grade_annata !== horse.grade ? "hsl(51 75% 58%)" : undefined,
                    }}>
                      {horse.grade_annata}
                    </div>
                    {horse.pos_annata != null && horse.tot_annata != null && (
                      <div className="tabular" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {horse.pos_annata}° su {horse.tot_annata.toLocaleString("it-IT")}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* L'affidabilita' si riduce a un'etichetta e una percentuale: il
                  dato resta in chiaro, il ragionamento dietro si apre se serve. */}
              {horse.affidabilita_voto?.disponibile && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                    Quanto e&apos; definitivo
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 600, lineHeight: 1.25,
                    color: horse.affidabilita_voto.livello === "provvisorio" ? "hsl(28 85% 62%)"
                      : horse.affidabilita_voto.livello === "in_via_di_conferma" ? "hsl(51 75% 60%)"
                        : "hsl(150 55% 55%)",
                  }}>
                    {horse.affidabilita_voto.livello === "provvisorio" ? "Provvisorio"
                      : horse.affidabilita_voto.livello === "in_via_di_conferma" ? "In conferma"
                        : "Consolidato"}
                  </div>
                  <div className="tabular" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {horse.affidabilita_voto.resta?.toFixed(0)}% resta così
                  </div>
                </div>
              )}

              {/* Voto previsto a fine carriera (XGBoost, sperimentale): solo dai
                  2 ai 4 anni, le eta' in cui la prova sul passato ha battuto la
                  regola "resta com'e' oggi". */}
              {horse.voto_previsto && !curvaPronta((horse as any).forza) && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                    A fine carriera (stima sperimentale)
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: "hsl(200 70% 65%)" }}>
                    {horse.voto_previsto.voto_previsto}
                  </div>
                  <div className="tabular" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {horse.voto_previsto.voto_basso === horse.voto_previsto.voto_alto
                      ? "intervallo stretto"
                      : `tra ${horse.voto_previsto.voto_basso} e ${horse.voto_previsto.voto_alto}`}
                  </div>
                </div>
              )}
            </div>
            {curvaPronta((horse as any).forza) && (
              <CurvaVoto f={(horse as any).forza} colore={COLORE_SCHEDA_VOTO[horse.grade ?? ""] ?? "hsl(183 70% 50%)"} />
            )}
            </div>
          )}
          {/* 20/11/2026: a destra del voto i percentili nella generazione (prima
              in "Il voto in dettaglio"); i guadagni erano gia' in testa e in
              Economia. */}
          {horse.rating_mode === "performance" && (
          <div id="sez-percentili" className="in-breve-parte">
              <div className="in-breve-titolo">Percentili generazione {horse.birth_year}</div>
              <PercentileBar label="Guadagni" value={horse.earn_percentile} />
              <PercentileBar label="Miglior tempo" value={horse.time_percentile} />
              {horse.tenuta_percentile != null && (
                <PercentileBar label="Stagioni corse" value={horse.tenuta_percentile} />
              )}
              {horse.integrita_percentile != null && (
                <PercentileBar label="Continuita' per la sua eta'" value={horse.integrita_percentile} />
              )}
              {horse.sire_percentile != null && (
                <PercentileBar label={`vs fratellastri (${horse.sire})`} value={horse.sire_percentile} />
              )}
              {/* Il rapporto stagioni corse su possibili diventa un numero, non
                  una frase: era il dato piu' concreto del riquadro e stava
                  sepolto in fondo a un paragrafo. */}
              {horse.stagioni_corse != null && horse.stagioni_possibili != null && (
                <div className="tabular" style={{
                  fontSize: 12.5, color: "hsl(210 10% 78%)", marginTop: 12,
                  paddingTop: 10, borderTop: "1px solid hsl(220 10% 16%)",
                }}>
                  Stagioni corse:{" "}
                  <strong style={{ color: "hsl(210 10% 92%)" }}>
                    {Math.min(horse.stagioni_corse, horse.stagioni_possibili)} su {horse.stagioni_possibili}
                  </strong>{" "}
                  <span style={{ color: "var(--muted)" }}>possibili fino ai 7 anni</span>
                  {horse.stagioni_corse > horse.stagioni_possibili && (
                    <span style={{ color: "var(--muted)" }}> · {horse.stagioni_corse} in tutto</span>
                  )}
                </div>
              )}

              <Spiegazione titolo="Che cosa sono i percentili">
                <p style={{ margin: "0 0 8px" }}>
                  Ogni barra dice quanti cavalli nati nello stesso anno questo cavallo lascia
                  dietro di sé. Il 90% sui guadagni vuol dire che ha guadagnato pi&ugrave; di nove
                  coetanei su dieci. Il confronto è sempre dentro l&apos;annata, così i giovani
                  non risultano scarsi solo perch&eacute; hanno corso meno.
                </p>
                <p style={{ margin: 0 }}>
                  &laquo;Stagioni corse&raquo; misura quante annate il cavallo è rimasto in
                  attivit&agrave;, &laquo;continuit&agrave; per la sua et&agrave;&raquo; lo rapporta
                  a quante avrebbe potuto correrne fino ai 7 anni. La seconda serve a non punire un tre anni per
                  non avere ancora la carriera di un nove anni, e a non punire chi smette a 7 anni, per esempio per andare in razza. Il voto tiene conto di entrambe:
                  una carriera lunga vale pi&ugrave; di una stagione brillante.
                </p>
              </Spiegazione>
          </div>
          )}
        </div>
      </div>
      )}
      {(!horse.races?.length || !horse.siblings?.length) && (
          <div className="riga-vuota">
            {!horse.races?.length && <span>Nessuna gara in archivio.</span>}
            {!horse.races?.length && !horse.siblings?.length && <span>·</span>}
            {!horse.siblings?.length && <span>Nessun fratellastro trovato.</span>}
          </div>
      )}


      {(horse.qualifica || (horse.races?.length ?? 0) > 0 || (stats?.yearlyStats?.length ?? 0) > 0 || (stats?.bestRaces?.length ?? 0) > 0) && (
      <SezioneScheda id="gare" titolo="Carriera e gare" apertaDaComputer
        riassunto={horse.career_races ? `${horse.career_races} corse · anno per anno, ultime gare, piste, allenatori e proprietari` : "Qualifica, gare, allenatori e proprietari"}>
        <div className="sez-colonne">
          <div className="sez-col">
      {(horse.qualifica || (stats?.yearlyStats?.length ?? 0) > 0 || (horse.gare_estero ?? 0) + (horse.gare_italia ?? 0) > 0) && (
          <div className="pannello pannello-unito" style={panelStyle}>
            <QualificaCavallo q={horse.qualifica} />
            <DistanzaCavallo d={(horse as any).distanza} />
            <RottureGaloppo tipo="cavallo" nome={horse.name} />
      {/* Year-by-year breakdown */}
      {stats?.yearlyStats && stats.yearlyStats.length > 0 && (
          <div id="sez-anni" className="sotto-sezione">
            <div style={panelTitle}>Carriera anno per anno</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
                    {["Anno", "Corse", "Vitt.", "Piazz.", "Guadagni", "Miglior tempo", "Tempo medio"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.yearlyStats.map((y, i) => (
                    <tr key={y.year} style={{ borderBottom: i < stats.yearlyStats.length - 1 ? "1px solid hsl(220 10% 14%)" : "none" }}>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(210 8% 60%)", fontWeight: 600 }}>{y.year}</td>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(210 8% 50%)" }}>{y.races}</td>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(51 80% 55%)" }}>{y.wins}</td>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(183 60% 55%)" }}>{y.places}</td>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(51 80% 55%)" }}>€{y.earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}</td>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(183 70% 55%)" }}>{y.best_time ? tempoKm(y.best_time) : "—"}</td>
                      <td className="tabular" style={{ padding: "8px 10px", color: "hsl(210 8% 50%)" }}>{y.avg_time ? tempoKm(y.avg_time) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      )}
                {/* Carriera in Italia e all'estero.

            Una gara all'estero paga in media quasi quattro volte una italiana
            (1.920 euro contro 518), quindi sapere DOVE un cavallo ha guadagnato
            cambia la lettura della sua carriera. Il voto non usa questa
            divisione: serve a chi guarda, non al calcolo. L'archivio marca le
            gare fuori confine ma non dice quale paese, percio' si puo' dividere
            Italia da estero e non oltre. */}
      {(horse.gare_estero ?? 0) + (horse.gare_italia ?? 0) > 0 && (
          <div id="sez-dove" className="sotto-sezione">
            <div style={panelTitle}>Dove ha corso</div>
            {/* Aggiunto il premio medio per gara: e' il dato che spiega da solo
                perche' la divisione conta, e prima stava solo nella prosa. */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 14,
            }}>
              {([
                ["In Italia", horse.gare_italia ?? 0, horse.vitt_italia ?? 0, horse.guad_italia ?? 0],
                ["All'estero", horse.gare_estero ?? 0, horse.vitt_estero ?? 0, horse.guad_estero ?? 0],
              ] as [string, number, number, number][]).map(([etichetta, gare, vitt, euro]) => (
                <div key={etichetta}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{etichetta}</div>
                  <div className="tabular" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
                    €{Math.round(euro).toLocaleString("it-IT")}
                  </div>
                  <div className="tabular" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {gare} {gare === 1 ? "gara" : "gare"} · {vitt} {vitt === 1 ? "vitt." : "vitt."}
                    {gare > 0 && ` · €${Math.round(euro / gare).toLocaleString("it-IT")}/gara`}
                  </div>
                </div>
              ))}
            </div>
            {(horse.gare_estero ?? 0) > 0 && (
              <Spiegazione titolo="Perché separare Italia ed estero">
                Una gara all&apos;estero paga in media 1.920 euro, una italiana 518: quasi quattro
                volte. I guadagni fuori confine pesano quindi molto piu&apos; del numero di corse,
                e due cavalli con lo stesso totale possono avere fatto carriere diversissime.
                La divisione non entra nel voto, serve a chi guarda.
                <br />
                L&apos;archivio registra che la gara e&apos; stata all&apos;estero ma non in quale
                paese, percio&apos; si puo&apos; dividere Italia da estero e non oltre.
              </Spiegazione>
            )}
          </div>
      )}
                    </div>
      )}
          {horse.races?.length ? (
          <div id="sez-gare" className="pannello" style={panelStyle}>
            <div style={panelTitle}>Ultime gare</div>
            {horse.races?.length ? (
              <ListaCorta quante={Math.min(10, horse.races.length)}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {horse.races.slice(0, 10).map((r, i) => (
                  <div key={i} className="riga-gara" style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "7px 0",
                    borderBottom: i < Math.min(9, horse.races.length - 1) ? "1px solid hsl(220 10% 15%)" : "none",
                  }}>
                    <div className="tabular" style={{
                      minWidth: "24px", height: "24px", borderRadius: "6px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700,
                      background: r.placement === 1 ? "hsl(51 100% 50% / 0.15)" : r.placement <= 3 ? "hsl(183 60% 40% / 0.15)" : "hsl(220 10% 14%)",
                      color: r.placement === 1 ? "hsl(51 100% 60%)" : r.placement <= 3 ? "hsl(183 80% 60%)" : "hsl(210 8% 50%)",
                      border: "1px solid",
                      borderColor: r.placement === 1 ? "hsl(51 100% 50% / 0.3)" : r.placement <= 3 ? "hsl(183 60% 40% / 0.3)" : "hsl(220 10% 20%)",
                    }}>
                      {r.placement_raw ?? r.placement ?? "—"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", color: "hsl(210 8% 65%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <LinkPista codice={r.track} /> {r.race_date ? `· ${r.race_date}` : ""}
                      </div>
                      <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)" }}>
                        <LinkGuidatore nome={r.driver} /> {r.distance ? `· ${r.distance}m` : ""}
                      </div>
                    </div>
                    {r.time_km != null && (
                      <div className="tabular" style={{ fontSize: "11px", color: "hsl(183 70% 55%)", flexShrink: 0 }}>
                        {tempoKm(r.time_km)}
                      </div>
                    )}
                    {r.prize_net != null && r.prize_net > 0 && (
                      <div className="tabular" style={{ fontSize: "11px", color: "hsl(51 80% 55%)", flexShrink: 0 }}>
                        €{r.prize_net.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </ListaCorta>
            ) : null}
          </div>
          ) : null}
          </div>
          <div className="sez-col">
      {stats && (stats.bestRaces.length > 0 || stats.trackStats.length > 0) && (
          <div id="sez-ippodromi" className="pannello pannello-unito" style={panelStyle}>
          {/* Best races */}
          {stats && stats.bestRaces.length > 0 && (
            <div className="sotto-sezione">
              <div style={panelTitle}>Migliori gare (per premio)</div>
              <ListaCorta quante={stats.bestRaces.length}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {stats.bestRaces.map((r, i) => (
                  <div key={i} className="riga-gara" style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "7px 0",
                    borderBottom: i < stats.bestRaces.length - 1 ? "1px solid hsl(220 10% 15%)" : "none",
                  }}>
                    <div className="tabular" style={{
                      minWidth: "24px", height: "24px", borderRadius: "6px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700,
                      background: r.placement === 1 ? "hsl(51 100% 50% / 0.15)" : "hsl(220 10% 14%)",
                      color: r.placement === 1 ? "hsl(51 100% 60%)" : "hsl(210 8% 50%)",
                      border: "1px solid",
                      borderColor: r.placement === 1 ? "hsl(51 100% 50% / 0.3)" : "hsl(220 10% 20%)",
                    }}>
                      {r.placement_raw ?? r.placement ?? "—"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", color: "hsl(210 8% 65%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <LinkPista codice={r.track} /> {r.race_date ? `· ${r.race_date}` : ""}
                      </div>
                      <div style={{ fontSize: "11px", color: "hsl(210 8% 42%)" }}>
                        <LinkGuidatore nome={r.driver} /> {r.distance ? `· ${r.distance}m` : ""}
                      </div>
                    </div>
                    <div className="tabular" style={{ fontSize: "12px", fontWeight: 700, color: "hsl(51 80% 60%)", flexShrink: 0 }}>
                      €{r.prize_net?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
              </ListaCorta>
            </div>
          )}
                  {/* Track stats */}
          {stats && stats.trackStats.length > 0 && (
            <div className="sotto-sezione">
              <div style={panelTitle}>Statistiche per ippodromo</div>
              <ListaCorta quante={stats.trackStats.length}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
                      {["Ippodromo", "Corse", "Vitt.", "Piazz.", "Guadagni"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: "11px", fontWeight: 600, color: "hsl(210 8% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.trackStats.map((t, i) => (
                      <tr key={t.track} style={{ borderBottom: i < stats.trackStats.length - 1 ? "1px solid hsl(220 10% 14%)" : "none" }}>
                        <td style={{ padding: "7px 8px", color: "hsl(210 8% 65%)", fontSize: "11px" }}><LinkPista codice={t.track} /></td>
                        <td className="tabular" style={{ padding: "7px 8px", color: "hsl(210 8% 50%)" }}>{t.races}</td>
                        <td className="tabular" style={{ padding: "7px 8px", color: "hsl(51 80% 55%)" }}>{t.wins}</td>
                        <td className="tabular" style={{ padding: "7px 8px", color: "hsl(183 60% 55%)" }}>{t.places}</td>
                        <td className="tabular" style={{ padding: "7px 8px", color: "hsl(51 80% 55%)" }}>€{t.earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </ListaCorta>
            </div>
          )}
                  </div>
      )}
            <section id="sez-allenatori"><AllenatoriCavallo nome={horse.name} /><ProprietariCavallo nome={horse.name} /></section>
          </div>
        </div>
      </SezioneScheda>
      )}

      <SezioneScheda id="economia" titolo="Economia" riassunto={<RigaSoldi horse={horse} breve />}>
        <div className="sez-colonne">
          <div className="sez-col">
            <PrevisioniCavallo nome={horse.name} anno={horse.birth_year} />
            <section id="sez-pareggio"><PareggioCavallo nome={horse.name} anno={horse.birth_year} /></section>
          </div>
          <div className="sez-col">
            <section id="sez-valore"><ValoreResiduo v={horse.valore_carriera} /></section>
            {!horse.career_races && horse.birth_year >= new Date().getFullYear() - 4 && (
              <section id="sez-vendere"><VendereOCorrere nome={horse.name} anno={horse.birth_year} inScheda /></section>
            )}
          </div>
        </div>
      </SezioneScheda>

      <SezioneScheda id="famiglia" titolo="Famiglia"
        riassunto={horse.pedigree?.sire ? `${horse.pedigree.sire}${horse.pedigree.dam ? ` × ${horse.pedigree.dam}` : ""} · genealogia, linea materna, fratellastri` : "Genealogia, linea materna, fratellastri"}>
        {/* 20/11/2026: albero fino ai nonni, cavallo compreso, con
            contorno blu/rosa e voti da atleta e da riproduttore. */}
        <div id="sez-genealogia" className="pannello" style={{ ...panelStyle, marginBottom: 16 }}>
          <div style={panelTitle}>Pedigree</div>
          <AlberoPedigreeCavallo nome={horse.name} generazioni={2} />
        </div>
        <div className="sez-colonne">
          <div className="sez-col">
            <InbreedingPanel horseName={horse.name} />
        {horse.siblings?.length ? (
        <div className="pannello" style={panelStyle}>
          <div style={panelTitle}>Fratellastri top (stesso padre)</div>
          {horse.siblings?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {horse.siblings.map((s, i) => (
                <Link key={`${s.name}-${s.birth_year}`} href={`/horse/${encodeURIComponent(s.name)}/${s.birth_year}`}>
                  <a style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 10px", borderRadius: "7px", textDecoration: "none",
                    transition: "background 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 14%)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <GradeBadge grade={s.grade} size="sm" />
                    <BandieraCavallo nome={s.name} />
                    <span style={{ flex: 1, fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 78%)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 45%)", flexShrink: 0 }}>
                      €{s.career_earnings?.toLocaleString("it-IT", { maximumFractionDigits: 0 }) ?? "—"}
                    </span>
                  </a>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        ) : null}
          </div>
          <div className="sez-col">
            <LineaMaterna nome={horse.name} />
          </div>
        </div>
      </SezioneScheda>
      </div>
    </div>
  );
}
