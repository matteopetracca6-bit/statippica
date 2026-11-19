import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // I file in /assets hanno nel nome un'impronta del contenuto: se cambiano,
  // cambia il nome. Si possono quindi tenere nel browser per un anno, e chi
  // torna sul sito non li riscarica. La pagina principale invece va sempre
  // chiesta di nuovo, perche' e' lei a dire quali file usare.
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "365d",
    immutable: true,
  }));
  // Un file di /assets che non c'e' (per esempio chiesto da una scheda aperta
  // prima di un aggiornamento) risponde "non trovato", non con la pagina.
  app.use("/assets", (_req, res) => { res.status(404).end(); });
  app.use(express.static(distPath, {
    setHeaders: (res, file) => {
      if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
