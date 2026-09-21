import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import {
  Home as HomeIcon, ChevronLeft, ChevronRight, Trophy, Users, BookOpen,
  Sparkles, GitCompare, Calendar, TrendingUp, Network, Award, Building2,
  FlaskConical, Heart,
} from "lucide-react";

/**
 * Le schede del sito, nell'ordine in cui compaiono nel menu.
 *
 * Prima esistevano solo come riquadri nella home: per passare dalla
 * classifica all'advisor bisognava tornare indietro. Ora sono sempre
 * raggiungibili dalla barra in alto.
 */
const SCHEDE: { href: string; label: string; icon: typeof HomeIcon }[] = [
  // Cavalli e Leaderboard erano la stessa tabella con filtri diversi: sono
  // un'unica voce, con dentro tutti i filtri di entrambe.
  { href: "/leaderboard", label: "Cavalli e classifica", icon: Trophy },
  { href: "/stalloni", label: "Stalloni", icon: BookOpen },
  { href: "/fattrici", label: "Fattrici", icon: Heart },
  { href: "/advisor", label: "Advisor", icon: Sparkles },
  { href: "/validazione", label: "Verifica", icon: FlaskConical },
  { href: "/compare", label: "Comparazione", icon: GitCompare },
  { href: "/pedigree", label: "Pedigree", icon: Network },
  { href: "/trend", label: "Trend", icon: TrendingUp },
  { href: "/qualifiche", label: "Qualifiche", icon: Award },
  { href: "/allevamento", label: "Allevamento", icon: Building2 },
  { href: "/calendario", label: "Calendario", icon: Calendar },
];

/** Vero quando la scheda indicata e' quella aperta adesso. */
function isAttiva(percorso: string, href: string): boolean {
  if (href === "/leaderboard") return percorso.startsWith("/leaderboard");
  if (href === "/stalloni") return percorso.startsWith("/stalloni") || percorso.startsWith("/stallion");
  if (href === "/fattrici") return percorso.startsWith("/fattric");
  if (href === "/cavalli") return percorso.startsWith("/cavalli") || percorso.startsWith("/horse");
  if (href === "/allevamento") return percorso.startsWith("/allevam");
  if (href === "/validazione") return percorso.startsWith("/validazione");
  return percorso === href;
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
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "5px 10px", borderRadius: "7px",
              fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
              textDecoration: "none",
              color: percorso === "/" ? "hsl(183 85% 62%)" : "hsl(210 8% 55%)",
              background: percorso === "/" ? "hsl(183 60% 30% / 0.16)" : "transparent",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { if (percorso !== "/") e.currentTarget.style.color = "hsl(210 10% 82%)"; }}
            onMouseLeave={e => { if (percorso !== "/") e.currentTarget.style.color = "hsl(210 8% 55%)"; }}
          >
            <HomeIcon size={13} />
            Home
          </a>
        </Link>

        {SCHEDE.map(({ href, label, icon: Icona }) => {
          const attiva = isAttiva(percorso, href);
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase()}`}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "5px 10px", borderRadius: "7px",
                  fontSize: "12px", fontWeight: attiva ? 700 : 600,
                  whiteSpace: "nowrap", textDecoration: "none",
                  color: attiva ? "hsl(183 85% 62%)" : "hsl(210 8% 55%)",
                  background: attiva ? "hsl(183 60% 30% / 0.16)" : "transparent",
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => { if (!attiva) e.currentTarget.style.color = "hsl(210 10% 82%)"; }}
                onMouseLeave={e => { if (!attiva) e.currentTarget.style.color = "hsl(210 8% 55%)"; }}
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
