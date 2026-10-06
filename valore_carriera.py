"""
valore_carriera.py — Quanto puo' ancora guadagnare un cavallo che corre oggi.

PERCHE' E' CAMBIATO (ottobre 2026)
  La vecchia stima ("Quanto puo' ancora guadagnare" nella scheda del cavallo)
  divideva i cavalli per fascia di VOTO FINALE. Ma il voto finale di un
  cavallo gia' ritirato riassume anche la sua carriera breve: chi ha smesso
  presto resta con un voto basso. Cosi' un cavallo giovane con voto basso
  veniva paragonato a cavalli che, col senno di poi, si erano fermati quasi
  subito, e la stima diceva "il meglio e' alle spalle" anche a chi aveva
  appena cominciato. Caso INCREDIBLE RUN (3 anni, 1.737 euro in un anno):
  la vecchia stima dava circa 200 euro per tutto il resto della carriera,
  mentre i cavalli con lo stesso profilo, negli anni passati, nei dodici
  mesi dopo hanno vinto in media circa 3.400 euro.

COME FUNZIONA ORA
  Si usa solo cio' che si sa oggi: eta', VOTO e premi vinti negli ultimi
  dodici mesi. Si cercano i cavalli simili degli anni passati (stessa eta',
  stesso gruppo di voto com'era ALLORA, stesso gradino di premi) e si guarda
  quanto hanno vinto davvero negli anni successivi e quanti hanno smesso.
  Il voto dei cavalli passati e' ricostruito con le sole gare corse fino a
  quel momento, con la stessa formula del riquadro sull'affidabilita' del
  voto: cosi' non si guarda nel futuro.

  I prossimi dodici mesi, quando c'e', vengono dalla stima del modello dei
  premi (stima_premi), che tiene conto anche della forma recente; gli anni
  successivi e il caso tipico vengono dai cavalli simili.

  Il risultato va nella tabella `valore_residuo`, una riga per cavallo.

PROVA
  python3 valore_carriera.py --prova   confronta stima e incasso vero sui
                                        cavalli del 2021 (anni 2022-2025)
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

# Gradini di premi in un anno (euro). -1 = non ha corso ("fermo").
SOGLIE = [0, 1_000, 3_000, 7_000, 15_000, 30_000]
NOMI_GRADINI = ["0", "fino a 1.000", "1.000-3.000", "3.000-7.000",
                "7.000-15.000", "15.000-30.000", "oltre 30.000"]
N_GRAD = len(NOMI_GRADINI)
FERMO = N_GRAD           # indice dello stato "non ha corso"
N_STATI = N_GRAD + 1
# Gruppi di voto (stessa scala del sito: percentile fra i coetanei).
GRUPPI_VOTO = ["A o meglio", "B", "C", "D", "E-F"]
SOGLIE_VOTO = [0.75, 0.60, 0.40, 0.25]          # A>=75, B>=60, C>=40, D>=25
LETTERA_GRUPPO = {"SSS": 0, "SS": 0, "S": 0, "A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 4}
N_VOTI = len(GRUPPI_VOTO)
N_DOPPI = N_STATI * N_VOTI
ETA_MIN, ETA_MAX = 2, 15
MIN_OSSERVAZIONI = 40


def _gradino(premi: np.ndarray) -> np.ndarray:
    g = np.zeros(len(premi), dtype=int)
    for i, s in enumerate(SOGLIE):
        g[premi > s] = i + 1
    return g


def _finestre(conn: sqlite3.Connection, oggi: date) -> tuple[pd.DataFrame, int]:
    """Premi per cavallo e per finestra di dodici mesi che finisce nel giorno
    dell'anno di `oggi`. Finestra k = [anno0+k, anno0+k+1). L'ultima
    finestra (quella che finisce oggi) e' la situazione attuale."""
    r = pd.read_sql_query("""
        SELECT r.horse_name AS nome, r.race_date AS d, COALESCE(r.prize_net, 0) AS premio,
               h.birth_year AS nato, r.placement AS pos, r.time_km AS t
          FROM races r JOIN horses h ON h.name = r.horse_name
         WHERE r.race_date LIKE '____-__-__' AND h.birth_year IS NOT NULL
           AND COALESCE(r.placement_raw, '') NOT IN ('nr', 'n.p.')
    """, conn)
    d = pd.to_datetime(r["d"], errors="coerce")
    r = r[d.notna()].copy()
    d = d[d.notna()]
    md = d.dt.month * 100 + d.dt.day
    soglia = oggi.month * 100 + oggi.day
    # la finestra "dell'anno Y" va dal giorno di oggi dell'anno Y-1 al giorno prima di oggi dell'anno Y
    r["anno_fin"] = d.dt.year + (md >= soglia).astype(int)
    r = r[r["anno_fin"] <= oggi.year]
    r["vinta"] = (r["pos"] == 1).astype(int)
    r["t"] = pd.to_numeric(r["t"], errors="coerce")
    r.loc[(r["t"] < 9) | (r["t"] > 40), "t"] = np.nan   # 14.7 = 1'14"7
    g = r.groupby(["nome", "anno_fin"]).agg(premi=("premio", "sum"), nato=("nato", "first"),
                                            vitt=("vinta", "sum"), n=("vinta", "size"),
                                            t=("t", "min")).reset_index()
    g["eta"] = g["anno_fin"] - g["nato"]   # eta' nell'anno in cui la finestra finisce
    return g, oggi.year


