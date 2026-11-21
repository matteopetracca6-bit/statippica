/**
 * Km su gara corta e su gara lunga (21/11/2026).
 *
 * Dati da /api/horse (campo distanza) e /api/stallion (distanza_figli),
 * calcolati di notte in scripts/record_distanza.py. Corta = fino a 1700 m
 * (il miglio), lunga = da 2000 m. Il km corretto e' riportato a una pista
 * media; il tipo di partenza (autostart o nastri) l'archivio non lo dice.
 */
import { tempoKm, formatRecord } from "@/lib/record";
import { nomePista } from "@/lib/piste";
import { Spiegazione } from "./Spiegazione";

export interface ParteDistanza {
  km?: number; data?: string; pista?: string; distanza?: number; piazzamento?: number | null; gare?: number;
  corretto?: number | null; corretto_data?: string | null; corretto_pista?: string | null;
  km_testo?: string; fonte: "gare" | "vendopuledri";
}
export interface Distanza {
  corto: ParteDistanza | null; lungo: ParteDistanza | null; differenza: number | null;
  profilo: "corto" | "lungo" | "entrambi" | null;
  soglie: { q1: number | null; mediana: number | null; q3: number | null; cavalli: number | null } | null;
}
export interface DatiDistanzaFigli {
  figli: number; corto: number; lungo: number; entrambi: number; differenza_media: number; profilo: "corto" | "lungo" | "entrambi" | null;
  soglie: Distanza["soglie"];
}

const MUTO = "hsl(210 8% 55%)";
const TESTO = "hsl(210 10% 90%)";
const COLORI = { corto: "hsl(28 85% 62%)", lungo: "hsl(205 75% 64%)", entrambi: "hsl(150 45% 58%)" };
export const NOME_PROFILO = { corto: "più adatto al corto", lungo: "più adatto al lungo", entrambi: "va su tutte e due" } as const;

const virgola = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toFixed(d).replace(".", ","));
const dataIt = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || "");
const pista = (p?: string | null) => (!p ? "" : p === "ESTERO" ? "all'estero" : nomePista(p));

/** Valore breve per la testata della scheda. */
export function kmTesto(p: ParteDistanza | null | undefined): string {
  if (!p) return "—";
  return p.fonte === "gare" ? tempoKm(p.km) : formatRecord(p.km_testo);
}
export function kmSotto(p: ParteDistanza | null | undefined, quale: "corto" | "lungo"): string {
  const dist = quale === "corto" ? "fino a 1700 m" : "da 2000 m";
  if (!p) return dist;
  if (p.fonte !== "gare") return `${dist} · dalla fonte`;
  return `${dist} · ${p.gare} ${p.gare === 1 ? "gara" : "gare"}`;
}

export function EtichettaProfilo({ profilo }: { profilo: Distanza["profilo"] }) {
  if (!profilo) return null;
  const c = COLORI[profilo];
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, color: c,
                   border: `1px solid ${c}`, background: "hsl(220 12% 10%)", whiteSpace: "nowrap" }}>
      {NOME_PROFILO[profilo]}
    </span>
  );
}

function Riga({ titolo, p }: { titolo: string; p: ParteDistanza | null }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 18%)", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTO, textTransform: "uppercase", letterSpacing: ".05em" }}>{titolo}</div>
      {!p ? <div style={{ fontSize: 13, color: MUTO, marginTop: 6 }}>Nessuna gara su questa distanza.</div>
        : p.fonte !== "gare" ? (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: TESTO }} className="tabular">{formatRecord(p.km_testo)}</span>
            <div style={{ fontSize: 12, color: MUTO, marginTop: 2 }}>record della fonte (vendopuledri): non ci sono sue gare su questa distanza nell'archivio</div>
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: TESTO }} className="tabular">{tempoKm(p.km)}</span>
            <div style={{ fontSize: 12, color: MUTO, marginTop: 2, lineHeight: 1.45 }}>
              {dataIt(p.data)} {pista(p.pista)}, {p.distanza} m{p.piazzamento ? `, arrivato ${p.piazzamento}°` : ""} · su {p.gare} {p.gare === 1 ? "gara" : "gare"}
            </div>
            <div style={{ fontSize: 12, color: "hsl(210 8% 72%)", marginTop: 6 }}>
              Corretto per la pista: <strong className="tabular" style={{ color: TESTO }}>{p.corretto != null ? tempoKm(p.corretto) : "—"}</strong>
              {p.corretto != null && p.corretto_pista ? <span style={{ color: MUTO }}> ({dataIt(p.corretto_data)} {pista(p.corretto_pista)})</span>
                : <span style={{ color: MUTO }}> solo gare all'estero</span>}
            </div>
          </div>
        )}
    </div>
  );
}

