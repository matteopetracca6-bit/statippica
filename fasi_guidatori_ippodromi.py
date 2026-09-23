"""
Due fasi nuove del lavoro notturno: valutazione dei guidatori e schede degli
ippodromi.

Questo file viene importato da nightly_update.py. Sta a parte perche' il file
principale ha gia' oltre quattromila righe.

── PERCHE' I GUIDATORI SI MISURANO COSI' ──

Il conto ingenuo, la percentuale di vittorie, non misura il guidatore: misura i
cavalli che gli affidano. Chi guida per una grande scuderia vince spesso perche'
ha sotto i cavalli migliori, e chi guida cavalli modesti perde anche se e'
bravissimo.

Il confronto si fa DENTRO lo stesso cavallo. Per ogni gara si guarda quanto il
piazzamento si discosta dalla media di QUEL cavallo: se un cavallo arriva di
solito a meta' gruppo e con un certo guidatore arriva davanti, quel guidatore ha
aggiunto qualcosa. Nell'archivio 12.224 cavalli sono stati guidati da almeno
quattro persone diverse, quindi il confronto e' possibile su larga scala.

Si corregge anche per il NUMERO DI PARTENZA, perche' altrimenti si addebita al
guidatore la sfortuna del sorteggio: partire dal dodici fa arrivare nei primi
tre il 27% delle volte contro il 49% del primo, e chi parte spesso dietro
sembrerebbe scarso senza colpa.

VERIFICA FATTA PRIMA DI SCRIVERE QUESTO CODICE. Il rendimento dei guidatori
fino al 2022 predice quello dal 2023 con correlazione +0,616 su 466 guidatori,
cioe' il 38% spiegato. Non e' rumore: e' lo stesso ordine di grandezza della
valutazione degli stalloni sulla progenie, e sedici volte il segnale della
previsione sul singolo puledro.

── AFFIDABILITA' ──

Come per gli stalloni, il giudizio porta con se' quanto vale. Un guidatore con
30 gare non e' giudicabile, e la formula n/(n+k) lo dichiara invece di
nasconderlo.
"""

from __future__ import annotations

import sqlite3
import sys

# Sotto questo numero di gare il rendimento e' dominato dal caso e il guidatore
# non entra nemmeno in tabella.
MIN_GARE_GUIDATORE = 30

# Costante di affidabilita': con k gare il giudizio vale mezzo. Ricavata dalla
# verifica sopra: serve circa un centinaio di gare perche' il rendimento passato
# dica qualcosa di solido su quello futuro.
K_GARE = 100.0

# Sotto cinque partenti lo scarto dalla media perde significato: in una gara da
# tre cavalli arrivare terzo non e' un risultato confrontabile.
MIN_PARTENTI = 4


def etichetta_affidabilita(a: float) -> str:
    if a >= 0.80:
        return "molto alta"
    if a >= 0.60:
        return "alta"
    if a >= 0.40:
        return "media"
    if a >= 0.20:
        return "bassa"
    return "insufficiente"


def crea_tabelle(conn: sqlite3.Connection) -> None:
    """Le due tabelle sono dati derivati: si possono ricostruire da zero."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS driver_stats (
            driver            TEXT PRIMARY KEY,
            n_gare            INTEGER,
            n_gare_recenti    INTEGER,
            n_cavalli         INTEGER,
            n_vittorie        INTEGER,
            pct_vittorie      REAL,
            pct_primi_tre     REAL,
            -- Lo scarto medio dalla media del cavallo, in quota di gruppo.
            -- Negativo = porta i cavalli a fare meglio del loro solito.
            effetto           REAL,
            -- Lo stesso corretto per il numero di partenza.
            effetto_corretto  REAL,
            affidabilita      REAL,
            affidabilita_txt  TEXT,
            partenza_media    REAL,
            premi_totali      REAL,
            prima_gara        TEXT,
            ultima_gara       TEXT,
            ippodromo_top     TEXT,
            attivo            INTEGER
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS track_stats (
            track              TEXT PRIMARY KEY,
            nome               TEXT,
            n_gare             INTEGER,
            n_cavalli          INTEGER,
            n_giornate         INTEGER,
            prima_gara         TEXT,
            ultima_gara        TEXT,
            distanza_tipica    INTEGER,
            tempo_km_mediano   REAL,
            premio_medio       REAL,
            premio_massimo     REAL,
            partenti_medi      REAL,
            -- Quanto pesa partire dietro su QUESTA pista: differenza fra la
            -- probabilita' di arrivare nei primi tre partendo dai primi tre
            -- numeri e partendo dal settimo in poi.
            vantaggio_interno  REAL,
            n_guidatori        INTEGER,
            attivo             INTEGER
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS start_pos_stats (
            start_pos      INTEGER,
            track          TEXT,
            n_gare         INTEGER,
            pct_vittorie   REAL,
            pct_primi_tre  REAL,
            PRIMARY KEY (start_pos, track)
        )
    """)
    conn.commit()


