#!/usr/bin/env python3
"""
Km su gara corta e su gara lunga, calcolati di notte dalle gare in archivio
(21/11/2026).

PERCHE'. La scheda mostrava un solo "record al km", il migliore su qualsiasi
distanza. Ma un trottatore puo' essere forte sul miglio e calare sui 2000
metri, o il contrario. I record corto/lungo che arrivano da vendopuledri ci
sono solo per 4 cavalli su 10 e spesso sono vecchi.

LE DUE DISTANZE. Le gare italiane si dividono in due gruppi netti:
  corta = fino a 1700 metri (1600, 1609, 1640, 1650, 1660: il "miglio")
  lunga = da 2000 metri in su (2000-2140, e le poche oltre i 2400)
Le poche gare fra 1700 e 2000 metri non contano per nessuna delle due.

L'IPPODROMO CONTA QUANTO LA DISTANZA. Sul miglio i vincitori vanno in media
a 1.13.9 a Napoli e a 1.15.6 a Montecatini. Ma le piste veloci ospitano
anche le corse migliori, quindi non basta la media della pista. Si usa il
confronto "a parita' di cavallo": per ogni cavallo che ha corso su piu'
piste, quanto il suo tempo su una pista e' sopra o sotto il suo solito.
La media di questi scarti e' la velocita' della pista (piste_velocita,
negativa = pista veloce). Si stima alternando cavallo e pista qualche volta,
sulle gare dal 2016. Il "km corretto" e' il tempo riportato a una pista media.

COSA NON SI SA. L'archivio non dice se la partenza era con l'autostart o con
i nastri, che rallentano: il numero non lo corregge, e la pagina lo dice.

PROFILO. Differenza fra km lungo e km corto (corretti). Un cavallo tipico va
piu' piano sul lungo di circa 1,6 secondi al km. Chi sta nel quarto con la
differenza piu' piccola e' "piu' adatto al lungo", chi sta nel quarto con la
piu' grande "piu' adatto al corto", gli altri "tutte e due". Solo con almeno
3 gare su ciascuna distanza.

STALLONI. Per ogni padre, quanti figli con un profilo sono adatti al corto e
quanti al lungo, e la differenza media: stalloni_distanza.

Tabelle (rifatte ogni notte): record_distanza, piste_velocita,
stalloni_distanza, distanza_soglie.
Uso: python3 scripts/record_distanza.py --db data.db
"""
from __future__ import annotations

import argparse
import collections
import os
import sqlite3
import statistics
import sys
from datetime import datetime, timezone

CORTA_MAX = 1700
LUNGA_MIN = 2000
TEMPO_MIN, TEMPO_MAX = 7.5, 25.0        # 1.07.5 - 1.25.0: fuori e' un errore della fonte
DAL = "2016-01-01"                       # gare usate per la velocita' delle piste
MIN_GARE_PISTA = 150
MIN_GARE_PROFILO = 3
GIRI = 4


def classe(dist) -> str | None:
    if not dist:
        return None
    if dist <= CORTA_MAX:
        return "corta"
    if dist >= LUNGA_MIN:
        return "lunga"
    return None


