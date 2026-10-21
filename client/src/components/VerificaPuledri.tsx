/**
 * client/src/components/VerificaPuledri.tsx — StatIppica
 *
 * La prova della previsione dei puledri versione 3: tutti i nati, compresi
 * quelli che non arrivano alle corse. Tutti i numeri arrivano da
 * puledri_verifica.json (scripts/puledri_model.py), nessuno e' scritto a mano.
 */

import { Spiegazione } from "./Spiegazione";

const MUTED = "hsl(210 8% 45%)";
const DIM = "hsl(210 8% 35%)";
const TEXT = "hsl(210 10% 78%)";
const BORDER = "1px solid hsl(220 10% 14%)";
const PANEL = "hsl(220 12% 8%)";
const CYAN = "hsl(183 80% 55%)";
const VERDE = "hsl(100 55% 55%)";
const ROSSO = "hsl(0 60% 60%)";
const AMBRA = "hsl(35 95% 62%)";

const num = (v: number | null | undefined, d = 3) =>
  v == null ? "—" : v.toFixed(d).replace(".", ",");
const su100 = (v: number) => `${Math.round(v * 100)} su 100`;

export interface VerificaPuledriDati {
  stato: string;
  sperimentale: boolean;
  riserva?: string | null;
  annata_di_conferma?: number;
  definizione_buono: string;
  n_impara: number;
  n_prova: number;
  anni_prova: { impara_fino_a: number; verifica: [number, number] };
  anni_scelta: { impara_fino_a: number; misura: [number, number] };
  copertura_prova: { anno: number; in_archivio: number; nati_ufficiali: number | null; quota: number | null }[];
  scelta_informazioni: { informazione: string; auc?: number; guadagno?: number; tenuta: boolean; esclusa_perche?: string }[];
  corre: Risultato;
  buono: Risultato & { auc_consiglio_di_oggi?: number | null };
  regole: Record<string, { testo: string; superata: boolean }>;
  come_leggere_auc?: string;
}
interface Risultato {
  auc_modello: number; auc_solo_padre: number;
  quota_reale: number; quota_prevista: number;
  contro_solo_padre: { vantaggio: number; intervallo95: [number, number]; significativo: boolean };
  fasce?: { quinto: number; n: number; previsto: number; reale: number }[];
  per_anno: { anno: number; n: number; quota_reale: number; quota_prevista: number; auc_modello: number; auc_solo_padre: number }[];
}

const th: React.CSSProperties = {
  fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em",
  fontWeight: 700, textAlign: "right", padding: "0 0 8px", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  fontSize: "12.5px", textAlign: "right", padding: "7px 0", borderTop: BORDER,
  whiteSpace: "nowrap", color: TEXT,
};

