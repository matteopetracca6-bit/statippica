/**
 * Scheda di un allenatore: numeri principali, Gran Premi vinti, andamento
 * negli anni, cavalli in scuderia, guidatori con cui lavora, piste e ultime
 * corse. Tutto dal 2016, da quando la fonte ufficiale riporta l'allenatore.
 */

import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, MapPin, Users, Timer } from "lucide-react";
import GradeBadge from "../components/GradeBadge";
import { Spiegazione } from "../components/Spiegazione";
import { Caricamento } from "../components/Caricamento";
import GraficoColonne from "../components/GraficoColonne";
import BandieraCavallo from "@/components/BandieraCavallo";
import { LinkPista, LinkGuidatore } from "@/components/Collegamenti";
import { CoppaGara } from "@/components/CoppaGara";
import { VITTORIE_GP, nomeGara } from "@/data/granPremi";
import { tempoKm } from "@/lib/record";
import { COLORE_ALLENATORI, BarraEffetto, euro } from "./AllenatoriPage";

const MUTED = "hsl(210 8% 55%)";
const DIM = "hsl(210 8% 40%)";
const CARD = { padding: "16px 20px" };
const TITOLO: React.CSSProperties = {
  fontSize: "10.5px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em",
  marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px",
};
const PANNELLO = { ...CARD, ["--colore-pannello" as any]: COLORE_ALLENATORI };

function data(d: string) {
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Cavallo({ nome, anno }: { nome: string; anno: number | null }) {
  return anno ? (
    <Link href={`/horse/${encodeURIComponent(nome)}/${anno}`} className="collegamento-scheda">
      <BandieraCavallo nome={nome} /> {nome}
    </Link>
  ) : <>{nome}</>;
}

function Numero({ etichetta, valore, nota, colore = "hsl(210 10% 88%)" }: {
  etichetta: string; valore: React.ReactNode; nota?: React.ReactNode; colore?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{etichetta}</div>
      <div className="tabular" style={{ fontSize: "23px", fontWeight: 800, color: colore, lineHeight: 1.1 }}>{valore}</div>
      {nota && <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "4px" }}>{nota}</div>}
    </div>
  );
}

