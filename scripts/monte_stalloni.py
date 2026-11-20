#!/usr/bin/env python3
"""
Prezzo di monta degli stalloni cercato a mano (20/11/2026).

Il catalogo (sync_stallion_catalog.py) ha il prezzo degli stalloni in servizio
in Italia. Per gli stalloni con un voto e senza prezzo il prezzo e' in
dati/monte_stalloni.csv, con la fonte: ANACT Libro Stalloni 2026 per l'Italia,
le tariffe 2026 delle stazioni per gli Stati Uniti (in euro al cambio scritto
nella fonte; l'importo originale resta in catalog_notes).

Si scrive solo dove il prezzo manca: il catalogo ha sempre la precedenza.
Colonna stato: active (con prezzo), da_concordare, deceased, ritirato (senza
prezzo: la pagina dello stallone lo dice al posto del prezzo vuoto).

STESSO STALLONE, NOME SCRITTO IN DUE MODI. Il catalogo scrive "PASCIA LEST",
i figli "PASCIA' LEST": il prezzo restava sulla riga senza apostrofo e lo
stallone col voto risultava senza. Si copia dalla riga con lo stesso nome a
meno di apostrofi, punti e spazi.
Gira ogni notte (nightly_update.py) e nel lavoro a mano archivio-nazionalita.
"""
import csv
import os
import re
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
            tassa = float(r["tassa_eur"]) if (r.get("tassa_eur") or "").strip() else None
            stato = (r.get("stato") or "").strip() or "active"
            valori = (tassa, r["stagione"], r["fonte"], r["stazione"] or None, r["importo_originale"] or None, ora, stato)
            gia = conn.execute("SELECT stud_fee_eur, stud_status FROM stallions WHERE name = ?", (nome,)).fetchone()
            if gia is None:
                conn.execute("""INSERT INTO stallions (name, stud_fee_eur, season, fee_source, stud_farm,
                                    catalog_notes, scraped_at, stud_status) VALUES (?,?,?,?,?,?,?,?)""",
                             (nome, *valori))
                esito["nuovi"] += 1
            elif not gia[0] and gia[1] not in ("da_concordare", "free") or (stato == "deceased" and gia[1] != "deceased"):
                conn.execute("""UPDATE stallions SET stud_fee_eur = ?, season = ?, fee_source = ?,
                                    stud_farm = COALESCE(NULLIF(stud_farm, ''), ?), catalog_notes = ?,
                                    scraped_at = ?, stud_status = ? WHERE name = ?""", (*valori, nome))
                esito["aggiornati"] += 1
    esito["varianti"] = copia_varianti(conn)
    conn.commit()
    return esito


def _norm(n: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (n or "").upper())


def copia_varianti(conn) -> int:
    """Prezzo e stato dalla riga del catalogo con lo stesso nome scritto in altro modo."""
    righe = conn.execute("""SELECT name, stud_fee_eur, stud_status, season, fee_source, stud_farm, country
                            FROM stallions WHERE stud_fee_eur > 0 OR stud_status IS NOT NULL""").fetchall()
    per_norm: dict = {}
    for r in righe:
        per_norm.setdefault(_norm(r[0]), []).append(r)
    copiati = 0
    for (sire,) in conn.execute("SELECT sire FROM stallion_rating_stats").fetchall():
        mia = conn.execute("SELECT stud_fee_eur, stud_status FROM stallions WHERE name = ?", (sire,)).fetchone()
        if mia and (mia[0] or mia[1]):
            continue
        altre = [r for r in per_norm.get(_norm(sire), []) if r[0] != sire]
        if not altre:
            continue
        a = max(altre, key=lambda r: (r[1] or 0))
        if mia is None:
            conn.execute("INSERT INTO stallions (name) VALUES (?)", (sire,))
        conn.execute("""UPDATE stallions SET stud_fee_eur = ?, stud_status = ?, season = ?, fee_source = ?,
                            stud_farm = COALESCE(stud_farm, ?), country = COALESCE(country, ?)
                        WHERE name = ?""", (a[1], a[2], a[3], (a[4] or "") + f" (come {a[0]})", a[5], a[6], sire))
        copiati += 1
    return copiati


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    a = ap.parse_args()
    print(f"[MONTE] {applica(sqlite3.connect(a.db))}", file=sys.stderr)
