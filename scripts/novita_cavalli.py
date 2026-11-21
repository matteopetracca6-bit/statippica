#!/usr/bin/env python3
"""
Novita' dell'archivio: i cavalli entrati e quelli che hanno appena ricevuto
la carriera (21/11/2026).

PERCHE'. L'archivio non segna quando un cavallo e' stato aggiunto: l'unica
data e' l'ultimo aggiornamento, che cambia ogni notte per migliaia di cavalli
gia' presenti. Qui si tiene il registro cavalli_visti (chi c'era gia' e se
aveva corse) e, a ogni pubblicazione dell'archivio (pubblica_archivio.sh, da
qualunque lavoro), si confronta: chi non c'era entra in cavalli_novita come
"nuovo", chi non aveva corse e ora le ha come "carriera". I nomi cambiati per
gli omonimi ("OGRAZIA (1989)") non sono novita': sono lo stesso cavallo.

La prima volta, con --precedente (l'archivio della pubblicazione prima), il
registro parte da quello e le differenze di quella notte sono gia' novita';
senza, parte dall'archivio di adesso e le novita' cominciano dalla volta dopo.

Uso: python3 scripts/novita_cavalli.py --db data.db [--precedente vecchio.db]
"""
import argparse
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

CON_ANNO = re.compile(r"^(.*) \((\d{4})\)$")


def fonte(source, ruolo) -> str:
    s, r = (source or ""), (ruolo or "")
    if r == "vp_puledri":
        return "puledri_vendopuledri"
    if r == "gare_ufficiali" or s == "gare_ufficiali":
        return "gare_ufficiali"
    if s == "unire_blocco":
        return "registro_unire"
    if r == "tw_produzione":
        return "produzione_stalloni"
    if s == "stalloni_figli" or r == "stallone":
        return "schede_stalloni"
    if r == "parent_backfill":
        return "genitori"
    if s == "trottoweb":
        return "risultati"
    return "altro"


def crea(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS cavalli_visti (nome TEXT PRIMARY KEY, prima_volta TEXT, aveva_corse INTEGER)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS cavalli_novita (nome TEXT, anno INTEGER, tipo TEXT, fonte TEXT, classe TEXT,
                    quando TEXT, PRIMARY KEY (nome, tipo))""")


def aggiorna(conn, precedente: str | None = None, quando: str | None = None) -> dict:
    crea(conn)
    ora = quando or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    esito = {"nuovi": 0, "carriera": 0, "rinominati": 0, "partenza": 0}
    if not conn.execute("SELECT 1 FROM cavalli_visti LIMIT 1").fetchone():
        base = sqlite3.connect(precedente) if precedente and os.path.exists(precedente) else conn
        righe = base.execute("SELECT name, COALESCE(career_races, 0) > 0 FROM horses").fetchall()
        conn.executemany("INSERT OR IGNORE INTO cavalli_visti VALUES (?, 'iniziale', ?)", righe)
        esito["partenza"] = len(righe)
        if base is conn:
            conn.commit()
            return esito
    visti = {n: c for n, c in conn.execute("SELECT nome, aveva_corse FROM cavalli_visti")}
    for nome, anno, corse, src, ruolo, classe in conn.execute(
            "SELECT name, birth_year, COALESCE(career_races, 0), source, source_role, horse_class FROM horses").fetchall():
        ha_corse = 1 if corse > 0 else 0
        if nome not in visti:
            m = CON_ANNO.match(nome)
            if m and m.group(1) in visti:      # omonimo che ha preso l'anno nel nome
                esito["rinominati"] += 1
            else:
                conn.execute("INSERT OR IGNORE INTO cavalli_novita VALUES (?,?,?,?,?,?)",
                             (nome, anno, "nuovo", fonte(src, ruolo), classe, ora))
                esito["nuovi"] += 1
            conn.execute("INSERT OR REPLACE INTO cavalli_visti VALUES (?,?,?)", (nome, ora, ha_corse))
        elif ha_corse and not visti[nome]:
            conn.execute("INSERT OR IGNORE INTO cavalli_novita VALUES (?,?,?,?,?,?)",
                         (nome, anno, "carriera", fonte(src, ruolo), classe, ora))
            conn.execute("UPDATE cavalli_visti SET aveva_corse = 1 WHERE nome = ?", (nome,))
            esito["carriera"] += 1
    conn.commit()
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--precedente", default=None)
    ap.add_argument("--quando", default=None, help="data e ora UTC da segnare (per la prima volta)")
    a = ap.parse_args()
    print(f"[NOVITA] {aggiorna(sqlite3.connect(a.db), a.precedente, a.quando)}", file=sys.stderr)
