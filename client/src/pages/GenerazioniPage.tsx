/**
 * GENERAZIONI (24/11/2026): ogni annata di nascita a confronto, con andamenti,
 * voti, premi e statistiche, e la scheda della singola annata.
 * Le annate storiche entrano da sole quando il recupero notturno dal registro
 * UNIRE le completa (server/generazioni.ts).
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layers, Medal } from "lucide-react";
import { ClassificheEta } from "./ClassificheEtaPage";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import Sagoma from "../components/Sagoma";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import GraficoColonne, { COLORI_GRAFICO } from "../components/GraficoColonne";
import GradeBadge from "../components/GradeBadge";
import { CSS_DUE_COLONNE, Cifra, nomeBello } from "../components/DueColonne";
import { COLORE_SCHEDA_VOTO } from "@/lib/coloreVoto";
import { GenerazioneM, CSS_PULEDRO } from "../components/MercatoSezioni";

const COLORE = coloreScheda("/generazioni");
const ORDINE = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const euro = (n: number | null | undefined) => (n == null ? "—" : "€ " + Math.round(n).toLocaleString("it-IT"));
const euroK = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mln` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
const num = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("it-IT"));
const pc = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("it-IT")}%`);
/** 73,3 secondi -> 1.13.3 */
const km = (s: number | null | undefined) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60), r = s - 60 * m;
  const sec = Math.floor(r), dec = Math.round(10 * (r - sec));
  return `${m}.${String(sec).padStart(2, "0")}.${dec === 10 ? 0 : dec}`;
};
const get = (u: string) => apiRequest("GET", u).then(r => r.json());
const ASSE = { stroke: "hsl(210 8% 40%)", fontSize: 11, tickLine: false };
const SCHEDA_TT = { background: "hsl(220 14% 10%)", border: "1px solid hsl(220 10% 24%)", borderRadius: 10, fontSize: 12, color: "hsl(210 10% 90%)" };

function Riquadro({ titolo, nota, children }: { titolo: string; nota?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="ed-pannello" style={{ minWidth: 0 }}>
      <div className="ed-tit" style={{ marginTop: 0, marginBottom: 4 }}>{titolo}</div>
      {nota && <p style={{ fontSize: 12, color: "var(--ed-muto)", margin: "0 0 10px", lineHeight: 1.5 }}>{nota}</p>}
      {children}
    </div>
  );
}

