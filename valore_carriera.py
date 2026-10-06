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
  Si usa solo cio' che si sa oggi: eta' e premi vinti negli ultimi dodici
  mesi. Per ogni anno passato (finestre di dodici mesi che finiscono nello
  stesso giorno dell'anno di oggi) si guarda in che "gradino" di premi stava
  ogni cavallo e in quale gradino e' finito l'anno dopo, oppure se si e'
  fermato. Da questi passaggi si ricava, eta' per eta', la probabilita' di
  restare in attivita' e quanto si incassa in media in ogni gradino. Per un
  cavallo di oggi si somma, anno per anno, quanto e' probabile che incassi.

  I prossimi dodici mesi, quando c'e', vengono dalla stima del modello dei
  premi (stima_premi), che tiene conto anche della forma recente; gli anni
  successivi vengono dai passaggi fra gradini.

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
N_DOPPI = N_STATI * N_STATI
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
               h.birth_year AS nato
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
    g = r.groupby(["nome", "anno_fin"]).agg(premi=("premio", "sum"), nato=("nato", "first")).reset_index()
    g["eta"] = g["anno_fin"] - g["nato"]   # eta' nell'anno in cui la finestra finisce
    return g, oggi.year


def _stati(g: pd.DataFrame, ultimo_anno: int) -> pd.DataFrame:
    """Una riga per cavallo e anno, dal primo anno in cui ha corso fino
    all'ultimo, con gli anni senza corse come "fermo"."""
    righe = []
    for nome, x in g.groupby("nome"):
        nato = int(x["nato"].iloc[0])
        premi = dict(zip(x["anno_fin"], x["premi"]))
        primo = int(x["anno_fin"].min())
        for a in range(primo, ultimo_anno + 1):
            eta = a - nato
            if eta > ETA_MAX:
                break
            p = premi.get(a)
            righe.append((nome, a, eta, -1.0 if p is None else float(p)))
    s = pd.DataFrame(righe, columns=["nome", "anno_fin", "eta", "premi"])
    s["stato"] = np.where(s["premi"] < 0, FERMO, _gradino(s["premi"].clip(lower=0).to_numpy()))
    # Anche l'anno prima conta: chi passa da 20.000 a 2.000 euro non e' come
    # chi passa da 0 a 2.000. Lo stato e' la coppia (quest'anno, anno prima).
    s = s.sort_values(["nome", "anno_fin"])
    prima = s.groupby("nome")["stato"].shift(1)
    prima_anno = s.groupby("nome")["anno_fin"].shift(1)
    s["prima"] = np.where(prima_anno == s["anno_fin"] - 1, prima.fillna(FERMO), FERMO).astype(int)
    s["doppio"] = s["stato"] * N_STATI + s["prima"]
    return s


class Catena:
    """Passaggi fra gradini, eta' per eta'."""

    def __init__(self, s: pd.DataFrame, fino_a_anno: int):
        """Usa solo i passaggi anno -> anno+1 con anno+1 <= fino_a_anno."""
        s = s.sort_values(["nome", "anno_fin"])
        nxt = s.groupby("nome")[["anno_fin", "stato"]].shift(-1)
        ok = (nxt["anno_fin"] == s["anno_fin"] + 1) & (nxt["anno_fin"] <= fino_a_anno)
        t = pd.DataFrame({"eta": s["eta"][ok], "da": s["doppio"][ok], "a": nxt["stato"][ok].astype(int)})
        # conteggi[eta, stato doppio, gradino dell'anno dopo]
        self.conteggi = np.zeros((ETA_MAX + 2, N_DOPPI, N_STATI))
        np.add.at(self.conteggi, (t["eta"].clip(ETA_MIN, ETA_MAX + 1).to_numpy(), t["da"].to_numpy(), t["a"].to_numpy()), 1)
        # premi medi e campioni per gradino ed eta' (solo anni completi)
        q = s[(s["anno_fin"] <= fino_a_anno) & (s["stato"] != FERMO)]
        self.campioni: dict[tuple[int, int], np.ndarray] = {}
        for (e, st), x in q.groupby(["eta", "stato"]):
            self.campioni[(int(e), int(st))] = x["premi"].to_numpy()
        self.media = np.zeros((ETA_MAX + 2, N_STATI))
        for e in range(ETA_MIN, ETA_MAX + 2):
            for st in range(N_GRAD):
                self.media[e, st] = self._campione(e, st).mean() if len(self._campione(e, st)) else 0.0
        # passaggi fra stati doppi: (cur, prev) -> (next, cur)
        self.passaggi = np.zeros((ETA_MAX + 2, N_DOPPI, N_DOPPI))
        for e in range(ETA_MIN, ETA_MAX + 1):
            for d in range(N_DOPPI):
                cur = d // N_STATI
                riga = self._riga(e, d)
                for nx in range(N_STATI):
                    self.passaggi[e, d, nx * N_STATI + cur] = riga[nx]

    def _campione(self, e: int, st: int) -> np.ndarray:
        for raggio in range(0, 4):
            v = [self.campioni.get((ee, st)) for ee in range(e - raggio, e + raggio + 1)]
            v = [x for x in v if x is not None]
            if v and sum(len(x) for x in v) >= MIN_OSSERVAZIONI:
                return np.concatenate(v)
        v = [x for (ee, ss), x in self.campioni.items() if ss == st]
        return np.concatenate(v) if v else np.array([])

    def _riga(self, e: int, d: int) -> np.ndarray:
        # se a quell'eta' i casi sono pochi si allarga alle eta' vicine;
        # se non basta, si ignora l'anno prima
        for raggio in range(0, 3):
            c = self.conteggi[max(ETA_MIN, e - raggio):e + raggio + 1, d].sum(axis=0)
            if c.sum() >= MIN_OSSERVAZIONI:
                return c / c.sum()
        cur = d // N_STATI
        stessi = slice(cur * N_STATI, (cur + 1) * N_STATI)
        for raggio in range(0, 5):
            c = self.conteggi[max(ETA_MIN, e - raggio):e + raggio + 1, stessi].sum(axis=(0, 1))
            if c.sum() >= MIN_OSSERVAZIONI:
                return c / c.sum()
        c = self.conteggi[:, stessi].sum(axis=(0, 1))
        if c.sum() == 0:
            r = np.zeros(N_STATI); r[FERMO] = 1.0
            return r
        return c / c.sum()

    def futuro(self, eta: int, stato: int, anni: int = 20) -> list[dict]:
        """Anno per anno: probabilita' di correre e premi attesi.
        `eta` e' l'eta' durante l'ultima finestra (quella appena conclusa)."""
        p = np.zeros(N_DOPPI); p[stato] = 1.0
        out = []
        for k in range(1, anni + 1):
            e = eta + k - 1
            if e > ETA_MAX:
                break
            p = p @ self.passaggi[e]
            e_nuova = eta + k
            if e_nuova > ETA_MAX:
                break
            pc = p.reshape(N_STATI, N_STATI).sum(axis=1)   # gradino dell'anno
            attivo = 1.0 - pc[FERMO]
            atteso = float(pc[:N_GRAD] @ self.media[e_nuova, :N_GRAD])
            out.append({"eta": e_nuova, "prob_attivo": attivo, "atteso": atteso,
                        "distribuzione": p.copy()})
            if attivo < 0.005:
                break
        return out

    def simula(self, eta: int, stato: int, primo_anno_scala: float | None, n: int = 1500,
               rng: np.random.Generator | None = None) -> np.ndarray:
        """Totale dei premi futuri in `n` carriere simulate."""
        rng = rng or np.random.default_rng(7)
        st = np.full(n, stato)
        tot = np.zeros(n)
        for k in range(1, 25):
            e = eta + k - 1
            if e >= ETA_MAX:
                break
            cum = self.passaggi[e][st].cumsum(axis=1)
            u = rng.random(n)[:, None]
            st = (u > cum).sum(axis=1).clip(0, N_DOPPI - 1)
            cur = st // N_STATI
            premi = np.zeros(n)
            for g in range(N_GRAD):
                m = cur == g
                if m.any():
                    c = self._campione(e + 1, g)
                    if len(c):
                        premi[m] = rng.choice(c, size=int(m.sum()))
            if primo_anno_scala is not None:
                premi *= _scala_anno(primo_anno_scala, k)
            tot += premi
            if (cur == FERMO).all():
                break
        return tot


def _scala_anno(scala: float, k: int) -> float:
    """Quanto il cavallo si discosta dai suoi simili secondo il modello dei
    premi (scala = stima del modello / media dei simili) vale in pieno per i
    prossimi dodici mesi e poi si attenua: dimezza ogni anno in proporzione
    (anno 2: radice quadrata, anno 3: radice quarta...). Un campione resta
    sopra la media anche dopo, ma sempre meno: col tempo i cavalli tornano
    verso i loro simili."""
    return float(scala) ** (0.5 ** (k - 1))


def stima(catena: Catena, eta: int, premi12: float, attesi_modello: float | None,
          prima: int = FERMO) -> dict:
    """Valore residuo di un cavallo: `eta` = eta' nell'anno della finestra
    appena conclusa, `premi12` = premi degli ultimi dodici mesi, `prima` =
    gradino dei dodici mesi precedenti (FERMO se non ha corso)."""
    cur = int(_gradino(np.array([max(premi12, 0.0)]))[0])
    stato = cur * N_STATI + prima
    anni = catena.futuro(eta, stato)
    if not anni:
        return {}
    primo_catena = anni[0]["atteso"]
    primo = attesi_modello if attesi_modello is not None else primo_catena
    scala = (primo / primo_catena) if (attesi_modello is not None and primo_catena > 0) else None
    if scala is not None:
        scala = min(max(scala, 0.05), 20.0)
    per_anno = [primo] + [a["atteso"] * (_scala_anno(scala, k) if scala else 1.0)
                          for k, a in enumerate(anni[1:], start=2)]
    dopo = sum(per_anno[1:])
    sim = catena.simula(eta, stato, scala)
    return {
        "gradino": NOMI_GRADINI[cur],
        "primo_anno": round(primo),
        "primo_anno_fonte": "modello" if attesi_modello is not None else "catena",
        "anni_dopo": round(dopo),
        "residuo": round(primo + dopo),
        "p25": round(float(np.percentile(sim, 25))),
        "p50": round(float(np.percentile(sim, 50))),
        "p75": round(float(np.percentile(sim, 75))),
        "prob_zero": round(float((sim <= 0).mean()), 3),
        "anni_attesi": round(sum(a["prob_attivo"] for a in anni), 1),
        "prossimi_anni": [{"eta": a["eta"], "prob_attivo": round(a["prob_attivo"], 3),
                           "atteso": round(per_anno[i])}
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
    catena = Catena(s, fino_a_anno=ultimo)
    attuali = s[(s["anno_fin"] == ultimo) & (s["stato"] != FERMO)]
    modello = {}
    try:
        modello = dict(conn.execute("SELECT horse_name, premi_attesi FROM stima_premi").fetchall())
    except sqlite3.Error:
        pass
    conn.execute("DROP TABLE IF EXISTS valore_residuo")
    conn.execute("""CREATE TABLE valore_residuo (
        horse_name TEXT PRIMARY KEY, eta INTEGER, premi_12_mesi REAL, gradino TEXT,
        primo_anno REAL, primo_anno_fonte TEXT, anni_dopo REAL, residuo REAL,
        p25 REAL, p50 REAL, p75 REAL, prob_zero REAL, anni_attesi REAL, prossimi_anni TEXT,
        calcolato_il TEXT)""")
    adesso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cache: dict[tuple[int, int], dict] = {}
    righe = []
    for _, x in attuali.iterrows():
        eta, premi12 = int(x["eta"]), float(x["premi"])
        att = modello.get(x["nome"])
        if att is None:
            chiave = (eta, int(x["stato"]), int(x["prima"]))
            if chiave not in cache:
                cache[chiave] = stima(catena, eta, premi12, None, int(x["prima"]))
            v = cache[chiave]
        else:
            v = stima(catena, eta, premi12, float(att), int(x["prima"]))
        if not v:
            continue
        righe.append((x["nome"], eta, premi12, v["gradino"], v["primo_anno"], v["primo_anno_fonte"],
                      v["anni_dopo"], v["residuo"], v["p25"], v["p50"], v["p75"], v["prob_zero"], v["anni_attesi"],
                      json.dumps(v["prossimi_anni"]), adesso))
    conn.executemany("INSERT OR REPLACE INTO valore_residuo VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", righe)
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
    catena = Catena(s, fino_a_anno=anno_prova)
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
            cache[k] = sum(a["atteso"] for a in catena.futuro(*k)[:orizzonte])
        v = voti.get(x["nome"])
        vec = None
        if v is not None:
            t = vecchio["residuo"][fascia(v)].get(str(int(x["eta"])))
            if t:
                vec = sum(a["prob_attivo"] * a["guadagno_mediano_anno"] for a in t["prossimi_anni"][:orizzonte])
        righe.append((x["nome"], int(x["eta"]), int(x["stato"]), cache[k], vec, float(futuri.get(x["nome"], 0.0))))
    df = pd.DataFrame(righe, columns=["nome", "eta", "stato", "nuova", "vecchia", "vero"])
    out = {"anno_prova": anno_prova, "anni_osservati": orizzonte, "cavalli": len(df),
           "vero_medio": round(df["vero"].mean()), "nuova_media": round(df["nuova"].mean()),
           "vecchia_media": round(df["vecchia"].mean()),
           "errore_medio_nuova": round((df["nuova"] - df["vero"]).abs().mean()),
           "errore_medio_vecchia": round((df["vecchia"] - df["vero"]).abs().mean()),
           "per_eta": {}, "per_gradino": {}}
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
