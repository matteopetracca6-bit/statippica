/**
 * ALBERO DEGLI STALLONI (novembre 2026).
 *
 * Gli stalloni divisi per generazione, in base agli anni in cui sono nati i
 * loro figli: papa' (in monta adesso, anche se deceduti), nonni,
 * bisnonni, trisnonni, antenati. Il calcolo e' in server/alberoStalloni.ts.
 *
 * Il voto di uno stallone conta solo i figli che hanno corso negli anni
 * dell'archivio: per le generazioni vecchie e' basso perche' i figli sono
 * pochi, non perche' lo stallone fosse scarso. Qui ognuno si confronta con
 * quelli della sua generazione e il voto, quando non e' confrontabile, lo si
 * dice.
 *
 * Toccando una scheda si apre la pagina dello stallone; il bottone "Vedi linea paterna" mostra il padre, il nonno e
 * cosi' via verso l'alto, e i figli stalloni verso il basso.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { GitBranch, Search, X, Snowflake, ChevronRight, ChevronDown } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CavalloCaricamento from "../components/CavalloCaricamento";
import GradeBadge from "../components/GradeBadge";
import { CSS_DUE_COLONNE, Cifra, num } from "../components/DueColonne";
import { periodoMonta } from "@/lib/periodoMonta";

const COLORE = coloreScheda("/stalloni/albero");
const COLORI_GEN = ["hsl(120 55% 52%)", "hsl(183 65% 55%)", "hsl(210 70% 65%)", "hsl(265 55% 68%)", "hsl(35 70% 60%)"];
const DESCRIZIONE_GEN = [
  "In monta nella stagione di adesso, anche chi è deceduto ma resta nel catalogo (fiocco di neve).",
  "Non più in monta: la generazione prima dei papà.",
  "Due generazioni prima dei papà.",
  "Tre generazioni prima dei papà.",
  "Le generazioni più antiche dell'archivio.",
];
const QUANTI = 18;

interface Stallone {
  nome: string; nato: number | null; padre: string | null; figli: number;
  primo_figlio: number | null; ultimo_figlio: number | null; anno_punta: number | null; anno_centrale: number | null;
  monta_dal: number | null; monta_al: number | null; in_monta: boolean; fuori_catalogo_recente: boolean;
  morto: { data: string | null; fonte: string | null; url: string | null } | null; seme_congelato: boolean;
  stagione: string | null; generazione: number; voto: string | null; punteggio: number | null; figli_valutati: number;
  posto_generazione: number | null; su_generazione: number | null; per_anno: { anno: number; n: number }[];
  voto_confrontabile: boolean;
}
interface Albero {
  anno_riferimento: number; stagione: string | null; distanza_generazione: number; centrale_papa: number;
  generazioni: { indice: number; nome: string; da: number | null; a: number | null; stalloni: number }[];
  stalloni: Stallone[]; nomi: string[]; min_figli: number; anno_inizio_voto: number;
}

const parametri = () => new URLSearchParams((typeof window !== "undefined" ? window.location.hash.split("?")[1] : "") ?? "");
const dataIt = (d: string | null) => (d && d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d ?? "");

/* I figli nati anno per anno, su un asse comune a tutta la pagina:
   la posizione della macchia dice in che anni lo stallone era in monta. */
function Andamento({ per_anno, da, a, colore }: { per_anno: { anno: number; n: number }[]; da: number; a: number; colore: string }) {
  const max = Math.max(1, ...per_anno.map(p => p.n));
  const W = 240, H = 30, larg = W / (a - da + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block" }}>
      <rect x={0} y={H - 1} width={W} height={1} fill="hsl(220 10% 20%)" />
      {per_anno.map(p => {
        const h = Math.max(1.5, (p.n / max) * (H - 3));
        return <rect key={p.anno} x={(p.anno - da) * larg} y={H - 1 - h} width={Math.max(1, larg - 0.6)} height={h} fill={colore} opacity={0.85} />;
      })}
    </svg>
  );
}

