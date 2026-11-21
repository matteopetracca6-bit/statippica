/**
 * Simulatore della corsa (21/11/2026).
 *
 * Una corsa in programma o gia' corsa, simulata sulla pista: i pallini girano
 * con la loro velocita' (tempo al km delle ultime corse), lo spunto nel finale,
 * la tenuta sulle distanze lunghe, la penalita' ai nastri, la corda e le ruote
 * esterne in curva, le rotture al galoppo e le squalifiche (rischio del
 * modello del calendario). Tempo reale con acceleratore, vista in prospettiva
 * o dall'alto, e "Simula 1000 volte" per le percentuali, confrontate con il
 * pronostico, le quote e, per le corse gia' corse, con l'arrivo vero.
 * Il motore e' in lib/simulaCorsa.ts, i dati in server/simulatore.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Flag, Play, Pause, RotateCcw, Shuffle, Dices } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { coloreScheda } from "@/lib/sezioni";
import IntestazionePagina from "../components/IntestazionePagina";
import { Spiegazione } from "../components/Spiegazione";
import CavalloCaricamento from "@/components/CavalloCaricamento";
import {
  nuovaSimulazione, passo, geometria, simulaMolte, formatoKm, LARGHEZZA_CORSIA,
  type CorsaDati, type Simulazione, type Riepilogo, type Corridore,
} from "@/lib/simulaCorsa";

const ACCENTO = coloreScheda("/simulatore");
const MUTED = "hsl(210 8% 55%)";

interface CavalloApi {
  nome: string; numero: number | null; distanza: number; penalita: number; guidatore: string | null; ferri: string | null;
  anno: number | null; km_base: number | null; km_migliore: number | null; record_corto: number | null; record_lungo: number | null;
  corse_note: number; galoppo: number; galoppo_fonte: string; effetto_guidatore: number | null;
  pronostico_top3: number | null; quota: number | null; arrivo: number | null; arrivo_testo: string | null; km_reale: number | null;
}
interface CorsaApi extends CorsaDati {
  tipo: "prossima" | "passata"; pista: string; sigla: string | null; data: string; ora: string | null; numero: number | null;
  cavalli: CavalloApi[];
}
interface VoceElenco { tipo: "prossima" | "passata"; pista: string; sigla?: string; codice?: string; data: string; ora?: string; numero?: number | null; partenti: number; distanza: number }

// Colori dei numeri (sottosella), come nelle corse al trotto.
const COLORI = ["#d32f2f", "#1e63c9", "#f2f2f2", "#2e9e47", "#1b1b1b", "#f4d018", "#e9518a", "#9a9a9a", "#8a2bb8",
                "#0f8f80", "#7b4a2e", "#ff7a30", "#3949ab", "#b5c22c", "#16a6c4", "#c2185b", "#5d4037", "#455a64"];
const TESTO_SCURO = new Set([2, 5]);   // indice 2 (bianco) e 5 (giallo): numero scuro
const coloreNumero = (n: number) => COLORI[(n - 1 + COLORI.length) % COLORI.length];
const testoNumero = (n: number) => TESTO_SCURO.has((n - 1) % COLORI.length) ? "#111" : "#fff";

function leggiParametri(): Record<string, string> {
  const q = window.location.hash.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(q).entries());
}
const dataIt = (d: string) => { const [y, m, g] = d.split("-"); return `${g}/${m}/${y}`; };
const titolo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const fmtTempo = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// ─── Disegno della pista ────────────────────────────────────────────────────
const FASCIA = 13;   // larghezza della pista in metri, dalla corda alla staccionata

function disegna(ctx: CanvasRenderingContext2D, W: number, H: number, corsa: CorsaApi, sim: Simulazione | null,
                 evidenziato: number | null) {
  const g = geometria(corsa.lunghezza_pista);
  const R = g.raggio, L = g.lunghezza;
  const mondoW = g.rettilineo + 2 * (R + FASCIA) + 30, mondoH = 2 * (R + FASCIA) + 34;
  const k = Math.min(W / mondoW, H / mondoH);
  const ox = (W - mondoW * k) / 2 + 15 * k, oy = (H - mondoH * k) / 2 + 6 * k;
  const cy = R + FASCIA, cx1 = R + FASCIA, cx2 = R + FASCIA + g.rettilineo;
  const X = (x: number) => ox + x * k, Y = (y: number) => oy + y * k;
  const fineRett = g.rettilineo - g.traguardoSulRett, semi = Math.PI * R;
  const punto = (u: number, scost: number) => {
    let x = ((u % L) + L) % L;
    const r = R + scost;
    if (x < fineRett) return [cx1 + g.traguardoSulRett + x, cy + r];
    x -= fineRett;
    if (x < semi) { const f = Math.PI / 2 - x / R; return [cx2 + r * Math.cos(f), cy + r * Math.sin(f)]; }
    x -= semi;
    if (x < g.rettilineo) return [cx2 - x, cy - r];
    x -= g.rettilineo;
    if (x < semi) { const f = -Math.PI / 2 - x / R; return [cx1 + r * Math.cos(f), cy + r * Math.sin(f)]; }
    x -= semi;
    return [cx1 + x, cy + r];
  };
  const stadio = (r: number) => {
    ctx.beginPath();
    ctx.moveTo(X(cx1), Y(cy + r));
    ctx.lineTo(X(cx2), Y(cy + r));
    ctx.arc(X(cx2), Y(cy), r * k, Math.PI / 2, -Math.PI / 2, true);
    ctx.lineTo(X(cx1), Y(cy - r));
    ctx.arc(X(cx1), Y(cy), r * k, -Math.PI / 2, Math.PI / 2, true);
    ctx.closePath();
  };

  // Fondo: il terreno intorno.
  ctx.clearRect(0, 0, W, H);
  const fondo = ctx.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, "#14301f"); fondo.addColorStop(1, "#0d2216");
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);

  // Tribuna lungo il rettilineo d'arrivo.
  const tx0 = cx1 + g.traguardoSulRett - g.rettilineo * 0.55, tx1 = cx1 + g.traguardoSulRett + g.rettilineo * 0.12;
  const ty = cy + R + FASCIA + 4;
  ctx.fillStyle = "#2a2f38"; ctx.fillRect(X(tx0), Y(ty), (tx1 - tx0) * k, 16 * k);
  for (let r = 0; r < 5; r++) {
    ctx.fillStyle = r % 2 ? "#3a414d" : "#333a45";
    ctx.fillRect(X(tx0), Y(ty + 2 + r * 2.6), (tx1 - tx0) * k, 1.6 * k);
  }
  ctx.fillStyle = "#b8202a"; ctx.fillRect(X(tx0), Y(ty), (tx1 - tx0) * k, 1.6 * k);   // tettoia
  ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = `${Math.max(9, 3.4 * k)}px system-ui`;
  ctx.textAlign = "center"; ctx.fillText(`IPPODROMO DI ${corsa.pista}`, X((tx0 + tx1) / 2), Y(ty + 15.2));

  // Pista in sabbia.
  stadio(R + FASCIA);
  const sabbia = ctx.createRadialGradient(X((cx1 + cx2) / 2), Y(cy), R * k * 0.5, X((cx1 + cx2) / 2), Y(cy), (R + FASCIA + g.rettilineo / 2) * k);
  sabbia.addColorStop(0, "#c9965f"); sabbia.addColorStop(1, "#a9763f");
  ctx.fillStyle = sabbia; ctx.fill();
  // Segni dell'erpice: linee sottili alle corsie.
  ctx.save(); ctx.setLineDash([2 * k, 5 * k]); ctx.strokeStyle = "rgba(255,240,220,.10)"; ctx.lineWidth = Math.max(0.6, 0.15 * k);
  for (let c = 1; c <= 7; c++) { stadio(R + 0.9 + c * LARGHEZZA_CORSIA - LARGHEZZA_CORSIA / 2); ctx.stroke(); }
  ctx.restore();

  // Prato interno, con le strisce del taglio.
  stadio(R);
  ctx.save(); ctx.clip();
  const prato = ctx.createLinearGradient(0, Y(cy - R), 0, Y(cy + R));
  prato.addColorStop(0, "#2f7a3b"); prato.addColorStop(1, "#23652f");
  ctx.fillStyle = prato; ctx.fillRect(0, 0, W, H);
  const striscia = 18;
  for (let x = cx1 - R, i = 0; x < cx2 + R; x += striscia, i++) {
    if (i % 2) { ctx.fillStyle = "rgba(255,255,255,.045)"; ctx.fillRect(X(x), 0, striscia * k, H); }
  }
  // Tabellone al centro.
  const bw = Math.min(g.rettilineo * 0.42, 110), bh = Math.min(R * 0.42, 26);
  ctx.fillStyle = "rgba(10,14,20,.82)"; ctx.fillRect(X((cx1 + cx2) / 2 - bw / 2), Y(cy - bh / 2), bw * k, bh * k);
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.strokeRect(X((cx1 + cx2) / 2 - bw / 2), Y(cy - bh / 2), bw * k, bh * k);
  ctx.fillStyle = "#ffd54a"; ctx.font = `700 ${Math.max(10, bh * k * 0.3)}px ui-monospace, monospace`; ctx.textAlign = "center";
  ctx.fillText(sim ? fmtTempo(sim.t) : "0:00.0", X((cx1 + cx2) / 2), Y(cy - bh * 0.05));
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = `${Math.max(8, bh * k * 0.17)}px system-ui`;
  ctx.fillText(`${corsa.distanza} m · ${corsa.partenza}`, X((cx1 + cx2) / 2), Y(cy + bh * 0.32));
  ctx.restore();

  // Staccionate: corda bianca con i paletti, staccionata esterna.
  ctx.lineWidth = Math.max(1.5, 0.45 * k); ctx.strokeStyle = "#f4f4f4"; stadio(R); ctx.stroke();
  ctx.lineWidth = Math.max(1, 0.3 * k); ctx.strokeStyle = "rgba(255,255,255,.75)"; stadio(R + FASCIA); ctx.stroke();
  ctx.fillStyle = "#fff";
  for (let u = 0; u < L; u += 25) { const [x, y] = punto(u, -0.4); ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.8, 0.28 * k), 0, 7); ctx.fill(); }

  // Paletti delle distanze dal traguardo (ultimi 500 metri).
  ctx.font = `600 ${Math.max(8, 2.6 * k)}px system-ui`; ctx.textAlign = "center";
  for (const m of [500, 400, 300, 200, 100]) {
    const [x, y] = punto(-m, FASCIA + 2.6);
    ctx.fillStyle = m === 200 ? "#ffd54a" : "rgba(255,255,255,.65)";
    ctx.fillText(String(m), X(x), Y(y) + 3);
  }

  // Traguardo: banda a scacchi e palo d'arrivo.
  {
    const n = 8, passoM = FASCIA / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const [x, y] = punto(j * 1.1, i * passoM);
      ctx.fillStyle = (i + j) % 2 ? "#111" : "#fafafa";
      ctx.fillRect(X(x) - 0.55 * k, Y(y), 1.1 * k, passoM * k + 0.5);
    }
    const [px, py] = punto(0, FASCIA + 1.2);
    ctx.fillStyle = "#e53935"; ctx.fillRect(X(px) - 0.7 * k, Y(py), 1.4 * k, 5 * k);
    ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.max(8, 2.6 * k)}px system-ui`; ctx.fillText("ARRIVO", X(px), Y(py) + 8 * k);
  }
  // Partenza (e linee dei nastri per le penalita').
  const inizio = -corsa.distanza;
  const penalita = Array.from(new Set(corsa.cavalli.map(c => c.penalita))).sort((a, b) => a - b);
  for (const p of penalita) {
    ctx.beginPath();
    const [a1, b1] = punto(inizio - p, 0.2), [a2, b2] = punto(inizio - p, FASCIA - 0.2);
    ctx.moveTo(X(a1), Y(b1)); ctx.lineTo(X(a2), Y(b2));
    ctx.strokeStyle = p === 0 ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1, 0.35 * k);
    ctx.setLineDash(p === 0 ? [] : [1.2 * k, 1.2 * k]); ctx.stroke(); ctx.setLineDash([]);
  }
  {
    const [x, y] = punto(inizio, -3.2);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `600 ${Math.max(8, 2.4 * k)}px system-ui`;
    ctx.fillText(penalita.length > 1 ? `PARTENZA · nastri +${penalita.slice(1).join("/+")} m` : "PARTENZA", X(x), Y(y));
  }

  if (!sim) return;

  // Macchina dell'autostart, che si allarga e se ne va.
  if (corsa.partenza === "autostart" && sim.t < 7) {
    const davanti = Math.max(...sim.corridori.map(c => c.s));
    const sAuto = davanti + 7 + sim.t * sim.t * 1.6;
    const apertura = Math.max(0, 1 - sim.t / 3);
    const [x, y] = punto(inizio + sAuto, 3 + sim.t * 1.2);
    ctx.fillStyle = "#e8e8e8"; ctx.fillRect(X(x) - 2.2 * k, Y(y) - 1.4 * k, 4.4 * k, 2.8 * k);
    if (apertura > 0) {
      const [a1, b1] = punto(inizio + sAuto - 2, 0.3), [a2, b2] = punto(inizio + sAuto - 2, 0.9 + 8 * LARGHEZZA_CORSIA * apertura);
      ctx.strokeStyle = "rgba(240,240,240,.9)"; ctx.lineWidth = Math.max(1.5, 0.5 * k);
      ctx.beginPath(); ctx.moveTo(X(a1), Y(b1)); ctx.lineTo(X(a2), Y(b2)); ctx.stroke();
    }
  }

  // I cavalli: ombra, pallino col colore del numero, numero.
  const raggio = Math.max(5, 0.95 * k);
  const ordine = [...sim.corridori].sort((a, b) => (a.stato === "squalificato" ? -1 : 0) - (b.stato === "squalificato" ? -1 : 0) || a.s - b.s);
  const primo = sim.corridori.filter(c => c.stato !== "squalificato").sort((a, b) => b.s - a.s)[0];
  for (const c of ordine) {
    const cav = corsa.cavalli[c.i];
    const n = cav.numero ?? c.i + 1;
    const [x, y] = punto(inizio + Math.min(c.s, corsa.distanza + 60), 0.9 + c.corsia * LARGHEZZA_CORSIA);
    const px = X(x), py = Y(y);
    ctx.globalAlpha = c.stato === "squalificato" ? 0.35 : 1;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(px + raggio * 0.35, py + raggio * 0.45, raggio, raggio * 0.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c.stato === "squalificato" ? "#777" : coloreNumero(n);
    ctx.beginPath(); ctx.arc(px, py, raggio, 0, 7); ctx.fill();
    ctx.lineWidth = c.stato === "galoppo" ? Math.max(2.5, raggio * 0.4) : Math.max(1, raggio * 0.16);
    ctx.strokeStyle = c.stato === "galoppo" ? "#ff9800" : evidenziato === c.i ? "#ffd54a" : "rgba(255,255,255,.85)";
    ctx.stroke();
    ctx.fillStyle = c.stato === "squalificato" ? "#ddd" : testoNumero(n);
    ctx.font = `800 ${Math.max(7, raggio * 1.05)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(c.stato === "squalificato" ? "✕" : String(n), px, py + 0.5);
    ctx.textBaseline = "alphabetic"; ctx.globalAlpha = 1;
    if ((primo && c === primo && c.stato !== "arrivato") || evidenziato === c.i) {
      ctx.fillStyle = "rgba(10,14,20,.8)";
      ctx.font = `700 ${Math.max(9, raggio * 0.95)}px system-ui`;
      const testo = cav.nome, tw = ctx.measureText(testo).width + 8;
      ctx.fillRect(px - tw / 2, py - raggio * 2.9, tw, raggio * 1.5);
      ctx.fillStyle = "#fff"; ctx.fillText(testo, px, py - raggio * 1.85);
    }
  }
}

function Pista({ corsa, sim, tick, prospettiva, evidenziato }: { corsa: CorsaApi; sim: Simulazione | null; tick: number; prospettiva: boolean; evidenziato: number | null }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(900);
  useEffect(() => {
    const ro = new ResizeObserver(e => setLarg(Math.max(320, Math.floor(e[0].contentRect.width))));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const alt = Math.round(larg * 0.5);
  useEffect(() => {
    const cv = tela.current; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== larg * dpr) { cv.width = larg * dpr; cv.height = alt * dpr; }
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    disegna(ctx, larg, alt, corsa, sim, evidenziato);
  }, [corsa, sim, tick, larg, alt, evidenziato]);
  return (
    <div ref={box} style={{ width: "100%", perspective: prospettiva ? 1300 : undefined, overflow: "hidden", borderRadius: 14,
                            background: "#0d2216", height: prospettiva ? alt * 0.78 : alt }}>
      <canvas ref={tela} style={{ width: larg, height: alt, display: "block",
        transform: prospettiva ? "rotateX(40deg) scale(1.02)" : "none", transformOrigin: "50% 62%", transition: "transform .5s" }} />
    </div>
  );
}

// ─── Pagina ─────────────────────────────────────────────────────────────────
type Scelta = { tipo: "prossima"; sigla: string; data: string; ora: string } | { tipo: "passata"; codice: string };

export default function SimulatorePage() {
  const iniziali = useMemo(leggiParametri, []);
  const [scelta, setScelta] = useState<Scelta | null>(() =>
    iniziali.tipo === "passata" && iniziali.codice ? { tipo: "passata", codice: iniziali.codice }
      : iniziali.tipo === "prossima" && iniziali.pista ? { tipo: "prossima", sigla: iniziali.pista, data: iniziali.data, ora: iniziali.ora }
      : null);
  const [elencoTipo, setElencoTipo] = useState<"prossima" | "passata">(iniziali.tipo === "passata" ? "passata" : "prossima");
  const { data: elenco } = useQuery<{ prossime: VoceElenco[]; passate: VoceElenco[] }>({
    queryKey: ["/api/simulatore/elenco"],
    queryFn: async () => (await apiRequest("GET", "/api/simulatore/elenco")).json(),
    staleTime: 5 * 60_000,
  });
  // Senza scelta: la prima corsa in programma (o l'ultima corsa).
  useEffect(() => {
    if (scelta || !elenco) return;
    const p = elenco.prossime[0], q = elenco.passate[0];
    if (p) setScelta({ tipo: "prossima", sigla: p.sigla!, data: p.data, ora: p.ora! });
    else if (q) { setElencoTipo("passata"); setScelta({ tipo: "passata", codice: q.codice! }); }
  }, [elenco, scelta]);

  const url = !scelta ? null : scelta.tipo === "passata"
    ? `/api/simulatore/corsa?tipo=passata&codice=${encodeURIComponent(scelta.codice)}`
    : `/api/simulatore/corsa?tipo=prossima&pista=${encodeURIComponent(scelta.sigla)}&data=${scelta.data}&ora=${encodeURIComponent(scelta.ora)}`;
  const { data: corsa, isLoading, error } = useQuery<CorsaApi>({
    queryKey: [url], enabled: !!url,
    queryFn: async () => { const r = await apiRequest("GET", url!); if (!r.ok) throw new Error("non trovata"); return r.json(); },
  });

  // Simulazione animata.
  const [seme, setSeme] = useState(() => Math.floor(Math.random() * 1e9));
  const simRef = useRef<Simulazione | null>(null);
  const [tick, setTick] = useState(0);
  const [inCorsa, setInCorsa] = useState(false);
  const [velocita, setVelocita] = useState(1);
  const [prospettiva, setProspettiva] = useState(true);
  const [evidenziato, setEvidenziato] = useState<number | null>(null);
  const velRef = useRef(velocita); velRef.current = velocita;

  useEffect(() => {
    if (!corsa) return;
    simRef.current = nuovaSimulazione(corsa, seme);
    setInCorsa(false); setTick(t => t + 1);
  }, [corsa, seme]);

  useEffect(() => {
    if (!inCorsa || !corsa) return;
    let ultimo = performance.now(), id = 0, conta = 0;
    const g = geometria(corsa.lunghezza_pista);
    const giro = (ora: number) => {
      const sim = simRef.current; if (!sim) return;
      let dt = Math.min(0.1, (ora - ultimo) / 1000) * velRef.current;
      ultimo = ora;
      while (dt > 0 && !sim.finita) { const p = Math.min(0.05, dt); passo(sim, p, g); dt -= p; }
      setTick(++conta);
      if (sim.finita) { setInCorsa(false); return; }
      id = requestAnimationFrame(giro);
    };
    id = requestAnimationFrame(giro);
    return () => cancelAnimationFrame(id);
  }, [inCorsa, corsa]);

  // Mille simulazioni.
  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null);
  const [avanz, setAvanz] = useState<number | null>(null);
  useEffect(() => { setRiepilogo(null); setAvanz(null); }, [corsa]);
  const simulaMille = async () => {
    if (!corsa || avanz != null) return;
    setAvanz(0);
    const r = await simulaMolte(corsa, 1000, Math.floor(Math.random() * 1e9), f => setAvanz(f));
    setRiepilogo(r); setAvanz(null);
  };

  const sim = simRef.current;
  const voci = elencoTipo === "prossima" ? elenco?.prossime ?? [] : elenco?.passate ?? [];
  const giornate = Array.from(new Set(voci.map(v => v.data)));
  const dataScelta = corsa?.data ?? giornate[0];
  const pisteDelGiorno = Array.from(new Set(voci.filter(v => v.data === dataScelta).map(v => v.pista)));
  const pistaScelta = corsa?.pista ?? pisteDelGiorno[0];
  const corseDellaPista = voci.filter(v => v.data === dataScelta && v.pista === pistaScelta);
  const scegli = (v: VoceElenco | undefined) => {
    if (!v) return;
    setScelta(v.tipo === "passata" ? { tipo: "passata", codice: v.codice! } : { tipo: "prossima", sigla: v.sigla!, data: v.data, ora: v.ora! });
    setSeme(Math.floor(Math.random() * 1e9));
  };
  const chiaveVoce = (v: VoceElenco) => v.tipo === "passata" ? v.codice! : `${v.sigla}|${v.data}|${v.ora}`;
  const chiaveScelta = scelta ? (scelta.tipo === "passata" ? scelta.codice : `${scelta.sigla}|${scelta.data}|${scelta.ora}`) : "";

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: ACCENTO }}>
      <IntestazionePagina icona={Flag} colore={ACCENTO} titolo="Simulatore della corsa" etichetta="sperimentale" margineSotto={14}
        sottotitolo="Scegli una corsa in programma o già corsa e guardala girare: velocità, spunto, tenuta, penalità ai nastri, corda e ruote esterne, galoppi e squalifiche. Poi simulala mille volte." />

      {/* Scelta della corsa */}
      <div className="pannello" style={{ padding: "14px 16px", marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="ed-linguette" role="tablist" style={{ marginBottom: 0 }}>
          <button className="ed-linguetta" role="tab" aria-selected={elencoTipo === "prossima"} onClick={() => { setElencoTipo("prossima"); scegli(elenco?.prossime[0]); }}>
            <span><b>In programma</b><small>prossime corse</small></span>
          </button>
          <button className="ed-linguetta" role="tab" aria-selected={elencoTipo === "passata"} onClick={() => { setElencoTipo("passata"); scegli(elenco?.passate[0]); }}>
            <span><b>Già corse</b><small>replay, ultimi 14 giorni</small></span>
          </button>
        </div>
        <Selettore etichetta="Giornata" valore={dataScelta ?? ""} opzioni={giornate.map(d => [d, dataIt(d)])}
          cambia={d => scegli(voci.find(v => v.data === d))} />
        <Selettore etichetta="Ippodromo" valore={pistaScelta ?? ""} opzioni={pisteDelGiorno.map(p => [p, titolo(p)])}
          cambia={p => scegli(voci.find(v => v.data === dataScelta && v.pista === p))} />
        <Selettore etichetta="Corsa" valore={chiaveScelta} opzioni={corseDellaPista.map(v => [chiaveVoce(v),
          `${v.tipo === "passata" ? `Corsa ${v.numero ?? "?"}` : v.ora} · ${v.distanza} m · ${v.partenti} partenti`])}
          cambia={k => scegli(corseDellaPista.find(v => chiaveVoce(v) === k))} />
      </div>

      {(isLoading || (!corsa && !error)) && <CavalloCaricamento label="Preparo la corsa" />}
      {error && <div className="pannello" style={{ padding: 16, color: MUTED }}>Corsa non trovata.</div>}

      {corsa && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <b style={{ fontSize: 15 }}>{titolo(corsa.pista)} · {dataIt(corsa.data)}{corsa.ora ? ` · ${corsa.ora}` : corsa.numero ? ` · corsa ${corsa.numero}` : ""}</b>
            <span style={{ fontSize: 12, color: MUTED }}>{corsa.distanza} m · partenza {corsa.partenza} (stimata) · pista di circa {corsa.lunghezza_pista} m</span>
          </div>
          <div className="sim-griglia">
            <div>
              <Pista corsa={corsa} sim={sim} tick={tick} prospettiva={prospettiva} evidenziato={evidenziato} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                <button className="sim-bottone forte" onClick={() => {
                  if (sim?.finita) { simRef.current = nuovaSimulazione(corsa, seme); setTick(t => t + 1); }
                  setInCorsa(v => !v);
                }}>
                  {inCorsa ? <><Pause size={15} /> Pausa</> : <><Play size={15} /> {sim && sim.t > 0 && !sim.finita ? "Riprendi" : "Via!"}</>}
                </button>
                <button className="sim-bottone" onClick={() => { simRef.current = nuovaSimulazione(corsa, seme); setInCorsa(false); setTick(t => t + 1); }}>
                  <RotateCcw size={14} /> Ricomincia
                </button>
                <button className="sim-bottone" onClick={() => setSeme(Math.floor(Math.random() * 1e9))} title="Un'altra estrazione: ogni corsa è diversa">
                  <Shuffle size={14} /> Un'altra corsa
                </button>
                <span style={{ fontSize: 12, color: MUTED, marginLeft: 6 }}>Velocità</span>
                {[1, 2, 5, 10, 20].map(v => (
                  <button key={v} className={`sim-bottone piccolo${velocita === v ? " attivo" : ""}`} onClick={() => setVelocita(v)}>×{v}</button>
                ))}
                <label style={{ fontSize: 12, color: MUTED, display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", cursor: "pointer" }}>
                  <input type="checkbox" checked={prospettiva} onChange={e => setProspettiva(e.target.checked)} /> prospettiva
                </label>
              </div>
            </div>
            <Classifica corsa={corsa} sim={sim} tick={tick} evidenzia={setEvidenziato} />
          </div>

          {sim?.finita && <Arrivo corsa={corsa} sim={sim} />}

          {/* Mille corse */}
          <div className="pannello" style={{ padding: "16px 18px", marginTop: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: riepilogo ? 12 : 0 }}>
              <b style={{ fontSize: 14 }}>Mille corse</b>
              <span style={{ fontSize: 12, color: MUTED, flex: 1, minWidth: 220 }}>
                La stessa corsa simulata 1000 volte: quante volte vince ogni cavallo, quante arriva nei primi tre e quante viene squalificato.
              </span>
              <button className="sim-bottone forte" onClick={simulaMille} disabled={avanz != null}>
                <Dices size={15} /> {avanz != null ? `${Math.round(avanz * 100)}%` : riepilogo ? "Rifai le 1000" : "Simula 1000 volte"}
              </button>
            </div>
            {avanz != null && <div style={{ height: 4, background: "hsl(0 0% 100% / .08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${avanz * 100}%`, height: "100%", background: ACCENTO, transition: "width .1s" }} /></div>}
            {riepilogo && <TabellaMille corsa={corsa} r={riepilogo} />}
          </div>

          <Partenti corsa={corsa} />

          <div style={{ marginTop: 16 }}>
            <Spiegazione titolo="Come funziona il simulatore">
              Ogni cavallo corre al <b>suo tempo al chilometro</b>: la mediana delle ultime otto corse su distanze vicine (±500 m), con un po' di caso
              a ogni corsa (di più se ha corso poco). Lo <b>spunto</b> è quanto il suo tempo migliore recente è sotto quello solito: conta negli ultimi
              400 metri. Sulle distanze lunghe chi ha il record sul lungo peggiore di quello sul corto <b>cala</b> nel finale. Ai <b>nastri</b> chi ha la
              penalità parte indietro di quei metri e da fermo; in <b>autostart</b> si parte lanciati, in seconda fila dal numero 9. In curva chi è in
              seconda o terza ruota fa più strada; chi è chiuso dietro un cavallo più lento esce se c'è spazio, altrimenti aspetta. Il <b>galoppo</b> usa
              il rischio del modello del calendario (o, se manca, quante volte il cavallo ha rotto): più facile in partenza e nel finale. Chi rompe perde
              terreno; alla seconda rottura, se resta al galoppo o se rompe negli ultimi 200 metri è squalificato. L'<b>effetto del guidatore</b> sposta
              di qualche decimo il tempo al km. La lunghezza della pista e il tipo di partenza sono indicativi: l'archivio non li ha, si ricavano dai dati.
            </Spiegazione>
          </div>
        </>
      )}
      <style>{`
        .sim-griglia { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
        @media (max-width: 900px) { .sim-griglia { grid-template-columns: 1fr; } }
        .sim-bottone { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; font-size: 13px; font-weight: 600;
          background: hsl(0 0% 100% / .06); color: hsl(210 10% 88%); border: 1px solid hsl(0 0% 100% / .12); cursor: pointer; }
        .sim-bottone:hover { background: hsl(0 0% 100% / .11); }
        .sim-bottone.forte { background: ${ACCENTO}; color: #fff; border-color: transparent; }
        .sim-bottone.forte:disabled { opacity: .7; cursor: default; }
        .sim-bottone.piccolo { padding: 5px 8px; font-size: 12px; }
        .sim-bottone.attivo { border-color: ${ACCENTO}; color: ${ACCENTO}; }
        .sim-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .sim-tab th { text-align: left; font-weight: 600; color: ${MUTED}; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; padding: 6px 6px; border-bottom: 1px solid hsl(0 0% 100% / .08); }
        .sim-tab td { padding: 6px 6px; border-bottom: 1px solid hsl(0 0% 100% / .05); }
        .sim-tab td.n, .sim-tab th.n { text-align: right; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}

function Selettore({ etichetta, valore, opzioni, cambia }: { etichetta: string; valore: string; opzioni: [string, string][]; cambia: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: MUTED, minWidth: 140 }}>
      {etichetta}
      <select value={valore} onChange={e => cambia(e.target.value)}
        style={{ background: "hsl(220 14% 12%)", color: "hsl(210 10% 90%)", border: "1px solid hsl(0 0% 100% / .14)", borderRadius: 8, padding: "7px 9px", fontSize: 13 }}>
        {opzioni.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

function Numero({ n }: { n: number }) {
  return <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0,
    background: coloreNumero(n), color: testoNumero(n), fontSize: 11, fontWeight: 800, border: "1px solid rgba(255,255,255,.4)" }}>{n}</span>;
}

function Classifica({ corsa, sim, evidenzia }: { corsa: CorsaApi; sim: Simulazione | null; tick: number; evidenzia: (i: number | null) => void }) {
  if (!sim) return null;
  const peso = (c: Corridore) => c.stato === "arrivato" ? 0 : c.stato === "squalificato" ? 2 : 1;
  const righe = [...sim.corridori].sort((a, b) => peso(a) - peso(b) ||
    (a.stato === "arrivato" ? (a.tempo ?? 0) - (b.tempo ?? 0) : b.s - a.s));
  const testa = righe.find(c => c.stato !== "squalificato");
  const mancano = testa && testa.stato !== "arrivato" ? Math.max(0, corsa.distanza - testa.s) : 0;
  return (
    <div className="pannello" style={{ padding: "12px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Classifica</b>
        <span className="tabular" style={{ fontSize: 12, color: MUTED }}>
          {fmtTempo(sim.t)}{sim.t > 0 && !sim.finita ? ` · mancano ${Math.round(mancano)} m` : sim.finita ? " · arrivo" : ""}
        </span>
      </div>
      {righe.map((c, pos) => {
        const cav = corsa.cavalli[c.i];
        const n = cav.numero ?? c.i + 1;
        const percorsi = c.s + cav.penalita;
        const km = percorsi > 50 && c.stato !== "squalificato"
          ? ((c.stato === "arrivato" ? c.tempo! : sim.t) / (c.stato === "arrivato" ? corsa.distanza + cav.penalita : percorsi)) * 1000 : null;
        const distacco = c.stato === "arrivato" ? (pos === 0 ? "" : `+${((c.tempo ?? 0) - (righe[0].tempo ?? 0)).toFixed(1)}s`)
          : testa && c !== testa ? `−${Math.round(testa.s - c.s)} m` : "";
        return (
          <div key={c.i} onMouseEnter={() => evidenzia(c.i)} onMouseLeave={() => evidenzia(null)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 2px", fontSize: 12.5, opacity: c.stato === "squalificato" ? 0.5 : 1,
                     borderBottom: "1px solid hsl(0 0% 100% / .04)" }}>
            <span className="tabular" style={{ width: 18, color: MUTED, textAlign: "right" }}>{c.stato === "squalificato" ? "" : pos + 1}</span>
            <Numero n={n} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{cav.nome}</span>
            {c.stato === "galoppo" && <span style={{ color: "#ff9800", fontSize: 11, fontWeight: 700 }}>galoppo</span>}
            {c.stato === "squalificato" && <span style={{ color: "hsl(0 60% 65%)", fontSize: 11, fontWeight: 700 }}>squal.</span>}
            {c.chiuso && c.stato === "corre" && <span style={{ color: MUTED, fontSize: 10.5 }}>chiuso</span>}
            {c.stato !== "squalificato" && c.corsia > 1.5 && c.stato === "corre" && <span style={{ color: MUTED, fontSize: 10.5 }}>{Math.round(c.corsia) + 1}ª r.</span>}
            <span className="tabular" style={{ width: 46, textAlign: "right", color: MUTED, fontSize: 11.5 }}>{distacco}</span>
            <span className="tabular" style={{ width: 44, textAlign: "right", fontSize: 11.5 }}>{km ? formatoKm(km) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function Arrivo({ corsa, sim }: { corsa: CorsaApi; sim: Simulazione }) {
  const veri = corsa.tipo === "passata"
    ? [...corsa.cavalli].filter(c => c.arrivo != null).sort((a, b) => (a.arrivo ?? 99) - (b.arrivo ?? 99)) : [];
  const sq = sim.corridori.filter(c => c.stato === "squalificato").map(c => corsa.cavalli[c.i].nome);
  return (
    <div className="pannello" style={{ padding: "14px 16px", marginTop: 14, display: "grid", gridTemplateColumns: veri.length ? "1fr 1fr" : "1fr", gap: 18 }}>
      <div>
        <b style={{ fontSize: 13 }}>Arrivo simulato</b>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
          {sim.arrivo.slice(0, 5).map(i => {
            const c = sim.corridori[i], cav = corsa.cavalli[i];
            return <li key={i}><b>{cav.nome}</b> <span style={{ color: MUTED }}>{formatoKm((c.tempo ?? 0) / (corsa.distanza + cav.penalita) * 1000)}</span></li>;
          })}
        </ol>
        {sq.length > 0 && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Squalificati per galoppo: {sq.join(", ")}</div>}
      </div>
      {veri.length > 0 && (
        <div>
          <b style={{ fontSize: 13 }}>Arrivo vero</b>
          <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
            {veri.slice(0, 5).map(c => <li key={c.nome}><b>{c.nome}</b> <span style={{ color: MUTED }}>{formatoKm(c.km_reale)}</span></li>)}
          </ol>
          {corsa.cavalli.some(c => c.arrivo == null && c.arrivo_testo) && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Non arrivati: {corsa.cavalli.filter(c => c.arrivo == null && c.arrivo_testo).map(c => `${c.nome} (${c.arrivo_testo})`).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabellaMille({ corsa, r }: { corsa: CorsaApi; r: Riepilogo }) {
  const passata = corsa.tipo === "passata";
  const righe = corsa.cavalli.map((c, i) => ({ c, p: r.perCavallo[i] })).sort((a, b) => b.p.vittorie - a.p.vittorie || b.p.top3 - a.p.top3);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="sim-tab">
        <thead><tr>
          <th>Cavallo</th><th className="n">Vince</th><th className="n">Primi 3</th><th className="n">Squalificato</th><th className="n">Km medio</th>
          <th className="n" title="Il nostro pronostico: probabilità di arrivare nei primi tre">Pronostico primi 3</th>
          {passata && <th className="n" title="Quota finale del totalizzatore">Quota</th>}
          {passata && <th className="n">Arrivo vero</th>}
        </tr></thead>
        <tbody>
          {righe.map(({ c, p }) => (
            <tr key={c.nome}>
              <td><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Numero n={c.numero ?? 0} />
                <Link href={`/horse/${encodeURIComponent(c.nome)}/${c.anno ?? 0}`}><a style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{c.nome}</a></Link></span></td>
              <td className="n" style={{ fontWeight: 700 }}>{pct(p.vittorie)}</td>
              <td className="n">{pct(p.top3)}</td>
              <td className="n" style={{ color: p.squalifiche > 0.25 ? "hsl(0 60% 65%)" : undefined }}>{pct(p.squalifiche)}</td>
              <td className="n">{formatoKm(p.kmMedio)}</td>
              <td className="n" style={{ color: MUTED }}>{c.pronostico_top3 != null ? `${c.pronostico_top3.toFixed(1)}%` : "—"}</td>
              {passata && <td className="n" style={{ color: MUTED }}>{c.quota != null ? c.quota.toFixed(2) : "—"}</td>}
              {passata && <td className="n">{c.arrivo != null ? `${c.arrivo}°` : c.arrivo_testo ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8 }}>
        Se il simulatore e il pronostico dicono cose molto diverse su un cavallo, di solito è perché il pronostico guarda anche cose che il
        simulatore non vede (forma, ferratura, allenatore, voto) e il simulatore guarda la corsa metro per metro (penalità, numero, galoppo).
      </div>
    </div>
  );
}

function Partenti({ corsa }: { corsa: CorsaApi }) {
  const passata = corsa.tipo === "passata";
  return (
    <div className="pannello" style={{ padding: "14px 16px", marginTop: 16, overflowX: "auto" }}>
      <b style={{ fontSize: 14 }}>I partenti e i loro numeri</b>
      <table className="sim-tab" style={{ marginTop: 8 }}>
        <thead><tr>
          <th>N.</th><th>Cavallo</th><th>Guidatore</th><th className="n">Penalità</th><th className="n" title="Mediana delle ultime corse su distanze vicine">Km atteso</th>
          <th className="n" title="Il miglior tempo recente">Km migliore</th><th className="n">Record corto / lungo</th>
          <th className="n" title="Probabilità di squalifica per galoppo">Rischio galoppo</th>
          {passata && <th className="n">Arrivo vero</th>}
        </tr></thead>
        <tbody>
          {corsa.cavalli.map((c, i) => (
            <tr key={c.nome}>
              <td><Numero n={c.numero ?? i + 1} /></td>
              <td style={{ fontWeight: 600 }}>{c.nome}{c.corse_note < 3 && <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}> · poche corse</span>}</td>
              <td style={{ color: MUTED }}>{c.guidatore ?? "—"}</td>
              <td className="n">{c.penalita ? `+${c.penalita} m` : "—"}</td>
              <td className="n">{formatoKm(c.km_base)}</td>
              <td className="n">{formatoKm(c.km_migliore)}</td>
              <td className="n" style={{ color: MUTED }}>{formatoKm(c.record_corto)} / {formatoKm(c.record_lungo)}</td>
              <td className="n" title={c.galoppo_fonte === "modello" ? "dal modello del calendario" : "dalle sue corse"}>{(c.galoppo * 100).toFixed(0)}%</td>
              {passata && <td className="n">{c.arrivo != null ? `${c.arrivo}°` : c.arrivo_testo ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
