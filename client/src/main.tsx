import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { attivaPuntoMigliaia } from "@shared/migliaia";

attivaPuntoMigliaia();

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
