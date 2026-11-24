/**
 * UN INCROCIO CONVIENE? (prima stava nel Punto di pareggio, ora in "Prima di
 * correre"). Pesa ogni esito possibile del puledro con quanto e' successo ai
 * figli dello stallone (e della fattrice). Conti sul server: /api/pareggio/incrocio.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import NameSelect from "./NameSelect";
import Sagoma from "./Sagoma";
import GraficoColonne, { COLORI_GRAFICO } from "./GraficoColonne";
import GradeBadge from "./GradeBadge";
import { Spiegazione } from "./Spiegazione";
import { ESITO_COLORE } from "@/lib/esiti";
import { useScuderia } from "@/lib/scuderia";
import { Periodo, Risposta } from "./Periodo";
import { Cifra } from "./DueColonne";
import { COLORE_VOTO, SPENTO } from "@/lib/coloriEconomia";

const MUTO = "hsl(210 8% 55%)";
const ETICHETTA: Record<string, string> = { profitto: "Conviene", pareggio: "In pari", perdita: "Non conviene" };
const euro = (n: number) => (n < 0 ? "−" : "") + "€ " + Math.abs(Math.round(n)).toLocaleString("it-IT");

/** Il voto con la probabilita' piu' alta, fra chi corre. */
function votoTipico(pr: { voto: string; p: number }[]) {
  return [...pr].filter(x => x.voto !== "Non corre").sort((a, b) => b.p - a.p)[0]?.voto ?? "N/A";
}