export default function AllenatorePage() {
  const [, params] = useRoute("/allenatore/:name");
  const chiave = params?.name ? decodeURIComponent(params.name) : "";

  const { data: d, isLoading, error } = useQuery<any>({
    queryKey: ["/api/allenatore", chiave],
    queryFn: () => apiRequest("GET", `/api/allenatore/${encodeURIComponent(chiave)}`).then(r => r.json()),
    enabled: !!chiave,
  });

  if (isLoading) return <Caricamento testo="Carico la scheda..." />;
  if (error || !d || d.error) {
    return (
      <div style={{ maxWidth: "700px", margin: "40px auto", padding: "0 20px", color: MUTED }}>
        <Link href="/allenatori"><a style={{ color: COLORE_ALLENATORI, fontSize: "13px" }}>&larr; Tutti gli allenatori</a></Link>
        <p style={{ marginTop: "14px", lineHeight: 1.7 }}>
          {chiave ? <><strong>{chiave}</strong> non ha una scheda: ha meno di venti corse dal 2016 nell'archivio.</> : "Allenatore non trovato."}
        </p>
      </div>
    );
  }

  // Gran Premi vinti: le vittorie dell'allenatore confrontate con l'albo d'oro.
  const vinte = new Set((d.vittorie ?? []).map((v: any) => `${v.data}|${v.cavallo}`));
  const granPremi = VITTORIE_GP
    .filter(v => v.data && vinte.has(`${v.data}|${v.vincitore}`))
    .sort((a, b) => b.anno - a.anno);

  const giudicabile = d.effetto != null && d.affidabilita >= 0.2;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px 18px 60px" }}>
      <Link href="/allenatori">
        <a style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: MUTED, fontSize: "12.5px", textDecoration: "none", marginBottom: "16px" }}>
          <ArrowLeft size={14} /> Tutti gli allenatori
        </a>
      </Link>

      <h1 style={{ fontSize: "26px", fontWeight: 800, color: "hsl(210 10% 91%)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Timer size={24} color={COLORE_ALLENATORI} /> {d.nome}
      </h1>
      <div style={{ color: MUTED, fontSize: "12.5px", marginBottom: "18px" }}>
        {d.n_corse.toLocaleString("it-IT")} corse &middot; {d.n_cavalli.toLocaleString("it-IT")} cavalli diversi
        {d.prima_corsa && <> &middot; dal {d.prima_corsa.slice(0, 4)}</>}
        {d.attivo
          ? <> &middot; <span style={{ color: "hsl(100 55% 55%)" }}>in attività, {d.n_cavalli_recenti} cavalli negli ultimi 18 mesi</span></>
          : <> &middot; <span style={{ color: DIM }}>ultima corsa {d.ultima_corsa ? data(d.ultima_corsa) : "—"}</span></>}
      </div>

      <div className="pannello" style={{ ...PANNELLO, marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px" }}>
          <Numero etichetta="Vittorie" valore={d.n_vittorie.toLocaleString("it-IT")} colore="hsl(100 55% 60%)"
            nota={`${d.pct_vittorie.toFixed(1).replace(".", ",")}% delle corse`} />
          <Numero etichetta="Nei primi tre" valore={`${d.pct_primi_tre.toFixed(1).replace(".", ",")}%`}
            nota={`${d.n_primi_tre.toLocaleString("it-IT")} volte`} />
          <Numero etichetta="Premi vinti" valore={euro(d.premi_totali)} colore="hsl(45 85% 62%)"
            nota={`${euro(d.premi_per_corsa)} a corsa`} />
          <Numero etichetta="Ultimi 12 mesi" valore={d.premi_12_mesi > 0 ? euro(d.premi_12_mesi) : "—"}
            nota={`${d.vittorie_12_mesi} vittorie`} />
          <div>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>A parità di cavallo</div>
            <BarraEffetto e={giudicabile ? d.effetto : null} />
            <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "6px" }}>
              {giudicabile
                ? <>affidabilità {d.affidabilita_txt}, su {d.n_confronti.toLocaleString("it-IT")} corse</>
                : <>troppi pochi cavalli passati anche da altri allenatori</>}
            </div>
          </div>
        </div>
      </div>

      <Spiegazione titolo="Come leggere questi numeri" compatta>
        Vittorie e premi dicono soprattutto quali cavalli ha in scuderia questo allenatore.
        «A parità di cavallo» guarda invece quanto i suoi cavalli arrivano meglio o peggio
        del loro solito, solo per i cavalli passati anche da altri allenatori. Verso
        sinistra vuol dire meglio. Tutti i numeri partono dal 2016, da quando la fonte
        ufficiale riporta l'allenatore.
      </Spiegazione>

      {granPremi.length > 0 && (
        <div className="pannello" style={{ ...CARD, marginTop: "16px", ["--colore-pannello" as any]: "hsl(45 90% 58%)" }}>
          <div style={TITOLO}>Gran Premi vinti · {granPremi.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
            {granPremi.map(v => (
              <a key={`${v.gara}-${v.anno}-${v.divisione ?? ""}`} href={`#/gran-premi?gara=${v.gara}`}
                 className="palmares-voce" style={{ textDecoration: "none" }}>
                <span className="coppa-gp piccola"><CoppaGara gara={v.gara} size={24} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, color: "hsl(210 10% 92%)", fontSize: "12.5px" }}>
                    {nomeGara(v.gara)} {v.anno}{v.divisione ? ` · ${v.divisione}` : ""}
                  </span>
                  <span style={{ display: "block", fontSize: "11.5px", color: MUTED }}>{v.vincitore}{v.driver ? ` · ${v.driver}` : ""}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {d.anni?.length > 1 && (
        <div className="pannello" style={{ ...PANNELLO, marginTop: "16px" }}>
          <div style={TITOLO}>Vittorie anno per anno</div>
          <GraficoColonne
            altezza={130}
            formatoGuida={v => `${v.toFixed(0)}`}
            dati={d.anni.map((a: any) => ({
              chiave: a.anno, etichetta: `'${String(a.anno).slice(2)}`, valore: a.vittorie || 0,
              testo: String(a.vittorie ?? 0),
              scheda: [{ testo: String(a.anno) }, { testo: `${a.vittorie} vittorie su ${a.n_corse} corse` },
                { testo: `${(a.pct_primi_tre ?? 0).toFixed(1).replace(".", ",")}% nei primi tre` },
                { testo: `${a.n_cavalli} cavalli, ${euro(a.premi || 0)} di premi` }],
            }))}
          />
        </div>
      )}

      {d.cavalli?.length > 0 && (
        <div className="pannello" style={{ ...PANNELLO, marginTop: "16px", overflowX: "auto" }}>
          <div style={TITOLO}>Cavalli allenati · prima quelli degli ultimi 18 mesi</div>
          <table className="tabella-allenatore" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr>{["Cavallo", "Periodo", "Corse", "Vittorie", "Premi"].map((h, i) => (
                <th key={h} className={i === 1 ? "solo-largo" : ""} style={{ textAlign: i === 0 ? "left" : "right", padding: "6px 8px", color: DIM, fontSize: "10.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {d.cavalli.slice(0, 30).map((c: any) => (
                <tr key={c.nome} style={{ borderTop: "1px solid hsl(220 10% 14%)" }}>
                  <td style={{ padding: "6px 8px", color: "hsl(210 10% 85%)" }}>
                    <Cavallo nome={c.nome} anno={c.anno} />
                    {c.grade && <span style={{ marginLeft: "6px" }}><GradeBadge grade={c.grade} size="sm" /></span>}
                  </td>
                  <td className="tabular solo-largo" style={{ padding: "6px 8px", textAlign: "right", color: DIM, whiteSpace: "nowrap" }}>
                    {c.dal.slice(0, 4) === c.al.slice(0, 4) ? c.dal.slice(0, 4) : `${c.dal.slice(0, 4)}–${c.al.slice(0, 4)}`}
                  </td>
                  <td className="tabular" style={{ padding: "6px 8px", textAlign: "right", color: MUTED }}>{c.n_corse}</td>
                  <td className="tabular" style={{ padding: "6px 8px", textAlign: "right", color: "hsl(100 50% 60%)" }}>{c.vittorie}</td>
                  <td className="tabular" style={{ padding: "6px 8px", textAlign: "right", color: "hsl(45 80% 62%)", whiteSpace: "nowrap" }}>{euro(c.premi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px", marginTop: "16px" }}>
        {d.guidatori?.length > 0 && (
          <div className="pannello" style={PANNELLO}>
            <div style={TITOLO}><Users size={12} /> Guidatori con cui lavora</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {d.guidatori.map((g: any) => (
                  <tr key={g.driver}>
                    <td style={{ padding: "5px 0", color: "hsl(210 10% 82%)" }}><LinkGuidatore nome={g.driver} /></td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: MUTED }}>{g.n_corse} corse</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: "hsl(100 50% 60%)", width: "70px" }}>{g.vittorie} v.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.piste?.length > 0 && (
          <div className="pannello" style={PANNELLO}>
            <div style={TITOLO}><MapPin size={12} /> Dove corrono i suoi cavalli</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {d.piste.map((p: any) => (
                  <tr key={p.track}>
                    <td style={{ padding: "5px 0" }}><LinkPista codice={p.track} /></td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: MUTED }}>{p.n_corse} corse</td>
                    <td className="tabular" style={{ padding: "5px 0", textAlign: "right", color: "hsl(100 50% 60%)", width: "70px" }}>{p.pct_vittorie.toFixed(1).replace(".", ",")}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {d.ultime?.length > 0 && (
        <div className="pannello" style={{ ...PANNELLO, marginTop: "16px", overflowX: "auto" }}>
          <div style={TITOLO}>Ultime corse</div>
          <table className="tabella-allenatore" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr>{["Data", "Cavallo", "Arrivo", "Guidatore", "Tempo", "Pista"].map((h, i) => (
                <th key={h} className={i === 3 || i === 4 ? "solo-largo" : ""} style={{ textAlign: i === 2 || i === 4 ? "right" : "left", padding: "6px 8px", color: DIM, fontSize: "10.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {d.ultime.map((r: any, i: number) => (
                <tr key={i} style={{ borderTop: "1px solid hsl(220 10% 14%)" }}>
                  <td className="tabular" style={{ padding: "6px 8px", color: MUTED, whiteSpace: "nowrap" }}>{data(r.race_date)}</td>
                  <td style={{ padding: "6px 8px", color: "hsl(210 10% 85%)" }}><Cavallo nome={r.horse_name} anno={r.anno} /></td>
                  <td className="tabular" style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: r.placement === 1 ? "hsl(100 55% 60%)" : r.placement && r.placement <= 3 ? "hsl(45 80% 62%)" : MUTED }}>
                    {r.placement ? `${r.placement}°` : "—"}
                  </td>
                  <td className="solo-largo" style={{ padding: "6px 8px", color: MUTED }}><LinkGuidatore nome={r.driver} /></td>
                  <td className="tabular solo-largo" style={{ padding: "6px 8px", textAlign: "right", color: MUTED }}>{r.time_km ? tempoKm(r.time_km) : "—"}</td>
                  <td style={{ padding: "6px 8px" }}><LinkPista codice={r.track} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
