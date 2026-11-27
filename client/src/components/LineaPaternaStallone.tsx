/**
 * Linea paterna nella scheda dello stallone (27/11/2026): sostituisce la
 * vecchia griglia "genealogia" con nonni e nonne. Stessi dati e stessi colori
 * di Albero stalloni: la catena padre -> padre del padre, i figli stalloni e
 * il lato della madre in una riga. Ogni nome porta alla sua scheda.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";

const COLORI_GEN = ["hsl(120 55% 52%)", "hsl(183 65% 55%)", "hsl(210 70% 65%)", "hsl(265 55% 68%)", "hsl(35 70% 60%)"];

interface S { nome: string; padre: string | null; generazione: number; voto: string | null; voto_confrontabile: boolean; punteggio: number | null; figli: number; nato: number | null }
interface Albero { stalloni: S[]; generazioni: { indice: number; nome: string }[] }

const CSS = `
.lp-linea { display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.lp-figli { display: flex; flex-wrap: wrap; gap: 6px; }
.lp-chip { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 10px; border-radius: 9px;
  border: 1px solid hsl(220 10% 20%); background: hsl(220 12% 10%); color: hsl(210 10% 90%); font-size: 12.5px; font-weight: 600;
  flex-shrink: 0; text-decoration: none; }
.lp-chip small { font-size: 10.5px; font-weight: 500; }
.lp-chip[data-io="true"] { border-color: currentColor; }
.lp-etich { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: hsl(210 8% 52%); margin: 14px 0 6px; }
`;

function Chip({ nome, s, sotto, io, nomeGen }: { nome: string; s?: S; sotto?: string; io?: boolean; nomeGen: (g: number) => string }) {
  const colore = s ? COLORI_GEN[s.generazione] ?? "hsl(210 8% 55%)" : "hsl(210 8% 55%)";
  const testo = (
    <>
      <span style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, color: "hsl(210 10% 90%)" }}>
        {nome}
        {s?.voto && <span style={{ opacity: s.voto_confrontabile ? 1 : 0.45, display: "inline-flex" }}><GradeBadge grade={s.voto} size="sm" /></span>}
      </span>
      <small style={{ color: colore }}>{sotto ?? (s ? nomeGen(s.generazione) : "fuori dall'albero")}</small>
    </>
  );
  if (io) return <span className="lp-chip" data-io="true" style={{ color: colore }}>{testo}</span>;
  return <Link href={`/stallion/${encodeURIComponent(nome)}`} className="lp-chip">{testo}</Link>;
}

export default function LineaPaternaStallone({ nome, padre, nonnoPaterno, madre, padreMadre }: {
  nome: string; padre?: string | null; nonnoPaterno?: string | null; madre?: string | null; padreMadre?: string | null;
}) {
  const { data } = useQuery<Albero>({
    queryKey: ["/api/stalloni/albero"],
    queryFn: async () => (await apiRequest("GET", "/api/stalloni/albero")).json(),
    staleTime: 3600_000,
  });
  const perNome = new Map((data?.stalloni ?? []).map(s => [s.nome, s]));
  const nomeGen = (g: number) => data?.generazioni.find(x => x.indice === g)?.nome?.toLowerCase() ?? "";
  const io = perNome.get(nome);

  // Si risale dall'albero; dove l'albero non arriva, si usa il pedigree della scheda.
  const su: string[] = [];
  let p: string | null | undefined = io?.padre ?? padre ?? null, giri = 0;
  while (p && giri++ < 10 && !su.includes(p) && p !== nome) {
    su.unshift(p);
    const prossimo: string | null | undefined = perNome.get(p)?.padre ?? (p === padre ? nonnoPaterno : null);
    p = prossimo;
  }
  const figli = (data?.stalloni ?? []).filter(s => s.padre === nome && s.nome !== nome)
    .sort((a, b) => (b.punteggio ?? -1) - (a.punteggio ?? -1) || b.figli - a.figli);

  if (!su.length && !figli.length && !madre) return null;
  return (
    <div className="pannello" style={{ padding: "16px 20px", marginBottom: 18 }} data-testid="linea-paterna-stallone">
      <style>{CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Linea paterna</span>
        <Link href={`/stalloni/albero?s=${encodeURIComponent(nome)}`} style={{ fontSize: 12, color: "hsl(120 55% 58%)" }}>Vedi nell'albero →</Link>
      </div>
      <div className="lp-linea" style={{ marginTop: 10 }}>
        {su.map(n => (
          <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Chip nome={n} s={perNome.get(n)} nomeGen={nomeGen} />
            <ChevronRight size={14} style={{ color: "hsl(210 8% 45%)" }} />
          </span>
        ))}
        <Chip nome={nome} s={io} io nomeGen={nomeGen} sotto={io ? nomeGen(io.generazione) : "questo stallone"} />
      </div>
      {(madre || padreMadre) && (
        <div style={{ fontSize: 12.5, color: "hsl(210 8% 62%)", marginTop: 8 }}>
          Madre <b style={{ color: "hsl(330 60% 72%)" }}>{madre ?? "—"}</b>
          {padreMadre && <> · padre della madre <Link href={`/stallion/${encodeURIComponent(padreMadre)}`} style={{ color: "hsl(212 70% 70%)", fontWeight: 700 }}>{padreMadre}</Link></>}
        </div>
      )}
      {figli.length > 0 && <>
        <div className="lp-etich">Figli stalloni · {figli.length}</div>
        <div className="lp-figli">
          {figli.slice(0, 16).map(f => <Chip key={f.nome} nome={f.nome} s={f} nomeGen={nomeGen} />)}
          {figli.length > 16 && (
            <Link href={`/stalloni/albero?s=${encodeURIComponent(nome)}&vista=dinastie`} style={{ fontSize: 12, color: "hsl(210 8% 60%)", alignSelf: "center" }}>
              e altri {figli.length - 16} →
            </Link>
          )}
        </div>
      </>}
    </div>
  );
}
