import { useState } from "react";
import { useRoute } from "wouter";
import BreedersPage from "./BreedersPage";
import StudFarmsPage from "./StudFarmsPage";
import { Warehouse, MapPin } from "lucide-react";

/**
 * ALLEVAMENTO: UNA SOLA SCHEDA, DUE ELENCHI.
 *
 * Prima dalla home si entrava da due parti diverse, "Allevamenti" e
 * "Allevatori", e la differenza non era per niente evidente. Ora si entra da
 * un punto solo e si sceglie con due linguette:
 *
 *  - ALLEVATORI: chi ha materialmente allevato il cavallo (dato della seconda
 *    fonte, presente per quasi tutti i soggetti);
 *  - STAZIONI DI MONTA: i centri dove stanno gli stalloni, con la qualita'
 *    media della loro produzione.
 *
 * Le due pagine restano raggiungibili anche ai vecchi indirizzi: qui vengono
 * semplicemente mostrate senza la loro intestazione, perche' il titolo lo
 * mette questa pagina.
 */

type Tab = "allevatori" | "allevamenti";

export default function AllevamentoHubPage() {
  // Chi arriva dal vecchio indirizzo delle stazioni di monta trova gia'
  // aperta la linguetta giusta.
  const [isFarms] = useRoute("/allevamenti");
  const [tab, setTab] = useState<Tab>(isFarms ? "allevamenti" : "allevatori");

  const tabs: { key: Tab; label: string; hint: string; icon: any }[] = [
    { key: "allevatori", label: "Allevatori", hint: "Chi ha allevato i cavalli", icon: Warehouse },
    { key: "allevamenti", label: "Stazioni di monta", hint: "Dove stanno gli stalloni", icon: MapPin },
  ];

  return (
    <div className="page-shell">
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "hsl(210 10% 94%)", margin: "0 0 6px" }}>
        Allevamento
      </h1>
      <p style={{ fontSize: "13px", color: "hsl(210 8% 60%)", margin: "0 0 18px", maxWidth: "840px", lineHeight: 1.55 }}>
        Due elenchi diversi nello stesso posto: gli allevatori, cioè chi ha materialmente allevato
        i cavalli, e le stazioni di monta, cioè i centri dove stanno gli stalloni. Il voto medio,
        in entrambi i casi, tiene conto solo dei cavalli che hanno già corso abbastanza da essere
        valutati.
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "22px", flexWrap: "wrap" }}>
        {tabs.map(t => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 16px", borderRadius: "10px", cursor: "pointer",
                textAlign: "left",
                background: active ? "hsl(183 100% 45% / 0.12)" : "hsl(220 14% 11%)",
                border: `1px solid ${active ? "hsl(183 100% 45%)" : "hsl(220 12% 20%)"}`,
                transition: "all .15s",
              }}
            >
              <Icon size={16} color={active ? "hsl(183 80% 62%)" : "hsl(210 8% 50%)"} />
              <span>
                <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: active ? "hsl(183 80% 70%)" : "hsl(210 10% 82%)" }}>
                  {t.label}
                </span>
                <span style={{ display: "block", fontSize: "11px", color: "hsl(210 8% 48%)" }}>{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {tab === "allevatori" ? <BreedersPage embedded /> : <StudFarmsPage embedded />}
    </div>
  );
}