def velocita_piste(righe) -> dict:
    """{(pista, classe): scarto in secondi al km}, a parita' di cavallo."""
    per_classe = collections.defaultdict(list)
    for nome, pista, cl, t in righe:
        per_classe[cl].append((nome, pista, t))
    out = {}
    for cl, rr in per_classe.items():
        conta = collections.Counter(p for _, p, _ in rr)
        piste_ok = {p for p, n in conta.items() if n >= MIN_GARE_PISTA}
        off = {p: 0.0 for p in piste_ok}
        for _ in range(GIRI):
            # livello del cavallo, tolta la pista
            somma = collections.defaultdict(float); n = collections.Counter()
            for nome, p, t in rr:
                somma[nome] += t - off.get(p, 0.0); n[nome] += 1
            liv = {k: somma[k] / n[k] for k in n}
            # scarto della pista, tolto il cavallo (solo cavalli con piu' piste)
            piste_di = collections.defaultdict(set)
            for nome, p, _ in rr:
                piste_di[nome].add(p)
            sp = collections.defaultdict(float); np_ = collections.Counter()
            for nome, p, t in rr:
                if p in piste_ok and len(piste_di[nome]) > 1:
                    sp[p] += t - liv[nome]; np_[p] += 1
            nuovo = {p: sp[p] / np_[p] for p in piste_ok if np_[p] >= 50}
            if not nuovo:
                break
            # media pesata zero: la pista "media" vale 0
            tot = sum(np_[p] for p in nuovo)
            m = sum(nuovo[p] * np_[p] for p in nuovo) / tot
            off = {p: nuovo[p] - m for p in nuovo}
        for p, v in off.items():
            out[(p, cl)] = (round(v, 3), conta[p])
    return out


