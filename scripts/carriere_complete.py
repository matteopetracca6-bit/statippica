#!/usr/bin/env python3
"""
Carriere complete dei cavalli che hanno corso soprattutto all'estero
(21/11/2026).

PERCHE'. Le fonti italiane (TrottoWeb, UNIRE) contano solo le corse in
Italia. FACE TIME BOURBON, due volte vincitore del Prix d'Amerique, aveva in
archivio una sola corsa (2a a Modena nel 2019, 69.190 euro) e quindi il voto
B; la carriera vera, dalla scheda ufficiale francese LeTrot, e' di 43 corse,
35 vittorie, 42 volte nei primi tre, 3.392.880 euro, record 1'09"1.

COSA FA. Legge dati/carriere_complete.csv (una riga per cavallo, controllata a
mano sulla fonte scritta accanto) e mette quei totali nella scheda del
cavallo (horses), al posto di quelli solo italiani. Le stagioni corse (che
per il voto misurano la tenuta) vanno nella tabella carriere_complete, che il
calcolo dei voti (phase_ratings) usa quando sono piu' di quelle contate dalle
gare in archivio. Le gare una per una restano solo quelle italiane: la fonte
francese non le da' in un formato leggibile.

Si rifa' ogni notte prima dei voti, perche' i totali italiani della notte
riscriverebbero quelli veri.
Uso: python3 scripts/carriere_complete.py --db data.db
"""
import argparse
import csv
import os
import sqlite3
import sys

FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dati", "carriere_complete.csv")


def applica(conn) -> dict:
    esito = {"righe": 0, "cavalli": 0}
    conn.execute("""CREATE TABLE IF NOT EXISTS carriere_complete (nome TEXT, anno INTEGER, corse INTEGER, vittorie INTEGER,
                    primi_tre INTEGER, guadagni_eur REAL, record TEXT, record_data TEXT, record_luogo TEXT,
                    stagioni TEXT, n_stagioni INTEGER, fonte TEXT, url TEXT, PRIMARY KEY (nome, anno))""")
    if not os.path.exists(FILE):
        return esito
    with open(FILE, newline="", encoding="utf-8") as f:
        righe = list(csv.DictReader(f, delimiter=";"))
    conn.execute("DELETE FROM carriere_complete")
    for r in righe:
        esito["righe"] += 1
        nome, anno = r["nome"].strip().upper(), int(r["anno"])
        corse, vitt, p3 = int(r["corse"]), int(r["vittorie"]), int(r["primi_tre"])
        stagioni = [s.strip() for s in (r.get("stagioni") or "").split(",") if s.strip()]
        conn.execute("INSERT OR REPLACE INTO carriere_complete VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (nome, anno, corse, vitt, p3, float(r["guadagni_eur"]), r["record"].strip(), r.get("record_data"),
                      r.get("record_luogo"), ",".join(stagioni), len(stagioni), r.get("fonte"), r.get("url")))
        # Solo se la carriera vera e' piu' lunga di quella che l'archivio gia' conosce.
        cur = conn.execute("UPDATE horses SET career_races = ?, career_wins = ?, career_places = ?, career_earnings = ?, "
                           "record_career = ? WHERE name = ? AND birth_year = ? AND COALESCE(career_races, 0) <= ?",
                           (corse, vitt, p3 - vitt, float(r["guadagni_eur"]), r["record"].strip(), nome, anno, corse))
        esito["cavalli"] += cur.rowcount
    conn.commit()
    print(f"[CARRIERE COMPLETE] {esito}", file=sys.stderr)
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    applica(sqlite3.connect(ap.parse_args().db))
