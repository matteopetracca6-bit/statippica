/**
 * QUANTO PESA OGNI COSTO.
 *
 * Sul cavallo "qualunque" (tutti i nati 2014-19, anche chi non ha mai corso)
 * si sposta ogni voce del 20%, una alla volta, e si guarda di quanto cambia
 * l'utile medio. Il conto e' lineare, quindi l'effetto e' esatto. Accanto:
 * dove vanno i soldi, e di quanto dovrebbe cambiare ogni voce da sola per
 * arrivare in pari.
 */
import Sagoma from "./Sagoma";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ESITO_COLORE, coloreSegno } from "@/lib/esiti";

const MUTED = "hsl(210 8% 50%)";
const euro = (n: number) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
const COLORI_VOCE: Record<string, string> = {
  mensile: "hsl(200 70% 55%)", allevamento: "hsl(270 45% 62%)", monta: "hsl(30 80% 60%)", prezzo: "hsl(30 80% 60%)",
};

interface Voce { chiave: string; nome: string; ricavo: boolean; valore: number; quota_del_costo: number | null; effetto: number; per_il_pareggio: number }
interface Dati { mensile: number; cavalli: number; anni_medi_di_allenamento: number; utile_medio: number; premi_medi: number; costo_medio: number; passo: number; voci: Voce[] }

