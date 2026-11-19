import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { attivaPuntoMigliaia } from "../shared/migliaia";
attivaPuntoMigliaia();
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { existsSync, createReadStream, createWriteStream, statSync,
         readFileSync, writeFileSync, renameSync, rmSync, openSync, readSync, closeSync } from "node:fs";
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

  // 2) La strada normale: scaricarlo dal rilascio.
  await scaricaArchivio(aperto);
}

const attesa = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Vero se il file comincia con la firma di un archivio SQLite. */
function eUnArchivio(percorso: string): boolean {
  try {
    const fd = openSync(percorso, "r");
    const buf = Buffer.alloc(16);
    readSync(fd, buf, 0, 16, 0);
    closeSync(fd);
    return buf.toString("latin1").startsWith("SQLite format 3");
  } catch {
    return false;
  }
}

/**
 * Scarica l'archivio pubblicato e lo mette al posto di quello in uso.
 *
 * PERCHE' COSI'. Il 26/09 il sito rispondeva "unable to open database file" a
 * ogni richiesta pur con un archivio pubblicato sano. Al riavvio lo
 * scaricamento era fallito una volta sola (un intoppo di rete con GitHub), e
 * il vecchio codice si arrendeva al primo tentativo: il sito partiva senza
 * dati e restava cosi' fino al riavvio successivo, cioe' per ore.
 *
 * Ora:
 *  - si riprova fino a cinque volte, aspettando sempre di piu' fra un
 *    tentativo e l'altro;
 *  - si scarica in un file a parte e lo si sostituisce solo quando e'
 *    completo e controllato. Uno scaricamento interrotto non rovina piu'
 *    l'archivio che il sito sta usando;
 *  - anche a sito acceso, ogni venti minuti si controlla se l'archivio manca
 *    o se ne e' uscito uno nuovo (vedi sotto, dopo l'avvio).
 *
 * Il cambio e' sicuro anche con il sito in funzione: ogni richiesta apre
 * l'archivio da capo, quindi quelle gia' partite finiscono sul vecchio file e
 * le successive trovano il nuovo.
 */
async function scaricaArchivio(aperto: string): Promise<boolean> {
  const provvisorio = aperto + ".nuovo";
  // L'ultimo tentativo va sulla SCORTA, la copia pubblicata prima di quella
  // attuale (la mette da parte ogni lavoro prima di pubblicare, solo se e'
  // buona). Il 28/09 la copia principale era un file vuoto: con la scorta il
  // sito sarebbe rimasto su, con i dati del giorno prima.
  const SCORTA = INDIRIZZO_ARCHIVIO.replace(/data\.db\.gz$/, "data.db.precedente.gz");
  const pause = [0, 5_000, 15_000, 45_000, 90_000, 0];
  for (let i = 0; i < pause.length; i++) {
    if (pause[i]) await attesa(pause[i]);
    const inizio = Date.now();
    const daScorta = i === pause.length - 1;
    const indirizzo = daScorta ? SCORTA : INDIRIZZO_ARCHIVIO;
    console.log(`[ARCHIVIO] Scarico ${daScorta ? "la scorta" : "l'archivio"} (tentativo ${i + 1} di ${pause.length})`);
    try {
      // Anche usando la scorta si salva la targa della copia principale:
      // cosi' si riprova la principale appena ne esce una nuova, e non a
      // ogni controllo.
      const targa = await targaPubblicata();
      const risposta = await fetch(indirizzo, { redirect: "follow", signal: AbortSignal.timeout(5 * 60_000) });
      if (!risposta.ok || !risposta.body) throw new Error(`risposta ${risposta.status}`);
      await pipeline(
        // @ts-expect-error il corpo della risposta e' uno stream leggibile
        risposta.body,
        createGunzip(),
        createWriteStream(provvisorio),
      );
      if (!archivioSembraBuono(provvisorio) || !eUnArchivio(provvisorio)) {
        throw new Error("il file scaricato non e' un archivio completo");
      }
      renameSync(provvisorio, aperto);
      if (targa) writeFileSync(aperto + ".targa", targa, "utf8");
      console.log(
        `[ARCHIVIO] Pronto: ${(statSync(aperto).size / 1048576).toFixed(1)} MB ` +
          `in ${((Date.now() - inizio) / 1000).toFixed(1)}s`,
      );
      return true;
    } catch (e) {
      console.warn(`[ARCHIVIO] Tentativo ${i + 1} non riuscito:`, (e as Error)?.message ?? e);
      try { rmSync(provvisorio, { force: true }); } catch { /* niente */ }
    }
  }
  console.error("[ARCHIVIO] Scaricamento non riuscito dopo tutti i tentativi: riprovo fra venti minuti.");
  return false;
}

