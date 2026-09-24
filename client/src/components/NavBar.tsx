import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Home as HomeIcon, ChevronLeft, ChevronRight, Trophy, Users, BookOpen, Sparkles, GitCompare, Calendar, TrendingUp, Network, Award, Building2, FlaskConical, Heart, MapPin, BookMarked } from "lucide-react";

/**
 * Le schede del sito, nell'ordine in cui compaiono nel menu.
 *
 * Prima esistevano solo come riquadri nella home: per passare dalla
 * classifica all'advisor bisognava tornare indietro. Ora sono sempre
 * raggiungibili dalla barra in alto.
 */
// Ogni scheda ha lo stesso colore del suo riquadro nella home: quando e'
// aperta (o ci passa sopra il cursore) la voce del menu prende quel colore,
// cosi' si riconosce a colpo d'occhio dove ci si trova.
const SCHEDE: { href: string; label: string; icon: typeof HomeIcon; colore: string }[] = [
  // Cavalli e Leaderboard erano la stessa tabella con filtri diversi: sono
  // un'unica voce, con dentro tutti i filtri di entrambe.
  { href: "/leaderboard", label: "Cavalli e classifica", icon: Trophy, colore: "hsl(51 80% 55%)" },
  { href: "/stalloni", label: "Stalloni", icon: BookOpen, colore: "hsl(120 60% 50%)" },
  { href: "/fattrici", label: "Fattrici", icon: Heart, colore: "hsl(330 70% 58%)" },
  { href: "/advisor", label: "Advisor", icon: Sparkles, colore: "hsl(280 60% 60%)" },
  { href: "/validazione", label: "Verifica", icon: FlaskConical, colore: "hsl(183 70% 52%)" },
  { href: "/compare", label: "Comparazione", icon: GitCompare, colore: "hsl(30 80% 55%)" },
  { href: "/pedigree", label: "Pedigree", icon: Network, colore: "hsl(220 60% 60%)" },
  { href: "/trend", label: "Trend", icon: TrendingUp, colore: "hsl(160 60% 50%)" },
  { href: "/qualifiche", label: "Qualifiche", icon: Award, colore: "hsl(280 60% 62%)" },
  { href: "/allevamento", label: "Allevamento", icon: Building2, colore: "hsl(20 70% 58%)" },
  { href: "/guidatori", label: "Guidatori", icon: Users, colore: "hsl(200 70% 58%)" },
  { href: "/ippodromi", label: "Ippodromi", icon: MapPin, colore: "hsl(95 55% 52%)" },
  { href: "/metodo", label: "Metodo e dati", icon: BookMarked, colore: "hsl(40 40% 72%)" },
  { href: "/calendario", label: "Calendario", icon: Calendar, colore: "hsl(0 60% 55%)" },
];

/** Vero quando la scheda indicata e' quella aperta adesso. */
function isAttiva(percorso: string, href: string): boolean {
  if (href === "/leaderboard") return percorso.startsWith("/leaderboard") || percorso.startsWith("/cavalli") || percorso.startsWith("/horse");
  if (href === "/stalloni") return percorso.startsWith("/stalloni") || percorso.startsWith("/stallion");
  if (href === "/fattrici") return percorso.startsWith("/fattric");
  if (href === "/cavalli") return percorso.startsWith("/cavalli") || percorso.startsWith("/horse");
  if (href === "/allevamento") return percorso.startsWith("/allevam");
  if (href === "/validazione") return percorso.startsWith("/validazione");
  if (href === "/guidatori") return percorso.startsWith("/guidator");
  if (href === "/ippodromi") return percorso.startsWith("/ippodrom") || percorso.startsWith("/piste");
  if (href === "/metodo") return percorso.startsWith("/metodo");
  if (href === "/advisor") return percorso.startsWith("/advisor");
  return percorso === href;
}

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

  // Sui telefoni la fila delle voci scorre di lato: la voce della scheda
  // aperta viene portata in vista, altrimenti il suo colore resterebbe
  // fuori dallo schermo.
  useEffect(() => {
    const voce = document.querySelector<HTMLElement>(".nav-schede .voce-menu.attiva");
    const fila = voce?.parentElement?.closest<HTMLElement>(".nav-schede");
    if (!voce || !fila) return;
    const v = voce.getBoundingClientRect(), f = fila.getBoundingClientRect();
    if (v.left < f.left || v.right > f.right) {
      fila.scrollBy({ left: (v.left + v.width / 2) - (f.left + f.width / 2), behavior: "smooth" });
    }
  }, [percorso]);

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

      {/* Schede. Su schermi stretti la fila scorre lateralmente invece
          di andare a capo e far crescere la barra in altezza. */}
      <div
        className="nav-schede"
        style={{
          display: "flex", gap: "2px", alignItems: "center",
          overflowX: "auto", overflowY: "hidden",
          scrollbarWidth: "none", flex: 1, minWidth: 0,
        }}
      >
        <Link href="/">
          <a
            data-testid="nav-home"
            className={`voce-menu${percorso === "/" ? " attiva" : ""}`}
            style={{ "--colore-voce": "hsl(183 85% 62%)", "--colore-voce-fondo": "hsl(183 60% 30% / 0.16)", "--colore-voce-bordo": "hsl(183 85% 62% / 0.4)" } as React.CSSProperties}
          >
            <HomeIcon size={13} />
            Home
          </a>
        </Link>

        {SCHEDE.map(({ href, label, icon: Icona, colore }) => {
          const attiva = isAttiva(percorso, href);
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase()}`}
                className={`voce-menu${attiva ? " attiva" : ""}`}
                aria-current={attiva ? "page" : undefined}
                style={{
                  "--colore-voce": colore,
                  "--colore-voce-fondo": trasparente(colore, 0.14),
                  "--colore-voce-bordo": trasparente(colore, 0.45),
                } as React.CSSProperties}
              >
                <Icona size={13} />
                {label}
              </a>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
