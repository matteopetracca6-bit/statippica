/**
 * Come si fa il pronostico: dalle corse al calendario, i modelli XGBoost con i
 * loro pesi, le prove contro i metodi semplici e contro il mercato, la
 * taratura, e com'e' andato dal vivo. Tutti i numeri vengono dai file che i
 * modelli scrivono quando si allenano (modelli/*_verifica.json) e dalla
 * verifica del calendario: nessun numero e' scritto a mano, tranne le prove
 * del simulatore (lib/provaSimulatore.ts, le stesse del simulatore).
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import IntestazionePagina from "../components/IntestazionePagina";
import Sagoma from "../components/Sagoma";
import GraficoColonne, { COLORI_GRAFICO, STILE_SCHEDA } from "../components/GraficoColonne";
import { CSS_DUE_COLONNE, Cifra } from "../components/DueColonne";
import { PROVA, PROVA_XGB } from "@/lib/provaSimulatore";

const COLORE = "hsl(40 40% 72%)";
const MUTED = "hsl(210 8% 55%)";
const NOI = "hsl(183 70% 48%)";
const MERCATO = "hsl(40 70% 60%)";

const pc = (x: number | null | undefined, d = 1) => x == null ? "—" : `${(x * 100).toFixed(d).replace(".", ",")}%`;
const pcN = (x: number | null | undefined, d = 1) => x == null ? "—" : `${x.toFixed(d).replace(".", ",")}%`;
const n0 = (x: number | null | undefined) => x == null ? "—" : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dec = (x: number | null | undefined, d = 3) => x == null ? "—" : x.toFixed(d).replace(".", ",");
const data = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Il nome in italiano di ogni variabile del modello. */
const NOMI: Record<string, string> = {
  h_n: "corse in carriera", h_top3: "quota nei primi tre in carriera", h_vitt: "quota di vittorie in carriera",
  h_ult5_top3: "primi tre nelle ultime 5 corse", h_ult3_pos: "piazzamento medio nelle ultime 3", h_ult_top3: "primi tre nell'ultima corsa",
  h_giorni: "giorni dall'ultima corsa", h_premi_365: "premi nell'ultimo anno", h_gare_365: "corse nell'ultimo anno",
  h_tempo_migl: "miglior tempo al km", h_tempo_ult: "tempo al km dell'ultima corsa",
  h_pista_top3: "primi tre su questa pista", h_pista_n: "corse su questa pista", eta: "età", maschio: "maschio o femmina",
  d_top3: "guidatore: quota nei primi tre", d_n: "guidatore: corse guidate",
  partenza: "numero di partenza", partenti: "quanti partenti", partenza_rel: "numero di partenza sul totale",
  r_ult5_top3: "forma recente: posto nella corsa", r_premi_365: "premi dell'anno: posto nella corsa",
  r_top3: "piazzamenti in carriera: posto nella corsa", r_tempo_migl: "miglior tempo: posto nella corsa",
  r_d_top3: "guidatore: posto nella corsa", s_ult5_top3: "forma recente contro la media della corsa",
  s_premi_365: "premi dell'anno contro la media della corsa", s_tempo_migl: "miglior tempo contro la media della corsa",
  distanza: "distanza", dist_handicap: "metri di penalità", dist_vs_solita: "distanza rispetto alla sua solita",
  h_fascia_top3: "primi tre su questa distanza", h_fascia_n: "corse su questa distanza", r_fascia_top3: "risultati sulla distanza: posto nella corsa",
  a_top3: "allenatore: quota nei primi tre", a_n: "allenatore: corse", a_top3_365: "allenatore: primi tre nell'ultimo anno",
  r_a_top3: "allenatore: posto nella corsa", h_classe5: "livello delle ultime 5 corse", h_classe_top3: "livello delle corse a podio",
  r_classe5: "livello: posto nella corsa", s_classe5: "livello contro la media della corsa",
  h_ind_migl: "indice di velocità migliore", h_ind_med5: "indice di velocità medio (ultime 5)",
  r_ind_migl: "indice migliore: posto nella corsa", s_ind_med5: "indice medio contro la media della corsa",
  h2h: "scontri diretti con questi avversari", h2h_n: "quanti scontri diretti",
  campo_premi: "forza degli avversari (premi)", campo_vs_solito: "avversari rispetto ai suoi soliti",
  d_top3_30: "guidatore: primi tre negli ultimi 30 giorni", d_n_30: "guidatore: corse negli ultimi 30 giorni",
  r_d_top3_30: "guidatore ultimi 30 giorni: posto nella corsa", a_top3_30: "allenatore: primi tre negli ultimi 30 giorni",
  a_n_30: "allenatore: corse negli ultimi 30 giorni",
  oggi_scalzo_ant: "oggi scalzo davanti", oggi_scalzo_post: "oggi scalzo dietro", cambio_ferri: "cambia la ferratura",
  toglie_ferri: "toglie i ferri", h_top3_scalzo: "primi tre quando corre scalzo", h_top3_ferrato: "primi tre quando corre ferrato",
  h_scalzo_quota: "quante volte corre scalzo",
};

