/**
 * LINEA MATERNA (novembre 2026).
 *
 * Pannello per la scheda del cavallo e della fattrice: la madre, la nonna e la
 * bisnonna dal lato materno, ognuna con i suoi figli e i loro numeri. La riga
 * evidenziata e' il cavallo da cui scende la linea. Calcolo in
 * server/lineaMaterna.ts, solo con i dati di StatIppica.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";
import { formatRecord } from "@/lib/record";
import { Spiegazione } from "./Spiegazione";

interface Figlio {
  nome: string; nato: number | null; sesso: string | null; padre: string | null;
  corse: number; vittorie: number; vincite: number; record: string | null; voto: string | null; linea: boolean;
}
interface Madre {
  livello: number; etichetta: string; nome: string; nata: number | null; padre: string | null;
  voto_fattrice: string | null; sue_corse: number | null; sue_vincite: number | null; figli: Figlio[];
  riassunto: { figli: number; corsi: number; vincite: number; vittorie: number; di_vertice: number; migliore: string | null };
}

const VERDE = "hsl(120 55% 52%)";
const ROSA = "hsl(330 60% 70%)";
const euro = (v: number | null | undefined) => (v ? `€ ${Math.round(v).toLocaleString("it-IT")}` : "€ 0");
const SESSO: Record<string, string> = { M: "maschio", F: "femmina", C: "castrone" };

function Cifra({ titolo, valore, colore, sotto }: { titolo: string; valore: string; colore?: string; sotto?: string }) {
  return (
    <div style={{ padding: "9px 11px", borderRadius: 9, background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{titolo}</div>
      <div className="tabular" style={{ fontSize: 17, fontWeight: 800, color: colore ?? "hsl(210 10% 90%)", marginTop: 2 }}>{valore}</div>
      {sotto && <div style={{ fontSize: 11, color: "hsl(210 8% 50%)", marginTop: 1 }}>{sotto}</div>}
    </div>
  );
}

export default function LineaMaterna({ nome, titolo = "Linea materna" }: { nome: string; titolo?: string }) {
  const [scelta, setScelta] = useState(0);
  const { data, isLoading } = useQuery<{ cavallo: string; madri: Madre[] }>({
    queryKey: ["/api/linea-materna", nome],
    queryFn: async () => (await apiRequest("GET", `/api/linea-materna/${encodeURIComponent(nome)}`)).json(),
    staleTime: 10 * 60 * 1000,
  });
  if (isLoading || !data || data.madri.length === 0) return null;
  const m = data.madri[Math.min(scelta, data.madri.length - 1)];
  const r = m.riassunto;

  return (
    <div id="sez-linea-materna" className="pannello" style={{ padding: "var(--pad-pannello, 20px 22px)", marginBottom: "var(--spazio-pannello, 22px)" }} data-testid="linea-materna">
      <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 8% 50%)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{titolo}</div>
      <div style={{ fontSize: 13, color: "hsl(210 8% 65%)", marginBottom: 12, lineHeight: 1.5 }}>
        La famiglia dal lato della madre: madre, nonna e bisnonna, con tutti i figli che conosciamo. Se una famiglia dà
        spesso cavalli che vincono, è un buon segno anche per i nuovi nati.
      </div>

      {/* Le tre madri: si tocca per cambiare */}
      <div role="tablist" style={{ display: "grid", gridTemplateColumns: `repeat(${data.madri.length}, minmax(0, 1fr))`, gap: 6, marginBottom: 14 }}>
        {data.madri.map((x, i) => {
          const att = x === m;
          return (
            <button key={x.nome} role="tab" aria-selected={att} onClick={() => setScelta(i)} data-testid={`linea-madre-${i}`}
              style={{ textAlign: "left", padding: "8px 10px", borderRadius: 9, cursor: "pointer", minWidth: 0, fontFamily: "inherit",
                border: `1px solid ${att ? ROSA : "hsl(220 10% 18%)"}`, background: att ? "hsl(330 30% 13%)" : "hsl(220 12% 9%)" }}>
              <div style={{ fontSize: 10.5, color: att ? ROSA : "hsl(210 8% 50%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{x.etichetta}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "hsl(210 10% 88%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nome}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Link href={`/fattrice/${encodeURIComponent(m.nome)}`} className="collegamento-scheda">
          <span style={{ fontSize: 17, fontWeight: 800, color: ROSA, overflowWrap: "anywhere" }}>{m.nome}</span>
        </Link>
        {m.voto_fattrice && <span title="Voto come fattrice, sui figli"><GradeBadge grade={m.voto_fattrice} size="sm" /></span>}
      </div>
      <div style={{ fontSize: 12.5, color: "hsl(210 8% 55%)", marginTop: 2 }}>
        {[m.nata ? `nata nel ${m.nata}` : null, m.padre ? `figlia di ${m.padre}` : null,
          m.sue_corse ? `in corsa ha vinto ${euro(m.sue_vincite)}` : null].filter(Boolean).join(" · ") || "—"}
        {m.voto_fattrice && " · il voto è quello come fattrice"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, margin: "12px 0" }}>
        <Cifra titolo="Figli conosciuti" valore={String(r.figli)} sotto={`${r.corsi} hanno corso`} />
        <Cifra titolo="Vinto dai figli" valore={euro(r.vincite)} colore={VERDE} sotto={`${r.vittorie} vittorie`} />
        <Cifra titolo="Figli di vertice" valore={String(r.di_vertice)} sotto="con voto S, SS o SSS" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {m.figli.map(f => (
          <div key={`${f.nome}-${f.nato}`} data-linea={f.linea}
            style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 12.5, padding: "7px 10px", borderRadius: 8,
              background: f.linea ? "hsl(330 30% 12%)" : "hsl(220 12% 10%)", border: `1px solid ${f.linea ? "hsl(330 40% 30%)" : "transparent"}` }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {f.nato ? (
                  <Link href={`/horse/${encodeURIComponent(f.nome)}/${f.nato}`} className="collegamento-scheda">
                    <span style={{ fontWeight: 700, color: "hsl(210 10% 90%)" }}>{f.nome}</span>
                  </Link>
                ) : <span style={{ fontWeight: 700, color: "hsl(210 10% 90%)" }}>{f.nome}</span>}
                {f.voto && <GradeBadge grade={f.voto} size="sm" />}
                {f.linea && <span style={{ fontSize: 10.5, fontWeight: 700, color: ROSA }}>{m.livello === 1 ? "questo cavallo" : "da qui scende la linea"}</span>}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "hsl(210 8% 52%)", marginTop: 1 }}>
                {[f.nato, f.sesso ? SESSO[f.sesso] ?? f.sesso : null, f.padre ? `di ${f.padre}` : null].filter(Boolean).join(" · ")}
                {f.corse > 0 ? ` · ${f.vittorie} vitt. su ${f.corse} · record ${formatRecord(f.record)}` : " · non ha corso"}
              </span>
            </span>
            <span className="tabular" style={{ color: f.vincite ? VERDE : "hsl(210 8% 40%)", fontWeight: 700, alignSelf: "center", whiteSpace: "nowrap" }}>{euro(f.vincite)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <Spiegazione titolo="Da dove vengono questi numeri" compatta>
          Madri e figli vengono dall'archivio di StatIppica; dove manca un anello usiamo la genealogia a cinque generazioni
          raccolta da VendoPuledri. Vincite e corse sono quelle di carriera. Le fattrici più vecchie possono avere figli che non
          sono nell'archivio, soprattutto quelli nati prima del 2005 o che non hanno mai corso: per loro i conti sono incompleti.
        </Spiegazione>
      </div>
    </div>
  );
}
