#!/usr/bin/env python3
"""
Omonimi: due cavalli diversi con lo stesso nome (19/11/2026).

PERCHE'. Nell'archivio il nome e' la chiave del cavallo, quindi un secondo
cavallo con lo stesso nome non poteva entrare: il recupero degli storici da
UNIRE lo saltava ("omonimo"). Peggio, i figli dei due finivano tutti sotto lo
stesso nome. Due casi veri:
  * SALSA PICCANTE: la fattrice del 1992 risultava madre anche di ESSENZA
    PICCANTE (2020) e IDEA PICCANTE (2023), che sono figlie della SALSA
    PICCANTE del 2011 (avrebbe partorito a 28 e 31 anni);
  * BRILLANTISSIME: in archivio c'era un atleta del 2017 con 123 "figli" nati
    dal 2016, che sono dello stallone del 2011 (READY CASH x IVRE DE VICTOIRE).

COME. Il cavallo che c'era resta con il suo nome (e' quello che arriva dalle
fonti delle corse); l'omonimo entra con l'anno nel nome, "SALSA PICCANTE
(2011)", e la coppia si registra nella tabella omonimi. Poi, per ogni coppia,
ogni figlio va al genitore che poteva davvero averlo: eta' del genitore alla
nascita del figlio fra 3 e 25 anni per una fattrice, fra 3 e 30 per uno
stallone. Se e' possibile per uno solo dei due, il figlio va a quello; se e'
possibile per tutti e due va a quello dei due che e' un riproduttore provato
(almeno 3 figli che possono essere solo suoi, e l'altro nessuno); altrimenti
resta com'e'. Ogni spostamento
resta in omonimi_cambi. Il controllo si ripete ogni notte, perche' i figli
nuovi arrivano dalle fonti con il nome senza anno.
"""
from __future__ import annotations

import re
import sqlite3
import sys
from datetime import datetime, timezone

ETA = {"dam": (3, 25), "sire": (3, 30)}
RE_ANNO = re.compile(r"^(.*) \((\d{4})\)$")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def crea_tabelle(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS omonimi (nome TEXT, anno INTEGER, nome_omonimo TEXT PRIMARY KEY,
                    anno_omonimo INTEGER, quando TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS omonimi_cambi (figlio TEXT, anno_figlio INTEGER, ruolo TEXT,
                    prima TEXT, dopo TEXT, quando TEXT)""")


def nome_con_anno(nome: str, anno: int) -> str:
    return f"{nome} ({int(anno)})"


def nome_base(nome: str) -> str:
    m = RE_ANNO.match(nome or "")
    return m.group(1) if m else nome


def registra(conn, nome: str, anno: int | None, nome_omonimo: str, anno_omonimo: int):
    crea_tabelle(conn)
    conn.execute("INSERT OR REPLACE INTO omonimi VALUES (?,?,?,?,?)",
                 (nome, anno, nome_omonimo, int(anno_omonimo),
                  datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")))


def _possibile(ruolo, anno_genitore, anno_figlio) -> bool:
    if anno_genitore is None or anno_figlio is None:
        return False
    lo, hi = ETA[ruolo]
    return lo <= int(anno_figlio) - int(anno_genitore) <= hi


def riassegna(conn) -> dict:
    """Ogni figlio al genitore che poteva averlo, per tutte le coppie registrate."""
    crea_tabelle(conn)
    ora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    esito = {"coppie": 0, "spostati": 0}
    for nome, anno, nome_om, anno_om in conn.execute(
            "SELECT nome, anno, nome_omonimo, anno_omonimo FROM omonimi").fetchall():
        esito["coppie"] += 1
        if anno is None:
            r = conn.execute("SELECT birth_year FROM horses WHERE name = ?", (nome,)).fetchone()
            anno = r[0] if r else None
        for ruolo in ("sire", "dam"):
            figli = conn.execute(f"""SELECT name, birth_year, {ruolo} FROM horses
                                     WHERE UPPER(TRIM({ruolo})) IN (?, ?)""", (nome, nome_om)).fetchall()
            # Figli che possono essere solo dell'uno o solo dell'altro.
            solo_base = sum(1 for _, af, _ in figli if _possibile(ruolo, anno, af) and not _possibile(ruolo, anno_om, af))
            solo_om = sum(1 for _, af, _ in figli if _possibile(ruolo, anno_om, af) and not _possibile(ruolo, anno, af))
            # Per i figli possibili per tutti e due: se uno solo dei due e' un
            # riproduttore provato (almeno 3 figli che possono essere solo
            # suoi) e l'altro nessuno, vanno a lui. BRILLANTISSIME: 55 figli
            # 2016-2019 possono essere solo dello stallone del 2011, nessuno
            # solo dell'atleta del 2017, quindi anche quelli dal 2020 sono
            # dello stallone.
            preferito = nome_om if (solo_om >= 3 and solo_base == 0) else nome if (solo_base >= 3 and solo_om == 0) else None
            for figlio, anno_f, attuale in figli:
                p_base = _possibile(ruolo, anno, anno_f)
                p_om = _possibile(ruolo, anno_om, anno_f)
                giusto = nome_om if (p_om and not p_base) else nome if (p_base and not p_om) else \
                    (preferito if (p_base and p_om) else None)
                if giusto and (attuale or "").upper().strip() != giusto:
                    conn.execute(f"UPDATE horses SET {ruolo} = ? WHERE name = ?", (giusto, figlio))
                    conn.execute("INSERT INTO omonimi_cambi VALUES (?,?,?,?,?,?)",
                                 (figlio, anno_f, ruolo, attuale, giusto, ora))
                    esito["spostati"] += 1
    conn.commit()
    return esito


if __name__ == "__main__":
    import argparse, os
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    a = ap.parse_args()
    c = sqlite3.connect(a.db)
    log(f"[OMONIMI] {riassegna(c)}")