export default function PesoCosti({ mensile, monta, prezzo }: { mensile: number; monta?: number | null; prezzo?: number | null }) {
  const qs = prezzo != null ? `prezzo=${prezzo}` : monta != null ? `monta=${monta}` : null;
  const { data: d, isFetching } = useQuery<Dati>({
    queryKey: ["/api/pareggio/sensibilita", mensile, qs],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/sensibilita?mensile=${mensile}&${qs}`)).json(),
    enabled: !!qs,
    placeholderData: (prev: any) => prev,
  });

  if (!qs) {
    return <p style={{ fontSize: "12.5px", color: ESITO_COLORE.pareggio, margin: 0 }}>Scrivi il prezzo della monta in «Le tue ipotesi» per vedere quanto pesa ogni costo.</p>;
  }
  if (!d || (d as any).message) return <Sagoma riquadri={3} righe={5} />;

  const costi = d.voci.filter(v => !v.ricavo).sort((a, b) => b.valore - a.valore);
  const max = Math.max(...d.voci.map(v => v.effetto), 1);
  const primo = costi[0];
  const ultimo = costi[costi.length - 1];
  const pct = Math.round(d.passo * 100);

  return (
    <div style={{ opacity: isFetching ? 0.6 : 1, transition: "opacity .2s" }}>
      {/* Il punto di partenza */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", fontSize: "12.5px", color: MUTED, marginBottom: "16px" }}>
        <span>Premi medi: <b style={{ color: "hsl(210 10% 90%)" }}>{euro(d.premi_medi)}</b></span>
        <span>Costo medio: <b style={{ color: "hsl(210 10% 90%)" }}>{euro(d.costo_medio)}</b></span>
        <span>Utile medio: <b style={{ color: coloreSegno(d.utile_medio) }}>{euro(d.utile_medio)}</b></span>
        <span>su {d.cavalli.toLocaleString("it-IT")} cavalli, con in media {d.anni_medi_di_allenamento.toLocaleString("it-IT")} anni di allenamento</span>
      </div>

      {/* Dove vanno i soldi */}
      <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", marginBottom: "8px" }}>Dove vanno i soldi</div>
      <div style={{ display: "flex", height: "26px", borderRadius: "7px", overflow: "hidden", marginBottom: "8px" }} role="img"
           aria-label={costi.map(v => `${v.nome} ${v.quota_del_costo}%`).join(", ")}>
        {costi.map(v => (
          <div key={v.chiave} title={`${v.nome}: ${euro(v.valore)}`}
               style={{ width: `${v.quota_del_costo}%`, background: COLORI_VOCE[v.chiave], display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 700, color: "hsl(220 20% 10%)", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
            {(v.quota_del_costo ?? 0) >= 8 ? `${Math.round(v.quota_del_costo ?? 0)}%` : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "11.5px", color: MUTED, marginBottom: "22px" }}>
        {costi.map(v => (
          <span key={v.chiave} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: COLORI_VOCE[v.chiave] }} />
            {v.nome}: {euro(v.valore)} ({(v.quota_del_costo ?? 0).toLocaleString("it-IT")}%)
          </span>
        ))}
      </div>

      {/* Se una voce cambia del 20% */}
      <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", marginBottom: "4px" }}>Se una voce cambia del {pct}%</div>
      <p style={{ fontSize: "12px", color: MUTED, margin: "0 0 12px", lineHeight: 1.55 }}>
        Di quanto si sposta l'utile medio di un cavallo se una sola voce migliora (verde) o peggiora (rosso) del {pct}%, tutto il resto fermo.
        Le barre più lunghe sono le leve che contano.
      </p>
      <div style={{ display: "grid", gap: "8px", marginBottom: "18px" }}>
        {d.voci.map(v => {
          const w = (50 * v.effetto) / max;
          return (
            <div key={v.chiave} className="riga-peso">
              <div style={{ fontSize: "12.5px", color: "hsl(210 10% 85%)" }}>{v.nome}</div>
              <div style={{ position: "relative", height: "22px", background: "hsl(220 12% 8%)", borderRadius: "5px" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "1px", background: "hsl(220 10% 26%)" }} />
                <div style={{ position: "absolute", right: "50%", top: "3px", bottom: "3px", width: `${w}%`, background: ESITO_COLORE.perdita, borderRadius: "4px 0 0 4px", opacity: 0.85 }} />
                <div style={{ position: "absolute", left: "50%", top: "3px", bottom: "3px", width: `${w}%`, background: ESITO_COLORE.profitto, borderRadius: "0 4px 4px 0", opacity: 0.85 }} />
              </div>
              <div className="tabular" style={{ fontSize: "12px", color: MUTED, whiteSpace: "nowrap" }}>± {euro(v.effetto)}</div>
            </div>
          );
        })}
      </div>

      {/* Per arrivare in pari */}
      <div style={{ fontSize: "13px", fontWeight: 700, color: "hsl(210 10% 88%)", marginBottom: "4px" }}>Per arrivare in pari, da sola</div>
      <p style={{ fontSize: "12px", color: MUTED, margin: "0 0 10px", lineHeight: 1.55 }}>
        Di quanto dovrebbe cambiare ogni voce, da sola, perché il cavallo medio non perda più soldi.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: "8px", marginBottom: "14px" }}>
        {d.voci.map(v => {
          const impossibile = !v.ricavo && v.per_il_pareggio > 100;
          return (
            <div key={v.chiave} style={{ background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 15%)", borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ fontSize: "12px", color: MUTED }}>{v.nome}</div>
              <div className="tabular" style={{ fontSize: "18px", fontWeight: 800, margin: "3px 0 1px",
                                                 color: d.utile_medio >= 0 ? ESITO_COLORE.profitto : impossibile ? ESITO_COLORE.perdita : ESITO_COLORE.pareggio }}>
                {d.utile_medio >= 0 ? "già in pari" : impossibile ? "non basta" : `${v.ricavo ? "+" : "−"}${v.per_il_pareggio.toLocaleString("it-IT")}%`}
              </div>
              <div style={{ fontSize: "11.5px", color: MUTED, lineHeight: 1.5 }}>
                {d.utile_medio >= 0 ? "" : impossibile ? "neanche azzerandola si arriva in pari"
                  : v.ricavo ? `i premi dovrebbero passare da ${euro(v.valore)} a ${euro(v.valore * (1 + v.per_il_pareggio / 100))}`
                  : `dovrebbe scendere da ${euro(v.valore)} a ${euro(v.valore * (1 - v.per_il_pareggio / 100))}`}
              </div>
            </div>
          );
        })}
      </div>

      {primo && ultimo && primo !== ultimo && (
        <div style={{ fontSize: "12.5px", color: "hsl(210 10% 82%)", lineHeight: 1.6, background: "hsl(183 60% 45% / 0.07)",
                      border: "1px solid hsl(183 60% 45% / 0.25)", borderRadius: "10px", padding: "10px 14px" }}>
          In breve: la voce che pesa di più è <b>{primo.nome.toLowerCase()}</b>, il {Math.round(primo.quota_del_costo ?? 0)}% del costo.
          Risparmiare il {pct}% lì vale {euro(primo.effetto)} a cavallo, {ultimo.effetto > 0 ? `${Math.round(primo.effetto / ultimo.effetto)} volte` : "molto più di"} lo
          stesso risparmio su {ultimo.nome.toLowerCase()}.
        </div>
      )}
      <div style={{ fontSize: "11px", color: MUTED, marginTop: "8px", lineHeight: 1.5 }}>
        Media storica sui nati 2014-2019, compresi i cavalli che non hanno mai corso (contano solo il costo fino ai 2 anni e un anno di allenamento).
      </div>
    </div>
  );
}
