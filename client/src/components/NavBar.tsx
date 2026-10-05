import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Home as HomeIcon, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Trophy, Users, BookOpen, Sparkles, GitCompare, Calendar, TrendingUp, Network, Award, Building2, FlaskConical, Heart, MapPin, BookMarked, Scale } from "lucide-react";

/**
 * IL MENU, RAGGRUPPATO.
 *
 * Le schede erano 15 in fila: su computer le ultime uscivano dallo schermo e
 * sul telefono se ne vedevano tre per volta. Ora sono Home piu' cinque
 * gruppi; ognuno apre una tendina con le sue pagine e una riga di
 * spiegazione. Ogni pagina tiene il colore del suo riquadro nella home.
 */
type Scheda = { href: string; label: string; nota: string; icon: typeof HomeIcon; colore: string };
type Gruppo = { nome: string; icon: typeof HomeIcon; colore: string; schede: Scheda[] };

const GRUPPI: Gruppo[] = [
  { nome: "Cavalli", icon: Trophy, colore: "hsl(51 80% 55%)", schede: [
    { href: "/leaderboard", label: "Cavalli e classifica", nota: "Tutti i cavalli valutati, con voti e filtri", icon: Trophy, colore: "hsl(51 80% 55%)" },
    { href: "/qualifiche", label: "Qualifiche", nota: "Il primo tempo ufficiale dei giovani", icon: Award, colore: "hsl(280 60% 62%)" },
    { href: "/compare", label: "Comparazione", nota: "Due cavalli uno accanto all'altro", icon: GitCompare, colore: "hsl(30 80% 55%)" },
    { href: "/pedigree", label: "Pedigree", nota: "Albero genealogico fino a 5 generazioni", icon: Network, colore: "hsl(220 60% 60%)" },
  ] },
  { nome: "Allevamento", icon: Building2, colore: "hsl(120 60% 50%)", schede: [
    { href: "/stalloni", label: "Stalloni", nota: "Catalogo, prezzi di monta e confronto", icon: BookOpen, colore: "hsl(120 60% 50%)" },
    { href: "/fattrici", label: "Fattrici", nota: "Fattrici valutate sui figli", icon: Heart, colore: "hsl(330 70% 58%)" },
    { href: "/allevamento", label: "Allevatori e stazioni di monta", nota: "Chi alleva e dove stanno gli stalloni", icon: Building2, colore: "hsl(20 70% 58%)" },
    { href: "/advisor", label: "Advisor", nota: "Scegli l'accoppiamento per una fattrice", icon: Sparkles, colore: "hsl(280 60% 60%)" },
  ] },
  { nome: "Economia", icon: Scale, colore: "hsl(160 60% 50%)", schede: [
    { href: "/pareggio", label: "Punto di pareggio", nota: "Costi, vendere o far correre, quanto pesa ogni costo", icon: Scale, colore: "hsl(160 60% 50%)" },
    { href: "/tenere", label: "Tenere o fermare", nota: "Premi attesi e spese per ogni cavallo in attività", icon: TrendingUp, colore: "hsl(145 55% 52%)" },
  ] },
  { nome: "Corse", icon: Calendar, colore: "hsl(0 60% 55%)", schede: [
    { href: "/calendario", label: "Calendario", nota: "Prossime gare con iscritti e voti", icon: Calendar, colore: "hsl(0 60% 55%)" },
    { href: "/ippodromi", label: "Ippodromi e trend", nota: "Le piste italiane e i numeri negli anni", icon: MapPin, colore: "hsl(95 55% 52%)" },
    { href: "/guidatori", label: "Guidatori", nota: "Chi fa rendere di più i cavalli", icon: Users, colore: "hsl(200 70% 58%)" },
  ] },
  { nome: "Metodo", icon: BookMarked, colore: "hsl(40 40% 72%)", schede: [
    { href: "/metodo", label: "Metodo e dati", nota: "Da dove vengono i numeri e come si leggono", icon: BookMarked, colore: "hsl(40 40% 72%)" },
    { href: "/validazione", label: "Verifica Advisor", nota: "La prova che il consiglio funziona", icon: FlaskConical, colore: "hsl(183 70% 52%)" },
  ] },
];

