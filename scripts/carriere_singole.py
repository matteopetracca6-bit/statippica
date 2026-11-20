#!/usr/bin/env python3
"""
Carriera di singoli cavalli da UNIRE, su richiesta (20/11/2026).

Per i cavalli che servono subito e che il recupero degli storici, annata per
annata, non ha ancora raggiunto (per esempio LEMON DRA, 1986: gli storici
vanno dal 2011 al 1990). Per ognuno si cerca su UNIRE per nome esatto, sesso
e anno, e la scheda si completa come nel recupero degli storici
(storici_unire.leggi_cavallo): totali di carriera in Italia, record, genitori.
Una carriera gia' presente si sostituisce solo se UNIRE ne ha una piu' lunga
(per esempio IDEALE LUIS, con solo una parte delle corse).

--stalloni: lo stesso per ogni stallone con un voto da stallone e senza
carriera da atleta. Chi non ha corso in Italia (Maharajah, Ready Cash...) su
UNIRE non c'e': se non ha nemmeno una scheda, la riceve con anno, paese e
genitori che conosciamo, fra i cavalli storici.

Uso: python3 scripts/carriere_singole.py --db data.db "LEMON DRA:1986:M" ...
     python3 scripts/carriere_singole.py --db data.db --stalloni
"""
import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import unire_source as u  # noqa: E402
import storici_unire as su  # noqa: E402


def stalloni_senza_carriera(conn) -> list:
    """(nome, anno o None) degli stalloni con un voto e senza carriera."""
    out = []
    for (nome,) in conn.execute("""SELECT s.sire FROM stallion_rating_stats s
            WHERE NOT EXISTS (SELECT 1 FROM horses h WHERE h.name = s.sire AND COALESCE(h.career_races, 0) > 0)
            ORDER BY s.n_figli_totali DESC""").fetchall():
        anno = None
        for q in ("SELECT birth_year FROM horses WHERE name = ?",
                  "SELECT catalog_birth_year FROM stallions WHERE name = ?",
                  "SELECT CAST(substr(birth_date, 1, 4) AS INTEGER) FROM vp_horse_profile WHERE horse_name = ?"):
            try:
                r = conn.execute(q, (nome,)).fetchone()
            except sqlite3.Error:
                r = None
            if r and r[0]:
                anno = int(r[0])
                break
        out.append((nome, anno))
    return out


def scheda_minima(conn, nome, anno) -> bool:
    """Uno stallone senza scheda: entra fra gli storici con quel che sappiamo."""
    if conn.execute("SELECT 1 FROM horses WHERE name = ?", (nome,)).fetchone():
        return False
    p = conn.execute("SELECT sire, dam, nationality FROM stallion_pedigree WHERE name = ?", (nome,)).fetchone()
    st = conn.execute("SELECT country FROM stallions WHERE name = ?", (nome,)).fetchone()
    conn.execute("""INSERT INTO horses (name, birth_year, sex, country, sire, dam, career_races, career_wins,
                        career_places, career_earnings, source, source_role, horse_class, backfill_status,
                        tw_found, last_updated)
                    VALUES (?,?, 'M', ?,?,?, 0, 0, 0, 0, 'stalloni_figli', 'stallone', 'breeder', 'done', 0, ?)""",
                 (nome, anno, (p and p[2]) or (st and st[0]) or None, p and p[0], p and p[1],
                  datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")))
    return True


def cerca_e_leggi(conn, nome, anno, sessi, aggiorna) -> str:
    testo = nome
    if "'" in nome:
        pezzi = [x.strip() for x in nome.split("'") if x.strip()]
        testo = pezzi[0] if pezzi and len(pezzi[0]) >= 3 else max(pezzi, key=len, default=nome)
    for sesso in sessi:
        try:
            _, righe = su.cerca(testo, sesso, anno if anno else "")
        except Exception as e:  # la fonte non risponde: si va avanti
            return f"errore ({e.__class__.__name__})"
        giusta = next((r for r in righe if r[1] == u._norm(nome)), None)
        if giusta:
            cid, n, p, m = giusta
            return su.leggi_cavallo(conn, cid, nome, sesso, anno, p, m, aggiorna=aggiorna)
    return "non_trovato"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--stalloni", action="store_true", help="tutti gli stalloni senza carriera")
    ap.add_argument("--minuti", type=float, default=150)
    ap.add_argument("cavalli", nargs="*", help="NOME:ANNO:SESSO (anno e sesso si possono lasciare vuoti)")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    su.crea_tabelle(conn)
    fine = time.monotonic() + a.minuti * 60
    lista = []
    for voce in a.cavalli:
        pezzi = [x.strip() for x in voce.split(":")] + ["", ""]
        lista.append((pezzi[0].upper(), int(pezzi[1]) if pezzi[1] else None,
                      [pezzi[2].upper()] if pezzi[2] else ["M", "F"], True))
    if a.stalloni:
        gia = {x[0] for x in lista}
        lista += [(n, y, ["M"], False) for n, y in stalloni_senza_carriera(conn) if n not in gia]
    esiti: dict = {}
    for i, (nome, anno, sessi, singolo) in enumerate(lista):
        if time.monotonic() > fine:
            print(f"[CARRIERE] tempo finito dopo {i} cavalli su {len(lista)}", file=sys.stderr, flush=True)
            break
        esito = cerca_e_leggi(conn, nome, anno, sessi, aggiorna=True)
        if esito in ("non_trovato", "mai_corso") and not singolo and scheda_minima(conn, nome, anno):
            esito += "+scheda"
        conn.commit()
        esiti[esito] = esiti.get(esito, 0) + 1
        if singolo or esito not in ("non_trovato", "non_trovato+scheda"):
            r = conn.execute("SELECT birth_year, career_races, career_wins, career_earnings, record_career "
                             "FROM horses WHERE name = ?", (nome,)).fetchone()
            print(f"[CARRIERE] {nome} ({anno}): {esito} -> {r}", file=sys.stderr, flush=True)
    print(f"[CARRIERE] riepilogo su {len(lista)} cavalli: {esiti}", file=sys.stderr, flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
