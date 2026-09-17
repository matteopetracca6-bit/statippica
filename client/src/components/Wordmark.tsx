/**
 * Il nome del sito, scritto sempre allo stesso modo ovunque compaia.
 *
 * "Stat" parte dal verde della S e sfuma verso il bianco; "Ippica" parte dal
 * rosso della I e sfuma verso il bianco. La sfumatura e' dipinta sul testo
 * (background-clip: text), quindi segue la forma delle lettere invece di
 * disegnarci dietro un rettangolo colorato.
 *
 * WebkitBackgroundClip serve ancora: senza, su Safari e sui browser dei
 * telefoni il testo resta trasparente e sparisce.
 */

type Props = {
  /** Dimensione del testo in pixel. Il logo si adegua di conseguenza. */
  size?: number;
  /** Mostra il logo alla sinistra del nome. */
  withLogo?: boolean;
  /** Sorgente del logo (i due punti del sito lo importano in modi diversi). */
  logoSrc?: string;
  /** Dimensione del logo; se assente viene calcolata dal testo. */
  logoSize?: number;
  weight?: number;
};

const GREEN = "hsl(120 65% 48%)";
const RED = "hsl(0 75% 55%)";
const WHITE = "hsl(210 20% 97%)";

function GradientWord({ text, from }: { text: string; from: string }) {
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(100deg, ${from} 0%, ${from} 22%, ${WHITE} 95%)`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
      }}
    >
      {text}
    </span>
  );
}

export default function Wordmark({
  size = 16,
  withLogo = false,
  logoSrc,
  logoSize,
  weight = 800,
}: Props) {
  const imgSize = logoSize ?? Math.round(size * 1.9);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: `${Math.round(size * 0.55)}px` }}>
      {withLogo && logoSrc && (
        <img
          src={logoSrc}
          width={imgSize}
          height={imgSize}
          alt="StatIppica"
          style={{
            objectFit: "cover",
            borderRadius: imgSize > 40 ? "16px" : "50%",
            flexShrink: 0,
            boxShadow: imgSize > 40 ? "0 4px 24px hsl(183 80% 40% / 0.35)" : "none",
          }}
        />
      )}
      <span
        style={{
          fontWeight: weight,
          fontSize: `${size}px`,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          fontFamily: "'Space Grotesk', 'Satoshi', sans-serif",
        }}
      >
        <GradientWord text="Stat" from={GREEN} />
        <GradientWord text="Ippica" from={RED} />
      </span>
    </span>
  );
}
