#!/usr/bin/env python3
"""
omonimi_unire.py — StatIppica (23/11/2026)

PERCHE' ESISTE. Nell'archivio il nome e' la chiave del cavallo: quando un
genitore vecchio ha lo stesso nome di un cavallo giovane, i figli del primo
finiscono sotto il secondo. Sull'archivio del 23/11 erano 768 figli attaccati
a un genitore troppo giovane per esserlo (21 stalloni, 320 fattrici): per
esempio LADY W FIOR (2024) risultava figlia di GIADA WINNER del 2022. Nel
pedigree la casella diventava un "omonimo" grigio e la fattrice giovane si
trovava figli non suoi.

COSA FA. Per ogni genitore cosi', da un suo figlio si arriva alla scheda UNIRE
del genitore VERO (la ricerca per nome, sesso e anno del figlio da' il codice
dei genitori), se ne leggono anno, sesso, padre e madre, e il genitore vero
entra nell'archivio con l'anno nel nome, "GIADA WINNER (2005)", come fanno gia'
gli omonimi degli storici (omonimi.py: il nome pulito resta al piu' giovane).
La coppia si registra nella tabella omonimi; poi omonimi.riassegna() sposta
ogni figlio al genitore che poteva davvero averlo (eta' fra 3 e 25 anni per una
fattrice, fra 3 e 30 per uno stallone), e lo rifa' ogni notte.

UNIRE e' un sito istituzionale: una richiesta al secondo. Fuori dalle ore dei
lavori notturni.

Uso:
  python3 scripts/omonimi_unire.py --db data.db [--minuti 60] [--prova]
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))
sys.path.insert(0, str(RADICE / "scripts"))
import omonimi  # noqa: E402
import unire_source as u  # noqa: E402
import genealogie_unire as gu  # noqa: E402

MIN_ETA = {"sire": 3, "dam": 3}


def casi(conn) -> dict:
    """Genitori dell'archivio troppo giovani per i figli che hanno: {(ruolo, nome): [figli]}."""
    out: dict = {}
    for ruolo in ("sire", "dam"):
        for figlio, sesso, anno, g, ag in conn.execute(f"""
                SELECT h.name, h.sex, h.birth_year, p.name, p.birth_year
                  FROM horses h JOIN horses p ON p.name = h.{ruolo}
                 WHERE h.birth_year IS NOT NULL AND p.birth_year IS NOT NULL
                   AND p.birth_year > h.birth_year - {MIN_ETA[ruolo]}
                   AND h.sex IS NOT NULL AND h.sex <> ''"""):
            out.setdefault((ruolo, g, ag), []).append((figlio, sesso, anno))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--minuti", type=float, default=60)
    ap.add_argument("--prova", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    omonimi.crea_tabelle(conn)
    lista = casi(conn)
    print(f"[OMONIMI-UNIRE] genitori troppo giovani per i loro figli: {len(lista)} "
          f"({sum(len(v) for v in lista.values())} figli)")
    fine = time.time() + a.minuti * 60
    esito = {"inseriti": 0, "gia_presenti": 0, "non_trovati": 0, "anno_non_compatibile": 0}
    for (ruolo, nome, anno_giovane), figli in lista.items():
        if time.time() > fine:
            print("[OMONIMI-UNIRE] tempo finito: riprendo la prossima volta.")
            break
        trovato = None
        for figlio, sesso, anno in sorted(figli, key=lambda x: x[2])[:3]:
            try:
                ids = u.find_parent_ids(figlio, sesso, anno)
            except u.UnireUnavailable:
                print("[OMONIMI-UNIRE] UNIRE non raggiungibile: mi fermo.")
                ids = None
                fine = 0
                break
            except Exception:
                ids = None
            if ids and ids.get(ruolo) and ids[ruolo][0] == nome and ids[ruolo][1]:
                trovato = (ids[ruolo][1], anno)
                break
        if not trovato:
            esito["non_trovati"] += 1
            continue
        id_cav, anno_figlio = trovato
        try:
            sc = gu.scheda(id_cav)
        except Exception:
            sc = None
        testa = dict(gu.ULTIMA_TESTA)
        anno_vero = testa.get("anno")
        if not sc or not anno_vero or anno_vero > anno_figlio - MIN_ETA[ruolo] or anno_vero == anno_giovane:
            esito["anno_non_compatibile"] += 1
            continue
        nuovo = omonimi.nome_con_anno(nome, anno_vero)
        if conn.execute("SELECT 1 FROM horses WHERE name = ?", (nuovo,)).fetchone():
            esito["gia_presenti"] += 1
        else:
            ant = sc[1]
            padre = ant.get("p", (None, None))[0]
            madre = ant.get("m", (None, None))[0]
            esito["inseriti"] += 1
            if not a.prova:
                conn.execute("""INSERT INTO horses (name, birth_year, sex, sire, dam, career_races, career_wins, career_places,
                                                    career_earnings, source, source_role, horse_class, backfill_status, tw_found, last_updated)
                                VALUES (?,?,?,?,?, 0,0,0,0, 'unire_omonimo', 'parent_backfill', ?, 'done', 0, datetime('now'))""",
                             (nuovo, anno_vero, testa.get("sesso") or ("M" if ruolo == "sire" else "F"), padre, madre,
                              "breeder" if anno_vero < 2012 else "athlete"))
        if not a.prova:
            omonimi.registra(conn, nome, anno_giovane, nuovo, anno_vero)
            conn.commit()
    if not a.prova:
        r = omonimi.riassegna(conn)
        conn.commit()
        print(f"[OMONIMI-UNIRE] figli spostati al genitore giusto: {r}")
    print(f"[OMONIMI-UNIRE] {esito}")


if __name__ == "__main__":
    main()
