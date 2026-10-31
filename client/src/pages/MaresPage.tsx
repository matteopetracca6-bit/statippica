/**
 * SEZIONE FATTRICI.
 *
 * Una fattrice NON e' valutata sulla propria carriera: molte hanno smesso di
 * correre da vent'anni e per molte non abbiamo nemmeno i totali. Il voto viene
 * dalla PROGENIE (dam_rating_stats, FASE 3c della pipeline notturna). La
 * carriera propria, quando la conosciamo, e' mostrata come contesto.
 *
 * Layout a due colonne come le altre pagine rifatte: elenco a sinistra,
 * scheda della fattrice a destra con i figli uno per uno.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Heart, Search, X, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import { formatRecord } from "@/lib/record";
import { CSS_DUE_COLONNE, Cifra, Barretta, useDesktop, num, euro } from "../components/DueColonne";

const COLORE = "hsl(330 70% 58%)";
const PAGE = 30;
// Su telefono i gruppi di bottoni lunghi scorrono di lato invece di andare a capo.
const SCORRE = { flexWrap: "nowrap" as const, overflowX: "auto" as const, maxWidth: "100%", whiteSpace: "nowrap" as const };
const GRADES = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const COLORI_VOTO: Record<string, string> = {
  SSS: "hsl(183 80% 55%)", SS: "hsl(160 65% 50%)", S: "hsl(130 55% 50%)", A: "hsl(60 70% 52%)",
  B: "hsl(35 80% 55%)", C: "hsl(20 70% 52%)", D: "hsl(210 8% 50%)", E: "hsl(210 8% 40%)", F: "hsl(0 60% 50%)",
};

interface MareRow {
  dam: string; n_figli_totali: number; n_valutati: number; n_in_corsa: number; final_score: number; grade: string;
  n_SSS: number; n_SS: number; n_S: number; pct_top_S: number; avg_earnings: number;
  own_races: number | null; own_wins: number | null; own_earnings: number | null; own_record: string | null; own_grade: string | null;
}
interface MaresResponse { total: number; page: number; limit: number; rows: MareRow[]; grades: { grade: string; cnt: number }[] }
interface Figlio {
  name: string; birth_year: number; sex: string | null; sire: string | null; grade: string | null; score: number | null;
  career_races: number | null; career_wins: number | null; career_earnings: number | null; record_career: string | null;
}
interface DettaglioMare {
  dam: string;
  stats: MareRow;
  own: { name: string; birth_year: number | null; sire: string | null; dam: string | null; country: string | null } | null;
  offspring: Figlio[];
}

const SORTS: [string, string][] = [
  ["final_score", "Voto"], ["n_figli", "Figli valutati"], ["pct_top_S", "% di vertice"], ["avg_earnings", "Guadagno figli"], ["dam", "Nome"],
];

function SchedaFattrice({ m, onClose }: { m: MareRow; onClose?: () => void }) {
  const { data, isLoading } = useQuery<DettaglioMare>({
    queryKey: ["/api/mare", m.dam],
    queryFn: () => apiRequest("GET", `/api/mare/${encodeURIComponent(m.dam)}`).then(r => r.json()),
  });
  const figli = [...(data?.offspring ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const voti = GRADES.map(g => ({ g, n: figli.filter(f => f.grade === g).length })).filter(x => x.n > 0);
  const nVal = voti.reduce((s, x) => s + x.n, 0);
  const own = data?.own;
  const vertice = m.n_SSS + m.n_SS + m.n_S;
  return (
    <div className="ed-dettaglio" data-testid="scheda-fattrice">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-etich">Fattrice{own?.birth_year ? ` · nata nel ${own.birth_year}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: COLORE, overflowWrap: "anywhere" }}>{m.dam}</span>
            <GradeBadge grade={m.grade} size="md" />
          </div>
          {own && (own.sire || own.dam) && (
            <div style={{ fontSize: 12.5, color: "var(--ed-muto)", marginTop: 3 }}>
              {own.sire ? <>figlia di <Link href={`/stallion/${encodeURIComponent(own.sire)}`} className="collegamento-scheda">{own.sire}</Link></> : null}
              {own.dam ? ` e di ${own.dam}` : ""}
            </div>
          )}
        </div>
        {onClose && <button className="ed-chiudi" onClick={onClose} aria-label="Chiudi"><X size={15} /></button>}
      </div>

      <div className="ed-cifre" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Cifra titolo="Punti" valore={num(m.final_score, 1)} colore={COLORE} sotto="dai figli, non dalla sua carriera" />
        <Cifra titolo="Figli valutati" valore={`${m.n_valutati}${m.n_figli_totali > m.n_valutati ? ` su ${m.n_figli_totali}` : ""}`} sotto={m.n_in_corsa ? `${m.n_in_corsa} ancora in attività` : "nessuno in attività"} />
        <Cifra titolo="Figli di vertice" valore={vertice ? `${vertice}` : "—"} colore={vertice ? "hsl(183 80% 55%)" : undefined} sotto={vertice ? `voto S o più · ${num(m.pct_top_S)}% dei valutati` : "nessun figlio con voto S o più"} />
        <Cifra titolo="Guadagno medio figli" valore={euro(m.avg_earnings)} colore="hsl(45 80% 62%)" />
      </div>

      {nVal > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="ed-etich" style={{ marginBottom: 6 }}>I voti dei figli</div>
          <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "hsl(220 10% 14%)" }}>
            {voti.map(x => <div key={x.g} title={`${x.g}: ${x.n}`} style={{ width: `${(x.n / nVal) * 100}%`, background: COLORI_VOTO[x.g] }} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 5, fontSize: 11, color: "var(--ed-muto)" }}>
            {voti.map(x => <span key={x.g}><b style={{ color: COLORI_VOTO[x.g] }}>{x.g}</b> {x.n}</span>)}
          </div>
        </div>
      )}

      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>I figli, dal voto più alto</div>
      {isLoading ? <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Carico...</div> : figli.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ed-fioco)" }}>Nessun figlio in archivio.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
          {figli.map(f => (
            <Link key={`${f.name}-${f.birth_year}`} href={`/horse/${encodeURIComponent(f.name)}/${f.birth_year}`}>
              <a style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 8,
                background: "var(--ed-fondo2)", textDecoration: "none", fontSize: 12.5 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, color: "var(--ed-testo)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    {f.grade && <GradeBadge grade={f.grade} size="sm" />}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--ed-muto)", marginTop: 1 }}>
                    {f.birth_year}{f.sire ? ` · da ${f.sire}` : ""}{f.career_races ? ` · ${f.career_races} corse, ${f.career_wins ?? 0} vinte` : " · non ha corso"}
                  </span>
                </span>
                <span className="tabular" style={{ color: "hsl(45 80% 62%)", whiteSpace: "nowrap", fontWeight: 700 }}>{euro(f.career_earnings)}</span>
              </a>
            </Link>
          ))}
        </div>
      )}

      <div className="ed-etich" style={{ margin: "16px 0 6px" }}>La sua carriera</div>
      <div style={{ fontSize: 12.5, color: "var(--ed-muto)", lineHeight: 1.6 }}>
        {m.own_races
          ? <>{m.own_races} corse, {m.own_wins ?? 0} vittorie, {euro(m.own_earnings)} vinti{m.own_record ? `, record ${formatRecord(m.own_record)}` : ""}. Conta solo come contesto: il voto viene dai figli.</>
          : "Non disponibile nell'archivio: per molte fattrici la carriera è finita prima che l'archivio inizi."}
      </div>

      <Link href={`/fattrice/${encodeURIComponent(m.dam)}`}>
        <a data-testid="link-scheda-fattrice" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: COLORE, color: "hsl(220 13% 7%)",
          borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
          Scheda completa <ArrowRight size={14} />
        </a>
      </Link>
    </div>
  );
}

export default function MaresPage() {
  const desktop = useDesktop();
  const [testo, setTesto] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  // Di partenza almeno due figli valutati: con un figlio solo il voto e' il
  // voto di quel figlio, e la cima della classifica si riempie di fattrici
  // tutte a pari merito con un unico puledro buono.
  const [minKids, setMinKids] = useState(2);
  const [sort, setSort] = useState("final_score");
  const [page, setPage] = useState(1);
  const [aperta, setAperta] = useState<string | null>(null);

  useEffect(() => { const id = setTimeout(() => { setSearch(testo.trim()); setPage(1); setAperta(null); }, 400); return () => clearTimeout(id); }, [testo]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE), sort, dir: sort === "dam" ? "asc" : "desc" });
  if (search) params.set("search", search);
  if (grade !== "all") params.set("grade", grade);
  if (minKids > 0) params.set("min_kids", String(minKids));

  const { data, isLoading } = useQuery<MaresResponse>({
    queryKey: ["/api/mares", params.toString()],
    queryFn: async () => (await apiRequest("GET", `/api/mares?${params.toString()}`)).json(),
    placeholderData: prev => prev,
  });
  const { data: tutte } = useQuery<MaresResponse>({
    queryKey: ["/api/mares", "riepilogo"],
    queryFn: async () => (await apiRequest("GET", "/api/mares?page=1&limit=1&min_kids=0")).json(),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pagine = Math.max(1, Math.ceil(total / PAGE));
  const cambia = (f: () => void) => { f(); setPage(1); setAperta(null); };
  const scelta = aperta ?? (desktop && rows.length ? rows[0].dam : null);
  const sceltaM = rows.find(m => m.dam === scelta) ?? null;
  const nTot = tutte?.total;
  const contaVoto = (g: string) => tutte?.grades?.find(x => x.grade === g)?.cnt ?? 0;
  const vertice = contaVoto("SSS") + contaVoto("SS") + contaVoto("S");

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Heart} colore={COLORE} titolo="Fattrici" margineSotto={16}
        sottotitolo="Le fattrici valutate su quello che valgono i loro figli.">
        Il voto di una fattrice viene dalla progenie, non dalla sua carriera: quello che conta è quanto valgono i figli che ha prodotto.
        La sua carriera, quando la conosciamo, è mostrata nella scheda come contesto di lettura. Tocca una riga per aprire la scheda.
      </IntestazionePagina>

      <div className="ed-cifre" style={{ marginBottom: 16 }}>
        <Cifra titolo="Fattrici valutate" valore={num(nTot)} sotto="con almeno un figlio valutato" />
        <Cifra titolo="Con voto S o più" valore={num(vertice)} colore="hsl(183 80% 55%)" sotto={nTot ? `${num((vertice / nTot) * 100, 1)}% del totale` : undefined} />
        <Cifra titolo="In questo elenco" valore={num(total)} sotto={minKids > 0 ? `con almeno ${minKids} figli valutati` : "tutte"} />
      </div>

      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca una fattrice" aria-label="Cerca una fattrice" data-testid="input-cerca-fattrice" />
          {testo && <button onClick={() => setTesto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per" style={SCORRE}>
          {SORTS.map(([k, t]) => <button key={k} aria-pressed={sort === k} onClick={() => cambia(() => setSort(k))}>{t}</button>)}
        </div>
      </div>
      <div className="ed-barra" style={{ marginTop: -4 }}>
        <div className="ed-segm" role="group" aria-label="Figli valutati">
          {[[0, "Tutte"], [2, "2+ figli"], [3, "3+ figli"], [5, "5+ figli"]].map(([k, t]) =>
            <button key={k} aria-pressed={minKids === k} onClick={() => cambia(() => setMinKids(k as number))}>{t}</button>)}
        </div>
        <div className="ed-segm" role="group" aria-label="Voto" style={SCORRE}>
          <button aria-pressed={grade === "all"} onClick={() => cambia(() => setGrade("all"))}>Tutti i voti</button>
          {GRADES.map(g => <button key={g} aria-pressed={grade === g} onClick={() => cambia(() => setGrade(g))} style={{ color: grade === g ? undefined : COLORI_VOTO[g] }}>{g}</button>)}
        </div>
      </div>

      {isLoading && !data ? <CavalloCaricamento label="Carico le fattrici..." /> : rows.length === 0 ? (
        <div className="ed-pannello" style={{ color: "var(--ed-muto)", fontSize: 13 }}>Nessuna fattrice corrisponde ai filtri scelti.</div>
      ) : (
        <div className="ed-griglia">
          <div>
            <div className="ed-lista">
              {rows.map((m, i) => {
                const att = scelta === m.dam;
                const pos = (page - 1) * PAGE + i + 1;
                const vert = m.n_SSS + m.n_SS + m.n_S;
                return (
                  <div key={m.dam} style={{ minWidth: 0 }}>
                    <button className="ed-riga" data-attiva={att} onClick={() => setAperta(att && !desktop ? "" : m.dam)} data-testid={`row-fattrice-${i}`}>
                      <span className="ed-pos" data-podio={sort === "final_score" && pos <= 3}>{pos}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m.dam}</span>
                          <GradeBadge grade={m.grade} size="sm" />
                        </span>
                        <span style={{ display: "block", margin: "6px 0 4px" }}><Barretta valore={m.final_score} max={100} colore={COLORI_VOTO[m.grade] ?? COLORE} /></span>
                        <span className="ed-sotto" style={{ display: "block" }}>
                          {m.n_valutati} {m.n_valutati === 1 ? "figlio valutato" : "figli valutati"}{vert ? ` · ${vert} di vertice` : ""} · media {euro(m.avg_earnings)}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="tabular" style={{ display: "block", fontSize: 17, fontWeight: 800, color: COLORE }}>{num(m.final_score, 1)}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--ed-fioco)" }}>punti</span>
                      </span>
                    </button>
                    {!desktop && att && <div style={{ marginTop: 6 }}><SchedaFattrice m={m} onClose={() => setAperta("")} /></div>}
                  </div>
                );
              })}
            </div>
            {pagine > 1 && (
              <div className="ed-pagine">
                <button onClick={() => { setPage(p => Math.max(1, p - 1)); setAperta(null); }} disabled={page <= 1} aria-label="Pagina precedente"><ChevronLeft size={15} /></button>
                <span>Pagina {page} di {num(pagine)}</span>
                <button onClick={() => { setPage(p => Math.min(pagine, p + 1)); setAperta(null); }} disabled={page >= pagine} aria-label="Pagina successiva"><ChevronRight size={15} /></button>
              </div>
            )}
          </div>
          {desktop && (sceltaM ? <SchedaFattrice key={sceltaM.dam} m={sceltaM} /> : <div className="ed-dettaglio ed-vuoto">Scegli una fattrice dall'elenco.</div>)}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come si vota una fattrice" compatta>
          Il voto è la media dei punti dei figli valutati, cioè di quelli che hanno corso abbastanza da avere un voto. Con uno o due figli il voto
          dice poco: un solo figlio molto buono basta a mettere la madre in cima. Per questo l'elenco parte dalle fattrici con almeno due figli
          valutati; con «Tutte» si vedono anche le altre. «Di vertice» sono i figli con voto S, SS o SSS.
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/advisor", titolo: "Advisor", descrizione: "Scegli una fattrice e vedi quali stalloni le stanno meglio (sperimentale)." },
        { href: "/stalloni", titolo: "Catalogo stalloni", descrizione: "Gli stalloni disponibili, con tasse di monta." },
        { href: "/pedigree", titolo: "Pedigree", descrizione: "Albero genealogico e consanguineità fino a cinque generazioni." },
      ]} />
    </div>
  );
}
