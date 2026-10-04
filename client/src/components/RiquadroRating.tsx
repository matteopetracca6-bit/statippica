/**
 * Riquadro "Rating" della home.
 *
 * Chiuso mostra quanti cavalli ci sono in ogni lettera. Cliccandolo si apre:
 * spiega in poche righe come nasce il voto e, lettera per lettera, cosa ha
 * fatto in pratica il cavallo tipico (guadagni, gare, vittorie, stagioni,
 * record), con un esempio da aprire.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Activity, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";

const GRADE_COLORS: Record<string, string> = {
  SSS: "hsl(51 100% 55%)", SS: "hsl(0 0% 78%)", S: "hsl(30 70% 60%)",
  A: "hsl(183 60% 55%)", B: "hsl(100 45% 50%)", C: "hsl(25 55% 52%)",
  D: "hsl(40 5% 48%)", E: "hsl(40 4% 38%)", F: "hsl(40 3% 28%)",
};
const MUTED = "hsl(210 8% 52%)";
const PARTI = [
  { nome: "Guadagni", peso: 45, cosa: "quanto ha vinto in carriera" },
  { nome: "Record", peso: 15, cosa: "il miglior tempo al chilometro" },
  { nome: "Vittorie", peso: 15, cosa: "quota di corse vinte, corretta se le corse sono poche" },
  { nome: "Tenuta", peso: 12.5, cosa: "quante stagioni ha corso" },
  { nome: "Continuità", peso: 12.5, cosa: "stagioni corse su quelle che poteva correre" },
];

interface Voto {
  voto: string; quota: string; n: number; pct: number; punteggio_min: number; punteggio_max: number;
  guadagno_mediano: number; gare_mediane: number; vittorie_mediane: number; vittorie_pct: number;
  stagioni_mediane: number; record_mediano: number | null;
  esempio: { nome: string; anno: number } | null; migliore: { nome: string; anno: number } | null;
}

const euro = (n: number) => "€" + Math.round(n).toLocaleString("it-IT");
const record = (r: number | null) => r == null ? "—" : `1'${r.toFixed(1).replace(".", "\"")}`;

export default function RiquadroRating() {
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ totale: number; voti: Voto[] }>({
    queryKey: ["/api/rating-voti"],
    queryFn: async () => (await apiRequest("GET", "/api/rating-voti")).json(),
    staleTime: 10 * 60 * 1000,
  });

  const apri = (v?: string) => { setAperto(a => (v ? true : !a)); if (v) setScelto(s => (s === v ? null : v)); };
  const sel = data?.voti.find(v => v.voto === scelto);

  return (
    <div className="riquadro-rating" style={{
      background: "hsl(220 12% 10%)", border: `1px solid ${aperto ? "hsl(183 60% 55% / 0.45)" : "hsl(220 10% 16%)"}`,
      borderRadius: "14px", padding: "22px 24px", transition: "border-color 0.2s",
    }}>
      <button onClick={() => apri()} aria-expanded={aperto}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", width: "100%", marginBottom: "16px" }}>
        <Activity size={16} style={{ color: "hsl(183 60% 55%)" }} />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Rating
        </span>
        <span style={{ fontSize: "12px", color: "hsl(183 60% 55%)", marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
          {aperto ? "Chiudi" : "Come si fa il voto e cosa vuol dire ogni lettera"}
          <ChevronDown size={14} style={{ transform: aperto ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </span>
      </button>

      {isLoading || !data ? (
        <div className="skeleton" style={{ height: "120px", borderRadius: "8px" }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.voti.map(v => (
            <button key={v.voto} onClick={() => apri(v.voto)} title={`Vedi i dati dei cavalli ${v.voto}`}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px",
                       padding: "3px 4px", borderRadius: "6px",
                       background: scelto === v.voto ? "hsl(220 10% 15%)" : "transparent" }}>
              <span style={{ width: "32px", flexShrink: 0 }}><GradeBadge grade={v.voto} size="sm" /></span>
              <span style={{ flex: 1, height: "22px", background: "hsl(220 12% 8%)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.max(v.pct / Math.max(...data.voti.map(x => x.pct)) * 100, 1)}%`, background: GRADE_COLORS[v.voto], borderRadius: "4px" }} />
                <span className="tabular" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  {v.n.toLocaleString("it-IT")} ({v.pct.toLocaleString("it-IT")}%)
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {aperto && data && (
        <div style={{ marginTop: "20px", paddingTop: "18px", borderTop: "1px solid hsl(220 10% 16%)", display: "grid", gap: "18px" }}>
          {/* Come si fa */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: "20px" }}>
            <div style={{ fontSize: "13px", color: "hsl(210 10% 80%)", lineHeight: 1.7 }}>
              <b style={{ color: "hsl(210 10% 92%)" }}>Come nasce il voto.</b> Ogni cavallo nato dal 2012 che ha corso
              riceve un punteggio da 0 a 100, fatto di cinque parti. Ogni parte è un confronto con gli altri
              {" "}{data.totale.toLocaleString("it-IT")} cavalli votati, non un valore assoluto. Poi i cavalli si mettono in fila
              per punteggio e la lettera dipende dalla posizione: <b>SSS</b> è l'1% migliore, <b>SS</b> arriva al 5%,
              {" "}<b>S</b> al 10%, <b>A</b> al 25%, <b>B</b> al 40%, <b>C</b> al 60%, <b>D</b> al 75%, <b>E</b> al 90%, <b>F</b> il resto.
              Un cavallo giovane con poche corse può ancora cambiare lettera.
              {" "}<Link href="/metodo"><a style={{ color: "hsl(183 60% 55%)" }}>Il metodo completo</a></Link>.
            </div>
            <div style={{ display: "grid", gap: "7px" }}>
              {PARTI.map(p => (
                <div key={p.nome} style={{ display: "grid", gridTemplateColumns: "90px 1fr 46px", alignItems: "center", gap: "10px", fontSize: "12.5px" }}>
                  <span style={{ color: "hsl(210 10% 88%)", fontWeight: 600 }}>{p.nome}</span>
                  <span title={p.cosa} style={{ height: "10px", background: "hsl(220 12% 8%)", borderRadius: "5px", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${p.peso / 45 * 100}%`, background: "hsl(183 60% 50%)", borderRadius: "5px" }} />
                  </span>
                  <span className="tabular" style={{ color: MUTED, textAlign: "right" }}>{p.peso.toLocaleString("it-IT")}%</span>
                  <span style={{ gridColumn: "1 / -1", color: MUTED, fontSize: "11.5px", marginTop: "-4px" }}>{p.cosa}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dati per lettera */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ fontSize: "12.5px", color: MUTED, marginBottom: "8px" }}>
              Il cavallo tipico di ogni lettera (valore di mezzo). Clicca una riga per un esempio.
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "760px" }} className="tabular">
              <thead>
                <tr style={{ color: MUTED, fontSize: "11px", textAlign: "right" }}>
                  {["Voto", "Posizione", "Cavalli", "Punteggio", "Guadagni", "Gare", "Vittorie", "% vinte", "Stagioni", "Record"].map((t, i) => (
                    <th key={t} style={{ padding: "6px 8px", fontWeight: 600, textAlign: i < 2 ? "left" : "right", borderBottom: "1px solid hsl(220 10% 16%)" }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.voti.map(v => (
                  <tr key={v.voto} onClick={() => setScelto(s => (s === v.voto ? null : v.voto))}
                      style={{ cursor: "pointer", borderBottom: "1px solid hsl(220 10% 14%)", background: scelto === v.voto ? "hsl(220 10% 14%)" : undefined }}>
                    <td style={{ padding: "7px 8px" }}><GradeBadge grade={v.voto} size="sm" /></td>
                    <td style={{ padding: "7px 8px", color: MUTED }}>{v.quota}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.n.toLocaleString("it-IT")}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: MUTED }}>{v.punteggio_min.toLocaleString("it-IT")}–{v.punteggio_max.toLocaleString("it-IT")}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "hsl(51 70% 58%)", fontWeight: 600 }}>{euro(v.guadagno_mediano)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.gare_mediane}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.vittorie_mediane}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.vittorie_pct.toLocaleString("it-IT")}%</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{v.stagioni_mediane}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{record(v.record_mediano)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sel && (
            <div style={{ fontSize: "13px", color: "hsl(210 10% 82%)", lineHeight: 1.7, background: "hsl(220 12% 8%)", borderRadius: "10px", padding: "12px 14px" }}>
              <GradeBadge grade={sel.voto} size="sm" /> {sel.n.toLocaleString("it-IT")} cavalli, {sel.quota} della classifica.
              {sel.esempio && <> Un esempio tipico: <Link href={`/horse/${encodeURIComponent(sel.esempio.nome)}/${sel.esempio.anno}`}><a style={{ color: "hsl(183 60% 55%)" }}>{sel.esempio.nome} ({sel.esempio.anno})</a></Link>.</>}
              {sel.migliore && sel.migliore.nome !== sel.esempio?.nome && <> Il migliore della lettera: <Link href={`/horse/${encodeURIComponent(sel.migliore.nome)}/${sel.migliore.anno}`}><a style={{ color: "hsl(183 60% 55%)" }}>{sel.migliore.nome} ({sel.migliore.anno})</a></Link>.</>}
              {" "}<Link href={`/leaderboard?grade=${sel.voto}`}><a style={{ color: "hsl(183 60% 55%)" }}>Vedi tutti</a></Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