def calcola(conn) -> dict:
    ora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    gare = conn.execute(f"""
        SELECT horse_name, race_date, track, distance, time_km, placement
          FROM races
         WHERE time_km BETWEEN {TEMPO_MIN} AND {TEMPO_MAX} AND distance > 0""").fetchall()
    # "ESTERO" mette insieme Francia, Svezia, Baleari...: non e' una pista, e
    # la sua velocita' non vuol dire niente. Le gare all'estero contano per il
    # km di sempre, non per quello corretto.
    per_vel = [(n, p, classe(d), t) for n, data, p, d, t, _ in gare
               if classe(d) and p and p != "ESTERO" and data and data >= DAL]
    vel = velocita_piste(per_vel)

    migliori = {}   # (nome, classe) -> dati
    for n, data, p, d, t, pos in gare:
        cl = classe(d)
        if not cl:
            continue
        v = vel.get((p, cl))
        corr = t - v[0] if v else None      # solo piste italiane con velocita' nota
        k = (n, cl)
        m = migliori.get(k)
        if m is None:
            migliori[k] = m = {"km": t, "data": data, "pista": p, "dist": d, "pos": pos,
                               "corr": None, "corr_data": None, "corr_pista": None, "n": 0, "n_corr": 0}
        m["n"] += 1
        if t < m["km"] or (t == m["km"] and (data or "") > (m["data"] or "")):
            m.update(km=t, data=data, pista=p, dist=d, pos=pos)
        if corr is not None:
            m["n_corr"] += 1
            if m["corr"] is None or corr < m["corr"]:
                m.update(corr=corr, corr_data=data, corr_pista=p)

    nomi = {n for n, _ in migliori}
    diff = {}
    for n in nomi:
        c, l = migliori.get((n, "corta")), migliori.get((n, "lunga"))
        if c and l and c["n_corr"] >= MIN_GARE_PROFILO and l["n_corr"] >= MIN_GARE_PROFILO:
            diff[n] = l["corr"] - c["corr"]
    if len(diff) >= 100:
        q1, med, q3 = statistics.quantiles(list(diff.values()), n=4)
    else:
        q1, med, q3 = 0.9, 1.6, 2.2

    def profilo(n):
        if n not in diff:
            return None
        return "lungo" if diff[n] <= q1 else "corto" if diff[n] >= q3 else "entrambi"

    conn.execute("DROP TABLE IF EXISTS record_distanza")
    conn.execute("""CREATE TABLE record_distanza (
        horse_name TEXT PRIMARY KEY,
        corto_km REAL, corto_data TEXT, corto_pista TEXT, corto_dist INTEGER, corto_pos INTEGER, corto_n INTEGER,
        corto_corr REAL, corto_corr_data TEXT, corto_corr_pista TEXT,
        lungo_km REAL, lungo_data TEXT, lungo_pista TEXT, lungo_dist INTEGER, lungo_pos INTEGER, lungo_n INTEGER,
        lungo_corr REAL, lungo_corr_data TEXT, lungo_corr_pista TEXT,
        differenza REAL, profilo TEXT, calcolato_il TEXT)""")
    righe = []
    for n in nomi:
        c, l = migliori.get((n, "corta")), migliori.get((n, "lunga"))
        def parte(m):
            if not m:
                return [None] * 9
            return [m["km"], m["data"], m["pista"], m["dist"], m["pos"], m["n"],
                    round(m["corr"], 2) if m["corr"] is not None else None, m["corr_data"], m["corr_pista"]]
        pc, pl = parte(c), parte(l)
        d = diff.get(n)
        righe.append([n, *pc, *pl, round(d, 2) if d is not None else None, profilo(n), ora])
    conn.executemany(f"INSERT INTO record_distanza VALUES ({','.join('?' * 22)})", righe)

    conn.execute("DROP TABLE IF EXISTS piste_velocita")
    conn.execute("CREATE TABLE piste_velocita (pista TEXT, classe TEXT, scarto REAL, gare INTEGER, PRIMARY KEY (pista, classe))")
    conn.executemany("INSERT INTO piste_velocita VALUES (?,?,?,?)", [(p, cl, v, g) for (p, cl), (v, g) in vel.items()])

    conn.execute("DROP TABLE IF EXISTS distanza_soglie")
    conn.execute("CREATE TABLE distanza_soglie (nome TEXT PRIMARY KEY, valore REAL)")
    conn.executemany("INSERT INTO distanza_soglie VALUES (?,?)",
                     [("q1", round(q1, 2)), ("mediana", round(med, 2)), ("q3", round(q3, 2)), ("cavalli", len(diff))])

    # Stalloni: profilo dei figli
    padre = dict(conn.execute("SELECT name, sire FROM horses WHERE sire IS NOT NULL AND sire <> ''").fetchall())
    per_padre = collections.defaultdict(list)
    for n, d in diff.items():
        if padre.get(n):
            per_padre[padre[n]].append(d)
    conn.execute("DROP TABLE IF EXISTS stalloni_distanza")
    conn.execute("""CREATE TABLE stalloni_distanza (sire TEXT PRIMARY KEY, figli INTEGER, figli_corto INTEGER,
                    figli_lungo INTEGER, figli_entrambi INTEGER, differenza_media REAL, profilo TEXT)""")
    st_righe = []
    for s, ds in per_padre.items():
        if len(ds) < 5:
            continue
        nc = sum(1 for d in ds if d >= q3); nl = sum(1 for d in ds if d <= q1)
        dm = statistics.mean(ds)
        # Profilo del padre solo con almeno 10 figli con profilo, e se da una
        # parte ce ne sono almeno una volta e mezzo quelli dell'altra e almeno
        # un terzo del totale (per caso se ne aspetta un quarto per parte).
        prof = None
        if len(ds) >= 10:
            if nl >= 1.5 * max(nc, 1) and nl / len(ds) >= 0.33:
                prof = "lungo"
            elif nc >= 1.5 * max(nl, 1) and nc / len(ds) >= 0.33:
                prof = "corto"
            else:
                prof = "entrambi"
        st_righe.append((s, len(ds), nc, nl, len(ds) - nc - nl, round(dm, 2), prof))
    conn.executemany("INSERT INTO stalloni_distanza VALUES (?,?,?,?,?,?,?)", st_righe)
    conn.commit()
    esito = {"cavalli": len(nomi), "con_corto": sum(1 for n in nomi if (n, "corta") in migliori),
             "con_lungo": sum(1 for n in nomi if (n, "lunga") in migliori), "con_profilo": len(diff),
             "piste": len(vel), "stalloni": len(st_righe), "soglie": (round(q1, 2), round(med, 2), round(q3, 2))}
    print(f"[DISTANZA] {esito}", file=sys.stderr)
    return esito


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    calcola(sqlite3.connect(ap.parse_args().db))