/** Gli stessi gruppi di pronostico_top3.py (GRUPPI), quelli dei "motivi" in calendario. */
const GRUPPI: [string, string[]][] = [
  ["Carriera", ["h_n", "h_top3", "h_vitt", "r_top3"]],
  ["Forma recente", ["h_ult5_top3", "h_ult3_pos", "h_ult_top3", "r_ult5_top3", "s_ult5_top3"]],
  ["Tempi e velocità", ["h_tempo_migl", "h_tempo_ult", "r_tempo_migl", "s_tempo_migl", "h_ind_migl", "h_ind_med5", "r_ind_migl", "s_ind_med5"]],
  ["Partenza", ["partenza", "partenza_rel", "partenti"]],
  ["Guidatore", ["d_top3", "d_n", "r_d_top3", "d_top3_30", "d_n_30", "r_d_top3_30"]],
  ["Allenatore", ["a_top3", "a_n", "a_top3_365", "r_a_top3", "a_top3_30", "a_n_30"]],
  ["Premi", ["h_premi_365", "h_gare_365", "r_premi_365", "s_premi_365"]],
  ["Livello delle corse", ["h_classe5", "h_classe_top3", "r_classe5", "s_classe5"]],
  ["Distanza", ["distanza", "dist_handicap", "dist_vs_solita", "h_fascia_top3", "h_fascia_n", "r_fascia_top3"]],
  ["Pista", ["h_pista_top3", "h_pista_n"]],
  ["Avversari di oggi", ["campo_premi", "campo_vs_solito"]],
  ["Scontri diretti", ["h2h", "h2h_n"]],
  ["Ferratura", ["oggi_scalzo_ant", "oggi_scalzo_post", "cambio_ferri", "toglie_ferri", "h_top3_scalzo", "h_top3_ferrato", "h_scalzo_quota"]],
  ["Riposo", ["h_giorni"]],
  ["Età e sesso", ["eta", "maschio"]],
];
const GRUPPO_DI: Record<string, string> = Object.fromEntries(GRUPPI.flatMap(([g, vs]) => vs.map(v => [v, g])));

const CSS = `
.mp-griglia2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.mp-griglia2 > * { min-width: 0; }
.mp-testo { font-size: 13.5px; line-height: 1.7; color: hsl(210 10% 80%); }
.mp-testo p { margin: 0 0 10px; }
.mp-nota { font-size: 11.5px; color: ${MUTED}; margin-top: 8px; line-height: 1.5; }
.mp-passi { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
.mp-passo { padding: 12px 13px; border-radius: 11px; background: var(--ed-fondo2); border: 1px solid var(--ed-bordo); min-width: 0; }
.mp-passo .ora { font-size: 10.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ed-acc); }
.mp-passo b { display: block; font-size: 13.5px; color: var(--ed-testo); margin: 3px 0 4px; }
.mp-passo span { font-size: 12px; color: var(--ed-muto); line-height: 1.5; display: block; }
.mp-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.mp-tab th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ed-fioco); font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--ed-bordo); white-space: nowrap; }
.mp-tab td { padding: 7px 8px; border-bottom: 1px solid var(--ed-bordo); color: var(--ed-testo); }
.mp-tab td.n, .mp-tab th.n { text-align: right; white-space: nowrap; }
.mp-tab tr[data-noi="true"] td { color: var(--ed-acc); font-weight: 700; }
.mp-scorre { overflow-x: auto; }
.mp-peso { display: grid; grid-template-columns: minmax(0, 1fr) minmax(70px, 38%) 46px; gap: 8px; align-items: center; padding: 4px 0; font-size: 12.5px; }
.mp-peso .barra { height: 8px; border-radius: 4px; background: hsl(220 10% 16%); overflow: hidden; }
.mp-peso .barra i { display: block; height: 100%; border-radius: 4px; }
.mp-peso .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--ed-muto); }
.mp-peso small { color: var(--ed-fioco); }
@media (max-width: 860px) { .mp-griglia2 { grid-template-columns: minmax(0, 1fr); } }
`;

function Titolo({ children, sotto }: { children: React.ReactNode; sotto?: React.ReactNode }) {
  return <>
    <div className="ed-tit" style={{ marginBottom: sotto ? 2 : 10 }}>{children}</div>
    {sotto && <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>{sotto}</div>}
  </>;
}

const tooltip = { contentStyle: STILE_SCHEDA as any, labelStyle: { color: "hsl(210 10% 85%)" } };
const assi = { stroke: "hsl(210 8% 40%)", fontSize: 11, tickLine: false };

