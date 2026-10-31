/**
 * CAVALLI E CLASSIFICA.
 *
 * Tre classifiche, tre popolazioni: i cavalli in gara (voto dalle corse), il
 * solo pedigree (cavalli senza carriera, voto dal padre e dalla madre) e gli
 * storici (solo totali di carriera, scala a parte). Layout a due colonne come
 * le altre pagine rifatte: elenco a sinistra, scheda del cavallo a destra.
 * I filtri meno usati stanno in un pannello che si apre, per non coprire la
 * classifica con dieci menu a tendina.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "../components/GradeBadge";
import { Trophy, Search, X, ChevronLeft, ChevronRight, ArrowRight, SlidersHorizontal } from "lucide-react";
import { formatRecord } from "@/lib/record";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import CavalloCaricamento from "../components/CavalloCaricamento";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro, isNum } from "../components/DueColonne";

interface LeaderboardRow {
  name: string;
  birth_year: number;
  sire: string;
  grade: string;
  grade_annata?: string | null;
  pos_annata?: number | null;
  tot_annata?: number | null;
  country?: string | null;
  sex?: string | null;
  score: number;
  earn_percentile: number | null;
  time_percentile: number | null;
  sire_percentile: number | null;
  career_races: number;
  career_wins: number;
  career_earnings: number;
  record_career: string;
  win_rate: number | null;
  gare_italia?: number | null; gare_estero?: number | null;
  vitt_italia?: number | null; vitt_estero?: number | null;
  guad_italia?: number | null; guad_estero?: number | null;
}

interface LeaderboardData {
  total: number;
  page: number;
  limit: number;
  rows: LeaderboardRow[];
  countries?: string[];
}

const COLORE = "hsl(51 80% 55%)";
const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const SCORRE = { flexWrap: "nowrap" as const, overflowX: "auto" as const, maxWidth: "100%", whiteSpace: "nowrap" as const };

// Nel filtro le sigle secche dicono poco a chi non le conosce. EST resta la
// sigla: nell'archivio non e' chiaro se indichi l'Estonia o una generica
// provenienza estera, e inventare un nome preciso su un dato ambiguo
// darebbe una certezza che non c'e'.
const NOMI_PAESE: Record<string, string> = {
  ITA: "Italia", FRA: "Francia", SWE: "Svezia", NOR: "Norvegia",
  GER: "Germania", CAN: "Canada", USA: "Stati Uniti",
};

const MODI: { v: string; l: string; sotto: string }[] = [
  { v: "performance", l: "In gara", sotto: "voto dalle corse" },
  { v: "pedigree", l: "Pedigree", sotto: "senza carriera, voto da padre e madre" },
  { v: "storico", l: "Storici", sotto: "solo totali di carriera, scala a parte" },
];

const MIN_RACES_SOLID = 4;
const LIMIT = 25;

const stileSelect: React.CSSProperties = {
  background: "var(--ed-fondo)", border: "1px solid var(--ed-bordo)", borderRadius: 9, padding: "8px 10px",
  color: "var(--ed-testo)", fontSize: 12.5, outline: "none", cursor: "pointer", fontFamily: "inherit", minWidth: 0, width: "100%",
};

function Percentile({ titolo, valore, nota }: { titolo: string; valore: number | null; nota: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "var(--ed-testo)", fontWeight: 600 }}>{titolo}</span>
        <span className="tabular" style={{ color: isNum(valore) ? COLORE : "var(--ed-fioco)", fontWeight: 700 }}>{isNum(valore) ? `${num(valore, 0)}%` : "—"}</span>
      </div>
      <Barretta valore={valore} max={100} />
      <div style={{ fontSize: 10.5, color: "var(--ed-fioco)", marginTop: 3 }}>{nota}</div>
    </div>
  );
}

function SchedaCavallo({ r, mode, voto, onClose }: { r: LeaderboardRow; mode: string; voto: string; onClose?: () => void }) {
  const lettera = (voto === "annata" ? r.grade_annata : r.grade) ?? r.grade ?? "N/A";
  const corse = r.career_races ?? 0;
  const haEstero = (r.gare_estero ?? 0) > 0;
  return (
    <div className="ed-dettaglio" data-testid="scheda-cavallo">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">{r.sex === "F" ? "Femmina" : r.sex === "M" ? "Maschio" : "Cavallo"} · nato nel {r.birth_year}{r.country ? ` · ${NOMI_PAESE[r.country] ?? r.country}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <BandieraCavallo nome={r.name} paese={r.country} />
            <span style={{ fontSize: 20, fontWeight: 800, color: COLORE, overflowWrap: "anywhere" }}>{r.name}</span>
            <GradeBadge grade={lettera} size="md" />
          </div>
          {r.sire && (
            <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
              figlio di <Link href={`/stallion/${encodeURIComponent(r.sire)}`} className="collegamento-scheda">{r.sire}</Link>
            </div>
          )}
          {voto === "annata" && r.grade_annata && r.grade_annata !== r.grade && (
            <div style={{ fontSize: 11.5, color: "var(--ed-muto)", marginTop: 4 }}>Contro tutti i cavalli il voto è {r.grade}: è lo stesso punteggio, letto in un altro confronto.</div>
          )}
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      {corse > 0 && corse < MIN_RACES_SOLID && mode !== "pedigree" && (
        <div style={{ marginTop: 10, fontSize: 12, color: "hsl(38 85% 62%)", background: "hsl(38 60% 18% / .5)", border: "1px solid hsl(38 50% 28%)", borderRadius: 8, padding: "7px 10px" }}>
          Voto calcolato su {corse} {corse === 1 ? "corsa" : "corse"}: poco affidabile.
        </div>
      )}

      <div className="ed-cifre" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Punti" valore={num(r.score, 1)} colore={COLORE}
          sotto={mode === "performance" && r.pos_annata && r.tot_annata ? `${num(r.pos_annata)}° su ${num(r.tot_annata)} nati nel ${r.birth_year}` : mode === "pedigree" ? "da padre e madre" : mode === "storico" ? "fra i cavalli storici" : undefined} />
        <Cifra titolo="Guadagni" valore={euro(r.career_earnings)} colore="hsl(45 80% 62%)"
          sotto={haEstero ? `${euro(r.guad_italia)} in Italia, ${euro(r.guad_estero)} all'estero` : undefined} />
        <Cifra titolo="Corse e vittorie" valore={corse ? `${num(corse)} · ${num(r.career_wins)}` : "—"}
          sotto={corse ? `${isNum(r.win_rate) ? num(r.win_rate, 1) : "—"}% vinte${haEstero ? ` · ${num(r.gare_estero)} all'estero` : ""}` : "non ha corso"} />
        <Cifra titolo="Record" valore={r.record_career ? formatRecord(r.record_career) : "—"} colore="hsl(183 70% 60%)" />
      </div>

      {mode !== "pedigree" && (isNum(r.earn_percentile) || isNum(r.time_percentile) || isNum(r.sire_percentile)) && (
        <>
          <div className="ed-etich" style={{ margin: "16px 0 8px" }}>Da dove vengono i punti</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Percentile titolo="Guadagni" valore={r.earn_percentile} nota="quota di cavalli che hanno guadagnato meno" />
            <Percentile titolo="Velocità" valore={r.time_percentile} nota="quota di cavalli con un record più lento" />
            {mode === "performance" && <Percentile titolo="Padre" valore={r.sire_percentile} nota="quanto vale il padre fra gli stalloni" />}
          </div>
        </>
      )}
      {mode === "pedigree" && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--ed-muto)", lineHeight: 1.55 }}>
          Questo cavallo non ha ancora una carriera: il voto è una stima che viene da quanto valgono il padre e la madre, non da come corre.
        </div>
      )}

      <Link href={`/horse/${encodeURIComponent(r.name)}/${r.birth_year}`}>
        <a data-testid="link-scheda-cavallo" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda completa <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function LeaderboardPage() {
  const desktop = useDesktop();
  const urlParams = new URLSearchParams(window.location.hash.split("?")[1] ?? "");

  const [year, setYear] = useState<string>(urlParams.get("year") ?? "");
  const [grade, setGrade] = useState<string>(urlParams.get("grade") ?? "");
  const [sireTesto, setSireTesto] = useState("");
  const [sireFilter, setSireFilter] = useState<string>("");
  const [mode, setMode] = useState<string>("performance");
  const [sort, setSort] = useState<string>("score");
  // Un cavallo con una o due corse puo' avere un voto altissimo per caso:
  // questo interruttore tiene in classifica solo chi ha una carriera vera.
  const [solidOnly, setSolidOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [aperto, setAperto] = useState<string | null>(null);
  const [filtriAperti, setFiltriAperti] = useState(false);

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/leaderboard/years", mode],
    queryFn: async () => (await apiRequest("GET", `/api/leaderboard/years?mode=${mode}`)).json(),
  });

  // Dove ha corso. Filtra soltanto, non tocca il voto.
  const [dove, setDove] = useState<string>("");

  // Quale delle due letture del voto mostrare. "globale" confronta con tutti,
  // "annata" solo con i nati nello stesso anno. Stesso punteggio, due letture:
  // il confronto generale penalizza i giovani, che hanno avuto meno anni per
  // correre - fra i nati nel 2023 il 63% sale di lettera guardandoli fra pari.
  const [voto, setVoto] = useState<string>("globale");

  // Tornando alla lettura globale, l'ordinamento per posizione in annata non
  // ha piu' senso.
  useEffect(() => {
    if (voto !== "annata" && sort === "annata") setSort("score");
  }, [voto, sort]);

  const [testo, setTesto] = useState("");
  const [cerca, setCerca] = useState<string>("");
  const [paese, setPaese] = useState<string>("");
  const [sesso, setSesso] = useState<string>("");

  useEffect(() => { const id = setTimeout(() => setCerca(testo.trim().toUpperCase()), 400); return () => clearTimeout(id); }, [testo]);
  useEffect(() => { const id = setTimeout(() => setSireFilter(sireTesto.trim().toUpperCase()), 400); return () => clearTimeout(id); }, [sireTesto]);
  useEffect(() => { setPage(1); setAperto(null); }, [year, grade, sireFilter, mode, sort, solidOnly, dove, voto, cerca, paese, sesso]);

  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (grade) params.set("grade", grade);
  if (sireFilter) params.set("sire", sireFilter);
  params.set("mode", mode);
  params.set("sort", sort);
  params.set("page", String(page));
  params.set("limit", String(LIMIT));
  if (solidOnly) params.set("min_races", String(MIN_RACES_SOLID));
  if (dove) params.set("dove", dove);
  if (voto === "annata") params.set("voto", "annata");
  if (cerca) params.set("q", cerca);
  if (paese) params.set("country", paese);
  if (sesso) params.set("sex", sesso);

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard", year, grade, sireFilter, mode, sort, page, solidOnly, dove, voto, cerca, paese, sesso],
    queryFn: async () => (await apiRequest("GET", `/api/leaderboard?${params}`)).json(),
    placeholderData: prev => prev,
  });

  const rows = data?.rows ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const chiave = (r: LeaderboardRow) => `${r.name}|${r.birth_year}`;
  const scelto = aperto ?? (desktop && rows.length ? chiave(rows[0]) : null);
  const sceltoR = rows.find(r => chiave(r) === scelto) ?? null;
  const modo = MODI.find(m => m.v === mode)!;

  const nFiltri = [year, sireFilter, solidOnly, paese, sesso, dove].filter(Boolean).length;
  const azzera = () => {
    setYear(""); setGrade(""); setSireTesto(""); setSireFilter(""); setSolidOnly(false);
    setTesto(""); setCerca(""); setPaese(""); setSesso(""); setDove("");
  };
  const ordini: [string, string][] = [
    ["score", "Punti"], ["earnings", "Guadagni"], ["wins", "Vittorie"], ["races", "Gare"], ["name", "Nome"],
    ...(mode === "performance" && voto === "annata" ? [["annata", "Primi d'annata"] as [string, string]] : []),
  ];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Trophy} colore={COLORE} titolo="Cavalli e classifica" margineSotto={16}
        sottotitolo="Tutti i cavalli valutati, con voti e filtri.">
        Tre classifiche separate: i cavalli in gara, votati sulle corse; quelli senza carriera, votati sul pedigree; e gli storici,
        di cui conosciamo solo i totali e che hanno una scala a parte. Tocca una riga per aprire la scheda del cavallo.
      </IntestazionePagina>

      <div className="ed-cifre" style={{ marginBottom: 16 }}>
        <Cifra titolo="In questo elenco" valore={data ? num(data.total) : "—"} sotto={nFiltri || grade || cerca ? "con i filtri scelti" : "tutti"} />
        <Cifra titolo="Classifica" valore={modo.l} colore={COLORE} sotto={modo.sotto} />
        {mode === "performance" && (
          <Cifra titolo="Voto letto" valore={voto === "annata" ? "Fra coetanei" : "Contro tutti"} colore="hsl(51 80% 68%)"
            sotto={voto === "annata" ? "solo con i nati nello stesso anno" : "con tutte le generazioni insieme"} />
        )}
      </div>

      {/* Tre classifiche, tre popolazioni. Senza dirlo, un utente crede che
          il 93 di Varenne e il 90 di Cobra Killer Gar siano la stessa cosa. */}
      {mode === "storico" && (
        <div style={{ marginBottom: 12 }}>
          <Spiegazione titolo="Perché questi cavalli hanno una scala a parte" compatta>
            Di questi cavalli l&apos;archivio conosce i totali di carriera ma non le singole
            gare, perche&apos; per gli anni in cui hanno corso non esistono online. Sono
            confrontati solo fra loro, su guadagni, record e percentuale di vittorie: i loro
            voti non si possono paragonare a quelli dei cavalli in gara oggi, che correvano
            in un&apos;altra epoca e con altri montepremi.
          </Spiegazione>
        </div>
      )}
      {/* Il voto d'annata non e' un voto nuovo: e' lo stesso punteggio letto
          contro i coetanei. */}
      {mode === "performance" && voto === "annata" && (
        <div style={{ marginBottom: 12 }}>
          <Spiegazione titolo="Come si legge" compatta>
            Ogni cavallo e&apos; confrontato solo con i nati nel suo stesso anno, che hanno
            avuto lo stesso tempo per correre. Il punteggio non cambia, cambia con chi viene
            paragonato: nel confronto generale i giovani sono penalizzati perche&apos; hanno
            meno stagioni alle spalle. Fra i nati nel 2023, il 63% sale di lettera guardandoli
            fra coetanei.
          </Spiegazione>
        </div>
      )}

      <div className="ed-barra">
        <div className="ed-segm" role="group" aria-label="Classifica">
          {MODI.map(m => <button key={m.v} aria-pressed={mode === m.v} onClick={() => setMode(m.v)}>{m.l}</button>)}
        </div>
        {/* Le due letture del voto, in evidenza accanto alla scelta della
            classifica: e' una decisione su COSA si sta guardando. Non compare
            per gli storici ne' per il pedigree. */}
        {mode === "performance" && (
          <div className="ed-segm" role="group" aria-label="Lettura del voto" data-testid="toggle-voto">
            {[{ v: "globale", l: "Contro tutti" }, { v: "annata", l: "Nella sua annata" }].map(({ v, l }) => (
              <button key={v} aria-pressed={voto === v} onClick={() => setVoto(v)}
                title={v === "annata" ? "Confronta ogni cavallo solo con i nati nel suo stesso anno" : "Confronta ogni cavallo con tutte le generazioni insieme"}>{l}</button>
            ))}
          </div>
        )}
      </div>

      <div className="ed-barra" style={{ marginTop: -4 }}>
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca un cavallo" aria-label="Cerca un cavallo" data-testid="input-cerca" />
          {testo && <button onClick={() => setTesto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per" style={SCORRE} data-testid="select-sort">
          {ordini.map(([k, t]) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{t}</button>)}
        </div>
      </div>

      <div className="ed-barra" style={{ marginTop: -4 }}>
        <div className="ed-segm" role="group" aria-label="Voto" style={SCORRE} data-testid="select-grade">
          <button aria-pressed={grade === ""} onClick={() => setGrade("")}>Tutti i voti</button>
          {GRADES.map(g => <button key={g} aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>)}
        </div>
        <button className={`chip-filtro${filtriAperti || nFiltri ? " attivo" : ""}`} onClick={() => setFiltriAperti(v => !v)} data-testid="btn-filtri"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <SlidersHorizontal size={13} /> Altri filtri{nFiltri ? ` (${nFiltri})` : ""}
        </button>
        {(nFiltri > 0 || grade || testo) && (
          <button onClick={azzera} style={{ fontSize: 12, color: "hsl(0 62% 60%)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Azzera filtri</button>
        )}
      </div>

      {filtriAperti && (
        <div className="ed-pannello" style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }} data-testid="pannello-filtri">
          <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="ed-etich">Anno di nascita</span>
            <select value={year} onChange={e => setYear(e.target.value)} style={stileSelect} data-testid="select-year">
              <option value="">Tutti gli anni</option>
              {years?.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {/* Dove ha corso: non per gli storici, di cui l'archivio non ha le singole gare. */}
          {mode !== "storico" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <span className="ed-etich">Dove ha corso</span>
              <select value={dove} onChange={e => setDove(e.target.value)} style={stileSelect} data-testid="select-dove">
                <option value="">Italia ed estero</option>
                <option value="italia">Solo carriera in Italia</option>
                <option value="estero">Ha corso anche all&apos;estero</option>
                <option value="solo_estero">Solo carriera all&apos;estero</option>
              </select>
            </label>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="ed-etich">Paese</span>
            <select value={paese} onChange={e => setPaese(e.target.value)} style={stileSelect} data-testid="select-paese">
              <option value="">Tutti i paesi</option>
              {(data?.countries ?? []).map(c => <option key={c} value={c}>{NOMI_PAESE[c] ?? c}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="ed-etich">Sesso</span>
            <select value={sesso} onChange={e => setSesso(e.target.value)} style={stileSelect} data-testid="select-sesso">
              <option value="">Maschi e femmine</option>
              <option value="M">Solo maschi</option>
              <option value="F">Solo femmine</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="ed-etich">Figli di</span>
            <input value={sireTesto} onChange={e => setSireTesto(e.target.value)} placeholder="Nome dello stallone" data-testid="input-sire-filter" style={{ ...stileSelect, cursor: "text" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: solidOnly ? COLORE : "var(--ed-muto)", cursor: "pointer", alignSelf: "end", paddingBottom: 9 }} data-testid="toggle-solid-only">
            <input type="checkbox" checked={solidOnly} onChange={e => setSolidOnly(e.target.checked)} style={{ accentColor: COLORE, width: 15, height: 15 }} />
            Almeno {MIN_RACES_SOLID} corse
          </label>
        </div>
      )}

      {isLoading && !data ? <CavalloCaricamento label="Carico la classifica..." /> : rows.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessun cavallo corrisponde ai filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {rows.map((r, i) => {
                const rank = (page - 1) * LIMIT + i + 1;
                const k = chiave(r);
                const att = scelto === k;
                const lettera = (voto === "annata" ? r.grade_annata : r.grade) ?? r.grade ?? "N/A";
                const corse = r.career_races ?? 0;
                return (
                  <div key={k} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperto(att && !desktop ? "" : k)} data-testid={`row-horse-${rank}`}>
                      <span className="ed-pos" data-podio={sort === "score" && rank <= 3}>{rank}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <BandieraCavallo nome={r.name} paese={r.country} />
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                          <GradeBadge grade={lettera} size="sm" />
                          {corse > 0 && corse < MIN_RACES_SOLID && mode !== "pedigree" && (
                            <span title={`Voto calcolato su ${corse} corse: poco affidabile`}
                              style={{ fontSize: 10, fontWeight: 700, color: "hsl(38 85% 62%)", background: "hsl(38 60% 18%)", border: "1px solid hsl(38 50% 28%)", borderRadius: 5, padding: "1px 5px", flexShrink: 0 }}>
                              {corse} corse
                            </span>
                          )}
                        </span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={r.score} max={100} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {r.birth_year}{r.sire ? ` · da ${r.sire}` : ""}{corse ? ` · ${corse} corse, ${r.career_wins ?? 0} vinte` : ""}{r.career_earnings ? ` · ${euro(r.career_earnings)}` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: COLORE }}>{num(r.score, 1)}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>punti</span>
                      </span>
                    </button>
                    {!desktop && att && <div style={{ marginTop: 6 }}><SchedaCavallo r={r} mode={mode} voto={voto} onClose={() => setAperto("")} /></div>}
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="ed-pagine">
                <button onClick={() => { setPage(p => Math.max(1, p - 1)); setAperto(null); }} disabled={page <= 1} aria-label="Pagina precedente" data-testid="button-prev-page"><ChevronLeft size={15} /></button>
                <span>Pagina {page} di {num(totalPages)}</span>
                <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setAperto(null); }} disabled={page >= totalPages} aria-label="Pagina successiva" data-testid="button-next-page"><ChevronRight size={15} /></button>
              </div>
            )}
          </div>
          {desktop && (sceltoR ? <SchedaCavallo key={scelto!} r={sceltoR} mode={mode} voto={voto} /> : <div className="ed-dettaglio ed-vuoto">Scegli un cavallo dall'elenco.</div>)}
        </div>
      )}

      <CollegamentiCorrelati voci={[
        { href: "/advisor", titolo: "Advisor", descrizione: "Simula un accoppiamento e stima costi, premi e prezzo di rivendita del puledro (sperimentale)." },
        { href: "/stalloni", titolo: "Catalogo stalloni", descrizione: "Chi sono i padri dei cavalli in classifica, con tasse di monta e produzione." },
        { href: "/trend", titolo: "Trend", descrizione: "Come cambiano voti, guadagni e numero di gare anno per anno." },
      ]} />
    </div>
  );
}
