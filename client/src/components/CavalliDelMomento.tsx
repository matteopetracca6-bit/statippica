/**
 * "Cavalli del momento" della home: chi va forte nell'ultimo mese.
 *
 * Due liste lette dalle corse degli ultimi 30 giorni in archivio:
 * chi ha vinto e si e' piazzato di piu', e chi ha appena migliorato il suo
 * record personale al chilometro. Un interruttore mostra solo i giovani di
 * 2 e 3 anni, quelli in crescita.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Flame, Timer } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";

const MUTED = "hsl(210 8% 50%)";
const CARD: React.CSSProperties = {
  background: "hsl(220 12% 10%)", border: "1px solid hsl(220 10% 16%)", borderRadius: "14px", padding: "22px 24px",
};
const tempo = (t: number) => `1'${t.toFixed(1).replace(".", "\"")}`;
const data = (d: string) => d ? d.split("-").reverse().slice(0, 2).join("/") : "";

interface Momento {
  dal: string; al: string; cavalli_in_corsa: number;
  in_forma: { nome: string; anno: number | null; voto: string | null; corse: number; vittorie: number; piazzati: number; premi: number; ultima_corsa: string }[];
  record: { nome: string; anno: number | null; voto: string | null; tempo: number; tempo_prima: number; miglioramento: number }[];
}

function Riga({ i, nome, anno, voto, children }: { i: number; nome: string; anno: number | null; voto: string | null; children: React.ReactNode }) {
  const contenuto = (
    <>
      <span className="tabular" style={{ fontSize: "12px", color: i < 3 ? "hsl(25 90% 60%)" : "hsl(210 8% 35%)", fontWeight: 700, minWidth: "20px" }}>{i + 1}</span>
      <span style={{ width: "34px", flexShrink: 0 }}>{voto ? <GradeBadge grade={voto} size="sm" /> : null}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 600, color: "hsl(210 10% 85%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {nome}{anno ? <span style={{ color: MUTED, fontWeight: 400 }}> ({anno})</span> : null}
      </span>
      <span className="momento-dati" style={{ display: "flex", alignItems: "center", gap: "10px" }}>{children}</span>
    </>
  );
  const stile: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", textDecoration: "none" };
  return anno ? (
    <Link href={`/horse/${encodeURIComponent(nome)}/${anno}`}>
      <a className="riga-momento" style={stile} onMouseEnter={e => (e.currentTarget.style.background = "hsl(220 10% 14%)")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>{contenuto}</a>
    </Link>
  ) : <div className="riga-momento" style={stile}>{contenuto}</div>;
}

export default function CavalliDelMomento() {
  const [giovani, setGiovani] = useState(false);
  const { data: d, isLoading } = useQuery<Momento>({
    queryKey: ["/api/momento", giovani],
    queryFn: async () => (await apiRequest("GET", `/api/momento${giovani ? "?giovani=1" : ""}`)).json(),
    staleTime: 10 * 60 * 1000,
  });
  const bottone = (attivo: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: "999px", cursor: "pointer", fontSize: "12px", fontWeight: 700,
    border: "1px solid " + (attivo ? "hsl(25 90% 58%)" : "hsl(220 10% 20%)"),
    background: attivo ? "hsl(25 90% 58% / 0.14)" : "transparent", color: attivo ? "hsl(25 90% 65%)" : MUTED,
  });
  const titolo = (Icona: any, t: string, colore: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
      <Icona size={16} style={{ color: colore }} />
      <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t}</span>
    </div>
  );
  const vuoto = <div style={{ fontSize: "12.5px", color: MUTED, padding: "10px 12px" }}>Nessun cavallo in questo periodo.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>Cavalli del momento</span>
        {d && <span style={{ fontSize: "12px", color: MUTED }}>corse dal {data(d.dal)} al {data(d.al)}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button style={bottone(!giovani)} onClick={() => setGiovani(false)}>Tutti</button>
          <button style={bottone(giovani)} onClick={() => setGiovani(true)}>Giovani (2-3 anni)</button>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(460px, 100%), 1fr))", gap: "16px" }}>
        <div style={CARD}>
          {titolo(Flame, "In forma", "hsl(25 90% 58%)")}
          <div style={{ fontSize: "12px", color: MUTED, marginBottom: "10px" }}>Più vittorie e piazzamenti nei primi tre nell'ultimo mese, con almeno 2 corse.</div>
          {isLoading || !d ? <div className="skeleton" style={{ height: "300px", borderRadius: "8px" }} /> :
            d.in_forma.length === 0 ? vuoto : d.in_forma.map((h, i) => (
              <Riga key={h.nome} i={i} nome={h.nome} anno={h.anno} voto={h.voto}>
                <span className="tabular" style={{ fontSize: "12px", color: "hsl(210 10% 80%)", whiteSpace: "nowrap" }}>
                  <b style={{ color: "hsl(25 90% 62%)" }}>{h.vittorie}</b> vinte · {h.piazzati} nei primi 3 · {h.corse} corse
                </span>
              </Riga>
            ))}
        </div>
        <div style={CARD}>
          {titolo(Timer, "Nuovo record personale", "hsl(183 60% 55%)")}
          <div style={{ fontSize: "12px", color: MUTED, marginBottom: "10px" }}>Chi nell'ultimo mese ha corso più veloce che mai, con almeno 5 corse cronometrate prima.</div>
          {isLoading || !d ? <div className="skeleton" style={{ height: "300px", borderRadius: "8px" }} /> :
            d.record.length === 0 ? vuoto : d.record.map((h, i) => (
              <Riga key={h.nome} i={i} nome={h.nome} anno={h.anno} voto={h.voto}>
                <span className="tabular" style={{ fontSize: "12px", color: MUTED, whiteSpace: "nowrap" }}>prima {tempo(h.tempo_prima)}</span>
                <span className="tabular" style={{ fontSize: "13px", fontWeight: 700, color: "hsl(183 60% 58%)", whiteSpace: "nowrap" }}>{tempo(h.tempo)}</span>
                <span className="tabular" style={{ fontSize: "11.5px", color: "hsl(145 60% 52%)", minWidth: "38px", textAlign: "right" }}>−{h.miglioramento.toLocaleString("it-IT")}"</span>
              </Riga>
            ))}
        </div>
      </div>
    </div>
  );
}
