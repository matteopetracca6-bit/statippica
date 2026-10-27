import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Trophy, Search, X } from "lucide-react";
import { GARE_GP, VITTORIE_GP, type VittoriaGP } from "@/data/granPremi";
import { LinkPista, LinkGuidatore } from "@/components/Collegamenti";
import { Spiegazione } from "@/components/Spiegazione";
import { CoppaGara } from "@/components/CoppaGara";

/**
 * GRAN PREMI: l'albo d'oro delle quindici corse piu' importanti del trotto
 * italiano, dal 2014 a oggi. I dati sono fissi (client/src/data/granPremi.ts):
 * si rifanno con gli script in scripts/gran_premi quando si corre una nuova
 * edizione.
 */

const ORO = "hsl(45 90% 58%)";

function NomeCavallo({ v }: { v: VittoriaGP }) {
  const testo = <span style={{ fontWeight: 700, color: "hsl(210 10% 94%)" }}>{v.vincitore}</span>;
  if (!v.scheda || !v.nato) return testo;
  return (
    <Link href={`/horse/${encodeURIComponent(v.vincitore)}/${v.nato}`} className="collegamento-scheda">{testo}</Link>
  );
}

function Divisione({ d }: { d: string | null }) {
  if (!d) return null;
  const f = d === "Femmine";
  return (
    <span style={{
      fontSize: "10.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", marginLeft: "6px",
      color: f ? "hsl(330 75% 72%)" : "hsl(205 75% 70%)",
      background: f ? "hsl(330 60% 50% / 0.14)" : "hsl(205 60% 50% / 0.14)",
    }}>{f ? "Femmine" : "Maschi"}</span>
  );
}

