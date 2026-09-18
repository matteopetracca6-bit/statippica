#!/usr/bin/env python3
"""
vendopuledri_source.py — StatIppica

Seconda fonte: VendoPuledri (www.vendopuledri.it). Espone un servizio dati
pubblico, senza chiave, su https://api.vendopuledri.it.

Perche' serve. Trottoweb ci da' le corse ma non la genealogia oltre padre e
madre, e copre solo i cavalli "da 2 a 14 anni, 10 per le femmine". Qui invece
troviamo, per qualunque cavallo e senza limiti d'eta':

  * la genealogia su cinque generazioni (62 antenati) e, soprattutto, gli
    INCROCI: quali antenati ricorrono sia da parte di padre sia da parte di
    madre e a quale generazione. E' la consanguineita', l'informazione che
    manca al modello di accoppiamento;
  * la data di nascita esatta, dove noi oggi stimiamo l'anno sottraendo l'eta'
    dichiarata, con un errore possibile di un anno;
  * le prove di qualifica dei cavalli giovani, cioe' il primo segnale che
    esiste su un soggetto, prima ancora che corra;
  * l'allevamento di ogni cavallo, con i recapiti.

Quello che NON c'e': lo storico corsa per corsa. Le corse continuano ad
arrivare da Trottoweb.

Indirizzi usati (verificati il 19/09/2026):
  GET /api/v1/classifiche/qualifiche          tutte le qualifiche (~1.500)
  GET /api/v1/cavalli/genealogia/<codice>     5 generazioni + incroci
  GET /api/v2/cavalli/<codice>                anagrafica + allevatori
  GET /api/v2/cavalli/miglioriFigli/<codice>  figli di uno stallone, con codice
  GET /api/v2/allevatori                      allevatori partner del sito

La ricerca per nome (/api/v1/cavalli/cerca) risponde errore 500: il codice di
un cavallo va quindi ricavato dagli elenchi qui sopra, non cercato.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from datetime import datetime
from typing import Any, Optional

import requests

VP_API = os.environ.get("VP_API_BASE", "https://api.vendopuledri.it")
VP_DELAY = float(os.environ.get("VP_DELAY", "0.4"))   # cortesia verso la fonte
VP_TIMEOUT = int(os.environ.get("VP_TIMEOUT", "60"))

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; StatIppica/1.0)",
    "Accept": "application/json",
    "Referer": "https://www.vendopuledri.it/",
})


def _get(path: str, retries: int = 3) -> Optional[Any]:
    """GET che ritorna il JSON, oppure None. Non solleva: una pagina che manca
    non deve fermare la notte."""
    url = VP_API + path
    for attempt in range(retries):
        try:
            r = SESSION.get(url, timeout=VP_TIMEOUT)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            time.sleep(VP_DELAY)
            return r.json()
        except Exception as e:
            if attempt == retries - 1:
                print(f"  [VP] {path}: {type(e).__name__}", file=sys.stderr)
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def _clean(s: Any) -> str:
    """I nomi arrivano con l'apostrofo tipografico ` al posto di '."""
    return str(s or "").replace("`", "'").strip().upper()


def _iso_date(v: Any) -> Optional[str]:
    """Le date arrivano come 20260914 oppure 2007-04-28."""
    s = str(v or "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    if len(s) == 10 and s[4] == "-":
        return s
    return None


# ── Schema ──────────────────────────────────────────────────────────────────

def init_vp_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    -- Da nome nostro a codice VendoPuledri. Senza questa tabella non possiamo
    -- chiedere nulla su un cavallo: la ricerca per nome della fonte e' rotta.
    CREATE TABLE IF NOT EXISTS vp_horse_codes (
        horse_name  TEXT PRIMARY KEY,
        vp_code     TEXT NOT NULL,
        source      TEXT,
        last_seen   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vp_codes_code ON vp_horse_codes(vp_code);

    -- Dizionario dei nomi: un cavallo puo' comparire come antenato di
    -- migliaia di altri, e ripeterne il nome per esteso ogni volta gonfia il
    -- file oltre il limite di 100 MB che GitHub impone. Qui il nome sta una
    -- volta sola e altrove si usa il numero.
    CREATE TABLE IF NOT EXISTS vp_names (
        id   INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    );

    -- Un antenato per riga. `path` dice dove sta: p=padre, m=madre, quindi
    -- "pm" = madre del padre, "mmp" = padre della madre della madre.
    -- La generazione e' la lunghezza di `path`, quindi non la memorizziamo.
    CREATE TABLE IF NOT EXISTS vp_pedigree (
        horse_id      INTEGER NOT NULL,
        path          TEXT NOT NULL,
        ancestor_id   INTEGER NOT NULL,
        PRIMARY KEY (horse_id, path)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_vp_ped_anc ON vp_pedigree(ancestor_id);

    -- Consanguineita': un antenato che ricorre da entrambe le parti.
    -- sire_line/dam_line sono le generazioni in cui compare, es. "4+5" e "3".
    CREATE TABLE IF NOT EXISTS vp_inbreeding (
        horse_id      INTEGER NOT NULL,
        ancestor_id   INTEGER NOT NULL,
        sire_line     TEXT,
        dam_line      TEXT,
        closest_gen   INTEGER,
        PRIMARY KEY (horse_id, ancestor_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_vp_inb_anc ON vp_inbreeding(ancestor_id);

    -- Riepilogo per cavallo, cosi' il sito non deve ricontare ogni volta.
    CREATE TABLE IF NOT EXISTS vp_horse_profile (
        horse_id       INTEGER PRIMARY KEY,
        horse_name     TEXT UNIQUE,
        vp_code        TEXT,
        birth_date     TEXT,
        sex            TEXT,
        coat           TEXT,
        nationality    TEXT,
        category       TEXT,
        record_short   TEXT,
        record_long    TEXT,
        maternal_gsire TEXT,
        n_ancestors    INTEGER,
        n_inbreeding   INTEGER,
        closest_cross  INTEGER,
        last_updated   TEXT
    );

    CREATE TABLE IF NOT EXISTS vp_breeders (
        vp_id       INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        suffix      TEXT,
        city        TEXT,
        province    TEXT,
        phone       TEXT,
        email       TEXT,
        last_seen   TEXT
    );

    CREATE TABLE IF NOT EXISTS vp_horse_breeder (
        horse_name  TEXT NOT NULL,
        breeder_id  INTEGER,
        breeder_name TEXT NOT NULL,
        PRIMARY KEY (horse_name, breeder_name)
    );
    CREATE INDEX IF NOT EXISTS idx_vp_hb_breeder ON vp_horse_breeder(breeder_name);

    -- Prove di qualifica: il primo tempo ufficiale di un cavallo giovane,
    -- prima che debutti in corsa.
    CREATE TABLE IF NOT EXISTS vp_qualifiche (
        vp_code       TEXT,
        horse_name    TEXT NOT NULL,
        qual_date     TEXT NOT NULL,
        track         TEXT,
        time_raw      TEXT,
        time_km       REAL,
        sire          TEXT,
        dam           TEXT,
        maternal_gsire TEXT,
        trainer       TEXT,
        owner         TEXT,
        breeder       TEXT,
        last_updated  TEXT,
        PRIMARY KEY (horse_name, qual_date)
    );
    CREATE INDEX IF NOT EXISTS idx_vp_qual_date ON vp_qualifiche(qual_date);
    CREATE INDEX IF NOT EXISTS idx_vp_qual_sire ON vp_qualifiche(sire);
    """)
    conn.commit()


