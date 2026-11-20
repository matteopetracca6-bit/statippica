/**
 * Frasi di caricamento a tema ippico (20/11/2026).
 *
 * Al posto di "Caricamento..." e di "il sito si sta riaccendendo": una frase
 * scherzosa ogni 3 secondi, scelta a caso (mai la stessa due volte di fila),
 * con una barretta blu StatIppica che si riempie in 3 secondi. A barra piena
 * la frase svanisce e ne arriva un'altra, con la barra da capo.
 */
import { useEffect, useState } from "react";

export const FRASI_CARICAMENTO = [
  // Scuderia e box
  "Sto riempiendo i palotti di fioccato…",
  "Pulendo il box…",
  "Cambiando la lettiera di paglia…",
  "Rastrellando il truciolo…",
  "Riempiendo l'abbeveratoio…",
  "Sistemando il fieno nella rastrelliera…",
  "Spazzando il corridoio della scuderia…",
  "Chiudendo bene la porta del box…",
  "Contando le carote…",
  "Nascondendo le zollette di zucchero…",
  // Cura del cavallo
  "Strigliando il mantello…",
  "Passando la brusca…",
  "Pettinando la criniera…",
  "Intrecciando la coda…",
  "Mettendo la coperta…",
  "Fasciando gli stinchi…",
  "Ingrassando gli zoccoli…",
  "Aspettando il maniscalco…",
  "Lucidando i ferri…",
  "Il veterinario sta finendo la visita…",
  // Finimenti e sulky
  "Riverniciando il sulky…",
  "Gonfiando le ruote del sulky…",
  "Oliando i mozzi delle ruote…",
  "Regolando le stanghe…",
  "Allacciando i finimenti…",
  "Sistemando i paraocchi…",
  "Mettendo i paraglomi…",
  "Annodando le redini…",
  "Stringendo il sottopancia…",
  // Pista e corsa
  "Preparando il paddock…",
  "Livellando la pista…",
  "Bagnando la pista…",
  "Sgambando in pista…",
  "Facendo il giro di riscaldamento…",
  "Allineandoci dietro l'autostart…",
  "Aspettando il via dello starter…",
  "Tendendo i nastri…",
  "Prendendo la corda…",
  "Uscendo in terza ruota…",
  "Tirando la volata in retta d'arrivo…",
  "Tenendo il cavallo in mano…",
  "Cercando di non rompere…",
  "Guardando il fotofinish…",
  "In attesa del verdetto della giuria…",
  "Cronometrando il chilometro…",
  // Driver, allenatori e scommesse
  "Il driver si sta mettendo il casco…",
  "Indossando la casacca…",
  "L'allenatore dà le ultime istruzioni…",
  "Studiando il programma di corse…",
  "Leggendo le quote al totalizzatore…",
  "Ripassando le linee di sangue…",
  "Chiedendo un consiglio allo stalliere…",
  "Prendendo un caffè al bar dell'ippodromo…",
  // Allevamento
  "Controllando il pedigree…",
  "La fattrice sta allattando…",
  "Il puledro sta imparando a trottare…",
  "Svezzando i puledri…",
  "Domando lo yearling…",
  "Mettendo il primo filetto…",
];

const DURATA = 3000;
const SVANISCE = 350;

function aCaso(diversaDa?: number) {
  let i = Math.floor(Math.random() * FRASI_CARICAMENTO.length);
  if (i === diversaDa) i = (i + 1) % FRASI_CARICAMENTO.length;
  return i;
}

export default function FrasiCaricamento({ larghezza = 220 }: { larghezza?: number }) {
  const [indice, setIndice] = useState(() => aCaso());
  const [giro, setGiro] = useState(0);
  const [visibile, setVisibile] = useState(true);

  useEffect(() => {
    const svanisci = setTimeout(() => setVisibile(false), DURATA - SVANISCE);
    const cambia = setTimeout(() => {
      setIndice(i => aCaso(i));
      setGiro(g => g + 1);
      setVisibile(true);
    }, DURATA);
    return () => { clearTimeout(svanisci); clearTimeout(cambia); };
  }, [giro]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }} aria-live="polite">
      <style>{`
        @keyframes frasi-barra { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) { .frasi-barra-piena { animation: none !important; transform: scaleX(1) !important; } }
      `}</style>
      <div style={{
        fontSize: 13, color: "hsl(210 8% 62%)", letterSpacing: "0.02em", textAlign: "center",
        minHeight: 18, padding: "0 12px",
        opacity: visibile ? 1 : 0, transition: `opacity ${SVANISCE}ms ease`,
      }}>
        {FRASI_CARICAMENTO[indice]}
      </div>
      <div style={{
        width: larghezza, maxWidth: "70vw", height: 4, borderRadius: 2,
        background: "hsl(183 100% 38% / 0.15)", overflow: "hidden",
      }}>
        <div key={giro} className="frasi-barra-piena" style={{
          height: "100%", borderRadius: 2, background: "hsl(var(--primary))",
          transformOrigin: "left center",
          animation: `frasi-barra ${DURATA}ms linear forwards`,
        }} />
      </div>
    </div>
  );
}
