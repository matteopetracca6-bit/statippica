/**
 * Caricamento e stato di errore, con la spiegazione dell'attesa lunga.
 *
 * PERCHE' ESISTE. Il sito sta su un piano gratuito che spegne il servizio
 * quando nessuno lo usa. Al primo accesso dopo una pausa il servizio si deve
 * riaccendere e riscaricare l'archivio: la prima richiesta puo' fallire e
 * quelle dopo possono prendersi mezzo minuto. Misurato: 35 secondi con la
 * scritta "Carico..." ferma sullo schermo, senza nessuna spiegazione. Chi
 * arriva in quel momento pensa che il sito sia rotto e se ne va.
 *
 * Quindi dopo sei secondi compare il motivo, e dopo venti si dice che ci vuole
 * ancora un po'. L'attesa non si accorcia, ma smette di sembrare un guasto.
 *
 * SERVE ANCHE A NON DIRE UNA BUGIA. Prima, se la richiesta andava in errore, la
 * pagina mostrava "questi dati non sono ancora stati calcolati": una frase
 * sbagliata, perche' i dati c'erano e il problema era la connessione. Errore e
 * dato mancante sono due cose diverse e vanno dette diversamente.
 */

import CavalloCaricamento from "./CavalloCaricamento";

const MUTED = "hsl(210 8% 55%)";

export function Caricamento({ testo }: { testo: string }) {
  // 20/11/2026: niente piu' "il sito si sta riaccendendo": durante l'attesa
  // girano le frasi ippiche di CavalloCaricamento, una ogni 3 secondi.
  return (
    <div style={{ padding: "30px 20px 60px", textAlign: "center" }}>
      <CavalloCaricamento label={testo} />
    </div>
  );
}

export function ErroreCaricamento({
  titolo,
  cosa,
}: {
  titolo: string;
  /** Di che dato si tratta, per la frase: "...gli ippodromi". */
  cosa: string;
}) {
  return (
    <div style={{ maxWidth: "620px", margin: "50px auto", padding: "0 20px", textAlign: "center" }}>
      <h1 style={{ fontSize: "20px", color: "hsl(210 10% 88%)", margin: "0 0 10px" }}>{titolo}</h1>
      <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.7 }}>
        Non sono riuscito a prendere {cosa}. Il sito sta su un piano gratuito e si
        spegne quando nessuno lo usa: capita che la prima richiesta dopo una pausa
        non vada a buon fine. I dati ci sono, e' solo la connessione.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "14px", padding: "9px 18px", fontSize: "13px", fontWeight: 600,
          background: "hsl(183 100% 38% / 0.16)", border: "1px solid hsl(183 100% 38% / 0.5)",
          borderRadius: "8px", color: "hsl(183 75% 62%)", cursor: "pointer",
        }}
      >
        Riprova
      </button>
    </div>
  );
}
