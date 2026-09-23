import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import logoHorse from "@assets/statippica-logo.png";
import Wordmark from "./Wordmark";
import NavBar from "./NavBar";
import RicercaGlobale, { PulsanteRicerca, ricordaPercorso } from "./RicercaGlobale";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [percorso] = useLocation();
  const areaContenuto = useRef<HTMLElement>(null);

  /**
   * Riporta in cima a ogni cambio di scheda.
   *
   * Prima lo scorrimento restava dov'era: se si apriva un cavallo dal
   * fondo della classifica, la sua scheda si apriva a meta' pagina.
   * La zona che scorre e' il <main>, non la finestra, quindi va mossa
   * quella.
   */
  useEffect(() => {
    areaContenuto.current?.scrollTo({ top: 0, behavior: "auto" });
    // Ogni scheda aperta finisce fra le "aperte di recente" della ricerca.
    ricordaPercorso(percorso);
  }, [percorso]);

  // La ricerca si apre da ogni pagina: col pulsante, con "/" o con Ctrl+K.
  // Il tasto "/" non deve scattare mentre si scrive in un'altra casella.
  const [ricercaAperta, setRicercaAperta] = useState(false);
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const scrivendo = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !scrivendo)) {
        e.preventDefault();
        setRicercaAperta(true);
      }
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, []);

  return (
    <div style={{
      height: "100dvh",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "hsl(var(--background))",
    }}>
      {/* Top bar */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        minHeight: "52px",
        background: "hsl(220 14% 7%)",
        borderBottom: "1px solid hsl(220 10% 14%)",
        flexShrink: 0,
        zIndex: 100,
      }}>
        <Link href="/">
          <a style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <Wordmark size={17} withLogo logoSrc={logoHorse} logoSize={30} />
          </a>
        </Link>
        <PulsanteRicerca onApri={() => setRicercaAperta(true)} />
      </header>
      <RicercaGlobale aperta={ricercaAperta} onChiudi={() => setRicercaAperta(false)} />

      <NavBar />

      {/* Main content area */}
      <main ref={areaContenuto} style={{
        flex: 1,
        overflow: "auto",
        overscrollBehavior: "contain",
      }}>
        {children}
      </main>
    </div>
  );
}
