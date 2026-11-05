/**
 * LA TUA SCUDERIA: il portafoglio dei cavalli dell'utente, con la cassa dei
 * prossimi 12 mesi simulata, il rischio della scuderia intera e il valore
 * di carriera. I conti sono in server/scuderia.ts; l'elenco sta nel browser.
 */
import { coloreScheda } from "@/lib/sezioni";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Briefcase, Trash2, Plus, KeyRound, Search } from "lucide-react";
import Sagoma from "../components/Sagoma";
import NameSelect from "../components/NameSelect";
import GradeBadge from "../components/GradeBadge";
import { Spiegazione } from "../components/Spiegazione";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { useScuderia } from "@/lib/scuderia";
import BandieraCavallo from "@/components/BandieraCavallo";

const MUTED = "hsl(210 8% 55%)";
const TESTO = "hsl(210 10% 90%)";
const VERDE = "hsl(145 55% 52%)";
const ROSSO = "hsl(0 60% 62%)";
const ORO = "hsl(38 80% 58%)";
const ACCENTO = coloreScheda("/scuderia");
const CARD: React.CSSProperties = { padding: "16px 18px" };
const euro = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−€" : "€") + Math.abs(Math.round(n)).toLocaleString("it-IT"));
const pc = (p: number | null | undefined) => (p == null ? "—" : p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`);
const titolo = (s: string) => (s || "").split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
const colSaldo = (n: number) => (n >= 0 ? VERDE : ROSSO);

function Riquadro({ titolo, valore, nota, colore }: { titolo: string; valore: React.ReactNode; nota?: React.ReactNode; colore?: string }) {
  return (
    <div className="pannello" style={{ ...CARD, padding: "13px 15px" }}>
      <div style={{ fontSize: 11.5, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{titolo}</div>
      <div className="tabular" style={{ fontSize: 23, fontWeight: 800, color: colore ?? TESTO, marginTop: 4, lineHeight: 1.15 }}>{valore}</div>
      {nota && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>{nota}</div>}
    </div>
  );
}
function Titoletto({ children, nota }: { children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div style={{ margin: "24px 0 10px" }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: TESTO, margin: 0 }}>{children}</h2>
      {nota && <Spiegazione compatta>{nota}</Spiegazione>}
    </div>
  );
}

/** Le colonne del saldo dei prossimi 12 mesi: rosso in perdita, verde in utile. */
function Istogramma({ colonne }: { colonne: { da: number; a: number; quota: number }[] }) {
  const max = Math.max(...colonne.map(c => c.quota), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }} role="img" aria-label="Distribuzione del saldo dei prossimi 12 mesi">
        {colonne.map((c, i) => (
          <div key={i} title={`${euro(c.da)} … ${euro(c.a)}: ${c.quota.toLocaleString("it-IT")}% degli anni simulati`}
               style={{ flex: 1, height: `${Math.max(1, (100 * c.quota) / max)}%`, borderRadius: "3px 3px 0 0",
                        background: (c.da + c.a) / 2 >= 0 ? VERDE : ROSSO, opacity: c.quota > 0 ? 0.9 : 0.15 }} />
        ))}
      </div>
      <div className="tabular" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginTop: 4 }}>
        <span>{euro(colonne[0]?.da)}</span><span>saldo dei prossimi 12 mesi</span><span>{euro(colonne[colonne.length - 1]?.a)}</span>
      </div>
    </div>
  );
}

function Aggiungi() {
  const { aggiungi } = useScuderia();
  const [tipo, setTipo] = useState<"cavallo" | "puledro">("cavallo");
  const [cavallo, setCavallo] = useState<{ nome: string; anno: number | null } | null>(null);
  const [padre, setPadre] = useState("");
  const [madre, setMadre] = useState("");
  const [nome, setNome] = useState("");
  const [anno, setAnno] = useState(new Date().getFullYear() - 1);
  const [prezzo, setPrezzo] = useState("");
  const [asta, setAsta] = useState(false);
  const inp: React.CSSProperties = { background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, color: TESTO, padding: "7px 10px", fontSize: 13, fontFamily: "inherit" };
  const etich: React.CSSProperties = { fontSize: 12.5, color: MUTED, display: "flex", flexDirection: "column", gap: 5 };
  const scheda = (attivo: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: "none", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
    background: attivo ? ACCENTO : "hsl(220 10% 14%)", color: attivo ? "hsl(220 13% 7%)" : MUTED,
  });
  const prezzoN = prezzo.trim() !== "" && Number(prezzo) > 0 ? Math.round(Number(prezzo)) : null;
  const ok = tipo === "cavallo" ? !!cavallo : !!padre;
  const conferma = () => {
    if (tipo === "cavallo" && cavallo) aggiungi({ tipo: "cavallo", nome: cavallo.nome.toUpperCase(), anno: cavallo.anno, prezzo: prezzoN });
    if (tipo === "puledro" && padre) aggiungi({ tipo: "puledro", nome: nome.trim() || null, padre: padre.toUpperCase(), madre: madre ? madre.toUpperCase() : null, anno, prezzo: prezzoN, asta });
    setCavallo(null); setPadre(""); setMadre(""); setNome(""); setPrezzo(""); setAsta(false);
  };
  const anni = [0, 1, 2].map(k => new Date().getFullYear() - k);
  return (
    <div className="pannello" style={CARD}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 13.5, color: TESTO, marginRight: 4 }}>Aggiungi</b>
        <button style={scheda(tipo === "cavallo")} onClick={() => setTipo("cavallo")}>un cavallo dell'archivio</button>
        <button style={scheda(tipo === "puledro")} onClick={() => setTipo("puledro")}>un puledro non ancora in archivio</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {tipo === "cavallo" ? (
          <div style={{ ...etich, flex: "1 1 260px", maxWidth: 380 }}>Cavallo
            <NameSelect value={cavallo?.nome ?? ""} endpoint="/api/search/horse" placeholder="Nome del cavallo"
                        onChange={(n, o) => setCavallo(n ? { nome: n, anno: o?.birth_year ?? null } : null)} />
          </div>
        ) : <>
          <div style={{ ...etich, flex: "1 1 220px", maxWidth: 300 }}>Padre<NameSelect value={padre} endpoint="/api/search/stallion" placeholder="Stallone" onChange={n => setPadre(n || "")} /></div>
          <div style={{ ...etich, flex: "1 1 220px", maxWidth: 300 }}>Madre (facoltativa)<NameSelect value={madre} endpoint="/api/search/mare" placeholder="Fattrice" onChange={n => setMadre(n || "")} /></div>
          <label style={etich}>Nome (facoltativo)<input value={nome} onChange={e => setNome(e.target.value)} placeholder="es. Maestrale Mail" style={{ ...inp, width: 170 }} /></label>
          <label style={etich}>Nato nel
            <select value={anno} onChange={e => setAnno(Number(e.target.value))} style={{ ...inp, width: 90 }}>
              {anni.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12.5, color: "hsl(210 10% 82%)", display: "flex", alignItems: "center", gap: 7, paddingBottom: 8 }}>
            <input type="checkbox" checked={asta} onChange={e => setAsta(e.target.checked)} /> comprato all'asta
          </label>
        </>}
        <label style={etich}>Pagato (€, facoltativo)
          <input type="number" min={0} step={1000} inputMode="numeric" value={prezzo} onChange={e => setPrezzo(e.target.value)} style={{ ...inp, width: 130 }} />
        </label>
        <button disabled={!ok} onClick={conferma}
                style={{ ...scheda(ok), display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", opacity: ok ? 1 : 0.5, cursor: ok ? "pointer" : "default" }}>
          <Plus size={14} /> Aggiungi
        </button>
      </div>
    </div>
  );
}

// Il proprietario arriva dalla sua scheda: il router lo mette prima del "#"
// (?proprietario=X#/scuderia), un link scritto a mano dopo (#/scuderia?proprietario=X).
const parametriHash = () => {
  if (typeof window === "undefined") return new URLSearchParams();
  const h = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  return h.get("proprietario") ? h : new URLSearchParams(window.location.search);
};

/** Importa i cavalli di un proprietario: quelli che oggi corrono per lui. */
function ImportaProprietario() {
  const { aggiungiMolte, sostituisci, scuderia } = useScuderia();
  const [testo, setTesto] = useState("");
  const [scelto, setScelto] = useState<string | null>(() => parametriHash().get("proprietario"));
  const [fatto, setFatto] = useState<string | null>(null);
  const { data: elenco } = useQuery<any>({
    queryKey: ["/api/proprietari"],
    queryFn: async () => (await apiRequest("GET", "/api/proprietari")).json(),
  });
  const { data: cav, isFetching } = useQuery<any>({
    queryKey: ["/api/scuderia/da-proprietario", scelto],
    enabled: !!scelto,
    queryFn: async () => (await apiRequest("GET", `/api/scuderia/da-proprietario/${encodeURIComponent(scelto!)}`)).json(),
  });
  const proposte = useMemo(() => {
    const q = testo.trim().toUpperCase();
    if (q.length < 2 || !elenco?.proprietari) return [];
    return (elenco.proprietari as any[])
      .filter(p => p.nome.toUpperCase().includes(q) || p.proprietario.includes(q))
      .sort((a, b) => (b.attivo - a.attivo) || (b.n_corse_recenti - a.n_corse_recenti))
      .slice(0, 8);
  }, [testo, elenco]);
  useEffect(() => { setFatto(null); }, [scelto]);

  if (elenco && !elenco.disponibile) {
    return (
      <div className="pannello" style={{ ...CARD, marginTop: 12, fontSize: 12.5, color: MUTED }}>
        <KeyRound size={13} style={{ verticalAlign: -2, marginRight: 6, color: ACCENTO }} />
        Presto potrai riempire la scuderia scrivendo il nome del proprietario: i dati dei proprietari si stanno raccogliendo.
      </div>
    );
  }
  const voci = (cav?.cavalli ?? []).filter((c: any) => c.anno).map((c: any) => ({ tipo: "cavallo" as const, nome: c.nome, anno: c.anno }));
  const nomeProp = cav?.nome ?? (elenco?.proprietari as any[] | undefined)?.find(p => p.proprietario === scelto)?.nome ?? scelto;
  const bott: React.CSSProperties = { background: "hsl(220 10% 14%)", border: "1px solid hsl(220 10% 22%)", color: "hsl(210 10% 86%)", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div className="pannello" style={{ ...CARD, marginTop: 12 }} data-testid="importa-proprietario">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <KeyRound size={15} color={ACCENTO} />
        <b style={{ fontSize: 13.5, color: TESTO }}>Prendi i cavalli di un proprietario</b>
      </div>
      {!scelto ? (
        <div style={{ position: "relative", maxWidth: 420 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, padding: "7px 10px" }}>
            <Search size={14} color={MUTED} />
            <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Nome del proprietario o della scuderia" aria-label="Nome del proprietario"
              data-testid="input-proprietario-scuderia"
              style={{ background: "transparent", border: 0, outline: "none", color: TESTO, fontSize: 13, flex: 1, fontFamily: "inherit", minWidth: 0 }} />
          </label>
          {proposte.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {proposte.map(p => (
                <button key={p.proprietario} onClick={() => { setScelto(p.proprietario); setTesto(""); }} data-testid="proposta-proprietario"
                  style={{ ...bott, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontWeight: 700, color: TESTO }}>{p.nome}</span>
                  <span style={{ color: MUTED, fontSize: 11.5, whiteSpace: "nowrap" }}>{p.attivo ? `${p.n_cavalli_recenti} cavalli di recente` : "non più in attività"}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
            Prende i cavalli che oggi corrono per quel proprietario, cioè quelli la cui ultima corsa, negli ultimi 12 mesi, è con i suoi colori.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: "hsl(210 10% 84%)", lineHeight: 1.6 }}>
            {isFetching && !cav ? "Cerco i cavalli..." : <>
              <b style={{ color: TESTO }}>{nomeProp}</b>: {voci.length === 0 ? "nessun cavallo ha corso per lui negli ultimi 12 mesi." :
                <>{voci.length === 1 ? "1 cavallo corre" : `${voci.length} cavalli corrono`} oggi per questo proprietario.</>}
            </>}
          </div>
          {voci.length > 0 && (
            <div style={{ fontSize: 12, color: MUTED, margin: "6px 0 10px", lineHeight: 1.6 }}>
              {voci.slice(0, 12).map((v: any) => titolo(v.nome)).join(", ")}{voci.length > 12 ? ` e altri ${voci.length - 12}` : ""}.
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {voci.length > 0 && <>
              <button style={{ ...bott, borderColor: ACCENTO, color: ACCENTO, fontWeight: 700 }} data-testid="importa-sostituisci"
                onClick={() => { if (scuderia.voci.length === 0 || confirm("Sostituire la scuderia con questi cavalli?")) { sostituisci(voci); setFatto(`Scuderia sostituita con ${voci.length} cavalli.`); } }}>
                Usa come la mia scuderia
              </button>
              {scuderia.voci.length > 0 && <button style={bott} onClick={() => { const n = aggiungiMolte(voci); setFatto(n ? `Aggiunti ${n} cavalli.` : "Erano già tutti nella scuderia."); }}>
                Aggiungi a quelli che ho
              </button>}
            </>}
            <button style={bott} onClick={() => setScelto(null)}>Scegli un altro proprietario</button>
          </div>
          {fatto && <div style={{ fontSize: 12.5, color: VERDE, marginTop: 8 }}>{fatto}</div>}
        </div>
      )}
    </div>
  );
}

/** L'offerta per un cavallo, scritta a mano e salvata nella scuderia. */
function CampoOfferta({ id, valore }: { id: string; valore: number | null }) {
  const { modifica } = useScuderia();
  const [t, setT] = useState(valore != null ? String(valore) : "");
  useEffect(() => { setT(valore != null ? String(valore) : ""); }, [valore]);
  const salva = () => {
    const n = t.trim() === "" ? null : Math.max(0, Math.round(Number(t)));
    if (n != null && !Number.isFinite(n)) { setT(valore != null ? String(valore) : ""); return; }
    if (n !== valore) modifica(id, { offerta: n });
  };
  return (
    <input type="number" min={0} step={1000} inputMode="numeric" value={t} placeholder="—" aria-label="Offerta in euro"
      onChange={e => setT(e.target.value)} onBlur={salva} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 7, color: TESTO, padding: "5px 8px", fontSize: 12.5, width: 100, fontFamily: "inherit", textAlign: "right" }} />
  );
}

const ESITI: Record<string, { testo: string; colore: string }> = {
  vendere: { testo: "Vendere conviene", colore: VERDE },
  tenere: { testo: "Tenerlo conviene", colore: ORO },
  pari: { testo: "Circa uguale", colore: MUTED },
};

/** Tenere o vendere, cavallo per cavallo, e cosa cambia se vendi. */
function TenereVendere({ d }: { d: any }) {
  const vd = d.vendite;
  const t = d.prossimi_12_mesi;
  return (
    <>
      <Titoletto nota={<>Tenere un cavallo vale, in media, quello che può ancora vincere meno l'allenamento che costerà. Venderlo vale l'offerta che ricevi.
        Quanto lo hai pagato non conta: è già speso in entrambi i casi. Scrivi un'offerta per vedere quale scelta rende di più.</>}>
        Tenere o vendere
      </Titoletto>
      {(() => {
        const neg = d.voci.filter((v: any) => v.vendita.tenere <= 0).length;
        return neg > 0 ? (
          <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 8px", lineHeight: 1.6 }}>
            Con {euro(d.mensile)} al mese, {neg === d.voci.length ? (neg === 1 ? "il cavallo costa" : `tutti i ${neg} cavalli costano`) : `${neg} cavalli su ${d.voci.length} costano`} in media
            più di quanto vinceranno: per {neg === 1 ? "lui" : "loro"} qualsiasi offerta è meglio che tenerli, e anche fermarli conviene.
            Se il tuo costo mensile è più basso, scrivilo in alto: il conto cambia.
          </p>
        ) : null;
      })()}
      <div style={{ overflowX: "auto" }}>
        <table className="tabella-tenere" data-testid="tabella-vendere">
          <thead><tr>
            <th>Cavallo</th><th className="num">Tenerlo vale</th><th className="num nascondi-mobile">Vendere conviene sopra</th><th className="num">Offerta (€)</th><th>Esito</th>
          </tr></thead>
          <tbody>
            {d.voci.map((v: any) => {
              const e = v.vendita?.esito ? ESITI[v.vendita.esito] : null;
              return (
                <tr key={v.id}>
                  <td style={{ whiteSpace: "normal", minWidth: 110 }}>
                    <span style={{ color: TESTO, fontWeight: 700 }}>{v.nome ? titolo(v.nome) : "Puledro"}</span>
                    <div style={{ fontSize: 11, color: MUTED }}>{v.vendita.base === "carriera" ? (v.tipo === "puledro" ? "carriera attesa del puledro" : "resto della carriera") : "solo i prossimi 12 mesi"}</div>
                  </td>
                  <td className="num tabular" style={{ color: colSaldo(v.vendita.tenere), fontWeight: 700 }}>{euro(v.vendita.tenere)}</td>
                  <td className="num tabular nascondi-mobile">{v.vendita.tenere <= 0 ? <span style={{ color: MUTED }}>qualsiasi prezzo</span> : euro(v.vendita.soglia)}</td>
                  <td className="num"><CampoOfferta id={v.id} valore={v.vendita.offerta} /></td>
                  <td style={{ whiteSpace: "normal", minWidth: 120 }}>
                    {e ? <>
                      <b style={{ color: e.colore, fontSize: 12.5 }}>{e.testo}</b>
                      <div style={{ fontSize: 11, color: MUTED }}>
                        {v.vendita.esito === "pari" ? "differenza entro il 10%" : `${euro(Math.abs(v.vendita.differenza))} ${v.vendita.esito === "vendere" ? "in più vendendo" : "in più tenendolo"}`}
                      </div>
                    </> : <span style={{ fontSize: 11.5, color: MUTED }}>{v.vendita.tenere <= 0 ? "costa più di quanto renderà" : "scrivi un'offerta"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {vd && vd.cavalli.length > 0 && (
        <div className="pannello" style={{ ...CARD, marginTop: 10 }} data-testid="riassunto-vendite">
          <b style={{ fontSize: 13.5, color: TESTO }}>Se vendi {vd.cavalli.length === 1 ? "questo cavallo" : `questi ${vd.cavalli.length} cavalli`}</b>
          <p style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", margin: "6px 0 0", lineHeight: 1.65 }}>
            {vd.cavalli.map((n: string) => titolo(n)).join(", ")}: incassi <b style={{ color: TESTO }}>{euro(vd.incasso)}</b>
            {vd.valore_rinunciato >= 0
              ? <> e rinunci a una carriera che vale in media {euro(vd.valore_rinunciato)}</>
              : <> e in più eviti una carriera che in media costerebbe {euro(-vd.valore_rinunciato)} più di quanto renderebbe</>},
            quindi ci guadagni circa <b style={{ color: VERDE }}>{euro(vd.guadagno)}</b>.
            {vd.dopo && <> Nei prossimi 12 mesi il saldo atteso della scuderia passa da {euro(t.saldo_atteso_12)} a <b style={{ color: colSaldo(vd.dopo.saldo_atteso_12) }}>{euro(vd.dopo.saldo_atteso_12)}</b> e
              chiude in pari nel {pc(vd.dopo.prob_in_pari)} dei casi invece che nel {pc(t.prob_in_pari)}.</>}
          </p>
        </div>
      )}
      {vd && vd.con_offerta > 0 && vd.cavalli.length === 0 && (
        <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>Con le offerte scritte, nessun cavallo rende di più venduto che tenuto.</p>
      )}
    </>
  );
}

export default function ScuderiaPage() {
  const { scuderia, togli, impostaMensile, sostituisci, svuota } = useScuderia();
  const [mensileScritto, setMensileScritto] = useState(String(scuderia.mensile));
  const corpo = JSON.stringify({ mensile: scuderia.mensile, voci: scuderia.voci });
  const { data: d, isFetching, error } = useQuery<any>({
    queryKey: ["/api/scuderia", corpo],
    queryFn: async () => (await apiRequest("POST", "/api/scuderia", JSON.parse(corpo))).json(),
    enabled: scuderia.voci.length > 0,
    placeholderData: (p: any) => p,
  });
  const caricaEsempio = async () => {
    const r = await (await apiRequest("GET", "/api/scuderia/esempio")).json();
    sostituisci(r.voci ?? []);
  };
  const vuota = scuderia.voci.length === 0;
  const t = d?.prossimi_12_mesi, rs = d?.rischio, ca = d?.carriera;
  const idDaFermare = new Set((rs?.da_fermare ?? []).map((x: any) => x.id));
  const bottoneLeggero: React.CSSProperties = { background: "hsl(220 10% 14%)", border: "1px solid hsl(220 10% 22%)", color: "hsl(210 10% 82%)", borderRadius: 8, padding: "6px 11px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div className="page-shell">
      <IntestazionePagina icona={Briefcase} colore={ACCENTO} titolo="La tua scuderia" margineSotto={14}
        sottotitolo="I tuoi cavalli e puledri insieme: cassa dei prossimi 12 mesi, rischio, valore di carriera e quando conviene vendere.">
        Metti insieme i tuoi cavalli e i tuoi puledri. Il sito guarda la scuderia come un'azienda: quanto entra e quanto esce nei prossimi 12 mesi,
        quanto è rischiosa nel suo insieme e quanto vale la carriera che i cavalli hanno ancora davanti. L'elenco resta salvato in questo browser.
      </IntestazionePagina>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 12.5, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
          Costo per cavallo al mese (€)
          <input type="number" min={100} step={50} inputMode="numeric" value={mensileScritto}
                 onChange={e => setMensileScritto(e.target.value)}
                 onBlur={() => { const n = Number(mensileScritto); if (n >= 100) impostaMensile(Math.round(n)); else setMensileScritto(String(scuderia.mensile)); }}
                 onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                 style={{ background: "hsl(220 12% 8%)", border: "1px solid hsl(220 10% 22%)", borderRadius: 8, color: TESTO, padding: "6px 9px", fontSize: 13, width: 90, fontFamily: "inherit" }} />
        </label>
        <button style={bottoneLeggero} onClick={caricaEsempio}>{vuota ? "Prova con una scuderia d'esempio" : "Sostituisci con l'esempio"}</button>
        {!vuota && <button style={bottoneLeggero} onClick={() => { if (confirm("Togliere tutti i cavalli dalla scuderia?")) svuota(); }}>Svuota</button>}
      </div>

      <Aggiungi />
      <ImportaProprietario />

      {vuota && (
        <div className="pannello" style={{ ...CARD, marginTop: 14, color: "hsl(210 10% 82%)", fontSize: 13, lineHeight: 1.7 }}>
          La scuderia è vuota. Aggiungi un cavallo qui sopra, oppure usa il bottone «Aggiungi alla scuderia» nella scheda di un cavallo,
          in <Link href="/tenere" style={{ color: ORO }}>Tenere o fermare</Link>, e in <Link href="/puledro" style={{ color: ORO }}>Puledri e aste</Link>
          (sia nel conto di un puledro sia nei lotti delle aste).
        </div>
      )}
      {!vuota && !d && isFetching && <div style={{ marginTop: 14 }}><Sagoma riquadri={4} grafico={120} /></div>}
      {!vuota && error && <div className="pannello" style={{ ...CARD, marginTop: 14, color: ROSSO, fontSize: 13 }}>Non riesco a calcolare la scuderia adesso. Riprova tra poco.</div>}

      {!vuota && d && !d.vuota && t && <>
        <Titoletto nota={<>Ogni cavallo è simulato {d.simulazioni.toLocaleString("it-IT")} volte, con quanto hanno vinto davvero i cavalli con una stima simile alla sua. Poi si sommano i cavalli.</>}>
          I prossimi 12 mesi
        </Titoletto>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
          <Riquadro titolo="Spese" valore={euro(t.costo_12)} nota={<>{t.cavalli} cavalli a {euro(d.mensile)} al mese</>} />
          <Riquadro titolo="Premi attesi" valore={euro(t.premi_attesi_12)} nota="la parte del proprietario" />
          <Riquadro titolo="Saldo atteso" colore={colSaldo(t.saldo_atteso_12)} valore={euro(t.saldo_atteso_12)}
                    nota={<>metà degli anni va peggio di {euro(t.saldo_mediano)}: pochi anni buoni alzano la media</>} />
          <Riquadro titolo="Chiude in pari" colore={t.prob_in_pari >= 50 ? VERDE : t.prob_in_pari >= 25 ? ORO : ROSSO} valore={`${pc(t.prob_in_pari)} dei casi`}
                    nota={<>perde più di metà delle spese nel {pc(t.prob_perde_meta)} dei casi</>} />
        </div>
        <div className="pannello" style={{ ...CARD, marginTop: 10 }}>
          <Istogramma colonne={t.istogramma} />
          <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0", lineHeight: 1.6 }}>
            In un anno su dieci va peggio di <b style={{ color: TESTO }}>{euro(t.saldo_basso)}</b>, in uno su dieci meglio di <b style={{ color: TESTO }}>{euro(t.saldo_alto)}</b>.
          </p>
        </div>

        <Titoletto nota="Quanto la scuderia dipende da pochi cavalli, e cosa cambia se si fermano quelli che non coprono il loro costo.">Il rischio della scuderia</Titoletto>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
          <div className="pannello" style={CARD}>
            <b style={{ fontSize: 13.5, color: TESTO }}>Quanto dipende da un cavallo</b>
            <p style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", margin: "6px 0 0", lineHeight: 1.65 }}>
              Il <b>{pc(rs.quota_migliore)}</b> dei premi attesi viene da <b>{titolo(rs.migliore)}</b>.
              {rs.senza_migliore && <> Senza di lui il saldo atteso sarebbe {euro(rs.senza_migliore.saldo_atteso_12)} e la scuderia chiuderebbe in pari nel {pc(rs.senza_migliore.prob_in_pari)} dei casi.</>}
              {rs.quota_migliore >= 50 && " Un infortunio o un calo di quel cavallo pesa su tutto il bilancio."}
            </p>
          </div>
          <div className="pannello" style={CARD}>
            <b style={{ fontSize: 13.5, color: TESTO }}>Più cavalli non vuol dire meno rischio</b>
            <p style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", margin: "6px 0 0", lineHeight: 1.65 }}>
              Un cavallo di questa scuderia copre il suo costo in media nel {pc(t.prob_media_singolo)} dei casi; la scuderia intera chiude in pari nel {pc(t.prob_in_pari)}.
              Avere più cavalli rende il risultato meno ballerino, ma se ognuno in media perde, la scuderia perde con più sicurezza.
            </p>
          </div>
          <div className="pannello" style={CARD}>
            <b style={{ fontSize: 13.5, color: TESTO }}>Se fermi chi non rende</b>
            {rs.da_fermare.length && rs.dopo_aver_fermato ? (
              <p style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", margin: "6px 0 0", lineHeight: 1.65 }}>
                {rs.da_fermare.length === 1 ? "Un cavallo" : `${rs.da_fermare.length} cavalli`} in media non coprono il costo e lo coprono in meno di un caso su tre:{" "}
                {rs.da_fermare.map((x: any) => titolo(x.nome)).join(", ")}. Fermandoli (o vendendoli) il saldo atteso passa
                da {euro(t.saldo_atteso_12)} a <b style={{ color: colSaldo(rs.dopo_aver_fermato.saldo_atteso_12) }}>{euro(rs.dopo_aver_fermato.saldo_atteso_12)}</b> e
                la scuderia chiude in pari nel <b>{pc(rs.dopo_aver_fermato.prob_in_pari)}</b> dei casi invece che nel {pc(t.prob_in_pari)}.
              </p>
            ) : (
              <p style={{ fontSize: 12.5, color: "hsl(210 10% 80%)", margin: "6px 0 0", lineHeight: 1.65 }}>
                Nessun cavallo in corsa è chiaramente da fermare: tutti coprono il costo in media o in almeno un caso su tre.
                {t.saldo_atteso_12 < 0 && " Il saldo negativo viene da puledri non ancora in pista o da cavalli vicini al pari."}
              </p>
            )}
          </div>
        </div>

        <Titoletto nota="Premi e costi attesi di ogni cavallo nei prossimi 12 mesi, e quanto vale la carriera che ha ancora davanti (premi futuri meno allenamento futuro).">
          Cavallo per cavallo
        </Titoletto>
        <div style={{ overflowX: "auto" }}>
          <table className="tabella-tenere">
            <thead><tr>
              <th>Cavallo</th><th className="num nascondi-mobile">Età</th><th className="num nascondi-mobile">Premi attesi</th><th className="num nascondi-mobile">1 anno su 10 oltre</th>
              <th className="num">Saldo 12 mesi</th><th className="num">Copre il costo</th><th className="num nascondi-mobile">Valore di carriera</th><th className="num nascondi-mobile">Pagato</th><th></th>
            </tr></thead>
            <tbody>
              {d.voci.map((v: any) => (
                <tr key={v.id}>
                  <td style={{ whiteSpace: "normal", minWidth: 120 }}>
                    {v.tipo === "cavallo"
                      ? <><BandieraCavallo nome={v.nome} /> <Link href={`/horse/${encodeURIComponent(v.nome)}/${v.anno}`} style={{ color: TESTO, fontWeight: 700 }}>{titolo(v.nome)}</Link></>
                      : <Link href={`/puledro?padre=${encodeURIComponent(v.padre)}&madre=${encodeURIComponent(v.madre ?? "")}&prezzo=${v.prezzo ?? ""}&asta=${v.asta ? 1 : 0}${v.nome ? `&nome=${encodeURIComponent(v.nome)}` : ""}`} style={{ color: TESTO, fontWeight: 700 }}>{v.nome ? titolo(v.nome) : "Puledro"}</Link>}
                    {v.voto && <span style={{ marginLeft: 6 }}><GradeBadge grade={v.voto} size="sm" /></span>}
                    {idDaFermare.has(v.id) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: ROSSO, border: `1px solid ${ROSSO}`, borderRadius: 5, padding: "0 4px" }}>DA FERMARE</span>}
                    <div style={{ fontSize: 11, color: MUTED }}>
                      {v.tipo === "puledro" ? <>{titolo(v.padre)}{v.madre ? ` × ${titolo(v.madre)}` : ""}{v.asta ? " · d'asta" : ""}</> : (v.padre ? `da ${titolo(v.padre)}` : "")}
                    </div>
                    {v.nota && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.45 }}>{v.nota}</div>}
                  </td>
                  <td className="num tabular nascondi-mobile">{v.eta ?? "—"}</td>
                  <td className="num tabular nascondi-mobile">{euro(v.premi_attesi_12)}</td>
                  <td className="num tabular nascondi-mobile">{euro(v.premi_12_alto)}</td>
                  <td className="num tabular" style={{ fontWeight: 700, color: colSaldo(v.saldo_atteso_12) }}>{euro(v.saldo_atteso_12)}</td>
                  <td className="num tabular" style={{ color: v.prob_copre >= 50 ? VERDE : v.prob_copre >= 25 ? ORO : ROSSO, fontWeight: 700 }}>{pc(v.prob_copre)}</td>
                  <td className="num tabular nascondi-mobile" style={{ color: v.carriera ? colSaldo(v.carriera.valore) : MUTED }}>{v.carriera ? euro(v.carriera.valore) : "—"}</td>
                  <td className="num tabular nascondi-mobile">{euro(v.prezzo)}</td>
                  <td><button onClick={() => togli(v.id)} title="Togli dalla scuderia" aria-label={`Togli ${v.nome}`}
                              style={{ background: "transparent", border: 0, color: MUTED, cursor: "pointer", padding: 4 }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.non_trovati?.length > 0 && <p style={{ fontSize: 12, color: ORO, marginTop: 8 }}>Non trovati in archivio: {d.non_trovati.join(", ")}.</p>}

        <TenereVendere d={d} />

        <Titoletto nota="Quanto vale, in media, quello che i cavalli possono ancora fare in carriera, al netto dell'allenamento che costeranno. Per i puledri è il valore di «Quanto vale un puledro».">
          Il valore della scuderia
        </Titoletto>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
          <Riquadro titolo="Valore di carriera" colore={colSaldo(ca.valore_atteso)} valore={euro(ca.valore_atteso)} nota={<>su {ca.cavalli_con_stima} cavalli con una stima</>} />
          <Riquadro titolo="Premi ancora da vincere" valore={euro(ca.premi_futuri)} nota={<>contro {euro(ca.allenamento_futuro)} di allenamento futuro</>} />
          {ca.prezzi_pagati != null && <Riquadro titolo="Pagati" valore={euro(ca.prezzi_pagati)} nota={<>{ca.cavalli_con_prezzo === 1 ? "1 cavallo" : `${ca.cavalli_con_prezzo} cavalli`} con il prezzo indicato: è già speso e non cambia le scelte di oggi</>} />}
        </div>
      </>}

      <div style={{ marginTop: 18 }}>
        <Spiegazione titolo="Come è fatto il conto e cosa non dice">
          <p>Cavalli in attività: i premi attesi nei prossimi 12 mesi sono la stima del sito, la stessa di «Tenere o fermare». Il modo in cui possono andare davvero
          viene da come sono andati, nel periodo di prova, i cavalli con una stima simile, dal 5% peggiore al 5% migliore. Un cavallo che non ha corso nell'ultimo anno conta solo come costo.</p>
          <p>Puledri: si pesca un cavallo vero tra i figli dello stesso padre nati 2018-2022 (con pochi figli, tra tutti i nati) e si prendono i suoi premi a 2 e 3 anni,
          solo la parte di stagione che cade nei prossimi 12 mesi. Per un nato dell'anno scorso è l'inizio della stagione dei 2 anni. «Comprato all'asta» moltiplica i premi per {d?.ipotesi?.fattore_asta?.toLocaleString("it-IT") ?? "1,4"},
          come è successo ai puledri delle aste 2024 e 2025.</p>
          <p>I cavalli sono trattati come indipendenti fra loro. Si poteva temere che chi ha lo stesso allenatore vada bene o male «tutto insieme»; rifatta sul passato
          con scuderie di cavalli guidati dallo stesso guidatore (quando è stata fatta la prova l'archivio non conosceva ancora allenatori e proprietari), la forchetta fra l'anno brutto e l'anno buono
          ha contenuto il risultato vero 84 volte su 100, quanto le scuderie a caso: per ora non si vede un rischio nascosto. I dettagli sono
          in <Link href="/controllo" style={{ color: ACCENTO }}>Controllo a posteriori</Link>.</p>
          <p>Valore di carriera: per i cavalli in attività i premi che possono ancora vincere, meno l'allenamento degli anni in cui resteranno in attività. Non contano rivendita,
          valore da riproduttore e premi all'allevatore, tutti a favore.</p>
          <p>Tenere o vendere: si confronta l'offerta con il valore di carriera (per chi non ha una stima di carriera, con il saldo dei prossimi 12 mesi).
          È una media: un cavallo può andare meglio o peggio, e il conto non sa niente delle condizioni fisiche che conosci tu. Sotto il 10% di differenza
          le due scelte si equivalgono, come nel Punto di pareggio. Il sito non stima quanto vale un cavallo sul mercato: l'offerta la scrivi tu.</p>
        </Spiegazione>
      </div>
      <CollegamentiCorrelati voci={[
        { href: "/tenere", titolo: "Tenere o fermare", descrizione: "Tutti i cavalli in attività, con premi attesi e spese" },
        { href: "/puledro", titolo: "Puledri e aste", descrizione: "Prezzo massimo, vendere o far correre, aste 2026" },
        { href: "/pareggio", titolo: "Punto di pareggio", descrizione: "Quanto costa un cavallo e quali voti si ripagano" },
      ]} />
    </div>
  );
}
