#!/usr/bin/env python3
"""Rimette i premi alle gare registrate a zero per errore.

IL DIFETTO. La pagina dei risultati di Trottoweb esiste in due versioni: una
senza la colonna del premio (flag_ris_u=0) e una con (flag_ris_u=1). I
collegamenti della homepage puntano alla prima. Chi leggeva quella pagina non
trovava la colonna del premio e scriveva zero, e la gara finiva in archivio
come se non avesse fruttato nulla anche quando era stata vinta.

Ha colpito ogni gara raccolta da quel percorso: dal 30 giugno 2026 in avanti,
8.499 gare concluse con un piazzamento e premio zero. La raccolta e' stata
riparata (nightly_update.py chiede ora la versione con i premi), ma le gare
gia' registrate restano a zero finche' non si rileggono.

COSA FA. Trova i convegni che contengono gare senza premio, riscarica ognuno
nella versione con i premi, e aggiorna il premio delle gare che combaciano per
data, ippodromo e nome del cavallo.

CAUTELE, perche' uno script che riscrive l'archivio va trattato con sospetto:
  - tocca SOLO le righe che hanno premio nullo o zero. Un premio gia' presente
    non viene mai sovrascritto: se la fonte fosse cambiata, perderemmo il dato
    buono senza accorgercene.
  - il premio letto e' il NETTO. Verificato incrociando 18 gare del vecchio
    archivio di cui si conoscevano sia netto sia lordo: combaciava sempre col
    netto. Il lordo non viene fornito e non si inventa (il rapporto
    netto/lordo non e' costante), quindi resta vuoto.
  - con --prova non scrive niente: mostra solo cosa farebbe. Usalo prima.
  - scrive solo alla fine di ogni convegno, e riporta un totale verificabile.

Uso:
    python3 scripts/recupera_premi.py --prova          # mostra, non scrive
    python3 scripts/recupera_premi.py                  # esegue
    python3 scripts/recupera_premi.py --limite 5       # solo i primi 5 convegni
"""
import argparse
import importlib.util
import os
import sqlite3
import sys
import time

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def carica_nightly():
    """Riusa i lettori di nightly_update.py invece di riscriverli.

    Due lettori della stessa pagina divergono sempre col tempo, e un lettore
    che sbaglia in silenzio e' esattamente il difetto che stiamo riparando.
    """
    spec = importlib.util.spec_from_file_location(
        "nu", os.path.join(RADICE, "nightly_update.py"))
    nu = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nu)
    return nu