export default function IncrocioConviene({ padreIniziale = "", madreIniziale = "" }: { padreIniziale?: string; madreIniziale?: string }) {
  const { scuderia } = useScuderia();
  const mensile = scuderia.mensile || 1200;
  const [padre, setPadre] = useState(padreIniziale);
  const [madre, setMadre] = useState(madreIniziale);
  const [monta, setMonta] = useState<string>(scuderia.monta != null ? String(scuderia.monta) : "");
  const { data: inc, isFetching } = useQuery<any>({
    queryKey: ["/api/pareggio/incrocio", padre, madre, mensile, monta],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/incrocio?padre=${encodeURIComponent(padre)}&madre=${encodeURIComponent(madre)}&mensile=${mensile}&monta=${monta}`)).json(),
    enabled: !!padre,
  });
  const campo: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 20%)", borderRadius: 8, color: "hsl(210 10% 90%)",
    padding: "7px 10px", fontSize: 13, width: 130, fontVariantNumeric: "tabular-nums", fontFamily: "inherit" };
  const colore = inc?.esito ? ESITO_COLORE[inc.esito] : undefined;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="ed-pannello" style={{ display: "grid", gap: 8 }}>
        <NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Stallone (scrivi almeno 2 lettere)" onChange={n => setPadre(n)} />
        <NameSelect value={madre} endpoint="/api/search/mare" placeholder="Fattrice (facoltativa)" onChange={n => setMadre(n)} />
        <label style={{ fontSize: 12.5, color: MUTO, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Prezzo della monta, se diverso dal catalogo:
          <input type="number" min={0} step={500} value={monta} placeholder="dal catalogo" style={campo} onChange={e => setMonta(e.target.value)} />
        </label>
      </div>

      {!padre && <div className="ed-pannello ed-vuoto">Scegli lo stallone (e se vuoi la fattrice) per sapere se l'incrocio conviene.</div>}
      {padre && isFetching && !inc && <Sagoma riquadri={3} grafico={110} />}
      {inc && (
        <>
          <Risposta colore={colore} etichetta="Questo incrocio"
            valore={inc.utile_atteso != null ? euro(inc.utile_atteso) : euro(inc.guadagno_atteso)}
            verdetto={inc.utile_atteso != null ? (ETICHETTA[inc.esito] ?? "") : "Vinto in media da un figlio"}
            periodo="tutta la carriera del puledro"
            testo={inc.utile_atteso != null
              ? <>Utile atteso su un costo di {euro(inc.costo_atteso)}: si ripaga in {inc.prob_profitto.toLocaleString("it-IT")} casi su 100.</>
              : <>Manca il prezzo della monta: scrivilo qui sopra per avere l'utile.</>}
            sotto={<><b>{inc.padre}</b>{inc.madre ? <> × <b>{inc.madre}</b></> : null} · {inc.monta != null ? <>monta {euro(inc.monta)}{inc.monta_da_catalogo ? " (catalogo)" : " (indicata da te)"}</> : "monta non in catalogo"}
              {" · "}figli osservati {inc.figli_osservati.padre} del padre{inc.madre ? `, ${inc.figli_osservati.madre} della madre` : ""} · affidabilità {Math.round(inc.affidabilita * 100)}%</>} />
          <div className="ed-cifre">
            <Cifra titolo="Monta massima" valore={inc.monta_massima_di_pareggio > 0 ? euro(inc.monta_massima_di_pareggio) : "nessuna"}
              sotto={inc.monta_massima_di_pareggio > 0 ? "il prezzo della monta che porta l'utile atteso a zero" : "non va in pari neanche con la monta gratis"} />
            <Cifra titolo="Vinto in media da un figlio" valore={euro(inc.guadagno_atteso)} sotto="in carriera; non dipende dalla monta" />
            {inc.potenziale && <Cifra titolo="Voto più probabile" valore={<GradeBadge grade={votoTipico(inc.probabilita)} size="lg" />}
              sotto="il voto con più probabilità, esclusi i casi in cui non corre" />}
          </div>
          <div className="ed-pannello">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <b style={{ fontSize: 14, color: "var(--ed-testo)" }}>Che voto può prendere il puledro</b><Periodo testo="tutta la carriera" />
            </div>
            <GraficoColonne altezza={140} colore={COLORI_GRAFICO.buono}
              nomeAsse="probabilità del voto del puledro · grigio: non arriva a correre"
              dati={inc.probabilita.map((p: any) => ({
                chiave: p.voto, etichetta: p.voto === "Non corre" ? "no" : p.voto, valore: p.p, testo: `${Math.round(p.p)}%`,
                colore: p.voto === "Non corre" ? SPENTO : COLORE_VOTO[p.voto],
                scheda: [{ testo: p.voto === "Non corre" ? "Non corre" : `Voto ${p.voto}` }, { testo: `${p.p.toLocaleString("it-IT")}% dei puledri` }],
              }))} />
            <p style={{ fontSize: 11.5, color: "var(--ed-muto)", margin: "10px 0 0", lineHeight: 1.55 }}>
              {inc.fonte_probabilita === "modello"
                ? <>Le probabilità vengono dal modello del potenziale alla nascita (alberi di boosting, la famiglia di XGBoost): legge come vanno i figli maturi
                  del padre, della madre e del padre della madre, l'età e la carriera della madre, e dà una posizione attesa fra i nati del suo anno
                  ({Math.round(inc.potenziale.p50)} su 100, fra {Math.round(inc.potenziale.p10)} e {Math.round(inc.potenziale.p90)} 8 volte su 10).
                  La curva è morbida: un figlio in più o in meno non la fa saltare. Stadio «nascita» {inc.potenziale.etichetta?.esito ?? "in verifica"}.</>
                : <>Il modello non c'è per questo incrocio: le probabilità vengono dai soli figli osservati, appoggiati alla media di tutti i cavalli.</>}
            </p>
          </div>
        </>
      )}
      <Spiegazione compatta>
        Pesa ogni esito possibile del puledro, dal voto SSS al «non corre mai», con la probabilità di ciascuno e quanto hanno vinto e speso davvero
        i cavalli finiti in quel voto (nati 2014-2019). Per scegliere fra molti stalloni c'è l'Advisor.
      </Spiegazione>
    </div>
  );
}
