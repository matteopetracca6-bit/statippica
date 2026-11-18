#!/usr/bin/env python3
"""
Ripara schede doppie e dati impossibili nell'archivio (novembre 2026).

Gira ogni notte nel lavoro "Allenatori", subito dopo ripara_recupero.py. Ogni
passo controlla da solo se c'e' qualcosa da fare: se non c'e', non cambia
niente. Ogni valore corretto resta scritto nella tabella anomalie_corrette
(gara, campo, valore di prima, valore di dopo, motivo), cosi' si puo' sempre
vedere e annullare.

1. SCHEDE DOPPIE. Il recupero dai risultati ufficiali crea una scheda quando
   non trova il cavallo nell'archivio. Se la pagina ufficiale scrive il nome
   senza sigla del paese ("MAYOR SISU" per "MAYOR SISU (S)") o con la sigla
   senza parentesi ("FACE TIME BOURBON F" per "FACE TIME BOURBON"), nasce una
   seconda scheda dello stesso cavallo, con meta' delle gare. Qui si unisce
   alla scheda vera, ma solo se e' sicuro: stesso anno di nascita, stesso nome
   tolta la sigla, e stessi padre e madre. Se i genitori mancano da una delle
   due parti, servono almeno due gare identiche (stessa data, ippodromo,
   numero di corsa e arrivo) in tutte e due. Le gare
   gia' presenti nella scheda vera si tolgono, le altre passano a lei.

2. DATI IMPOSSIBILI nelle corse in Italia. Si confronta ogni gara con le altre
   righe della stessa corsa (stessa data, ippodromo e numero):
   - distanza mancante o fuori da 1000-3200 metri (0, 160, 200...): se gli
     altri cavalli della corsa hanno una distanza normale, prende quella piu'
     frequente; se tutta la corsa ha la distanza sotto i 1000 metri, la
     distanza diventa sconosciuta (NULL) invece di restare sbagliata. Le corse
     di 1000-1100 metri e quelle oltre i 3200 di tutta la corsa restano: alcune
     sono vere.
   - tempo al km impossibile: sotto 1'08"5, piu' veloce di ogni record
     italiano (1'01"9 a Cesena, 1'06"5 a Milano), oppure oltre 1'30" e piu' di
     10 secondi al km piu' lento della mediana degli altri cavalli della corsa.
     Senza altri tempi nella corsa: sotto 1'08"5 o sopra 1'45". Il
     tempo diventa sconosciuto: un record falso falsava voti e classifiche.
   - arrivo oltre il numero dei partenti: se l'arrivo e' plausibile (fino al
     20esimo) i partenti diventano almeno quanti l'arrivo piu' alto della
     corsa; se non lo e' (66esimo su 9) l'arrivo diventa sconosciuto e resta
     la scritta originale in placement_raw.

3. NUMERI DI CORSA (novembre 2026). Quando il recupero dava la data a una gara
   di TrottoWeb teneva il numero di corsa di TrottoWeb, anche se diverso da
   quello ufficiale: 2.958 gare finivano nella corsa sbagliata, e 39 corse
   risultavano con due vincitori. Le pagine ufficiali lette per gli allenatori
   (allenatori_corse) danno il numero giusto di ogni cavallo in ogni giornata
   dal 2016. Si corregge solo se e' sicuro: il cavallo compare in una sola
   corsa quel giorno su quell'ippodromo, il codice della gara (se ha un
   numero) e' d'accordo con la fonte ufficiale, e la distanza della gara e'
   quella degli altri cavalli della corsa ufficiale (o la corsa e' vuota).

4. NON PARTITI (novembre 2026). Il recupero dalle pagine ufficiali inseriva
   come gare galoppate ("r.p.") i cavalli ritirati prima del via: al posto del
   guidatore la pagina scrive l'ora del ritiro ("rit. alle 09:30:00") e il
   recupero la trasformava in un nome ("A.rit. 09:30:00"). Circa 19.000 righe:
   corse in piu' e galoppi in piu' per quei cavalli. Si spostano nella tabella
   dei non partiti (partenti_ritirati, la stessa di TrottoWeb) e si tolgono
   dalle gare, solo se senza arrivo e senza tempo.

Uso: python3 scripts/ripara_archivio.py --db data.db [--prova]
"""
import argparse
import os
import re
import sqlite3
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

