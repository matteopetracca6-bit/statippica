#!/usr/bin/env python3
"""
completa_genitori.py — StatIppica (23/11/2026)

PERCHE' ESISTE. Gli stalloni esteri (TRIXTON, CLASSIC CONNECTION...) e molti
cavalli vecchi sono entrati nell'archivio dalla parte del figlio: si sapeva il
padre ma non la madre, e nelle classifiche usciva "MUSCLE HILL x ???".

COSA FA. Per i cavalli senza madre che hanno corso o hanno figli, cerca la
madre, in quest'ordine:
  1. il catalogo degli stalloni (stallions.catalog_dam), se padre e anno
     combaciano con l'archivio;
  2. l'albero proprio del cavallo nella seconda fonte (vp_pedigree, percorso
     "m"), se il padre combacia;
  3. l'albero di un suo figlio italiano nella seconda fonte, dove il cavallo
     compare come padre o madre: solo se e' genitore di qualcuno e se il padre
     letto li' e' lo stesso dell'archivio (contro gli omonimi).
Si scrive solo la madre vuota; il padre solo se vuoto e dal catalogo.
Mette anche il sesso vuoto di chi e' solo padre (M) o solo madre (F).

Uso:
  python3 scripts/completa_genitori.py --db data.db [--prova]
"""
from __future__ import annotations

import argparse
import re
import sqlite3


def _tabella(conn, n):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (n,)).fetchone() is not None


def _vp_genitori_propri(conn, n):
    return {p: x for p, x in conn.execute(
        """SELECT p.path, a.name FROM vp_names hn JOIN vp_pedigree p ON p.horse_id = hn.id
           JOIN vp_names a ON a.id = p.ancestor_id WHERE hn.name = ? AND p.path IN ('p','m')""", (n,))}


def _vp_genitori_dai_figli(conn, n):
    out: dict = {}
    occ = conn.execute("""SELECT p.horse_id, p.path FROM vp_names x JOIN vp_pedigree p ON p.ancestor_id = x.id
                          WHERE x.name = ? AND length(p.path) < 5 ORDER BY length(p.path) LIMIT 12""", (n,)).fetchall()
    for h, P in occ:
        q = {path[:-len(P)]: nome for path, nome in conn.execute(
            """SELECT p.path, a.name FROM vp_pedigree p JOIN vp_names a ON a.id = p.ancestor_id
               WHERE p.horse_id = ? AND p.path IN (?, ?)""", (h, "p" + P, "m" + P))}
        if out.get("p") and q.get("p") and out["p"] != q["p"]:
            continue
        for k, v in q.items():
            out.setdefault(k, v)
    return out


_SIGLA = re.compile(r"\s*-\s*[A-Z]{1,3}\s*-\s*$")


def unisci_nomi_con_sigla(conn: sqlite3.Connection, prova: bool = False) -> int:
    """Nella seconda fonte qualche antenato e' scritto con la sigla del paese
    ("TRIXTON -USA-", nonno materno di GMAIL ROAD GRIF): sul sito diventava un
    cavallo a parte, senza carriera. Si unisce al nome senza sigla."""
    if not (_tabella(conn, "vp_names") and _tabella(conn, "vp_pedigree")):
        return 0
    n = 0
    for vid, nome in conn.execute("SELECT id, name FROM vp_names").fetchall():
        if not nome or not _SIGLA.search(nome):
            continue
        base = _SIGLA.sub("", nome).strip()
        if not base:
            continue
        n += 1
        if prova:
            continue
        b = conn.execute("SELECT id FROM vp_names WHERE name = ? AND id <> ?", (base, vid)).fetchone()
        if b:
            conn.execute("UPDATE OR IGNORE vp_pedigree SET ancestor_id = ? WHERE ancestor_id = ?", (b[0], vid))
            conn.execute("UPDATE OR IGNORE vp_pedigree SET horse_id = ? WHERE horse_id = ?", (b[0], vid))
            conn.execute("DELETE FROM vp_pedigree WHERE horse_id = ? OR ancestor_id = ?", (vid, vid))
            conn.execute("DELETE FROM vp_names WHERE id = ?", (vid,))
        else:
            conn.execute("UPDATE vp_names SET name = ? WHERE id = ?", (base, vid))
        if _tabella(conn, "vp_horse_profile"):
            conn.execute("UPDATE vp_horse_profile SET maternal_gsire = ? WHERE maternal_gsire = ?", (base, nome))
    if not prova:
        conn.commit()
    return n


