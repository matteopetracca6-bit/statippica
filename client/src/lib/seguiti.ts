/**
 * Cavalli seguiti (23/11/2026): l'elenco sta nel browser (niente account).
 * Stesso schema della scuderia (lib/scuderia.ts).
 */
import { useSyncExternalStore } from "react";

export interface Seguito { nome: string; anno: number | null; dal: string }
const CHIAVE = "statippica.seguiti.v1";
const VUOTO: Seguito[] = [];
let corrente: Seguito[] | null = null;
const ascoltatori = new Set<() => void>();

function leggi(): Seguito[] {
  if (corrente) return corrente;
  try {
    const d = JSON.parse(localStorage.getItem(CHIAVE) || "[]");
    corrente = Array.isArray(d) ? d.filter(x => x && x.nome) : VUOTO;
  } catch { corrente = VUOTO; }
  return corrente;
}
function scrivi(l: Seguito[]) {
  corrente = l;
  try { localStorage.setItem(CHIAVE, JSON.stringify(l)); } catch { /* spazio pieno o navigazione privata */ }
  ascoltatori.forEach(f => f());
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", e => { if (e.key === CHIAVE) { corrente = null; ascoltatori.forEach(f => f()); } });
}
const chiave = (nome: string, anno: number | null | undefined) => `${nome.toUpperCase()}|${anno ?? ""}`;

export function useSeguiti() {
  const l = useSyncExternalStore(f => { ascoltatori.add(f); return () => ascoltatori.delete(f); }, leggi, () => VUOTO);
  const segue = (nome: string, anno?: number | null) => l.some(x => chiave(x.nome, x.anno) === chiave(nome, anno));
  return {
    seguiti: l,
    segue,
    alterna: (nome: string, anno?: number | null) => {
      if (segue(nome, anno)) scrivi(l.filter(x => chiave(x.nome, x.anno) !== chiave(nome, anno)));
      else scrivi([...l, { nome: nome.toUpperCase(), anno: anno ?? null, dal: new Date().toISOString().slice(0, 10) }]);
    },
    togli: (nome: string, anno?: number | null) => scrivi(l.filter(x => chiave(x.nome, x.anno) !== chiave(nome, anno))),
  };
}