# L'archivio scrive gia' il nome della citta'. Qui si aggiunge il nome
# dell'impianto, che e' quello con cui la pista e' conosciuta nell'ambiente.
NOMI_IPPODROMI = {
    "NAPOLI": "Napoli \u2014 Agnano",
    "ROMA": "Roma \u2014 Tor di Valle",
    "BOLOGNA": "Bologna \u2014 Arcoveggio",
    "TARANTO": "Taranto \u2014 Paolo VI",
    "AVERSA": "Aversa \u2014 Ippodromo di Aversa",
    "MILANO": "Milano \u2014 San Siro",
    "MONTEGIORGIO": "Montegiorgio",
    "TORINO": "Torino \u2014 Vinovo",
    "PALERMO": "Palermo \u2014 La Favorita",
    "CASTELLUCCIO": "Castelluccio dei Sauri",
    "FIRENZE": "Firenze \u2014 Le Cascine",
    "PADOVA": "Padova",
    "CESENA": "Cesena \u2014 Savio",
    "MODENA": "Modena",
    "SIRACUSA": "Siracusa",
    "MONTECATINI": "Montecatini \u2014 Sesana",
    "GARIGLIANO": "Garigliano",
    "FOLLONICA": "Follonica",
    "TREVISO": "Treviso \u2014 Sant'Artemio",
    "VILLANOVA": "Villanova d'Arda",
    "TRIESTE": "Trieste \u2014 Montebello",
    "PONTECAGNANO": "Pontecagnano",
    "CASARANO": "Casarano",
    "PRATO": "Prato",
    "CIVITANOVA": "Civitanova Marche",
    "FERRARA": "Ferrara",
}

# ATTENZIONE: "ESTERO" non e' un ippodromo. La fonte ci raccoglie sotto tutte
# le gare corse fuori dall'Italia, che sono 39.801 e appartengono a decine di
# piste diverse in paesi diversi. Trattarlo come una pista produrrebbe una
# scheda senza senso: un "ippodromo" con 4.165 giornate di corse, piu' del
# doppio di qualsiasi pista vera, e un premio medio che mescola il Prix
# d'Amerique con una corsa di provincia svedese. Resta nei conti dei cavalli e
# dei guidatori, ma non ha una scheda propria e la pagina lo dice.
NON_IPPODROMI = {"ESTERO"}

# Quante gare deve avere una voce per essere considerata un ippodromo vero.
#
# PERCHE' SERVE, trovato provando in linea: fra le schede erano comparsi "TO"
# con 1 gara, "MC" con 2 ed "ES" con 5. Non sono piste: sono sigle troncate,
# residui di righe scritte male dalla fonte. Un ippodromo che ospita corse ne
# ospita a migliaia, quindi la soglia separa le piste vere dalla sporcizia
# senza dover inseguire i singoli casi. La piu' piccola pista vera
# dell'archivio, Ferrara, ne ha 1.834: mille sta largo sotto di lei e molto
# sopra i residui.
MIN_GARE_IPPODROMO = 1000


