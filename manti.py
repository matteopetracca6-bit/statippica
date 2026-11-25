"""
manti.py — Il manto (baio, baio oscuro, sauro...) per tutti i cavalli che non
ce l'hanno (25/11/2026).

Il manto arrivava solo dalle schede TrottoWeb: c'era per quasi tutti i nati
2012-2022 e per nessuno storico. Qui si prende, senza nuove richieste in rete,
da due fonti gia' nell'archivio, sempre con nome E anno di nascita uguali
(mai il solo nome: gli omonimi sono tanti):
  1. le schede VendoPuledri (vp_horse_profile.coat);
  2. i risultati ufficiali dal 2016 (gare_ufficiali_attesa.mantello, la sigla
     "cb3" accanto al nome: b baio, bo baio oscuro, s sauro, ...), il valore
     piu' frequente fra le corse del cavallo.
Le sigle incerte (bc, br, sr) restano fuori. Non tocca un manto gia' scritto.
Gli storici del registro UNIRE lo ricevono dalla scheda UNIRE (unire_source).
"""
from __future__ import annotations

import sqlite3
import sys

SIGLE = {"b": "Baio", "bo": "Baio oscuro", "s": "Sauro", "gr": "Grigio", "mo": "Morello", "ro": "Roano"}


def normale(m: str | None) -> str | None:
    if not m:
        return None
    x = " ".join(str(m).strip().lower().split())
    if x in ("baio", "baio oscuro", "sauro", "grigio", "morello", "roano", "sauro bruciato", "baio scuro"):
        return "Baio oscuro" if x == "baio scuro" else x.capitalize()
    return None


def phase_manti(conn: sqlite3.Connection) -> dict:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(horses)")}
    if "coat_color" not in cols:
        return {}
    vuoti = {}
    for nome, anno in conn.execute("SELECT name, birth_year FROM horses WHERE (coat_color IS NULL OR coat_color = '' OR coat_color = 'n/d') AND birth_year IS NOT NULL"):
        vuoti.setdefault((nome.upper(), int(anno)), []).append(nome)
    nuovi: dict[str, tuple[str, str]] = {}
    tabelle = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "vp_horse_profile" in tabelle:
        for nome, nascita, coat in conn.execute("SELECT horse_name, birth_date, coat FROM vp_horse_profile WHERE coat IS NOT NULL AND coat <> ''"):
            try:
                anno = int(str(nascita)[:4])
            except (TypeError, ValueError):
                continue
            m = normale(coat)
            for n in vuoti.get((str(nome).upper(), anno), []):
                if m and n not in nuovi:
                    nuovi[n] = (m, "vendopuledri")
    if "gare_ufficiali_attesa" in tabelle:
        conta: dict[tuple, dict] = {}
        for nome, anno, sig, k in conn.execute("""SELECT UPPER(cavallo), anno_nascita, LOWER(mantello), COUNT(*) FROM gare_ufficiali_attesa
                                                  WHERE mantello IS NOT NULL AND anno_nascita IS NOT NULL GROUP BY 1, 2, 3"""):
            conta.setdefault((nome, int(anno)), {})[sig] = k
        for chiave, c in conta.items():
            sig = max(c, key=c.get)
            m = SIGLE.get(sig)
            for n in vuoti.get(chiave, []):
                if m and n not in nuovi:
                    nuovi[n] = (m, "risultati ufficiali")
    conn.executemany("UPDATE horses SET coat_color = ? WHERE name = ? AND (coat_color IS NULL OR coat_color = '' OR coat_color = 'n/d')",
                     [(m, n) for n, (m, _) in nuovi.items()])
    conn.commit()
    esito = {"vendopuledri": sum(1 for v in nuovi.values() if v[1] == "vendopuledri"),
             "risultati_ufficiali": sum(1 for v in nuovi.values() if v[1] == "risultati ufficiali")}
    print(f"[MANTI] nuovi manti: {esito}", file=sys.stderr)
    return esito


if __name__ == "__main__":
    import os
    phase_manti(sqlite3.connect(os.environ.get("DB_PATH", "data.db")))
