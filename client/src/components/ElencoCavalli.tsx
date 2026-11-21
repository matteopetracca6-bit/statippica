/**
 * Schede "Tutti" e "Novità" della pagina Cavalli (21/11/2026).
 * Dati: /api/cavalli/tutti e /api/cavalli/novita (server/elencoCavalli.ts).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import BandieraCavallo from "@/components/BandieraCavallo";
import GradeBadge from "./GradeBadge";
import CavalloCaricamento from "./CavalloCaricamento";
import { Cifra, num, euro } from "./DueColonne";

const TIPI: Record<string, { testo: string; colore: string }> = {
  performance: { testo: "in gara", colore: "hsl(51 80% 62%)" },
  storico: { testo: "storico", colore: "hsl(35 60% 62%)" },
  pedigree: { testo: "pedigree", colore: "hsl(183 55% 58%)" },
  senza_voto: { testo: "senza voto", colore: "hsl(210 8% 55%)" },
  solo_pedigree: { testo: "solo pedigree", colore: "hsl(210 8% 45%)" },
};
const FONTI: Record<string, string> = {
  registro_unire: "registro UNIRE (storici)", risultati: "risultati delle corse", gare_ufficiali: "gare ufficiali",
  produzione_stalloni: "produzione degli stalloni", schede_stalloni: "schede degli stalloni", genitori: "genitori di altri cavalli",
  puledri_vendopuledri: "puledri degli allevatori (vendopuledri)", altro: "altre fonti",
};

interface Riga { nome: string; anno: number | null; sesso: string | null; paese: string | null; padre: string | null; madre: string | null;
  corse: number; vincite: number; voto: string | null; tipo?: string; fonte?: string; quando?: string }

function Etichetta({ tipo }: { tipo: string }) {
  const t = TIPI[tipo] ?? TIPI.senza_voto;
  return <span style={{ fontSize: 10.5, fontWeight: 600, color: t.colore, border: `1px solid ${t.colore}55`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{t.testo}</span>;
}

function RigaCavallo({ r, extra }: { r: Riga; extra?: React.ReactNode }) {
  const link = `/horse/${encodeURIComponent(r.nome)}/${r.anno ?? 0}`;
  return (
    <Link href={link}>
      <a style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, alignItems: "center", padding: "9px 12px",
                  textDecoration: "none", color: "inherit", borderBottom: "1px solid hsl(0 0% 100% / .05)" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <BandieraCavallo nome={r.nome} paese={r.paese} />
            <b style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</b>
            {r.anno && <span style={{ fontSize: 11.5, color: "var(--ed-muto)" }}>{r.anno}</span>}
            {r.sesso && <span style={{ fontSize: 11, color: "var(--ed-fioco)" }}>{r.sesso}</span>}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--ed-muto)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
            {r.padre || r.madre ? `${r.padre ?? "?"} × ${r.madre ?? "?"}` : "genitori non noti"}{extra}
          </span>
        </span>
        <span style={{ textAlign: "right", fontSize: 12 }}>
          {r.corse > 0 ? <><span className="tabular" style={{ display: "block", fontWeight: 700 }}>{euro(r.vincite)}</span>
            <span style={{ fontSize: 10.5, color: "var(--ed-fioco)" }}>{num(r.corse)} corse</span></> : <span style={{ color: "var(--ed-fioco)" }}>—</span>}
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 64 }}>
          {r.voto ? <GradeBadge grade={r.voto} size="sm" /> : null}
          {r.tipo && <Etichetta tipo={r.tipo} />}
        </span>
      </a>
    </Link>
  );
}

export function SchedaTutti() {
  const [testo, setTesto] = useState(""); const [cerca, setCerca] = useState("");
  const [tipo, setTipo] = useState(""); const [ordine, setOrdine] = useState("nome");
  const [anno, setAnno] = useState(""); const [sesso, setSesso] = useState("");
  const [pagina, setPagina] = useState(0);
  useEffect(() => { const id = setTimeout(() => setCerca(testo.trim().toUpperCase()), 400); return () => clearTimeout(id); }, [testo]);
  useEffect(() => { setPagina(0); }, [cerca, tipo, ordine, anno, sesso]);
  const qs = new URLSearchParams({ pagina: String(pagina), ordine, ...(cerca ? { cerca } : {}), ...(tipo ? { tipo } : {}), ...(anno ? { anno } : {}), ...(sesso ? { sesso } : {}) }).toString();
  const { data, isLoading } = useQuery<{ totale: number; per_pagina: number; righe: Riga[]; per_tipo: Record<string, number> | null }>({
    queryKey: ["/api/cavalli/tutti", qs], queryFn: async () => (await apiRequest("GET", `/api/cavalli/tutti?${qs}`)).json(),
    placeholderData: p => p, staleTime: 5 * 60_000,
  });
  const pagine = data ? Math.max(1, Math.ceil(data.totale / data.per_pagina)) : 1;
  return (
    <>
      <div className="ed-cifre" style={{ marginBottom: 14 }}>
        <Cifra titolo="Cavalli nell'archivio" valore={data ? num(data.totale) : "—"} sotto={cerca || tipo || anno || sesso ? "con i filtri scelti" : "tutti, con e senza voto"} />
        {data?.per_tipo && <>
          <Cifra titolo="In gara" valore={num(data.per_tipo.performance ?? 0)} sotto="voto dalle corse" />
          <Cifra titolo="Storici" valore={num(data.per_tipo.storico ?? 0)} sotto="scala a parte" />
          <Cifra titolo="Pedigree" valore={num(data.per_tipo.pedigree ?? 0)} sotto="voto da padre e madre" />
          <Cifra titolo="Senza voto" valore={num((data.per_tipo.senza_voto ?? 0) + (data.per_tipo.solo_pedigree ?? 0))} sotto={`di cui ${num(data.per_tipo.solo_pedigree ?? 0)} solo nei pedigree`} />
        </>}
      </div>
      <div style={{ fontSize: 12, color: "var(--ed-muto)", marginBottom: 10 }}>
        I voti delle classifiche non si confrontano fra loro (corse, storici e pedigree hanno scale diverse): qui ogni cavallo ha l'etichetta del suo tipo
        e l'elenco si ordina per nome, vincite o anno.
      </div>
      <div className="ed-barra">
        <label className="ed-cerca">
          <Search size={15} style={{ color: "var(--ed-muto)" }} />
          <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca un cavallo" aria-label="Cerca un cavallo" />
          {testo && <button onClick={() => setTesto("")} aria-label="Cancella ricerca" style={{ background: "none", border: "none", color: "var(--ed-muto)", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>}
        </label>
        <div className="ed-segm" role="group" aria-label="Ordina per">
          {[["nome", "Nome"], ["vincite", "Vincite"], ["anno", "Anno"]].map(([k, t]) => <button key={k} aria-pressed={ordine === k} onClick={() => setOrdine(k)}>{t}</button>)}
        </div>
      </div>
      <div className="ed-barra" style={{ marginTop: -4 }}>
        <div className="ed-segm" role="group" aria-label="Tipo" style={{ flexWrap: "wrap" }}>
          {[["", "Tutti i tipi"], ["performance", "In gara"], ["storico", "Storici"], ["pedigree", "Pedigree"], ["senza_voto", "Senza voto"], ["solo_pedigree", "Solo pedigree"]]
            .map(([k, t]) => <button key={k} aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}
        </div>
        <input value={anno} onChange={e => setAnno(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Anno" aria-label="Anno di nascita"
          style={{ width: 80, background: "hsl(220 14% 12%)", color: "inherit", border: "1px solid hsl(0 0% 100% / .14)", borderRadius: 8, padding: "6px 9px", fontSize: 13 }} />
        <div className="ed-segm" role="group" aria-label="Sesso">
          {[["", "M/F"], ["M", "Maschi"], ["F", "Femmine"]].map(([k, t]) => <button key={k} aria-pressed={sesso === k} onClick={() => setSesso(k)}>{t}</button>)}
        </div>
      </div>
      {isLoading && !data ? <CavalloCaricamento label="Carico i cavalli" /> : (
        <div className="pannello" style={{ padding: 0, overflow: "hidden" }}>
          {data?.righe.length ? data.righe.map(r => <RigaCavallo key={`${r.nome}|${r.anno}`} r={r} />)
            : <div style={{ padding: 16, color: "var(--ed-muto)" }}>Nessun cavallo con questi filtri.</div>}
        </div>
      )}
      {pagine > 1 && (
        <div className="ed-pagine">
          <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina <= 0} aria-label="Pagina precedente"><ChevronLeft size={15} /></button>
          <span>Pagina {pagina + 1} di {num(pagine)}</span>
          <button onClick={() => setPagina(p => Math.min(pagine - 1, p + 1))} disabled={pagina >= pagine - 1} aria-label="Pagina successiva"><ChevronRight size={15} /></button>
        </div>
      )}
    </>
  );
}

export function SchedaNovita() {
  const [periodo, setPeriodo] = useState("ultima");
  const [filtro, setFiltro] = useState("");
  const { data, isLoading } = useQuery<{ righe: Riga[]; totale: number; dal: string | null; al: string | null; per_fonte: Record<string, number> }>({
    queryKey: ["/api/cavalli/novita", periodo], queryFn: async () => (await apiRequest("GET", `/api/cavalli/novita?periodo=${periodo}`)).json(),
    staleTime: 5 * 60_000,
  });
  const quando = (q: string | null) => {
    if (!q) return "—";
    const d = new Date(q.replace(" ", "T") + "Z");
    return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  const gruppi = Object.entries(data?.per_fonte ?? {}).sort((a, b) => b[1] - a[1]);
  const righe = (data?.righe ?? []).filter(r => !filtro || `${r.tipo}|${r.fonte}` === filtro);
  return (
    <>
      <div className="ed-barra">
        <div className="ed-segm" role="group" aria-label="Periodo">
          {[["ultima", "Ultima notte"], ["7", "7 giorni"], ["30", "30 giorni"]].map(([k, t]) => (
            <button key={k} aria-pressed={periodo === k} onClick={() => { setPeriodo(k); setFiltro(""); }}>{t}</button>
          ))}
        </div>
        {data?.al && <span style={{ fontSize: 12, color: "var(--ed-muto)" }}>ultimo aggiornamento dell'archivio: {quando(data.al)}</span>}
      </div>
      {isLoading ? <CavalloCaricamento label="Cerco le novità" /> : !data?.totale ? (
        <div className="pannello" style={{ padding: 16, color: "var(--ed-muto)", fontSize: 13 }}>
          Nessuna novità in questo periodo. Il registro delle novità esiste dal 21/11/2026: prima l'archivio non segnava quando entrava un cavallo.
        </div>
      ) : (
        <>
          <div className="ed-cifre" style={{ marginBottom: 12 }}>
            <Cifra titolo="Novità" valore={num(data.totale)} sotto={periodo === "ultima" ? "nell'ultima notte" : `negli ultimi ${periodo} giorni`} />
            {gruppi.slice(0, 4).map(([k, n]) => {
              const [tipo, fonte] = k.split("|");
              return <Cifra key={k} titolo={tipo === "nuovo" ? "Entrati" : "Carriera aggiunta"} valore={num(n)} sotto={`da ${FONTI[fonte] ?? fonte}`} />;
            })}
          </div>
          {gruppi.length > 1 && (
            <div className="ed-segm" role="group" aria-label="Fonte" style={{ flexWrap: "wrap", marginBottom: 10 }}>
              <button aria-pressed={!filtro} onClick={() => setFiltro("")}>Tutte</button>
              {gruppi.map(([k, n]) => { const [tipo, fonte] = k.split("|");
                return <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{tipo === "nuovo" ? "entrati" : "carriera"} · {FONTI[fonte] ?? fonte} ({num(n)})</button>; })}
            </div>
          )}
          <div className="pannello" style={{ padding: 0, overflow: "hidden" }}>
            {righe.slice(0, 500).map(r => (
              <RigaCavallo key={`${r.nome}|${r.tipo}`} r={{ ...r, tipo: undefined }} extra={
                <> · <span style={{ color: r.tipo === "nuovo" ? "hsl(150 55% 60%)" : "hsl(45 80% 62%)" }}>{r.tipo === "nuovo" ? "nuovo" : "carriera aggiunta"}</span>
                  {" "}da {FONTI[r.fonte ?? ""] ?? r.fonte} · {quando(r.quando ?? null)}</>} />
            ))}
          </div>
          {righe.length > 500 && <div style={{ fontSize: 12, color: "var(--ed-muto)", marginTop: 8 }}>Mostrati i primi 500 su {num(righe.length)}: usa i filtri per fonte.</div>}
        </>
      )}
    </>
  );
}
