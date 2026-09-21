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

// L'archivio viaggia in git compresso, perche' da aperto supera i 100 MB che
// GitHub accetta per un singolo file. Normalmente lo riapre il comando di
// installazione, ma se quel passaggio manca o cambia, il sito parte senza
// archivio e ogni pagina risponde "unable to open database file" — e' gia'
// successo una volta. Questa e' la rete di sicurezza: se il file aperto non
// c'e' e quello compresso si', lo apriamo qui prima di accettare richieste.
async function assicuraArchivio(): Promise<void> {
  const aperto = path.resolve(process.cwd(), "data.db");
  const compresso = aperto + ".gz";
  if (existsSync(aperto)) return;
  if (!existsSync(compresso)) {
    console.error(
      "[ARCHIVIO] Manca sia data.db sia data.db.gz in " + process.cwd() +
      ". Il sito non ha dati da mostrare.",
    );
    return;
  }
  console.log("[ARCHIVIO] data.db assente: lo riapro da data.db.gz...");
  const inizio = Date.now();
  await pipeline(createReadStream(compresso), createGunzip(), createWriteStream(aperto));
  const mb = statSync(aperto).size / 1048576;
  console.log(
    `[ARCHIVIO] Riaperto: ${mb.toFixed(1)} MB in ${((Date.now() - inizio) / 1000).toFixed(1)}s`,
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
