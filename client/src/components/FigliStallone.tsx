/**
 * Tutti i figli dello stallone (28/11/2026), come la progenie delle fattrici:
 * quelli registrati nell'archivio, anche i nati prima del 2012 con il voto
 * storico (st). Prima la scheda mostrava solo i figli con il voto delle corse
 * (LEMON DRA: 1 su 511). Gli storici arrivano un po' alla volta con il
 * recupero notturno dal registro UNIRE. Dati da /api/stallion/:name/figli.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";
import BandieraCavallo from "./BandieraCavallo";
import { formatRecord } from "@/lib/record";

interface Figlio {
  name: string; birth_year: number | null; sex: string | null; dam: string | null; grade: string | null; score: number | null;
  scala: "corse" | "storico" | null; career_races: number | null; career_wins: number | null; career_earnings: number | null;
  record_career: string | null; win_rate: number | null;
}
type Ordine = "nome" | "anno" | "madre" | "voto" | "corse" | "vinte" | "guadagni" | "record";
/** Record in secondi al km (1.13.0 -> 73,0); senza record in fondo. */
const secondi = (r: string | null) => {
  const m = formatRecord(r).match(/^(\d+)\.(\d{2})\.(\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10 : null;
};
const MUTO = "hsl(210 8% 52%)";
const PESO: Record<string, number> = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
const euro = (n: number | null) => n ? `€${Math.round(n).toLocaleString("it-IT")}` : "—";
const PASSO = 25;

export default function FigliStallone({ nome, dichiarati }: { nome: string; dichiarati?: number | null }) {
  const { data, isLoading } = useQuery<{ figli: Figlio[] }>({
    queryKey: ["/api/stallion/figli", nome],
    queryFn: async () => (await apiRequest("GET", `/api/stallion/${encodeURIComponent(nome)}/figli`)).json(),
    enabled: !!nome, staleTime: 3600_000,
  });
  const [ordine, setOrdine] = useState<Ordine>("guadagni");
  const [cresc, setCresc] = useState(false);
  // Clic sull'intestazione: ordina per quella colonna, un secondo clic inverte.
  // Il verso di partenza e' il piu' utile: record dal piu' veloce, nomi dalla A, il resto dal piu' alto.
  const ordina = (k: Ordine) => {
    if (k === ordine) setCresc(c => !c);
    else { setOrdine(k); setCresc(k === "record" || k === "nome" || k === "madre"); }
    setQuanti(PASSO);
  };
  const [cerca, setCerca] = useState("");
  const [quanti, setQuanti] = useState(PASSO);
  const figli = data?.figli ?? [];
  const righe = useMemo(() => {
    const q = cerca.trim().toUpperCase();
    const r = figli.filter(f => !q || f.name.includes(q) || (f.dam ?? "").toUpperCase().includes(q));
    const val: Record<Ordine, (f: Figlio) => number | string | null> = {
      nome: f => f.name, madre: f => f.dam || null, anno: f => f.birth_year,
      voto: f => f.grade && PESO[f.grade] ? PESO[f.grade] * 1000 + (f.score ?? 0) : null,
      corse: f => f.career_races, vinte: f => f.career_wins, guadagni: f => f.career_earnings || null, record: f => secondi(f.record_career),
    };
    const v = val[ordine];
    return r.sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null && y == null) return (b.career_earnings ?? 0) - (a.career_earnings ?? 0);
      if (x == null) return 1; if (y == null) return -1;   // i dati mancanti sempre in fondo
      const c = typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number);
      return (cresc ? c : -c) || (b.career_earnings ?? 0) - (a.career_earnings ?? 0);
    });
  }, [figli, ordine, cresc, cerca]);
  const conVoto = figli.filter(f => f.grade && f.grade !== "N/A").length;
  const storici = figli.filter(f => f.scala === "storico").length;
  const anni = figli.map(f => f.birth_year).filter((x): x is number => !!x);
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px 8px", fontSize: 10.5, fontWeight: 600, color: "hsl(210 8% 42%)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "8px", fontSize: 12, color: "hsl(210 8% 60%)", whiteSpace: "nowrap" };

  return (
    <div className="pannello" style={{ padding: "18px 22px", marginBottom: 18 }} data-testid="figli-stallone">
      <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Tutti i figli · {figli.length.toLocaleString("it-IT")}
      </div>
      {isLoading ? <div style={{ fontSize: 12.5, color: MUTO, marginTop: 8 }}>Carico i figli…</div> : !figli.length ? (
        <div style={{ fontSize: 12.5, color: MUTO, marginTop: 8 }}>Nessun figlio di questo stallone nell&apos;archivio.</div>
      ) : (<>
        <div className="tabular" style={{ fontSize: 12.5, color: MUTO, margin: "6px 0 10px", lineHeight: 1.5 }}>
          {conVoto.toLocaleString("it-IT")} con un voto{storici ? ` (${storici.toLocaleString("it-IT")} sulla scala storica, st)` : ""}
          {anni.length ? ` · nati dal ${Math.min(...anni)} al ${Math.max(...anni)}` : ""}
          {dichiarati && dichiarati > figli.length ? ` · dichiarati ${dichiarati.toLocaleString("it-IT")}: gli altri arrivano con il recupero notturno dal registro UNIRE` : ""}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10, fontSize: 11.5, color: MUTO }}>
          <span>Tocca un titolo della tabella per ordinare.</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 20%)",
            borderRadius: 8, padding: "5px 9px", minWidth: 0, flex: "0 1 220px" }}>
            <Search size={13} style={{ color: MUTO, flexShrink: 0 }} />
            <input value={cerca} onChange={e => { setCerca(e.target.value); setQuanti(PASSO); }} placeholder="Cerca figlio o madre" aria-label="Cerca un figlio"
              style={{ background: "none", border: "none", outline: "none", color: "hsl(210 10% 90%)", fontSize: 12.5, minWidth: 0, width: "100%", fontFamily: "inherit" }} />
            {cerca && <button type="button" onClick={() => setCerca("")} aria-label="Cancella" style={{ background: "none", border: "none", color: MUTO, cursor: "pointer", display: "flex", padding: 0 }}><X size={13} /></button>}
          </label>
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid hsl(220 10% 18%)" }}>
                {([["nome", "Cavallo"], ["anno", "Anno"], ["madre", "Madre"], ["voto", "Voto"], ["corse", "Corse"], ["vinte", "Vinte"], ["guadagni", "Guadagni"], ["record", "Record"]] as [Ordine, string][]).map(([k, h]) => (
                  <th key={k} style={th} aria-sort={ordine === k ? (cresc ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => ordina(k)} title={`Ordina per ${h.toLowerCase()}`}
                      style={{ all: "unset", cursor: "pointer", color: ordine === k ? "hsl(120 55% 62%)" : "inherit", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      {h}{ordine === k ? (cresc ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righe.slice(0, quanti).map(f => (
                <tr key={`${f.name}-${f.birth_year}`} style={{ borderBottom: "1px solid hsl(220 10% 14%)" }}>
                  <td style={{ ...td, color: "hsl(210 8% 82%)" }}>
                    <Link href={`/horse/${encodeURIComponent(f.name)}/${f.birth_year ?? 0}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <BandieraCavallo nome={f.name} />{f.name}
                      {f.sex && <span style={{ fontSize: 10.5, color: f.sex === "F" ? "hsl(330 60% 70%)" : "hsl(212 60% 70%)" }}>{f.sex}</span>}
                    </Link>
                  </td>
                  <td className="tabular" style={td}>{f.birth_year ?? "—"}</td>
                  <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.dam ? <Link href={`/fattrice/${encodeURIComponent(f.dam)}`} style={{ color: "inherit", textDecoration: "none" }}>{f.dam}</Link> : "—"}
                  </td>
                  <td style={td}>
                    {f.grade && f.grade !== "N/A" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><GradeBadge grade={f.grade} size="sm" />
                      {f.scala === "storico" && <span title="Scala storica: carriera prima del 2012, confrontata solo con gli altri storici" style={{ fontSize: 10, color: MUTO }}>st</span>}</span>
                      : <span style={{ fontSize: 11, color: "hsl(210 8% 42%)" }}>—</span>}
                  </td>
                  <td className="tabular" style={td}>{f.career_races ?? "—"}</td>
                  <td className="tabular" style={td}>{f.career_wins ?? "—"}</td>
                  <td className="tabular" style={{ ...td, color: "hsl(51 80% 60%)" }}>{euro(f.career_earnings)}</td>
                  <td className="tabular" style={{ ...td, color: "hsl(183 70% 55%)" }}>{f.record_career ? formatRecord(f.record_career) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {righe.length > quanti && (
          <button type="button" className="lista-altre" onClick={() => setQuanti(q => q + 50)}>Mostra altri {Math.min(50, righe.length - quanti)} (di {righe.length.toLocaleString("it-IT")})</button>
        )}
        {cerca && !righe.length && <div style={{ fontSize: 12.5, color: MUTO, marginTop: 8 }}>Nessun figlio con questo nome.</div>}
      </>)}
    </div>
  );
}
