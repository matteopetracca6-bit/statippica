#!/usr/bin/env python3
"""
Controlla che ogni dato mostrato dal sito venga davvero aggiornato da un lavoro
automatico programmato.

PERCHE' ESISTE. Il sito legge una ventina di tabelle. Alcune le aggiorna il
lavoro notturno, altre flussi settimanali, altre script che si lanciano a mano.
Il guaio e' che quando una di queste catene si rompe non compare nessun errore:
la pagina continua a funzionare mostrando dati vecchi, e ci si accorge solo per
caso. E' esattamente quello che era successo alla genealogia degli stalloni
esteri, ferma al 2 luglio perche' il flusso che la aggiorna era rimasto marcato
"test" e non aveva nessun orario: tre mesi di dati vecchi mostrati come attuali.

COSA FA. Parte dalle tabelle che il sito legge davvero, risale a chi le scrive
seguendo anche gli import fra file, e controlla che quel codice venga eseguito da
un flusso con un orario. Se una tabella non ha nessuno che la aggiorna
automaticamente, esce con errore.

Si lancia da solo dentro il flusso notturno, quindi un domani non si puo'
dimenticare.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
ARCHIVIO = RADICE / "data.db"
FLUSSI = RADICE / ".github" / "workflows"

# Tabelle che il sito legge ma che non devono essere aggiornate: sono registri
# tecnici, non dati mostrati.
IGNORA = {
    "sqlite_sequence", "sqlite_stat1", "repair_meta", "undated_repair_log",
    "vp_fetch_attempt",
}

# DATI DI RIFERIMENTO FISSI. Non si aggiornano perche' sono una fotografia, e va
# bene cosi' — ma vanno dichiarati qui uno per uno con il motivo, altrimenti
# questo controllo diventa un elenco di eccezioni che non dice piu' niente.
# Aggiungere una voce qui e' una decisione, non un modo di far tacere l'allarme.
FISSE = {
    "vendopuledri_stalloni_rankings":
        "classifiche stalloni 2017-2025 di VendoPuledri, inserite una volta e "
        "usate solo per il numero di figli e i guadagni complessivi. Essendo "
        "ferma al 2025 invecchia: da rivedere quando usciranno le classifiche "
        "nuove.",
}

# Tabelle di appoggio interne alle fasi, scritte e rilette nello stesso giro.
TEMPORANEE = {"tmp_", "temp_"}


def file_python(cartella: Path) -> list[Path]:
    return [p for p in cartella.rglob("*.py")
            if "node_modules" not in p.parts and ".git" not in p.parts]


def tabelle_scritte(percorso: Path) -> set[str]:
    """Tabelle che questo file scrive: inserimenti, aggiornamenti, svuotamenti."""
    try:
        testo = percorso.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return set()
    t: set[str] = set()
    for pat in (r"INSERT\s+(?:OR\s+\w+\s+)?INTO\s+[\"']?(\w+)",
                r"UPDATE\s+[\"']?(\w+)[\"']?\s+SET",
                r"DELETE\s+FROM\s+[\"']?(\w+)",
                r"REPLACE\s+INTO\s+[\"']?(\w+)"):
        t |= {m.lower() for m in re.findall(pat, testo, re.I)}
    return t


def moduli_importati(percorso: Path) -> set[str]:
    """
    Quali file del progetto questo file importa. Serve perche' una fase del
    notturno puo' delegare la scrittura a un altro file: phase_vp_pedigree
    chiama vendopuledri_source, ed e' quest'ultimo che scrive le tabelle.
    Senza seguire gli import, quelle tabelle sembrerebbero abbandonate.

    LIMITE NOTO, da tenere presente leggendo l'esito: seguire gli import
    SOVRASTIMA. Se un file importa un modulo senza chiamarne le funzioni di
    scrittura, la tabella viene attribuita comunque. Per esempio
    fill_pedigree.py importa nightly_update per riusarne due utilita', e cosi'
    il flusso della genealogia risulta fra quelli che aggiornano le gare, cosa
    che non fa. L'errore e' per eccesso, quindi non nasconde tabelle
    abbandonate — quelle restano segnalate. Ma "chi la aggiorna" va letto come
    "fra questi flussi, almeno uno", non come un elenco esatto. Per questo la
    seconda parte del controllo guarda le date vere nell'archivio: quella non
    si fida di nessuna deduzione.
    """
    try:
        testo = percorso.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return set()
    m: set[str] = set()
    for pat in (r"^\s*import\s+([\w.]+)", r"^\s*from\s+([\w.]+)\s+import"):
        for nome in re.findall(pat, testo, re.M):
            m.add(nome.split(".")[0])
    return m


def scritture_complete(radice: Path, visti: set[Path] | None = None) -> set[str]:
    """Tabelle scritte da questo file e da tutto ciò che importa, in cascata."""
    if visti is None:
        visti = set()
    if radice in visti or not radice.exists():
        return set()
    visti.add(radice)

    t = tabelle_scritte(radice)
    for nome in moduli_importati(radice):
        for candidato in (RADICE / f"{nome}.py", RADICE / "scripts" / f"{nome}.py"):
            if candidato.exists():
                t |= scritture_complete(candidato, visti)
    return t


def tabelle_lette_dal_sito() -> set[str]:
    testo = ""
    for p in (RADICE / "server").rglob("*.ts"):
        testo += p.read_text(encoding="utf-8", errors="ignore")
    t: set[str] = set()
    for pat in (r"FROM\s+[\"']?(\w+)", r"JOIN\s+[\"']?(\w+)"):
        t |= {m.lower() for m in re.findall(pat, testo, re.I)}
    return t


def analizza_flussi() -> dict[str, dict]:
    """Per ogni flusso: se ha un orario, e quali file python lancia."""
    risultato: dict[str, dict] = {}
    if not FLUSSI.exists():
        return risultato
    for f in sorted(FLUSSI.glob("*.yml")):
        testo = f.read_text(encoding="utf-8", errors="ignore")
        # Si guarda l'orario solo nella parte "on:", non nei commenti.
        orari = re.findall(r"^\s*-?\s*cron:\s*[\"']([^\"']+)[\"']", testo, re.M)
        script = set(re.findall(r"python3?\s+([\w/]+\.py)", testo))
        risultato[f.name] = {
            "programmato": bool(orari),
            "orari": orari,
            "script": script,
            "nome": (re.search(r"^name:\s*(.+)$", testo, re.M) or [None, ""])[1].strip()
            if re.search(r"^name:\s*(.+)$", testo, re.M) else "",
        }
    return risultato


# Quanti giorni di ritardo si accettano prima di parlare di dato vecchio. Le
# gare arrivano ogni notte, ma la fonte pubblica i risultati con un paio di
# giorni di ritardo e nei periodi di sosta le corse si fermano davvero: sotto i
# dieci giorni non c'e' niente di anomalo.
GIORNI_TOLLERATI = 10

# Colonne che contengono una data, in ordine di preferenza: si usa la prima che
# la tabella possiede.
COLONNE_DATA = ("date", "race_date", "ultima_gara", "last_race", "updated_at",
                "computed_at", "fetched_at", "tried_at", "data")


def eta_dei_dati(archivio: Path) -> list[tuple[str, str, int | None, int]]:
    """
    Per ogni tabella: la data piu' recente che contiene, e quanti giorni fa e'.

    Questo e' il controllo che conta davvero. La prima parte verifica che
    ESISTA un lavoro automatico; questa verifica che quel lavoro abbia
    FUNZIONATO. Un flusso puo' avere l'orario giusto e fallire ogni notte in
    silenzio: senza guardare le date non ce ne accorgeremmo.
    """
    if not archivio.exists():
        return []
    con = sqlite3.connect(archivio)
    oggi = datetime.now(timezone.utc).date()
    esito: list[tuple[str, str, int | None, int]] = []

    tabelle = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

    for t in tabelle:
        try:
            colonne = {d[1].lower(): d[1]
                       for d in con.execute(f'PRAGMA table_info("{t}")')}
            righe = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        except sqlite3.Error:
            continue
        if not righe:
            continue
        col = next((colonne[c] for c in COLONNE_DATA if c in colonne), None)
        if not col:
            continue
        try:
            massimo = con.execute(
                f'SELECT MAX("{col}") FROM "{t}" WHERE "{col}" IS NOT NULL'
            ).fetchone()[0]
        except sqlite3.Error:
            continue
        if not massimo:
            continue
        testo = str(massimo)[:10]
        giorni: int | None = None
        try:
            giorni = (oggi - datetime.strptime(testo, "%Y-%m-%d").date()).days
        except ValueError:
            giorni = None
        esito.append((t, testo, giorni, righe))

    con.close()
    return esito


def main() -> int:
    lette = tabelle_lette_dal_sito()
    flussi = analizza_flussi()

    # Chi scrive cosa, contando solo i flussi con un orario.
    scritte_automatiche: dict[str, list[str]] = {}
    scritte_a_mano: dict[str, list[str]] = {}

    for nome_flusso, info in flussi.items():
        for s in info["script"]:
            p = RADICE / s
            for tabella in scritture_complete(p):
                dest = scritte_automatiche if info["programmato"] else scritte_a_mano
                dest.setdefault(tabella, []).append(nome_flusso)

    # Le tabelle esistenti davvero, per non segnalare nomi che non esistono.
    reali: set[str] = set()
    if ARCHIVIO.exists():
        con = sqlite3.connect(ARCHIVIO)
        reali = {r[0].lower() for r in
                 con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        con.close()

    da_controllare = sorted(
        t for t in lette
        if t in reali and t not in IGNORA
        and not any(t.startswith(pre) for pre in TEMPORANEE))

    print("DATI CHE IL SITO MOSTRA, E CHI LI AGGIORNA")
    print()
    mancanti: list[str] = []
    solo_a_mano: list[tuple[str, list[str]]] = []

    for t in da_controllare:
        if t in FISSE:
            print(f"  FISSA {t:30} dato di riferimento, non si aggiorna")
            continue
        if t in scritte_automatiche:
            chi = sorted(set(scritte_automatiche[t]))
            print(f"  OK   {t:30} {', '.join(c.replace('.yml', '') for c in chi)}")
        elif t in scritte_a_mano:
            chi = sorted(set(scritte_a_mano[t]))
            solo_a_mano.append((t, chi))
            print(f"  MANO {t:30} {', '.join(c.replace('.yml', '') for c in chi)}"
                  " (solo a mano, nessun orario)")
        else:
            mancanti.append(t)
            print(f"  NO   {t:30} nessuno la aggiorna")

    print()
    if FISSE:
        print()
        print("  Dati di riferimento fissi, e perche':")
        for t, motivo in sorted(FISSE.items()):
            if t in da_controllare:
                print(f"    {t}: {motivo}")
        print()

    for nome, info in sorted(flussi.items()):
        if info["programmato"]:
            print(f"  orario  {nome.replace('.yml', ''):34} {', '.join(info['orari'])}")

    # SECONDA PARTE: le date vere nell'archivio.
    vecchie: list[tuple[str, str, int]] = []
    eta = eta_dei_dati(ARCHIVIO)
    if eta:
        print()
        print("QUANTO SONO FRESCHI I DATI NELL'ARCHIVIO")
        print()
        con_data = {t.lower() for t, _, _, _ in eta}
        senza = sorted(t for t in da_controllare
                       if t not in con_data and t not in FISSE)
        for t, quando, giorni, righe in eta:
            if t.lower() in IGNORA or t.lower() in FISSE:
                continue
            if giorni is None:
                print(f"  ?    {t:30} {quando} (data non interpretabile)")
                continue
            # Le gare future sono nel futuro per definizione: dire "meno un
            # giorno fa" sarebbe solo confusione.
            if giorni < 0:
                quanto = f"fra {-giorni} giorn{'o' if giorni == -1 else 'i'}"
            elif giorni == 0:
                quanto = "oggi"
            else:
                quanto = f"{giorni} giorn{'o' if giorni == 1 else 'i'} fa"
            etichetta = "OK  " if giorni <= GIORNI_TOLLERATI else "VECCHIO"
            # Il punto come separatore delle migliaia va messo solo al numero,
            # altrimenti mangia anche la virgola della frase.
            mille = f"{righe:,}".replace(",", ".")
            print(f"  {etichetta:4} {t:30} {quando}  ({quanto}, {mille} righe)")
            if giorni > GIORNI_TOLLERATI and t.lower() in da_controllare:
                vecchie.append((t, quando, giorni))

        if senza:
            print()
            print(f"  Le altre {len(senza)} tabelle mostrate dal sito non hanno una")
            print("  colonna con la data, quindi la loro freschezza non si puo'")
            print("  controllare cosi'. Vengono riscritte da zero a ogni giro delle")
            print("  fasi, quindi se le gare sono fresche lo sono anche loro:")
            print(f"    {', '.join(senza)}")

    problemi = 0
    if vecchie:
        print()
        print("PROBLEMA: il sito mostra queste tabelle, ma il dato piu' recente")
        print(f"che contengono e' piu' vecchio di {GIORNI_TOLLERATI} giorni:")
        for t, quando, giorni in vecchie:
            print(f"  - {t}: si fermano al {quando}, {giorni} giorni fa")
        print("  Il lavoro automatico esiste ma non sta funzionando.")
        problemi += len(vecchie)

    if mancanti:
        print()
        print("PROBLEMA: queste tabelle sono mostrate dal sito e nessuno le aggiorna:")
        for t in mancanti:
            print(f"  - {t}")
        problemi += len(mancanti)

    if solo_a_mano:
        print()
        print("PROBLEMA: queste tabelle si aggiornano solo se qualcuno lancia il")
        print("flusso a mano, quindi invecchiano in silenzio:")
        for t, chi in solo_a_mano:
            print(f"  - {t}  (lo farebbe {', '.join(c.replace('.yml', '') for c in chi)},"
                  " che non ha un orario)")
        problemi += len(solo_a_mano)

    if problemi:
        print()
        print(f"{problemi} punt{'o' if problemi == 1 else 'i'} da sistemare.")
        return 1

    print()
    print("Tutti i dati mostrati dal sito hanno un lavoro automatico che li aggiorna.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
