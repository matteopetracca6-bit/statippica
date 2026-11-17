#!/usr/bin/env python3
"""
RIPARA RECUPERO: corregge ogni notte due difetti delle gare recuperate dai
risultati ufficiali (scripts/gare_ufficiali.py). Gira subito dopo quello script.
Se non c'e' niente da riparare non cambia niente.

GARE CONTATE DUE VOLTE. Molte gare senza data in archivio vengono da TrottoWeb
e sono di cavalli non classificati (r.p., squalificati): niente arrivo, niente
tempo. gare_ufficiali.py da' la data a una di queste solo se la candidata e'
una sola; se il cavallo ne ha due allo stesso ippodromo e sulla stessa
distanza, le candidate sono indistinguibili e la gara ufficiale viene inserita
di nuovo. Al 17/11/2026 erano 2.616 gare doppie. Qui la riga di TrottoWeb prende
la data (con numero della corsa, numero di partenza, partenti, allenatore e
proprietario) e la riga copiata si toglie. Fra piu' candidate identiche si
preferisce chi ha lo stesso esito e lo stesso guidatore: dare la data a una
vale quanto darla all'altra, contarle tutte e due no.

CAVALLI STRANIERI DOPPI. La pagina ufficiale scrive la sigla del paese senza
parentesi ("MADE FOR METALIMO S"), l'archivio con ("MADE FOR METALIMO (S)"):
la chiave del nome non coincide e gare_ufficiali.py crea una scheda nuova. Al
17/11/2026 erano 12 schede, con 86 gare e corse a due vincitori. Qui la scheda
creata dal recupero si unisce a quella con la sigla fra parentesi, se esiste e
ha lo stesso anno: le gare passano a quella giusta, le copie dello stesso giorno
si tolgono, le righe delle tabelle ricalcolate ogni notte si cancellano.

CAUTELE.
  - Una gara conta come "recuperata" solo se porta esattamente il codice che le
    ha dato gare_ufficiali.py (data_SIGLA_numero, oppure data_..._Rnumero se i
    notturni l'hanno allineata alla pagina dei risultati) e il numero di corsa
    giusto. Riconoscerla dal nome sarebbe pericoloso: molti trottatori finiscono
    con una sigla dell'allevamento ("ULTRA PF"), e "BAROLO" non e' "BAROLO OP".
  - La gara senza data deve essere dello stesso cavallo, con la stessa pista,
    distanza, arrivo e tempo. Pista, distanza, arrivo ed esito della riga di
    TrottoWeb non cambiano.
  - Lo stesso nome di sigla deve coincidere: "X S" si unisce solo a "X (S)".

Prova sull'archivio del 17/11/2026: 2.616 gare riparate, 12 schede unite,
2.698 righe in meno (tutte copie), gare senza data da 28.515 a 25.899, corse
con due vincitori da 135 a 121, doppioni cavallo-giorno invariati (898), gare
per stagione invariate; secondo e terzo giro: nessuna modifica.

Uso:
  python3 scripts/ripara_recupero.py --db data.db             # ripara
  python3 scripts/ripara_recupero.py --db data.db --prova     # conta, non salva
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gare_ufficiali as gu                          # noqa: E402

# Nome seguito dalla sigla del paese senza parentesi: "MADE FOR METALIMO S".
RE_SIGLA_PAESE = re.compile(r"^(.*\S)\s+([A-Z]{1,3})$")
# Tabelle ricalcolate ogni notte con una riga per cavallo: per una scheda unita
# a un'altra si tolgono le sue righe, la notte dopo tornano sotto il nome giusto.
TABELLE_DERIVATE = {"horse_ratings": "name", "stima_premi": "horse_name",
                    "voto_previsto": "horse_name", "valore_residuo": "horse_name",
                    "vp_name_lookup": "horse_name"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def scheda_per(cavalli: dict, k: str, cavallo: str) -> tuple:
    """(chiave, scheda) del cavallo della pagina, o (chiave, None). Se la chiave
    intera non c'e' ma c'e' un cavallo con la stessa sigla del paese fra
    parentesi, e' lui. Non si indovina: la sigla deve coincidere."""
    if k in cavalli:
        return k, cavalli[k]
    m = RE_SIGLA_PAESE.match(gu.nome_archivio(cavallo or ""))
    if m:
        k2 = gu.chiave_nome(m.group(1))
        scheda = cavalli.get(k2)
        if scheda and gu.nome_archivio(scheda[0]).endswith(f"({m.group(2)})"):
            return k2, scheda
    return k, None


def unisci_stranieri(conn: sqlite3.Connection) -> int:
    """Unisce le schede create dal recupero con la sigla del paese senza
    parentesi a quella con le parentesi. Ritorna quante schede ha unito."""
    nomi = dict(conn.execute("SELECT name, birth_year FROM horses").fetchall())
    tabelle = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    uniti = 0
    for nome, anno in conn.execute("SELECT name, birth_year FROM horses WHERE source_role = ?",
                                   (gu.ORIGINE,)).fetchall():
        m = RE_SIGLA_PAESE.match(nome or "")
        if not m:
            continue
        vero = f"{m.group(1)} ({m.group(2)})"
        if vero not in nomi:
            continue
        if anno and nomi[vero] and int(anno) != int(nomi[vero]):
            continue
        for rid, data in conn.execute("SELECT id, race_date FROM races WHERE horse_name = ?",
                                      (nome,)).fetchall():
            gia = data and conn.execute("SELECT 1 FROM races WHERE horse_name = ? AND race_date = ?",
                                        (vero, data)).fetchone()
            if gia:
                conn.execute("DELETE FROM races WHERE id = ?", (rid,))
            else:
                conn.execute("UPDATE races SET horse_name = ? WHERE id = ?", (vero, rid))
        conn.execute("UPDATE horses SET sire = ? WHERE sire = ?", (vero, nome))
        conn.execute("UPDATE horses SET dam = ? WHERE dam = ?", (vero, nome))
        for tabella, colonna in TABELLE_DERIVATE.items():
            if tabella in tabelle:
                conn.execute(f"DELETE FROM {tabella} WHERE {colonna} = ?", (nome,))
        conn.execute("DELETE FROM horses WHERE name = ?", (nome,))
        uniti += 1
    return uniti


