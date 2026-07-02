#!/usr/bin/env python3
"""
fill_pedigree.py — StatIppica
Script standalone per riempire la genealogia completa (sire, dam, sire_sire,
sire_dam, dam_sire, dam_dam) di tutti i cavalli nel database.

FONTE PRIMARIA: ANACT (anact.it/genealogie/) — la pagina incorpora già il
pedigree completo a 4 generazioni come JSON (dentro uno <script> in base64,
non serve eseguire JavaScript: si decodifica e si legge direttamente). Un
solo fetch per cavallo copre sire, dam, sire_sire, sire_dam, dam_sire,
dam_dam in un colpo, invece dei 3 fetch a cascata serviti su Trottoweb.

ATTENZIONE — parti verificate vs. non verificate:
  - L'estrazione del JSON (decodifica base64 + regex + parsing) è stata
    testata con successo su un estratto REALE della pagina.
  - La mappatura delle chiavi p/m/pp/mp/pm/mm -> sire/dam/sire_sire/sire_dam/
    dam_sire/dam_dam è dedotta dal CSS della pagina (colori verde=paterno/
    rosso=materno) ed è internamente coerente, ma NON è stata verificata al
    100% con un caso indipendente noto.
  - Il sito applica un rilevamento anti-bot: recuperare la pagina con un
    fetch automatico *potrebbe* essere bloccato (testalo con --limit 5 prima
    di un giro completo). Se ANACT blocca, lo script passa in automatico al
    fallback Trottoweb (2 generazioni, endpoint cavAn.php già verificato e
    stabile) — non si blocca né crasha in nessun caso.
  - La ricerca del "codice" ANACT a partire dal nome del cavallo usa un
    endpoint di autocomplete trovato nel JS della pagina di ricerca: la
    query è dedotta, non testata in modo esaustivo su tutti i casi.

Fasi:
  1. HORSES SIRE/DAM — cavalli con sire o dam mancante in 'horses': li
     recupera da cavAn.php (Trottoweb) e li scrive.
  2. GRANDPARENTS — per ogni genitore distinto (sire o dam) referenziato nel
     database CHE NON HA GIA' TUTTI E 4 I NONNI valorizzati, prova prima
     ANACT (4 generazioni in un fetch), poi Trottoweb come fallback (2
     generazioni via 3 fetch a cascata). Scrive tutto in 'stallion_pedigree'.
     I cavalli già completi vengono saltati senza sovrascrivere nulla.

Uso:
  python3 fill_pedigree.py                    # gira su tutto quello che manca
  python3 fill_pedigree.py --limit 500         # limita il lavoro (utile per un cron/batch)
  python3 fill_pedigree.py --no-anact          # salta ANACT, usa solo Trottoweb
  python3 fill_pedigree.py --no-push           # non fa git push alla fine (solo per test locali)

Variabili d'ambiente (stesse convenzioni di nightly_update.py):
  DB_PATH, REPO_DB_PATH, GITHUB_TOKEN, GITHUB_USER, GITHUB_REPO
"""

import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nightly_update as nu

ANACT_GENEALOGIE = "https://www.anact.it/genealogie/"
ANACT_AUTOCOMPLETE_BASE = "http://13.39.149.176:3000/"
ANACT_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}
ANACT_SESSION = requests.Session()
ANACT_SESSION.headers.update(ANACT_HEADERS)

ANACT_KEY_MAP = {
    "p": "sire", "m": "dam",
    "pp": "sire_sire", "mp": "sire_dam",
    "pm": "dam_sire", "mm": "dam_dam",
}


def _anact_extract_pedigree_json(html: str) -> Optional[list]:
    for m in re.finditer(r'<script src="data:text/javascript;base64,([^"]+)"', html):
        try:
            decoded = base64.b64decode(m.group(1)).decode("utf-8", errors="ignore")
        except Exception:
            continue
        if "populateTableWithJSON" not in decoded:
            continue
        jm = re.search(r"populateTableWithJSON\(\s*(\[.*?\])\s*,\s*['\"]cavallo['\"]\s*\)", decoded, re.DOTALL)
        if jm:
            try:
                return json.loads(jm.group(1))
            except json.JSONDecodeError:
                continue
    return None


