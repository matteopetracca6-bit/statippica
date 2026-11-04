#!/usr/bin/env python3
"""
carriere_fattrici.py — StatIppica

Recupera di notte la carriera gara per gara delle fattrici che hanno corso.

PERCHE'. Molte fattrici entrano nell'archivio come madri, con i totali di
carriera presi dal registro ufficiale (UNIRE), ma senza le singole gare:
a novembre 2026 erano circa 5.200 con corse dichiarate e nessuna gara in
archivio (per esempio SIMPLY ROD, 123 corse fra il 2014 e il 2019). La loro
scheda da atleta restava vuota e dalla pagina fattrice non si poteva
arrivarci.

COME. Per ogni fattrice si legge la scheda di carriera su TrottoWeb (la
stessa usata per tutti gli altri cavalli) e si aggiungono le gare che
mancano, dal 2012 in poi come il resto dell'archivio. Tre cautele:

  - Si lavora solo su fattrici gia' presenti fra i cavalli: niente schede
    nuove, quindi le classifiche degli atleti non cambiano.
  - Se TrottoWeb indica un anno di nascita diverso dal nostro, e' un'omonima:
    si salta.
  - Se le gare trovate sono meno di quelle dichiarate (ha corso anche prima
    del 2012), si rimettono i totali del registro ufficiale: valgono piu' di
    un conteggio parziale.
  - Padre, madre, sesso e ruolo della fattrice non si toccano.
  - Le gare entrano anche nelle statistiche di guidatori, allenatori e
    ippodromi, come quelle di ogni altro cavallo.

Ogni tentativo si annota in fattrici_carriera_letta; chi non ha dato gare si
riprova dopo GIORNI_RICONTROLLO giorni (la fonte puo' aggiungerle).

QUALI. Solo le nate dal 2011: per le piu' vecchie TrottoWeb non ha piu' la
carriera gara per gara (la scheda torna vuota), restano i totali ufficiali.
Prima quelle con piu' figli. Chi ha corso solo prima del 2012 non si riprova. Si saltano le
nate prima del 1998, che hanno smesso di correre prima del 2012.

QUANTO. Al massimo CARRIERE_FATTRICI_MINUTI minuti (30) e
CARRIERE_FATTRICI_NUMERO fattrici (300) a notte.

Uso a mano (prova su una copia):
  DB_PATH=/tmp/prova.db python3 carriere_fattrici.py --numero 10
"""

import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone

MINUTI = float(os.environ.get("CARRIERE_FATTRICI_MINUTI", "30"))
NUMERO = int(os.environ.get("CARRIERE_FATTRICI_NUMERO", "300"))
PAUSA = float(os.environ.get("CARRIERE_FATTRICI_PAUSA", "0.6"))
GIORNI_RICONTROLLO = 180
# TrottoWeb ha la carriera gara per gara solo per i nati dal 2011: per le
# nate prima la scheda torna vuota (provato a novembre 2026 su un campione:
# 0 gare per tutte le nate 2009-2010, gare trovate per quasi tutte le 2011).
NATE_DAL = int(os.environ.get("CARRIERE_FATTRICI_NATE_DAL", "2011"))
ERRORI_DI_FILA = 6


