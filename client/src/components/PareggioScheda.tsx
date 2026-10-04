/**
 * Il punto di pareggio dentro le schede.
 *
 * Nella scheda di un cavallo: ha gia' ripagato quello che e' costato? E
 * conviene tenerlo un altro anno? Nella scheda di uno stallone: quanto rende
 * in media un suo figlio dopo i costi, e la monta massima che ha senso pagare.
 * Le ipotesi sono quelle tipiche della scheda Punto di pareggio (1.200 euro al
 * mese, allevamento fino ai 2 anni con monta mediana): li' si possono cambiare.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Scale } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const MUTED = "hsl(210 8% 50%)";
const COLORE: Record<string, string> = { profitto: "hsl(145 60% 50%)", pareggio: "hsl(45 90% 58%)", perdita: "hsl(0 65% 62%)" };
const NOME: Record<string, string> = { profitto: "In utile", pareggio: "In pari", perdita: "In perdita" };
const euro = (n: number) => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");

const pannello: React.CSSProperties = {
  background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "12px",
  padding: "18px 22px", marginBottom: "22px",
};

function Titolo({ testo }: { testo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
      <Scale size={15} style={{ color: "hsl(160 60% 50%)" }} />
      <span style={{ fontSize: "12px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{testo}</span>
      <Link href="/pareggio"><a style={{ marginLeft: "auto", fontSize: "11.5px", color: "hsl(160 60% 55%)", textDecoration: "none" }}>Cambia le ipotesi</a></Link>
    </div>
  );
}

function Blocco({ titolo, esito, valore, nota }: { titolo: string; esito?: string | null; valore: string; nota: React.ReactNode }) {
  const c = esito ? COLORE[esito] : "hsl(210 10% 88%)";
  return (
    <div style={{ background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 15%)", borderRadius: "10px", padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: MUTED }}>{titolo}</span>
        {esito && <span style={{ fontSize: "11px", fontWeight: 700, color: c, border: `1px solid ${c.replace(/\)$/, " / 0.4)")}`, borderRadius: "999px", padding: "1px 8px" }}>{NOME[esito]}</span>}
      </div>
      <div className="tabular" style={{ fontSize: "20px", fontWeight: 800, color: c, margin: "4px 0 2px" }}>{valore}</div>
      <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.55 }}>{nota}</div>
    </div>
  );
}

const griglia: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: "10px" };

export function PareggioCavallo({ nome, anno }: { nome: string; anno: number }) {
  const { data: d } = useQuery<any>({
    queryKey: ["/api/pareggio/cavallo", nome, anno],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/cavallo?nome=${encodeURIComponent(nome)}&anno=${anno}`)).json(),
    staleTime: 30 * 60 * 1000,
  });
  if (!d || d.message) return null;
  if (!d.gare) {
    return (
      <div style={pannello}>
        <Titolo testo="Punto di pareggio" />
        <div style={{ fontSize: "12.5px", color: MUTED, lineHeight: 1.6 }}>
          Non ha ancora corso. Un cavallo costa circa {euro(d.ingresso)} fino ai 2 anni e {euro(d.gestione.costo_annuo)} per
          ogni anno di allenamento: per andare in pari in 5 stagioni dovrebbe vincere circa {euro(d.ingresso + d.gestione.costo_annuo * 6)}.
        </div>
      </div>
    );
  }
  return (
    <div style={pannello}>
      <Titolo testo="Punto di pareggio" />
      <div style={griglia}>
        <Blocco titolo="Bilancio della carriera" esito={d.carriera.esito} valore={euro(d.carriera.bilancio)}
          nota={<>Vinti {euro(d.guadagni_carriera)} contro circa {euro(d.carriera.speso_stimato)} spesi in {d.stagioni} {d.stagioni === 1 ? "stagione" : "stagioni"}.
            {d.carriera.mancano_per_pareggio > 0 && <> Per andare in pari gli mancano {euro(d.carriera.mancano_per_pareggio)}.</>}</>} />
        <Blocco titolo="Tenerlo un altro anno" esito={d.ultimi_12_mesi.gare ? d.gestione.esito : null}
          valore={d.ultimi_12_mesi.gare ? euro(d.gestione.differenza) : "—"}
          nota={d.ultimi_12_mesi.gare
            ? <>Negli ultimi 12 mesi ha vinto {euro(d.gestione.rendimento_annuo)} in {d.ultimi_12_mesi.gare} gare; un anno costa {euro(d.gestione.costo_annuo)}. Le spese passate non contano più.</>
            : <>Nessuna corsa negli ultimi 12 mesi: non c'è un rendimento recente da confrontare con il costo di {euro(d.gestione.costo_annuo)} l'anno.</>} />
        {d.tipico_del_voto && (
          <Blocco titolo={`Il tipico cavallo ${d.tipico_del_voto.voto}`} esito={d.tipico_del_voto.esito} valore={euro(d.tipico_del_voto.utile_mediano)}
            nota={<>Vince {euro(d.tipico_del_voto.guadagno_mediano)} in {d.tipico_del_voto.stagioni_mediane} stagioni; finisce in utile il {d.tipico_del_voto.pct_in_utile.toLocaleString("it-IT")}%.</>} />
        )}
      </div>
      <div style={{ fontSize: "11px", color: "hsl(210 8% 40%)", marginTop: "10px" }}>
        Ipotesi: {euro(d.mensile)} al mese di allenamento e mantenimento, {euro(d.ingresso)} fino ai 2 anni. Non conta rivendita né valore da riproduttore.
      </div>
    </div>
  );
}

export function PareggioStallone({ nome }: { nome: string }) {
  const { data: d } = useQuery<any>({
    queryKey: ["/api/pareggio/incrocio", nome],
    queryFn: async () => (await apiRequest("GET", `/api/pareggio/incrocio?padre=${encodeURIComponent(nome)}`)).json(),
    staleTime: 30 * 60 * 1000,
  });
  if (!d || d.message || !d.figli_osservati?.padre) return null;
  const guadagno = d.utile_atteso + d.costo_atteso;
  return (
    <div style={pannello}>
      <Titolo testo="Conviene questa monta?" />
      <div style={griglia}>
        <Blocco titolo="Vinto in media da un figlio" valore={euro(guadagno)}
          nota={<>Su {d.figli_osservati.padre} figli osservati, contando anche chi non ha mai corso. Affidabilità {Math.round(d.affidabilita * 100)}%.</>} />
        <Blocco titolo="Utile atteso di un figlio" esito={d.esito} valore={euro(d.utile_atteso)}
          nota={<>Dopo monta ({euro(d.monta)}{d.monta_da_catalogo ? "" : ", valore mediano"}), allevamento e allenamento: costo atteso {euro(d.costo_atteso)}. In utile il {d.prob_profitto.toLocaleString("it-IT")}% dei figli.</>} />
        <Blocco titolo="Monta massima che conviene" esito={d.monta_massima_di_pareggio > 0 ? "profitto" : "perdita"}
          valore={d.monta_massima_di_pareggio > 0 ? euro(d.monta_massima_di_pareggio) : "nessuna"}
          nota={d.monta_massima_di_pareggio > 0 ? "Il prezzo di monta che porta il figlio medio in pari." : "Con fattrice qualunque il figlio medio non va in pari neanche con la monta gratis."} />
      </div>
      <div style={{ fontSize: "11px", color: "hsl(210 8% 40%)", marginTop: "10px" }}>
        Ipotesi: {euro(d.mensile)} al mese, fattrice qualunque. Con una fattrice precisa il conto cambia: provalo nella scheda Punto di pareggio.
      </div>
    </div>
  );
}