def name_id(conn: sqlite3.Connection, name: str) -> Optional[int]:
    """Numero del nome nel dizionario, creandolo se serve."""
    n = _clean(name)
    if not n:
        return None
    row = conn.execute("SELECT id FROM vp_names WHERE name = ?", (n,)).fetchone()
    if row:
        return row[0]
    cur = conn.execute("INSERT INTO vp_names (name) VALUES (?)", (n,))
    return cur.lastrowid


# ── Tempo ───────────────────────────────────────────────────────────────────

def parse_time_km(raw: Any) -> Optional[float]:
    """"1.17.9" -> 17.9 secondi (il minuto e' sottinteso), come nel resto del DB.
    Regge anche 1"17"9 e 2.05.0 (oltre il minuto)."""
    s = str(raw or "").strip().replace('"', ".").replace("'", ".")
    parts = [p for p in s.split(".") if p != ""]
    try:
        if len(parts) == 3:
            minutes, seconds, tenths = int(parts[0]), int(parts[1]), int(parts[2])
            total = minutes * 60 + seconds + tenths / 10.0
            return round(total - 60.0, 1) if minutes >= 1 else round(total, 1)
        if len(parts) == 2:
            return round(int(parts[0]) + int(parts[1]) / 10.0, 1)
    except ValueError:
        return None
    return None