def phase_driver_stats(conn: sqlite3.Connection) -> int:
    """Valuta i guidatori confrontandoli dentro lo stesso cavallo."""
    print("[GUIDATORI] Calcolo rendimento guidatori...", file=sys.stderr)
    crea_tabelle(conn)
    conn.execute("DELETE FROM driver_stats")

    # 1. Media di ogni cavallo: dove arriva di solito, come quota del gruppo.
    #    Si richiedono almeno 5 gare, altrimenti la "media del cavallo" e' essa
    #    stessa un numero casuale e lo scarto non significa niente.
    media_cavallo: dict[str, float] = {}
    for nome, media, n in conn.execute(f"""
        SELECT horse_name,
               AVG(CAST(placement AS REAL) / total_starters),
               COUNT(*)
        FROM races
        WHERE placement IS NOT NULL AND total_starters > {MIN_PARTENTI}
        GROUP BY horse_name
        HAVING COUNT(*) >= 5
    """):
        if media is not None:
            media_cavallo[nome] = media

    # 2. Effetto del numero di partenza, calcolato una volta su tutto
    #    l'archivio: serve a non addebitare al guidatore il sorteggio.
    media_partenza: dict[int, float] = {}
    for pos, media in conn.execute(f"""
        SELECT start_pos, AVG(CAST(placement AS REAL) / total_starters)
        FROM races
        WHERE placement IS NOT NULL AND total_starters > {MIN_PARTENTI}
          AND start_pos BETWEEN 1 AND 20
        GROUP BY start_pos
    """):
        if media is not None:
            media_partenza[pos] = media
    media_generale = (sum(media_partenza.values()) / len(media_partenza)) if media_partenza else 0.5

    # 3. Una passata sulle gare, accumulando per guidatore.
    from collections import defaultdict
    scarti: dict[str, list] = defaultdict(list)
    scarti_corretti: dict[str, list] = defaultdict(list)
    cavalli: dict[str, set] = defaultdict(set)
    partenze: dict[str, list] = defaultdict(list)
    piste: dict[str, dict] = defaultdict(lambda: defaultdict(int))

    for driver, horse, place, tot, pos, track in conn.execute(f"""
        SELECT driver, horse_name, placement, total_starters, start_pos, track
        FROM races
        WHERE placement IS NOT NULL AND total_starters > {MIN_PARTENTI}
          AND driver IS NOT NULL AND TRIM(driver) != ''
    """):
        m = media_cavallo.get(horse)
        if m is None:
            continue
        quota = place / tot
        scarti[driver].append(quota - m)
        cavalli[driver].add(horse)
        if track:
            piste[driver][track] += 1
        if pos and 1 <= pos <= 20:
            partenze[driver].append(pos)
            # Si toglie anche l'effetto del numero di partenza: se partiva
            # dodicesimo, ci si aspettava gia' un piazzamento peggiore.
            atteso_pos = media_partenza.get(pos, media_generale) - media_generale
            scarti_corretti[driver].append(quota - m - atteso_pos)

    # 4. I numeri che non dipendono dal confronto interno.
    grezzi = {}
    for d, n, nv, n3, prem, prima, ultima, recenti in conn.execute("""
        SELECT driver,
               COUNT(*),
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END),
               SUM(CASE WHEN placement <= 3 THEN 1 ELSE 0 END),
               SUM(COALESCE(prize_net, 0)),
               MIN(race_date), MAX(race_date),
               SUM(CASE WHEN race_date >= date('now', '-18 months') THEN 1 ELSE 0 END)
        FROM races
        WHERE driver IS NOT NULL AND TRIM(driver) != ''
        GROUP BY driver
    """):
        grezzi[d] = (n, nv or 0, n3 or 0, prem or 0, prima, ultima, recenti or 0)

    righe = []
    for d, sc in scarti.items():
        if len(sc) < MIN_GARE_GUIDATORE:
            continue
        n, nv, n3, prem, prima, ultima, recenti = grezzi.get(d, (len(sc), 0, 0, 0, None, None, 0))
        sc_corr = scarti_corretti.get(d) or sc
        aff = len(sc) / (len(sc) + K_GARE)
        pista_top = max(piste[d].items(), key=lambda x: x[1])[0] if piste.get(d) else None
        righe.append((
            d, n, recenti, len(cavalli[d]), nv,
            round(100 * nv / n, 2) if n else 0,
            round(100 * n3 / n, 2) if n else 0,
            round(sum(sc) / len(sc), 4),
            round(sum(sc_corr) / len(sc_corr), 4),
            round(aff, 3), etichetta_affidabilita(aff),
            round(sum(partenze[d]) / len(partenze[d]), 2) if partenze.get(d) else None,
            round(prem, 2), prima, ultima, pista_top,
            1 if recenti >= 10 else 0,
        ))

    conn.executemany("""
        INSERT OR REPLACE INTO driver_stats
        (driver, n_gare, n_gare_recenti, n_cavalli, n_vittorie, pct_vittorie,
         pct_primi_tre, effetto, effetto_corretto, affidabilita, affidabilita_txt,
         partenza_media, premi_totali, prima_gara, ultima_gara, ippodromo_top, attivo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, righe)
    conn.commit()
    attivi = sum(1 for r in righe if r[-1])
    print(f"  [GUIDATORI] {len(righe)} valutati, {attivi} in attivita'", file=sys.stderr)
    return len(righe)


def phase_track_stats(conn: sqlite3.Connection) -> int:
    """Scheda di ogni ippodromo, piu' la tabella dei numeri di partenza."""
    print("[IPPODROMI] Calcolo schede ippodromi...", file=sys.stderr)
    crea_tabelle(conn)
    conn.execute("DELETE FROM track_stats")
    conn.execute("DELETE FROM start_pos_stats")

    righe = []
    for (track, n_gare, n_cav, n_gio, prima, ultima, prem_medio, prem_max,
         partenti, tkm, n_guid) in conn.execute("""
        SELECT track,
               COUNT(*), COUNT(DISTINCT horse_name), COUNT(DISTINCT race_date),
               MIN(race_date), MAX(race_date),
               AVG(NULLIF(prize_gross, 0)), MAX(prize_gross),
               AVG(NULLIF(total_starters, 0)),
               AVG(NULLIF(time_km, 0)),
               COUNT(DISTINCT driver)
        FROM races
        WHERE track IS NOT NULL AND TRIM(track) != ''
        GROUP BY track
    """):
        # Distanza piu' frequente, non media: le distanze sono categorie
        # (1600, 2100, 2600), e la loro media non corrisponde a nessuna gara.
        dist = conn.execute("""
            SELECT distance FROM races
            WHERE track = ? AND distance IS NOT NULL AND distance > 0
            GROUP BY distance ORDER BY COUNT(*) DESC LIMIT 1
        """, (track,)).fetchone()

        # Quanto pesa partire dietro su questa pista.
        interno = conn.execute("""
            SELECT AVG(CASE WHEN placement <= 3 THEN 1.0 ELSE 0 END)
            FROM races WHERE track = ? AND placement IS NOT NULL
              AND start_pos BETWEEN 1 AND 3 AND total_starters > 4
        """, (track,)).fetchone()[0]
        esterno = conn.execute("""
            SELECT AVG(CASE WHEN placement <= 3 THEN 1.0 ELSE 0 END)
            FROM races WHERE track = ? AND placement IS NOT NULL
              AND start_pos >= 7 AND total_starters > 4
        """, (track,)).fetchone()[0]
        vantaggio = (round(100 * (interno - esterno), 2)
                     if interno is not None and esterno is not None else None)

        recenti = conn.execute("""
            SELECT COUNT(*) FROM races
            WHERE track = ? AND race_date >= date('now', '-12 months')
        """, (track,)).fetchone()[0]

        if track in NON_IPPODROMI or n_gare < MIN_GARE_IPPODROMO:
            continue

        righe.append((
            track, NOMI_IPPODROMI.get(track, track.title()), n_gare, n_cav, n_gio,
            prima, ultima,
            dist[0] if dist else None,
            round(tkm, 2) if tkm else None,
            round(prem_medio, 2) if prem_medio else None,
            prem_max,
            round(partenti, 2) if partenti else None,
            vantaggio, n_guid,
            1 if recenti >= 20 else 0,
        ))

    conn.executemany("""
        INSERT OR REPLACE INTO track_stats
        (track, nome, n_gare, n_cavalli, n_giornate, prima_gara, ultima_gara,
         distanza_tipica, tempo_km_mediano, premio_medio, premio_massimo,
         partenti_medi, vantaggio_interno, n_guidatori, attivo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, righe)

    # Tabella dei numeri di partenza: una riga per pista e una complessiva
    # (track = "*"), cosi' la pagina puo' mostrare entrambe senza ricalcolare.
    pos_righe = []
    for pos, n, v, t in conn.execute("""
        SELECT start_pos, COUNT(*),
               AVG(CASE WHEN placement = 1 THEN 1.0 ELSE 0 END) * 100,
               AVG(CASE WHEN placement <= 3 THEN 1.0 ELSE 0 END) * 100
        FROM races
        WHERE placement IS NOT NULL AND start_pos BETWEEN 1 AND 16
          AND total_starters > 4
        GROUP BY start_pos
    """):
        pos_righe.append((pos, "*", n, round(v, 2), round(t, 2)))

    for pos, track, n, v, t in conn.execute("""
        SELECT start_pos, track, COUNT(*),
               AVG(CASE WHEN placement = 1 THEN 1.0 ELSE 0 END) * 100,
               AVG(CASE WHEN placement <= 3 THEN 1.0 ELSE 0 END) * 100
        FROM races
        WHERE placement IS NOT NULL AND start_pos BETWEEN 1 AND 16
          AND total_starters > 4 AND track IS NOT NULL AND TRIM(track) != ''
        GROUP BY start_pos, track
        HAVING COUNT(*) >= 200
    """):
        pos_righe.append((pos, track, n, round(v, 2), round(t, 2)))

    conn.executemany("""
        INSERT OR REPLACE INTO start_pos_stats
        (start_pos, track, n_gare, pct_vittorie, pct_primi_tre)
        VALUES (?,?,?,?,?)
    """, pos_righe)
    conn.commit()
    print(f"  [IPPODROMI] {len(righe)} ippodromi, {len(pos_righe)} righe partenza",
          file=sys.stderr)
    return len(righe)
