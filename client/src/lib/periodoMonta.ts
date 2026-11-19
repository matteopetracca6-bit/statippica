// Il periodo in monta di uno stallone, scritto per esteso (albero e scheda stallone).
export const periodoMonta = (s: { monta_dal: number | null; monta_al: number | null; morto?: { data: string | null } | null; seme_congelato?: boolean }) => {
  if (s.monta_dal == null) return "—";
  if (s.monta_al == null) return `dal ${s.monta_dal} a oggi`;
  return s.monta_dal === s.monta_al ? `nel ${s.monta_dal}` : `${s.monta_dal}–${s.monta_al}`;
};
