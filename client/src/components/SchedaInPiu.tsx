/**
 * Il di piu' nelle schede di guidatore, allenatore e stallone (25/11/2026):
 * quanto rende rispetto a quello che XGBoost si aspettava dai cavalli
 * (scripts/sopra_previsto.py), come va per distanza e gli ultimi 3 mesi
 * contro l'anno prima. Dati da /api/persona/extra.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const MUTED = "hsl(210 8% 55%)";
const VERDE = "hsl(150 55% 55%)", ROSSO = "hsl(5 65% 62%)", GIALLO = "hsl(45 80% 60%)";
const pc = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1).replace(".", ",")}%` : "—");
const eu = (x: number) => `€ ${Math.round(x).toLocaleString("it-IT")}`;

const CSS = `
.sip { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 14px; margin-top: 16px; }
.sip > * { min-width: 0; }
.sip-box { padding: 14px 16px; }
.sip-tit { font-size: 12px; font-weight: 700; color: hsl(210 8% 52%); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
.sip-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.sip-tab th { text-align: right; font-size: 10.5px; color: hsl(210 8% 45%); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid hsl(220 10% 18%); }
.sip-tab th:first-child, .sip-tab td:first-child { text-align: left; }
.sip-tab td { text-align: right; padding: 6px; border-bottom: 1px solid hsl(220 10% 15%); color: hsl(210 10% 85%); }
.sip-scorre { overflow-x: auto; }
`;

export default function SchedaInPiu({ tipo, nome }: { tipo: "guidatore" | "allenatore" | "stallone"; nome: string }) {
  const { data: d } = useQuery<any>({
    queryKey: ["/api/persona/extra", tipo, nome],
    queryFn: () => apiRequest("GET", `/api/persona/extra?tipo=${tipo}&nome=${encodeURIComponent(nome)}`).then(r => r.json()),
    enabled: !!nome, staleTime: 3600_000,
  });
  if (!d || d.message) return null;
  const pv = d.previsto, v = pv?.voce;
  const u = d.ultimi3, a = d.anno_prima;
  const chi = tipo === "guidatore" ? "con lui alla guida" : tipo === "allenatore" ? "con lui come allenatore" : "i suoi figli";
  const q3 = u?.partenze ? u.primi_tre / u.partenze : null, qa = a?.partenze ? a.primi_tre / a.partenze : null;
  const tend = q3 != null && qa != null && u.partenze >= 15 ? q3 - qa : null;
  return (
    <div className="sip" data-testid={`scheda-in-piu-${tipo}`}>
      <style>{CSS}</style>
      <div className="pannello sip-box">
        <div className="sip-tit">Rispetto al previsto</div>
        {v ? <>
          <div style={{ fontSize: 22, fontWeight: 800, color: v.z >= 2 ? VERDE : v.z <= -2 ? ROSSO : v.z >= 1 ? GIALLO : "hsl(210 10% 88%)" }} className="tabular">
            {v.scarto_100 >= 0 ? "+" : "−"}{Math.abs(v.scarto_100).toFixed(1).replace(".", ",")} <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>piazzati ogni 100 partenze</span>
          </div>
          <div style={{ fontSize: 12.5, color: "hsl(210 10% 78%)", marginTop: 6, lineHeight: 1.55 }}>
            Dal {new Date(pv.periodo.da).toLocaleDateString("it-IT")}, {chi}, i cavalli sono arrivati nei primi tre {v.veri.toLocaleString("it-IT")} volte
            su {v.partenze.toLocaleString("it-IT")} partenze; il modello XGBoost, guardando solo i cavalli e la corsa, se ne aspettava {Math.round(v.attesi).toLocaleString("it-IT")}.
            {" "}{v.z >= 2 ? "È chiaramente sopra: difficile che sia fortuna." : v.z <= -2 ? "È chiaramente sotto." : Math.abs(v.z) >= 1 ? "Lo scarto c'è ma è ancora vicino a quello che darebbe il caso." : "In linea con il previsto."}
            {" "}{v.posizione}° su {pv.in_classifica} in <Link href={`/rende?vista=previsto`} style={{ color: "hsl(160 60% 55%)" }}>Sopra il previsto</Link>.
          </div>
        </> : (
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
            Non è nella classifica <Link href={`/rende?vista=previsto`} style={{ color: "hsl(160 60% 55%)" }}>Sopra il previsto</Link>:
            servono almeno {pv?.minimo ?? 150} partenze dal 2025 per un confronto che non sia fortuna.
          </div>
        )}
      </div>

      <div className="pannello sip-box">
        <div className="sip-tit">Ultimi 3 mesi</div>
        {u?.partenze ? <>
          <div style={{ fontSize: 13, color: "hsl(210 10% 85%)", lineHeight: 1.7 }}>
            {u.partenze} partenze, {u.cavalli} cavalli · vinte {pc(u.vittorie, u.partenze)} · nei primi tre <b>{pc(u.primi_tre, u.partenze)}</b> · {eu(u.premi)}
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
            Nei 12 mesi prima: nei primi tre {pc(a?.primi_tre ?? 0, a?.partenze ?? 0)} su {(a?.partenze ?? 0).toLocaleString("it-IT")} partenze
            {tend != null && <> · <span style={{ color: tend > 0.03 ? VERDE : tend < -0.03 ? ROSSO : MUTED }}>
              {tend > 0.03 ? "▲ in crescita" : tend < -0.03 ? "▼ in calo" : "■ stabile"}</span></>}
          </div>
        </> : <div style={{ fontSize: 12.5, color: MUTED }}>Nessuna corsa in Italia negli ultimi 3 mesi.</div>}
      </div>

      {d.distanze?.length > 0 && (
        <div className="pannello sip-box sip-scorre">
          <div className="sip-tit">Per distanza, dal 2016</div>
          <table className="sip-tab">
            <thead><tr><th>Distanza</th><th>Partenze</th><th>Vinte</th><th>Primi tre</th><th>Premi</th></tr></thead>
            <tbody>
              {d.distanze.map((x: any) => (
                <tr key={x.fascia}><td>{x.fascia}</td><td>{x.partenze.toLocaleString("it-IT")}</td><td>{pc(x.vittorie, x.partenze)}</td>
                  <td>{pc(x.primi_tre, x.partenze)}</td><td>{eu(x.premi)}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Solo corse in Italia{tipo === "stallone" ? ", di tutti i figli" : ""}.</div>
        </div>
      )}
    </div>
  );
}
