import { Link } from "wouter";
import { Home as HomeIcon } from "lucide-react";
import logoHorse from "@assets/statippica-logo.png";
import Wordmark from "./Wordmark";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
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
        <Link href="/">
          <a style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "8px",
            background: "hsl(220 10% 12%)",
            border: "1px solid hsl(220 10% 16%)",
            color: "hsl(210 8% 65%)",
            fontSize: "12px",
            fontWeight: 600,
            textDecoration: "none",
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "hsl(220 10% 16%)"; e.currentTarget.style.color = "hsl(183 80% 60%)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "hsl(220 10% 12%)"; e.currentTarget.style.color = "hsl(210 8% 65%)"; }}
          >
            <HomeIcon size={14} />
            Home
          </a>
        </Link>
      </header>

      {/* Main content area */}
      <main style={{
        flex: 1,
        overflow: "auto",
        overscrollBehavior: "contain",
      }}>
        {children}
      </main>
    </div>
  );
}