function Pesi({ notte, mattino }: { notte: any; mattino: any }) {
  const [quale, setQuale] = useState<"notte" | "mattino">("notte");
  const [vista, setVista] = useState<"gruppi" | "variabili">("gruppi");
  const m = quale === "notte" ? notte : mattino;
  const pesi: { variabile: string; peso: number }[] = m?.peso_variabili ?? [];
  const tot = pesi.reduce((a, p) => a + p.peso, 0) || 1;
  const gruppi = useMemo(() => {
    const g = new Map<string, { peso: number; vs: { variabile: string; peso: number }[] }>();
    for (const p of pesi) {
      const k = GRUPPO_DI[p.variabile] ?? "Altro";
      const x = g.get(k) ?? { peso: 0, vs: [] };
      x.peso += p.peso; x.vs.push(p); g.set(k, x);
    }
    return Array.from(g.entries()).sort((a, b) => b[1].peso - a[1].peso);
  }, [pesi]);
  const righe = vista === "gruppi"
    ? gruppi.map(([k, x]) => ({ k, nome: k, peso: x.peso / tot, sotto: x.vs.sort((a, b) => b.peso - a.peso).slice(0, 3).map(v => NOMI[v.variabile] ?? v.variabile).join(" · ") }))
    : [...pesi].sort((a, b) => b.peso - a.peso).slice(0, 25).map(p => ({ k: p.variabile, nome: NOMI[p.variabile] ?? p.variabile, peso: p.peso / tot, sotto: GRUPPO_DI[p.variabile] ?? "" }));
  const max = Math.max(...righe.map(r => r.peso), 0.01);
  return (
    <div className="ed-pannello">
      <div className="ed-barra" style={{ marginBottom: 10 }}>
        <div className="ed-segm" role="group" aria-label="Quale modello">
          <button aria-pressed={quale === "notte"} onClick={() => setQuale("notte")}>Stima della notte</button>
          <button aria-pressed={quale === "mattino"} onClick={() => setQuale("mattino")}>Stima del mattino</button>
        </div>
        <div className="ed-segm" role="group" aria-label="Come raggruppare">
          <button aria-pressed={vista === "gruppi"} onClick={() => setVista("gruppi")}>Per gruppo</button>
          <button aria-pressed={vista === "variabili"} onClick={() => setVista("variabili")}>Le 25 variabili più pesanti</button>
        </div>
      </div>
      {righe.map(r => (
        <div className="mp-peso" key={r.k} data-testid="peso-variabile">
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "hsl(210 10% 88%)", overflowWrap: "anywhere" }}>{r.nome}</div>
            {r.sotto && <small>{r.sotto}</small>}
          </div>
          <div className="barra"><i style={{ width: `${(r.peso / max) * 100}%`, background: COLORE }} /></div>
          <div className="v">{pcN(r.peso * 100)}</div>
        </div>
      ))}
      <div className="mp-nota">
        Il peso è il "guadagno" di XGBoost: quanto ogni variabile, sommata su tutti i {n0(m?.alberi)} alberi, ha ridotto l'errore
        durante l'allenamento, in percentuale del totale. Dice quanto il modello la usa, non in che verso: un numero di partenza
        alto può pesare molto proprio perché penalizza. Le variabili che dicono la stessa cosa si dividono il peso tra loro, per
        questo conviene guardarle per gruppo. Il modello della vittoria usa le stesse {m?.peso_variabili?.length ?? 55} variabili
        della notte, ma i suoi pesi non sono stati salvati.
      </div>
    </div>
  );
}