def _anact_search_codice(name: str) -> Optional[str]:
    for input_name in ("cavallo", "cavalli", "nome"):
        try:
            resp = ANACT_SESSION.get(
                f"{ANACT_AUTOCOMPLETE_BASE}{input_name}/autocomplete",
                params={"search": name}, timeout=15
            )
            if resp.status_code != 200:
                continue
            data = resp.json().get("data", [])
        except Exception:
            continue
        if not data:
            continue
        for item in data:
            if nu._normalize_name(item.get("nome")) == nu._normalize_name(name):
                return item.get("codice")
        return data[0].get("codice")
    return None


def _anact_fetch_full_pedigree(name: str) -> Optional[dict]:
    codice = _anact_search_codice(name)
    if not codice:
        return None
    try:
        with nu._hard_timeout(60):
            resp = ANACT_SESSION.get(ANACT_GENEALOGIE, params={"codice": codice}, timeout=20)
    except nu._HardTimeout:
        print(f"    [ANACT TIMEOUT] {name}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"    [ANACT WARN] {name}: {e}", file=sys.stderr)
        return None
    if resp.status_code != 200:
        return None

    tree = _anact_extract_pedigree_json(resp.text)
    if not tree:
        return None

    by_key = {}
    for entry in tree:
        for key, data in entry.items():
            by_key[key] = data

    result = {}
    for anact_key, field in ANACT_KEY_MAP.items():
        d = by_key.get(anact_key)
        if d and d.get("nome"):
            result[field] = nu._normalize_name(d["nome"])

    return result if result else None


def _fetch_parents(name: str) -> tuple:
    try:
        with nu._hard_timeout(90):
            data = nu._fetch_cavan(name)
    except nu._HardTimeout:
        print(f"    [TIMEOUT] {name}: bloccato oltre 90s, salto.", file=sys.stderr)
        return None, None, None
    if not data:
        return None, None, None
    sire = nu._normalize_name(data.get("sire"))
    dam = nu._normalize_name(data.get("dam"))
    return sire, dam, data.get("country")


def _fallback_trottoweb_pedigree(name: str) -> dict:
    sire, dam, nationality = _fetch_parents(name)
    sire_sire = sire_dam = dam_sire = dam_dam = None
    if sire:
        sire_sire, sire_dam, _ = _fetch_parents(sire)
    if dam:
        dam_sire, dam_dam, _ = _fetch_parents(dam)
    return {
        "sire": sire, "dam": dam,
        "sire_sire": sire_sire, "sire_dam": sire_dam,
        "dam_sire": dam_sire, "dam_dam": dam_dam,
        "nationality": nationality,
    }


def fill_horses_sire_dam(conn, limit: Optional[int] = None) -> int:
    query = "SELECT name, birth_year FROM horses WHERE sire IS NULL OR dam IS NULL"
    if limit:
        query += f" LIMIT {int(limit)}"
    rows = conn.execute(query).fetchall()
    print(f"[PEDIGREE] FASE 1 — cavalli con sire/dam mancante: {len(rows)}", file=sys.stderr)

    filled = 0
    for i, (name, birth_year) in enumerate(rows, 1):
        nu._fetch_and_insert_full_career(conn, name, birth_year)
        filled += 1
        if i % 50 == 0:
            print(f"  ... {i}/{len(rows)} cavalli controllati", file=sys.stderr)

    print(f"[PEDIGREE] FASE 1 completata: {filled} cavalli processati.", file=sys.stderr)
    return filled


def fill_grandparents(conn, limit: Optional[int] = None, use_anact: bool = True) -> int:
    rows = conn.execute("""
        SELECT DISTINCT sire AS name FROM horses WHERE sire IS NOT NULL AND sire != ''
        UNION
        SELECT DISTINCT dam AS name FROM horses WHERE dam IS NOT NULL AND dam != ''
    """).fetchall()
    all_names = sorted({r[0] for r in rows if r[0]})

    complete = {r[0] for r in conn.execute("""
        SELECT name FROM stallion_pedigree
        WHERE sire_sire IS NOT NULL AND sire_dam IS NOT NULL
          AND dam_sire IS NOT NULL AND dam_dam IS NOT NULL
    """).fetchall()}
    todo = [n for n in all_names if n not in complete]
    if limit:
        todo = todo[:limit]

    print(f"[PEDIGREE] FASE 2 — genitori distinti: {len(all_names)}, "
          f"già completi (saltati): {len(complete & set(all_names))}, "
          f"da fare in questo giro: {len(todo)}", file=sys.stderr)

    filled = 0
    anact_hits = 0
    for name in todo:
        result = None
        if use_anact:
            result = _anact_fetch_full_pedigree(name)
            if result:
                anact_hits += 1
        if not result:
            result = _fallback_trottoweb_pedigree(name)

        sire = result.get("sire")
        dam = result.get("dam")
        sire_sire = result.get("sire_sire")
        sire_dam = result.get("sire_dam")
        dam_sire = result.get("dam_sire")
        dam_dam = result.get("dam_dam")
        nationality = result.get("nationality")

        conn.execute("""
            INSERT INTO stallion_pedigree
                (name, sire, dam, sire_sire, sire_dam, dam_sire, dam_dam, nationality)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(name) DO UPDATE SET
                sire        = COALESCE(excluded.sire, sire),
                dam         = COALESCE(excluded.dam, dam),
                sire_sire   = COALESCE(excluded.sire_sire, sire_sire),
                sire_dam    = COALESCE(excluded.sire_dam, sire_dam),
                dam_sire    = COALESCE(excluded.dam_sire, dam_sire),
                dam_dam     = COALESCE(excluded.dam_dam, dam_dam),
                nationality = COALESCE(excluded.nationality, nationality)
        """, (name, sire, dam, sire_sire, sire_dam, dam_sire, dam_dam, nationality))
        conn.commit()

        conn.execute("""
            UPDATE horses SET
                sire = COALESCE(?, sire),
                dam  = COALESCE(?, dam)
            WHERE name = ?
        """, (sire, dam, name))
        conn.commit()

        filled += 1
        if filled % 10 == 0:
            print(f"  ... {filled}/{len(todo)} genitori completati "
                  f"(ANACT: {anact_hits}, Trottoweb: {filled - anact_hits})", file=sys.stderr)

    print(f"[PEDIGREE] FASE 2 completata: {filled} genitori processati "
          f"(ANACT: {anact_hits}, Trottoweb fallback: {filled - anact_hits}).", file=sys.stderr)
    return filled


def main():
    parser = argparse.ArgumentParser(description="Riempie sire/dam/nonni di tutti i cavalli.")
    parser.add_argument("--limit", type=int, default=None,
                         help="Limita quanti record processare per fase (utile per un cron/batch).")
    parser.add_argument("--no-anact", action="store_true",
                         help="Salta ANACT, usa solo il fallback Trottoweb (2 generazioni).")
    parser.add_argument("--no-push", action="store_true",
                         help="Non fa git push alla fine (solo test locali).")
    args = parser.parse_args()

    print(f"[START] fill_pedigree.py — limit={args.limit}, anact={not args.no_anact}", file=sys.stderr)

    conn = nu.sqlite3.connect(str(nu.DB_PATH))
    conn.row_factory = nu.sqlite3.Row
    nu.init_db(conn)

    try:
        n1 = fill_horses_sire_dam(conn, args.limit)
        n2 = fill_grandparents(conn, args.limit, use_anact=not args.no_anact)
    finally:
        conn.close()

    nu.phase_sync()
    if not args.no_push:
        nu.phase_git_push()
    else:
        print("[GIT] --no-push attivo, salto il push.", file=sys.stderr)

    print(f"[END] cavalli aggiornati: {n1}, genitori con pedigree completato: {n2}", file=sys.stderr)


if __name__ == "__main__":
    main()
