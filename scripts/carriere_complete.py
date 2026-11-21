#!/usr/bin/env python3
"""
Carriere complete dei cavalli che hanno corso soprattutto all'estero
(21/11/2026).

PERCHE'. Le fonti italiane (TrottoWeb, UNIRE) contano solo le corse in
Italia. FACE TIME BOURBON, due volte vincitore del Prix d'Amerique, aveva in
archivio una sola corsa (2a a Modena nel 2019, 69.190 euro) e quindi il voto
B; la carriera vera, dalla scheda ufficiale francese LeTrot, e' di 43 corse,
35 vittorie, 42 volte nei primi tre, 3.392.880 euro, record 1'09"1.

COSA FA (dal 21/11/2026 anche per gli altri stalloni stranieri, trovati con
scripts/cerca_carriere_estere.py). Legge dati/carriere_complete.csv (una riga per cavallo, controllata a
mano sulla fonte scritta accanto) e mette quei totali nella scheda del
cavallo (horses), al posto di quelli solo italiani. Le stagioni corse (che
per il voto misurano la tenuta) vanno nella tabella carriere_complete, che il
calcolo dei voti (phase_ratings) usa quando sono piu' di quelle contate dalle
gare in archivio. Le gare una per una restano solo quelle italiane: la fonte
francese non le da' in un formato leggibile.

FONTI E VALUTE. LeTrot quando la voce di Wikipedia porta alla scheda giusta
(stesso anno e stesso padre), se no Wikipedia (fr, sv, en) con lo stesso
controllo di totali_mondiali.py. I guadagni in corone o dollari sono
convertiti in euro al cambio medio annuo della BCE degli anni di corsa (dai 2
ai 7 anni; per le carriere prima del 1999 il cambio del 1999): importo e
cambio originali restano scritti accanto. Le stagioni, quando la fonte non le
dice, sono stimate dalle corse (una ogni 12), e lo si segna.

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
    conn.execute("DROP TABLE IF EXISTS carriere_complete")
    conn.execute("""CREATE TABLE carriere_complete (nome TEXT, anno INTEGER, corse INTEGER, vittorie INTEGER,
                    primi_tre INTEGER, guadagni_eur REAL, record TEXT, record_data TEXT, record_luogo TEXT,
                    stagioni TEXT, n_stagioni INTEGER, stagioni_stimate INTEGER, fonte TEXT, url TEXT,
                    valuta_originale TEXT, importo_originale REAL, cambio REAL, PRIMARY KEY (nome))""")
    if not os.path.exists(FILE):
        return esito
    with open(FILE, newline="", encoding="utf-8") as f:
        righe = list(csv.DictReader(f, delimiter=";"))
    intero = lambda v: int(v) if str(v or "").strip() else None
    for r in righe:
        esito["righe"] += 1
        nome, anno = r["nome"].strip().upper(), intero(r.get("anno"))
        corse, vitt, p3 = int(r["corse"]), int(r["vittorie"]), intero(r.get("primi_tre"))
        stagioni = [s.strip() for s in (r.get("stagioni") or "").split(",") if s.strip()]
        # Stagioni non scritte nella fonte: si stimano dalle corse (circa 12 a
        # stagione, il ritmo tipico di un buon trottatore), e lo si segna.
        stimate = 0
        n_st = len(stagioni)
        if not n_st:
            n_st, stimate = max(1, -(-corse // 12)), 1
        cambio = float(r["cambio"]) if str(r.get("cambio") or "").strip() else None
        conn.execute("INSERT OR REPLACE INTO carriere_complete VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (nome, anno, corse, vitt, p3, float(r["guadagni_eur"]), (r.get("record") or "").strip() or None,
                      r.get("record_data") or None, r.get("record_luogo") or None, ",".join(stagioni), n_st, stimate,
                      r.get("fonte"), r.get("url"), r.get("valuta_originale") or None,
                      float(r["importo_originale"]) if str(r.get("importo_originale") or "").strip() else None, cambio))
        # Solo se la carriera vera e' piu' lunga di quella che l'archivio gia' conosce.
        # Se la scheda non ha l'anno di nascita, lo prende dalla fonte.
        cur = conn.execute("""UPDATE horses SET career_races = ?, career_wins = ?,
                                     career_places = COALESCE(?, career_places), career_earnings = ?,
                                     record_career = COALESCE(?, record_career), birth_year = COALESCE(birth_year, ?),
                                     -- come init_db: con l'anno, la classe la decide l'anno (atleti dal 2012)
                                     horse_class = CASE WHEN COALESCE(birth_year, ?) IS NULL THEN horse_class
                                                        WHEN COALESCE(birth_year, ?) < 2012 THEN 'breeder' ELSE 'athlete' END
                               WHERE name = ? AND (birth_year = ? OR birth_year IS NULL OR ? IS NULL)
                                 AND COALESCE(career_races, 0) <= ?""",
                           (corse, vitt, (p3 - vitt) if p3 is not None else None, float(r["guadagni_eur"]),
                            (r.get("record") or "").strip() or None, anno, anno, anno, nome, anno, anno, corse))
        esito["cavalli"] += cur.rowcount
    conn.commit()
    print(f"[CARRIERE COMPLETE] {esito}", file=sys.stderr)
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    applica(sqlite3.connect(ap.parse_args().db))
