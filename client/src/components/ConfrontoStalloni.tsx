/**
 * Confronto fra stalloni sul prezzo della monta (pagina Catalogo stalloni).
 *
 * 28/11/2026, rifatto: tutti gli stalloni con prezzo, ognuno con la prova che
 * ha (provati, giovani con stima precoce, senza figli: server/montaRende.ts).
 * Un grafico per ogni domanda, che cambia con il pulsante scelto: utile
 * atteso, resa per euro di monta, vinto dai figli contro la monta con la
 * linea del pareggio, prezzi in fila. Il costo al mese e' la barra comune a
 * tutto il sito. Sotto, un elenco che si legge anche dal telefono.
 */
import { Spiegazione } from "./Spiegazione";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Scale, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";
import CavalloCaricamento from "./CavalloCaricamento";
import CostoMese, { useCostoMese } from "./CostoMese";
import { COLORE_VOTO } from "@/lib/coloreVoto";
import { formatRecord } from "@/lib/record";

const MUTED = "hsl(210 8% 52%)";
const TESTO = "hsl(210 10% 90%)";
const VERDE = "hsl(150 55% 52%)", ROSSO = "hsl(8 65% 60%)", GIALLO = "hsl(45 80% 58%)";
const ACC = "hsl(160 60% 50%)";
const euro = (n: number) => (n < 0 ? "−⁠" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
const k = (n: number) => (n < 0 ? "−" : "") + "€" + Math.round(Math.abs(n) / 1000).toLocaleString("it-IT") + "k";
const v1 = (n: number) => n.toFixed(1).replace(".", ",");

type Gruppo = "provati" | "giovani" | "senza";
interface Riga {
  nome: string; voto: string | null; monta: number; allevamento: string | null; gruppo: Gruppo; figli: number; affidabilita: number;
  utile_atteso: number | null; prob_profitto: number | null; guadagno_atteso: number | null; costo_atteso: number | null; esito: string | null;
  forbice: [number, number] | null; debuttati?: number; indice?: number; figli_totali?: number; primo_figlio?: number | null;
  atleta?: { corse: number; vittorie: number; guadagni: number; record: string | null; nato: number | null } | null;
  padre?: string | null; voto_padre?: string | null;
}
interface Dati {
  mensile: number; stalloni: Riga[]; conteggi: Record<Gruppo, number>; media_figlio_popolazione: number;
  anni_giovani: [number, number] | null; prova_giovani: { stalloni: number; correlazione: number; errore: number; errore_riferimento: number; forbice_80: number };
}
type Ordine = "utile" | "rapporto" | "guadagno" | "monta";
const NOMI_GRUPPO: Record<Gruppo, string> = { provati: "Provati", giovani: "Giovani", senza: "Senza figli" };
const COL_GRUPPO: Record<Gruppo, string> = { provati: ACC, giovani: "hsl(205 75% 66%)", senza: "hsl(210 8% 55%)" };
const coloreEsito = (e: string | null) => e === "profitto" ? VERDE : e === "perdita" ? ROSSO : e === "pareggio" ? GIALLO : MUTED;
const resa = (r: Riga) => r.guadagno_atteso != null && r.monta ? r.guadagno_atteso / r.monta : null;

function Etichetta({ g }: { g: Gruppo }) {
  return <span style={{ fontSize: 10, fontWeight: 700, color: COL_GRUPPO[g], border: `1px solid color-mix(in srgb, ${COL_GRUPPO[g]} 45%, transparent)`,
    borderRadius: 5, padding: "0 5px", whiteSpace: "nowrap", flexShrink: 0 }}>{g === "giovani" ? "stima precoce" : g === "senza" ? "non valutabile" : "provato"}</span>;
}

/* Barre orizzontali: una riga per stallone, la barra parte da zero (o dal centro se ci sono valori negativi). */
function Barre({ righe, valore, testo, colore, forbice }: {
  righe: Riga[]; valore: (r: Riga) => number; testo: (r: Riga) => string; colore: (r: Riga) => string; forbice?: (r: Riga) => [number, number] | null;
}) {
  const vals = righe.map(valore);
  const lo = Math.min(0, ...vals, ...righe.map(r => forbice?.(r)?.[0] ?? 0));
  const hi = Math.max(0, ...vals, ...righe.map(r => forbice?.(r)?.[1] ?? 0));
  const span = hi - lo || 1;
  const pos = (x: number) => ((x - lo) / span) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {righe.map(r => {
        const x = valore(r), z = pos(0), p = pos(x), f = forbice?.(r);
        return (
          <div key={r.nome} style={{ display: "grid", gridTemplateColumns: "minmax(92px, 34%) minmax(0, 1fr) auto", gap: 8, alignItems: "center", fontSize: 12 }}>
            <Link href={`/stallion/${encodeURIComponent(r.nome)}`} style={{ color: TESTO, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
              {r.nome}
            </Link>
            <div style={{ position: "relative", height: 14 }}>
              <div style={{ position: "absolute", left: `${z}%`, top: -2, bottom: -2, width: 1, background: "hsl(220 10% 30%)" }} />
              {f && <div title={`forbice ${euro(f[0])} – ${euro(f[1])}`} style={{ position: "absolute", left: `${pos(f[0])}%`, width: `${pos(f[1]) - pos(f[0])}%`, top: 6, height: 2, background: "hsl(205 60% 60% / .7)" }} />}
              <div style={{ position: "absolute", left: `${Math.min(z, p)}%`, width: `${Math.max(0.6, Math.abs(p - z))}%`, top: 2, bottom: 2, borderRadius: 3,
                background: colore(r), opacity: r.gruppo === "giovani" ? 0.55 : 0.9,
                backgroundImage: r.gruppo === "giovani" ? "repeating-linear-gradient(45deg, transparent 0 4px, rgb(0 0 0 / .25) 4px 7px)" : undefined }} />
            </div>
            <span className="tabular" style={{ color: colore(r), fontWeight: 700, minWidth: 58, textAlign: "right" }}>{testo(r)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Vinto da un figlio contro la monta, con la linea del pareggio. */
function Nuvola({ righe, costoBase }: { righe: Riga[]; costoBase: number }) {
  const [sel, setSel] = useState<Riga | null>(null);
  const W = 640, H = 300, ml = 46, mr = 12, mt = 12, mb = 34;
  const pts = righe.filter(r => r.guadagno_atteso != null);
  if (!pts.length) return null;
  const xmin = Math.log(Math.min(...pts.map(r => r.monta)) * 0.85), xmax = Math.log(Math.max(...pts.map(r => r.monta)) * 1.15);
  const ymax = Math.max(...pts.map(r => r.forbice?.[1] ?? r.guadagno_atteso!), costoBase + Math.exp(xmax)) * 1.05;
  const X = (m: number) => ml + ((Math.log(m) - xmin) / (xmax - xmin)) * (W - ml - mr);
  const Y = (g: number) => mt + (1 - g / ymax) * (H - mt - mb);
  const linea = Array.from({ length: 25 }, (_, i) => { const m = Math.exp(xmin + (i / 24) * (xmax - xmin)); return `${i ? "L" : "M"}${X(m).toFixed(1)},${Y(costoBase + m).toFixed(1)}`; }).join(" ");
  const ticks = [1000, 2000, 3000, 5000, 10000, 20000].filter(t => Math.log(t) >= xmin && Math.log(t) <= xmax);
  const yt = [0, ymax / 4, ymax / 2, (3 * ymax) / 4];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setSel(null)} role="img" aria-label="Vinto da un figlio contro il prezzo della monta">
        {yt.map(t => <g key={t}><line x1={ml} x2={W - mr} y1={Y(t)} y2={Y(t)} stroke="hsl(220 10% 17%)" strokeDasharray="3 4" />
          <text x={ml - 6} y={Y(t) + 4} fontSize="10" fill={MUTED} textAnchor="end">{k(t)}</text></g>)}
        {ticks.map(t => <text key={t} x={X(t)} y={H - 16} fontSize="10" fill={MUTED} textAnchor="middle">{k(t)}</text>)}
        <text x={(W + ml) / 2} y={H - 2} fontSize="10.5" fill={MUTED} textAnchor="middle">prezzo della monta (scala logaritmica)</text>
        <path d={linea} fill="none" stroke={GIALLO} strokeWidth={1.6} strokeDasharray="6 4" />
        <text x={W - mr - 4} y={Y(costoBase + Math.exp(xmax)) - 6} fontSize="10.5" fill={GIALLO} textAnchor="end">pareggio</text>
        {pts.map(r => {
          const cx = X(r.monta), cy = Y(r.guadagno_atteso!), sopra = r.guadagno_atteso! >= (r.costo_atteso ?? costoBase + r.monta);
          return (
            <g key={r.nome} onMouseEnter={() => setSel(r)} onClick={() => setSel(r)} style={{ cursor: "pointer" }}>
              {r.forbice && <line x1={cx} x2={cx} y1={Y(r.forbice[0])} y2={Y(r.forbice[1])} stroke="hsl(205 60% 60% / .45)" strokeWidth={1.5} />}
              <circle cx={cx} cy={cy} r={r.gruppo === "giovani" ? 4 : Math.max(3.5, Math.min(9, Math.sqrt(r.figli) * 0.5))}
                fill={r.gruppo === "giovani" ? "none" : sopra ? VERDE : ROSSO} stroke={r.gruppo === "giovani" ? (sopra ? VERDE : ROSSO) : "hsl(220 13% 8%)"}
                strokeWidth={r.gruppo === "giovani" ? 2 : 1} fillOpacity={0.75} />
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 12, color: MUTED, minHeight: 18 }}>
        {sel ? <><b style={{ color: TESTO }}>{sel.nome}</b> · monta {euro(sel.monta)} · vinto da un figlio {euro(sel.guadagno_atteso!)}
          {sel.forbice ? ` (fra ${euro(sel.forbice[0])} e ${euro(sel.forbice[1])})` : ""} · utile {euro(sel.utile_atteso!)}</>
          : "Tocca un punto per il nome. Pieni: provati; vuoti: giovani, con la forbice."}
      </div>
    </div>
  );
}

function RigaElenco({ r, i, ordine }: { r: Riga; i: number; ordine: Ordine }) {
  const [aperta, setAperta] = useState(false);
  const principale = r.gruppo === "senza" ? "—"
    : ordine === "rapporto" ? `${v1(resa(r) ?? 0)} €` : ordine === "guadagno" ? euro(r.guadagno_atteso!) : ordine === "monta" ? euro(r.monta) : euro(r.utile_atteso!);
  return (
    <div style={{ borderBottom: "1px solid hsl(220 10% 14%)" }}>
      <button type="button" onClick={() => setAperta(a => !a)} aria-expanded={aperta}
        style={{ all: "unset", cursor: "pointer", display: "grid", gridTemplateColumns: "26px minmax(0, 1fr) auto", gap: 8, alignItems: "center", width: "100%", padding: "8px 2px", boxSizing: "border-box" }}>
        <span className="tabular" style={{ fontSize: 11.5, color: MUTED }}>{i + 1}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <b style={{ fontSize: 13, color: TESTO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</b>
            {r.voto && r.voto !== "N/A" && <GradeBadge grade={r.voto} size="sm" />}
            <Etichetta g={r.gruppo} />
          </span>
          <span className="tabular" style={{ display: "block", fontSize: 11.5, color: MUTED, marginTop: 2 }}>
            monta {euro(r.monta)}{r.gruppo !== "senza" && r.guadagno_atteso != null ? ` · vinto da un figlio ${euro(r.guadagno_atteso)}` : ` · ${r.figli ? `${r.figli} figli in archivio` : "nessun figlio in archivio"}`}
          </span>
        </span>
        <span style={{ textAlign: "right" }}>
          <span className="tabular" style={{ display: "block", fontSize: 14, fontWeight: 800, color: ordine === "monta" ? TESTO : coloreEsito(r.esito) }}>{principale}</span>
          <span style={{ fontSize: 10.5, color: MUTED }}>{ordine === "rapporto" ? "per € di monta" : ordine === "guadagno" ? "da un figlio" : ordine === "monta" ? "monta" : "utile atteso"}</span>
        </span>
      </button>
      {aperta && (
        <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "hsl(210 8% 68%)", padding: "0 2px 10px 34px" }}>
          {r.gruppo !== "senza" && <>
            <span>Utile atteso <b style={{ color: coloreEsito(r.esito) }}>{euro(r.utile_atteso!)}</b></span>
            <span>Costo di un figlio {euro(r.costo_atteso!)}</span>
            <span>Resa {v1(resa(r) ?? 0)} € per € di monta</span>
            {r.prob_profitto != null && <span>In utile {r.prob_profitto}%</span>}
            {r.forbice && <span>Forbice {euro(r.forbice[0])} – {euro(r.forbice[1])}</span>}
          </>}
          {r.gruppo === "provati" && <span>{r.figli} figli nati 2012-2021 · affidabilità {Math.round(r.affidabilita * 100)}%</span>}
          {r.gruppo === "giovani" && <span>{r.figli} figli nei primi anni ({r.debuttati} già in corsa) · ai 3 anni hanno vinto {v1(r.indice ?? 0)} volte i coetanei</span>}
          {r.gruppo === "senza" && <>
            {r.atleta ? <span>Da atleta: {r.atleta.corse} corse, {r.atleta.vittorie} vinte, {euro(r.atleta.guadagni ?? 0)}{r.atleta.record ? `, record ${formatRecord(r.atleta.record)}` : ""}</span>
              : <span>Carriera da atleta non nell&apos;archivio</span>}
            {r.padre && <span>Padre <Link href={`/stallion/${encodeURIComponent(r.padre)}`} style={{ color: TESTO }}>{r.padre}</Link>{r.voto_padre ? ` (voto da stallone ${r.voto_padre})` : ""}</span>}
            {r.primo_figlio ? <span>Primi figli nati nel {r.primo_figlio}: ancora troppo pochi o troppo giovani</span> : null}
          </>}
          {r.allevamento && <span>{r.allevamento}</span>}
          <Link href={`/stallion/${encodeURIComponent(r.nome)}`} style={{ color: ACC }}>Scheda →</Link>
        </div>
      )}
    </div>
  );
}

export default function ConfrontoStalloni() {
  const [aperto, setAperto] = useState(true);
  const mensile = useCostoMese();
  const [ordine, setOrdine] = useState<Ordine>("utile");
  const [gruppo, setGruppo] = useState<Gruppo | "tutti">("tutti");
  const [tuttiGrafico, setTuttiGrafico] = useState(false);
  const [tuttiElenco, setTuttiElenco] = useState(false);
  const { data, isLoading, isFetching } = useQuery<Dati>({
    queryKey: ["/api/pareggio/stalloni", mensile],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/stalloni?mensile=${mensile}`)).json(),
    staleTime: 30 * 60 * 1000,
    placeholderData: prev => prev,
  });

  const filtrate = useMemo(() => (data?.stalloni ?? []).filter(r => gruppo === "tutti" || r.gruppo === gruppo), [data, gruppo]);
  const ordinate = useMemo(() => {
    const val: Record<Ordine, (r: Riga) => number | null> = {
      utile: r => r.utile_atteso, guadagno: r => r.guadagno_atteso, rapporto: resa, monta: r => -r.monta,
    };
    return [...filtrate].sort((a, b) => {
      const x = val[ordine](a), y = val[ordine](b);
      if (x == null && y == null) return a.monta - b.monta;
      if (x == null) return 1; if (y == null) return -1;
      return y - x;
    });
  }, [filtrate, ordine]);
  const valutabili = ordinate.filter(r => r.gruppo !== "senza");
  const costoBase = useMemo(() => {
    const c = (data?.stalloni ?? []).filter(r => r.gruppo === "provati" && r.costo_atteso != null).map(r => r.costo_atteso! - r.monta).sort((a, b) => a - b);
    return c.length ? c[Math.floor(c.length / 2)] : 0;
  }, [data]);

  const bottone = (attivo: boolean): React.CSSProperties => ({
    padding: "5px 11px", borderRadius: "999px", cursor: "pointer", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
    border: "1px solid " + (attivo ? ACC : "hsl(220 10% 20%)"),
    background: attivo ? "hsl(160 60% 50% / 0.14)" : "transparent", color: attivo ? "hsl(160 60% 60%)" : MUTED,
  });
  const quanti = tuttiGrafico ? valutabili.length : 15;
  const inUtile = (data?.stalloni ?? []).filter(r => r.gruppo !== "senza" && (r.utile_atteso ?? 0) > 0).length;
  const valutati = (data?.stalloni ?? []).filter(r => r.gruppo !== "senza").length;

  return (
    <div className="pannello" style={{ padding: "18px 20px", marginBottom: "20px" }} data-testid="confronto-monta">
      <button onClick={() => setAperto(a => !a)} aria-expanded={aperto}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
        <Scale size={16} style={{ color: ACC }} />
        <span style={{ fontSize: "15px", fontWeight: 700, color: TESTO }}>Confronto sul prezzo della monta</span>
        <ChevronDown size={15} style={{ marginLeft: "auto", color: MUTED, transform: aperto ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {aperto && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ marginBottom: 10 }}><CostoMese nota={isFetching ? "ricalcolo…" : undefined} /></div>
          {isLoading || !data ? <CavalloCaricamento label="Caricamento" /> : (<>
            <div style={{ fontSize: 13, color: "hsl(210 8% 70%)", marginBottom: 10 }} className="tabular">
              {data.stalloni.length} stalloni con prezzo: <b style={{ color: TESTO }}>{inUtile}</b> su {valutati} valutabili vanno in utile con una fattrice qualunque.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }} role="group" aria-label="Quali stalloni">
              <button style={bottone(gruppo === "tutti")} onClick={() => setGruppo("tutti")}>Tutti {data.stalloni.length}</button>
              {(["provati", "giovani", "senza"] as Gruppo[]).map(g => (
                <button key={g} style={bottone(gruppo === g)} onClick={() => setGruppo(g)}>{NOMI_GRUPPO[g]} {data.conteggi[g] ?? 0}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }} role="group" aria-label="Cosa guardare">
              <button style={bottone(ordine === "utile")} onClick={() => setOrdine("utile")}>Utile atteso</button>
              <button style={bottone(ordine === "rapporto")} onClick={() => setOrdine("rapporto")}>Resa per euro di monta</button>
              <button style={bottone(ordine === "guadagno")} onClick={() => setOrdine("guadagno")}>Vinto dai figli</button>
              <button style={bottone(ordine === "monta")} onClick={() => setOrdine("monta")}>Monta più bassa</button>
            </div>

            {gruppo === "senza" ? (
              <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>Per questi stalloni non c&apos;è un conto: nessun figlio nell&apos;archivio, o troppo pochi. Nell&apos;elenco la carriera da atleta e il padre.</div>
            ) : (
              <div style={{ marginBottom: 6 }} data-testid={`grafico-monta-${ordine}`}>
                {ordine === "guadagno" ? <Nuvola righe={valutabili} costoBase={costoBase} /> : <>
                  <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>
                    {ordine === "utile" ? "Utile atteso di un figlio: a destra in utile, a sinistra in perdita" : ordine === "rapporto" ? "Euro vinti in media da un figlio per ogni euro di monta" : "I prezzi in fila, dal più basso; il colore è il voto da stallone, il numero l'utile atteso"}
                    {valutabili.length > quanti ? ` · i primi ${quanti}` : ""}
                  </div>
                  {ordine === "utile" && <Barre righe={valutabili.slice(0, quanti)} valore={r => r.utile_atteso!} testo={r => k(r.utile_atteso!)} colore={r => coloreEsito(r.esito)}
                    forbice={r => r.forbice ? [r.forbice[0] - r.costo_atteso!, r.forbice[1] - r.costo_atteso!] : null} />}
                  {ordine === "rapporto" && <Barre righe={valutabili.slice(0, quanti)} valore={r => resa(r)!} testo={r => `${v1(resa(r)!)} €`} colore={r => coloreEsito(r.esito)} />}
                  {ordine === "monta" && <Barre righe={valutabili.slice(0, quanti)} valore={r => r.monta} testo={r => k(r.utile_atteso!)}
                    colore={r => (r.voto && COLORE_VOTO[r.voto]) || MUTED} />}
                  {valutabili.length > 15 && (
                    <button type="button" className="lista-altre" onClick={() => setTuttiGrafico(v => !v)}>{tuttiGrafico ? "Mostra meno" : `Mostra tutti (${valutabili.length})`}</button>
                  )}
                </>}
              </div>
            )}

            <div style={{ marginTop: 10 }} data-testid="elenco-monta">
              {(tuttiElenco ? ordinate : ordinate.slice(0, 20)).map((r, i) => <RigaElenco key={r.nome} r={r} i={i} ordine={ordine} />)}
              {ordinate.length > 20 && (
                <button type="button" className="lista-altre" onClick={() => setTuttiElenco(v => !v)}>{tuttiElenco ? "Mostra meno" : `Mostra tutti (${ordinate.length})`}</button>
              )}
            </div>

            <Spiegazione titolo="Come è fatto il conto e cosa non dice" compatta>
              Quanto vince in media in carriera un figlio di ogni stallone, contando anche chi non corre mai, e quanto resta dopo i costi
              (monta, allevamento fino ai 2 anni, allenamento al costo al mese scelto). Con fattrice qualunque: una fattrice buona sposta il risultato.
              {" "}<b>Provati</b>: almeno 5 figli nati fra il 2012 e il 2021, con carriere quasi complete.
              {" "}<b>Giovani</b> (stima precoce): i primi figli sono nati dopo; si guarda quanto hanno vinto fino ai 3 anni i figli nati
              {data.anni_giovani ? ` fra il ${data.anni_giovani[0]} e il ${data.anni_giovani[1]}` : ""}, rispetto a tutti i coetanei. Provato sugli stalloni
              con figli nati 2013-2018 ({data.prova_giovani.stalloni} stalloni): questo indice e quanto i figli hanno poi vinto in carriera vanno insieme
              (correlazione {v1(data.prova_giovani.correlazione)}); la stima sbaglia in media di {v1(data.prova_giovani.errore)} volte la vincita media di un figlio
              ({euro(data.media_figlio_popolazione)}), contro {v1(data.prova_giovani.errore_riferimento)} di chi dà a tutti la media. La forbice contiene
              il vero 8 volte su 10.
              {" "}<b>Senza figli</b>: nessun figlio nell&apos;archivio (stalloni esteri o ai primi anni di monta), quindi niente conto.
              {" "}Nel grafico «Vinto dai figli» la linea del pareggio è quanto costa in media un figlio a quel prezzo di monta: chi sta sopra va in utile.
            </Spiegazione>
          </>)}
        </div>
      )}
    </div>
  );
}