# ── Qualifiche ──────────────────────────────────────────────────────────────

def fetch_qualifiche() -> list[dict]:
    data = _get("/api/v1/classifiche/qualifiche")
    return data if isinstance(data, list) else []


def import_qualifiche(conn: sqlite3.Connection) -> tuple[int, int]:
    """Scarica tutte le qualifiche e le salva. Ritorna (righe viste, nuove)."""
    rows = fetch_qualifiche()
    now = datetime.utcnow().isoformat()
    new = 0
    for x in rows:
        name = _clean(x.get("NomeCavallo"))
        date = _iso_date(x.get("DataPre"))
        if not name or not date:
            continue
        exists = conn.execute(
            "SELECT 1 FROM vp_qualifiche WHERE horse_name=? AND qual_date=?", (name, date)
        ).fetchone()
        conn.execute("""
            INSERT OR REPLACE INTO vp_qualifiche
                (vp_code, horse_name, qual_date, track, time_raw, time_km,
                 sire, dam, maternal_gsire, trainer, owner, breeder, last_updated)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            x.get("CodiceCavallo"), name, date, (x.get("Ippodromo") or "").strip().upper(),
            x.get("TempoPre"), parse_time_km(x.get("TempoPre")),
            _clean(x.get("NomePadre")) or None, _clean(x.get("NomeMadre")) or None,
            _clean(x.get("nonnoMaterno")) or None,
            (x.get("Allenatore") or "").strip() or None,
            (x.get("Proprietario") or "").strip() or None,
            (x.get("Allevamento") or "").strip() or None,
            now,
        ))
        if not exists:
            new += 1
        code = x.get("CodiceCavallo")
        if code:
            remember_code(conn, name, code, "qualifiche")
        # L'allevamento qui e' testo libero e puo' contenere due nomi separati da " / ".
        for br in (x.get("Allevamento") or "").split(" / "):
            br = br.strip()
            if br:
                conn.execute(
                    "INSERT OR IGNORE INTO vp_horse_breeder (horse_name, breeder_id, breeder_name) VALUES (?,NULL,?)",
                    (name, br))
    conn.commit()
    return len(rows), new


# ── Codici ──────────────────────────────────────────────────────────────────

def remember_code(conn: sqlite3.Connection, name: str, code: str, source: str) -> None:
    conn.execute("""
        INSERT INTO vp_horse_codes (horse_name, vp_code, source, last_seen)
        VALUES (?,?,?,?)
        ON CONFLICT(horse_name) DO UPDATE SET
            vp_code = excluded.vp_code, last_seen = excluded.last_seen
    """, (_clean(name), str(code), source, datetime.utcnow().strftime("%Y-%m-%d")))


def harvest_codes_from_stallions(conn: sqlite3.Connection, limit: int = 40) -> int:
    """Raccoglie i codici dei figli degli stalloni di cui conosciamo il codice.

    E' il modo per costruire la rubrica nome->codice: la ricerca per nome della
    fonte non funziona, ma l'elenco dei figli di uno stallone riporta nome e
    codice di ognuno.
    """
    done = conn.execute(
        "SELECT value FROM repair_meta WHERE key='vp_sires_harvested'"
    ).fetchone()
    already = set((done[0] if done else "").split(",")) if done else set()

    sires = [r[0] for r in conn.execute(
        "SELECT vp_id FROM vendopuledri_stalloni_rankings WHERE vp_id IS NOT NULL ORDER BY vp_rank"
    ) if r[0] not in already][:limit]

    found = 0
    for code in sires:
        data = _get(f"/api/v2/cavalli/miglioriFigli/{code}")
        if isinstance(data, list):
            for block in data:
                for child in block.get("children", []) or []:
                    nm, cd = _clean(child.get("NomeCavallo")), child.get("CodiceCavallo")
                    if nm and cd:
                        remember_code(conn, nm, cd, "figli")
                        found += 1
        already.add(code)
    conn.execute(
        "INSERT OR REPLACE INTO repair_meta (key, value) VALUES ('vp_sires_harvested', ?)",
        (",".join(sorted(x for x in already if x)),))
    conn.commit()
    return found


# ── Genealogia, incroci, anagrafica, allevatori ─────────────────────────────

_GEN_DEPTH = {"genitori": 1, "nonni": 2, "bisnonni": 3, "trisnonni": 4, "bisarcavoli": 5}


def import_genealogy(conn: sqlite3.Connection, horse_name: str, code: str) -> bool:
    """Scarica genealogia + incroci + anagrafica di un cavallo. True se riuscito."""
    g = _get(f"/api/v1/cavalli/genealogia/{code}")
    if not isinstance(g, dict) or not g.get("genealogy"):
        return False

    name = _clean(horse_name)
    hid = name_id(conn, name)
    if hid is None:
        return False

    conn.execute("DELETE FROM vp_pedigree WHERE horse_id = ?", (hid,))
    for a in g.get("genealogy", []):
        path = (a.get("type") or "").strip()
        aid = name_id(conn, a.get("nome"))
        if not path or aid is None:
            continue
        conn.execute(
            "INSERT OR REPLACE INTO vp_pedigree (horse_id, path, ancestor_id) VALUES (?,?,?)",
            (hid, path, aid))

    conn.execute("DELETE FROM vp_inbreeding WHERE horse_id = ?", (hid,))
    closest = None
    for x in g.get("crossings", []) or []:
        aid = name_id(conn, x.get("name"))
        if aid is None:
            continue
        gens = []
        for side in (x.get("p"), x.get("m")):
            for part in str(side or "").split("+"):
                if part.strip().isdigit():
                    gens.append(int(part))
        near = min(gens) if gens else None
        if near is not None:
            closest = near if closest is None else min(closest, near)
        conn.execute("""
            INSERT OR REPLACE INTO vp_inbreeding
                (horse_id, ancestor_id, sire_line, dam_line, closest_gen)
            VALUES (?,?,?,?,?)
        """, (hid, aid, x.get("p"), x.get("m"), near))

    c = g.get("c") or {}
    conn.execute("""
        INSERT OR REPLACE INTO vp_horse_profile
            (horse_id, horse_name, vp_code, birth_date, sex, coat, nationality, category,
             record_short, record_long, maternal_gsire, n_ancestors, n_inbreeding,
             closest_cross, last_updated)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (hid, name, str(code), _iso_date(c.get("DataNascita")), c.get("Sesso"),
          c.get("ColoreMantello"), c.get("Nazionalita"), c.get("Categoria"),
          c.get("TempoCarrieraBreve") or None, c.get("TempoCarrieraLunga") or None,
          _clean(c.get("nonnoMaterno")) or None,
          len(g.get("genealogy", [])), len(g.get("crossings") or []), closest,
          datetime.utcnow().isoformat()))

    for br in c.get("breeders", []) or []:
        _save_breeder(conn, br)
        conn.execute("""
            INSERT OR IGNORE INTO vp_horse_breeder (horse_name, breeder_id, breeder_name)
            VALUES (?,?,?)
        """, (name, br.get("id"), (br.get("Nome") or "").strip()))
    return True


