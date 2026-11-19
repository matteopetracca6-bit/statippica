/**
 * ECONOMIA: DA DOVE PARTO.
 *
 * Le pagine di Economia erano quattro (La tua scuderia, Puledri e aste,
 * Tenere o fermare, Punto di pareggio) e facevano domande simili: chi
 * arrivava non sapeva quale aprire. Questa pagina parte dalla situazione di
 * chi la usa ("ho un puledro", "ho un cavallo che corre", "ho una scuderia",
 * "voglio capire i costi") e porta allo strumento giusto.
 *
 * Il costo al mese si scrive qui una volta e vale in tutte le pagine di
 * Economia (lo tiene lib/scuderia.ts nel browser).
 */
import { useState } from "react";
import { Link } from "wouter";
import { Compass, Tag, TrendingUp, Briefcase, Scale, ArrowRight, Sparkles } from "lucide-react";
import { coloreScheda } from "@/lib/sezioni";
import { useScuderia } from "@/lib/scuderia";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";

const COLORE = coloreScheda("/economia");
const TESTO = "hsl(210 10% 90%)";
const MUTO = "hsl(210 8% 58%)";
const FIOCO = "hsl(210 8% 42%)";
const BORDO = "hsl(220 10% 16%)";
const FONDO = "hsl(220 12% 9%)";
const euro = (n: number) => "€ " + Math.round(n).toLocaleString("it-IT");

type Strada = { domanda: string; risposta: string; href: string; dove: string };
type Situazione = { chiave: string; titolo: string; sotto: string; icona: typeof Tag; colore: string; strade: Strada[] };

const SITUAZIONI: Situazione[] = [
  {
    chiave: "puledro", titolo: "Ho un puledro, o voglio comprarne uno", sotto: "Prima che corra: quanto vale e cosa conviene farne.",
    icona: Tag, colore: coloreScheda("/puledro"),
    strade: [
      { domanda: "Quanto posso pagarlo al massimo?", risposta: "Il prezzo oltre il quale, in media, non si ripaga con i premi.", href: "/puledro", dove: "Puledri e aste" },
      { domanda: "L'ho allevato: lo vendo o lo faccio correre?", risposta: "Lo stesso conto visto da chi vende, con l'offerta che scrivi tu.", href: "/puledro?modo=vendo", dove: "Puledri e aste" },
      { domanda: "Com'è andata alle aste 2026?", risposta: "I puledri passati all'asta, lotto per lotto.", href: "/puledro?modo=aste", dove: "Puledri e aste" },
    ],
  },
  {
    chiave: "cavallo", titolo: "Ho un cavallo che corre", sotto: "Già in gara: tenerlo, fermarlo o venderlo.",
    icona: TrendingUp, colore: coloreScheda("/tenere"),
    strade: [
      { domanda: "Lo tengo un altro anno o lo fermo?", risposta: "Quanto vincerà probabilmente nei prossimi 12 mesi, contro la spesa di un anno.", href: "/tenere", dove: "Tenere o fermare" },
      { domanda: "Fin qui si è ripagato?", risposta: "Il bilancio della carriera: lo trovi nella scheda del cavallo, parte Economia.", href: "/leaderboard", dove: "Cerca il cavallo" },
      { domanda: "Mi hanno fatto un'offerta: conviene venderlo?", risposta: "Aggiungilo alla tua scuderia e scrivi l'offerta in «Tenere o vendere».", href: "/scuderia", dove: "La tua scuderia" },
    ],
  },
  {
    chiave: "scuderia", titolo: "Ho più cavalli", sotto: "Tutti insieme: cassa, rischio e valore.",
    icona: Briefcase, colore: coloreScheda("/scuderia"),
    strade: [
      { domanda: "Quanto entra e quanto esce nei prossimi 12 mesi?", risposta: "Spese, premi attesi e probabilità di chiudere in pari, per tutta la scuderia.", href: "/scuderia", dove: "La tua scuderia" },
      { domanda: "Posso caricare i cavalli di un proprietario?", risposta: "Scrivi il nome del proprietario e prendi i cavalli che corrono per lui.", href: "/scuderia", dove: "La tua scuderia" },
      { domanda: "Quali cavalli conviene vendere?", risposta: "Per ognuno: quanto vale tenerlo e sopra quale offerta conviene vendere.", href: "/scuderia", dove: "La tua scuderia" },
    ],
  },
  {
    chiave: "costi", titolo: "Voglio capire i costi in generale", sotto: "Non un cavallo preciso: le medie dell'archivio.",
    icona: Scale, colore: coloreScheda("/pareggio"),
    strade: [
      { domanda: "Quanto deve vincere un cavallo per ripagarsi?", risposta: "Le soglie e i voti che, in media, arrivano in pari.", href: "/pareggio", dove: "Punto di pareggio" },
      { domanda: "Un incrocio conviene?", risposta: "L'utile atteso di un puledro di quello stallone, e la monta massima da pagare.", href: "/pareggio", dove: "Punto di pareggio" },
      { domanda: "Quale stallone per la mia fattrice?", risposta: "Costi e ritorni degli accoppiamenti. Il modello è sperimentale.", href: "/advisor", dove: "Advisor" },
    ],
  },
];

