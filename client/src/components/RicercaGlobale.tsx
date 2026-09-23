/**
 * Ricerca unica, sempre a portata di mano in alto su ogni pagina.
 *
 * PERCHE' ESISTE. Prima ogni ricerca aveva la sua casella in una pagina
 * diversa: il cavallo nella home, lo stallone nell'elenco stalloni, la
 * fattrice nel suo elenco. Per passare da un cavallo a un guidatore bisognava
 * tornare indietro, trovare la pagina giusta e ricominciare. Qui si scrive un
 * nome e si salta dove si vuole, da qualunque punto del sito.
 *
 * Si apre col pulsante in alto, oppure con il tasto "/" o Ctrl+K da tastiera.
 * Con la casella vuota mostra le ultime schede aperte, che e' la cosa che si
 * cerca piu' spesso: tornare a un cavallo visto due minuti fa.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, X, Clock, Trophy, BookOpen, Heart, Users, MapPin, CornerDownLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";

interface Voce {
  tipo: "cavallo" | "stallone" | "fattrice" | "guidatore" | "ippodromo";
  titolo: string;
  sotto?: string;
  grade?: string | null;
  href: string;
}

const ICONE = { cavallo: Trophy, stallone: BookOpen, fattrice: Heart, guidatore: Users, ippodromo: MapPin };
const NOMI_GRUPPO = { cavallo: "Cavalli", stallone: "Stalloni", fattrice: "Fattrici", guidatore: "Guidatori", ippodromo: "Ippodromi" };
const CHIAVE_RECENTI = "statippica-recenti";

// ─── Schede viste di recente ─────────────────────────────────────────────
// Si ricostruiscono dall'indirizzo, cosi' non serve che ogni pagina si
// "registri": qualunque scheda aperta finisce nell'elenco da sola.
function voceDaPercorso(p: string): Voce | null {
  const parti = p.split("/").filter(Boolean).map(decodeURIComponent);
  if (parti[0] === "horse" && parti[1]) return { tipo: "cavallo", titolo: parti[1], sotto: parti[2] ? `nato nel ${parti[2]}` : undefined, href: p };
  if (parti[0] === "stallion" && parti[1]) return { tipo: "stallone", titolo: parti[1], href: p };
  if (parti[0] === "fattrice" && parti[1]) return { tipo: "fattrice", titolo: parti[1], href: p };
  if (parti[0] === "guidatore" && parti[1]) return { tipo: "guidatore", titolo: parti[1], href: p };
  if (parti[0] === "ippodromo" && parti[1]) return { tipo: "ippodromo", titolo: parti[1].charAt(0) + parti[1].slice(1).toLowerCase(), href: p };
  return null;
}

export function leggiRecenti(): Voce[] {
  try { return JSON.parse(localStorage.getItem(CHIAVE_RECENTI) || "[]"); } catch { return []; }
}

export function ricordaPercorso(p: string) {
  const v = voceDaPercorso(p);
  if (!v) return;
  try {
    const lista = leggiRecenti().filter(x => x.href !== v.href);
    lista.unshift(v);
    localStorage.setItem(CHIAVE_RECENTI, JSON.stringify(lista.slice(0, 8)));
  } catch { /* navigazione privata: pazienza, niente recenti */ }
}

// ─── Il pulsante in alto ─────────────────────────────────────────────────
export function PulsanteRicerca({ onApri }: { onApri: () => void }) {
  return (
    <button
      onClick={onApri}
      aria-label="Cerca nel sito"
      data-testid="apri-ricerca"
      className="pulsante-ricerca"
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "7px 10px 7px 11px", borderRadius: "9px", cursor: "pointer",
        background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 20%)",
        color: "hsl(210 8% 55%)", fontSize: "12.5px",
      }}
    >
      <Search size={14} />
      <span className="pulsante-ricerca-testo">Cerca cavalli, stalloni, guidatori...</span>
      <kbd className="pulsante-ricerca-testo" style={{
        fontSize: "10.5px", padding: "1px 6px", borderRadius: "4px",
        border: "1px solid hsl(220 10% 24%)", color: "hsl(210 8% 45%)", fontFamily: "inherit",
      }}>/</kbd>
      <style>{`@media (max-width: 640px) { .pulsante-ricerca-testo { display: none !important; } }`}</style>
    </button>
  );
}