def _stati(g: pd.DataFrame, ultimo_anno: int) -> pd.DataFrame:
    """Una riga per cavallo e anno, dal primo anno in cui ha corso fino
    all'ultimo, con gli anni senza corse come "fermo". Per ogni anno anche il
    VOTO che il cavallo aveva ALLORA, ricostruito con le sole gare corse fino
    a quel momento e confrontato con i coetanei di allora."""
    righe = []
    for nome, x in g.groupby("nome"):
        nato = int(x["nato"].iloc[0])
        per_anno = {int(a): (p, v, n, t) for a, p, v, n, t in
                    zip(x["anno_fin"], x["premi"], x["vitt"], x["n"], x["t"])}
        primo = int(x["anno_fin"].min())
        for a in range(primo, ultimo_anno + 1):
            eta = a - nato
            if eta > ETA_MAX:
                break
            p, v, n, t = per_anno.get(a, (None, 0, 0, np.nan))
            righe.append((nome, nato, a, eta, -1.0 if p is None else float(p), v, n, t))
    s = pd.DataFrame(righe, columns=["nome", "nato", "anno_fin", "eta", "premi", "vitt", "n", "t"])
    s["stato"] = np.where(s["premi"] < 0, FERMO, _gradino(s["premi"].clip(lower=0).to_numpy()))
    s = s.sort_values(["nome", "anno_fin"])
    gr = s.groupby("nome")
    s["c_euro"] = gr["premi"].transform(lambda v: v.clip(lower=0).cumsum())
    s["c_vitt"] = gr["vitt"].cumsum()
    s["c_n"] = gr["n"].cumsum()
    s["c_t"] = gr["t"].cummin()
    s["voto"] = _voto_allora(s)
    s["doppio"] = s["stato"] * N_VOTI + s["voto"]
    return s


def _voto_allora(s: pd.DataFrame) -> np.ndarray:
    """Gruppo di voto con la stessa formula usata per ricostruire i voti
    passati nel resto del sito (affidabilita' del voto): 60% premi, 20%
    miglior tempo, 20% vittorie, tutto in percentile fra i nati dello stesso
    anno che avevano corso fino a quel momento."""
    k = ["nato", "anno_fin"]
    pg = s.groupby(k)["c_euro"].rank(pct=True, method="max") * 100
    pr = s.groupby(k)["c_t"].rank(pct=True, ascending=False, method="max") * 100
    pr = pr.where(s["c_t"].notna(), pg)
    tot = s.groupby(k)[["c_vitt", "c_n"]].transform("sum")
    media_v = (tot["c_vitt"] / tot["c_n"].replace(0, np.nan)).fillna(0) * 100
    pw = (s["c_vitt"] + 20 * media_v / 100) / (s["c_n"] + 20) * 100
    punti = pg * 0.60 + pr * 0.20 + pw * 0.20
    q = punti.groupby([s["nato"], s["anno_fin"]]).rank(pct=True, method="max")
    v = np.full(len(s), N_VOTI - 1)
    for i, soglia in reversed(list(enumerate(SOGLIE_VOTO))):
        v[(q >= soglia).to_numpy()] = i
    return v


