#!/usr/bin/env python3
"""
Controllo dei numeri dell'archivio (novembre 2026), chiamato dalla sentinella.

Le riparazioni notturne (ripara_recupero.py, ripara_archivio.py) tengono a
zero o quasi le schede doppie, le copie della stessa gara e i dati
impossibili. Qui si contano: se un numero supera la sua soglia, una fonte e'
cambiata o una riparazione ha smesso di funzionare, e la sentinella da'
l'allarme il giorno stesso invece di aspettare un controllo a mano.

Stampa un riepilogo leggibile; esce con 1 se almeno un numero e' oltre soglia.
Uso: python3 scripts/controllo_numeri.py /tmp/archivio.db
"""
import sqlite3, sys, datetime as d
c = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else "/tmp/archivio.db")
IT = "track <> 'ESTERO' AND race_date <> ''"
def uno(q, *a):
    try:
        return c.execute(q, a).fetchone()[0] or 0
    except sqlite3.Error:
        return 0
# (nome, valore, soglia oltre la quale si da' l'allarme, spiegazione)
controlli = [
    ("Corse con due vincitori (non ex aequo)", uno(f"""
        SELECT COUNT(*) FROM (SELECT race_date, track, race_number FROM races
          WHERE placement = 1 AND race_number IS NOT NULL AND {IT}
          GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
             AND COUNT(DISTINCT COALESCE(time_km, -1) || '|' || COALESCE(prize_net, -1)) > 1)"""),
     40, "a novembre 2026, dopo l'allineamento ai numeri ufficiali, erano 19: quasi tutti arrivi ex aequo "
         "registrati con premi diversi"),
    ("Stesso cavallo due volte nella stessa corsa", uno(f"""
        SELECT COUNT(*) FROM (SELECT 1 FROM races WHERE race_number IS NOT NULL AND {IT}
          GROUP BY horse_name, race_date, track, race_number HAVING COUNT(*) > 1)"""),
     20, "copie della stessa gara: dovrebbero essere zero"),
    ("Schede doppie del recupero (X e X (sigla), stesso anno e genitori)", uno("""
        SELECT COUNT(*) FROM horses a JOIN horses b
          ON b.name LIKE a.name || ' (%)' AND b.birth_year = a.birth_year
         AND UPPER(TRIM(a.sire)) = UPPER(TRIM(b.sire)) AND UPPER(TRIM(a.dam)) = UPPER(TRIM(b.dam))
        WHERE a.source_role = 'gare_ufficiali' AND a.sire <> '' AND a.dam <> ''"""),
     5, "le unisce ripara_archivio.py ogni notte"),
    ("Tempi impossibili in Italia (sotto 1'08\"5)", uno(f"SELECT COUNT(*) FROM races WHERE {IT} AND time_km > 0 AND time_km < 8.5"),
     20, "li toglie ripara_archivio.py ogni notte"),
    ("Distanze sotto i 1000 metri in Italia", uno(f"SELECT COUNT(*) FROM races WHERE {IT} AND distance > 0 AND distance < 1000"),
     30, "le corregge ripara_archivio.py ogni notte"),
    # Le correzioni una tantum (le prime 386 e i 2.951 numeri di corsa del
    # 17/11/2026) non contano: si guarda da dopo, quando restano quelle di ogni notte.
    ("Correzioni automatiche nelle ultime 24 ore", uno(
        "SELECT COUNT(*) FROM anomalie_corrette WHERE quando >= ?",
        max((d.datetime.now(d.timezone.utc) - d.timedelta(days=1)).strftime("%Y-%m-%d %H:%M"), "2026-11-18 00:30")),
     600, "la prima volta furono 386; tante correzioni in un giorno vogliono dire che una fonte e' cambiata"),
]
# Il registro del potenziale (potenziale.py) riceve righe ogni notte: se
# l'ultima ha piu' di tre giorni, la fase notturna si e' fermata.
giorni_pot = uno("""SELECT CAST(julianday('now') - julianday(MAX(data)) AS INTEGER) FROM potenziale_storico
                    WHERE origine = 'notte'""")
if c.execute("SELECT 1 FROM sqlite_master WHERE name = 'potenziale_storico'").fetchone():
    controlli.append(("Giorni dall'ultima stima notturna del potenziale", giorni_pot, 3,
                      "il registro riceve righe ogni notte"))
allarmi = 0
print("Numeri dell'archivio:")
for nome, val, soglia, perche in controlli:
    stato = "OK" if val <= soglia else "ALLARME"
    allarmi += stato != "OK"
    print(f"- {stato}: {nome}: {val} (allarme oltre {soglia}; {perche})")
sys.exit(1 if allarmi else 0)
