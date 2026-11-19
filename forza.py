#!/usr/bin/env python3
"""
Forza e curva di carriera (novembre 2026): sostituisce il "potenziale ai 4
anni" nella scheda del cavallo.

DUE NUMERI SULLA STESSA SCALA, PER TUTTI I CAVALLI
  * FORZA: quanto vale il cavallo oggi. Si parte dal tempo al km di ogni
    corsa, corretto per pista, distanza e giornata (la stessa pista e' piu'
    veloce in estate, una giornata di pioggia rallenta tutti): ne esce una
    "cifra di velocita'" confrontabile fra eta', piste ed epoche. La forza e'
    la media delle migliori cifre degli ultimi 12 mesi, con le ultime corse
    che pesano di piu'. Scala 0-100: la posizione fra tutte le stagioni dei
    cavalli in corsa dal 2016 (50 = la stagione tipica, 90 = meglio di nove
    stagioni su dieci). Vale per il 2 anni come per l'anziano.
  * CURVA E POTENZIALE: la forza stimata a fine anno per ogni eta' futura,
    dai 2 agli 8 anni, con la forbice (10% - 90%). Il potenziale e' il punto
    piu' alto della curva: quello gia' toccato, o quello che la curva prevede.
    La stima parte da eta', forza attuale e sua tendenza, corse fatte,
    miglior stagione, sesso e da come sono andati i figli del padre.

VERIFICA (modelli/forza_verifica.json)
  * forza: prima di ogni corsa dell'ultimo anno, la forza dei partenti
    ordinata si confronta con l'ordine d'arrivo (quante coppie di cavalli
    sono nell'ordine giusto);
  * curva: formula allenata solo sulle stagioni fino al 2021, provata sulle
    previsioni per il 2022-2025: errore contro il "resta com'e'" e quante
    volte la forbice contiene il vero. La forbice si allarga con un fattore
    misurato sull'ultimo anno che la formula non ha visto (taratura).

Tabelle: forza_cavallo (oggi), forza_stagioni (fine anno per eta'),
curva_carriera (eta' future). Una carriera ferma da piu' di 180 giorni non ha
curva futura: il potenziale e' il picco toccato.

Uso: python3 forza.py [--db data.db] [--verifica]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

RADICE = Path(__file__).resolve().parent
VERIFICA = RADICE / "modelli" / "forza_verifica.json"
VERSIONE = "forza-v1"
ETA_MAX = 8
FERMO_GIORNI = 180
QUANTILI = (0.1, 0.5, 0.9)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ─────────────────────────────────────────────────────────── cifre di velocita'
def carica_corse(conn) -> pd.DataFrame:
    r = pd.read_sql_query("""
        SELECT r.horse_name AS cavallo, r.race_date AS data, r.track AS pista, r.race_number AS corsa,
               r.distance AS dist, r.time_km AS t, r.placement AS pos, r.placement_raw AS raw,
               h.birth_year AS nato, h.sex AS sesso, UPPER(TRIM(h.sire)) AS padre
        FROM races r JOIN horses h ON h.name = r.horse_name
        WHERE r.race_date IS NOT NULL AND r.track <> 'ESTERO'""", conn)
    r["d"] = pd.to_datetime(r["data"], errors="coerce")
    r = r[r["d"].notna()].copy()
    r["t"] = r["t"].where((r["t"] > 9) & (r["t"] < 25))
    r["fascia"] = pd.cut(r["dist"].fillna(1600), [0, 1700, 2150, 9999], labels=["breve", "media", "lunga"])
    return r


def cifre(r: pd.DataFrame) -> pd.DataFrame:
    """Cifra di velocita': secondi al km piu' veloci del tempo tipico di quella
    pista e distanza in quel mese, corretti per la giornata."""
    t = r[r["t"].notna()].copy()
    t["mese"] = t["d"].dt.month
    base = t.groupby(["pista", "fascia", "mese"], observed=True)["t"].transform("median")
    # Piste o mesi con poche corse: tempo tipico di pista e distanza.
    n = t.groupby(["pista", "fascia", "mese"], observed=True)["t"].transform("size")
    base2 = t.groupby(["pista", "fascia"], observed=True)["t"].transform("median")
    t["res"] = t["t"] - np.where(n >= 200, base, base2)
    # Giornata: si confronta ogni cavallo con se stesso nelle altre corse
    # (media dei suoi scarti), cosi' una giornata di soli cavalli forti non
    # sembra una pista veloce.
    media_cav = t.groupby("cavallo")["res"].transform("mean")
    t["scarto_giorno"] = t["res"] - media_cav
    giorno = t.groupby(["data", "pista"])["scarto_giorno"].transform("median")
    ng = t.groupby(["data", "pista"])["scarto_giorno"].transform("size")
    t["cifra"] = -(t["res"] - giorno * (ng / (ng + 8)))
    return t


def forma(cf: np.ndarray, pesi: np.ndarray) -> float:
    """Media pesata delle migliori tre cifre, tirata verso 0 se le corse sono poche."""
    if len(cf) == 0:
        return np.nan
    ordine = np.argsort(-cf)[:3]
    v, w = cf[ordine], pesi[ordine]
    return float((np.sum(v * w)) / (np.sum(w) + 0.5))


def stagioni(t: pd.DataFrame) -> pd.DataFrame:
    """Forma di fine anno per ogni cavallo e anno solare in cui ha corso."""
    t = t.copy()
    t["anno"] = t["d"].dt.year
    righe = []
    for (cav, anno), g in t.groupby(["cavallo", "anno"], sort=False):
        fine = pd.Timestamp(f"{anno}-12-31")
        giorni = (fine - g["d"]).dt.days.to_numpy()
        pesi = 0.5 ** (giorni / 180)
        righe.append((cav, anno, forma(g["cifra"].to_numpy(), pesi), len(g)))
    s = pd.DataFrame(righe, columns=["cavallo", "anno", "forma", "corse_t"])
    return s


def scala_da(valori: np.ndarray) -> np.ndarray:
    return np.quantile(valori[~np.isnan(valori)], np.linspace(0, 1, 101))


def in_scala(x, punti: np.ndarray):
    return np.interp(x, punti, np.arange(101), left=0, right=100)


# ─────────────────────────────────────────────────────────── curva di carriera
def tabella_stagioni(r: pd.DataFrame, s: pd.DataFrame, punti) -> pd.DataFrame:
    anag = r.drop_duplicates("cavallo").set_index("cavallo")[["nato", "sesso", "padre"]]
    s = s.join(anag, on="cavallo")
    s = s[s["nato"].notna()].copy()
    s["eta"] = (s["anno"] - s["nato"]).astype(int)
    s = s[(s["eta"] >= 2) & (s["eta"] <= 14)]
    s["v"] = in_scala(s["forma"].to_numpy(), punti)
    tutte = r.groupby(["cavallo", r["d"].dt.year]).size().rename("corse_anno").reset_index()
    tutte.columns = ["cavallo", "anno", "corse_anno"]
    s = s.merge(tutte, on=["cavallo", "anno"], how="left")
    return s


def esempi(s: pd.DataFrame, anag: pd.DataFrame, fino_al: int, padri: pd.Series | None = None):
    """Righe di allenamento/prova: dalla situazione a fine anno A (eta' a),
    la forza a fine anno A+h. Anche la situazione 'prima di correre' (a=1)."""
    s = s[s["anno"] <= fino_al]
    per_cav = {c: g.set_index("eta") for c, g in s.groupby("cavallo")}
    righe = []
    for cav, g in per_cav.items():
        nato = int(g["nato"].iloc[0])
        sesso = g["sesso"].iloc[0]
        padre = g["padre"].iloc[0]
        for a in range(1, ETA_MAX):
            anno = nato + a
            if anno > fino_al:
                break
            passato = g[g.index <= a]
            f = situazione(a, passato, sesso, padre, padri)
            for h in range(1, ETA_MAX - a + 1):
                if nato + a + h > fino_al:
                    break
                if (a + h) in g.index:
                    righe.append({**f, "h": h, "eta_obiettivo": a + h, "y": float(g.loc[a + h, "v"]),
                                  "cavallo": cav, "anno_base": anno})
    return pd.DataFrame(righe)


def situazione(a, passato: pd.DataFrame, sesso, padre, padri) -> dict:
    ult = passato.loc[a] if a in passato.index else None
    prec = passato.loc[a - 1] if (a - 1) in passato.index else None
    return {
        "eta": a,
        "femmina": 1.0 if str(sesso or "").upper().startswith("F") else 0.0,
        "v_ora": float(ult["v"]) if ult is not None else np.nan,
        "v_prima": float(prec["v"]) if prec is not None else np.nan,
        "v_migliore": float(passato["v"].max()) if len(passato) else np.nan,
        "stagioni": float(len(passato)),
        "corse_anno": float(ult["corse_anno"]) if ult is not None else 0.0,
        "corse_tot": float(passato["corse_anno"].sum()) if len(passato) else 0.0,
        "padre_m": float(padri.get(padre, np.nan)) if padri is not None else np.nan,
    }


VARIABILI = ["eta", "h", "femmina", "v_ora", "v_prima", "v_migliore", "stagioni", "corse_anno",
             "corse_tot", "padre_m"]


def media_padri(s: pd.DataFrame, fino_al: int) -> pd.Series:
    """Per ogni padre: miglior stagione media dei figli, con richiamo alla media."""
    best = s[s["anno"] <= fino_al].groupby(["padre", "cavallo"])["v"].max().reset_index()
    g = best.groupby("padre")["v"].agg(["sum", "count"])
    m = best["v"].mean()
    return (g["sum"] + 10 * m) / (g["count"] + 10)


def allena(df: pd.DataFrame) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor
    X = df[VARIABILI].to_numpy(float)
    y = df["y"].to_numpy(float)
    mod = {}
    for q in QUANTILI:
        m = HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=300, learning_rate=0.06,
                                          max_leaf_nodes=31, min_samples_leaf=40, early_stopping=False,
                                          random_state=7)
        m.fit(X, y)
        mod[q] = m
    return mod


def prevedi(mod, df: pd.DataFrame, k: float = 1.0):
    """Mediana e forbice; k allarga la forbice (taratura)."""
    X = df[VARIABILI].to_numpy(float)
    p = {q: np.clip(mod[q].predict(X), 0, 100) for q in QUANTILI}
    m = p[0.5]
    lo = np.clip(m - k * (m - np.minimum(p[0.1], m)), 0, 100)
    hi = np.clip(m + k * (np.maximum(p[0.9], m) - m), 0, 100)
    return lo, m, hi


def taratura(s: pd.DataFrame, anag, fino_al: int) -> float:
    """Fattore che porta la forbice a contenere il vero 80 volte su 100:
    formula allenata fino all'anno prima, misurata sulle stagioni di fino_al."""
    padri = media_padri(s, fino_al - 1)
    mod = allena(esempi(s, anag, fino_al - 1, padri))
    tutto = esempi(s, anag, fino_al, padri)
    cal = tutto[tutto["anno_base"] + tutto["h"] == fino_al]
    lo, m, hi = prevedi(mod, cal)
    y = cal["y"].to_numpy()
    for k in np.arange(1.0, 2.01, 0.02):
        l2 = np.clip(m - k * (m - lo), 0, 100)
        h2 = np.clip(m + k * (hi - m), 0, 100)
        if np.mean((y >= l2) & (y <= h2)) >= 0.80:
            return round(float(k), 2)
    return 2.0


# ─────────────────────────────────────────────────────────── verifica
def verifica_forza(t: pd.DataFrame, oggi: pd.Timestamp) -> dict:
    """Ordine d'arrivo contro la forza di prima della corsa, nell'ultimo anno."""
    inizio = oggi - pd.Timedelta(days=365)
    t = t.sort_values("d")
    giuste = tot = 0
    corse = 0
    storia: dict = {}
    recenti = t[t["d"] >= inizio - pd.Timedelta(days=365)]
    for (dt, pista, corsa), g in recenti.groupby(["d", "pista", "corsa"], sort=True):
        if dt >= inizio and g["pos"].notna().sum() >= 4:
            vals = []
            for cav, pos in zip(g["cavallo"], g["pos"]):
                h = storia.get(cav)
                if h and pos == pos:
                    cf = np.array([x for d0, x in h if (dt - d0).days <= 365])
                    if len(cf) >= 2:
                        pesi = np.array([0.5 ** ((dt - d0).days / 180) for d0, x in h if (dt - d0).days <= 365])
                        vals.append((forma(cf, pesi), pos))
            if len(vals) >= 4:
                corse += 1
                for i in range(len(vals)):
                    for j in range(i + 1, len(vals)):
                        if vals[i][0] == vals[j][0] or vals[i][1] == vals[j][1]:
                            continue
                        tot += 1
                        giuste += (vals[i][0] > vals[j][0]) == (vals[i][1] < vals[j][1])
        for cav, c in zip(g["cavallo"], g["cifra"]):
            storia.setdefault(cav, []).append((dt, c))
    return {"corse": corse, "coppie": tot, "ordine_giusto": round(giuste / tot, 3) if tot else None}


def verifica_curva(s: pd.DataFrame, anag, fino_al=2021, prova=(2022, 2025)) -> dict:
    k = taratura(s, anag, fino_al)
    padri = media_padri(s, fino_al)
    tr = esempi(s, anag, fino_al, padri)
    mod = allena(tr)
    tutto = esempi(s, anag, prova[1], padri)
    te = tutto[(tutto["anno_base"] >= fino_al) & (tutto["anno_base"] + tutto["h"] >= prova[0])
               & (tutto["anno_base"] + tutto["h"] <= prova[1]) & (tutto["anno_base"] <= fino_al)]
    # Solo previsioni fatte con i dati fino al 2021 (anno_base <= 2021) per il 2022-2025.
    lo, p50, hi = prevedi(mod, te, k)
    y = te["y"].to_numpy()
    base = np.where(np.isnan(te["v_ora"]), np.nanmedian(tr["y"]), te["v_ora"])
    out = {"taratura": k, "esempi_prova": int(len(te)), "errore_modello": round(float(np.mean(np.abs(p50 - y))), 2),
           "errore_resta_com_e": round(float(np.mean(np.abs(base - y))), 2),
           "copertura_80": round(float(np.mean((y >= lo) & (y <= hi))), 3),
           "per_anni_avanti": {}}
    for h in sorted(te["h"].unique()):
        k = te["h"].to_numpy() == h
        out["per_anni_avanti"][int(h)] = {
            "n": int(k.sum()), "errore_modello": round(float(np.mean(np.abs(p50[k] - y[k]))), 2),
            "errore_resta_com_e": round(float(np.mean(np.abs(base[k] - y[k]))), 2),
            "copertura_80": round(float(np.mean((y[k] >= lo[k]) & (y[k] <= hi[k]))), 3)}
    return out


# ─────────────────────────────────────────────────────────── notte
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS forza_cavallo (horse_name TEXT PRIMARY KEY, birth_year INTEGER,
        forza REAL, tendenza REAL, corse_12_mesi INTEGER, ultima_corsa TEXT, ferma INTEGER,
        potenziale REAL, potenziale_basso REAL, potenziale_alto REAL, potenziale_eta INTEGER,
        picco REAL, picco_eta INTEGER, versione TEXT, calcolato_il TEXT)""",
    """CREATE TABLE IF NOT EXISTS forza_stagioni (horse_name TEXT, eta INTEGER, anno INTEGER,
        forza REAL, corse INTEGER, ultimi_12_mesi INTEGER, PRIMARY KEY (horse_name, eta))""",
    """CREATE TABLE IF NOT EXISTS curva_carriera (horse_name TEXT, eta INTEGER, mediana REAL,
        basso REAL, alto REAL, PRIMARY KEY (horse_name, eta))""",
]


def calcola(conn, con_verifica: bool = False) -> dict:
    oggi = pd.Timestamp(date.today())
    r = carica_corse(conn)
    t = cifre(r)
    s0 = stagioni(t)
    punti = scala_da(s0["forma"].to_numpy())
    anag = r.drop_duplicates("cavallo").set_index("cavallo")[["nato", "sesso", "padre"]]
    s = tabella_stagioni(r, s0, punti)
    anno_ora = oggi.year
    # Le stagioni dell'anno in corso valgono come "fine anno" solo per oggi.
    completo = anno_ora - 1
    padri = media_padri(s, completo)
    tr = esempi(s, anag, completo, padri)
    log(f"[FORZA] {len(t)} corse con il tempo, {len(s)} stagioni, {len(tr)} esempi per la curva")
    mod = allena(tr)
    k = taratura(s, anag, completo)
    log(f"[FORZA] taratura della forbice: {k}")

    # Forza di oggi: ultimi 12 mesi, con le ultime corse che pesano di piu'.
    ult12 = t[t["d"] > oggi - pd.Timedelta(days=365)]
    righe_f = {}
    for cav, g in ult12.groupby("cavallo"):
        giorni = (oggi - g["d"]).dt.days.to_numpy()
        f_ora = forma(g["cifra"].to_numpy(), 0.5 ** (giorni / 180))
        recenti = g[giorni <= 180]
        vecchie = g[giorni > 180]
        tend = np.nan
        if len(recenti) >= 2 and len(vecchie) >= 2:
            tend = forma(recenti["cifra"].to_numpy(), np.ones(len(recenti))) - \
                forma(vecchie["cifra"].to_numpy(), np.ones(len(vecchie)))
        righe_f[cav] = (f_ora, tend, len(g))
    ultima = r.groupby("cavallo")["d"].max()

    # Situazione di oggi di ogni cavallo nato dal 2012 (e degli storici che
    # hanno corso dal 2016): eta' di quest'anno, forza attuale come stagione.
    h = pd.read_sql_query("SELECT name AS cavallo, birth_year AS nato, sex AS sesso, UPPER(TRIM(sire)) AS padre "
                          "FROM horses WHERE birth_year IS NOT NULL", conn)
    h = h[h["nato"] >= anno_ora - 24]
    per_cav = {c: g.set_index("eta") for c, g in s[s["anno"] < anno_ora].groupby("cavallo")}
    # Anno in corso per anno solare: per le carriere ferme la stagione di
    # quest'anno e' quella vera (come nella tabella "anno per anno").
    anno_in_corso = {c: g.set_index("eta") for c, g in s[s["anno"] == anno_ora].groupby("cavallo")}
    fc, curve, stag = [], [], []
    ora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    righe_prev = []
    for cav, nato, sesso, padre in h.itertuples(index=False):
        nato = int(nato)
        a = anno_ora - nato
        if a < 0:
            continue
        passato = per_cav.get(cav)
        passato = (passato[["v", "corse_anno", "anno"]].copy() if passato is not None
                   else pd.DataFrame(columns=["v", "corse_anno", "anno"]))
        f = righe_f.get(cav)
        u = ultima.get(cav)
        ferma = bool(u is not None and (oggi - u).days > FERMO_GIORNI) or a > ETA_MAX + 2
        dodici = False
        if ferma:
            g = anno_in_corso.get(cav)
            if g is not None and a in g.index:
                passato.loc[a, ["v", "corse_anno", "anno"]] = [float(g.loc[a, "v"]), g.loc[a, "corse_anno"], anno_ora]
        elif f is not None and not np.isnan(f[0]):
            # In attivita': la stagione di quest'anno e' la forza degli ultimi
            # 12 mesi, da cui parte la previsione.
            passato.loc[a, ["v", "corse_anno", "anno"]] = [float(in_scala(f[0], punti)), f[2], anno_ora]
            dodici = True
        passato = passato.astype(float)
        mai_corso = cav not in ultima.index
        if mai_corso and a > 4:
            continue        # mai corso dopo i 4 anni: niente forza e niente curva
        for eta, row in passato.iterrows():
            if eta <= a and eta >= 2:
                stag.append((cav, int(eta), int(row["anno"]), round(float(row["v"]), 1),
                             int(row["corse_anno"]) if row["corse_anno"] == row["corse_anno"] else None,
                             int(dodici and eta == a)))
        if not ferma and a < ETA_MAX:
            sit = situazione(a, passato, sesso, padre, padri) if len(passato) or a >= 1 else None
            if sit is not None:
                for hh in range(1, ETA_MAX - a + 1):
                    righe_prev.append({**sit, "h": hh, "cavallo": cav, "eta_obiettivo": a + hh})
        fc.append([cav, nato, f, u, ferma, passato])
    prev = pd.DataFrame(righe_prev)
    if len(prev):
        lo, p50, hi = prevedi(mod, prev, k)
        prev["basso"], prev["mediana"], prev["alto"] = lo, p50, hi
        curve = [(c, int(e), round(float(m), 1), round(float(b), 1), round(float(al), 1))
                 for c, e, m, b, al in prev[["cavallo", "eta_obiettivo", "mediana", "basso", "alto"]]
                 .itertuples(index=False)]
    per_curva = prev.groupby("cavallo") if len(prev) else None
    righe_fc = []
    for cav, nato, f, u, ferma, passato in fc:
        picco = picco_eta = None
        if len(passato):
            idx = passato["v"].astype(float).idxmax()
            picco, picco_eta = round(float(passato.loc[idx, "v"]), 1), int(idx)
        pot = (picco, None, None, picco_eta)
        if per_curva is not None and cav in per_curva.groups:
            g = per_curva.get_group(cav)
            i = g["mediana"].idxmax()
            if picco is None or g.loc[i, "mediana"] > picco:
                pot = (round(float(g.loc[i, "mediana"]), 1), round(float(g.loc[i, "basso"]), 1),
                       round(float(g.loc[i, "alto"]), 1), int(g.loc[i, "eta_obiettivo"]))
        forza_ora = round(float(in_scala(f[0], punti)), 1) if f is not None and not np.isnan(f[0]) else None
        # Tendenza in punti della scala: differenza fra le due meta' dell'anno.
        tend = None
        if f is not None and not np.isnan(f[1]):
            tend = round(float(in_scala(f[0], punti) - in_scala(f[0] - f[1], punti)), 1)
        righe_fc.append((cav, nato, forza_ora, tend, f[2] if f is not None else 0,
                         u.strftime("%Y-%m-%d") if u is not None else None, int(ferma),
                         pot[0], pot[1], pot[2], pot[3], picco, picco_eta, VERSIONE, ora))
    conn.execute("DROP TABLE IF EXISTS forza_stagioni")   # schema con ultimi_12_mesi (19/11/2026)
    for q in SCHEMA:
        conn.execute(q)
    conn.execute("DELETE FROM forza_cavallo")
    conn.execute("DELETE FROM forza_stagioni")
    conn.execute("DELETE FROM curva_carriera")
    conn.executemany("INSERT OR REPLACE INTO forza_cavallo VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", righe_fc)
    conn.executemany("INSERT OR REPLACE INTO forza_stagioni VALUES (?,?,?,?,?,?)", stag)
    conn.executemany("INSERT OR REPLACE INTO curva_carriera VALUES (?,?,?,?,?)", curve)
    conn.commit()
    esito = {"cavalli": len(righe_fc), "stagioni": len(stag), "curve": len(curve)}
    log(f"[FORZA] {esito}")
    if con_verifica:
        v = {"versione": VERSIONE, "calcolato_il": oggi.strftime("%Y-%m-%d"),
             "forza": verifica_forza(t, oggi), "curva": verifica_curva(s, anag)}
        c = v["curva"]
        v["curva"]["esito"] = ("affidabile" if c["errore_modello"] < c["errore_resta_com_e"]
                               and 0.75 <= c["copertura_80"] <= 0.85 else "in verifica")
        fz = v["forza"]
        v["forza"]["esito"] = "affidabile" if (fz["ordine_giusto"] or 0) >= 0.6 else "in verifica"
        VERIFICA.parent.mkdir(exist_ok=True)
        VERIFICA.write_text(json.dumps(v, ensure_ascii=False, indent=1))
        log(f"[FORZA] verifica: {json.dumps(v, ensure_ascii=False)}")
        esito["verifica"] = v
    return esito


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DB_PATH", "data.db"))
    ap.add_argument("--verifica", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db)
    calcola(conn, a.verifica)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