def completa(conn: sqlite3.Connection, prova: bool = False) -> dict:
    sigle = unisci_nomi_con_sigla(conn, prova)
    if sigle:
        print(f"[GENITORI] nomi con la sigla del paese uniti: {sigle}")
    conto = {"catalogo": 0, "vp": 0, "vp_figli": 0, "padri_catalogo": 0, "sesso_m": 0, "sesso_f": 0}
    righe = conn.execute("""SELECT rowid, name, birth_year, sire FROM horses
                             WHERE (dam IS NULL OR TRIM(dam) = '')
                               AND (COALESCE(career_races, 0) > 0
                                    OR name IN (SELECT sire FROM horses WHERE sire IS NOT NULL AND sire <> ''))""").fetchall()
    cat = {}
    if _tabella(conn, "stallions"):
        cols = {r[1] for r in conn.execute("PRAGMA table_info(stallions)")}
        if {"catalog_dam", "catalog_sire", "catalog_birth_year"} <= cols:
            for n, s, d, y in conn.execute("""SELECT name, catalog_sire, catalog_dam, catalog_birth_year FROM stallions
                                              WHERE catalog_dam IS NOT NULL AND TRIM(catalog_dam) <> ''"""):
                cat[str(n).upper().strip()] = (s, d, y)
    vp = _tabella(conn, "vp_pedigree") and _tabella(conn, "vp_names")
    for rid, n, y, s in righe:
        madre = fonte = padre_nuovo = None
        k = cat.get(str(n).upper().strip())
        if k:
            ks, kd, ky = k
            if (not s or not ks or ks.upper().strip() == s.upper().strip()) and (not y or not ky or int(ky) == int(y)):
                madre, fonte = kd.upper().strip(), "catalogo"
                if not s and ks:
                    padre_nuovo = ks.upper().strip()
        if not madre and vp:
            o = _vp_genitori_propri(conn, n)
            if o.get("m") and (not s or not o.get("p") or o["p"] == s):
                madre, fonte = o["m"], "vp"
        if not madre and vp and s and conn.execute(
                "SELECT 1 FROM horses WHERE sire = ? OR dam = ? LIMIT 1", (n, n)).fetchone():
            d = _vp_genitori_dai_figli(conn, n)
            if d.get("m") and d.get("p") == s:
                madre, fonte = d["m"], "vp_figli"
        if not madre or madre == n:
            continue
        conto[fonte] += 1
        if not prova:
            conn.execute("UPDATE horses SET dam = ? WHERE rowid = ? AND (dam IS NULL OR TRIM(dam) = '')", (madre, rid))
            if padre_nuovo:
                conn.execute("UPDATE horses SET sire = ? WHERE rowid = ? AND (sire IS NULL OR TRIM(sire) = '')", (padre_nuovo, rid))
                conto["padri_catalogo"] += 1
    if not prova:
        conto["sesso_m"] = conn.execute("""UPDATE horses SET sex = 'M' WHERE (sex IS NULL OR TRIM(sex) = '')
              AND name IN (SELECT sire FROM horses WHERE sire IS NOT NULL AND sire <> '')
              AND name NOT IN (SELECT dam FROM horses WHERE dam IS NOT NULL AND dam <> '')""").rowcount
        conto["sesso_f"] = conn.execute("""UPDATE horses SET sex = 'F' WHERE (sex IS NULL OR TRIM(sex) = '')
              AND name IN (SELECT dam FROM horses WHERE dam IS NOT NULL AND dam <> '')
              AND name NOT IN (SELECT sire FROM horses WHERE sire IS NOT NULL AND sire <> '')""").rowcount
        conn.commit()
    print(f"[GENITORI] madri trovate: {conto}")
    return conto


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--prova", action="store_true")
    a = ap.parse_args()
    completa(sqlite3.connect(a.db), prova=a.prova)
