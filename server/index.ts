import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { existsSync, createReadStream, createWriteStream, statSync } from "node:fs";
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

async function assicuraArchivio(): Promise<void> {
  const aperto = path.resolve(process.cwd(), "data.db");
  const compresso = aperto + ".gz";

  if (archivioSembraBuono(aperto)) return;

  if (existsSync(aperto)) {
    // C'e' ma e' troppo piccolo: probabilmente e' il file vuoto che si crea
    // da solo quando qualcosa prova ad aprire un archivio che non esiste.
    // Tenerlo sarebbe peggio che non averlo: va rifatto.
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