def convegni_da_recuperare(conn) -> list[tuple[str, str, int]]:
    """Data, ippodromo e numero di gare senza premio, dai piu' recenti."""
    return list(conn.execute("""
        SELECT race_date, track, COUNT(*) AS n
          FROM races
         WHERE placement IS NOT NULL
           AND (prize_net IS NULL OR prize_net = 0)
           AND race_date >= '2026-06-01'
      GROUP BY race_date, track
      ORDER BY race_date DESC
    """))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(RADICE, "data.db"))
    ap.add_argument("--prova", action="store_true",
                    help="mostra cosa farebbe senza scrivere niente")
    ap.add_argument("--limite", type=int, default=0,
                    help="ferma dopo N convegni (0 = tutti)")
    a = ap.parse_args()

    if not os.path.exists(a.db):
        print(f"ERRORE: archivio non trovato in {a.db}", file=sys.stderr)
        return 1

    nu = carica_nightly()
    conn = sqlite3.connect(a.db)
    conn.row_factory = sqlite3.Row

    da_fare = convegni_da_recuperare(conn)
    totale_gare = sum(r["n"] for r in da_fare)
    print(f"Convegni con gare senza premio: {len(da_fare)} "
          f"({totale_gare} gare)")
    if a.prova:
        print("MODALITA' PROVA: non scrivo niente.\n")
    print()

    # Gli indirizzi dei convegni: dalla homepage si vedono solo gli ultimi
    # giorni, quindi per i piu' vecchi l'indirizzo va costruito. Serve la
    # sigla dell'ippodromo, che si ricava dai convegni noti.
    sigle: dict[str, str] = {}
    for c in nu._fetch_all_hris_convegni():
        if c.get("ippodromo") and c.get("sigla"):
            sigle[c["ippodromo"].upper().strip()] = c["sigla"]
    # e dal codice gara già in archivio (formato data_SIGLA_Rn)
    for r in conn.execute("""SELECT DISTINCT track, race_code FROM races
                              WHERE race_code LIKE '%\\_%\\_R%' ESCAPE '\\'
                                AND race_date >= '2026-06-01'"""):
        pezzi = (r["race_code"] or "").split("_")
        if len(pezzi) >= 3 and r["track"]:
            sigle.setdefault(r["track"].upper().strip(), pezzi[-2])

    aggiornate_tot = 0
    non_trovate_tot = 0
    convegni_ok = 0
    convegni_ko: list[str] = []

    for i, r in enumerate(da_fare, 1):
        if a.limite and i > a.limite:
            print(f"\n(fermato al limite di {a.limite} convegni)")
            break

        data, ippo, n = r["race_date"], r["track"], r["n"]
        sigla = sigle.get((ippo or "").upper().strip())
        if not sigla:
            print(f"[{i}/{len(da_fare)}] {data} {ippo}: sigla sconosciuta, salto")
            convegni_ko.append(f"{data} {ippo} (sigla sconosciuta)")
            continue

        url = ("https://www.trottoweb.it/TrottoWeb/php_resp/hRis.php"
               f"?data={data}&sigla={sigla}&ippodromo={ippo.replace(' ', '+')}"
               "&flag_ris_u=1")
        soup = nu.fetch_url(url)
        if not soup:
            print(f"[{i}/{len(da_fare)}] {data} {ippo}: pagina non raggiungibile")
            convegni_ko.append(f"{data} {ippo} (non raggiungibile)")
            continue

        righe = nu._parse_hris_page(soup, data, ippo, sigla)
        premi = {x["name"]: x["prize"] for x in righe if x.get("prize")}
        if not premi:
            # Nessun premio sulla pagina: puo' essere una riunione i cui premi
            # non sono ancora pubblicati. Non e' un errore, ma va detto.
            print(f"[{i}/{len(da_fare)}] {data} {ippo}: nessun premio sulla "
                  f"pagina ({len(righe)} righe), forse non ancora pubblicati")
            convegni_ko.append(f"{data} {ippo} (premi non pubblicati)")
            continue

        agg = 0
        non_trovate = 0
        for g in conn.execute("""
                SELECT id, horse_name FROM races
                 WHERE race_date = ? AND track = ?
                   AND placement IS NOT NULL
                   AND (prize_net IS NULL OR prize_net = 0)""", (data, ippo)):
            p = premi.get(g["horse_name"])
            if p is None:
                non_trovate += 1
                continue
            if not a.prova:
                # Solo prize_net: il lordo non e' fornito dalla pagina e
                # inventarlo con un rapporto fisso darebbe numeri falsi.
                conn.execute("UPDATE races SET prize_net = ? WHERE id = ?",
                             (p, g["id"]))
            agg += 1

        if not a.prova:
            conn.commit()

        aggiornate_tot += agg
        non_trovate_tot += non_trovate
        convegni_ok += 1
        extra = f", {non_trovate} senza premio anche sulla pagina" if non_trovate else ""
        print(f"[{i}/{len(da_fare)}] {data} {ippo}: {agg} gare su {n} "
              f"aggiornate{extra}")

        time.sleep(1.0)  # non martellare il sito della fonte

    print()
    print(f"Convegni letti: {convegni_ok}")
    print(f"Gare con premio rimesso: {aggiornate_tot}")
    if non_trovate_tot:
        print(f"Gare restate a zero (nessun premio sulla pagina): {non_trovate_tot}")
    if convegni_ko:
        print(f"Convegni non recuperati: {len(convegni_ko)}")
        for x in convegni_ko[:15]:
            print(f"  - {x}")
        if len(convegni_ko) > 15:
            print(f"  ... e altri {len(convegni_ko) - 15}")

    if a.prova:
        print("\nMODALITA' PROVA: nessuna modifica scritta.")
        return 0

    # I totali di carriera (gare, vittorie, guadagni, record) stanno nella
    # tabella dei cavalli, calcolati a parte dalle singole gare. Rimettere i
    # premi NON li aggiorna da solo: senza questo passaggio la scheda del
    # cavallo continua a mostrare un guadagno piu' basso del vero, ed e'
    # un errore difficile da notare perche' il numero c'e' ed e' plausibile.
    #
    # Si riusa la funzione di nightly_update.py invece di riscrivere il
    # calcolo: due conti della stessa cosa col tempo divergono.
    print()
    print("Ricalcolo i totali di carriera dei cavalli toccati...")
    nomi = [r[0] for r in conn.execute("""
        SELECT DISTINCT horse_name FROM races
         WHERE race_date >= '2026-06-01' AND prize_net > 0""")]
    for i, nome in enumerate(nomi, 1):
        nu._update_horse_career_stats(conn, nome)
        if i % 500 == 0:
            conn.commit()
    conn.commit()
    print(f"Totali rifatti per {len(nomi)} cavalli.")

    # Controllo finale: i totali combaciano con la somma delle gare?
    resti = conn.execute("""
        SELECT COUNT(*) FROM horses h
         WHERE EXISTS (SELECT 1 FROM races r WHERE r.horse_name = h.name
                         AND r.race_date >= '2026-06-01')
           AND ABS(COALESCE(h.career_earnings, 0) -
                   (SELECT COALESCE(SUM(prize_net), 0) FROM races
                     WHERE horse_name = h.name AND placement IS NOT NULL)) > 1
    """).fetchone()[0]
    if resti:
        # Puo' succedere per cavalli le cui gare non rientrano nel filtro:
        # vanno rifatti anche loro, altrimenti resta un numero sbagliato.
        print(f"Ne restavano {resti} disallineati: li rifaccio.")
        altri = [r[0] for r in conn.execute("""
            SELECT h.name FROM horses h
             WHERE EXISTS (SELECT 1 FROM races r WHERE r.horse_name = h.name
                             AND r.race_date >= '2026-06-01')
               AND ABS(COALESCE(h.career_earnings, 0) -
                       (SELECT COALESCE(SUM(prize_net), 0) FROM races
                         WHERE horse_name = h.name AND placement IS NOT NULL)) > 1""")]
        for nome in altri:
            nu._update_horse_career_stats(conn, nome)
        conn.commit()
    print("Totali di carriera allineati.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
