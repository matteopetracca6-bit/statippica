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
        <span>Come è stato provato il pronostico</span>
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

          <h4 className="verifica-titolo">Cosa pesa di più</h4>
          <p className="verifica-testo" style={{ marginBottom: 0 }}>
            Più di tutto conta il confronto con gli avversari della stessa corsa (piazzamenti, forma, tempi e premi), poi quanti sono i partenti,
            come è andata l'ultima corsa e il numero di partenza. Il guidatore pesa meno, anche perché nel calendario non è indicato e si usa
            quello dell'ultima corsa. Per i cavalli con meno di cinque corse in archivio la stima è debole ed è segnata con «poche corse».
          </p>
        </div>
      )}
    </div>
  );
}