class Simili:
    """Cavalli simili del passato: stessa eta', stesso gruppo di voto (come
    era ALLORA), stessi premi nell'ultimo anno. Per ogni anno futuro si guarda
    direttamente quanto hanno vinto davvero, senza modelli in mezzo.

    Ogni anno futuro k usa tutti i cavalli simili per cui l'anno k e' gia'
    passato: per i giovani di oggi gli anni lontani vengono da cavalli di
    qualche stagione fa."""

    ANNI = 12
    ORIZZONTE_TIPICO = 6   # per il caso tipico servono carriere seguite per 6 anni

    def __init__(self, s: pd.DataFrame, fino_a_anno: int):
        self.fino = fino_a_anno
        piv = s.pivot_table(index="nome", columns="anno_fin", values="premi")
        base = s[(s["stato"] != FERMO) & (s["anno_fin"] < fino_a_anno)][
            ["nome", "anno_fin", "eta", "stato", "voto"]].reset_index(drop=True)
        anni = list(piv.columns)
        idx = {a: i for i, a in enumerate(anni)}
        M = piv.to_numpy()
        riga = {n: i for i, n in enumerate(piv.index)}
        ri = base["nome"].map(riga).to_numpy()
        fut = np.full((len(base), self.ANNI), np.nan)     # premi all'anno +k (nan = non ancora passato)
        for k in range(1, self.ANNI + 1):
            a = base["anno_fin"].to_numpy() + k
            ok = (a <= fino_a_anno) & (base["eta"].to_numpy() + k <= ETA_MAX)
            col = np.array([idx.get(int(x), -1) for x in a])
            v = np.where(col >= 0, M[ri, np.clip(col, 0, None)], np.nan)
            v = np.where(np.isnan(v), -1.0, v)          # nessuna corsa = fermo
            fut[:, k - 1] = np.where(ok, v, np.nan)
            # oltre ETA_MAX: carriera finita, conta come zero
            fut[:, k - 1] = np.where((a <= fino_a_anno) & (base["eta"].to_numpy() + k > ETA_MAX), -1.0, fut[:, k - 1])
        self.base = base
        self.fut = fut

    def _gruppo(self, eta: int, stato: int, voto: int, serve_k: int) -> np.ndarray:
        """Indici dei cavalli simili che hanno l'anno +serve_k gia' osservato.
        Se sono pochi si allarga prima alle eta' vicine, poi ai voti vicini."""
        b = self.base
        oss = ~np.isnan(self.fut[:, serve_k - 1])
        st = (b["stato"].to_numpy() == stato) & oss
        for voti in ([voto], [v for v in (voto - 1, voto, voto + 1) if 0 <= v < N_VOTI]):
            vm = np.isin(b["voto"].to_numpy(), voti)
            for r in range(0, 4):
                m = st & vm & (np.abs(b["eta"].to_numpy() - eta) <= r)
                if m.sum() >= MIN_OSSERVAZIONI:
                    return m
        for r in range(0, 6):
            m = st & (np.abs(b["eta"].to_numpy() - eta) <= r)
            if m.sum() >= MIN_OSSERVAZIONI:
                return m
        return st

    def stima(self, eta: int, stato: int, voto: int) -> dict:
        per_anno = []
        for k in range(1, self.ANNI + 1):
            if eta + k > ETA_MAX:
                break
            m = self._gruppo(eta, stato, voto, k)
            if not m.any():
                break
            v = self.fut[m, k - 1]
            per_anno.append({"eta": eta + k, "prob_attivo": float((v >= 0).mean()),
                             "atteso": float(np.clip(v, 0, None).mean()), "n": int(m.sum())})
            if per_anno[-1]["prob_attivo"] < 0.005:
                break
        # caso tipico: totale dei premi nei 6 anni dopo, sui simili seguiti per 6 anni
        k6 = min(self.ORIZZONTE_TIPICO, max(1, ETA_MAX - eta))
        m = self._gruppo(eta, stato, voto, k6)
        tot = np.clip(self.fut[m, :k6], 0, None).sum(axis=1) if m.any() else np.array([0.0])
        return {"anni": per_anno, "totali": tot}


