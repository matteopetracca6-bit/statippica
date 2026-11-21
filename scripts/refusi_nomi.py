#!/usr/bin/env python3
"""
Refusi nei nomi di fattrici e stalloni, cercati ogni notte (21/11/2026).

PERCHE'. Le fonti scrivono lo stesso cavallo in modi diversi: "PASCIA' LEST" e
"PASCIA LEST", "CRAVETTE" e "CREVETTE". Il figlio allora punta a un genitore
che nell'archivio non c'e', e il genitore vero perde un figlio (voto da
stallone o da fattrice, fratelli, pedigree).

ATTENZIONE: due nomi quasi uguali NON sono per forza lo stesso cavallo. Nel
registro italiano "GIULIO CESARE" e "GIULIOCESARE" sono due cavalli del 2022
con genitori diversi, come "IN YOUR EYES" e "INYOUREYES". Per questo si unisce
da soli solo quando le prove sono forti, e il resto si propone.

COSA SI UNISCE DA SOLO
 1. Genitore scritto male: un nome usato come padre o madre che non ha una
    scheda, e un solo cavallo con scheda che:
      - si scrive uguale a meno di spazi e segni ("PASCIA LEST" / "PASCIA' LEST"),
        oppure differisce di una lettera e il pedigree di vendopuledri dei figli
        scrive proprio il nome con scheda;
      - ha il sesso giusto (una madre e' femmina, un padre no);
      - ha l'eta' giusta: i figli nascono fra 3 e 28 anni dopo di lui;
      - e nessun pedigree di vendopuledri scrive il nome senza scheda (se lo
        scrive, il cavallo esiste davvero con quel nome).
 2. Scheda doppia: due schede che si scrivono uguali a meno di spazi e segni,
    stesso anno, stesso sesso, genitori compatibili, e una delle due e' vuota
    (niente genitori, niente corse). Resta il nome della scheda con le corse,
    o con i genitori.

COSA SI PROPONE (tabella refusi_proposti): gli stessi casi con una lettera di
differenza ma senza la conferma di vendopuledri. Le decisioni prese a mano
stanno in dati/refusi_decisi.csv (nome;nome_giusto;decisione si/no): "si" si
unisce, "no" non si propone piu'.

Ogni unione resta nella tabella refusi_uniti.
Uso: python3 scripts/refusi_nomi.py --db data.db [--prova]
"""
from __future__ import annotations

import argparse
import collections
import csv
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
sys.path.insert(0, RADICE)
import omonimi  # noqa: E402

FILE_DECISI = os.path.join(RADICE, "dati", "refusi_decisi.csv")
CON_ANNO = re.compile(r"\(\d{4}\)$")
ETA = (3, 28)
STRANO = re.compile(r"[^A-Z0-9 '.\-]")


def chiave(n: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (n or "").upper())


def una_lettera(a: str, b: str) -> bool:
    """Distanza di una lettera: una cambiata, una in piu' o in meno, due vicine scambiate."""
    if a == b:
        return False
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la == lb:
        diff = [i for i in range(la) if a[i] != b[i]]
        if len(diff) == 1:
            return True
        return len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]]
    if la > lb:
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i:] == b[i + 1:]