/** Pannello della scheda del cavallo. */
export function DistanzaCavallo({ d }: { d: Distanza | null | undefined }) {
  if (!d) return null;
  const s = d.soglie;
  return (
    <div className="sotto-sezione" data-testid="distanza-cavallo">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: TESTO }}>Gara corta e gara lunga</div>
        <EtichettaProfilo profilo={d.profilo} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 8 }}>
        <Riga titolo="Km su gara corta (fino a 1700 m)" p={d.corto} />
        <Riga titolo="Km su gara lunga (da 2000 m)" p={d.lungo} />
      </div>
      {d.differenza != null && (
        <div style={{ fontSize: 12.5, color: "hsl(210 8% 72%)", marginTop: 8, lineHeight: 1.5 }}>
          Sul lungo va più piano di <strong>{virgola(d.differenza)}</strong> secondi al km (tempi corretti per la pista).
          {s?.mediana != null && <> Per un cavallo tipico la differenza è di {virgola(s.mediana)} secondi: metà dei cavalli sta fra {virgola(s.q1)} e {virgola(s.q3)}.</>}
        </div>
      )}
      <Spiegazione titolo="Come si leggono" compatta>
        Il km è il miglior tempo al chilometro nelle gare in archivio su quella distanza. L'ippodromo conta quanto
        la distanza: sul miglio i vincitori vanno in media a 1.13.9 a Napoli e a 1.15.6 a Montecatini. Il tempo
        «corretto per la pista» è riportato a una pista media, misurando ogni pista a parità di cavallo (gli stessi
        cavalli su piste diverse), così due cavalli si confrontano anche se hanno corso altrove. Le gare all'estero
        non si correggono: «estero» mette insieme paesi diversi. Il profilo (corto, lungo, tutte e due) si dà solo
        con almeno 3 gare italiane per distanza: «più adatto al lungo» vuol dire che la differenza fra lungo e corto
        è fra il quarto più piccolo di tutti i cavalli, «al corto» fra il quarto più grande. L'archivio non dice se la
        partenza era con l'autostart o con i nastri, che di solito rallentano: i numeri non lo correggono.
      </Spiegazione>
    </div>
  );
}

/** Riquadro della pagina dello stallone. */
export function DistanzaFigli({ d }: { d: DatiDistanzaFigli | null | undefined }) {
  if (!d) return null;
  const pct = (n: number) => Math.round(n / d.figli * 100);
  return (
    <div className="pannello" style={{ padding: "14px 16px" }} data-testid="distanza-figli">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: TESTO }}>I figli: corto o lungo?</div>
        {d.profilo && <EtichettaProfilo profilo={d.profilo} />}
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 8 }} aria-hidden>
        <div style={{ width: `${pct(d.corto)}%`, background: COLORI.corto }} />
        <div style={{ width: `${pct(d.entrambi)}%`, background: COLORI.entrambi }} />
        <div style={{ width: `${pct(d.lungo)}%`, background: COLORI.lungo }} />
      </div>
      <div style={{ display: "flex", gap: "4px 16px", flexWrap: "wrap", fontSize: 12.5, color: "hsl(210 8% 72%)" }}>
        <span><strong style={{ color: COLORI.corto }}>{d.corto}</strong> più adatti al corto ({pct(d.corto)}%)</span>
        <span><strong style={{ color: COLORI.entrambi }}>{d.entrambi}</strong> su tutte e due</span>
        <span><strong style={{ color: COLORI.lungo }}>{d.lungo}</strong> più adatti al lungo ({pct(d.lungo)}%)</span>
      </div>
      <div style={{ fontSize: 12, color: MUTO, marginTop: 8, lineHeight: 1.5 }}>
        Su {d.figli} figli con almeno 3 gare italiane sul corto e 3 sul lungo. Per caso se ne aspetta circa un quarto da
        ciascuna parte. In media vanno più piano sul lungo di {virgola(d.differenza_media)} secondi al km
        {d.soglie?.mediana != null ? <> (un cavallo tipico: {virgola(d.soglie.mediana)})</> : null}.
        {!d.profilo && " Sono ancora pochi per dire da che parte pende lo stallone."}
      </div>
    </div>
  );
}