function Scheda({ s, asse, scelto, legato, onScegli }: { s: Stallone; asse: [number, number]; scelto: boolean; legato: boolean; onScegli: () => void }) {
  const colore = COLORI_GEN[s.generazione] ?? COLORE;
  const [, vai] = useLocation();
  return (
    <div role="link" tabIndex={0} onClick={() => vai(`/stallion/${encodeURIComponent(s.nome)}`)} onKeyDown={e => { if (e.key === "Enter") vai(`/stallion/${encodeURIComponent(s.nome)}`); }}
      title={`Apri la scheda di ${s.nome}`}
      data-testid={`albero-${s.nome}`} id={`albero-${s.nome.replace(/[^A-Z0-9]/g, "_")}`}
      style={{
        background: scelto ? "hsl(220 14% 13%)" : "hsl(220 12% 10%)", cursor: "pointer", minWidth: 0,
        border: `1px solid ${scelto ? colore : legato ? "hsl(220 10% 30%)" : "hsl(220 10% 16%)"}`,
        boxShadow: scelto ? `0 0 0 1px ${colore}` : undefined, borderRadius: 12, padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "hsl(210 10% 92%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{s.nome}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {s.morto && s.seme_congelato && <span title="Deceduto, ancora nel catalogo di monta" aria-label="Deceduto, ancora nel catalogo di monta" role="img" style={{ color: "hsl(195 80% 70%)", display: "flex" }} data-testid={`fiocco-${s.nome}`}><Snowflake size={14} /></span>}
          {s.voto ? <span style={{ opacity: s.voto_confrontabile ? 1 : 0.45 }}><GradeBadge grade={s.voto} size="sm" /></span> : null}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
        {s.nato ? <>nato nel {s.nato} · </> : null}in monta {periodoMonta(s)}
        {s.padre ? <><br />figlio di {s.padre}</> : null}
      </div>
      <Andamento per_anno={s.per_anno} da={asse[0]} a={asse[1]} colore={colore} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: "hsl(210 8% 62%)" }}>
        <span className="tabular">{num(s.figli)} figli in archivio</span>
        {s.anno_punta ? <span className="tabular">più figli nel {s.anno_punta}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", minHeight: 15 }}>
        {s.morto ? <span style={{ color: s.seme_congelato ? "hsl(195 80% 70%)" : undefined }}>deceduto{s.morto.data ? ` il ${dataIt(s.morto.data)}` : ""}</span>
          : s.fuori_catalogo_recente ? <span>non nel catalogo italiano, figli nati fino al {s.ultimo_figlio}</span>
          : s.posto_generazione ? <span>{s.posto_generazione}° su {s.su_generazione} nella sua generazione</span>
          : s.voto && !s.voto_confrontabile ? <span>voto non confrontabile: pochi figli negli anni dell'archivio</span>
          : null}
        {s.posto_generazione && (s.morto || s.fuori_catalogo_recente) ? <span> · {s.posto_generazione}° su {s.su_generazione}</span> : null}
      </div>
      <button type="button" onClick={e => { e.stopPropagation(); onScegli(); }} onKeyDown={e => e.stopPropagation()}
        data-testid={`linea-${s.nome}`}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 7, border: `1px solid ${scelto ? colore : "hsl(220 10% 22%)"}`, background: "transparent", color: scelto ? colore : "hsl(210 8% 70%)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
        <GitBranch size={11} /> {scelto ? "Linea mostrata sopra" : "Vedi linea paterna"}
      </button>
    </div>
  );
}

function Chip({ s, scelto, onClick, sotto }: { s: Stallone | { nome: string; generazione?: number }; scelto?: boolean; onClick?: () => void; sotto?: string }) {
  const g = (s as Stallone).generazione;
  const colore = g != null ? COLORI_GEN[g] : "hsl(210 8% 55%)";
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 1, padding: "6px 10px", borderRadius: 9,
        border: `1px solid ${scelto ? colore : "hsl(220 10% 20%)"}`, background: scelto ? "hsl(220 14% 14%)" : "hsl(220 12% 10%)",
        color: "hsl(210 10% 90%)", fontSize: 12.5, fontWeight: 600, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0,
      }}>
      <span style={{ whiteSpace: "nowrap" }}>{s.nome}</span>
      {sotto && <span style={{ fontSize: 10.5, fontWeight: 500, color: colore }}>{sotto}</span>}
    </button>
  );
}