def stima(simili: Simili, eta: int, premi12: float, attesi_modello: float | None,
          voto: int) -> dict:
    """Valore residuo: `eta` = eta' di oggi, `premi12` = premi degli ultimi
    dodici mesi, `voto` = gruppo di voto (0 = A o meglio ... 4 = E-F)."""
    cur = int(_gradino(np.array([max(premi12, 0.0)]))[0])
    r = simili.stima(eta, cur, voto)
    anni, tot = r["anni"], r["totali"]
    if not anni:
        return {}
    primo_simili = anni[0]["atteso"]
    primo = attesi_modello if attesi_modello is not None else primo_simili
    dopo = sum(a["atteso"] for a in anni[1:])
    # Il caso tipico viene dai simili; il primo anno lo si allinea al modello
    # dei premi spostando i totali della differenza (mai sotto zero).
    spost = primo - primo_simili
    tot = np.clip(tot + spost * (tot > 0), 0, None)
    return {
        "gradino": NOMI_GRADINI[cur],
        "primo_anno": round(primo),
        "primo_anno_fonte": "modello" if attesi_modello is not None else "simili",
        "anni_dopo": round(dopo),
        "residuo": round(primo + dopo),
        "p25": round(float(np.percentile(tot, 25))),
        "p50": round(float(np.percentile(tot, 50))),
        "p75": round(float(np.percentile(tot, 75))),
        "prob_zero": round(float((tot <= 0).mean()), 3),
        "anni_attesi": round(sum(a["prob_attivo"] for a in anni), 1),
        "n_simili": int(len(r["totali"])),
        "prossimi_anni": [{"eta": a["eta"], "prob_attivo": round(a["prob_attivo"], 3),
                           "atteso": round(a["atteso"] if i else primo)}
                          for i, a in enumerate(anni[:6])],
    }


# ─────────────────────────────────────────────
# Lavoro notturno
# ─────────────────────────────────────────────
def phase_valore_residuo(conn: sqlite3.Connection, oggi: date | None = None) -> int:
    oggi = oggi or datetime.now(timezone.utc).date()
    g, ultimo = _finestre(conn, oggi)
    s = _stati(g, ultimo)
    # l'ultima finestra (fino a oggi) e' la situazione attuale: per i passaggi
    # si usano solo le finestre concluse prima
    simili = Simili(s, fino_a_anno=ultimo)
    attuali = s[(s["anno_fin"] == ultimo) & (s["stato"] != FERMO)]
    # Il voto: quello mostrato dal sito, se il cavallo ce l'ha; altrimenti
    # quello ricostruito qui con la stessa formula.
    lettere = {}
    try:
        lettere = dict(conn.execute(
            "SELECT name, grade FROM horse_ratings WHERE rating_mode = 'performance'").fetchall())
    except sqlite3.Error:
        pass
    modello = {}
    try:
        modello = dict(conn.execute("SELECT horse_name, premi_attesi FROM stima_premi").fetchall())
    except sqlite3.Error:
        pass
    conn.execute("DROP TABLE IF EXISTS valore_residuo")
    conn.execute("""CREATE TABLE valore_residuo (
        horse_name TEXT PRIMARY KEY, eta INTEGER, premi_12_mesi REAL, gradino TEXT,
        primo_anno REAL, primo_anno_fonte TEXT, anni_dopo REAL, residuo REAL,
        voto TEXT, n_simili INTEGER, p25 REAL, p50 REAL, p75 REAL, prob_zero REAL, anni_attesi REAL, prossimi_anni TEXT,
        calcolato_il TEXT)""")
    adesso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cache: dict[tuple[int, int], dict] = {}
    righe = []
    for _, x in attuali.iterrows():
        eta, premi12 = int(x["eta"]), float(x["premi"])
        voto = LETTERA_GRUPPO.get(str(lettere.get(x["nome"]) or ""), int(x["voto"]))
        att = modello.get(x["nome"])
        if att is None:
            chiave = (eta, int(x["stato"]), voto)
            if chiave not in cache:
                cache[chiave] = stima(simili, eta, premi12, None, voto)
            v = cache[chiave]
        else:
            v = stima(simili, eta, premi12, float(att), voto)
        if not v:
            continue
        righe.append((x["nome"], eta, premi12, v["gradino"], v["primo_anno"], v["primo_anno_fonte"],
                      v["anni_dopo"], v["residuo"], GRUPPI_VOTO[voto], v["n_simili"], v["p25"], v["p50"], v["p75"], v["prob_zero"], v["anni_attesi"],
                      json.dumps(v["prossimi_anni"]), adesso))
    conn.executemany("INSERT OR REPLACE INTO valore_residuo VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", righe)
    conn.commit()
    print(f"[VALORE RESIDUO] {len(righe)} cavalli", file=sys.stderr)
    return len(righe)