def crea_tabella(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fattrici_carriera_letta (
            nome          TEXT PRIMARY KEY,
            letta_il      TEXT,
            gare_trovate  INTEGER,   -- gare lette sulla fonte (dal 2012)
            gare_nuove    INTEGER,   -- gare aggiunte all'archivio
            esito         TEXT       -- ok / nessuna_gara / omonima / errore
        )
    """)
    conn.commit()


def candidate(conn: sqlite3.Connection, limite: int) -> list:
    """Fattrici con corse dichiarate e meno gare in archivio di quelle dichiarate."""
    soglia = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=GIORNI_RICONTROLLO)).isoformat()
    return conn.execute("""
        WITH madri AS (
            SELECT UPPER(TRIM(dam)) AS nome, COUNT(*) AS figli
            FROM horses WHERE dam IS NOT NULL AND TRIM(dam) <> ''
            GROUP BY UPPER(TRIM(dam))
        ),
        gare AS (
            SELECT horse_name, COUNT(*) AS n FROM races GROUP BY horse_name
        )
        SELECT h.name, h.birth_year, h.career_races, COALESCE(g.n, 0) AS in_archivio
        FROM madri m
        JOIN horses h ON h.name = m.nome
        LEFT JOIN gare g ON g.horse_name = h.name
        LEFT JOIN fattrici_carriera_letta l ON l.nome = h.name
        WHERE (h.career_races IS NULL OR h.career_races > COALESCE(g.n, 0))
          AND (h.career_races IS NULL OR h.career_races > 0)
          AND (h.birth_year IS NULL OR h.birth_year >= ?)
          AND (l.nome IS NULL OR (l.letta_il < ? AND l.esito <> 'prima_del_2012'))
        ORDER BY (h.career_races IS NULL), m.figli DESC, h.birth_year DESC
        LIMIT ?
    """, (NATE_DAL, soglia, limite)).fetchall()


def recupera_una(conn: sqlite3.Connection, nome: str, anno, dichiarate) -> tuple:
    """Ritorna (esito, gare_trovate, gare_nuove)."""
    import nightly_update as nu

    data = nu._fetch_anagrafica(nome)
    if data is None:
        return "errore", 0, 0
    if anno and data.get("birth_year") and int(data["birth_year"]) != int(anno):
        return "omonima", 0, 0
    tutte = data.get("races") or []
    gare = nu._filter_min_date(tutte, nu.MIN_RACE_DATE)
    if not gare:
        # Ha corso solo prima dell'inizio dell'archivio: inutile riprovare.
        return ("prima_del_2012" if tutte else "nessuna_gara"), 0, 0

    # Totali del registro ufficiale, per rimetterli se la fonte ne da' meno.
    prima = conn.execute("""
        SELECT career_races, career_wins, career_places, career_earnings, record_career
        FROM horses WHERE name = ?
    """, (nome,)).fetchone()

    nu._assegna_date_per_gruppo(conn, nome, gare)
    nuove = nu._insert_races(conn, gare)
    nu._update_horse_career_stats(conn, nome)

    in_archivio = conn.execute("SELECT COUNT(*) FROM races WHERE horse_name = ?",
                               (nome,)).fetchone()[0]
    if prima and dichiarate and in_archivio < dichiarate:
        conn.execute("""
            UPDATE horses SET career_races = ?, career_wins = ?, career_places = ?,
                              career_earnings = ?, record_career = ?
            WHERE name = ?
        """, (*prima, nome))
    conn.commit()
    return "ok", len(gare), nuove


def phase_carriere_fattrici(conn: sqlite3.Connection, minuti: float = MINUTI,
                            numero: int = NUMERO) -> int:
    """Fase notturna. Ritorna quante gare nuove ha aggiunto."""
    crea_tabella(conn)
    lista = candidate(conn, numero)
    print(f"[FATTRICI-CARRIERA] Fattrici da controllare stanotte: {len(lista)} "
          f"(al massimo {numero} in {minuti:.0f} minuti)", file=sys.stderr)
    fine = time.monotonic() + minuti * 60
    fatte = gare_tot = con_gare = errori = 0
    for nome, anno, dichiarate, _ in lista:
        if time.monotonic() > fine:
            break
        try:
            esito, trovate, nuove = recupera_una(conn, nome, anno, dichiarate)
        except Exception as e:
            print(f"  [FATTRICI-CARRIERA] {nome}: {e}", file=sys.stderr)
            esito, trovate, nuove = "errore", 0, 0
        fatte += 1
        time.sleep(PAUSA)
        if esito == "errore":
            errori += 1
            if errori >= ERRORI_DI_FILA:
                print("[FATTRICI-CARRIERA] TrottoWeb non risponde: riprendo la prossima notte.",
                      file=sys.stderr)
                break
            continue
        errori = 0
        conn.execute("""
            INSERT INTO fattrici_carriera_letta (nome, letta_il, gare_trovate, gare_nuove, esito)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(nome) DO UPDATE SET letta_il = excluded.letta_il,
                gare_trovate = excluded.gare_trovate, gare_nuove = excluded.gare_nuove,
                esito = excluded.esito
        """, (nome, datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), trovate, nuove, esito))
        conn.commit()
        gare_tot += nuove
        con_gare += 1 if trovate else 0
    print(f"[FATTRICI-CARRIERA] Controllate {fatte}, con gare {con_gare}, "
          f"gare aggiunte {gare_tot}", file=sys.stderr)
    return gare_tot


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--numero", type=int, default=NUMERO)
    ap.add_argument("--minuti", type=float, default=MINUTI)
    a = ap.parse_args()
    import nightly_update as nu
    c = sqlite3.connect(str(nu.DB_PATH))
    phase_carriere_fattrici(c, a.minuti, a.numero)
    c.close()