const CSS = `
.ec-griglia { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ec-scelte { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.ec-scelta { text-align: left; border-radius: 12px; padding: 12px 14px; cursor: pointer; font-family: inherit; background: ${FONDO}; border: 1px solid ${BORDO};
  display: flex; gap: 10px; align-items: flex-start; transition: border-color .15s, background .15s; }
.ec-scelta:hover { border-color: color-mix(in srgb, var(--c) 50%, transparent); }
.ec-scelta[aria-pressed="true"] { border-color: var(--c); background: color-mix(in srgb, var(--c) 10%, ${FONDO}); }
.ec-strada { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 11px 12px; border-radius: 10px;
  background: hsl(220 12% 11%); border: 1px solid ${BORDO}; text-decoration: none; transition: border-color .15s; }
.ec-strada:hover { border-color: var(--c); }
.ec-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ec-tab th { text-align: left; color: ${FIOCO}; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; padding: 6px 8px; border-bottom: 1px solid ${BORDO}; }
.ec-tab td { padding: 8px; border-bottom: 1px solid hsl(220 10% 13%); color: ${MUTO}; vertical-align: top; }
@media (max-width: 900px) { .ec-scelte { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .ec-griglia { grid-template-columns: minmax(0, 1fr); } .ec-tab .ec-nasc { display: none; } }
@media (max-width: 420px) { .ec-scelte { grid-template-columns: minmax(0, 1fr); } }
`;

