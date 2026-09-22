import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { existsSync, createReadStream, createWriteStream, statSync,
         readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// L'archivio NON sta dentro il progetto: lo scarica il sito, prima di
// accettare richieste.
//
// Perche' fuori da git: ogni versione nuova si sommava alle precedenti per
// sempre, 30 MB a notte che non si potevano piu' togliere (477 MB in tre
// mesi). Ora sta in un rilascio, dove la copia nuova sostituisce la vecchia.
//
// PERCHE' IL CONTROLLO STA QUI E NON NEL COMANDO DI PUBBLICAZIONE. Il servizio
// su Render e' stato creato a mano, quindi render.yaml NON viene letto: il
// comando vero sta nel pannello di Render, e cambiarlo nel progetto non ha
// effetto. E' cosi' che il sito e' finito a rispondere "unable to open
// database file" a ogni richiesta pur avendo la configurazione giusta scritta
// nel progetto.
//
// Questo codice invece arriva dal progetto, quindi comanda davvero: qualunque
// cosa dica il pannello, il sito si procura l'archivio prima di partire. Copre
// anche gli spegnimenti del piano gratuito, dove il file puo' sparire.
const INDIRIZZO_ARCHIVIO =
  "https://github.com/matteopetracca6-bit/statippica/releases/download/archivio/data.db.gz";
const BYTE_MINIMI_APERTO = 90_000_000; // un archivio vero da aperto sta sopra i 100 MB

function archivioSembraBuono(percorso: string): boolean {
  try {
    return statSync(percorso).size >= BYTE_MINIMI_APERTO;
  } catch {
    return false;
  }
}

// Accanto all'archivio teniamo un bigliettino con la "targa" della copia
// scaricata (l'ETag che GitHub assegna al file). Serve per accorgersi che ne
// e' stata pubblicata una nuova.
function targaSalvata(percorso: string): string | null {
  try {
    return readFileSync(percorso + ".targa", "utf8").trim() || null;
  } catch {
    return null;
  }
}

async function targaPubblicata(): Promise<string | null> {
  try {
    const r = await fetch(INDIRIZZO_ARCHIVIO, { method: "HEAD", redirect: "follow" });
    return r.headers.get("etag") || r.headers.get("last-modified");
  } catch {
    return null;
  }
}

async function assicuraArchivio(): Promise<void> {
  const aperto = path.resolve(process.cwd(), "data.db");
  const compresso = aperto + ".gz";

  if (archivioSembraBuono(aperto)) {
    // C'e' un archivio buono, ma e' quello aggiornato?
    //
    // PERCHE' SERVE QUESTO CONTROLLO. Il servizio su Render e' stato creato a
    // mano, quindi il comando di pubblicazione vero sta nel suo pannello e non
    // in render.yaml. Quel comando cerca ancora una copia dell'archivio dentro
    // il progetto, dove non c'e' piu': le ripubblicazioni falliscono, il
    // contenitore in funzione resta quello vecchio, e un archivio corretto
    // pubblicato oggi non arriverebbe mai al sito.
    //
    // Senza questo controllo il sito si procurava l'archivio solo quando gli
    // MANCAVA. Bastava che ne avesse uno, anche di giorni prima, per tenerselo.
    // Ora a ogni avvio confronta la "targa" della sua copia con quella
    // pubblicata: se non coincidono, riscarica. I risvegli sono frequenti
    // (il piano gratuito si spegne dopo un quarto d'ora di inattivita'),
    // quindi il sito si rimette in pari da solo nel giro di poco.
    const mia = targaSalvata(aperto);
    const sua = await targaPubblicata();

    if (!sua) {
      // Non si riesce a leggere la targa pubblicata: si tiene la copia che
      // c'e'. Meglio un archivio di ieri che un sito senza dati.
      return;
    }

    // ATTENZIONE, QUI C'ERA UN ERRORE MIO. La prima versione di questo
    // controllo, scritta il 22/09, diceva "se non ho la targa, va bene
    // cosi'". Sembra prudente ed e' il contrario: l'archivio senza targa
    // accanto e' proprio quello scaricato dalla versione PRECEDENTE del
    // programma, cioe' esattamente il caso per cui questo controllo esiste.
    // Il risultato era che il contenitore in funzione si teneva il suo
    // archivio vecchio per sempre, e il controllo non scattava mai: l'ho
    // scoperto perche' un archivio pubblicato non arrivava al sito.
    //
    // Nessuna targa significa "non so cosa ho in mano", e non so' non e'
    // "va bene": si riscarica una volta e da quel momento la targa c'e'.
    if (!mia) {
      console.log("[ARCHIVIO] Non so da quando e' questo archivio: lo riprendo.");
    } else if (mia === sua) {
      return; // le targhe coincidono: la copia e' quella giusta
    } else {
      console.log("[ARCHIVIO] E' stato pubblicato un archivio piu' recente.");
    }
  }

  if (existsSync(aperto) && !archivioSembraBuono(aperto)) {
    // C'e' ma e' troppo piccolo: probabilmente e' il file vuoto che si crea
    // da solo quando qualcosa prova ad aprire un archivio che non esiste.
    // Tenerlo sarebbe peggio che non averlo: va rifatto.
    //
    // La condizione ripete il controllo perche' qui si arriva per due strade:
    // archivio mancante o rovinato, oppure archivio buono ma superato. Nel
    // secondo caso questo avviso sarebbe falso, e un messaggio sbagliato nel
    // registro manda fuori strada chi cerchera' un guasto fra sei mesi.
    console.warn("[ARCHIVIO] data.db c'e' ma e' troppo piccolo: lo rifaccio.");
  }

  // 1) Se per qualche motivo c'e' una copia compressa qui, usala: e' piu'
  //    veloce che scaricare.
  if (existsSync(compresso)) {
    console.log("[ARCHIVIO] Riapro la copia compressa presente...");
    try {
      await pipeline(createReadStream(compresso), createGunzip(), createWriteStream(aperto));
      if (archivioSembraBuono(aperto)) {
        console.log(
          `[ARCHIVIO] Pronto: ${(statSync(aperto).size / 1048576).toFixed(1)} MB`,
        );
        return;
      }
      console.warn("[ARCHIVIO] La copia presente non va bene: provo a scaricarlo.");
    } catch (e) {
      console.warn("[ARCHIVIO] La copia presente non si apre: provo a scaricarlo.", e);
    }
  }

  // 2) La strada normale: scaricarlo dal rilascio e riaprirlo mentre arriva,
  //    senza tenerlo tutto in memoria (il piano gratuito ha 512 MB).
  console.log(`[ARCHIVIO] Scarico l'archivio da ${INDIRIZZO_ARCHIVIO}`);
  const inizio = Date.now();
  try {
    const risposta = await fetch(INDIRIZZO_ARCHIVIO, { redirect: "follow" });
    if (!risposta.ok || !risposta.body) {
      throw new Error(`risposta ${risposta.status}`);
    }
    await pipeline(
      // @ts-expect-error il corpo della risposta e' uno stream leggibile
      risposta.body,
      createGunzip(),
      createWriteStream(aperto),
    );
  } catch (e) {
    console.error(
      "[ARCHIVIO] Scaricamento non riuscito. Il sito non ha dati da mostrare.",
      e,
    );
    return;
  }

  if (!archivioSembraBuono(aperto)) {
    console.error(
      "[ARCHIVIO] Quello scaricato e' troppo piccolo per essere l'archivio vero.",
    );
    return;
  }

  // Annotare la targa della copia appena presa: al prossimo avvio serve per
  // capire se nel frattempo ne e' uscita una nuova.
  try {
    const t = await targaPubblicata();
    if (t) writeFileSync(aperto + ".targa", t, "utf8");
  } catch {
    /* se non riesce, al prossimo avvio riscarichera': nessun danno */
  }

  console.log(
    `[ARCHIVIO] Pronto: ${(statSync(aperto).size / 1048576).toFixed(1)} MB ` +
      `in ${((Date.now() - inizio) / 1000).toFixed(1)}s`,
  );
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Prima di tutto: senza archivio il sito non ha niente da mostrare.
  await assicuraArchivio();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Keep-alive: ping self every 2 minutes to prevent sandbox idle shutdown
      if (process.env.NODE_ENV === "production") {
        setInterval(() => {
          const http = require("http");
          http.get(`http://127.0.0.1:${port}/api/stats`, (res: any) => {
            res.resume();
          }).on("error", () => {});
        }, 2 * 60 * 1000);
      }
    },
  );
})();