export default function VerificaPuledri({ v }: { v: VerificaPuledriDati }) {
  const b = v.buono;
  const regole = Object.entries(v.regole);
  const maxFascia = Math.max(...(b.fasce ?? []).map(f => Math.max(f.previsto, f.reale)), 0.01);
  return (
    <div>
      {/* Stato, sempre in vista */}
      <div style={{
        background: "hsl(35 90% 10%)", border: "1px solid hsl(35 90% 45% / 0.55)",
        borderRadius: "12px", padding: "14px 18px", marginBottom: "16px",
        fontSize: "12.5px", lineHeight: 1.65, color: "hsl(35 35% 88%)",
      }}>
        <strong style={{ color: AMBRA }}>
          Stato: {v.stato}. La previsione resta sperimentale.
        </strong>
        {v.riserva && <div style={{ marginTop: "4px" }}>{v.riserva}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        {[
          { k: "Puledri della prova", v: v.n_prova.toLocaleString("it-IT"),
            n: `nati dal ${v.anni_prova.verifica[0]} al ${v.anni_prova.verifica[1]}, mai visti, compresi quelli che non corrono` },
          { k: "Ordine giusto", v: num(b.auc_modello),
            n: `solo il padre ${num(b.auc_solo_padre)} · consiglio precedente ${num(b.auc_consiglio_di_oggi ?? null)}` },
          { k: "Buoni nel quinto piu' consigliato", v: b.fasce?.length ? su100(b.fasce[b.fasce.length - 1].reale) : "—",
            n: "contro 25 su 100 di un puledro qualsiasi" },
          { k: "Buoni nel quinto meno consigliato", v: b.fasce?.length ? su100(b.fasce[0].reale) : "—",
            n: "i puledri con i genitori meno promettenti" },
        ].map(x => (
          <div key={x.k} style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "10px", color: DIM, textTransform: "uppercase", letterSpacing: "0.05em" }}>{x.k}</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: CYAN, margin: "3px 0" }}>{x.v}</div>
            <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.4 }}>{x.n}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "16px" }}>
        <Spiegazione titolo="Come si legge" compatta>
          {v.definizione_buono} L&apos;ordine giusto: {v.come_leggere_auc}
        </Spiegazione>
      </div>

      {/* Le tre regole */}
      <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: TEXT, marginBottom: "8px" }}>
          Le tre regole, fissate prima della prova
        </div>
        {regole.map(([k, r]) => (
          <div key={k} style={{ display: "flex", gap: "10px", alignItems: "baseline", fontSize: "12.5px", padding: "4px 0" }}>
            <span style={{ fontWeight: 800, color: r.superata ? VERDE : ROSSO, minWidth: "92px" }}>
              {r.superata ? "superata" : "non superata"}
            </span>
            <span style={{ color: TEXT }}>{k}. {r.testo}</span>
          </div>
        ))}
        <div style={{ fontSize: "11.5px", color: MUTED, marginTop: "6px", lineHeight: 1.5 }}>
          Vantaggio su &quot;solo il padre&quot;: {num(b.contro_solo_padre.vantaggio)}, e nel 95% dei
          ricampionamenti resta fra {num(b.contro_solo_padre.intervallo95[0])} e{" "}
          {num(b.contro_solo_padre.intervallo95[1])}. E&apos; piccolo ma non e&apos; fortuna.
        </div>
      </div>

      {/* Fasce: previsto contro reale */}
      {b.fasce && (
        <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: TEXT, marginBottom: "4px" }}>
            Le fasce sono vere?
          </div>
          <div style={{ fontSize: "11.5px", color: MUTED, marginBottom: "10px" }}>
            I puledri della prova divisi in cinque gruppi, dal meno al piu&apos; consigliato:
            quanti buoni cavalli diceva la previsione e quanti ce ne sono stati.
          </div>
          {b.fasce.map(f => (
            <div key={f.quinto} style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px", gap: "10px", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "11.5px", color: MUTED }}>{f.quinto}° quinto</span>
              <div>
                <div style={{ height: "7px", borderRadius: "4px", background: "hsl(183 60% 40% / 0.6)", width: `${(f.previsto / maxFascia) * 100}%` }} />
                <div style={{ height: "7px", borderRadius: "4px", background: VERDE, width: `${(f.reale / maxFascia) * 100}%`, marginTop: "3px" }} />
              </div>
              <span className="tabular" style={{ fontSize: "11.5px", color: TEXT, textAlign: "right" }}>
                {Math.round(f.previsto * 100)} previsti · {Math.round(f.reale * 100)} veri
              </span>
            </div>
          ))}
          <div style={{ fontSize: "10.5px", color: DIM, marginTop: "4px" }}>
            Barra azzurra: previsti su 100. Barra verde: veri su 100.
          </div>
        </div>
      )}

      {/* Anno per anno */}
      <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px", marginBottom: "16px", overflowX: "auto" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: TEXT, marginBottom: "8px" }}>Anno per anno</div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "460px" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Nati nel</th>
              <th style={th}>Puledri</th>
              <th style={th}>In archivio sui nati</th>
              <th style={th}>Ordine giusto</th>
              <th style={th}>Solo il padre</th>
            </tr>
          </thead>
          <tbody>
            {b.per_anno.map(a => {
              const cop = v.copertura_prova.find(c => c.anno === a.anno);
              return (
                <tr key={a.anno}>
                  <td style={{ ...td, textAlign: "left" }}>{a.anno}</td>
                  <td style={td} className="tabular">{a.n.toLocaleString("it-IT")}</td>
                  <td style={td} className="tabular">{cop?.quota != null ? `${Math.round(cop.quota * 100)}%` : "non noto"}</td>
                  <td style={{ ...td, color: a.auc_modello > a.auc_solo_padre ? VERDE : ROSSO, fontWeight: 700 }} className="tabular">{num(a.auc_modello)}</td>
                  <td style={td} className="tabular">{num(a.auc_solo_padre)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Informazioni provate */}
      <div style={{ background: PANEL, border: BORDER, borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, color: TEXT, marginBottom: "4px" }}>
          Le informazioni provate, una alla volta
        </div>
        <div style={{ fontSize: "11.5px", color: MUTED, marginBottom: "10px", lineHeight: 1.5 }}>
          Scelte imparando sui nati fino al {v.anni_scelta.impara_fino_a} e misurando sui nati{" "}
          {v.anni_scelta.misura[0]}-{v.anni_scelta.misura[1]}: la prova finale non ha deciso nulla.
          Resta solo cio&apos; che migliora l&apos;ordine di almeno 0,003.
        </div>
        {v.scelta_informazioni.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", alignItems: "baseline", fontSize: "12px", padding: "4px 0", borderTop: i ? BORDER : "none" }}>
            <span style={{ fontWeight: 800, color: s.tenuta ? VERDE : MUTED, minWidth: "64px" }}>
              {s.tenuta ? "usata" : "scartata"}
            </span>
            <span style={{ color: TEXT, flex: 1 }}>
              {s.informazione}
              {s.esclusa_perche && <span style={{ color: MUTED }}> — {s.esclusa_perche}</span>}
            </span>
            <span className="tabular" style={{ color: MUTED, whiteSpace: "nowrap" }}>
              {s.guadagno != null ? `${s.guadagno >= 0 ? "+" : ""}${num(s.guadagno, 4)}` : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Arriva alle corse: limite dichiarato */}
      <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.6 }}>
        <strong style={{ color: TEXT }}>Arriva alle corse.</strong> Ordine giusto {num(v.corre.auc_modello)}{" "}
        (solo il padre {num(v.corre.auc_solo_padre)}). Nella prova la previsione diceva{" "}
        {su100(v.corre.quota_prevista)} e sono arrivati alle corse in {su100(v.corre.quota_reale)}: negli
        anni vecchi l&apos;archivio non conta tutti i puledri che non hanno mai corso, e il modello
        imparava un quadro troppo roseo. Sul sito la taratura usa i nati {v.anni_prova.verifica[0]}-{v.anni_prova.verifica[1]},
        che l&apos;archivio conta quasi tutti.
      </div>
    </div>
  );
}