def crea(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS refusi_uniti (nome TEXT, nome_giusto TEXT, motivo TEXT, figli INTEGER, quando TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS refusi_proposti (nome TEXT, nome_giusto TEXT, ruolo TEXT, motivo TEXT,
                    figli INTEGER, quando TEXT, PRIMARY KEY (nome, nome_giusto))""")


def leggi_decisi() -> dict:
    out = {}
    if os.path.exists(FILE_DECISI):
        with open(FILE_DECISI, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter=";"):
                a, b = (r.get("nome") or "").strip().upper(), (r.get("nome_giusto") or "").strip().upper()
                if a and b:
                    out[(a, b)] = (r.get("decisione") or "").strip().lower()
    return out


def cerca(conn) -> tuple[list, list]:
    """(sicuri, proposti): liste di (nome, nome_giusto, ruolo, motivo, figli)."""
    schede = collections.defaultdict(list)
    for n, y, s, pa, ma, corse in conn.execute(
            "SELECT name, birth_year, UPPER(COALESCE(sex, '')), sire, dam, COALESCE(career_races, 0) FROM horses"):
        if not CON_ANNO.search(n):
            schede[n].append((y, s, pa, ma, corse))
    per_chiave = collections.defaultdict(set)
    for n in schede:
        per_chiave[chiave(n)].add(n)
    # vicini di una lettera: si passa dalle chiavi con una lettera tolta
    tolte = collections.defaultdict(set)
    for k in per_chiave:
        if len(k) >= 6:
            for i in range(len(k)):
                tolte[k[:i] + k[i + 1:]].add(k)
            tolte[k].add(k)

    def vicini(k: str) -> set:
        out = set(per_chiave.get(k, ()))
        if len(k) >= 6:
            for d in [k] + [k[:i] + k[i + 1:] for i in range(len(k))]:
                for k2 in tolte.get(d, ()):
                    if k2 == k or una_lettera(k, k2):
                        out |= per_chiave[k2]
        return out

    vp_id = {}
    try:
        vp_id = {n: i for i, n in conn.execute("SELECT id, name FROM vp_names")}
    except sqlite3.Error:
        pass

    def nome_vp(figlio: str, path: str):
        i = vp_id.get(figlio)
        if not i:
            return None
        r = conn.execute("SELECT n.name FROM vp_pedigree p JOIN vp_names n ON n.id = p.ancestor_id "
                         "WHERE p.horse_id = ? AND p.path = ?", (i, path)).fetchone()
        return r[0].upper().strip() if r else None

    sicuri, proposti = [], []
    # 1. Genitori scritti male
    for col, path in (("dam", "m"), ("sire", "p")):
        for x, a0, a1, n, figli in conn.execute(f"""
                SELECT {col}, MIN(birth_year), MAX(birth_year), COUNT(*), GROUP_CONCAT(name, '|') FROM horses h
                 WHERE {col} IS NOT NULL AND TRIM({col}) <> ''
                   AND NOT EXISTS (SELECT 1 FROM horses x WHERE x.name = h.{col}) GROUP BY 1""").fetchall():
            if CON_ANNO.search(x):
                continue
            cand = set()
            for y in vicini(chiave(x)):
                if y == x:
                    continue
                for (by, s, *_r) in schede[y]:
                    if col == "dam" and s not in ("F", ""):
                        continue
                    if col == "sire" and s == "F":
                        continue
                    if by and a0 and not (by + ETA[0] <= a0 and a1 <= by + ETA[1]):
                        continue
                    cand.add(y)
            if len(cand) != 1:
                continue
            y = cand.pop()
            visti = [v for v in (nome_vp(f, path) for f in figli.split("|")) if v]
            if any(v == x for v in visti):
                continue       # vendopuledri lo scrive cosi': il cavallo esiste con quel nome
            conferma = bool(visti) and all(v == y for v in visti)
            stessa = chiave(x) == chiave(y)
            ruolo = "madre" if col == "dam" else "padre"
            if stessa:
                sicuri.append((x, y, ruolo, "si scrive uguale a meno di spazi e segni", n))
            elif conferma:
                sicuri.append((x, y, ruolo, "una lettera di differenza, confermata dal pedigree di vendopuledri", n))
            else:
                proposti.append((x, y, ruolo, "una lettera di differenza, eta' e sesso compatibili", n))
    # 2. Schede doppie
    for k, nomi in per_chiave.items():
        if len(nomi) < 2:
            continue
        righe = [(nm, r) for nm in nomi for r in schede[nm]]
        for i in range(len(righe)):
            for j in range(len(righe)):
                (na, (ya, sa, pa, ma, ca)), (nb, (yb, sb, pb, mb, cb)) = righe[i], righe[j]
                if na == nb or not ya or ya != yb or (sa and sb and sa != sb):
                    continue
                vuota_a = not pa and not ma and not ca
                if not vuota_a or (not pb and not mb and not cb):
                    continue   # si unisce la scheda vuota (a) in quella piena (b)
                figli = conn.execute("SELECT COUNT(*) FROM horses WHERE sire = ? OR dam = ?", (na, na)).fetchone()[0]
                # Se il nome giusto e' quello della scheda vuota ("VAN PERSIE LAKSMY"
                # contro "VAN PERSIE LAKSMY+"), la scheda piena prende quel nome.
                motivo = "scheda vuota doppia: stesso anno e sesso, si scrive uguale"
                if STRANO.search(nb) and not STRANO.search(na):
                    sicuri.append((nb, na, "scheda_piena", motivo + "; resta il nome scritto pulito", figli))
                else:
                    sicuri.append((na, nb, "scheda", motivo, figli))
    return sicuri, proposti


def applica(conn, prova: bool = False) -> dict:
    crea(conn)
    ora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    decisi = leggi_decisi()
    sicuri, proposti = cerca(conn)
    esito = {"uniti": 0, "proposti": 0, "da_file": 0}
    fatti = set()

    def unisci(x, y, motivo, figli, ruolo=""):
        if x in fatti or not conn.execute(
                "SELECT 1 FROM horses WHERE name = ? UNION SELECT 1 FROM horses WHERE sire = ? OR dam = ? LIMIT 1",
                (x, x, x)).fetchone():
            return False
        fatti.add(x)
        if not prova:
            if ruolo == "scheda_piena":
                # prima via la scheda vuota col nome pulito, poi la piena lo prende
                conn.execute("DELETE FROM horses WHERE name = ? AND sire IS NULL AND dam IS NULL "
                             "AND COALESCE(career_races, 0) = 0", (y,))
            omonimi.rinomina(conn, x, y)
            conn.execute("INSERT INTO refusi_uniti VALUES (?,?,?,?,?)", (x, y, motivo, figli, ora))
            conn.execute("DELETE FROM refusi_proposti WHERE nome = ?", (x,))
        print(f"[REFUSI] {x} -> {y}: {motivo} ({figli} figli)", file=sys.stderr)
        return True

    for (x, y), d in decisi.items():
        if d == "si" and unisci(x, y, "deciso a mano", 0):
            esito["da_file"] += 1
    for x, y, ruolo, motivo, figli in sicuri:
        if decisi.get((x, y)) == "no":
            continue
        if unisci(x, y, motivo, figli, ruolo):
            esito["uniti"] += 1
    if not prova:
        conn.execute("DELETE FROM refusi_proposti")
    for x, y, ruolo, motivo, figli in proposti:
        if decisi.get((x, y)) or x in fatti:
            continue
        esito["proposti"] += 1
        if prova:
            print(f"[REFUSI] proposto {x} -> {y} ({ruolo}, {figli} figli)", file=sys.stderr)
        else:
            conn.execute("INSERT OR REPLACE INTO refusi_proposti VALUES (?,?,?,?,?,?)", (x, y, ruolo, motivo, figli, ora))
    if not prova:
        conn.commit()
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--prova", action="store_true", help="non cambia niente, scrive solo cosa farebbe")
    a = ap.parse_args()
    print(f"[REFUSI] {applica(sqlite3.connect(a.db), a.prova)}", file=sys.stderr)