/**
 * Controllo a sito acceso, ogni venti minuti: se l'archivio manca lo
 * riprende, se ne e' uscito uno piu' nuovo lo sostituisce. Cosi' un intoppo
 * all'avvio si ripara da solo e l'aggiornamento notturno arriva al sito anche
 * se nessuno lo riavvia.
 */
let controlloInCorso = false;
async function controllaArchivio(): Promise<void> {
  if (controlloInCorso) return;
  controlloInCorso = true;
  try {
    const aperto = path.resolve(process.cwd(), "data.db");
    if (!archivioSembraBuono(aperto)) {
      console.warn("[ARCHIVIO] Il sito e' senza archivio: lo riprendo.");
      await scaricaArchivio(aperto);
      return;
    }
    const sua = await targaPubblicata();
    if (sua && sua !== targaSalvata(aperto)) {
      console.log("[ARCHIVIO] E' uscito un archivio piu' recente: lo sostituisco.");
      await scaricaArchivio(aperto);
    }
  } finally {
    controlloInCorso = false;
  }
}

const app = express();
const httpServer = createServer(app);

// ── Avvio veloce ─────────────────────────────────────────────────────────
// PERCHE'. Il piano gratuito addormenta il sito dopo un quarto d'ora senza
// visite. Al risveglio il vecchio codice NON rispondeva a nessuno finche' non
// aveva controllato l'archivio con GitHub e, se mancava, scaricato e aperto
// 30 MB compressi: chi apriva il sito vedeva solo una pagina bianca che
// girava. Ora il sito risponde subito:
//  - con un archivio buono gia' presente parte subito, e il controllo
//    "ce n'e' uno piu' nuovo?" si fa dopo, a sito acceso (il cambio di
//    archivio a sito acceso e' sicuro, vedi scaricaArchivio);
//  - senza archivio mostra una pagina "sto preparando i dati" che si
//    ricarica da sola, invece di lasciare il visitatore davanti al nulla.
let sitoPronto = false;
const PAGINA_ATTESA = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>StatIppica · un attimo</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0d1014;color:#d7dde4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;padding:24px}
.c{max-width:420px}.t{font-size:22px;font-weight:800;color:#3fd6dc;letter-spacing:.04em;margin-bottom:10px}
.r{width:34px;height:34px;border:3px solid #22303a;border-top-color:#3fd6dc;border-radius:50%;
margin:18px auto;animation:g 1s linear infinite}@keyframes g{to{transform:rotate(360deg)}}
p{font-size:14px;line-height:1.6;color:#9aa6b2;margin:0}</style></head>
<body><div class="c"><div class="t">STATIPPICA</div><div class="r"></div>
<p>Sto preparando l'archivio delle corse.<br>La pagina si apre da sola fra pochi secondi.</p></div></body></html>`;
app.use((req, res, next) => {
  if (sitoPronto) return next();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", "5");
  if (req.path.startsWith("/api")) {
    return res.status(503).json({ preparazione: true, messaggio: "Sto preparando l'archivio, riprova fra pochi secondi." });
  }
  return res.status(503).type("html").send(PAGINA_ATTESA);
});

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
  const port = parseInt(process.env.PORT || "5000", 10);
  const produzione = process.env.NODE_ENV === "production";

  // Si risponde subito: finche' i dati non sono pronti, con la pagina di attesa.
  await new Promise<void>(ok => httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
    ok();
  }));

  // Senza archivio il sito non ha niente da mostrare: in quel caso si aspetta.
  // Con un archivio buono si parte subito e il confronto con quello pubblicato
  // si fa appena acceso, senza far aspettare nessuno.
  const aperto = path.resolve(process.cwd(), "data.db");
  const archivioPresente = archivioSembraBuono(aperto) && targaSalvata(aperto) !== null;
  if (!archivioPresente) {
    await assicuraArchivio();
  }

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
  if (produzione) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  sitoPronto = true;
  log("sito pronto");

  if (produzione) {
    if (archivioPresente) controllaArchivio().catch(() => {});
    setInterval(() => { controllaArchivio().catch(() => {}); }, 20 * 60 * 1000);
  }
})();