def _save_breeder(conn: sqlite3.Connection, br: dict) -> None:
    if not br.get("id") or not (br.get("Nome") or "").strip():
        return
    conn.execute("""
        INSERT INTO vp_breeders (vp_id, name, suffix, city, province, phone, email, last_seen)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(vp_id) DO UPDATE SET
            name=excluded.name, suffix=excluded.suffix, city=excluded.city,
            province=excluded.province, phone=excluded.phone, email=excluded.email,
            last_seen=excluded.last_seen
    """, (br.get("id"), (br.get("Nome") or "").strip(), br.get("Suffisso"),
          br.get("citta"), br.get("provincia"),
          br.get("telefono1") or br.get("telefono2"), br.get("email") or None,
          datetime.utcnow().strftime("%Y-%m-%d")))


def import_breeders_directory(conn: sqlite3.Connection) -> int:
    """Elenco allevatori partner del sito: pochi, ma con recapiti completi."""
    data = _get("/api/v2/allevatori")
    n = 0
    if isinstance(data, list):
        for br in data:
            _save_breeder(conn, br)
            n += 1
    conn.commit()
    return n


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "data.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE IF NOT EXISTS repair_meta (key TEXT PRIMARY KEY, value TEXT)")
    init_vp_schema(conn)
    seen, new = import_qualifiche(conn)
    print(f"qualifiche: {seen} righe, {new} nuove")
    print(f"allevatori: {import_breeders_directory(conn)}")
    print(f"codici raccolti: {harvest_codes_from_stallions(conn, limit=5)}")
    conn.close()
