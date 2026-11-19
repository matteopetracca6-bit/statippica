#!/usr/bin/env python3
"""Recupera l'allevamento (stazione di monta) di ogni stallone del catalogo.

Perche' serve: la tabella stallions aveva l'allevamento per 17 soggetti su 257,
inseriti a mano, quindi la pagina Allevamenti mostrava 8 nomi. Il catalogo
online pubblica il dato nella scheda del singolo stallone, non nell'elenco:
questo script apre le schede e ne estrae il nome dell'allevamento.

Come distingue il dato dal contorno: ogni pagina del sito ripete lo stesso
menu e lo stesso piede di pagina. Le righe che compaiono in quasi tutte le
schede sono percio' impaginazione e vengono scartate; l'allevamento e' una
riga che appare solo nella scheda di quello stallone.

Non sovrascrive mai un allevamento gia' presente con un valore vuoto.

Uso:  python scripts/fetch_stud_farms.py [--db data.db] [--dry-run]
"""

import argparse
import re
import sqlite3
import sys
import time
from collections import Counter

import requests

BASE = "https://www.trotstallionsdirectory.com"
CATALOG = f"{BASE}/catalogo"
UA = {"User-Agent": "Mozilla/5.0 (compatible; StatIppica/1.0)"}

# Una riga e' candidata a essere un allevamento se contiene una di queste parole.
FARM_HINT = re.compile(
    r"allevament|scuderia|az\.?\s*agr|azienda\s+agr|societ|s\.?\s?r\.?\s?l|s\.?s\.?$"
    r"|centro\s+(?:di\s+)?riproduzione|stud\s+farm|haras|team\b|futurity",
    re.IGNORECASE,
)
# Righe da buttare comunque: contatti, prezzi, navigazione.
FARM_NOISE = re.compile(
    r"tasso di monta|iva|cookie|privacy|copyright|newsletter|mediahorse|@|www\.|http"
    r"|tel\.|cell\.|catalogo stalloni|trot stallions",
    re.IGNORECASE,
)


def page_lines(url: str) -> list[str]:
    r = requests.get(url, timeout=30, headers=UA)
    r.raise_for_status()
    txt = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", r.text, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", "\n", txt)
    txt = txt.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'")
    return [re.sub(r"\s+", " ", l).strip() for l in txt.split("\n") if l.strip()]


def slug_to_name(slug: str) -> str:
    return slug.rsplit("/", 1)[-1].replace("-", " ").upper()


# L'indirizzo attaccato al nome impedirebbe di raggruppare: lo stesso
# allevamento comparirebbe come "Allevamento Folli Via Seminaria, 2 - 40027
# Mordano (BO)" e come "Allevamento Folli, Mordano (BO)". Teniamo solo il nome
# e, se c'e', la provincia.
_ADDRESS = re.compile(
    r"\s*(?:via|viale|v\.le|piazza|p\.zza|strada|str\.|loc\.|localit|contrada|c\.da|\d{5})\b.*$",
    re.IGNORECASE,
)
# Forme societarie e sigle che non aiutano a distinguere un allevamento da un altro.
_SUFFIX = re.compile(r"\b(s\.?r\.?l\.?|s\.?s\.?|s\.?p\.?a\.?|soc\.?|societ[aà])\b\.?", re.IGNORECASE)
_PROV_PAREN = re.compile(r"\([A-Za-z]{2}\)")


