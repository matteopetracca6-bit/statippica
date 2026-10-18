/**
 * COME E' STATO PROVATO IL PRONOSTICO DEI PRIMI TRE.
 *
 * Una stima senza prova e' un'opinione. Qui si mostra la prova fatta
 * all'allenamento: il modello ha imparato sulle corse fino al 2024 ed e' stato
 * messo alla prova su quelle del 2025-2026, che non aveva mai visto. Lo si
 * confronta con due modi semplici di scegliere (il numero di partenza e il
 * voto StatIppica di oggi) e si controlla che le percentuali siano credibili:
 * fra i cavalli dati al 40%, ne arrivano davvero nei primi tre circa 4 su 10?
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import Sagoma from "./Sagoma";

const MUTED = "hsl(210 8% 55%)";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toLocaleString("it-IT");

// Le 28 voci del modello raccolte in gruppi che si capiscono.
const GRUPPI_PESO: [string, string[]][] = [
  ["Forma recente", ["h_ult5_top3", "h_ult_top3", "h_ult3_pos", "s_ult5_top3", "r_ult5_top3"]],
  ["Numero di partenza", ["partenza", "partenza_rel"]],
  ["Quanti sono i partenti", ["partenti"]],
  ["Premi dell'ultimo anno", ["s_premi_365", "r_premi_365", "h_premi_365"]],
  ["Piazzamenti e vittorie in carriera", ["h_top3", "h_vitt", "r_top3", "h_n"]],
  ["Tempi", ["r_tempo_migl", "s_tempo_migl", "h_tempo_ult", "h_tempo_migl"]],
  ["Guidatore", ["d_top3", "d_n", "r_d_top3"]],
  ["Età, sesso e attività", ["maschio", "eta", "h_giorni", "h_gare_365"]],
  ["Risultati su questa pista", ["h_pista_top3", "h_pista_n"]],
];

function PesiRaggruppati({ pesi }: { pesi: { variabile: string; peso: number }[] }) {
  const tot = pesi.reduce((a, p) => a + p.peso, 0) || 1;
  const righe = GRUPPI_PESO.map(([nome, vars]) => ({ nome, peso: pesi.filter(p => vars.includes(p.variabile)).reduce((a, p) => a + p.peso, 0) / tot }))
    .filter(r => r.peso > 0).sort((a, b) => b.peso - a.peso);
  const max = Math.max(...righe.map(r => r.peso), 0.01);
  return (
    <div className="barre-orizz">
      {righe.map(r => (
        <div key={r.nome} className="riga">
          <span>{r.nome}</span>
          <span className="traccia"><i style={{ width: `${(r.peso / max) * 85}%`, background: "hsl(183 60% 48%)" }} /><b>{Math.round(r.peso * 100)}</b></span>
        </div>
      ))}
    </div>
  );
}

export default function VerificaPronostico() {
  const [aperta, setAperta] = useState(false);
  const { data: v } = useQuery<any>({
    queryKey: ["/api/pronostico/verifica"],
    queryFn: async () => (await apiRequest("GET", "/api/pronostico/verifica")).json(),
    staleTime: 60 * 60 * 1000,
  });
  if (!v) return <div style={{ marginTop: 20 }}><Sagoma cornice riquadri={3} /></div>;
  if (v.message) return null;
  const cc = v.campo_completo;
  const righe = [
    { nome: "Questo modello", m: cc.modello_normalizzato, evid: true },
    { nome: "Voto StatIppica di oggi", m: cc.voto_attuale, nota: "avvantaggiato: il voto di oggi conosce già queste corse" },
    { nome: "Solo numero di partenza", m: cc.solo_partenza },
  ];
  const casuale = 3 / 10; // circa tre su dieci partenti

  return (
    <div className="verifica-pronostico">
      <button className="verifica-testa" onClick={() => setAperta(a => !a)} aria-expanded={aperta}>
        <FlaskConical size={15} style={{ color: "hsl(183 70% 52%)" }} />
        <span>Come si calcola e come è stato provato il pronostico</span>
        <span className="verifica-sintesi">
          dei tre favoriti ne arrivano {num(Math.round(cc.modello_normalizzato.tre_scelti_a_segno * 30) / 10)} su 3 nei primi tre
        </span>
        <ChevronDown size={15} style={{ marginLeft: "auto", transform: aperta ? "rotate(180deg)" : "none", transition: "transform .2s", color: MUTED }} />
      </button>

      {aperta && (
        <div style={{ padding: "4px 20px 20px" }}>
          <p className="verifica-testo">
            Il modello ha imparato su {num(v.periodo_allenamento.partenze)} partenze dal {v.periodo_allenamento.da.slice(0, 4)} al{" "}
            {v.periodo_allenamento.a.slice(0, 4)}, ed è stato provato su {num(v.periodo_prova.partenze)} partenze
            del {v.periodo_prova.da.slice(0, 4)}-{v.periodo_prova.a.slice(2, 4)} che non aveva mai visto. Il confronto qui sotto usa le{" "}
            {num(cc.corse)} corse di cui l'archivio conosce tutti i partenti, come succede nel calendario.
          </p>

          <div className="verifica-tabella">
            <div className="intestazione"><span>Metodo</span><span>Dei 3 con la stima più alta, quanti arrivano nei primi tre</span><span>Capacità di distinguere</span></div>
            {righe.map(r => (
              <div key={r.nome} className={r.evid ? "evid" : ""}>
                <span>{r.nome}{r.nota && <small>{r.nota}</small>}</span>
                <span className="tabular">
                  <span className="barretta"><span style={{ width: pct(r.m.tre_scelti_a_segno) }} /></span>
                  {pct(r.m.tre_scelti_a_segno)}
                </span>
                <span className="tabular">{num(Math.round(r.m.auc * 100) / 100)}</span>
              </div>
            ))}
            <div className="nota-tabella">
              Scegliendo tre cavalli a caso ne arriverebbero circa {pct(casuale)}. La capacità di distinguere va da 0,5 (come tirare a
              sorte) a 1 (perfetto).
            </div>
          </div>

          <h4 className="verifica-titolo">Le percentuali sono credibili?</h4>
          <p className="verifica-testo">
            Per ogni fascia di stima, quanti cavalli sono arrivati davvero nei primi tre. Se le due barre sono uguali, una stima del 40% vuol dire
            davvero 4 su 10.
          </p>
          <div className="verifica-fasce">
            {v.fasce.map((f: any) => (
              <div key={f.da} className="fascia">
                <div className="fascia-barre">
                  <span className="b-stimato" style={{ height: `${f.stimato * 100}%` }} title={`stimato ${pct(f.stimato)}`} />
                  <span className="b-reale" style={{ height: `${f.reale * 100}%` }} title={`reale ${pct(f.reale)}`} />
                </div>
                <div className="fascia-etichetta tabular">{Math.round(f.da * 100)}–{Math.round(f.a * 100)}%</div>
                <div className="fascia-valori tabular">{pct(f.stimato)} · {pct(f.reale)}</div>
              </div>
            ))}
          </div>
          <div className="legenda-fasce">
            <span><i className="b-stimato" /> stimato</span>
            <span><i className="b-reale" /> arrivati davvero</span>
            <span style={{ color: MUTED }}>Sopra il 70% il modello è un po' ottimista: stima {pct(v.fasce[v.fasce.length - 1].stimato)}, arrivano {pct(v.fasce[v.fasce.length - 1].reale)}.</span>
          </div>

          <h4 className="verifica-titolo">Come si calcola, passo per passo</h4>
          <ol className="verifica-testo" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li><b>I partenti.</b> Ogni notte si leggono le corse in calendario con i partenti, il numero di partenza e il guidatore dichiarato.</li>
            <li><b>I dati di ogni cavallo, solo dal passato.</b> Per ciascuno si calcolano {v.peso_variabili?.length ?? 28} numeri con le sole corse prima di
              quel giorno: forma delle ultime cinque corse e dell'ultima, piazzamenti e vittorie in carriera, premi e corse dell'ultimo anno, miglior tempo
              e ultimo tempo, risultati sulla stessa pista, giorni dall'ultima corsa, età, sesso e rendimento del guidatore che lo guida in quella corsa.</li>
            <li><b>Il confronto con gli avversari.</b> Gli stessi numeri si mettono in fila fra i partenti della corsa: conta essere il migliore del gruppo,
              non avere un buon numero in assoluto. Contano anche il numero di partenza e quanti sono i partenti.</li>
            <li><b>Il modello.</b> Un insieme di {num(v.alberi ?? 0)} alberi di decisione (XGBoost), allenato su {num(v.periodo_allenamento.partenze)} partenze
              vere dal {v.periodo_allenamento.da.slice(0, 4)} al {v.periodo_allenamento.a.slice(0, 4)}, dà a ogni cavallo una stima grezza.</li>
            <li><b>I tre posti.</b> In una corsa i posti nei primi tre sono tre, quindi le stime si riportano in proporzione finché la loro somma fa 300%.
              Con tre partenti o meno la stima non serve.</li>
            <li><b>Le ragioni.</b> Accanto a ogni cavallo compaiono le due o tre voci in cui è più sopra o più sotto gli avversari, e il dettaglio
              di ogni corsa mostra i numeri veri.</li>
          </ol>

          <h4 className="verifica-titolo">Cosa pesa di più</h4>
          <p className="verifica-testo">Quanto conta ogni gruppo di dati nelle scelte del modello, in parti su cento.</p>
          <PesiRaggruppati pesi={v.peso_variabili ?? []} />
          <p className="verifica-testo" style={{ marginBottom: 0, marginTop: 10 }}>
            Il guidatore è quello dichiarato per la corsa; se non è ancora dichiarato, il modello non ne tiene conto. Per i cavalli con meno di cinque corse
            in archivio la stima è debole ed è segnata con «poche corse». Non entrano le quote delle scommesse, lo stato del cavallo il giorno della gara,
            il terreno e la distanza.
          </p>
        </div>
      )}
    </div>
  );
}
