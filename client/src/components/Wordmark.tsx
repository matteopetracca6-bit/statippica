/**
 * Il nome del sito con il suo logo, uguale ovunque compaia.
 *
 * Scritta e cavallo sono le due immagini scelte per il marchio, ripulite dallo
 * sfondo (nero per la scritta, una finta scacchiera per il cavallo) in modo da
 * posarsi su qualunque fondo scuro del sito.
 *
 * Al passaggio del cursore un riflesso di luce attraversa la scritta da
 * sinistra a destra e il cavallo si alza di un soffio. Il riflesso e'
 * ritagliato sulla forma delle lettere con una maschera fatta dalla scritta
 * stessa, quindi illumina solo le lettere e non il rettangolo intorno.
 */

import scritta from "@assets/statippica-scritta.webp";
import cavallo from "@assets/statippica-cavallo.webp";

// Proporzioni delle due immagini (larghezza / altezza).
const RAPPORTO_SCRITTA = 2085 / 227;
const RAPPORTO_CAVALLO = 1363 / 1091;

type Props = {
  /** Altezza della scritta in pixel. */
  size?: number;
  /** Mostra il cavallo alla sinistra della scritta. */
  withLogo?: boolean;
  /** Non piu' usato: il logo e' sempre il cavallo del marchio. */
  logoSrc?: string;
  /** Altezza del cavallo; se assente viene calcolata dalla scritta. */
  logoSize?: number;
  /** Conservato per compatibilita'. */
  weight?: number;
  /** Versione grande della home: sui telefoni il cavallo va sopra la scritta. */
  grande?: boolean;
};

export default function Wordmark({ size = 16, withLogo = false, logoSize, grande = false }: Props) {
  const altezzaCavallo = logoSize ?? Math.round(size * 2.2);
  const larghezzaScritta = Math.round(size * RAPPORTO_SCRITTA);
  return (
    <span className={grande ? "marchio marchio-grande" : "marchio"} style={{ gap: `${Math.round(size * 0.7)}px` }}>
      {withLogo && (
        <img
          className="marchio-cavallo"
          src={cavallo}
          alt=""
          width={Math.round(altezzaCavallo * RAPPORTO_CAVALLO)}
          height={altezzaCavallo}
        />
      )}
      <span
        className="marchio-scritta"
        role="img"
        aria-label="StatIppica"
        style={{
          width: `${larghezzaScritta}px`,
          aspectRatio: `${RAPPORTO_SCRITTA}`,
          ["--maschera" as any]: `url(${scritta})`,
        }}
      >
        <img src={scritta} alt="" />
      </span>
    </span>
  );
}
