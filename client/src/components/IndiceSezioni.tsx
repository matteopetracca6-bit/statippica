/**
 * Indice in cima alle pagine lunghe: una fila di pulsanti che porta alle
 * sezioni. Mostra solo le sezioni che ci sono davvero (alcune compaiono solo
 * per certi cavalli, o dopo che i dati sono arrivati) e resta in vista
 * mentre si scorre.
 */
import { useEffect, useState } from "react";

export interface Voce { id: string; testo: string }

export default function IndiceSezioni({ voci }: { voci: Voce[] }) {
  const [presenti, setPresenti] = useState<Voce[]>([]);
  const [attiva, setAttiva] = useState<string | null>(null);

  useEffect(() => {
    // Le sezioni arrivano in tempi diversi: si ricontrolla quando la pagina cambia.
    const aggiorna = () => {
      const ora = voci.filter(v => { const el = document.getElementById(v.id); return !!el && el.childElementCount > 0; });
      setPresenti(p => (p.map(x => x.id).join() === ora.map(x => x.id).join() ? p : ora));
    };
    aggiorna();
    const mo = new MutationObserver(aggiorna);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [voci.map(v => v.id).join()]);

  useEffect(() => {
    if (!presenti.length) return;
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setAttiva(vis.target.id);
    }, { rootMargin: "-20% 0px -70% 0px" });
    presenti.forEach(v => { const el = document.getElementById(v.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [presenti]);

  if (presenti.length < 3) return null;
  return (
    <nav className="indice-sezioni" aria-label="Sezioni della pagina">
      {presenti.map(v => (
        <button key={v.id} className={attiva === v.id ? "attiva" : ""}
                onClick={() => document.getElementById(v.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          {v.testo}
        </button>
      ))}
    </nav>
  );
}