/** Vero quando la scheda indicata e' quella aperta adesso. */
function isAttiva(percorso: string, href: string): boolean {
  if (href === "/leaderboard") return percorso.startsWith("/leaderboard") || percorso.startsWith("/cavalli") || percorso.startsWith("/horse");
  if (href === "/stalloni") return percorso.startsWith("/stalloni") || percorso.startsWith("/stallion");
  if (href === "/fattrici") return percorso.startsWith("/fattric");
  if (href === "/allevamento") return percorso.startsWith("/allevam") || percorso.startsWith("/allevator");
  if (href === "/validazione") return percorso.startsWith("/validazione");
  if (href === "/guidatori") return percorso.startsWith("/guidator");
  if (href === "/ippodromi") return percorso.startsWith("/ippodrom") || percorso.startsWith("/piste") || percorso.startsWith("/trend");
  if (href === "/pareggio") return percorso.startsWith("/pareggio") || percorso.startsWith("/break-even");
  if (href === "/metodo") return percorso.startsWith("/metodo");
  if (href === "/advisor") return percorso.startsWith("/advisor");
  return percorso === href;
}
const gruppoAttivo = (percorso: string) => GRUPPI.find(g => g.schede.some(sc => isAttiva(percorso, sc.href)))?.nome ?? null;

// Trasparenza dentro un colore hsl(...): "hsl(51 80% 55%)" -> "hsl(51 80% 55% / 0.15)".
function trasparente(colore: string, alfa: number) {
  return colore.replace(/\)$/, ` / ${alfa})`);
}

