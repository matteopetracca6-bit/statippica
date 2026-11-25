/**
 * Linguette fra pagine sorelle (25/11/2026): Allevatori, Advisor e Metodo
 * erano due o tre schede separate nel menu; ora sono una pagina con le
 * linguette in cima. Ogni linguetta resta un suo indirizzo, cosi' i link
 * vecchi continuano a funzionare e il tasto indietro fa quello che ci si aspetta.
 */
import { Link, useLocation } from "wouter";
import { Building2, Medal, Sparkles, FlaskConical, BookMarked, Target, History } from "lucide-react";

type Voce = { href: string; label: string; hint: string; icon: any; anche?: RegExp };
const GRUPPI_LINGUETTE: Record<string, { nome: string; colore: string; voci: Voce[] }> = {
  allevatori: {
    nome: "Allevatori", colore: "hsl(318 52% 58%)",
    voci: [
      { href: "/allevamento", label: "Allevatori e stazioni", hint: "Chi alleva e dove stanno gli stalloni", icon: Building2, anche: /^\/(allevatori\/?$|allevatore\/)/ },
      { href: "/allevatori/classifiche", label: "Classifica allevatori", hint: "Gli allevamenti stagione per stagione", icon: Medal, anche: /^\/allevatori\/classific/ },
    ],
  },
  advisor: {
    nome: "Advisor", colore: "hsl(306 45% 67%)",
    voci: [
      { href: "/advisor", label: "Advisor", hint: "Scegli l'accoppiamento per una fattrice", icon: Sparkles },
      { href: "/validazione", label: "Quanto è affidabile", hint: "Il consiglio messo alla prova", icon: FlaskConical, anche: /^\/validazione/ },
    ],
  },
  metodo: {
    nome: "Metodo", colore: "hsl(40 40% 72%)",
    voci: [
      { href: "/metodo", label: "Metodo e dati", hint: "Da dove vengono i numeri e come si leggono", icon: BookMarked, anche: /^\/metodo(-e-dati)?\/?$/ },
      { href: "/metodo/pronostico", label: "Come si fa il pronostico", hint: "Corse, pesi di XGBoost e risultati", icon: Target, anche: /^\/(metodo\/pronostico|come-si-fa-il-pronostico)/ },
      { href: "/controllo", label: "Controllo a posteriori", hint: "Le stime rifatte nel passato", icon: History, anche: /^\/controllo/ },
    ],
  },
};

const CSS = `
.lg-barra { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.lg-voce { display: flex; align-items: center; gap: 10px; padding: 9px 13px; border-radius: 11px; text-decoration: none; color: inherit;
  background: hsl(220 12% 9%); border: 1px solid hsl(220 10% 16%); min-width: 0; }
.lg-voce b { display: block; font-size: 13px; color: hsl(210 10% 88%); }
.lg-voce small { display: block; font-size: 11px; color: hsl(210 8% 52%); margin-top: 1px; }
.lg-voce[aria-current="page"] { background: color-mix(in srgb, var(--lg-c) 12%, transparent); border-color: var(--lg-c); }
.lg-voce[aria-current="page"] b { color: var(--lg-c); }
@media (max-width: 640px) { .lg-voce { flex: 1 1 150px; } .lg-voce small { display: none; } }
`;

export default function LinguetteGruppo({ gruppo }: { gruppo: keyof typeof GRUPPI_LINGUETTE }) {
  const [percorso] = useLocation();
  const g = GRUPPI_LINGUETTE[gruppo];
  const p = percorso.split("?")[0];
  const attiva = g.voci.find(v => p === v.href || v.anche?.test(p))?.href ?? g.voci[0].href;
  return (
    <nav className="lg-barra" aria-label={g.nome} style={{ ["--lg-c" as any]: g.colore }} data-testid={`linguette-${gruppo}`}>
      <style>{CSS}</style>
      {g.voci.map(v => {
        const Icona = v.icon;
        const si = v.href === attiva;
        return (
          <Link key={v.href} href={v.href} className="lg-voce" aria-current={si ? "page" : undefined}>
            <Icona size={17} color={si ? g.colore : "hsl(210 8% 50%)"} style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}><b>{v.label}</b><small>{v.hint}</small></span>
          </Link>
        );
      })}
    </nav>
  );
}
