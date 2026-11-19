import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),

  // Indirizzi dei file RELATIVI, e deve restare cosi'.
  //
  // Il sito usa indirizzi con il cancelletto ("/#/stallion/VARENNE"), quindi
  // per il browser la pagina sta sempre nella radice e un indirizzo relativo
  // funziona in ogni caso. Serve invece per le anteprime, che vivono dentro una
  // sottocartella: con un indirizzo che parte dalla radice il programma non si
  // troverebbe.
  //
  // Nota per chi indaghera' un giorno su una pagina bianca: il 23/09/2026 ho
  // creduto di aver trovato qui un difetto, perche' aprendo
  // "/stallion/VARENNE" senza cancelletto si vedeva la home. Non e' un difetto:
  // quell'indirizzo non esiste, quello vero e' "/#/stallion/VARENNE". Prima di
  // cambiare questa riga, controllare come e' impostato il navigatore interno
  // in App.tsx.
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
