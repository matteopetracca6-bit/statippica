/**
 * Qualita' dei dati (23/11/2026), nella pagina Metodo: quanto e' completo
 * l'archivio campo per campo e dove sono i buchi. Dati da /api/qualita-dati.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Caricamento } from "./Caricamento";

const DIM = "hsl(210 8% 48%)", TESTO = "hsl(210 10% 84%)";
const n = (x?: number | null) => (x == null ? "—" : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
const p1 = (x?: number | null) => (x == null ? "—" : `${x.toFixed(1).replace(".", ",")}%`);
const colore = (x: number | null | undefined) => (x == null ? DIM : x >= 95 ? "hsl(100 55% 55%)" : x >= 80 ? "hsl(51 80% 58%)" : "hsl(15 75% 62%)");

function Barra({ l, v, nota }: { l: string; v: number | null | undefined; nota?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
        <span style={{ color: TESTO, minWidth: 0 }}>{l}</span>
        <strong className="tabular" style={{ color: colore(v), whiteSpace: "nowrap" }}>{p1(v)}</strong>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "hsl(220 10% 18%)", marginTop: 4, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%`, height: "100%", background: colore(v) }} />
      </div>
      {nota && <div style={{ fontSize: 11, color: DIM, marginTop: 3, lineHeight: 1.45 }}>{nota}</div>}
    </div>
  );
}

export default function QualitaDati() {
  const { data: d, isLoading } = useQuery<any>({
    queryKey: ["/api/qualita-dati"],
    queryFn: async () => (await apiRequest("GET", "/api/qualita-dati")).json(),
    staleTime: 30 * 60_000,
  });
  if (isLoading) return <Caricamento testo="Conto cosa c'è nell'archivio..." />;
  if (!d?.gare) return <p>Non riesco a leggere la qualità dei dati adesso.</p>;
  const g = d.gare, c = d.cavalli, v = d.voti, k = d.carriere;
  const max = Math.max(...g.per_anno.map((r: any) => r.corse), 1);
  const buchi: string[] = [];
  const parziali = g.per_anno.filter((r: any) => g.media_corse_anno_piena && r.corse < g.media_corse_anno_piena * 0.75 && r.anno < 2016);
  if (parziali.length) buchi.push(`Stagioni ${parziali.map((r: any) => r.anno).join(", ")} a metà: le corse dei cavalli nati prima del 2012 non ci sono, perché i risultati ufficiali giornata per giornata partono dal 2016.`);
  if ((g.pct_allenatore ?? 100) < 99) buchi.push(`Allenatore e proprietario mancano prima del 2016 (in tutto ci sono nel ${p1(g.pct_allenatore)} delle partenze).`);
  if (g.senza_data > 0) buchi.push(`${n(g.senza_data)} partenze di ${n(g.senza_data_cavalli)} cavalli senza data: contano nei totali di carriera ma non nelle statistiche per stagione, pista o guidatore. Il lavoro notturno le ricostruisce poco alla volta.`);
  if (c.senza_anno > 0) buchi.push(`${n(c.senza_anno)} cavalli senza anno di nascita: quasi tutti antenati lontani, entrati nell'archivio solo come padre o madre di qualcuno.`);
  if (d.quote) buchi.push(`Le quote finali del totalizzatore ci sono solo dal ${new Date(d.quote.dal + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}: i confronti con il pubblico partono da lì.`);
  buchi.push(`I cavalli nati prima del 2012 hanno solo i totali di carriera, non le singole gare: per questo stanno in una classifica storica a parte. Gli stalloni esteri che hanno corso poco in Italia hanno la carriera completa presa da fonti estere quando c'è (${n(k.complete_dall_estero)}).`);
  return (
    <div>
      <p>
        Quanto è completo l'archivio, campo per campo, e dove sono i buchi che conosciamo. I numeri si ricontano a ogni
        pubblicazione dell'archivio. Verde vuol dire almeno il 95%, giallo almeno l'80%.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: "14px 22px", margin: "14px 0 18px" }}>
        <Barra l="Gare con l'arrivo" v={g.pct_arrivo} nota="Le altre sono rotture, ritiri o squalifiche: per loro l'arrivo non esiste." />
        <Barra l="Gare con il tempo al km" v={g.pct_km} nota="Il tempo c'è per chi arriva al traguardo." />
        <Barra l="Gare con l'allenatore" v={g.pct_allenatore} />
        <Barra l="Cavalli con il padre" v={c.pct_padre} />
        <Barra l="Cavalli con la madre" v={c.pct_madre} />
        <Barra l="Cavalli con il sesso" v={c.pct_sesso} />
        <Barra l="Atleti con i quattro nonni" v={c.pct_nonni_atleti} nota="Nell'archivio corse; la pagina Pedigree completa i rami con altre fonti." />
        <Barra l="Stalloni con padre e madre" v={c.pct_stalloni_con_genitori} nota={`Stalloni con almeno 5 figli: ${n(c.stalloni_5_figli)}.`} />
        {d.quote && <Barra l="Corse con le quote finali" v={d.quote.pct} nota={`Dal ${d.quote.dal}: ${n(d.quote.corse_con_quote)} corse.`} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { l: "Partenze in Italia", v: n(g.partenze), s: `${n(g.corse)} corse` },
          { l: "Partenze all'estero", v: n(g.estero), s: "dalle schede dei cavalli" },
          { l: "Cavalli", v: n(c.totale), s: `${n(c.atleti)} atleti, ${n(c.storici)} storici` },
          { l: "Atleti con voto", v: n(v.atleti), s: c.atleti_senza_voto === 0 ? "tutti quelli che hanno corso" : `${n(c.atleti_senza_voto)} senza voto` },
          { l: "Storici con voto", v: n(v.storici), s: `${n(v.carriere_parziali)} con carriera parziale` },
          { l: "Voti da pedigree", v: n(v.pedigree), s: "cavalli senza corse" },
        ].map(x => (
          <div key={x.l}>
            <div style={{ fontSize: 10, color: DIM, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{x.l}</div>
            <div className="tabular" style={{ fontSize: 16, fontWeight: 800, color: "hsl(210 10% 90%)" }}>{x.v}</div>
            <div style={{ fontSize: 11.5, color: DIM }}>{x.s}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: TESTO, marginBottom: 6 }}>Corse per stagione</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, marginBottom: 4 }}>
        {g.per_anno.map((r: any) => (
          <div key={r.anno} title={`${r.anno}: ${n(r.corse)} corse, ${n(r.partenze)} partenze`}
            style={{ flex: 1, minWidth: 0, height: `${Math.max(3, 100 * r.corse / max)}%`, borderRadius: "3px 3px 0 0",
                     background: r.anno < 2016 ? "hsl(40 40% 45%)" : "hsl(40 40% 68%)" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, fontSize: 9.5, color: DIM, marginBottom: 16 }}>
        {g.per_anno.map((r: any) => <div key={r.anno} className="tabular" style={{ flex: 1, minWidth: 0, textAlign: "center", overflow: "hidden" }}>{String(r.anno).slice(2)}</div>)}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: TESTO, marginBottom: 6 }}>Buchi noti</div>
      <ul>{buchi.map((b, i) => <li key={i}>{b}</li>)}</ul>
      <p style={{ fontSize: 12, color: DIM }}>
        Ospiti esteri (campioni con poche corse in Italia e la carriera completa altrove): {n(k.ospiti_esteri)}.
        Omonimi riconosciuti e tenuti separati: {n(k.omonimi)}.
      </p>
    </div>
  );
}
