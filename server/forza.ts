/**
 * Forza e curva di carriera (novembre 2026, forza.py).
 *
 * Il calcolo e' notturno, in Python: forza_cavallo (oggi), forza_stagioni
 * (fine anno per eta') e curva_carriera (eta' future). Qui si leggono per la
 * scheda del cavallo, con l'esito della verifica (modelli/forza_verifica.json).
 */
import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

let CACHE: { mtime: number; dati: any } | null = null;

export function verificaForza(root = process.cwd()): any | null {
  const file = path.join(root, "modelli", "forza_verifica.json");
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (!CACHE || CACHE.mtime !== mtime) CACHE = { mtime, dati: JSON.parse(fs.readFileSync(file, "utf8")) };
    return CACHE.dati;
  } catch {
    return null;
  }
}

function tabella(db: Database.Database, nome: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(nome);
}

export function forzaCavallo(db: Database.Database, nome: string) {
  if (!tabella(db, "forza_cavallo")) return null;
  const f = db.prepare(`SELECT * FROM forza_cavallo WHERE horse_name = ?`).get(nome) as any;
  if (!f) return null;
  const stagioni = db.prepare(`SELECT * FROM forza_stagioni
                               WHERE horse_name = ? ORDER BY eta`).all(nome) as any[];
  const curva = db.prepare(`SELECT eta, mediana, basso, alto FROM curva_carriera
                            WHERE horse_name = ? ORDER BY eta`).all(nome) as any[];
  if (!stagioni.length && !curva.length) return null;
  const v = verificaForza();
  return {
    forza: f.forza, tendenza: f.tendenza, corse_12_mesi: f.corse_12_mesi,
    ultima_corsa: f.ultima_corsa, ferma: !!f.ferma,
    potenziale: f.potenziale, potenziale_basso: f.potenziale_basso, potenziale_alto: f.potenziale_alto,
    potenziale_eta: f.potenziale_eta, picco: f.picco, picco_eta: f.picco_eta,
    nato: f.birth_year, stagioni, curva, calcolato_il: f.calcolato_il,
    verifica: v ? {
      forza: v.forza ? { esito: v.forza.esito, ordine_giusto: v.forza.ordine_giusto, corse: v.forza.corse } : null,
      curva: v.curva ? { esito: v.curva.esito, errore_modello: v.curva.errore_modello,
                         errore_resta_com_e: v.curva.errore_resta_com_e, copertura_80: v.curva.copertura_80 } : null,
    } : null,
  };
}
