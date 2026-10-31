import { useState } from "react";
import { useRoute } from "wouter";
import BreedersPage from "./BreedersPage";
import StudFarmsPage from "./StudFarmsPage";
import { Warehouse, MapPin, Building2 } from "lucide-react";
import IntestazionePagina from "../components/IntestazionePagina";
import CollegamentiCorrelati from "../components/CollegamentiCorrelati";
import { CSS_DUE_COLONNE } from "../components/DueColonne";

/**
 * ALLEVAMENTO: UNA SOLA PAGINA, DUE ELENCHI.
 *
 *  - ALLEVATORI: chi ha materialmente allevato il cavallo (dato della seconda
 *    fonte, presente per quasi tutti i soggetti);
 *  - STAZIONI DI MONTA: i centri dove stanno gli stalloni, con la qualita'
 *    media della loro produzione.
 *
 * Tutte e due usano lo stesso impaginato: classifica a sinistra, scheda a
 * destra (sotto la riga, sul telefono). Gli indirizzi vecchi (/allevamenti,
 * /allevatori, /allevatore/NOME) aprono la linguetta giusta.
 */

type Tab = "allevatori" | "stazioni";
const COLORE = "hsl(20 70% 58%)";

export default function AllevamentoHubPage() {
  const [isFarms] = useRoute("/allevamenti");
  const [tab, setTab] = useState<Tab>(isFarms ? "stazioni" : "allevatori");

  const tabs: { key: Tab; label: string; hint: string; icon: any }[] = [
    { key: "allevatori", label: "Allevatori", hint: "Chi ha allevato i cavalli", icon: Warehouse },
    { key: "stazioni", label: "Stazioni di monta", hint: "Dove stanno gli stalloni", icon: MapPin },
  ];

  return (
    <div className="page-shell ed" style={{ ["--ed-acc" as any]: COLORE }}>
      <style>{CSS_DUE_COLONNE}</style>
      <IntestazionePagina icona={Building2} colore={COLORE} titolo="Allevatori e stazioni di monta" margineSotto={16}
        sottotitolo="Chi alleva i cavalli e dove stanno gli stalloni, con la qualità media di quello che producono.">
        Due elenchi nello stesso posto: gli allevatori, cioè chi ha materialmente allevato i
        cavalli, e le stazioni di monta, cioè i centri dove stanno gli stalloni. Tocca una riga per
        aprire la sua scheda. Il voto medio, in entrambi i casi, tiene conto solo dei cavalli che
        hanno già corso abbastanza da essere valutati: con pochi cavalli valutati è un numero
        fragile.
      </IntestazionePagina>

      <div className="ed-linguette" role="tablist">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} role="tab" className="ed-linguetta" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}>
              <Icon size={17} color={tab === t.key ? COLORE : "hsl(210 8% 50%)"} />
              <span><b>{t.label}</b><small>{t.hint}</small></span>
            </button>
          );
        })}
      </div>

      {tab === "allevatori" ? <BreedersPage embedded /> : <StudFarmsPage embedded />}

      <CollegamentiCorrelati voci={[
        { href: "/stalloni", titolo: "Catalogo stalloni", descrizione: "Tutti gli stalloni valutati, con tasse di monta e provenienza." },
        { href: "/fattrici", titolo: "Fattrici", descrizione: "Le fattrici valutate sui loro figli." },
        { href: "/advisor", titolo: "Advisor", descrizione: "Gli stalloni più adatti a una fattrice, con costi e consanguineità." },
      ]} />
    </div>
  );
}