function Riquadro({ s, evidenziato }: { s: Situazione; evidenziato: boolean }) {
  const Icona = s.icona;
  return (
    <section id={`ec-${s.chiave}`} data-testid={`situazione-${s.chiave}`} style={{ ["--c" as any]: s.colore, borderRadius: 14, padding: "16px 16px 14px",
      background: `linear-gradient(135deg, color-mix(in srgb, ${s.colore} ${evidenziato ? 12 : 6}%, ${FONDO}) 0%, ${FONDO} 60%)`,
      border: `1px solid ${evidenziato ? s.colore : BORDO}`, transition: "border-color .2s" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
        <Icona size={18} color={s.colore} />
        <h2 style={{ fontSize: 15.5, fontWeight: 800, color: TESTO, margin: 0 }}>{s.titolo}</h2>
      </div>
      <div style={{ fontSize: 12.5, color: MUTO, marginBottom: 12 }}>{s.sotto}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {s.strade.map(st => (
          <Link key={st.domanda} href={st.href}>
            <a className="ec-strada">
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: TESTO }}>{st.domanda}</span>
                <span style={{ display: "block", fontSize: 12, color: MUTO, marginTop: 2, lineHeight: 1.45 }}>{st.risposta}</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: s.colore, whiteSpace: "nowrap" }}>
                {st.dove} <ArrowRight size={13} />
              </span>
            </a>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function EconomiaPage() {
  const { scuderia, impostaMensile } = useScuderia();
  const [scritto, setScritto] = useState(String(scuderia.mensile || 1200));
  const [scelta, setScelta] = useState<string | null>(null);
  const salva = (v: string) => { const n = Math.round(Number(v)); if (n >= 100 && n <= 10000) impostaMensile(n); else setScritto(String(scuderia.mensile || 1200)); };
  const scegli = (k: string) => {
    setScelta(k);
    document.getElementById(`ec-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="page-shell">
      <style>{CSS}</style>
      <IntestazionePagina icona={Compass} colore={COLORE} titolo="Economia: da dove parto" margineSotto={16}
        sottotitolo="Scegli la tua situazione: ti portiamo allo strumento che risponde alla tua domanda.">
        Le pagine di Economia fanno conti diversi su costi e premi. Qui sono messe in ordine partendo da quello che hai: un puledro,
        un cavallo che corre, più cavalli insieme, oppure nessun cavallo preciso e la voglia di capire quanto costa questo mondo.
        Il costo al mese che scrivi qui vale in tutte le pagine di Economia e nella scheda di ogni cavallo.
      </IntestazionePagina>

      <div style={{ borderRadius: 14, background: FONDO, border: `1px solid ${BORDO}`, padding: "12px 16px", marginBottom: 14,
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }} data-testid="costo-condiviso">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TESTO, flexWrap: "wrap" }}>
          Quanto spendi al mese per un cavallo in allenamento
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>€
            <input type="number" min={100} max={10000} step={50} inputMode="numeric" value={scritto} data-testid="input-mensile-economia"
              onChange={e => setScritto(e.target.value)} onBlur={e => salva(e.target.value)} onKeyDown={e => { if (e.key === "Enter") salva((e.target as HTMLInputElement).value); }}
              style={{ width: 92, background: "hsl(220 12% 7%)", border: `1px solid ${BORDO}`, borderRadius: 8, color: TESTO, padding: "6px 9px", fontSize: 13, fontFamily: "inherit" }} />
          </span>
        </label>
        <span style={{ fontSize: 12, color: MUTO }}>
          in un anno <b style={{ color: TESTO }}>{euro(12 * (scuderia.mensile || 1200))}</b> · vale in tutte le pagine di Economia
        </span>
      </div>

      <div className="ec-scelte" role="group" aria-label="La tua situazione">
        {SITUAZIONI.map(s => {
          const Icona = s.icona;
          return (
            <button key={s.chiave} className="ec-scelta" aria-pressed={scelta === s.chiave} onClick={() => scegli(s.chiave)}
              style={{ ["--c" as any]: s.colore }} data-testid={`scegli-${s.chiave}`}>
              <Icona size={17} color={s.colore} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TESTO, lineHeight: 1.35 }}>{s.titolo}</span>
            </button>
          );
        })}
      </div>

      <div className="ec-griglia">
        {SITUAZIONI.map(s => <Riquadro key={s.chiave} s={s} evidenziato={scelta === s.chiave} />)}
      </div>

      <section style={{ borderRadius: 14, background: FONDO, border: `1px solid ${BORDO}`, padding: "16px 18px", marginTop: 14 }} data-testid="tabella-strumenti">
        <h2 style={{ fontSize: 15, fontWeight: 800, color: TESTO, margin: "0 0 4px" }}>Perché gli strumenti danno numeri diversi</h2>
        <div style={{ fontSize: 12.5, color: MUTO, marginBottom: 10, lineHeight: 1.5 }}>
          Non si contraddicono: guardano periodi diversi. Uno guarda solo i prossimi 12 mesi, un altro tutta la carriera, un altro ancora la media
          di migliaia di cavalli.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="ec-tab">
            <thead><tr><th>Pagina</th><th>Che periodo guarda</th><th className="ec-nasc">Su cosa si basa</th></tr></thead>
            <tbody>
              {[
                ["/tenere", "Tenere o fermare", "i prossimi 12 mesi, da oggi", "la stima dei premi di ogni cavallo in attività; le spese passate non contano"],
                ["/scuderia", "La tua scuderia", "i prossimi 12 mesi e il resto della carriera", "le stesse stime, sommate su tutti i tuoi cavalli, con il rischio dell'insieme"],
                ["/puledro", "Puledri e aste", "tutta la carriera di un puledro che non ha ancora corso", "come sono andati i figli dello stesso padre (e della madre)"],
                ["/pareggio", "Punto di pareggio", "tutta la carriera, in media", "la carriera reale di migliaia di cavalli già a fine corsa, per voto"],
              ].map(([href, nome, periodo, base]) => (
                <tr key={href}>
                  <td><Link href={href}><a style={{ color: coloreScheda(href), fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>{nome}</a></Link></td>
                  <td style={{ color: TESTO }}>{periodo}</td>
                  <td className="ec-nasc">{base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: FIOCO, marginTop: 10, lineHeight: 1.5 }}>
          <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          Sono stime fatte sui dati dell'archivio, non promesse: il prezzo di vendita o l'offerta per un cavallo li scrivi sempre tu.
        </div>
      </section>

      <CollegamentiCorrelati voci={[
        { href: "/controllo", titolo: "Controllo a posteriori", descrizione: "Le stime rifatte nel passato, contro com'è andata davvero." },
        { href: "/metodo", titolo: "Metodo e dati", descrizione: "Da dove vengono i numeri e come si leggono." },
      ]} />
    </div>
  );
}