// ─── La finestra di ricerca ──────────────────────────────────────────────
export default function RicercaGlobale({ aperta, onChiudi }: { aperta: boolean; onChiudi: () => void }) {
  const [testo, setTesto] = useState("");
  const [risultati, setRisultati] = useState<Voce[]>([]);
  const [carico, setCarico] = useState(false);
  const [scelta, setScelta] = useState(0);
  const [percorsoAttuale, naviga] = useLocation();
  const campo = useRef<HTMLInputElement>(null);
  const attesa = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (aperta) { setTesto(""); setRisultati([]); setScelta(0); setTimeout(() => campo.current?.focus(), 20); }
  }, [aperta]);

  useEffect(() => {
    clearTimeout(attesa.current);
    const q = testo.trim();
    if (q.length < 2) { setRisultati([]); setCarico(false); return; }
    setCarico(true);
    attesa.current = setTimeout(async () => {
      try {
        const r = await apiRequest("GET", `/api/search/all?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        const e = encodeURIComponent;
        const voci: Voce[] = [
          ...d.cavalli.map((h: any) => ({ tipo: "cavallo", titolo: h.name, grade: h.grade,
            sotto: [h.birth_year && `nato nel ${h.birth_year}`, h.sex === "F" ? "femmina" : h.sex === "M" ? "maschio" : null].filter(Boolean).join(" · "),
            href: `/horse/${e(h.name)}/${h.birth_year}` })),
          ...d.stalloni.map((x: any) => ({ tipo: "stallone", titolo: x.name, grade: x.grade,
            sotto: x.n_figli_totali ? (x.n_figli_totali === 1 ? "1 figlio nell'archivio" : `${x.n_figli_totali} figli nell'archivio`) : undefined, href: `/stallion/${e(x.name)}` })),
          ...d.fattrici.map((x: any) => ({ tipo: "fattrice", titolo: x.name, grade: x.grade,
            sotto: x.n_valutati ? (x.n_valutati === 1 ? "1 figlio valutato" : `${x.n_valutati} figli valutati`) : undefined, href: `/fattrice/${e(x.name)}` })),
          ...d.guidatori.map((x: any) => ({ tipo: "guidatore", titolo: x.name,
            sotto: `${x.n_gare.toLocaleString("it-IT")} gare`, href: `/guidatore/${e(x.name)}` })),
          ...d.ippodromi.map((x: any) => ({ tipo: "ippodromo", titolo: x.name,
            sotto: `${x.n_gare.toLocaleString("it-IT")} gare`, href: `/ippodromo/${e(x.code)}` })),
        ];
        // Prima i gruppi dove un nome COMINCIA con il testo scritto: cercando
        // "napoli" si vuole l'ippodromo, non il cavallo FORZA NAPOLI che per
        // caso viene prima nell'ordine fisso dei gruppi.
        const Q = q.toUpperCase();
        const ordine = ["cavallo", "stallone", "fattrice", "guidatore", "ippodromo"];
        const inizia = (t: string) => voci.some(v => v.tipo === t && v.titolo.toUpperCase().startsWith(Q));
        const gruppi = [...ordine].sort((a, b) => Number(inizia(b)) - Number(inizia(a)));
        voci.sort((a, b) => gruppi.indexOf(a.tipo) - gruppi.indexOf(b.tipo));
        setRisultati(voci); setScelta(0);
      } catch { setRisultati([]); } finally { setCarico(false); }
    }, 220);
  }, [testo]);

  // La scheda su cui si e' gia' non serve fra le recenti: si vuole tornare altrove.
  const recenti = useMemo(
    () => (aperta ? leggiRecenti().filter(v => v.href !== percorsoAttuale) : []),
    [aperta, percorsoAttuale]);
  const elenco = testo.trim().length >= 2 ? risultati : recenti;

  const vai = (v: Voce) => { onChiudi(); naviga(v.href); };

  const tasto = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") { onChiudi(); return; }
    if (ev.key === "ArrowDown") { ev.preventDefault(); setScelta(i => Math.min(elenco.length - 1, i + 1)); }
    if (ev.key === "ArrowUp") { ev.preventDefault(); setScelta(i => Math.max(0, i - 1)); }
    if (ev.key === "Enter" && elenco[scelta]) { ev.preventDefault(); vai(elenco[scelta]); }
  };

  if (!aperta) return null;

  let ultimoGruppo = "";
  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onChiudi(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "hsl(220 20% 3% / 0.72)", backdropFilter: "blur(3px)",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "9vh 14px 20px",
      }}
    >
      <div role="dialog" aria-label="Cerca nel sito" style={{
        width: "100%", maxWidth: "600px", background: "hsl(220 13% 9%)",
        border: "1px solid hsl(220 10% 20%)", borderRadius: "14px",
        boxShadow: "0 24px 60px hsl(0 0% 0% / 0.55)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid hsl(220 10% 16%)" }}>
          <Search size={17} style={{ color: "hsl(183 70% 55%)", flexShrink: 0 }} />
          <input
            ref={campo}
            value={testo}
            onChange={e => setTesto(e.target.value)}
            onKeyDown={tasto}
            placeholder="Nome di un cavallo, stallone, fattrice, guidatore o ippodromo"
            data-testid="campo-ricerca-globale"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "hsl(210 10% 90%)", fontSize: "15px", minWidth: 0 }}
          />
          <button onClick={onChiudi} aria-label="Chiudi la ricerca" style={{ background: "none", border: "none", color: "hsl(210 8% 50%)", cursor: "pointer", padding: "2px" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: "6px 0" }}>
          {testo.trim().length < 2 && recenti.length > 0 && (
            <div style={{ padding: "8px 16px 4px", fontSize: "10.5px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={11} /> Aperte di recente
            </div>
          )}
          {testo.trim().length < 2 && recenti.length === 0 && (
            <div style={{ padding: "18px 16px", fontSize: "12.5px", color: "hsl(210 8% 48%)", lineHeight: 1.6 }}>
              Scrivi almeno due lettere. Le schede che apri compariranno qui, per tornarci con un clic.
            </div>
          )}
          {testo.trim().length >= 2 && !carico && risultati.length === 0 && (
            <div style={{ padding: "18px 16px", fontSize: "12.5px", color: "hsl(210 8% 48%)" }}>
              Nessun risultato per "{testo.trim()}".
            </div>
          )}

          {elenco.map((v, i) => {
            const Icona = ICONE[v.tipo];
            const mostraGruppo = testo.trim().length >= 2 && v.tipo !== ultimoGruppo;
            ultimoGruppo = v.tipo;
            const attiva = i === scelta;
            return (
              <div key={v.href}>
                {mostraGruppo && (
                  <div style={{ padding: "10px 16px 4px", fontSize: "10.5px", color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {NOMI_GRUPPO[v.tipo]}
                  </div>
                )}
                <button
                  onClick={() => vai(v)}
                  onMouseEnter={() => setScelta(i)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "11px",
                    padding: "8px 16px", border: "none", cursor: "pointer", textAlign: "left",
                    background: attiva ? "hsl(183 60% 30% / 0.18)" : "transparent",
                  }}
                >
                  <Icona size={14} style={{ color: attiva ? "hsl(183 75% 60%)" : "hsl(210 8% 45%)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.titolo}
                    </div>
                    {v.sotto && <div style={{ fontSize: "11px", color: "hsl(210 8% 46%)" }}>{v.sotto}</div>}
                  </div>
                  {v.grade && <GradeBadge grade={v.grade} size="sm" />}
                  {attiva && <CornerDownLeft size={13} style={{ color: "hsl(210 8% 45%)", flexShrink: 0 }} />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="pulsante-ricerca-testo" style={{ display: "flex", gap: "14px", padding: "9px 16px", borderTop: "1px solid hsl(220 10% 16%)", fontSize: "11px", color: "hsl(210 8% 40%)" }}>
          <span>frecce per scegliere</span><span>Invio per aprire</span><span>Esc per chiudere</span>
        </div>
      </div>
    </div>
  );
}
