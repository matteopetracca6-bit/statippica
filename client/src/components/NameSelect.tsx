import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronDown, Search, X } from "lucide-react";

/**
 * TENDINA DI SCELTA DI UN CAVALLO.
 *
 * Nasce da una richiesta precisa: nelle pagine Pedigree e Advisor c'era solo
 * un campo di testo libero, quindi bisognava sapere a memoria il nome esatto
 * del cavallo. Qui invece si apre un elenco, si puo' filtrare scrivendo, e si
 * sceglie con il mouse o con le frecce.
 *
 * L'elenco arriva dal server (`endpoint`), che risponde anche a ricerca vuota
 * con i soggetti piu' quotati: cosi' la tendina non e' mai vuota all'apertura.
 */

export interface NameOption {
  name: string;
  birth_year?: number | null;
  sire?: string | null;
  grade?: string | null;
  score?: number | null;
  sex?: string | null;
}

interface Props {
  value: string;
  onChange: (name: string, option?: NameOption) => void;
  /** Rotta di ricerca, riceve ?q=... */
  endpoint: string;
  placeholder?: string;
  label?: string;
}

export default function NameSelect({ value, onChange, endpoint, placeholder, label }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Chiusura quando si clicca fuori dalla tendina.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const { data, isFetching } = useQuery<NameOption[]>({
    queryKey: [endpoint, debounced],
    queryFn: () => apiRequest("GET", `${endpoint}?q=${encodeURIComponent(debounced)}`).then(r => r.json()),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const options = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  function choose(o: NameOption) {
    onChange(o.name, o);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: "relative", minWidth: "260px", flex: 1 }}>
      {label && (
        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(210 8% 50%)", marginBottom: "6px" }}>
          {label}
        </div>
      )}

      <div
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 12px", borderRadius: "8px", cursor: "text",
          background: "hsl(220 14% 11%)",
          border: `1px solid ${open ? "hsl(183 100% 45%)" : "hsl(220 12% 22%)"}`,
        }}
      >
        <Search size={14} color="hsl(210 8% 45%)" />
        <input
          ref={inputRef}
          value={open ? query : value}
          placeholder={placeholder || "Scegli o scrivi un nome"}
          onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (options[highlight]) choose(options[highlight]);
              else if (query.trim()) { onChange(query.trim()); setOpen(false); }
            } else if (e.key === "Escape") setOpen(false);
          }}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "hsl(210 10% 92%)", fontSize: "14px", fontWeight: 600, letterSpacing: "0.02em",
          }}
        />
        {value && !open && (
          <button
            onClick={e => { e.stopPropagation(); onChange(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
            title="Cancella"
          >
            <X size={14} color="hsl(210 8% 45%)" />
          </button>
        )}
        <ChevronDown size={15} color="hsl(210 8% 45%)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </div>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
            maxHeight: "320px", overflowY: "auto",
            background: "hsl(220 14% 10%)", border: "1px solid hsl(220 12% 22%)",
            borderRadius: "8px", boxShadow: "0 12px 32px rgba(0,0,0,.55)",
          }}
        >
          {isFetching && options.length === 0 && (
            <div style={{ padding: "12px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>Cerco…</div>
          )}
          {!isFetching && options.length === 0 && (
            <div style={{ padding: "12px", fontSize: "12px", color: "hsl(210 8% 50%)" }}>Nessun cavallo trovato</div>
          )}
          {options.map((o, i) => (
            <div
              key={`${o.name}-${o.birth_year ?? i}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(o)}
              style={{
                padding: "9px 12px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                background: i === highlight ? "hsl(220 14% 15%)" : "transparent",
                borderBottom: "1px solid hsl(220 12% 15%)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 90%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {o.name}
                </div>
                <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[o.birth_year || null, o.sire ? `da ${o.sire}` : null].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              {o.grade && (
                <span style={{
                  fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px",
                  background: "hsl(220 14% 18%)", color: "hsl(183 60% 62%)", flexShrink: 0,
                }}>{o.grade}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
