import { colorePista } from "@/lib/piste";

/**
 * Il nome di un ippodromo col suo colore: un pallino davanti e, se richiesto,
 * il nome stesso colorato. Si usa ovunque compare una pista, cosi' il colore
 * di ogni ippodromo e' lo stesso in tutto il sito.
 */
export default function NomePista({ pista, testo, colorato = false, style }: {
  pista: string | null | undefined; testo?: React.ReactNode; colorato?: boolean; style?: React.CSSProperties;
}) {
  const c = colorePista(pista);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", minWidth: 0, ...style }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0, boxShadow: `0 0 0 2px ${c.replace(")", " / 0.18)")}` }} />
      <span style={{ color: colorato ? c : undefined, overflow: "hidden", textOverflow: "ellipsis" }}>{testo ?? pista}</span>
    </span>
  );
}
