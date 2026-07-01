import { useState } from "react";
import { Link, useLocation } from "wouter";
import { TrendingUp, Trophy, Dna, ChevronLeft, ChevronRight, GitCompare } from "lucide-react";
import logoHorse from "@assets/logo-horse.jpg";

function TrottingHorse({ size = 36 }: { size?: number; color?: string }) {
  return (
    <img
      src={logoHorse}
      width={size}
      height={size}
      alt="StatIppica - Trotto MAISM"
      style={{ objectFit: "contain", borderRadius: "4px" }}
    />
  );
}


interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const sidebarLinks = [
    { href: "/", label: "Dashboard", icon: TrendingUp },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/advisor", label: "Advisor", icon: Dna },
    { href: "/compare", label: "Comparazione", icon: GitCompare },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: collapsed ? "60px 1fr" : "224px 1fr",
      height: "100dvh",
      overflow: "hidden",
      transition: "grid-template-columns 0.22s cubic-bezier(0.16,1,0.3,1)",
    }}>
      {/* Sidebar */}
      <aside style={{
        background: "hsl(220 14% 7%)",
        borderRight: "1px solid hsl(220 10% 14%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Brand */}
        <div style={{
          padding: collapsed ? "18px 12px" : "18px 18px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderBottom: "1px solid hsl(220 10% 12%)",
          minHeight: "72px",
        }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            <TrottingHorse size={collapsed ? 30 : 38} />
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <div style={{
                fontWeight: 800,
                fontSize: "15px",
                color: "hsl(210 10% 94%)",
                lineHeight: 1.15,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}>
                StatIppica
              </div>
              <div style={{
                fontSize: "10px",
                color: "hsl(183 60% 45%)",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: "1px",
              }}>
                Trotto MAISM
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{
          flex: 1,
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}>
          {sidebarLinks.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <a
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontWeight: active ? 700 : 400,
                    fontSize: "14px",
                    color: active ? "hsl(183 100% 62%)" : "hsl(210 8% 58%)",
                    background: active
                      ? "hsl(183 100% 38% / 0.12)"
                      : "transparent",
                    borderLeft: active
                      ? "2px solid hsl(183 100% 45%)"
                      : "2px solid transparent",
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.background = "hsl(220 10% 13%)";
                      e.currentTarget.style.color = "hsl(210 10% 78%)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "hsl(210 8% 58%)";
                    }
                  }}
                >
                  <Icon
                    size={17}
                    strokeWidth={active ? 2.5 : 1.8}
                    style={{ flexShrink: 0, color: active ? "hsl(183 100% 55%)" : undefined }}
                  />
                  {!collapsed && <span>{label}</span>}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Version + collapse */}
        <div style={{
          padding: "10px 8px",
          borderTop: "1px solid hsl(220 10% 12%)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}>
          {!collapsed && (
            <div style={{
              fontSize: "10px",
              color: "hsl(210 8% 35%)",
              padding: "0 12px",
              letterSpacing: "0.04em",
            }}>
              v1.0 · 2026 · 22k cavalli
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              padding: "8px",
              borderRadius: "8px",
              background: "hsl(220 10% 12%)",
              border: "1px solid hsl(220 10% 16%)",
              color: "hsl(210 8% 45%)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
            title={collapsed ? "Espandi" : "Comprimi"}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main style={{
        overflow: "auto",
        background: "hsl(var(--background))",
        overscrollBehavior: "contain",
      }}>
        {children}
      </main>
    </div>
  );
}