# ─────────────────────────────────────────────
# Prova sul passato
# ─────────────────────────────────────────────
def prova(conn: sqlite3.Connection, oggi: date | None = None, anno_prova: int = 2022) -> dict:
    """Situazione alla fine della finestra `anno_prova`; incasso vero negli
    anni successivi fino a oggi. La catena vede solo passaggi conclusi entro
    `anno_prova`. Confronto con la vecchia tavola per fascia di voto."""
    oggi = oggi or datetime.now(timezone.utc).date()
    g, ultimo = _finestre(conn, oggi)
    s = _stati(g, ultimo)
    simili = Simili(s, fino_a_anno=anno_prova)
    orizzonte = ultimo - anno_prova
    base = s[(s["anno_fin"] == anno_prova) & (s["stato"] != FERMO) & (s["eta"] <= ETA_MAX - 1)]
    futuri = s[(s["anno_fin"] > anno_prova)].groupby("nome")["premi"].apply(lambda v: v.clip(lower=0).sum())
    vecchio = json.load(open(os.path.join(os.path.dirname(__file__), "career_value_model.json")))
    voti = dict(conn.execute("SELECT name, score FROM horse_ratings").fetchall())

    def fascia(v):
        return "70+" if v >= 70 else "60-70" if v >= 60 else "50-60" if v >= 50 else "40-50" if v >= 40 else "30-40" if v >= 30 else "<30"

    righe = []
    cache = {}
    for _, x in base.iterrows():
        k = (int(x["eta"]), int(x["doppio"]))
        if k not in cache:
            e_, d_ = k
            cache[k] = sum(a["atteso"] for a in simili.stima(e_, d_ // N_VOTI, d_ % N_VOTI)["anni"][:orizzonte])
        v = voti.get(x["nome"])
        vec = None
        if v is not None:
            t = vecchio["residuo"][fascia(v)].get(str(int(x["eta"])))
            if t:
                vec = sum(a["prob_attivo"] * a["guadagno_mediano_anno"] for a in t["prossimi_anni"][:orizzonte])
        righe.append((x["nome"], int(x["eta"]), int(x["stato"]), int(x["voto"]), cache[k], vec, float(futuri.get(x["nome"], 0.0))))
    df = pd.DataFrame(righe, columns=["nome", "eta", "stato", "voto", "nuova", "vecchia", "vero"])
    out = {"anno_prova": anno_prova, "anni_osservati": orizzonte, "cavalli": len(df),
           "vero_medio": round(df["vero"].mean()), "nuova_media": round(df["nuova"].mean()),
           "vecchia_media": round(df["vecchia"].mean()),
           "errore_medio_nuova": round((df["nuova"] - df["vero"]).abs().mean()),
           "errore_medio_vecchia": round((df["vecchia"] - df["vero"]).abs().mean()),
           "per_eta": {}, "per_gradino": {}, "per_voto": {}}
    for vv, x in df.groupby("voto"):
        out["per_voto"][GRUPPI_VOTO[vv]] = [len(x), round(x["vero"].mean()), round(x["nuova"].mean()),
                                            round(x["vero"].median()), round(x["vecchia"].mean())]
    for e, x in df.groupby("eta"):
        if len(x) >= 100:
            out["per_eta"][int(e)] = [len(x), round(x["vero"].mean()), round(x["nuova"].mean()), round(x["vecchia"].mean())]
    for st, x in df.groupby("stato"):
        out["per_gradino"][NOMI_GRADINI[st]] = [len(x), round(x["vero"].mean()), round(x["nuova"].mean()), round(x["vecchia"].mean())]
    return out


if __name__ == "__main__":
    db = os.environ.get("DB_PATH", "data.db")
    c = sqlite3.connect(db)
    if "--prova" in sys.argv:
        print(json.dumps(prova(c), ensure_ascii=False, indent=1))
    else:
        phase_valore_residuo(c)
