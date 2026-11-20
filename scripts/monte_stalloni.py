#!/usr/bin/env python3
"""
Prezzo di monta degli stalloni cercato a mano (20/11/2026).

Il catalogo (sync_stallion_catalog.py) ha il prezzo degli stalloni in servizio
in Italia. Per gli stalloni con un voto e senza prezzo il prezzo e' in
dati/monte_stalloni.csv, con la fonte: ANACT Libro Stalloni 2026 per l'Italia,
le tariffe 2026 delle stazioni per gli Stati Uniti (in euro al cambio scritto
nella fonte; l'importo originale resta in catalog_notes).

Si scrive solo dove il prezzo manca: il catalogo ha sempre la precedenza.
Gira ogni notte (nightly_update.py) e nel lavoro a mano archivio-nazionalita.
"""
import csv
import os
import sqlite3
import sys
from datetime import datetime, timezone

FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dati", "monte_stalloni.csv")


def applica(conn) -> dict:
    esito = {"righe": 0, "aggiornati": 0, "nuovi": 0}
    if not os.path.exists(FILE):
        return esito
    ora = datetime.now(timezone.utc).isoformat()
    with open(FILE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter=";"):
            esito["righe"] += 1
            nome = r["nome"].strip().upper()
            tassa = float(r["tassa_eur"])
            valori = (tassa, r["stagione"], r["fonte"], r["stazione"], r["importo_originale"], ora)
            gia = conn.execute("SELECT stud_fee_eur FROM stallions WHERE name = ?", (nome,)).fetchone()
            if gia is None:
                conn.execute("""INSERT INTO stallions (name, stud_fee_eur, season, fee_source, stud_farm,
                                    catalog_notes, scraped_at, stud_status) VALUES (?,?,?,?,?,?,?, 'active')""",
                             (nome, *valori))
                esito["nuovi"] += 1
            elif not gia[0]:
                conn.execute("""UPDATE stallions SET stud_fee_eur = ?, season = ?, fee_source = ?,
                                    stud_farm = COALESCE(NULLIF(stud_farm, ''), ?), catalog_notes = ?,
                                    scraped_at = ?, stud_status = 'active' WHERE name = ?""", (*valori, nome))
                esito["aggiornati"] += 1
    conn.commit()
    return esito


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    a = ap.parse_args()
    print(f"[MONTE] {applica(sqlite3.connect(a.db))}", file=sys.stderr)