export default function NavBar() {
  const [percorso] = useLocation();

  /**
   * Le frecce avanti/indietro.
   *
   * Il sito usa gli indirizzi con il cancelletto, quindi ogni cambio di
   * scheda finisce comunque nella cronologia del browser: qui non si fa
   * altro che azionarla. Il browser non permette di sapere se esiste una
   * pagina precedente, percio' contiamo quanti passi abbiamo fatto noi:
   * la freccia indietro resta spenta finche' non c'e' davvero dove
   * tornare, e quella avanti solo dopo che si e' tornati indietro.
   */
  const [passiIndietro, setPassiIndietro] = useState(0);
  const [passiAvanti, setPassiAvanti] = useState(0);
  const ultimoPercorso = useRef(percorso);
  const navigazioneConFrecce = useRef<"indietro" | "avanti" | null>(null);

  useEffect(() => {
    if (percorso === ultimoPercorso.current) return;
    ultimoPercorso.current = percorso;

    if (navigazioneConFrecce.current === "indietro") {
      setPassiIndietro(n => Math.max(0, n - 1));
      setPassiAvanti(n => n + 1);
    } else if (navigazioneConFrecce.current === "avanti") {
      setPassiAvanti(n => Math.max(0, n - 1));
      setPassiIndietro(n => n + 1);
    } else {
      // Navigazione normale: si azzera il "avanti", come fa ogni browser.
      setPassiIndietro(n => n + 1);
      setPassiAvanti(0);
    }
    navigazioneConFrecce.current = null;
  }, [percorso]);

  // Tendina aperta (computer) e pannello a tutto schermo (telefono).
  const [aperto, setAperto] = useState<string | null>(null);
  const [pannello, setPannello] = useState(false);
  const chiudiTimer = useRef<number | null>(null);
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => { setAperto(null); setPannello(false); }, [percorso]);
  useEffect(() => {
    const fuori = (e: MouseEvent) => { if (barra.current && !barra.current.contains(e.target as Node)) setAperto(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAperto(null); setPannello(false); } };
    document.addEventListener("mousedown", fuori); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuori); document.removeEventListener("keydown", esc); };
  }, []);
  const apri = (nome: string) => { if (chiudiTimer.current) window.clearTimeout(chiudiTimer.current); setAperto(nome); };
  const chiudiPiano = () => { chiudiTimer.current = window.setTimeout(() => setAperto(null), 180); };
  const attivo = gruppoAttivo(percorso);
  const varColore = (c: string) => ({
    "--colore-voce": c, "--colore-voce-fondo": trasparente(c, 0.14), "--colore-voce-bordo": trasparente(c, 0.45),
  } as React.CSSProperties);

  const vaiIndietro = () => { navigazioneConFrecce.current = "indietro"; window.history.back(); };
  const vaiAvanti = () => { navigazioneConFrecce.current = "avanti"; window.history.forward(); };

  const stileFreccia = (attiva: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "28px", height: "28px", borderRadius: "8px",
    background: "transparent",
    border: "1px solid hsl(220 10% 16%)",
    color: attiva ? "hsl(210 8% 68%)" : "hsl(210 8% 26%)",
    cursor: attiva ? "pointer" : "default",
    transition: "background 0.15s, color 0.15s, transform 0.12s",
    padding: 0,
  });

  return (
    <nav style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "0 20px", minHeight: "44px",
      background: "hsl(220 14% 8%)",
      borderBottom: "1px solid hsl(220 10% 14%)",
      flexShrink: 0, zIndex: 99,
    }}>
      {/* Frecce avanti / indietro */}
      <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
        <button
          onClick={vaiIndietro}
          disabled={passiIndietro === 0}
          aria-label="Torna alla scheda precedente"
          title="Indietro"
          data-testid="nav-indietro"
          style={stileFreccia(passiIndietro > 0)}
          onMouseEnter={e => { if (passiIndietro > 0) { e.currentTarget.style.background = "hsl(220 10% 15%)"; e.currentTarget.style.color = "hsl(183 80% 60%)"; } }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = passiIndietro > 0 ? "hsl(210 8% 68%)" : "hsl(210 8% 26%)"; }}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={vaiAvanti}
          disabled={passiAvanti === 0}
          aria-label="Vai alla scheda successiva"
          title="Avanti"
          data-testid="nav-avanti"
          style={stileFreccia(passiAvanti > 0)}
          onMouseEnter={e => { if (passiAvanti > 0) { e.currentTarget.style.background = "hsl(220 10% 15%)"; e.currentTarget.style.color = "hsl(183 80% 60%)"; } }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = passiAvanti > 0 ? "hsl(210 8% 68%)" : "hsl(210 8% 26%)"; }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ width: "1px", height: "20px", background: "hsl(220 10% 16%)", flexShrink: 0 }} />

      {/* Home e i cinque gruppi */}
      <div ref={barra} className="nav-gruppi">
        <Link href="/">
          <a data-testid="nav-home" className={`voce-menu${percorso === "/" ? " attiva" : ""}`} style={varColore("hsl(183 85% 62%)")}>
            <HomeIcon size={13} /> Home
          </a>
        </Link>
        {GRUPPI.map(g => {
          const Icona = g.icon;
          return (
            <div key={g.nome} className="gruppo-menu" onMouseEnter={() => apri(g.nome)} onMouseLeave={chiudiPiano}>
              <button
                className={`voce-menu${attivo === g.nome ? " attiva" : ""}${aperto === g.nome ? " aperta" : ""}`}
                style={varColore(g.colore)} aria-haspopup="true" aria-expanded={aperto === g.nome}
                data-testid={`nav-gruppo-${g.nome.toLowerCase()}`}
                onClick={() => apri(g.nome)}
              >
                <Icona size={13} /> {g.nome} <ChevronDown size={12} className="freccia-gruppo" />
              </button>
              {aperto === g.nome && (
                <div className="tendina-menu" role="menu">
                  {g.schede.map(sc => <VoceScheda key={sc.href} sc={sc} attiva={isAttiva(percorso, sc.href)} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Telefono: un pulsante apre il pannello con tutti i gruppi */}
      <button className="bottone-pannello" aria-label="Apri il menu" aria-expanded={pannello} onClick={() => setPannello(true)}>
        <Menu size={16} /> Menu
        {attivo && <span className="gruppo-corrente">· {attivo}</span>}
      </button>
      {/* Il pannello va sopra tutto, anche sopra la testata col logo: per
          questo si appende direttamente alla pagina. */}
      {pannello && createPortal(
        <div className="pannello-menu" role="dialog" aria-label="Menu del sito">
          <div className="pannello-testa">
            <span>Menu</span>
            <button aria-label="Chiudi il menu" onClick={() => setPannello(false)}><X size={18} /></button>
          </div>
          <Link href="/">
            <a className={`voce-scheda${percorso === "/" ? " attiva" : ""}`} style={varColore("hsl(183 85% 62%)")}>
              <HomeIcon size={15} /><span><b>Home</b></span>
            </a>
          </Link>
          {GRUPPI.map(g => (
            <div key={g.nome} className="pannello-gruppo">
              <div className="pannello-titolo" style={{ color: g.colore }}>{g.nome}</div>
              {g.schede.map(sc => <VoceScheda key={sc.href} sc={sc} attiva={isAttiva(percorso, sc.href)} />)}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </nav>
  );
}


/** Una pagina dentro la tendina o il pannello: nome, icona e una riga di spiegazione. */
function VoceScheda({ sc, attiva }: { sc: Scheda; attiva: boolean }) {
  const Icona = sc.icon;
  return (
    <Link href={sc.href}>
      <a role="menuitem" className={`voce-scheda${attiva ? " attiva" : ""}`} aria-current={attiva ? "page" : undefined}
         data-testid={`nav-${sc.label.toLowerCase()}`}
         style={{ "--colore-voce": sc.colore, "--colore-voce-fondo": trasparente(sc.colore, 0.12) } as React.CSSProperties}>
        <Icona size={15} />
        <span><b>{sc.label}</b><small>{sc.nota}</small></span>
      </a>
    </Link>
  );
}