function Taratura({ fasce, titolo }: { fasce: any[]; titolo: string }) {
  const righe = (fasce ?? []).map(f => ({
    fascia: `${Math.round(f.da * 100)}–${Math.round(f.a * 100)}%`,
    stimato: Math.round(f.stimato * 1000) / 10, reale: Math.round(f.reale * 1000) / 10, n: f.n,
  }));
  return (
    <div className="ed-pannello">
      <div className="ed-etich" style={{ marginBottom: 8 }}>{titolo}</div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={righe} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="hsl(220 10% 16%)" vertical={false} />
            <XAxis dataKey="fascia" {...assi} interval={0} angle={-25} textAnchor="end" height={44} />
            <YAxis {...assi} unit="%" />
            <Tooltip {...tooltip} formatter={(v: any, k: any) => [`${String(v).replace(".", ",")}%`, k === "stimato" ? "stimato" : "è successo"]}
              labelFormatter={(l: any, p: any) => `fascia ${l} · ${n0(p?.[0]?.payload?.n)} cavalli`} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k: any) => k === "stimato" ? "stimato" : "è successo davvero"} />
            <Bar dataKey="stimato" fill="hsl(220 8% 45%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="reale" fill={NOI} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function MetodoPronosticoPage() {
  const { data: d } = useQuery<any>({ queryKey: ["/api/metodo/pronostico"], staleTime: 30 * 60_000 });
  const { data: live } = useQuery<any>({ queryKey: ["/api/calendar/verifica?giorni=30"], staleTime: 10 * 60_000 });
  const { data: ctrl } = useQuery<{ mesi: any[] }>({ queryKey: ["/api/controllo-modelli"], staleTime: 30 * 60_000 });

  const notte = d?.notte, mattino = d?.mattino, vince = d?.vince, gal = d?.galoppo, q = d?.quote, arch = d?.archivio;
  const cc = notte?.campo_completo, ccM = mattino?.campo_completo;
  const ld = live?.sintesi?.del_giorno ?? live?.sintesi?.tutte;
  const mesi = (ctrl?.mesi ?? []).filter(m => m.modello === "primi_tre").slice().reverse();

  const confronto = cc ? [
    { k: "caso", etichetta: "a caso", valore: (q?.a_caso ?? 0.381) * 100, colore: COLORI_GRAFICO.spento },
    { k: "part", etichetta: "solo il numero", valore: cc.solo_partenza.tre_scelti_a_segno * 100, colore: COLORI_GRAFICO.spento },
    { k: "voto", etichetta: "voto del sito", valore: cc.voto_attuale.tre_scelti_a_segno * 100, colore: COLORI_GRAFICO.medio },
    { k: "notte", etichetta: "XGBoost notte", valore: cc.modello_normalizzato.tre_scelti_a_segno * 100, colore: NOI },
    ...(ccM ? [{ k: "mattino", etichetta: "XGBoost mattino", valore: ccM.modello_normalizzato.tre_scelti_a_segno * 100, colore: NOI }] : []),
  ].map(c => ({ chiave: c.k, etichetta: c.etichetta, valore: c.valore, colore: c.colore, testo: pcN(c.valore),
    scheda: [{ testo: c.etichetta }, { testo: `${pcN(c.valore)} dei tre scelti nei primi tre` }] })) : [];

  const andamento = (live?.andamento ?? []).map((x: any) => ({
    data: new Date(x.data + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
    favoriti: x.quota_favoriti, corse: x.corse,
  }));
  const distribuzione = (ld?.distribuzione ?? []) as number[];
  const totD = distribuzione.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE + CSS}</style>
      <IntestazionePagina icona={Target} colore={COLORE} titolo="Come si fa il pronostico" margineSotto={14}
        sottotitolo="Dalle corse al calendario, i modelli XGBoost e i loro pesi, le prove contro i metodi semplici e contro il mercato, e com'è andato dal vivo.">
        Ogni numero di questa pagina viene dai file che i modelli scrivono quando si allenano e dalla verifica del calendario,
        che ogni giorno confronta il pronostico con l'arrivo vero. Le prove sono fatte su corse che il modello non ha mai visto.
      </IntestazionePagina>

      {!d ? <Sagoma cornice righe={10} /> : <>
        {/* IN SINTESI */}
        <div className="ed-cifre" data-testid="metodo-cifre">
          <Cifra titolo="Tre favoriti a segno" valore={pc(cc?.modello_normalizzato?.tre_scelti_a_segno)} colore={NOI}
            sotto={<>in prova, notte · a caso {pc(q?.a_caso, 0)}</>} />
          <Cifra titolo="Con i ferri del mattino" valore={pc(ccM?.modello_normalizzato?.tre_scelti_a_segno)} colore={NOI}
            sotto="stessa prova, quando la ferratura è nota" />
          <Cifra titolo="Primo favorito vince" valore={pc(vince?.modello?.primo_scelto_vince)} colore={NOI}
            sotto="modello della vittoria, in prova" />
          <Cifra titolo="Dal vivo, 30 giorni" valore={pcN(ld?.quota_favoriti)} colore={COLORE}
            sotto={ld ? <>{n0(ld.corse)} corse con la stima del giorno</> : "carico…"} />
        </div>

        {/* DALLE CORSE AL CALENDARIO */}
        <Titolo sotto="Il giro di ogni giorno, da quando escono i partenti a quando il pronostico viene controllato con l'arrivo.">Dalle corse al calendario</Titolo>
        <div className="mp-passi">
          <div className="mp-passo"><div className="ora">Sera e notte</div><b>Arrivano i partenti</b>
            <span>Dalle pagine dei convegni si leggono le corse dei prossimi giorni: pista, ora, distanza, numero di partenza, guidatore, tipo di partenza.
              {arch?.calendario ? <> Ora in calendario: {n0(arch.calendario.corse)} corse in {n0(arch.calendario.riunioni)} riunioni, {n0(arch.calendario.partenti)} partenti.</> : null}</span></div>
          <div className="mp-passo"><div className="ora">Dalle 01:00</div><b>Stima della notte</b>
            <span>Per ogni partente si calcolano {notte?.peso_variabili?.length ?? 55} variabili con i soli dati di prima della corsa, e il modello stima la probabilità di finire nei primi tre e di vincere.</span></div>
          <div className="mp-passo"><div className="ora">Mattino</div><b>Stima con i ferri</b>
            <span>Quando escono le ferrature (scalzo davanti, dietro, cambi) e sono note per almeno metà dei partenti, la corsa passa al modello del mattino, che ne usa {mattino?.peso_variabili?.length ?? 62}.</span></div>
          <div className="mp-passo"><div className="ora">In corsa</div><b>Le percentuali si sommano</b>
            <span>Dentro ogni corsa le probabilità vengono riportate a 3 (primi tre) e a 1 (vittoria): non si possono avere quattro cavalli al 90%.</span></div>
          <div className="mp-passo"><div className="ora">Sera e mattina dopo</div><b>Arrivi e verifica</b>
            <span>Si leggono gli arrivi e si confrontano con la stima mostrata quel giorno, che resta salvata: è "Com'è andato il pronostico" in calendario. Un secondo giro alle 11 recupera gli arrivi in ritardo.</span></div>
          <div className="mp-passo"><div className="ora">Il 2 del mese</div><b>Nuovo allenamento</b>
            <span>I modelli si riallenano con i dati nuovi e prendono il posto dei vecchi solo se vanno meglio sulla stessa prova. Ogni mese un controllo automatico avvisa se il pronostico scende sotto la prova.</span></div>
        </div>
        <div className="mp-nota">
          {arch?.storico ? <>Le stime mostrate in calendario sono salvate dal {data(arch.storico.da)}: {n0(arch.storico.corse)} corse, {n0(arch.storico.stime)} cavalli. </> : null}
          {arch?.corse_archivio ? <>L'archivio da cui imparano i modelli ha {n0(arch.corse_archivio.n)} partenze dal {data(arch.corse_archivio.da)}.</> : null}
        </div>

        {/* I MODELLI */}
        <Titolo sotto="Tutti sono XGBoost: centinaia di alberi di decisione piccoli, ognuno corregge l'errore dei precedenti.">I modelli</Titolo>
        <div className="ed-pannello mp-scorre">
          <table className="mp-tab">
            <thead><tr><th>Modello</th><th>Cosa stima</th><th className="n">Alberi</th><th className="n">Variabili</th><th>Impara da</th><th>Provato su</th><th className="n">Risultato in prova</th></tr></thead>
            <tbody>
              <tr><td><b>Notte</b> <small style={{ color: MUTED }}>{notte?.nome}</small></td><td>primi tre</td><td className="n">{n0(notte?.alberi)}</td><td className="n">{notte?.peso_variabili?.length}</td>
                <td>{notte?.periodo_allenamento ? `${notte.periodo_allenamento.da.slice(0, 4)}–${notte.periodo_allenamento.a.slice(0, 4)}` : "—"}</td>
                <td>{n0(notte?.periodo_prova?.corse)} corse dal {data(notte?.periodo_prova?.da)}</td><td className="n">{pc(cc?.modello_normalizzato?.tre_scelti_a_segno)} tre a segno</td></tr>
              <tr><td><b>Mattino</b> <small style={{ color: MUTED }}>{mattino?.nome}</small></td><td>primi tre, con i ferri</td><td className="n">{n0(mattino?.alberi)}</td><td className="n">{mattino?.peso_variabili?.length}</td>
                <td>{mattino?.periodo_allenamento ? `${mattino.periodo_allenamento.da.slice(0, 4)}–${mattino.periodo_allenamento.a.slice(0, 4)}` : "—"}</td>
                <td>stesse corse</td><td className="n">{pc(ccM?.modello_normalizzato?.tre_scelti_a_segno)} tre a segno</td></tr>
              <tr><td><b>Vittoria</b> <small style={{ color: MUTED }}>{vince?.nome}</small></td><td>chi vince</td><td className="n">{n0(vince?.alberi)}</td><td className="n">{vince?.variabili?.length ?? "—"}</td>
                <td>come la notte</td><td>{vince?.periodo_prova ? `${n0(vince.periodo_prova.corse)} corse` : "stesse corse"}</td><td className="n">{pc(vince?.modello?.primo_scelto_vince)} primo favorito vince</td></tr>
              <tr><td><b>Galoppo</b> <small style={{ color: MUTED }}>{gal?.nome}</small></td><td>squalifica per galoppo</td><td className="n">{n0(gal?.alberi)}</td><td className="n">—</td>
                <td>{gal?.periodi?.impara ?? "—"}</td><td>{n0(gal?.partenze_prova)} partenze {gal?.periodi?.prova}</td><td className="n">AUC {dec(gal?.auc_modello, 2)}</td></tr>
              <tr><td><b>Simulatore</b></td><td>la corsa metro per metro</td><td className="n">—</td><td className="n">—</td>
                <td>tempi al km dell'archivio</td><td>{PROVA_XGB.corse} corse vere</td><td className="n">{pcN(PROVA_XGB.favoritoVince.tarato)} favorito vince</td></tr>
            </tbody>
          </table>
          <div className="mp-nota">
            La notte e il mattino imparano dalle corse fino al {data(notte?.periodo_allenamento?.a)} ({n0(notte?.periodo_allenamento?.partenze)} partenze) e
            sono messi alla prova dal {data(notte?.periodo_prova?.da)} al {data(notte?.periodo_prova?.a)}. "Tre a segno" è la quota dei tre cavalli più probabili
            di ogni corsa che finiscono davvero nei primi tre, contata sulle {n0(cc?.corse)} corse in cui erano noti tutti i partenti.
            L'"indice di velocità" è il tempo al km meno il tempo tipico di quella pista e di quella distanza nell'anno prima: così un 1'14" a Milano e uno a Montegiorgio si possono confrontare.
          </div>
        </div>

        {/* PESI */}
        <Titolo sotto="Quanto ogni informazione conta nel modello: prima per gruppo, poi una per una.">Cosa pesa di più: i pesi di XGBoost</Titolo>
        <Pesi notte={notte} mattino={mattino} />

        {/* CONTRO I METODI SEMPLICI */}
        <Titolo sotto={`Sulle ${n0(cc?.corse)} corse di prova con tutti i partenti noti: quante volte i tre scelti finiscono nei primi tre.`}>Contro i metodi semplici</Titolo>
        <div className="mp-griglia2">
          <div className="ed-pannello">
            <GraficoColonne dati={confronto} altezza={180} massimo={70} nomeAsse="tre scelti a segno, in percentuale" formatoGuida={v => `${Math.round(v)}%`} />
          </div>
          <div className="ed-pannello mp-scorre">
            <table className="mp-tab">
              <thead><tr><th>Metodo</th><th className="n">Tre a segno</th><th className="n">AUC</th><th className="n">Errore (log loss)</th></tr></thead>
              <tbody>
                {cc && ([
                  ["Solo il numero di partenza", cc.solo_partenza],
                  ["Solo la forma recente", notte.solo_forma],
                  ["Il voto del sito", cc.voto_attuale],
                  ["Modello precedente (v4)", notte.modello_precedente],
                  ["XGBoost notte (v5)", cc.modello_normalizzato, true],
                  ["XGBoost mattino", ccM?.modello_normalizzato, true],
                ] as [string, any, boolean?][]).filter(r => r[1]).map(([t, m, noi]) => (
                  <tr key={t} data-noi={noi ? "true" : undefined}><td>{t}</td><td className="n">{pc(m.tre_scelti_a_segno)}</td><td className="n">{dec(m.auc)}</td><td className="n">{dec(m.log_loss)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mp-nota">
              L'AUC dice quanto spesso il modello mette un cavallo arrivato nei primi tre sopra uno che non ci è arrivato (0,5 è il caso, 1 la perfezione).
              Il log loss misura l'errore delle percentuali: più basso è meglio. "Solo la forma" e il modello precedente sono contati su tutte le corse di prova,
              non solo su quelle con tutti i partenti noti.
            </div>
          </div>
        </div>

        {/* TARATURA */}
        <Titolo sotto="Se il pronostico dice 30%, quei cavalli devono finire nei primi tre circa 30 volte su 100. Le colonne a confronto, fascia per fascia.">Le percentuali sono oneste?</Titolo>
        <div className="mp-griglia2">
          <Taratura fasce={notte?.fasce} titolo={`In prova: ${n0(notte?.periodo_prova?.partenze)} partenze`} />
          {ld?.fasce?.length ? (
            <Taratura titolo={`Dal vivo, ultimi 30 giorni`}
              fasce={ld.fasce.map((f: any) => ({ da: f.da / 100, a: f.a / 100, n: f.n, stimato: f.stimato / 100, reale: f.reale / 100 }))} />
          ) : <div className="ed-pannello ed-vuoto">Carico la verifica dal vivo…</div>}
        </div>
        <div className="mp-nota">
          Dopo l'allenamento le probabilità passano da una "temperatura" ({dec(notte?.temperatura, 2)} per la notte, {dec(mattino?.temperatura, 2)} per il mattino) che le
          rende un po' meno sicure di sé, scelta sul 2024 e non sulle corse di prova.
        </div>

        {/* CONTRO IL MERCATO */}
        {q && <>
          <Titolo sotto={`Le quote finali del totalizzatore su ${n0(q.periodo?.corse)} corse (${data(q.periodo?.da)} – ${data(q.periodo?.a)}). Il pubblico vede anche cose che la sera prima non si sanno: stato del cavallo, ritiri, voci di scuderia.`}>Contro il mercato</Titolo>
          <div className="mp-griglia2">
            <div className="ed-pannello">
              <div className="ed-etich" style={{ marginBottom: 8 }}>Tre a segno, mese per mese</div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={(q.per_mese ?? []).map((m: any) => ({ ...m, noi: m.noi * 100, mercato: m.mercato * 100,
                    mese: new Date(m.mese + "-01T12:00:00").toLocaleDateString("it-IT", { month: "short", year: "2-digit" }) }))}
                    margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(220 10% 16%)" vertical={false} />
                    <XAxis dataKey="mese" {...assi} />
                    <YAxis {...assi} domain={[40, 65]} unit="%" />
                    <Tooltip {...tooltip} formatter={(v: any, k: any) => [pcN(v), k === "noi" ? "pronostico" : "mercato"]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k: any) => k === "noi" ? "pronostico" : "favoriti del mercato"} />
                    <Line dataKey="noi" stroke={NOI} strokeWidth={2} dot={false} />
                    <Line dataKey="mercato" stroke={MERCATO} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="ed-pannello mp-scorre">
              <table className="mp-tab">
                <thead><tr><th></th><th className="n">Tre a segno</th><th className="n">Il primo nei tre</th><th className="n">Log loss</th></tr></thead>
                <tbody>
                  <tr data-noi="true"><td>Pronostico</td><td className="n">{pc(q.noi?.tre_scelti_a_segno)}</td><td className="n">{pc(q.noi?.primo_scelto_nei_tre)}</td><td className="n">{dec(q.noi?.log_loss)}</td></tr>
                  <tr><td>Mercato</td><td className="n">{pc(q.mercato?.tre_scelti_a_segno)}</td><td className="n">{pc(q.mercato?.primo_scelto_nei_tre)}</td><td className="n">{dec(q.mercato?.log_loss)}</td></tr>
                  {q.insieme?.mercato_piu_noi && <tr><td>Insieme ({q.insieme.provato_su})</td><td className="n">{pc(q.insieme.mercato_piu_noi.tre_scelti_a_segno)}</td><td className="n">{pc(q.insieme.mercato_piu_noi.primo_scelto_nei_tre)}</td><td className="n">{dec(q.insieme.mercato_piu_noi.log_loss)}</td></tr>}
                </tbody>
              </table>
              {q.accordo && <div className="mp-testo" style={{ fontSize: 12.5, marginTop: 10 }}>
                <p>I favoriti sono gli stessi del mercato {pc(q.accordo.favoriti_in_comune, 0)} delle volte. Quando li scegliamo entrambi finiscono nei primi tre
                  il {pc(q.accordo.in_comune?.nei_tre, 0)} delle volte; quando li sceglie solo il pronostico il {pc(q.accordo.solo_nostri?.nei_tre, 0)},
                  quando li sceglie solo il mercato il {pc(q.accordo.solo_del_mercato?.nei_tre, 0)}.</p>
              </div>}
              <div className="mp-nota">
                Il pronostico sbaglia meno nelle percentuali (log loss più basso) ma il mercato sceglie un po' meglio i tre favoriti. Messi insieme fanno meglio
                di tutti e due: per questo il simulatore può mescolare metà del mercato. Questo confronto è fatto con il modello {q.modello}: si rifà quando
                arrivano altre quote.
              </div>
            </div>
          </div>
        </>}

        {/* DAL VIVO */}
        <Titolo sotto="Solo le stime mostrate quel giorno in calendario, prima della corsa, contro l'arrivo vero.">Com'è andato dal vivo</Titolo>
        {!live ? <Sagoma cornice righe={5} /> : <>
          <div className="ed-cifre">
            <Cifra titolo="Favoriti a segno" valore={pcN(ld?.quota_favoriti)} colore={COLORE} sotto={`prova: ${pc(cc?.modello_normalizzato?.tre_scelti_a_segno)}`} />
            <Cifra titolo="Il primo nei tre" valore={pcN(ld?.primo_favorito_top3)} sotto="il cavallo più probabile" />
            <Cifra titolo="Il primo vince" valore={pcN(ld?.primo_favorito_vince)} sotto="il più probabile vince la corsa" />
            <Cifra titolo="Vincitore tra i tre" valore={pcN(ld?.vincitore_tra_favoriti)} sotto="il vincitore era tra i tre favoriti" />
          </div>
          <div className="mp-griglia2" style={{ marginTop: 14 }}>
            <div className="ed-pannello">
              <div className="ed-etich" style={{ marginBottom: 8 }}>Giorno per giorno</div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={andamento} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(220 10% 16%)" vertical={false} />
                    <XAxis dataKey="data" {...assi} minTickGap={18} />
                    <YAxis {...assi} domain={[20, 80]} unit="%" />
                    <Tooltip {...tooltip} formatter={(v: any) => [pcN(v), "favoriti a segno"]}
                      labelFormatter={(l: any, p: any) => `${l} · ${p?.[0]?.payload?.corse ?? "?"} corse`} />
                    {cc && <ReferenceLine y={cc.modello_normalizzato.tre_scelti_a_segno * 100} stroke={COLORE} strokeDasharray="4 4"
                      label={{ value: "prova", fill: COLORE, fontSize: 10, position: "insideTopLeft" }} />}
                    {q?.a_caso && <ReferenceLine y={q.a_caso * 100} stroke="hsl(220 8% 45%)" strokeDasharray="2 4"
                      label={{ value: "a caso", fill: "hsl(220 8% 55%)", fontSize: 10, position: "insideBottomLeft" }} />}
                    <Line dataKey="favoriti" stroke={NOI} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="ed-pannello">
              <div className="ed-etich" style={{ marginBottom: 8 }}>Quanti dei tre favoriti arrivano nei primi tre</div>
              <GraficoColonne altezza={170} nomeAsse="favoriti nei primi tre, per corsa" formatoGuida={v => `${Math.round(v)}%`}
                dati={distribuzione.map((x, i) => ({ chiave: i, etichetta: i === 0 ? "nessuno" : i === 3 ? "tutti e tre" : String(i), valore: (x / totD) * 100,
                  testo: pcN((x / totD) * 100, 0), colore: i >= 2 ? COLORI_GRAFICO.buono : i === 1 ? COLORI_GRAFICO.medio : COLORI_GRAFICO.scarso,
                  scheda: [{ testo: `${n0(x)} corse` }] }))} />
              <div className="mp-nota">In media ne arrivano {dec(ld?.arrivati_per_corsa, 2)} a corsa; il pronostico se ne aspettava {dec(ld?.attesi_per_corsa, 2)}.</div>
            </div>
          </div>
          <div className="mp-griglia2" style={{ marginTop: 14 }}>
            <div className="ed-pannello mp-scorre">
              <div className="ed-etich" style={{ marginBottom: 6 }}>Pista per pista</div>
              <table className="mp-tab">
                <thead><tr><th>Pista</th><th className="n">Corse</th><th className="n">Favoriti a segno</th></tr></thead>
                <tbody>
                  {(live.piste ?? []).slice(0, 14).map((p: any) => (
                    <tr key={p.pista}><td>{p.pista}</td><td className="n">{p.corse}</td>
                      <td className="n" style={{ color: p.quota_favoriti >= 55 ? COLORI_GRAFICO.buono : p.quota_favoriti < 45 ? COLORI_GRAFICO.scarso : undefined }}>{pcN(p.quota_favoriti)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="mp-nota">Con poche corse la quota di una pista oscilla molto: dieci corse sono trenta favoriti, tre in più o in meno spostano di 10 punti.</div>
            </div>
            <div className="ed-pannello mp-scorre">
              <div className="ed-etich" style={{ marginBottom: 6 }}>Controllo mensile automatico</div>
              {mesi.length ? (
                <table className="mp-tab">
                  <thead><tr><th>Mese</th><th className="n">Corse</th><th className="n">Favoriti a segno</th><th className="n">A caso</th><th>Stato</th></tr></thead>
                  <tbody>
                    {mesi.map(m => (
                      <tr key={m.mese}><td style={{ textTransform: "capitalize" }}>{new Date(m.mese + "-01T12:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</td>
                        <td className="n">{m.corse}</td><td className="n">{pc(m.quota_favoriti, 0)}</td><td className="n">{pc(m.quota_a_caso, 0)}</td><td>{m.stato}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="mp-nota">Il primo mese si giudica quando ci sono almeno 40 corse con la stima del giorno e l'arrivo.</div>}
              <div className="mp-nota">Se un mese scende di oltre 8 punti sotto la prova, compare un avviso in calendario.</div>
            </div>
          </div>
        </>}

        {/* GALOPPO */}
        {gal && <>
          <Titolo sotto={`Il rischio di squalifica per galoppo che si vede nel calendario e nel simulatore: ${gal.esito_contato}.`}>Il rischio di galoppo</Titolo>
          <div className="mp-griglia2">
            <div className="ed-pannello">
              <div className="ed-etich" style={{ marginBottom: 8 }}>Previsto e vero, dal decimo più tranquillo al più a rischio</div>
              <GraficoColonne altezza={170} massimo={50} nomeAsse="decimi di partenti, ordinati per rischio previsto" formatoGuida={v => `${Math.round(v)}%`}
                dati={(gal.decimi ?? []).map((x: any, i: number) => ({ chiave: i, etichetta: String(i + 1), valore: x.vera * 100, testo: pcN(x.vera * 100, 0),
                  colore: COLORI_GRAFICO.scarso, scheda: [{ testo: `previsto ${pcN(x.prevista * 100)}` }, { testo: `vero ${pcN(x.vera * 100)}` }, { testo: `${n0(x.n)} partenze` }] }))} />
            </div>
            <div className="ed-pannello mp-testo" style={{ fontSize: 12.5 }}>
              <p>In prova {n0(gal.partenze_prova)} partenze, {pc(gal.quota_galoppo_prova, 0)} squalificate. Il modello ordina i cavalli per rischio con AUC {dec(gal.auc_modello, 3)},
                contro {dec(gal.auc_storia_cavallo, 3)} guardando solo quante volte il cavallo ha galoppato in passato.</p>
              {gal.fasce_sito && <p>Nel sito: rischio <b>basso</b> (sotto il {Math.round((gal.soglie_fasce?.basso_sotto ?? 0.12) * 100)}%) per il {pc(gal.fasce_sito.basso?.quota_partenze, 0)} dei partenti, che poi galoppano
                il {pc(gal.fasce_sito.basso?.vera, 0)} delle volte; <b>medio</b> per il {pc(gal.fasce_sito.medio?.quota_partenze, 0)} ({pc(gal.fasce_sito.medio?.vera, 0)});
                <b> alto</b> (dal {Math.round((gal.soglie_fasce?.alto_da ?? 0.3) * 100)}%) per il {pc(gal.fasce_sito.alto?.quota_partenze, 0)} ({pc(gal.fasce_sito.alto?.vera, 0)}).</p>}
              {gal.debutti && <p>Sui debuttanti, senza storia, è più difficile: AUC {dec(gal.debutti.auc, 2)} su {n0(gal.debutti.partenze)} debutti.</p>}
            </div>
          </div>
        </>}

        {/* SIMULATORE */}
        <Titolo sotto={`Il simulatore fa correre la corsa migliaia di volte con i tempi al km di ogni cavallo. Prova su ${PROVA_XGB.corse} corse vere degli ultimi 14 giorni, senza conoscere l'arrivo.`}>Il simulatore</Titolo>
        <div className="mp-griglia2">
          <div className="ed-pannello">
            <GraficoColonne altezza={170} massimo={50} nomeAsse="il più vincente nelle simulazioni ha vinto davvero" formatoGuida={v => `${Math.round(v)}%`}
              dati={[
                ["solo", "da solo", COLORI_GRAFICO.spento], ["tarato", "tarato su XGBoost", NOI],
                ["conMercato", "più metà mercato", NOI], ["totalizzatore", "favorito del pubblico", MERCATO],
              ].map(([k, t, c]) => ({ chiave: k, etichetta: t, valore: (PROVA_XGB.favoritoVince as any)[k], colore: c,
                testo: pcN((PROVA_XGB.favoritoVince as any)[k]), scheda: [{ testo: t }, { testo: `probabilità data al vincitore: ${pcN((PROVA_XGB.alVincitore as any)[k])}` }] }))} />
          </div>
          <div className="ed-pannello mp-scorre">
            <table className="mp-tab">
              <thead><tr><th></th><th className="n">Da solo</th><th className="n">Tarato</th><th className="n">Riferimento</th></tr></thead>
              <tbody>
                <tr><td>Probabilità data al vincitore</td><td className="n">{pcN(PROVA_XGB.alVincitore.solo)}</td><td className="n">{pcN(PROVA_XGB.alVincitore.tarato)}</td><td className="n">{pcN(PROVA_XGB.alVincitore.totalizzatore)} pubblico</td></tr>
                <tr><td>Il più vincente vince</td><td className="n">{pcN(PROVA_XGB.favoritoVince.solo)}</td><td className="n">{pcN(PROVA_XGB.favoritoVince.tarato)}</td><td className="n">{pcN(PROVA_XGB.favoritoVince.totalizzatore)} pubblico</td></tr>
                <tr><td>Errore sui primi tre</td><td className="n">{dec(PROVA_XGB.errorePrimiTre.solo)}</td><td className="n">{dec(PROVA_XGB.errorePrimiTre.tarato)}</td><td className="n">{dec(PROVA_XGB.errorePrimiTre.pronostico)} pronostico</td></tr>
                <tr><td>Errore sul vincitore</td><td className="n">{dec(PROVA_XGB.erroreVince.solo)}</td><td className="n">{dec(PROVA_XGB.erroreVince.tarato)}</td><td className="n">{dec(PROVA_XGB.erroreVince.totalizzatore)} pubblico</td></tr>
                <tr><td>Squalificati per galoppo</td><td className="n" colSpan={2}>{pcN(PROVA.squalificheSim)} simulati</td><td className="n">{pcN(PROVA.squalificheVere)} veri</td></tr>
              </tbody>
            </table>
            <div className="mp-nota">
              "Tarato" vuol dire che prima di simulare il passo di ogni cavallo viene spostato finché le sue probabilità di vincere e di arrivare nei primi tre
              somigliano a quelle del pronostico XGBoost; poi la simulazione aggiunge quello che il modello non vede: la corsa vera, le posizioni, il galoppo.
              Gli errori sono il punteggio di Brier: più basso è meglio.
            </div>
          </div>
        </div>

        {/* LIMITI */}
        <Titolo>Cosa non si può concludere</Titolo>
        <div className="ed-pannello mp-testo">
          <p>Un pronostico al 55% sbaglia quasi una volta su due: è una stima di quante volte, su molte corse, quei cavalli arrivano davanti, non una promessa sulla corsa di oggi.</p>
          <p>I modelli non vedono quello che non è scritto da nessuna parte: come sta il cavallo oggi, un cambio di preparazione, la tattica del guidatore. Il mercato in parte lo vede, ed è per questo che sul vincitore resta più bravo.</p>
          <p>I pesi dicono quanto il modello usa un'informazione, non che quell'informazione causa il risultato. Il sito non dà consigli di gioco.</p>
          <p style={{ marginBottom: 0 }}>Per vedere il pronostico corsa per corsa: <Link href="/calendario" style={{ color: COLORE }}>Calendario</Link> ·{" "}
            <Link href="/simulatore" style={{ color: COLORE }}>Simulatore</Link> · <Link href="/controllo" style={{ color: COLORE }}>Controllo a posteriori</Link> ·{" "}
            <Link href="/metodo" style={{ color: COLORE }}>Metodo e dati</Link></p>
        </div>
      </>}
    </div>
  );
}