# Tabelle ricalcolate ogni notte con una riga per cavallo (come in
# ripara_recupero.py): per una scheda unita a un'altra si tolgono le sue righe.
TABELLE_DERIVATE = {"horse_ratings": "name", "stima_premi": "horse_name",
                    "voto_previsto": "horse_name", "valore_residuo": "horse_name",
                    "vp_name_lookup": "horse_name"}
ORIGINE_RECUPERO = "gare_ufficiali"
RE_SIGLA_PARENTESI = re.compile(r"^(.*\S)\s+\([A-Z]{1,4}\)$")
RE_SIGLA_NUDA = re.compile(r"^(.*\S)\s+[A-Z]{1,3}$")

DIST_MIN, DIST_MAX = 1000, 3200
DIST_NORMALE = (1600, 3200)
ARRIVO_MAX = 20
# Tempo al km in secondi oltre il minuto: 8.5 = 1'08"5, piu' veloce di ogni
# record italiano; 30 = 1'30".
TEMPO_MIN, TEMPO_LENTO = 8.5, 30


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def base(nome: str) -> str:
    """Il nome senza la sigla del paese fra parentesi."""
    m = RE_SIGLA_PARENTESI.match(nome or "")
    return m.group(1) if m else (nome or "")


def prepara_registro(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS anomalie_corrette (
            race_id INTEGER, campo TEXT, prima TEXT, dopo TEXT, motivo TEXT,
            quando TEXT, PRIMARY KEY (race_id, campo))""")


def registra(conn, race_id, campo, prima, dopo, motivo):
    conn.execute("INSERT OR REPLACE INTO anomalie_corrette VALUES (?,?,?,?,?,?)",
                 (race_id, campo, None if prima is None else str(prima),
                  None if dopo is None else str(dopo), motivo,
                  datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")))


# ---------------------------------------------------------------- 1. schede

def unisci_schede_doppie(conn) -> list:
    """Ritorna le coppie (scheda tolta, scheda vera) unite."""
    cavalli = conn.execute("SELECT name, birth_year, sire, dam, source_role FROM horses").fetchall()
    per_base = defaultdict(list)
    for nome, anno, padre, madre, origine in cavalli:
        per_base[(base(nome), anno)].append((nome, padre, madre, origine))
    tabelle = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}

    def gare(nome):
        return set(conn.execute(
            "SELECT race_date, track, race_number, placement FROM races WHERE horse_name = ? "
            "AND race_date <> '' AND race_number IS NOT NULL", (nome,)).fetchall())

    unite = []
    for nome, anno, padre, madre, origine in cavalli:
        if origine != ORIGINE_RECUPERO or anno is None:
            continue
        candidati_base = {nome}
        m = RE_SIGLA_NUDA.match(nome)
        if m:
            candidati_base.add(m.group(1))
        mie = None
        trovati = []
        for b in candidati_base:
            for altro, p2, m2, _ in per_base.get((b, anno), []):
                if altro == nome:
                    continue
                noti = bool(padre and madre and p2 and m2)
                if noti:
                    # Genitori noti da tutte e due le parti: decidono loro.
                    # CARISMA BI e CARISMA sono nate nel 2018 e hanno corso
                    # una volta insieme, ma sono due cavalle diverse.
                    if (padre.strip().upper(), madre.strip().upper()) != \
                            (p2.strip().upper(), m2.strip().upper()):
                        continue
                else:
                    # Senza genitori servono almeno due gare identiche, con lo
                    # stesso arrivo: una sola puo' essere una corsa fatta
                    # insieme da due cavalli diversi.
                    if mie is None:
                        mie = gare(nome)
                    if len(mie & gare(altro)) < 2:
                        continue
                trovati.append(altro)
        trovati = sorted(set(trovati))
        if len(trovati) != 1:
            continue          # nessuno, o piu' di uno: non si indovina
        vero = trovati[0]
        for rid, d, t, n in conn.execute(
                "SELECT id, race_date, track, race_number FROM races WHERE horse_name = ?",
                (nome,)).fetchall():
            gia = conn.execute(
                "SELECT 1 FROM races WHERE horse_name = ? AND race_date = ? AND track = ? "
                "AND race_number IS ?", (vero, d, t, n)).fetchone() if d else None
            if gia:
                conn.execute("DELETE FROM races WHERE id = ?", (rid,))
            else:
                conn.execute("UPDATE races SET horse_name = ? WHERE id = ?", (vero, rid))
        conn.execute("UPDATE horses SET sire = ? WHERE sire = ?", (vero, nome))
        conn.execute("UPDATE horses SET dam = ? WHERE dam = ?", (vero, nome))
        for tabella, colonna in TABELLE_DERIVATE.items():
            if tabella in tabelle:
                conn.execute(f"DELETE FROM {tabella} WHERE {colonna} = ?", (nome,))
        conn.execute("DELETE FROM horses WHERE name = ? AND birth_year = ?", (nome, anno))
        unite.append((nome, vero))
    return unite


# ------------------------------------------------------------ 2. anomalie

def ripara_anomalie(conn) -> Counter:
    fatti = Counter()
    corse = defaultdict(list)
    for r in conn.execute("""
            SELECT id, race_date, track, race_number, distance, time_km, placement,
                   total_starters
            FROM races
            WHERE track <> 'ESTERO' AND race_date <> '' AND race_number IS NOT NULL"""):
        corse[(r[1], r[2], r[3])].append(r)

    for righe in corse.values():
        # distanza
        normali = [r[4] for r in righe if r[4] and DIST_NORMALE[0] <= r[4] <= DIST_NORMALE[1]]
        for rid, _, _, _, dist, *_ in righe:
            if dist is not None and DIST_MIN <= dist <= DIST_MAX:
                continue
            if normali:
                nuova = Counter(normali).most_common(1)[0][0]
                motivo = "distanza dagli altri cavalli della corsa"
            elif dist is None or dist >= DIST_MIN:
                continue      # tutta la corsa fuori scala ma non assurda: resta
            else:
                nuova = None
                motivo = "distanza impossibile per tutta la corsa"
            if nuova == dist:
                continue
            conn.execute("UPDATE races SET distance = ? WHERE id = ?", (nuova, rid))
            registra(conn, rid, "distance", dist, nuova, motivo)
            fatti["distanze"] += 1

        # tempo al km
        # Il confronto si fa solo con i tempi plausibili della corsa, cosi'
        # togliere un tempo sbagliato non cambia il riferimento degli altri e
        # la notte dopo non si toglie niente di nuovo.
        tempi = {r[0]: r[5] for r in righe if r[5] and r[5] > 0}
        for rid, tempo in tempi.items():
            if TEMPO_MIN <= tempo <= TEMPO_LENTO:
                continue
            ref = [t for i, t in tempi.items() if i != rid and TEMPO_MIN <= t <= 27]
            if len(ref) >= 2:
                med = round(statistics.median(ref), 1)
                if tempo < TEMPO_MIN:
                    motivo = f"sotto 1'08\"5 al km (la corsa: mediana 1'{med})"
                elif tempo > med + 10:
                    motivo = f"oltre 1'30\" e 10\"/km piu' lento della corsa (mediana 1'{med})"
                else:
                    continue
            elif tempo < TEMPO_MIN or tempo > 45:
                motivo = "tempo impossibile"
            else:
                continue
            conn.execute("UPDATE races SET time_km = NULL WHERE id = ?", (rid,))
            registra(conn, rid, "time_km", tempo, None, motivo)
            fatti["tempi"] += 1

        # arrivo oltre i partenti
        arrivi = [r[6] for r in righe if r[6] and r[6] <= ARRIVO_MAX]
        for rid, _, _, _, _, _, arrivo, partenti in righe:
            if not (arrivo and partenti and arrivo > partenti):
                continue
            if arrivo > ARRIVO_MAX:
                conn.execute("UPDATE races SET placement = NULL WHERE id = ?", (rid,))
                registra(conn, rid, "placement", arrivo, None, f"arrivo {arrivo} su {partenti} partenti")
                fatti["arrivi"] += 1
            else:
                nuovi = max(arrivi + [len(righe)])
                conn.execute("UPDATE races SET total_starters = ? WHERE id = ?", (nuovi, rid))
                registra(conn, rid, "total_starters", partenti, nuovi,
                         f"arrivo {arrivo} con {partenti} partenti")
                fatti["partenti"] += 1
    return fatti


def _chiave(nome) -> str:
    n = re.sub(r"\s*\([^)]*\)\s*$", "", str(nome or "").upper())
    return re.sub(r"[^A-Z0-9]", "", n)


def allinea_numeri_corsa(conn) -> int:
    """Numero di corsa dalle pagine ufficiali (vedi punto 3 in testa)."""
    tab = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if not {"allenatori_corse", "gare_ufficiali_mappa"} <= tab:
        return 0
    pista_cod = {a.split("|")[0]: u for u, a in conn.execute(
        "SELECT ufficiale, archivio FROM gare_ufficiali_mappa WHERE tipo = 'ippodromo'")}
    uff = defaultdict(set)
    for d, cod, corsa, k in conn.execute("SELECT data, codice, corsa, chiave FROM allenatori_corse"):
        uff[(d, cod, k)].add(corsa)
    righe = conn.execute("""SELECT id, horse_name, race_date, track, race_number, race_code, distance
                            FROM races WHERE race_date >= '2016-01-01' AND track <> 'ESTERO'
                              AND race_number IS NOT NULL""").fetchall()
    distanze = defaultdict(Counter)
    for _, _, d, t, n, _, dist in righe:
        distanze[(d, t, n)][dist] += 1
    fatte = 0
    for rid, h, d, t, n, codice, dist in righe:
        cod = pista_cod.get(t)
        s = uff.get((d, cod, _chiave(h))) if cod else None
        if not s:
            continue
        m_r = re.search(r"_R(\d+)$", codice or "")
        if len(s) > 1:
            # Batteria e finale lo stesso giorno: due corse ufficiali. La riga
            # col codice della pagina dei risultati (..._R2) appartiene a quella
            # corsa; il numero di TrottoWeb (spesso quello della finale) no.
            if not (m_r and int(m_r.group(1)) in s and n in s and int(m_r.group(1)) != n):
                continue
            giusto = int(m_r.group(1))
        else:
            giusto = next(iter(s))
        if giusto == n:
            continue
        m = re.search(r"_R?(\d+)$", codice or "")
        if m and re.match(r"\d{4}-\d\d-\d\d_", codice or "") and int(m.group(1)) != giusto:
            continue
        altri = distanze.get((d, t, giusto))
        if altri and dist not in altri:
            continue
        conn.execute("UPDATE races SET race_number = ? WHERE id = ?", (giusto, rid))
        registra(conn, rid, "race_number", n, giusto, "numero della corsa ufficiale")
        distanze[(d, t, n)][dist] -= 1
        distanze[(d, t, giusto)][dist] += 1
        fatte += 1
    return fatte


def togli_non_partiti(conn) -> int:
    """Righe di cavalli ritirati prima del via (vedi punto 4 in testa)."""
    righe = conn.execute("""
        SELECT id, horse_name, race_date, track, race_code, driver FROM races
        WHERE (driver LIKE 'A.rit.%' OR driver = 'S.Ritirato Campo' OR driver = 'Ritirato')
          AND placement IS NULL AND time_km IS NULL""").fetchall()
    if not righe:
        return 0
    conn.execute("""CREATE TABLE IF NOT EXISTS partenti_ritirati (
        race_date TEXT, track TEXT, horse_name TEXT, race_code TEXT)""")
    for rid, h, d, t, codice, guid in righe:
        conn.execute("INSERT OR IGNORE INTO partenti_ritirati (race_date, track, horse_name, race_code) "
                     "VALUES (?,?,?,?)", (d, t, h, codice))
        registra(conn, rid, "riga", guid, "non partito", "ritirato prima del via: non e' una gara")
        conn.execute("DELETE FROM races WHERE id = ?", (rid,))
    return len(righe)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ripara schede doppie e dati impossibili")
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--prova", action="store_true", help="conta e annulla")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    if a.prova:
        copia = sqlite3.connect(":memory:")
        conn.backup(copia)
        conn.close()
        conn = copia
    prepara_registro(conn)
    prima = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    unite = unisci_schede_doppie(conn)
    fatti = ripara_anomalie(conn)
    numeri = allinea_numeri_corsa(conn)
    non_partiti = togli_non_partiti(conn)
    conn.commit()
    dopo = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    log(f"[RIPARA-ARCHIVIO] schede doppie unite: {len(unite)}"
        + (f" ({', '.join(f'{x} -> {y}' for x, y in unite[:10])})" if unite else "")
        + f"; distanze: {fatti['distanze']}; tempi tolti: {fatti['tempi']}; "
        f"partenti: {fatti['partenti']}; arrivi tolti: {fatti['arrivi']}; numeri di corsa: {numeri}; non partiti tolti: {non_partiti}; "
        f"gare in archivio: {prima} -> {dopo}"
        + ("  [PROVA: niente e' stato salvato]" if a.prova else ""))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
