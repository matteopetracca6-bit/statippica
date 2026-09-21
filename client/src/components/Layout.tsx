import { Link, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import logoHorse from "@assets/statippica-logo.png";
import Wordmark from "./Wordmark";
import NavBar from "./NavBar";

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
  }, [percorso]);

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
        <span style={{ fontSize: "11px", color: "hsl(210 8% 38%)", letterSpacing: "0.04em" }}>
          Archivio trotto italiano
        </span>
      </header>

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