export default function AlberoStalloniPage() {
  const { data, isLoading } = useQuery<Albero>({
    queryKey: ["/api/stalloni/albero"],
    queryFn: async () => (await apiRequest("GET", "/api/stalloni/albero")).json(),
  });
  const [scelto, setScelto] = useState<string | null>(() => parametri().get("s")?.toUpperCase() ?? null);
  const [aperte, setAperte] = useState<Record<number, boolean>>({});
  const [testo, setTesto] = useState("");

  const perNome = useMemo(() => new Map((data?.stalloni ?? []).map(s => [s.nome, s])), [data]);
  const asse = useMemo<[number, number]>(() => {
    const anni = (data?.stalloni ?? []).map(s => s.primo_figlio ?? 9999);
    return [Math.min(...anni, data?.anno_riferimento ?? 2024) , data?.anno_riferimento ?? 2024];
  }, [data]);

  useEffect(() => { if (!scelto && data?.stalloni.length) setScelto(data.stalloni[0].nome); }, [data, scelto]);

  // La linea paterna dello stallone scelto: su fino al capostipite, giu' ai figli stalloni.
  const linea = useMemo(() => {
    const s = scelto ? perNome.get(scelto) : null;
    if (!s) return null;
    const su: (Stallone | { nome: string })[] = [];
    let p = s.padre, giri = 0;
    while (p && giri++ < 8) {
      const x = perNome.get(p);
      su.unshift(x ?? { nome: p });
      p = x?.padre ?? null;
    }
    const figli = (data?.stalloni ?? []).filter(x => x.padre === s.nome).sort((a, b) => b.figli - a.figli);
    return { s, su, figli };
  }, [scelto, perNome, data]);
  const legati = useMemo(() => new Set([...(linea?.su ?? []).map(x => x.nome), ...(linea?.figli ?? []).map(x => x.nome)]), [linea]);

  const scegli = (nome: string, scorri = false) => {
    setScelto(nome);
    const s = perNome.get(nome);
    if (s) {
      const gruppo = (data?.stalloni ?? []).filter(x => x.generazione === s.generazione);
      if (gruppo.findIndex(x => x.nome === nome) >= QUANTI) setAperte(a => ({ ...a, [s.generazione]: true }));
      if (scorri) setTimeout(() => document.getElementById(`albero-${nome.replace(/[^A-Z0-9]/g, "_")}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    }
  };
  const trovati = useMemo(() => {
    const q = testo.trim().toUpperCase();
    if (q.length < 2) return [];
    return (data?.stalloni ?? []).filter(s => s.nome.includes(q)).slice(0, 8);
  }, [testo, data]);

  const nomeGen = (g: number) => data?.nomi?.[g] ?? "";

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={GitBranch} colore={COLORE} titolo="Albero degli stalloni" margineSotto={16}
        sottotitolo="Gli stalloni divisi per generazione, in base agli anni in cui sono nati i loro figli: papà, nonni, bisnonni e così via.">
        Ogni stallone sta nella generazione degli anni in cui ha fatto più figli. Si guarda l'anno centrale dei figli in archivio: metà
        sono nati prima, metà dopo. I papà sono gli stalloni in monta nella stagione {data?.stagione ?? "di adesso"}, compresi quelli deceduti
        che restano nel catalogo, come VARENNE: li riconosci dal fiocco di neve. Ci sono anche quelli fuori dal catalogo italiano che hanno figli nati fino
        all'ultimo anno. Fra un padre e un suo figlio stallone passano di solito {data?.distanza_generazione ?? 8} anni: è la distanza
        usata per separare le generazioni.
        <br /><br />
        Il voto di uno stallone conta solo i figli che hanno corso negli anni dell'archivio, cioè quelli nati dal {data?.anno_inizio_voto ?? 2012} in poi.
        Per gli stalloni vecchi, come COKTAIL JET, quei figli sono pochi e il voto è basso. Non vuol dire che lo stallone fosse scarso.
        Per questo il voto è sbiadito quando non è confrontabile, e ogni stallone si confronta solo con quelli della sua generazione.
        Il grafico di ogni scheda mostra i figli nati anno per anno, sullo stesso asse per tutti, dal {asse[0]} al {asse[1]}.
        Nell'albero entrano gli stalloni con almeno {data?.min_figli ?? 10} figli in archivio.
      </IntestazionePagina>

      {isLoading && <CavalloCaricamento label="Costruisco l'albero..." />}

      {data && (
        <>
          <div className="ed-cifre" style={{ marginBottom: 16 }}>
            {data.generazioni.map(g => (
              <Cifra key={g.indice} titolo={g.nome} valore={num(g.stalloni)} colore={COLORI_GEN[g.indice]}
                sotto={g.da != null ? (g.da === g.a ? `anno centrale dei figli: ${g.da}` : `anno centrale dei figli: ${g.da}–${g.a}`) : undefined} />
            ))}
          </div>

          {/* La linea paterna dello stallone scelto */}
          <div className="pannello" style={{ padding: "16px 20px", marginBottom: 18 }} data-testid="linea-paterna">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Linea paterna</span>
              <div style={{ position: "relative", marginLeft: "auto" }}>
                <label className="ed-cerca" style={{ minWidth: 240 }}>
                  <Search size={15} style={{ color: "var(--ed-muto)" }} />
                  <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca uno stallone" aria-label="Cerca uno stallone" data-testid="input-cerca-albero" />
                  {testo && <button onClick={() => setTesto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
                </label>
                {trovati.length > 0 && (
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "hsl(220 14% 11%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 10, padding: 4, minWidth: 260 }}>
                    {trovati.map(s => (
                      <button key={s.nome} onClick={() => { scegli(s.nome, true); setTesto(""); }}
                        style={{ display: "flex", justifyContent: "space-between", gap: 10, width: "100%", background: "none", border: "none", color: "hsl(210 10% 90%)", padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left" }}>
                        <span>{s.nome}</span><span style={{ color: COLORI_GEN[s.generazione], fontSize: 11.5 }}>{nomeGen(s.generazione)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {linea ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {linea.su.map(x => (
                    <span key={x.nome} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Chip s={x} onClick={perNome.has(x.nome) ? () => scegli(x.nome, true) : undefined}
                        sotto={perNome.has(x.nome) ? nomeGen((x as Stallone).generazione) : "pochi figli in archivio"} />
                      <ChevronRight size={14} style={{ color: "var(--muted)" }} />
                    </span>
                  ))}
                  <Chip s={linea.s} scelto sotto={`${nomeGen(linea.s.generazione)} · in monta ${periodoMonta(linea.s)}`} />
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <ChevronDown size={14} style={{ color: "var(--muted)", marginTop: 8, flexShrink: 0 }} />
                  {linea.figli.length ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {linea.figli.slice(0, 16).map(f => <Chip key={f.nome} s={f} onClick={() => scegli(f.nome, true)} sotto={nomeGen(f.generazione)} />)}
                      {linea.figli.length > 16 && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>e altri {linea.figli.length - 16}</span>}
                    </div>
                  ) : <span style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>Nessun figlio stallone con almeno {data.min_figli} figli in archivio.</span>}
                </div>
              </>
            ) : <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Premi «Vedi linea paterna» su uno stallone per vedere la sua linea. Toccando la scheda si apre la pagina dello stallone.</span>}
          </div>

          {data.generazioni.map(g => {
            const elenco = data.stalloni.filter(s => s.generazione === g.indice);
            if (!elenco.length) return null;
            const tutti = !!aperte[g.indice];
            const mostrati = tutti ? elenco : elenco.slice(0, QUANTI);
            return (
              <section key={g.indice} style={{ marginBottom: 22 }} data-testid={`generazione-${g.indice}`}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10, paddingLeft: 10, borderLeft: `3px solid ${COLORI_GEN[g.indice]}` }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COLORI_GEN[g.indice] }}>{g.nome}</h2>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{num(g.stalloni)} stalloni · {DESCRIZIONE_GEN[g.indice]}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
                  {mostrati.map(s => (
                    <Scheda key={s.nome} s={s} asse={asse} scelto={s.nome === scelto} legato={legati.has(s.nome)} onScegli={() => { scegli(s.nome); setTimeout(() => document.querySelector('[data-testid="linea-paterna"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} />
                  ))}
                </div>
                {elenco.length > QUANTI && (
                  <button className="chip-filtro" style={{ marginTop: 10 }} onClick={() => setAperte(a => ({ ...a, [g.indice]: !tutti }))}>
                    {tutti ? "Mostra meno" : `Mostra tutti i ${num(elenco.length)}`}
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
