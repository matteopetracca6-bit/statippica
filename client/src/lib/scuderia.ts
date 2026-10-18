/**
 * La scuderia dell'utente, salvata nel browser (niente account): l'elenco
 * dei cavalli e dei puledri e il costo mensile. Ogni pagina che mostra un
 * cavallo o un puledro puo' aggiungerlo con <AggiungiScuderia />.
 */
import { useSyncExternalStore } from "react";

export interface VoceScuderia {
  id: string;
  tipo: "cavallo" | "puledro";
  nome?: string | null;
  anno?: number | null;
  padre?: string | null;
  madre?: string | null;
  prezzo?: number | null;
  asta?: boolean;
}
export interface Scuderia { mensile: number; voci: VoceScuderia[] }

const CHIAVE = "statippica.scuderia.v1";
const VUOTA: Scuderia = { mensile: 1200, voci: [] };
let corrente: Scuderia | null = null;
const ascoltatori = new Set<() => void>();

function leggi(): Scuderia {
  if (corrente) return corrente;
  try {
    const t = localStorage.getItem(CHIAVE);
    const d = t ? JSON.parse(t) : null;
    corrente = d && Array.isArray(d.voci) ? { mensile: Number(d.mensile) || 1200, voci: d.voci } : VUOTA;
  } catch {
    corrente = VUOTA;
  }
  return corrente;
}
function scrivi(s: Scuderia) {
  corrente = s;
  try { localStorage.setItem(CHIAVE, JSON.stringify(s)); } catch { /* spazio pieno o privato */ }
  ascoltatori.forEach(f => f());
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", e => { if (e.key === CHIAVE) { corrente = null; ascoltatori.forEach(f => f()); } });
}

export const chiaveVoce = (v: Partial<VoceScuderia>) =>
  v.tipo === "cavallo" ? `c|${(v.nome ?? "").toUpperCase()}|${v.anno ?? ""}`
                       : `p|${(v.nome ?? "").toUpperCase()}|${(v.padre ?? "").toUpperCase()}|${(v.madre ?? "").toUpperCase()}|${v.anno ?? ""}`;

export function useScuderia() {
  const s = useSyncExternalStore(f => { ascoltatori.add(f); return () => ascoltatori.delete(f); }, leggi, () => VUOTA);
  return {
    scuderia: s,
    contiene: (v: Partial<VoceScuderia>) => s.voci.some(x => chiaveVoce(x) === chiaveVoce(v)),
    aggiungi: (v: Omit<VoceScuderia, "id">) => {
      if (s.voci.some(x => chiaveVoce(x) === chiaveVoce(v))) return;
      scrivi({ ...s, voci: [...s.voci, { ...v, id: Math.random().toString(36).slice(2, 10) }] });
    },
    togli: (id: string) => scrivi({ ...s, voci: s.voci.filter(x => x.id !== id) }),
    togliVoce: (v: Partial<VoceScuderia>) => scrivi({ ...s, voci: s.voci.filter(x => chiaveVoce(x) !== chiaveVoce(v)) }),
    modifica: (id: string, cambi: Partial<VoceScuderia>) => scrivi({ ...s, voci: s.voci.map(x => x.id === id ? { ...x, ...cambi } : x) }),
    impostaMensile: (mensile: number) => scrivi({ ...s, mensile }),
    sostituisci: (voci: Omit<VoceScuderia, "id">[]) => scrivi({ ...s, voci: voci.map(v => ({ ...v, id: Math.random().toString(36).slice(2, 10) })) }),
    svuota: () => scrivi({ ...s, voci: [] }),
  };
}
