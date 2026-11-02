/**
 * Sezione della scheda del cavallo che si apre e si chiude con un clic
 * (novembre 2026, scheda compattata). Da chiusa mostra titolo e una riga di
 * riassunto; il contenuto viene caricato solo alla prima apertura, cosi' la
 * pagina parte leggera. La scelta (aperta o chiusa) resta ricordata nel
 * browser per ogni sezione.
 *
 * ListaCorta: mostra le prime 5 righe di un elenco e un pulsante
 * "Mostra tutte" per le altre.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const CHIAVE = (id: string) => `scheda-cavallo-sezione-${id}`;
const daComputer = () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 1180px)").matches;

export default function SezioneScheda({ id, titolo, riassunto, apertaDaComputer = false, children }: {
  id: string; titolo: string; riassunto?: ReactNode; apertaDaComputer?: boolean; children: ReactNode;
}) {
  const [aperta, setAperta] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(CHIAVE(id));
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* niente memoria: si usa la scelta di partenza */ }
    return apertaDaComputer && !!daComputer();
  });
  const [vista, setVista] = useState(aperta);
  const cambia = () => {
    const ora = !aperta;
    setAperta(ora);
    if (ora) setVista(true);
    try { localStorage.setItem(CHIAVE(id), ora ? "1" : "0"); } catch { /* pazienza */ }
  };
  return (
    <section id={`sez-${id}`} className={`sez-scheda${aperta ? " aperta" : ""}`}>
      <button type="button" className="sez-testa" onClick={cambia} aria-expanded={aperta} aria-controls={`sez-${id}-corpo`}>
        <span className="sez-testi">
          <span className="sez-titolo">{titolo}</span>
          {riassunto && <span className="sez-riassunto">{riassunto}</span>}
        </span>
        <span className="sez-azione">{aperta ? "Chiudi" : "Apri"}<ChevronDown size={16} className="sez-freccia" /></span>
      </button>
      {vista && (
        <div id={`sez-${id}-corpo`} className="sez-corpo" hidden={!aperta}>
          {children}
        </div>
      )}
    </section>
  );
}

export function ListaCorta({ quante, primi = 5, children }: { quante: number; primi?: number; children: ReactNode }) {
  const [tutte, setTutte] = useState(false);
  if (quante <= primi) return <>{children}</>;
  return (
    <div className={tutte ? "lista-corta" : "lista-corta chiusa"} style={{ ["--primi" as any]: primi }}>
      {children}
      <button type="button" className="lista-altre" onClick={() => setTutte(t => !t)}>
        {tutte ? "Mostra meno" : `Mostra tutte (${quante})`}
      </button>
    </div>
  );
}
