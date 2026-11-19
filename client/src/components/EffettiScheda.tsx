/**
 * Effetti delle schede della home (novembre 2026): la luce che segue il
 * cursore e il contorno che si disegna. Gli stili sono in index.css
 * (cerca "Animazioni delle schede della home"); qui ci sono solo gli
 * elementi da mettere come PRIMO figlio della scheda e la funzione che
 * passa la posizione del cursore.
 */
import type React from "react";

/** Da collegare a onPointerMove della scheda: la luce va dove sta il cursore (o il dito). */
export function muoviLuce(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export default function EffettiScheda({ raggio }: { raggio: number }) {
  return (
    <span className="effetti-scheda" aria-hidden="true">
      <span className="effetto-riempimento" />
      <span className="effetto-luce" />
      <span className="effetto-luce-bordo" />
      <svg className="effetto-contorno" preserveAspectRatio="none">
        <rect x="0" y="0" width="100%" height="100%" rx={raggio} ry={raggio} pathLength={100} />
      </svg>
    </span>
  );
}
