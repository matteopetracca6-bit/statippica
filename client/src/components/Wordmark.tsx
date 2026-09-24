/**
 * Il nome del sito, scritto sempre allo stesso modo ovunque compaia.
 *
 * Le lettere sono disegnate a mano in SVG in stile fantascienza, alla maniera
 * delle scritte di Star Wars: tratti larghi e squadrati, A a punta senza
 * traversa. Non si usa il carattere originale dei film perche' non e' libero
 * per un sito pubblico; disegnare le dieci lettere che servono pesa meno di un
 * font e resta nitido a qualunque dimensione.
 *
 * Lettere bianche con contorno nero sottile. Il contorno e' fatto con un filtro
 * che allarga la forma e la dipinge di nero sotto le lettere, cosi' circonda
 * anche i terminali dei tratti. Al passaggio del cursore ogni lettera, da sola,
 * si colora dell'azzurro del sito.
 */

import { useId } from "react";

type Props = {
  /** Altezza delle lettere in pixel. Il logo si adegua di conseguenza. */
  size?: number;
  /** Mostra il logo alla sinistra del nome. */
  withLogo?: boolean;
  /** Sorgente del logo (i due punti del sito lo importano in modi diversi). */
  logoSrc?: string;
  /** Dimensione del logo; se assente viene calcolata dal testo. */
  logoSize?: number;
  /** Conservato per compatibilita': lo spessore ora dipende dalla dimensione. */
  weight?: number;
};


// Ogni lettera e' disegnata su un'altezza di 100, con tratti spessi 18 e
// terminali tagliati netti, nello stile delle scritte dei film di fantascienza
// (la A a punta senza traversa, la S squadrata con gli angoli appena smussati).
// "linea" si disegna col tratto, "pieno" si riempie: la A e' una forma piena
// perche' le sue gambe oblique devono finire in piano sulla riga di base.
type Lettera = { w: number; linea?: string; pieno?: string };

const TRATTO = 18;
const S: Lettera = { w: 64, linea: "M64 9 H18 Q9 9 9 18 V41 Q9 50 18 50 H46 Q55 50 55 59 V82 Q55 91 46 91 H0" };
const T: Lettera = { w: 66, linea: "M0 9 H66 M33 18 V100" };
const A: Lettera = { w: 76, pieno: "M0 100 L30 0 H46 L76 100 H56 L38 36 L20 100 Z" };
const I: Lettera = { w: 18, linea: "M9 0 V100" };
const P: Lettera = { w: 58, linea: "M9 100 V9 H40 Q49 9 49 18 V43 Q49 52 40 52 H18" };
const C: Lettera = { w: 60, linea: "M60 9 H18 Q9 9 9 18 V82 Q9 91 18 91 H60" };

const PAROLA = [S, T, A, T, I, P, P, I, C, A];
const SPAZIO = 13;

function disponi() {
  let x = 0;
  const pezzi = PAROLA.map(l => {
    const p = { ...l, x };
    x += l.w + SPAZIO;
    return p;
  });
  return { pezzi, larghezza: x - SPAZIO };
}

const { pezzi: PEZZI, larghezza: LARGHEZZA } = disponi();
const MARGINE = 6;

export default function Wordmark({
  size = 16,
  withLogo = false,
  logoSrc,
  logoSize,
}: Props) {
  const id = useId().replace(/:/g, "");
  const imgSize = logoSize ?? Math.round(size * 1.9);
  const vbW = LARGHEZZA + MARGINE * 2;
  const vbH = 100 + MARGINE * 2;
  const altezza = Math.round(size * (vbH / 100));
  const larghezza = Math.round(altezza * (vbW / vbH));

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: `${Math.round(size * 0.6)}px`, maxWidth: "100%", minWidth: 0 }}>
      {withLogo && logoSrc && (
        <img
          src={logoSrc}
          width={imgSize}
          height={imgSize}
          alt=""
          style={{
            objectFit: "cover",
            borderRadius: imgSize > 40 ? "16px" : "50%",
            flexShrink: 0,
            boxShadow: imgSize > 40 ? "0 4px 24px hsl(183 80% 40% / 0.35)" : "none",
          }}
        />
      )}
      <svg
        role="img"
        aria-label="StatIppica"
        width={larghezza}
        height={altezza}
        viewBox={`${-MARGINE} ${-MARGINE} ${vbW} ${vbH}`}
        // Sui telefoni il nome grande della home non ci starebbe: si restringe
        // fino allo spazio disponibile, mantenendo le proporzioni.
        style={{ display: "block", flexShrink: 1, minWidth: 0, maxWidth: "100%", height: "auto", overflow: "visible" }}
      >
        <title>StatIppica</title>
        <defs>
          <filter id={`contorno-${id}`} x="-5%" y="-20%" width="110%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="2.4" result="largo" />
            <feFlood floodColor="#000" />
            <feComposite in2="largo" operator="in" result="nero" />
            <feMerge>
              <feMergeNode in="nero" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Ogni lettera e' un gruppo a se': al passaggio del cursore si
            colora d'azzurro e si alza di poco (vedi .wordmark-lettera nel
            foglio di stile). Il rettangolo trasparente fa da area sensibile,
            altrimenti il cursore "cadrebbe" negli spazi vuoti dentro la lettera. */}
        <g filter={`url(#contorno-${id})`}>
          {PEZZI.map((l, i) => (
            <g key={i} transform={`translate(${l.x} 0)`}>
              <g className="wordmark-lettera">
                <rect x={-SPAZIO / 2} y={-MARGINE} width={l.w + SPAZIO} height={100 + MARGINE * 2} fill="transparent" />
                {l.linea && <path d={l.linea} fill="none" stroke="currentColor" strokeWidth={TRATTO}
                                  strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={10} />}
                {l.pieno && <path d={l.pieno} fill="currentColor" />}
              </g>
            </g>
          ))}
        </g>
      </svg>
    </span>
  );
}