def normalize_farm(raw: str) -> str:
    """Riduce la scritta trovata sulla pagina al nome dell'allevamento.

    Serve per raggruppare: lo stesso allevamento compare come "Allevamento
    Folli Via Seminaria, 2 - 40027 Mordano (BO)", come "Allevamento Folli,
    Mordano BO" e come "Allevamenti Toniatti" al plurale. Senza questa
    riduzione la pagina Allevamenti mostra la stessa azienda tre volte.

    Teniamo il tipo ("Allevamento") e le prime due parole distintive, che sono
    il cognome o l'insegna. L'indirizzo, la provincia, la forma societaria e
    tutto cio' che segue una virgola o un "di" vengono tolti.
    """
    name = _ADDRESS.sub("", raw)
    name = name.split(",")[0]
    name = _PROV_PAREN.sub(" ", name)
    name = _SUFFIX.sub(" ", name)
    name = re.sub(r"[^\w\s'àèéìòù]", " ", name, flags=re.UNICODE)
    words = [w for w in re.sub(r"\s+", " ", name).strip().split() if w]
    # toglie una provincia lasciata nuda in coda (es. "... Mordano BO")
    while words and len(words[-1]) == 2 and words[-1].isupper():
        words.pop()
    if not words:
        return ""
    # "Allevamenti" e "Allevamento" sono la stessa cosa
    head = words[0].lower()
    if head.startswith("allevament"):
        words[0] = "Allevamento"
    # taglia la specificazione del titolare: "Il Canf di Cesarano Aniello"
    for i, w in enumerate(words):
        if w.lower() == "di" and i >= 2:
            words = words[:i]
            break
    # Le parole generiche ("Allevamento", "Az", "Agr", "Centro"...) non contano
    # come parte distintiva, altrimenti "Az. Agr. La Corte dei Miracoli" si
    # accorcerebbe a "Az Agr La".
    generic = {"allevamento", "az", "agr", "agricola", "azienda", "centro",
               "scuderia", "scuderie", "team", "stud", "farm", "haras", "la",
               "il", "lo", "le", "de", "del", "della", "dei", "d"}
    keep, distinctive = [], 0
    for w in words:
        keep.append(w)
        if w.lower().strip(".") not in generic:
            distinctive += 1
        if distinctive >= 3:
            break
    out = []
    for w in keep:
        out.append(w if (len(w) <= 3 and not w.isalpha()) else w.capitalize())
    return " ".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    print(f"[FARMS] Elenco schede da {CATALOG}", file=sys.stderr)
    html = requests.get(CATALOG, timeout=30, headers=UA).text
    slugs = sorted(set(re.findall(r'href="(/catalogo/[a-z0-9\-]{3,60})"', html)))
    if args.limit:
        slugs = slugs[: args.limit]
    print(f"[FARMS] Schede trovate: {len(slugs)}", file=sys.stderr)

    pages: dict[str, list[str]] = {}
    for i, slug in enumerate(slugs, 1):
        try:
            pages[slug] = page_lines(BASE + slug)
        except Exception as e:
            print(f"  [WARN] {slug}: {e}", file=sys.stderr)
        if i % 25 == 0:
            print(f"  ... {i}/{len(slugs)} schede lette", file=sys.stderr)
        time.sleep(0.2)

    # Righe presenti in quasi tutte le schede = impaginazione del sito
    freq = Counter()
    for lines in pages.values():
        freq.update(set(lines))
    threshold = max(2, int(len(pages) * 0.4))
    boilerplate = {l for l, n in freq.items() if n >= threshold}
    print(f"[FARMS] Righe di impaginazione ignorate: {len(boilerplate)}", file=sys.stderr)

    found: dict[str, str] = {}
    for slug, lines in pages.items():
        for l in lines:
            if l in boilerplate or len(l) < 6 or len(l) > 160:
                continue
            if FARM_NOISE.search(l) or not FARM_HINT.search(l):
                continue
            farm = normalize_farm(l.strip(" -–|"))
            if farm:
                found[slug_to_name(slug)] = farm
            break

    print(f"[FARMS] Allevamenti estratti: {len(found)} su {len(pages)} schede", file=sys.stderr)
    for name, farm in sorted(found.items())[:10]:
        print(f"    {name:<24} -> {farm[:70]}", file=sys.stderr)

    if args.dry_run:
        print("[FARMS] dry-run: niente scritture", file=sys.stderr)
        return 0

    conn = sqlite3.connect(args.db)
    existing = {str(n).strip().upper(): f for n, f in
                conn.execute("SELECT name, stud_farm FROM stallions")}
    updated = skipped = unknown = 0
    for name, farm in found.items():
        if name not in existing:
            unknown += 1
            continue
        if existing[name]:
            skipped += 1
            continue
        conn.execute("UPDATE stallions SET stud_farm=? WHERE UPPER(TRIM(name))=?", (farm, name))
        updated += 1

    # Uniforma anche i nomi inseriti a mano in passato, altrimenti lo stesso
    # allevamento resta spezzato in due voci nella pagina Allevamenti.
    renamed = 0
    for (old,) in conn.execute(
        "SELECT DISTINCT stud_farm FROM stallions WHERE stud_farm IS NOT NULL AND stud_farm<>''"
    ).fetchall():
        new = normalize_farm(old)
        if new and new != old:
            conn.execute("UPDATE stallions SET stud_farm=? WHERE stud_farm=?", (new, old))
            renamed += 1
    print(f"[FARMS] Nomi uniformati: {renamed}", file=sys.stderr)
    conn.commit()
    tot = conn.execute(
        "SELECT COUNT(*) FROM stallions WHERE stud_farm IS NOT NULL AND stud_farm<>''"
    ).fetchone()[0]
    distinct = conn.execute(
        "SELECT COUNT(DISTINCT stud_farm) FROM stallions WHERE stud_farm IS NOT NULL AND stud_farm<>''"
    ).fetchone()[0]
    conn.close()
    print(f"[FARMS] Aggiornati {updated}, gia' presenti {skipped}, "
          f"non in anagrafica {unknown}", file=sys.stderr)
    print(f"[FARMS] Stalloni con allevamento: {tot} | allevamenti distinti: {distinct}",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