function Linee({ dati, linee, altezza = 220, formato, inverti = false, dominio }: {
  dati: any[]; linee: { k: string; nome: string; colore: string; tratteggio?: boolean }[];
  altezza?: number; formato: (v: number) => string; inverti?: boolean; dominio?: [any, any];
}) {
  return (
    <div style={{ width: "100%", height: altezza }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dati} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(220 10% 16%)" strokeDasharray="3 3" />
          <XAxis dataKey="anno" {...ASSE} />
          <YAxis {...ASSE} width={52} tickFormatter={formato} reversed={inverti} domain={dominio ?? ["auto", "auto"]} />
          <Tooltip contentStyle={SCHEDA_TT} formatter={(v: any, n: any) => [formato(Number(v)), n]} labelFormatter={(l: any) => `Nati nel ${l}`} />
          <Legend wrapperStyle={{ fontSize: 11.5 }} />
          {linee.map(l => <Line key={l.k} type="monotone" dataKey={l.k} name={l.nome} stroke={l.colore} strokeWidth={2.2} dot={{ r: 2.5 }}
            strokeDasharray={l.tratteggio ? "5 4" : undefined} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Annata({ g, totale }: { g: any; totale: any[] }) {
  const { data: d } = useQuery<any>({ queryKey: ["/api/generazioni", g.anno], queryFn: () => get(`/api/generazioni/${g.anno}`), staleTime: 3600_000 });
  const media = (k: string) => totale.reduce((t, x) => t + (x[k] ?? 0), 0) / Math.max(1, totale.length);
  const confronto = (k: string, piuMeglio = true) => {
    const m = media(k); if (!m || g[k] == null) return "";
    const d = Math.round(100 * (g[k] / m - 1));
    return d === 0 ? "come la media delle annate" : `${Math.abs(d)}% ${(d > 0) === piuMeglio ? "sopra" : "sotto"} la media delle annate`;
  };
  return (
    <div style={{ display: "grid", gap: 14 }} data-testid="scheda-annata">
      <div className="ed-pannello" style={{ borderColor: `color-mix(in srgb, ${COLORE} 40%, transparent)` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: "var(--ed-testo)" }}>Nati nel {g.anno}</span>
          <span style={{ fontSize: 12.5, color: "var(--ed-muto)" }}>{g.eta} anni oggi · {g.anno < 2012 ? "dal registro UNIRE" : "dall'archivio delle corse"}</span>
          {g.in_corso && <span style={{ fontSize: 11, fontWeight: 700, color: COLORI_GRAFICO.medio, border: `1px solid ${COLORI_GRAFICO.medio}`, borderRadius: 999, padding: "1px 8px" }}>carriere ancora in corso</span>}
        </div>
        {g.campione && (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--ed-testo)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            Il campione: <Link href={`/horse/${encodeURIComponent(g.campione.nome)}/${g.anno}`} style={{ color: COLORE, fontWeight: 800 }}>{nomeBello(g.campione.nome)}</Link>
            {g.campione.voto && <GradeBadge grade={g.campione.voto} size="sm" />} con {euro(g.campione.premi)} vinti
          </div>
        )}
        <div className="ed-cifre" style={{ marginTop: 12 }}>
          <Cifra titolo="Nell'archivio" valore={num(g.nati)} sotto={`${num(g.corsi)} hanno corso (${pc(g.quota_corsi)})`} />
          <Cifra titolo="Hanno vinto" valore={pc(g.quota_vincitori)} sotto={`${num(g.vincitori)} di chi ha corso`} />
          <Cifra titolo="Premi totali" valore={euroK(g.premi_totali)} colore={COLORI_GRAFICO.euro} sotto={confronto("premi_totali")} />
          <Cifra titolo="Premi per corridore" valore={euro(g.premi_medi)} sotto={`il tipico ${euro(g.premi_mediani)}`} />
          <Cifra titolo="Record mediano" valore={km(g.record_mediano)} sotto={`il migliore ${km(g.record_migliore)}`} />
          <Cifra titolo="Corse per corridore" valore={(g.corse_medie ?? 0).toLocaleString("it-IT")} sotto={`${(g.vittorie_medie ?? 0).toLocaleString("it-IT")} vittorie in media`} />
          <Cifra titolo="Sopra 100.000 €" valore={num(g.sopra_100mila)} sotto="cavalli" />
          <Cifra titolo="Al 10% più ricco" valore={pc(g.quota_top10)} sotto="dei premi dell'annata" />
          <Cifra titolo="Femmine" valore={pc(g.quota_femmine)} sotto={`vincono in media ${euro(g.premi_medi_femmine)}, i maschi ${euro(g.premi_medi_maschi)}`} />
          <Cifra titolo="Stalloni padri" valore={num(g.padri)} sotto={`i primi 5 hanno il ${pc(g.quota_primi5_padri)} dei nati`} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        <Riquadro titolo="I voti dell'annata" nota="Chi ha corso, per voto. Il voto confronta ogni cavallo con quelli nati nel suo stesso anno.">
          <GraficoColonne altezza={150} colore={COLORI_GRAFICO.quantita} nomeAsse="cavalli per voto"
            dati={ORDINE.map(v => ({ chiave: v, etichetta: v, valore: g.voti[v] ?? 0, testo: num(g.voti[v] ?? 0), colore: COLORE_SCHEDA_VOTO[v],
              scheda: [{ testo: `Voto ${v}` }, { testo: `${num(g.voti[v] ?? 0)} cavalli` }] }))} />
        </Riquadro>
        <Riquadro titolo="Velocità" nota="Quanti cavalli per record al km, a mezzo secondo. Più a sinistra, più veloci.">
          {!d ? <Sagoma righe={3} /> : (
            <GraficoColonne altezza={150} colore={COLORI_GRAFICO.quantita} nomeAsse="cavalli per record al km"
              dati={d.record.map((x: any) => ({ chiave: x.da, etichetta: km(x.da).slice(2), valore: x.n, testo: "",
                scheda: [{ testo: `da ${km(x.da)} a ${km(x.da + 0.4)}` }, { testo: `${num(x.n)} cavalli` }] }))} />
          )}
        </Riquadro>
      </div>

      {d?.per_eta && (
        <Riquadro titolo="Come ha guadagnato, età per età" nota={`Premi vinti dall'annata in ogni stagione, dalle corse dell'archivio (coprono il ${pc(d.copertura_corse)} dei premi di carriera).`}>
          <GraficoColonne altezza={170} colore={COLORI_GRAFICO.euro} nomeAsse="premi per età"
            dati={d.per_eta.map((x: any) => ({ chiave: x.eta, etichetta: `${x.eta}`, valore: x.premi, testo: euroK(x.premi),
              tratteggio: g.anno + x.eta >= new Date().getFullYear(),
              scheda: [{ testo: `A ${x.eta} anni` }, { testo: `${euro(x.premi)} vinti` }, { testo: `${num(x.cavalli)} cavalli in corsa, ${num(x.partenze)} partenze, ${num(x.vittorie)} vittorie` }] }))} />
        </Riquadro>
      )}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        <Riquadro titolo="I migliori per premi" nota={(() => {
          const e = new Date().getFullYear() - g.anno;
          const k = e >= 2 && e <= 4 ? String(e) : e > 4 ? "anziani" : null;
          return k ? <Link href={`/classifiche-eta?eta=${k}`} style={{ color: COLORE }} data-testid="link-classifica-completa">
            {k === "anziani" ? "Classifica completa degli anziani →" : `Classifica completa dei ${e} anni →`}</Link> : null;
        })()}>
          {!d ? <Sagoma righe={6} /> : (
            <div className="ed-lista">
              {d.migliori.map((x: any, i: number) => (
                <Link key={x.nome} href={`/horse/${encodeURIComponent(x.nome)}/${g.anno}`} className="ed-riga" style={{ textDecoration: "none" }}>
                  <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ed-nome" style={{ display: "flex", alignItems: "center", gap: 6 }}>{nomeBello(x.nome)} {x.voto && <GradeBadge grade={x.voto} size="sm" />}</span>
                    <span className="ed-sotto" style={{ display: "block" }}>{x.padre ? nomeBello(x.padre) : "?"}{x.madre ? ` × ${nomeBello(x.madre)}` : ""} · {x.corse} corse, {x.vittorie} vinte · {km(x.record)}</span>
                  </span>
                  <span className="tabular" style={{ fontWeight: 800, color: COLORI_GRAFICO.euro, whiteSpace: "nowrap" }}>{euro(x.premi)}</span>
                </Link>
              ))}
            </div>
          )}
        </Riquadro>
        <Riquadro titolo="Gli stalloni dell'annata" nota="Per premi vinti dai loro figli nati quell'anno.">
          {!d ? <Sagoma righe={6} /> : (
            <div className="ed-lista">
              {d.stalloni.map((x: any, i: number) => (
                <Link key={x.nome} href={`/stallion/${encodeURIComponent(x.nome)}`} className="ed-riga" style={{ textDecoration: "none" }}>
                  <span className="ed-pos" data-podio={i < 3}>{i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ed-nome" style={{ display: "block" }}>{nomeBello(x.nome)}</span>
                    <span className="ed-sotto" style={{ display: "block" }}>{x.nati} nati, {x.corsi} in corsa · {euro(x.premi_per_nato)} a nato · il migliore {nomeBello(x.migliore)}</span>
                  </span>
                  <span className="tabular" style={{ fontWeight: 800, color: COLORI_GRAFICO.euro, whiteSpace: "nowrap" }}>{euroK(x.premi)}</span>
                </Link>
              ))}
            </div>
          )}
        </Riquadro>
      </div>
    </div>
  );
}

export default function GenerazioniPage() {
  const { data: d, error } = useQuery<any>({ queryKey: ["/api/generazioni"], queryFn: () => get("/api/generazioni"), staleTime: 3600_000 });
  const { data: genM } = useQuery<any>({ queryKey: ["/api/generazione-m"], queryFn: () => get("/api/generazione-m"), staleTime: 3600_000 });
  // Dal 25/11/2026 la pagina tiene anche le classifiche per eta': due linguette.
  const leggi = () => {
    const h = window.location.hash.replace(/^#/, "");
    const q = new URLSearchParams(h.split("?")[1] ?? "");
    const a = Number(q.get("anno"));
    const classifiche = h.startsWith("/classifiche-eta") || q.get("vista") === "classifiche";
    const e = q.get("eta");
    return { anno: Number.isInteger(a) && a > 1900 ? a : null, vista: classifiche ? "classifiche" as const : "annate" as const,
             eta: e === "2" || e === "3" || e === "4" || e === "anziani" ? e : "3" };
  };
  const [anno, setAnno] = useState<number | null>(() => leggi().anno);
  const [vista, setVista] = useState<"annate" | "classifiche">(() => leggi().vista);
  const [etaClass, setEtaClass] = useState<string>(() => leggi().eta);
  useEffect(() => {
    const f = () => { const l = leggi(); setVista(l.vista); setEtaClass(l.eta); if (l.anno) setAnno(l.anno); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const gen: any[] = d?.generazioni ?? [];
  useEffect(() => { if (gen.length && (anno == null || !gen.some(x => x.anno === anno))) setAnno(gen.filter(x => !x.in_corso).slice(-1)[0]?.anno ?? gen[gen.length - 1].anno); }, [d]);
  const scelta = gen.find(x => x.anno === anno);
  const linee = useMemo(() => gen.map(x => ({ ...x, record_mediano: x.record_mediano, record_migliore: x.record_migliore })), [d]);

  if (error) return <div className="page-shell"><div className="pannello" style={{ padding: 16 }}>Non riesco a leggere le generazioni adesso. Riprova tra poco.</div></div>;
  const colonne = (k: string, f: (v: number) => string, colore: string, scheda: (x: any) => string) => gen.map(x => ({
    chiave: x.anno, etichetta: String(x.anno).slice(2), valore: x[k] ?? 0, testo: "", colore: x.anno === anno ? "hsl(210 10% 92%)" : colore, tratteggio: x.in_corso,
    scheda: [{ testo: `Nati nel ${x.anno}${x.in_corso ? " (in corso)" : ""}` }, { testo: f(x[k] ?? 0) }, { testo: scheda(x) }],
  }));

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE + CSS_PULEDRO}</style>
      <IntestazionePagina icona={Layers} colore={COLORE} titolo="Generazioni ed età" margineSotto={14}
        sottotitolo="Ogni annata di nascita a confronto, e le classifiche dei migliori 2, 3, 4 anni e anziani.">
        {d ? <>Ci sono {gen.length} annate, dai nati nel {gen[0]?.anno} ai nati nel {gen[gen.length - 1]?.anno}. Le annate prima del 2012 vengono dal registro UNIRE:
          entrano qui da sole quando il recupero notturno le completa{d.in_recupero ? <> (adesso è in corso il {d.in_recupero.anno}, a {Math.round(100 * d.in_recupero.fatte / d.in_recupero.n)}%)</> : null}.
          Le annate a righe hanno carriere ancora in corso.</> : "Carico le annate…"}
      </IntestazionePagina>

      <div className="ed-linguette" role="tablist">
        {([["annate", "Le annate", "Statistiche e grafici per anno di nascita", Layers], ["classifiche", "Classifiche per età", "I migliori 2, 3, 4 anni e anziani", Medal]] as const).map(([k, t, h, Icona]) => (
          <button key={k} role="tab" className="ed-linguetta" aria-selected={vista === k} onClick={() => setVista(k)} data-testid={`tab-${k}`}>
            <Icona size={17} color={vista === k ? COLORE : "hsl(210 8% 50%)"} />
            <span><b>{t}</b><small>{h}</small></span>
          </button>
        ))}
      </div>

      {vista === "classifiche" ? <ClassificheEta incorporata etaIniziale={etaClass} /> : !d ? <Sagoma cornice righe={10} /> : <>
        <div className="ed-barra" style={{ flexWrap: "wrap", gap: 6 }} role="group" aria-label="Scegli l'annata">
          {gen.map(x => (
            <button key={x.anno} className="chip-filtro" aria-pressed={x.anno === anno} onClick={() => setAnno(x.anno)}
              style={{ fontWeight: x.anno === anno ? 800 : 600, borderColor: x.anno === anno ? COLORE : undefined, color: x.anno === anno ? COLORE : undefined, opacity: x.in_corso ? 0.8 : 1 }}>
              {x.anno}{x.in_corso ? "*" : ""}
            </button>
          ))}
        </div>

        {scelta && <Annata key={scelta.anno} g={scelta} totale={gen.filter(x => !x.in_corso)} />}

        <div className="ed-tit" style={{ marginTop: 26 }}>Le annate a confronto</div>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(460px, 100%), 1fr))" }}>
          <Riquadro titolo="Quanti nati e quanti corrono" nota="Cavalli nell'archivio per annata (in chiaro l'annata scelta).">
            <GraficoColonne altezza={170} colore={COLORI_GRAFICO.quantita} nomeAsse="nati nell'archivio" dati={colonne("nati", num, COLORI_GRAFICO.quantita, x => `${num(x.corsi)} hanno corso, il ${pc(x.quota_corsi)}`)} />
          </Riquadro>
          <Riquadro titolo="Premi vinti dall'annata" nota="Premi di carriera di tutti i nati dell'annata.">
            <GraficoColonne altezza={170} colore={COLORI_GRAFICO.euro} nomeAsse="premi di carriera" dati={colonne("premi_totali", euro, COLORI_GRAFICO.euro, x => `${euro(x.premi_medi)} per corridore`)} />
          </Riquadro>
          <Riquadro titolo="Quanto vince un corridore" nota="La media e il cavallo tipico (a metà della fila): la distanza fra le due linee dice quanto pesano i pochi campioni.">
            <Linee dati={linee} formato={euroK} linee={[
              { k: "premi_medi", nome: "media", colore: COLORI_GRAFICO.euro },
              { k: "premi_mediani", nome: "tipico", colore: "hsl(210 10% 70%)", tratteggio: true }]} />
          </Riquadro>
          <Riquadro titolo="Velocità: record al km" nota="Record mediano e migliore dell'annata. Più in alto, più veloci.">
            <Linee dati={linee} formato={km} inverti linee={[
              { k: "record_mediano", nome: "mediano", colore: COLORI_GRAFICO.quantita },
              { k: "record_migliore", nome: "migliore", colore: "hsl(210 10% 80%)", tratteggio: true }]} />
          </Riquadro>
          <Riquadro titolo="Chi corre e chi vince" nota="Quota dei nati che corre almeno una volta, e di chi corre che vince almeno una corsa.">
            <Linee dati={linee} formato={v => `${Math.round(v)}%`} dominio={[0, 100]} linee={[
              { k: "quota_corsi", nome: "corrono", colore: COLORI_GRAFICO.quantita },
              { k: "quota_vincitori", nome: "vincono", colore: COLORI_GRAFICO.buono }]} />
          </Riquadro>
          <Riquadro titolo="Quanto sono concentrati" nota="Quota dei premi presa dal 10% più ricco dell'annata, e quota dei nati figli dei primi 5 stalloni.">
            <Linee dati={linee} formato={v => `${Math.round(v)}%`} dominio={[0, 100]} linee={[
              { k: "quota_top10", nome: "premi al 10% più ricco", colore: COLORI_GRAFICO.euro },
              { k: "quota_primi5_padri", nome: "nati dai primi 5 stalloni", colore: "hsl(265 50% 70%)" }]} />
          </Riquadro>
          <Riquadro titolo="Maschi e femmine" nota="Premi medi per corridore, maschi (compresi i castroni) e femmine.">
            <Linee dati={linee} formato={euroK} linee={[
              { k: "premi_medi_maschi", nome: "maschi", colore: "hsl(212 70% 65%)" },
              { k: "premi_medi_femmine", nome: "femmine", colore: "hsl(330 60% 72%)" }]} />
          </Riquadro>
          <Riquadro titolo="Corse per corridore" nota="Quante corse fa in carriera, in media, un cavallo che corre.">
            <GraficoColonne altezza={170} colore={COLORI_GRAFICO.quantita} nomeAsse="corse in carriera" dati={colonne("corse_medie", v => v.toLocaleString("it-IT"), COLORI_GRAFICO.quantita, x => `${(x.vittorie_medie ?? 0).toLocaleString("it-IT")} vittorie in media`)} />
          </Riquadro>
        </div>

        <div className="ed-tit" style={{ marginTop: 26 }}>Tutte le annate</div>
        <div className="ed-pannello" style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 900, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "var(--ed-muto)", fontSize: 11, textAlign: "right" }}>
                {["Annata", "Nati", "Corrono", "Vincono", "Premi totali", "Per corridore", "Tipico", "Record mediano", "Sopra 100k", "Campione"].map((t, i) => (
                  <th key={t} style={{ padding: "9px 10px", textAlign: i === 0 || i === 9 ? "left" : "right", borderBottom: "1px solid var(--ed-bordo)", fontWeight: 600 }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...gen].reverse().map(x => (
                <tr key={x.anno} onClick={() => { setAnno(x.anno); window.scrollTo?.({ top: 0, behavior: "smooth" }); }}
                  style={{ cursor: "pointer", background: x.anno === anno ? `color-mix(in srgb, ${COLORE} 10%, transparent)` : undefined, borderBottom: "1px solid var(--ed-bordo)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 800, color: "var(--ed-testo)" }}>{x.anno}{x.in_corso ? <span style={{ color: "var(--ed-fioco)", fontWeight: 500 }}> in corso</span> : ""}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{num(x.nati)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{pc(x.quota_corsi)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{pc(x.quota_vincitori)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: COLORI_GRAFICO.euro }}>{euro(x.premi_totali)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{euro(x.premi_medi)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{euro(x.premi_mediani)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{km(x.record_mediano)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{num(x.sopra_100mila)}</td>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{x.campione ? <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>{nomeBello(x.campione.nome)} {x.campione.voto && <GradeBadge grade={x.campione.voto} size="sm" />}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {genM && (
          <div id="generazione-m">
            <div className="ed-tit" style={{ marginTop: 26 }}>La prossima generazione: i nati nel 2025</div>
            <GenerazioneM d={genM} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Spiegazione titolo="Da dove vengono i numeri e cosa non dicono">
            <p>Dal 2012 i numeri vengono dall'archivio delle corse; prima, dal registro UNIRE ricostruito di notte annata per annata. Un'annata storica compare
            qui solo quando il recupero l'ha finita: tutte le ricerche fatte e nessun cavallo ancora da leggere.</p>
            <p>«Nell'archivio» non è il numero ufficiale dei nati: dal registro UNIRE entrano anche i puledri che non hanno mai corso, mentre nelle annate recenti
            ne mancano alcuni. Per questo la quota di chi corre è più bassa nelle annate storiche: confrontate soprattutto i premi e i voti di chi ha corso.</p>
            <p>I premi sono in euro di allora, senza correggere l'inflazione. Il voto confronta ogni cavallo con i nati del suo anno, quindi la sua distribuzione
            è simile in ogni annata: dice chi spicca dentro l'annata, non quale annata è più forte. I premi «per età» compaiono solo per le annate di cui
            l'archivio ha quasi tutte le corse.</p>
          </Spiegazione>
        </div>
      </>}

      <CollegamentiCorrelati voci={[
        { href: "/leaderboard", titolo: "Cavalli e classifica", descrizione: "Tutti i cavalli valutati, con voti e filtri" },
        { href: "/qualifiche", titolo: "Qualifiche", descrizione: "Il primo tempo ufficiale dei giovani" },
        { href: "/stalloni/classifiche", titolo: "Classifiche stalloni", descrizione: "Gli stalloni stagione per stagione" },
      ]} />
    </div>
  );
}
