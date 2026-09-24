/**
 * Il nome del sito, scritto sempre allo stesso modo ovunque compaia.
 *
 * Le lettere sono disegnate a mano in SVG nello stile del carattere "Robotic"
 * scelto per il logo: tratto unico e sottile, forme geometriche, un punto
 * colorato dentro le lettere chiuse (le due P e la C). Non si carica un font
 * perche' quel carattere e' un'immagine di catalogo, non un file utilizzabile:
 * disegnare le dieci lettere che servono costa meno, pesa meno di un font
 * e resta nitido a qualunque dimensione.
 *
 * Lettere bianche con un contorno nero sottile; i punti sono nell'azzurro del
 * sito. Il contorno e' fatto con un filtro che "allarga" la forma e la dipinge
 * di nero sotto le lettere: cosi' circonda anche le estremita' dei tratti e i
 * punti, cosa che un semplice tratto nero piu' spesso non farebbe.
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

const BIANCO = "hsl(210 20% 98%)";
const AZZURRO = "hsl(183 100% 48%)";

// Ogni lettera: larghezza, tracciato (linee e archi, altezza 5-95) e, per le
// lettere chiuse, il centro del punto azzurro.
type Lettera = { w: number; d: string; punto?: [number, number] };

const S: Lettera = { w: 56, d: "M56 5 H24 A21.25 21.25 0 0 0 24 47.5 H32 A23.75 23.75 0 0 1 32 95 H0" };
const T: Lettera = { w: 56, d: "M0 5 H56 M28 5 V95" };
const A: Lettera = { w: 64, d: "M0 95 L32 5 L64 95" };
const I: Lettera = { w: 0, d: "M0 5 V95" };
const P: Lettera = { w: 48, d: "M0 95 V5 H25 A23 23 0 0 1 25 51 H0", punto: [24, 28] };
const C: Lettera = { w: 78, d: "M77 18 A45 45 0 1 0 77 82", punto: [45, 50] };

const PAROLA = [S, T, A, T, I, P, P, I, C, A];
const SPAZIO = 22;

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
const MARGINE = 9;

export default function Wordmark({
  size = 16,
  withLogo = false,
  logoSrc,
  logoSize,
}: Props) {
  const id = useId().replace(/:/g, "");
  const imgSize = logoSize ?? Math.round(size * 1.9);
  // Il tratto si ingrossa un poco quando il nome e' piccolo, altrimenti
  // nell'intestazione diventerebbe un filo invisibile.
  const tratto = size < 24 ? 10 : 8;
  const vbW = LARGHEZZA + MARGINE * 2;
  const vbH = 90 + MARGINE * 2;
  const altezza = Math.round(size * (vbH / 90));
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
        viewBox={`${-MARGINE} ${5 - MARGINE} ${vbW} ${vbH}`}
        // Sui telefoni il nome grande della home non ci starebbe: si restringe
        // fino allo spazio disponibile, mantenendo le proporzioni.
        style={{ display: "block", flexShrink: 1, minWidth: 0, maxWidth: "100%", height: "auto", overflow: "visible" }}
      >
        <title>StatIppica</title>
        <defs>
          <filter id={`contorno-${id}`} x="-5%" y="-20%" width="110%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="largo" />
            <feFlood floodColor="#000" />
            <feComposite in2="largo" operator="in" result="nero" />
            <feMerge>
              <feMergeNode in="nero" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#contorno-${id})`}>
          {PEZZI.map((l, i) => (
            <g key={i} transform={`translate(${l.x} 0)`}>
              <path d={l.d} fill="none" stroke={BIANCO} strokeWidth={tratto}
                    strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={10} />
              {l.punto && <circle cx={l.punto[0]} cy={l.punto[1]} r={tratto * 0.72} fill={AZZURRO} />}
            </g>
          ))}
        </g>
      </svg>
    </span>
  );
}
