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

COME. L'omonimo entra con l'anno nel nome, "SALSA PICCANTE (2011)", e la
coppia si registra nella tabella omonimi. Dal 20/11/2026 il nome pulito spetta
sempre al cavallo PIU' GIOVANE (e' quello che corre oggi e che le fonti delle
corse scrivono senza anno); il piu' vecchio porta l'anno: "SOLANO" e' quello
del 2011, "SOLANO (1964)" quello del 1964. ordina() scambia i nomi delle
coppie messe al contrario, in tutte le tabelle, con le sue corse, i voti e i
riferimenti dei figli. Poi, per ogni coppia,
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


# Tabelle e colonne che contengono il nome di un cavallo (la sua identita').
# horses.sire/dam (i figli) si trattano a parte.
COLONNE_NOME = [
    ("horses", "name"), ("horse_ratings", "name"), ("races", "horse_name"),
    ("allenatori_corse", "cavallo"), ("gare_ufficiali_attesa", "cavallo"),
    ("curva_carriera", "horse_name"), ("forza_cavallo", "horse_name"), ("forza_stagioni", "horse_name"),
    ("potenziale_storico", "horse_name"), ("potenziale_traguardo", "horse_name"),
    ("pronostico_top3", "horse_name"), ("pronostico_top3_storico", "horse_name"),
    ("quote_totalizzatore", "horse_name"), ("rischio_galoppo", "horse_name"),
    ("rischio_galoppo_storico", "horse_name"), ("stima_premi", "horse_name"),
    ("stima_premi_storico", "horse_name"), ("valore_residuo", "horse_name"), ("voto_previsto", "horse_name"),
    ("partenti_ritirati", "horse_name"), ("upcoming_races", "horse_name"), ("riparazione_premi", "horse_name"),
    ("undated_repair_log", "horse_name"), ("stallion_rating_stats", "sire"), ("dam_rating_stats", "dam"),
    ("stallion_pedigree", "name"), ("stallions", "name"), ("stalloni_schede", "nome"),
    ("storici_corse", "nome"), ("storici_totali_cambi", "nome"), ("storici_unire_parziali", "nome"),
    ("fattrici_carriera_letta", "nome"), ("cavalli_alias", "nome"),
]


def _esiste(conn, tabella, colonna) -> bool:
    return any(r[1] == colonna for r in conn.execute(f'PRAGMA table_info("{tabella}")'))


def rinomina(conn, vecchio: str, nuovo: str):
    """Il cavallo 'vecchio' si chiama ora 'nuovo' in tutto l'archivio, figli compresi."""
    for t, col in COLONNE_NOME:
        if _esiste(conn, t, col):
            conn.execute(f'UPDATE OR IGNORE "{t}" SET {col} = ? WHERE {col} = ?', (nuovo, vecchio))
            conn.execute(f'DELETE FROM "{t}" WHERE {col} = ?', (vecchio,))  # doppioni rimasti
    for ruolo in ("sire", "dam"):
        conn.execute(f"UPDATE horses SET {ruolo} = ? WHERE UPPER(TRIM({ruolo})) = ?", (nuovo, vecchio))
    # Il voto da stallone si calcola dai figli in horse_ratings (copia del padre).
    if _esiste(conn, "horse_ratings", "sire"):
        conn.execute("UPDATE horse_ratings SET sire = ? WHERE UPPER(TRIM(sire)) = ?", (nuovo, vecchio))


def ordina(conn) -> dict:
    """Coppie al contrario (il nome pulito al piu' vecchio): si scambiano."""
    crea_tabelle(conn)
    esito = {"coppie": 0, "scambiate": 0}
    for nome, anno, nome_om, anno_om in conn.execute(
            "SELECT nome, anno, nome_omonimo, anno_omonimo FROM omonimi").fetchall():
        esito["coppie"] += 1
        r = conn.execute("SELECT birth_year FROM horses WHERE name = ?", (nome,)).fetchone()
        anno = (r[0] if r else None) or anno
        if anno is None or anno_om is None or int(anno) >= int(anno_om):
            continue
        nuovo_vecchio = nome_con_anno(nome, anno)
        if conn.execute("SELECT 1 FROM horses WHERE name = ?", (nuovo_vecchio,)).fetchone():
            continue
        rinomina(conn, nome, nuovo_vecchio)     # il piu' vecchio prende l'anno
        rinomina(conn, nome_om, nome)           # il piu' giovane il nome pulito
        conn.execute("DELETE FROM omonimi WHERE nome_omonimo = ?", (nome_om,))
        registra(conn, nome, anno_om, nuovo_vecchio, anno)
        esito["scambiate"] += 1
    conn.commit()
    return esito


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
    log(f"[OMONIMI] nomi: {ordina(c)}")
    log(f"[OMONIMI] {riassegna(c)}")
