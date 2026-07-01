import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";

interface SearchResult {
  name: string;
  birth_year: number;
  sire: string;
  sex: string;
  grade: string;
  score: number;
  rating_mode: string;
}

interface HorseSearchBarProps {
  placeholder?: string;
  onSelect?: (horse: SearchResult) => void;
  autoNavigate?: boolean;
}

export default function HorseSearchBar({ placeholder = "Cerca cavallo...", onSelect, autoNavigate = true }: HorseSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/search/horse?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 280);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleSelect(h: SearchResult) {
    setQuery(h.name);
    setOpen(false);
    if (onSelect) onSelect(h);
    if (autoNavigate) navigate(`/horse/${encodeURIComponent(h.name)}/${h.birth_year}`);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "hsl(220 12% 12%)",
        border: "1px solid hsl(220 10% 20%)",
        borderRadius: "10px",
        padding: "10px 14px",
        transition: "border-color 0.15s",
      }}>
        <Search size={16} style={{ color: "hsl(210 8% 50%)", flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          placeholder={placeholder}
          data-testid="input-horse-search"
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "hsl(210 10% 88%)",
            fontSize: "14px",
            letterSpacing: "0.03em",
          }}
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); setOpen(false); }}>
            <X size={14} style={{ color: "hsl(210 8% 45%)" }} />
          </button>
        )}
        {loading && (
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid hsl(183 100% 38% / 0.3)", borderTopColor: "hsl(183 100% 38%)", animation: "spin 0.7s linear infinite" }} />
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          right: 0,
          background: "hsl(220 12% 11%)",
          border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px",
          overflow: "hidden",
          zIndex: 100,
          boxShadow: "0 8px 32px hsl(220 20% 5% / 0.6)",
        }}>
          {results.map((h, i) => (
            <button
              key={`${h.name}-${h.birth_year}`}
              data-testid={`result-horse-${i}`}
              onClick={() => handleSelect(h)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid hsl(220 10% 16%)" : "none",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "hsl(220 10% 15%)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <GradeBadge grade={h.grade || "N/A"} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 88%)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.name}
                </div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 50%)" }}>
                  {h.birth_year} · {h.sire || "—"} · {h.sex === "M" ? "Maschio" : h.sex === "F" ? "Femmina" : "—"}
                </div>
              </div>
              {h.score != null && (
                <div className="tabular" style={{ fontSize: "11px", color: "hsl(210 8% 45%)" }}>
                  {h.score.toFixed(1)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          right: 0,
          background: "hsl(220 12% 11%)",
          border: "1px solid hsl(220 10% 20%)",
          borderRadius: "10px",
          padding: "16px",
          textAlign: "center",
          fontSize: "13px",
          color: "hsl(210 8% 45%)",
          zIndex: 100,
        }}>
          Nessun cavallo trovato per "{query}"
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
