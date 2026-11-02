/**
 * Il marchio grande della home, animato (novembre 2026).
 *
 * Quattro effetti insieme:
 *  1) entrata al galoppo: all'apertura il cavallo arriva da sinistra con un
 *     salto e una scia di luce, poi la scritta compare da sinistra a destra;
 *  2) respiro: il cavallo sale e scende piano, l'alone dietro pulsa e ogni
 *     tanto un lampo di luce attraversa la scritta da solo;
 *  3) profondita': cavallo e scritta seguono il cursore (o l'inclinazione del
 *     telefono, dove il telefono la passa senza chiedere permessi) a
 *     velocita' diverse;
 *  4) pista di luce: sotto il logo una corda sottile percorsa da un puntino
 *     luminoso, mentre il cavallo sobbalza a ritmo.
 * Stili in index.css ("Marchio animato della home"). Chi ha chiesto meno
 * movimento al sistema vede il logo fermo.
 */
import { useEffect, useRef } from "react";
import scritta from "@assets/statippica-scritta.webp";
import cavallo from "@assets/statippica-cavallo.webp";

const RAPPORTO_SCRITTA = 2085 / 227;
const RAPPORTO_CAVALLO = 1363 / 1091;

export default function HeroMarchio({ altezza = 84, altezzaCavallo = 150 }: { altezza?: number; altezzaCavallo?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const zona = (el.closest(".hero-home") as HTMLElement | null) ?? el;
    let raf = 0;
    const imposta = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    const muovi = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const y = (e.clientY - (r.top + r.height / 2)) / Math.max(200, r.height);
      imposta(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    };
    const esci = () => imposta(0, 0);
    zona.addEventListener("pointermove", muovi);
    zona.addEventListener("pointerleave", esci);
    // Telefono: l'inclinazione, solo dove non serve chiedere il permesso.
    const D = (window as any).DeviceOrientationEvent;
    const inclina = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      imposta(Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 35)));
    };
    const usaInclinazione = D && typeof D.requestPermission !== "function";
    if (usaInclinazione) window.addEventListener("deviceorientation", inclina);
    return () => {
      cancelAnimationFrame(raf);
      zona.removeEventListener("pointermove", muovi);
      zona.removeEventListener("pointerleave", esci);
      if (usaInclinazione) window.removeEventListener("deviceorientation", inclina);
    };
  }, []);

  return (
    <div ref={ref} className="hm" role="img" aria-label="StatIppica" data-testid="marchio-home"
      style={{ ["--alt-scritta" as any]: `${altezza}px`, ["--alt-cavallo" as any]: `${altezzaCavallo}px` }}>
      <div className="hm-riga">
        <span className="hm-par hm-par-cavallo">
          <span className="hm-alone" aria-hidden="true" />
          <span className="hm-entra-cavallo">
            <span className="hm-scia" aria-hidden="true" />
            <span className="hm-respira">
              <img className="hm-cavallo" src={cavallo} alt=""
                width={Math.round(altezzaCavallo * RAPPORTO_CAVALLO)} height={altezzaCavallo} />
            </span>
          </span>
        </span>
        <span className="hm-par hm-par-scritta">
          <span className="hm-entra-scritta">
            <span className="marchio-scritta hm-scritta"
              style={{ width: `${Math.round(altezza * RAPPORTO_SCRITTA)}px`, aspectRatio: `${RAPPORTO_SCRITTA}`, ["--maschera" as any]: `url(${scritta})` }}>
              <img src={scritta} alt="" />
            </span>
          </span>
        </span>
      </div>
      <div className="hm-pista" aria-hidden="true"><span className="hm-punto" /></div>
    </div>
  );
}