def ripara_doppioni(conn: sqlite3.Connection) -> int:
    """La riga di TrottoWeb senza data prende la data della gara recuperata,
    che si toglie. Ritorna quante gare ha riparato."""
    a = gu._archivio_in_memoria(conn)
    ippodromi = {k: tuple(v.split("|", 1)) for k, v in gu._mappa(conn, "ippodromo", minimo=5).items()}
    ricuperate: dict[tuple, tuple] = {}
    for data, codice, corsa, k, cavallo in conn.execute("""
            SELECT data, codice, corsa, chiave, cavallo FROM gare_ufficiali_attesa
            WHERE stato = 'inserita'"""):
        if codice not in ippodromi:
            continue
        k_vero, _ = scheda_per(a["cavalli"], k, cavallo)   # scheda unita: chiave dell'altra
        ricuperate[(data, k_vero, corsa)] = (codice, k, f"{data}_{ippodromi[codice][1]}_{corsa}")
    senza: dict[str, list] = defaultdict(list)
    for r in conn.execute("""SELECT id, horse_name, track, distance, placement, time_km,
                                    placement_raw, driver
                             FROM races WHERE race_date IS NULL OR TRIM(race_date) = ''"""):
        senza[r[1]].append(r)

    def stesso_tempo(x, y):
        return (x is None and y is None) or (
            x is not None and y is not None and abs(float(x) - float(y)) < 0.05)

    riparate = 0
    for cavallo, libere in senza.items():
        k = gu.chiave_nome(cavallo)
        for (rid, data, pista, dist, arrivo, tempo, esito, guid, codice_gara, corsa, numero,
             partenti, allenatore, proprietario, netto, lordo, calc) in conn.execute("""
                SELECT id, race_date, track, distance, placement, time_km, placement_raw, driver,
                       race_code, race_number, start_pos, total_starters, trainer, owner,
                       prize_net, prize_gross, prize_calc
                FROM races WHERE horse_name = ? AND race_date <> '' ORDER BY race_date""",
                (cavallo,)).fetchall():
            chiave_r = (data, k, corsa)
            if chiave_r not in ricuperate or not libere:
                continue
            codice_att, k_att, codice_atteso = ricuperate[chiave_r]
            if codice_gara != codice_atteso and not re.fullmatch(rf"{data}_.*R{corsa}", codice_gara or ""):
                continue
            candidate = [u for u in libere if u[2] == pista and u[3] == dist and u[4] == arrivo
                         and stesso_tempo(u[5], tempo)]
            if not candidate:
                continue
            u = min(candidate, key=lambda c: ((c[6] or "").strip().lower() != (esito or "").strip().lower(),
                                              (c[7] or "") != (guid or ""), c[0]))
            conn.execute("""
                UPDATE races SET race_date = ?,
                       race_number = COALESCE(race_number, ?),
                       start_pos = COALESCE(start_pos, ?),
                       total_starters = COALESCE(total_starters, ?),
                       trainer = COALESCE(trainer, ?),
                       owner = COALESCE(owner, ?),
                       race_code = CASE WHEN race_code GLOB '????-??-??_*' THEN race_code ELSE ? END,
                       prize_calc = CASE WHEN prize_net IS NULL THEN ? ELSE prize_calc END,
                       prize_gross = CASE WHEN prize_net IS NULL THEN ? ELSE prize_gross END,
                       prize_net = COALESCE(prize_net, ?)
                WHERE id = ?""", (data, corsa, numero, partenti, allenatore, proprietario,
                                  codice_gara, calc, lordo, netto, u[0]))
            conn.execute("DELETE FROM races WHERE id = ?", (rid,))
            libere.remove(u)
            conn.execute("""UPDATE gare_ufficiali_attesa SET stato = 'data_assegnata', motivo = 'riparata'
                            WHERE data = ? AND codice = ? AND corsa = ? AND chiave = ?""",
                         (data, codice_att, corsa, k_att))
            del ricuperate[chiave_r]
            riparate += 1
    return riparate


def main() -> int:
    ap = argparse.ArgumentParser(description="Ripara gare doppie e schede doppie del recupero")
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--prova", action="store_true", help="conta e annulla")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'gare_ufficiali_attesa'").fetchone():
        log("[RIPARA-RECUPERO] niente da fare: il recupero non ha ancora girato")
        return 0
    if a.prova:
        copia = sqlite3.connect(":memory:")
        conn.backup(copia)
        conn.close()
        conn = copia
    prima = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    uniti = unisci_stranieri(conn)
    riparate = ripara_doppioni(conn)
    conn.commit()
    dopo = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    log(f"[RIPARA-RECUPERO] schede straniere unite: {uniti}; gare doppie riparate: {riparate}; "
        f"gare in archivio: {prima} -> {dopo}" + ("  [PROVA: niente e' stato salvato]" if a.prova else ""))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