function dataBreve(d: string | null) {
  if (!d) return null;
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

export default function GranPremiPage() {
  const cerca = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const [gara, setGara] = useState<string>(cerca.get("gara") ?? "tutte");
  const [testo, setTesto] = useState("");

  const q = testo.trim().toUpperCase();
  const vittorie = useMemo(
    () => VITTORIE_GP.filter(v => (gara === "tutte" || v.gara === gara) && (!q || v.vincitore.includes(q))),
    [gara, q],
  );

  // I cavalli con piu' titoli, su tutte le corse.
  const plurivincitori = useMemo(() => {
    const m = new Map<string, { v: VittoriaGP; n: number; gare: Set<string> }>();
    for (const v of VITTORIE_GP) {
      const k = `${v.vincitore}|${v.nato ?? ""}`;
      const x = m.get(k) ?? { v, n: 0, gare: new Set<string>() };
      x.n += 1; x.gare.add(v.gara); m.set(k, x);
    }
    return Array.from(m.values()).filter(x => x.n >= 3).sort((a, b) => b.n - a.n || a.v.vincitore.localeCompare(b.v.vincitore));
  }, []);

  const nCavalli = new Set(VITTORIE_GP.map(v => `${v.vincitore}|${v.nato ?? ""}`)).size;
  const anni = VITTORIE_GP.map(v => v.anno);
  const gareMostrate = GARE_GP.filter(g => gara === "tutte" || g.id === gara)
    .filter(g => vittorie.some(v => v.gara === g.id));

  return (
    <div className="page-shell fade-in">
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: "0 0 6px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Trophy size={26} color={ORO} /> Gran Premi
      </h1>
      <div style={{ color: "hsl(210 8% 62%)", fontSize: "14px", marginBottom: "14px" }}>
        I vincitori delle {GARE_GP.length} corse più importanti del trotto italiano, dal {Math.min(...anni)} a oggi.
      </div>
      <div style={{ marginBottom: "20px" }}>
        <Spiegazione titolo="Da dove vengono questi nomi" compatta>
          Dal 2016 ogni vincitore è preso dai risultati ufficiali della Grande Ippica Italiana (il sito del
          Ministero), cercando la corsa per nome: per le gare con batterie conta solo la finale, le corse di
          consolazione sono escluse. Il 2014 e il 2015 non sono nel database ufficiale e vengono dagli albi d&apos;oro
          degli ippodromi e da Wikipedia. Le corse del 2026 non ancora disputate compariranno quando si correranno.
          Il nome del cavallo porta alla sua scheda quando il cavallo è nel nostro archivio.
        </Spiegazione>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Corse", value: GARE_GP.length },
          { label: "Edizioni", value: VITTORIE_GP.length },
          { label: "Cavalli vincitori", value: nCavalli },
          { label: "Più titoli", value: plurivincitori[0] ? `${plurivincitori[0].v.vincitore} (${plurivincitori[0].n})` : "—" },
        ].map(k => (
          <div key={k.label} className="pannello" style={{ padding: "12px 14px", ["--colore-pannello" as any]: ORO }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "hsl(210 8% 55%)", marginBottom: "4px" }}>{k.label}</div>
            <div style={{ fontSize: "19px", fontWeight: 700, color: "hsl(210 10% 92%)" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {plurivincitori.length > 0 && (
        <div className="pannello" style={{ padding: "16px 18px", marginBottom: "20px", ["--colore-pannello" as any]: ORO }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
            Almeno tre titoli
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {plurivincitori.map(x => (
              <button key={x.v.vincitore + x.v.nato} onClick={() => { setTesto(x.v.vincitore); setGara("tutte"); }}
                className="pannello-cliccabile"
                title={Array.from(x.gare).map(g => GARE_GP.find(z => z.id === g)?.nome).join(", ")}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "999px",
                         background: "hsl(45 80% 50% / 0.10)", border: "1px solid hsl(45 80% 55% / 0.35)", color: "hsl(210 10% 90%)",
                         fontSize: "12.5px", cursor: "pointer" }}>
                <span style={{ display: "inline-flex", gap: "1px" }}>
                  {Array.from(x.gare).slice(0, 4).map(g => <CoppaGara key={g} gara={g} size={15} />)}
                </span> {x.v.vincitore}
                <span style={{ color: ORO, fontWeight: 700 }}>{x.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "18px" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: "320px" }}>
          <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "hsl(210 8% 50%)" }} />
          <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca un cavallo…"
            style={{ width: "100%", padding: "8px 30px 8px 32px", borderRadius: "8px", border: "1px solid hsl(210 10% 22%)",
                     background: "hsl(210 12% 11%)", color: "hsl(210 10% 92%)", fontSize: "13.5px" }} />
          {testo && (
            <button onClick={() => setTesto("")} aria-label="Cancella"
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "hsl(210 8% 55%)", cursor: "pointer" }}>
              <X size={14} />
            </button>
          )}
        </div>
        <select value={gara} onChange={e => setGara(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid hsl(210 10% 22%)", background: "hsl(210 12% 11%)", color: "hsl(210 10% 92%)", fontSize: "13.5px", maxWidth: "100%" }}>
          <option value="tutte">Tutte le corse</option>
          {GARE_GP.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </div>

      {gareMostrate.length === 0 && (
        <div className="pannello" style={{ padding: "18px", color: "hsl(210 8% 62%)" }}>Nessun vincitore con questo nome.</div>
      )}

      <div className="griglia-gran-premi">
        {gareMostrate.map(g => {
          const righe = vittorie.filter(v => v.gara === g.id)
            .sort((a, b) => b.anno - a.anno || (a.divisione ?? "").localeCompare(b.divisione ?? ""));
          return (
            <div key={g.id} id={`gp-${g.id}`} className="pannello" style={{ padding: "16px 18px", ["--colore-pannello" as any]: ORO }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="coppa-gp"><CoppaGara gara={g.id} size={34} title={g.nome} /></div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: "16.5px", fontWeight: 800, color: "hsl(45 85% 66%)", margin: 0 }}>{g.nome}</h2>
                  <div style={{ fontSize: "12px", color: "hsl(210 8% 55%)", marginTop: "2px" }}>{g.info}</div>
                </div>
              </div>
              {g.nota && <div style={{ fontSize: "12px", color: "hsl(210 8% 58%)", marginTop: "4px" }}>{g.nota}</div>}
              <div style={{ overflowX: "auto", marginTop: "10px" }}>
                <table className="tabella-gp">
                  <thead>
                    <tr><th>Anno</th><th>Vincitore</th><th className="solo-largo">Guidatore</th><th className="solo-largo">Tempo</th><th>Pista</th></tr>
                  </thead>
                  <tbody>
                    {righe.map(v => (
                      <tr key={`${v.anno}-${v.divisione ?? ""}`}>
                        <td title={dataBreve(v.data) ?? undefined} style={{ color: "hsl(210 8% 70%)", fontVariantNumeric: "tabular-nums" }}>
                          <a href={v.fonte} target="_blank" rel="noreferrer" title="Fonte" style={{ color: "inherit" }}>{v.anno}</a>
                        </td>
                        <td>
                          <NomeCavallo v={v} /><Divisione d={v.divisione} />
                          {v.nota && <div style={{ fontSize: "11px", color: "hsl(210 8% 52%)" }}>{v.nota}</div>}
                          {(v.driver || v.tempo) && (
                            <div className="solo-stretto" style={{ fontSize: "11.5px", color: "hsl(210 8% 58%)", marginTop: "2px" }}>
                              {[v.driver, v.tempo].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="solo-largo" style={{ color: "hsl(210 8% 72%)" }}>{v.driver ? <LinkGuidatore nome={v.driver} /> : "—"}</td>
                        <td className="solo-largo" style={{ fontVariantNumeric: "tabular-nums", color: "hsl(210 8% 72%)" }}>{v.tempo ?? "—"}</td>
                        <td>{v.pista ? <LinkPista codice={v.pista} /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
