/**
 * La pagina iniziale per categorie.
 *
 * Prima c'erano sedici riquadri tutti uguali in fila: per trovare "quanto vale
 * un puledro" bisognava leggerli tutti. Ora ci sono le cinque categorie del
 * menu, grandi e colorate; se ne sceglie una e sotto compaiono le sue pagine,
 * ognuna col suo colore di sempre. La scelta resta finche' la scheda del
 * browser e' aperta, cosi' tornando indietro si ritrova la categoria aperta.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { GRUPPI, type Gruppo, type Scheda } from "@/lib/sezioni";

const CHIAVE = "statippica.home.categoria";

// I colori sono scritti come hsl(...): la trasparenza va dentro la parentesi.
export function trasparente(colore: string, alfa: number) {
  return colore.startsWith("hsl(") ? colore.replace(/\)$/, ` / ${alfa})`) : colore;
}

function varsColore(c: string) {
  return {
    "--colore-riquadro": c,
    "--colore-riquadro-alone": trasparente(c, 0.22),
    "--colore-riquadro-icona": trasparente(c, 0.12),
    "--colore-riquadro-fondo": trasparente(c, 0.07),
  } as React.CSSProperties;
}

function RiquadroPagina({ sc }: { sc: Scheda }) {
  const Icon = sc.icon;
  return (
    <Link href={sc.href}>
      <a className="riquadro-home" style={varsColore(sc.colore)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="riquadro-home-icona"><Icon size={18} style={{ color: sc.colore }} /></div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 10% 90%)", letterSpacing: "0.02em" }}>{sc.label}</span>
        </div>
        <span style={{ fontSize: 12, color: "hsl(210 8% 52%)", lineHeight: 1.5 }}>{sc.descrizione}</span>
      </a>
    </Link>
  );
}

function Categoria({ g, scelta, onScegli }: { g: Gruppo; scelta: boolean; onScegli: () => void }) {
  const Icon = g.icon;
  return (
    <button type="button" className={`categoria-grande${scelta ? " scelta" : ""}`} style={varsColore(g.colore)}
            role="tab" aria-selected={scelta} aria-controls="pagine-categoria" onClick={onScegli}
            data-testid={`categoria-${g.nome.toLowerCase()}`}>
      <span className="categoria-grande-icona"><Icon size={26} style={{ color: g.colore }} /></span>
      <span className="categoria-grande-nome">{g.nome}</span>
      <span className="categoria-grande-desc">{g.descrizione}</span>
      <span className="categoria-grande-piede">
        <span className="categoria-grande-pallini" aria-hidden="true">
          {g.schede.map(sc => { const I = sc.icon; return <span key={sc.href} style={{ background: trasparente(sc.colore, 0.16) }}><I size={12} style={{ color: sc.colore }} /></span>; })}
        </span>
        <span>{g.schede.length} pagine</span>
        <ChevronDown size={15} className="categoria-grande-freccia" />
      </span>
    </button>
  );
}

export default function EsploraCategorie() {
  const [scelta, setScelta] = useState<string | null>(() => {
    try { return sessionStorage.getItem(CHIAVE); } catch { return null; }
  });
  const pannello = useRef<HTMLDivElement>(null);
  const appenaScelta = useRef(false);

  useEffect(() => {
    try { scelta ? sessionStorage.setItem(CHIAVE, scelta) : sessionStorage.removeItem(CHIAVE); } catch { /* niente */ }
    // Sul telefono le pagine compaiono sotto le cinque categorie, fuori
    // dallo schermo: ci si porta li', ma solo dopo un tocco.
    if (scelta && appenaScelta.current && pannello.current) {
      const r = pannello.current.getBoundingClientRect();
      if (r.top > window.innerHeight - 120) pannello.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    appenaScelta.current = false;
  }, [scelta]);

  const g = GRUPPI.find(x => x.nome === scelta) ?? null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
        Esplora
      </div>
      <div className="categorie-grandi" role="tablist" aria-label="Categorie del sito">
        {GRUPPI.map(x => (
          <Categoria key={x.nome} g={x} scelta={x.nome === scelta}
                     onScegli={() => { appenaScelta.current = true; setScelta(s => (s === x.nome ? null : x.nome)); }} />
        ))}
      </div>
      <div ref={pannello} id="pagine-categoria" role="tabpanel" style={{ scrollMarginTop: 80 }}>
        {g ? (
          <div className="categoria-pagine" style={varsColore(g.colore)}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: g.colore }}>{g.nome}</span>
              <span style={{ fontSize: 12, color: "hsl(210 8% 52%)" }}>{g.descrizione}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(230px, 100%), 1fr))", gap: 12 }}>
              {g.schede.map(sc => <RiquadroPagina key={sc.href} sc={sc} />)}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 12, color: "hsl(210 8% 50%)" }}>
            Scegli una categoria per vedere le sue pagine.
          </div>
        )}
      </div>
    </div>
  );
}
