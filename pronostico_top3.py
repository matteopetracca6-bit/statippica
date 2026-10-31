"""
pronostico_top3.py — Probabilita' di arrivare nei primi tre, prima della partenza.

COSA FA
  Per ogni cavallo iscritto a una gara in calendario stima la probabilita' di
  chiudere primo, secondo o terzo. La stima viene da un modello XGBoost
  allenato sulle gare dell'archivio, e si scrive nella tabella
  `pronostico_top3`, che il sito legge nella pagina Calendario.

LA REGOLA CHE CONTA DI PIU': NIENTE DAL FUTURO
  Ogni dato che entra nella stima e' calcolato com'era il giorno della gara,
  usando solo le corse precedenti. Il voto attuale del cavallo, per esempio,
  NON entra: contiene anche le corse venute dopo, e farebbe sembrare il
  modello piu' bravo di quello che e'. Lo stesso vale per il guidatore: nelle
  gare in calendario la fonte non lo indica, quindi si usa quello dell'ultima
  corsa del cavallo, sia per allenare sia per stimare.

DUE MODI DI USO
  python3 pronostico_top3.py --allena   allena, verifica e salva il modello
                                        (si fa a mano, quando serve)
  phase_pronostico_top3(conn)           dentro il lavoro notturno: calcola le
                                        stime per le gare in calendario

  Il lavoro notturno non ha bisogno di XGBoost: il modello salvato e' un
  elenco di alberi di decisione, e qui sotto c'e' il codice che li percorre.
  Servono solo numpy e pandas. La verifica controlla che questo codice dia
  esattamente gli stessi numeri di XGBoost.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "top3_xgb.json"
FILE_VERIFICA = CARTELLA / "top3_verifica.json"
NOME_MODELLO = "top3-xgb-v4"

# Ordine fisso delle variabili: il modello le legge per posizione.
VARIABILI = [
    "h_n", "h_top3", "h_vitt", "h_ult5_top3", "h_ult3_pos", "h_ult_top3",
    "h_giorni", "h_premi_365", "h_gare_365", "h_tempo_migl", "h_tempo_ult",
    "h_pista_top3", "h_pista_n", "eta", "maschio",
    "d_top3", "d_n",
    "partenza", "partenti", "partenza_rel",
    "r_ult5_top3", "r_premi_365", "r_top3", "r_tempo_migl", "r_d_top3",
    "s_ult5_top3", "s_premi_365", "s_tempo_migl",
    # dalla versione 3: la distanza della corsa (nota prima della partenza)
    "distanza", "dist_handicap", "dist_vs_solita", "h_fascia_top3", "h_fascia_n", "r_fascia_top3",
]
# Dalla versione 4 (ottobre 2026): l'allenatore e il livello delle corse.
#  - allenatore: quello dell'ultima corsa del cavallo (il calendario non lo
#    scrive), con il suo rendimento misurato sui giorni precedenti, in
#    carriera e negli ultimi 365 giorni;
#  - livello delle corse: quanto valeva la corsa, stimato dal premio di chi
#    ha vinto (ricavato dai premi dei primi cinque), in media sulle ultime
#    cinque corse del cavallo, e il livello piu' alto in cui e' arrivato nei tre.
VARIABILI_V4 = [
    "a_top3", "a_n", "a_top3_365", "r_a_top3",
    "h_classe5", "h_classe_top3", "r_classe5", "s_classe5",
]
VARIABILI = VARIABILI + VARIABILI_V4
# Provate e lasciate fuori (ottobre 2026), sulle stesse 102 mila partenze:
#  - ferratura delle corse passate (quanto spesso corre scalzo, e come va):
#    nessun miglioramento;
#  - ferratura di oggi: migliorerebbe un poco, ma la fonte la scrive solo il
#    giorno della corsa, dopo il lavoro notturno. Usarla vorrebbe dire
#    allenare il modello con un dato che al momento della stima non c'e'.

# Come si spiega ogni variabile a chi legge il calendario. Solo quelle che
# hanno senso in una frase; il verso dice se un valore alto e' un pregio.
SPIEGAZIONI = {
    "r_ult5_top3": ("forma recente", +1),
    "r_premi_365": ("premi dell'ultimo anno", +1),
    "r_top3": ("piazzamenti in carriera", +1),
    "r_tempo_migl": ("tempi", -1),   # tempo basso = meglio
    "r_d_top3": ("guidatore di oggi", +1),
    "partenza": ("numero di partenza", -1),        # numero basso = meglio
    "h_pista_top3": ("risultati su questa pista", +1),
    "h_giorni": ("giorni dall'ultima corsa", 0),
    "r_fascia_top3": ("risultati su questa distanza", +1),
}


# ─────────────────────────────────────────────────────────────────────────────
#  Costruzione delle variabili (uguale per allenamento e calendario)
# ─────────────────────────────────────────────────────────────────────────────

def _storico(conn: sqlite3.Connection):
    import pandas as pd
    df = pd.read_sql_query(
        """SELECT r.horse_name AS cavallo, r.race_date AS data, r.track AS pista,
                  r.race_number AS numero, r.driver AS guidatore,
                  r.placement AS arrivo, r.time_km AS tempo, r.start_pos AS partenza,
                  r.total_starters AS partenti, r.prize_net AS premio, r.race_code AS codice,
                  r.distance AS distanza, NULLIF(r.shoes, '') AS ferri,
                  NULLIF(r.trainer, '') AS allenatore_corsa
             FROM races r
            WHERE r.race_date IS NOT NULL AND r.race_date >= '2013-01-01'
              -- non partiti: non hanno corso, quindi non sono una partenza
              AND COALESCE(LOWER(r.placement_raw), '') NOT IN ('nr', 'n.p.')""", conn)
    # Quale corsa: dal 2026 la fonte non scrive piu' il numero della corsa ma
    # un codice (2026-09-27_BO_R3). Senza questo, tutte le corse di un giorno
    # sulla stessa pista finivano in un'unica "corsa" da 45 cavalli.
    num = df["numero"].astype("Int64").astype(str)
    df["numero"] = num.where(df["numero"].notna(), df["codice"].astype(str))
    df = df.drop(columns=["codice"])
    df["gara"] = df["data"].astype(str) + "|" + df["pista"].fillna("").astype(str) + "|" + df["numero"].astype(str)
    df["futura"] = False
    return df


# Il calendario scrive le piste con una sigla (BO), l'archivio delle corse col
# nome intero (BOLOGNA). Senza questa tabella le variabili "su questa pista"
# restavano vuote per ogni cavallo in calendario, e la verifica non trovava
# l'arrivo. Le sigle sono quelle del lavoro notturno (_TRACK_CODES).
PISTE = {
    "BO": "BOLOGNA", "MI": "MILANO", "RM": "ROMA", "TO": "TORINO", "NA": "NAPOLI",
    "CE": "CESENA", "SR": "SIRACUSA", "TV": "TREVISO", "MT": "MONTECATINI",
    "CS": "CASARANO", "PA": "PALERMO", "PC": "PONTECAGNANO", "MO": "MODENA",
    "FI": "FIRENZE", "BA": "BARI", "VA": "VARESE", "GA": "GARIGLIANO", "PD": "PADOVA",
    "VI": "VILLANOVA", "CT": "CASTELLUCCIO", "AN": "ANCONA", "TS": "TRIESTE",
    "FR": "FROSINONE", "SS": "SAN SEVERO", "RO": "ROMA",
    "MG": "MONTEGIORGIO", "AV": "AVERSA", "TA": "TARANTO", "FO": "FOLLONICA",
    "CV": "CIVITANOVA", "FE": "FERRARA",
    "MON": "MONTEGIORGIO",  # sigla sbagliata del 12/10/2026 (prime tre lettere)
}


def _calendario(conn: sqlite3.Connection):
    import pandas as pd
    colonne = {r[1] for r in conn.execute("PRAGMA table_info(upcoming_races)")}
    # La ferratura e' dichiarata di solito solo il giorno della corsa: se non
    # c'e' resta vuota, mai presa dall'ultima corsa.
    ferri = "NULLIF(shoes, '')" if "shoes" in colonne else "NULL"
    up = pd.read_sql_query(
        f"""SELECT horse_name AS cavallo, race_date AS data, track AS pista,
                  race_time AS ora, start_pos AS partenza, NULLIF(driver, '') AS guidatore,
                  distance AS distanza, {ferri} AS ferri
             FROM upcoming_races WHERE race_date >= date('now')""", conn)
    if up.empty:
        return up
    # Solo gare non ancora corse: per una gara di ieri l'arrivo potrebbe gia'
    # essere nell'archivio, e la stima lo vedrebbe.
    up["gara"] = up["data"] + "|" + up["pista"].fillna("") + "|" + up["ora"].astype(str)
    up["pista"] = up["pista"].map(lambda c: PISTE.get(str(c).upper(), c))
    # Nel calendario l'elenco dei partenti e' completo: il loro numero e' il campo.
    up["partenti"] = up.groupby("gara")["cavallo"].transform("count")
    up["numero"] = up["ora"]
    # Il guidatore e' quello dichiarato per questa corsa; se la fonte non lo
    # scrive resta vuoto (il modello lo tratta come dato mancante), mai quello
    # dell'ultima corsa.
    up["arrivo"] = None
    up["tempo"] = None
    up["premio"] = 0.0
    up["futura"] = True
    return up



def _media_passata(df, chiavi, col):
    """Media di `col` sulle righe precedenti dello stesso gruppo (esclusa la riga)."""
    prev = df.groupby(chiavi, sort=False)[col].shift()
    k = [df[c] for c in ([chiavi] if isinstance(chiavi, str) else chiavi)]
    somma = prev.fillna(0).groupby(k, sort=False).cumsum()
    quante = prev.notna().astype(float).groupby(k, sort=False).cumsum()
    return (somma / quante).where(quante > 0)


def _mobile_passata(df, chiave, col, n, come="mean"):
    prev = df.groupby(chiave, sort=False)[col].shift()
    r = prev.groupby(df[chiave], sort=False).rolling(n, min_periods=1)
    r = r.mean() if come == "mean" else r.min()
    return r.reset_index(level=0, drop=True).sort_index()


def _minimo_passato(df, chiave, col):
    prev = df.groupby(chiave, sort=False)[col].shift()
    return prev.groupby(df[chiave], sort=False).cummin()


def costruisci_variabili(conn: sqlite3.Connection, con_calendario: bool = False):
    """Una riga per partenza, con le variabili calcolate solo dal passato."""
    import numpy as np
    import pandas as pd

    df = _storico(conn)
    if con_calendario:
        up = _calendario(conn)
        if not up.empty:
            df = pd.concat([df, up[df.columns.intersection(up.columns)]], ignore_index=True)

    df["data"] = pd.to_datetime(df["data"], errors="coerce")
    df = df[df["data"].notna()].copy()
    for c in ("arrivo", "tempo", "partenza", "partenti", "premio"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    # Il campo noto: dove la fonte non lo scrive, almeno quanti ne conosciamo.
    df.loc[(df["partenti"] < 2) | (df["partenti"] > 24), "partenti"] = np.nan
    df["_campo_noto"] = df["partenti"].notna()
    df.loc[(df["partenza"] < 1) | (df["partenza"] > 24), "partenza"] = np.nan
    conosciuti = df.groupby("gara")["cavallo"].transform("count")
    df["partenti"] = df["partenti"].fillna(conosciuti)
    df["premio"] = df["premio"].fillna(0.0)
    # Tempo al km: fuori scala = dato rotto (la fonte a volte scrive 0 o 99).
    df.loc[(df["tempo"] < 9) | (df["tempo"] > 40), "tempo"] = np.nan

    # Esito: solo per le gare gia' corse. Ritirati, squalificati e non
    # piazzati contano come "non nei primi tre".
    corsa = ~df["futura"].astype(bool)
    df["top3"] = np.where(corsa, ((df["arrivo"] >= 1) & (df["arrivo"] <= 3)).astype(float), np.nan)
    df["vitt"] = np.where(corsa, (df["arrivo"] == 1).astype(float), np.nan)
    pos = (df["arrivo"] / df["partenti"]).clip(upper=1.0)
    df["pos_rel"] = np.where(corsa, pos.fillna(1.0), np.nan)

    df = df.sort_values(["cavallo", "data", "gara"]).reset_index(drop=True)
    g = df.groupby("cavallo", sort=False)

    # Cavallo: tutto spostato di una corsa, cosi' la riga vede solo il passato.
    df["h_n"] = g.cumcount().astype(float)
    # Quante delle corse passate sono all'estero. Non entra nel modello: serve
    # a dire a chi legge che la stima poggia su corse con avversari diversi.
    _est = (df["pista"] == "ESTERO").astype(float)
    df["h_n_estero"] = _est.groupby(df["cavallo"], sort=False).cumsum() - _est
    df["h_ult_estero"] = _est.groupby(df["cavallo"], sort=False).shift()
    df["h_top3"] = _media_passata(df, "cavallo", "top3")
    df["h_vitt"] = _media_passata(df, "cavallo", "vitt")
    df["h_ult5_top3"] = _mobile_passata(df, "cavallo", "top3", 5)
    df["h_ult3_pos"] = _mobile_passata(df, "cavallo", "pos_rel", 3)
    df["h_ult_top3"] = g["top3"].shift()
    df["h_giorni"] = (df["data"] - g["data"].shift()).dt.days.astype(float)
    df["h_tempo_migl"] = _minimo_passato(df, "cavallo", "tempo")
    df["h_tempo_ult"] = g["tempo"].shift().groupby(df["cavallo"], sort=False).ffill()

    # Ultimi 365 giorni: premi e numero di corse, escludendo la data stessa.
    tmp = df[["cavallo", "data", "premio"]].copy()
    tmp["uno"] = 1.0
    tmp = tmp.set_index("data")
    r365 = (tmp.groupby("cavallo", sort=False)[["premio", "uno"]]
               .rolling("365D", closed="left").sum())
    df["h_premi_365"] = r365["premio"].to_numpy()
    df["h_gare_365"] = r365["uno"].to_numpy()
    gia = df["h_n"] > 0  # ha gia' corso, ma non nell'ultimo anno: zero, non "ignoto"
    df.loc[gia & df["h_premi_365"].isna(), ["h_premi_365", "h_gare_365"]] = 0.0

    # Sulla stessa pista.
    gp = df.groupby(["cavallo", "pista"], sort=False)
    df["h_pista_n"] = gp.cumcount().astype(float)
    df["h_pista_top3"] = _media_passata(df, ["cavallo", "pista"], "top3")

    # Guidatore: quello di QUESTA corsa (dichiarato prima della partenza), con
    # il suo rendimento misurato sulle corse dei giorni precedenti. Nella
    # versione 1 si usava il guidatore dell'ultima corsa del cavallo, perche'
    # il calendario non lo leggeva: spesso non era lo stesso, e la stima lo
    # faceva credere. Le corse dello stesso giorno restano fuori: la sera
    # prima i loro arrivi non si conoscono.
    dd = df[df["guidatore"].notna()]
    gior = (dd.groupby(["guidatore", "data"], sort=True)["top3"]
              .agg(s="sum", n="count"))
    cs = gior.groupby(level=0)["s"].cumsum() - gior["s"]
    cn = gior.groupby(level=0)["n"].cumsum() - gior["n"]
    prima = pd.DataFrame({"_cs": cs, "_cn": cn}).reset_index()
    df = df.merge(prima, on=["guidatore", "data"], how="left")
    df["d_n"] = df["_cn"].astype(float)
    df["d_top3"] = (df["_cs"] / df["_cn"]).where(df["_cn"] > 0)
    df = df.drop(columns=["_cs", "_cn"])

    # Allenatore (dalla versione 4). Il calendario non lo scrive: si usa
    # quello dell'ultima corsa del cavallo, sia per allenare sia per stimare,
    # cosi' il modello impara con lo stesso dato che avra' la sera prima.
    if "allenatore_corsa" not in df.columns:
        df["allenatore_corsa"] = np.nan
    df["allenatore"] = (df.groupby("cavallo", sort=False)["allenatore_corsa"].shift()
                          .groupby(df["cavallo"], sort=False).ffill())
    da = df[df["allenatore_corsa"].notna() & df["top3"].notna()]
    giorni_a = (da.groupby(["allenatore_corsa", "data"], sort=True)["top3"]
                  .agg(s="sum", n="count").reset_index())
    giorni_a["cs"] = giorni_a.groupby("allenatore_corsa")["s"].cumsum()
    giorni_a["cn"] = giorni_a.groupby("allenatore_corsa")["n"].cumsum()
    r365a = (giorni_a.set_index("data").groupby("allenatore_corsa")[["s", "n"]]
                     .rolling("365D").sum().reset_index())
    giorni_a["s365"] = r365a["s"].to_numpy()
    giorni_a["n365"] = r365a["n"].to_numpy()
    giorni_a = giorni_a.rename(columns={"allenatore_corsa": "allenatore"})
    giorni_a["ultimo_giorno"] = giorni_a["data"]
    giorni_a = giorni_a.sort_values("data")
    sx = df[["allenatore", "data"]].reset_index().dropna(subset=["allenatore"]).sort_values("data")
    # Solo i giorni PRIMA della corsa: le corse dello stesso giorno restano fuori.
    m = pd.merge_asof(sx, giorni_a[["allenatore", "data", "cs", "cn", "s365", "n365", "ultimo_giorno"]],
                      on="data", by="allenatore", allow_exact_matches=False, direction="backward")
    m = m.set_index("index").reindex(df.index)
    df["a_n"] = m["cn"].astype(float)
    df["a_top3"] = (m["cs"] / m["cn"]).where(m["cn"] > 0)
    # Il conto dei 365 giorni vale solo se l'allenatore ha corso di recente.
    recente = (df["data"] - m["ultimo_giorno"]).dt.days <= 60
    df["a_top3_365"] = (m["s365"] / m["n365"]).where((m["n365"] >= 5) & recente)

    # Livello della corsa (dalla versione 4): il premio di chi ha vinto,
    # ricavato dal premio di ognuno dei primi cinque con la quota che spetta
    # al suo posto. Una corsa da 3.000 euro al vincitore e una da 30.000 non
    # sono la stessa cosa, anche se il cavallo arriva terzo in entrambe.
    quote_posto = {1: 1.0, 2: 0.475, 3: 0.259, 4: 0.13, 5: 0.087}
    qp = df["arrivo"].map(quote_posto)
    stima_v = (df["premio"] / qp).where((df["premio"] > 0) & qp.notna())
    liv = np.log1p(stima_v.groupby(df["gara"]).transform("median"))
    df["_livello"] = liv.where(~df["futura"].astype(bool))
    df["h_classe5"] = _mobile_passata(df, "cavallo", "_livello", 5)
    df["_liv_top3"] = df["_livello"].where(df["top3"] == 1)
    prev_lt = df.groupby("cavallo", sort=False)["_liv_top3"].shift()
    df["h_classe_top3"] = prev_lt.groupby(df["cavallo"], sort=False).cummax()
    df = df.drop(columns=["_liv_top3"])

    # Distanza: in Italia nelle corse a handicap chi ha vinto di piu' parte
    # dietro, con 20 o 40 metri in piu'. La distanza del cavallo e' nota
    # prima della corsa (e' nel calendario), quindi si puo' usare.
    df["distanza"] = pd.to_numeric(df["distanza"], errors="coerce")
    df.loc[(df["distanza"] < 1000) | (df["distanza"] > 3700), "distanza"] = np.nan
    df["dist_handicap"] = df["distanza"] - df.groupby("gara")["distanza"].transform("min")
    gd = df.groupby("cavallo", sort=False)["distanza"]
    prev_d = gd.shift()
    somma_d = prev_d.fillna(0).groupby(df["cavallo"], sort=False).cumsum()
    quante_d = prev_d.notna().astype(float).groupby(df["cavallo"], sort=False).cumsum()
    df["h_dist_media"] = (somma_d / quante_d).where(quante_d > 0)
    df["dist_vs_solita"] = df["distanza"] - df["h_dist_media"]
    # Fascia di distanza: miglio (fino a 1.799 m), media, lunga (da 2.200 m).
    df["_fascia"] = pd.cut(df["distanza"], [0, 1799, 2199, 9999], labels=["corta", "media", "lunga"]).astype(str)
    df["h_fascia_n"] = df.groupby(["cavallo", "_fascia"], sort=False).cumcount().astype(float)
    df["h_fascia_top3"] = _media_passata(df, ["cavallo", "_fascia"], "top3")
    df.loc[df["distanza"].isna(), ["h_fascia_n", "h_fascia_top3"]] = np.nan

    # Ferratura. F = ferrato, A = senza ferri davanti, P = dietro, AP = scalzo.
    # Quella di OGGI vale solo se la fonte l'ha gia' dichiarata: altrimenti
    # resta vuota (mai quella dell'ultima corsa).
    f = df["ferri"].astype("string").str.upper().str.strip()
    nota = f.isin(["F", "A", "P", "AP"])
    df["oggi_scalzo_ant"] = np.where(nota, f.isin(["A", "AP"]).astype(float), np.nan)
    df["oggi_scalzo_post"] = np.where(nota, f.isin(["P", "AP"]).astype(float), np.nan)
    # Dal passato: quanto spesso corre senza ferri, e come va cosi'.
    df["_scalzo"] = np.where(nota & ~df["futura"].astype(bool), f.isin(["A", "AP"]).astype(float), np.nan)
    df["h_scalzo_quota"] = _media_passata(df, "cavallo", "_scalzo")
    df["_top3_scalzo"] = df["top3"].where(df["_scalzo"] == 1)
    df["_top3_ferrato"] = df["top3"].where(df["_scalzo"] == 0)
    df["h_top3_scalzo"] = _media_passata(df, "cavallo", "_top3_scalzo")
    df["h_top3_ferrato"] = _media_passata(df, "cavallo", "_top3_ferrato")
    ult_f = f.where(nota & ~df["futura"].astype(bool)).groupby(df["cavallo"], sort=False).shift()
    ult_f = ult_f.groupby(df["cavallo"], sort=False).ffill()
    df["cambio_ferri"] = np.where(nota & ult_f.notna(), (f != ult_f).astype(float), np.nan)
    # Il cavallo toglie i ferri davanti oggi ma di solito corre ferrato.
    df["toglie_ferri"] = np.where(nota & ult_f.notna(),
                                  (f.isin(["A", "AP"]) & ~ult_f.isin(["A", "AP"])).astype(float), np.nan)
    df = df.drop(columns=["_fascia", "_scalzo", "_top3_scalzo", "_top3_ferrato"])

    # Eta' e sesso dall'anagrafica.
    import pandas as pd  # noqa: F811
    an = pd.read_sql_query("SELECT name AS cavallo, birth_year, sex FROM horses", conn)
    an = an.drop_duplicates("cavallo")
    df = df.merge(an, on="cavallo", how="left")
    df["eta"] = (df["data"].dt.year - pd.to_numeric(df["birth_year"], errors="coerce")).astype(float)
    df.loc[(df["eta"] < 2) | (df["eta"] > 16), "eta"] = np.nan
    df["maschio"] = df["sex"].map(lambda s: 1.0 if str(s).upper().startswith(("M", "C", "S")) else (0.0 if isinstance(s, str) and s else np.nan))

    # Gara.
    df["partenza_rel"] = df["partenza"] / df["partenti"]

    # Confronto con gli avversari della stessa corsa: posizione in classifica
    # (0 = il peggiore, 1 = il migliore) e scarto dalla media della corsa.
    gg = df.groupby("gara", sort=False)
    for sorg, dest, verso in (("h_ult5_top3", "r_ult5_top3", True), ("h_premi_365", "r_premi_365", True),
                              ("h_top3", "r_top3", True), ("h_tempo_migl", "r_tempo_migl", False),
                              ("d_top3", "r_d_top3", True), ("h_fascia_top3", "r_fascia_top3", True),
                              ("a_top3", "r_a_top3", True), ("h_classe5", "r_classe5", True)):
        df[dest] = gg[sorg].rank(pct=True, ascending=verso)
    for sorg, dest in (("h_ult5_top3", "s_ult5_top3"), ("h_premi_365", "s_premi_365"),
                       ("h_tempo_migl", "s_tempo_migl"), ("h_classe5", "s_classe5")):
        df[dest] = df[sorg] - gg[sorg].transform("mean")

    return df


# ─────────────────────────────────────────────────────────────────────────────
#  Lettura del modello senza XGBoost
# ─────────────────────────────────────────────────────────────────────────────

class Alberi:
    """Percorre gli alberi salvati da XGBoost (formato JSON) con numpy."""

    def __init__(self, percorso: Path):
        m = json.loads(Path(percorso).read_text())
        lm = m["learner"]
        bs = lm["learner_model_param"]["base_score"].strip("[]")
        base = float(bs)
        # Il punto di partenza dipende dal tipo di modello: probabilita' (sì/no)
        # oppure importo in euro (tweedie, che lavora sul logaritmo).
        self.obiettivo = lm.get("objective", {}).get("name", "binary:logistic")
        if self.obiettivo.startswith("reg:tweedie"):
            self.margine0 = math.log(base)
        elif self.obiettivo in ("reg:quantileerror", "reg:squarederror", "reg:absoluteerror"):
            # Modelli che stimano direttamente un numero (es. il voto previsto):
            # il punto di partenza e' il numero stesso.
            self.margine0 = base
        else:
            self.margine0 = math.log(base / (1 - base))
        self.alberi = []
        self._medie = []
        for t in lm["gradient_booster"]["model"]["trees"]:
            self._medie.append(self._valori_medi(t))
            self.alberi.append((
                __import__("numpy").array(t["left_children"]),
                __import__("numpy").array(t["right_children"]),
                __import__("numpy").array(t["split_indices"]),
                __import__("numpy").array(t["split_conditions"], dtype="float32"),
                __import__("numpy").array(t["default_left"], dtype=bool),
            ))
        self.variabili = lm.get("feature_names") or VARIABILI

    @staticmethod
    def _valori_medi(t):
        """Valore medio di ogni nodo (pesato sul numero di cavalli che ci
        passavano in allenamento): serve per dire quanto sposta la stima
        ogni domanda dell'albero."""
        import numpy as np
        sx = t["left_children"]; dx = t["right_children"]
        val = list(t["split_conditions"]); peso = t["sum_hessian"]
        medie = [0.0] * len(sx)

        def giu(i):
            if sx[i] == -1:
                medie[i] = float(val[i])
                return medie[i]
            a, b = giu(sx[i]), giu(dx[i])
            pa, pb = peso[sx[i]], peso[dx[i]]
            medie[i] = (a * pa + b * pb) / (pa + pb) if (pa + pb) > 0 else (a + b) / 2
            return medie[i]
        giu(0)
        return np.array(medie, dtype="float64")

    def contributi(self, X):
        """Quanto ogni variabile sposta la stima (sul logaritmo delle quote)
        per ogni cavallo: la somma dei contributi piu' il punto di partenza
        e' la stima. E' il metodo di Saabas, lo stesso che XGBoost chiama
        approx_contribs."""
        import numpy as np
        X = np.asarray(X, dtype="float32")
        n, k = X.shape
        out = np.zeros((n, k), dtype="float64")
        base = np.full(n, self.margine0, dtype="float64")
        righe = np.arange(n)
        for (sx, dx, idx, cond, dl), med in zip(self.alberi, self._medie):
            nodo = np.zeros(n, dtype=np.int64)
            base += med[0]
            while True:
                foglia = sx[nodo] == -1
                if foglia.all():
                    break
                att = righe[~foglia]
                nd = nodo[att]
                v = X[att, idx[nd]]
                manca = np.isnan(v)
                va_sx = np.where(manca, dl[nd], v < cond[nd])
                nuovo = np.where(va_sx, sx[nd], dx[nd])
                np.add.at(out, (att, idx[nd]), med[nuovo] - med[nd])
                nodo[att] = nuovo
        return out, base

    def margine(self, X):
        import numpy as np
        X = np.asarray(X, dtype="float32")
        n = X.shape[0]
        tot = np.full(n, self.margine0, dtype="float64")
        righe = np.arange(n)
        for sx, dx, idx, cond, dl in self.alberi:
            nodo = np.zeros(n, dtype=np.int64)
            while True:
                foglia = sx[nodo] == -1
                if foglia.all():
                    break
                att = ~foglia
                v = X[righe[att], idx[nodo[att]]]
                manca = np.isnan(v)
                va_sx = np.where(manca, dl[nodo[att]], v < cond[nodo[att]])
                nodo[att] = np.where(va_sx, sx[nodo[att]], dx[nodo[att]])
            tot += cond[nodo]
        return tot

    def probabilita(self, X):
        import numpy as np
        return 1.0 / (1.0 + np.exp(-self.margine(X)))

    def importo(self, X):
        import numpy as np
        return np.exp(self.margine(X))


def normalizza_per_gara(prob, gare, campo, temperatura: float = 1.0):
    """Nella stessa corsa i posti nei primi tre sono tre (o meno, se i
    partenti sono meno di tre): le probabilita' devono sommare a quello.
    Si lavora sulle quote, cosi' nessuna supera il 100%.

    `temperatura` (dalla versione 4) ammorbidisce le stime: sotto 1 avvicina
    fra loro i cavalli della stessa corsa. Si misura sul 2024, mai sugli anni
    di prova: la versione 3 diceva 79% dove arrivavano nei tre il 71%."""
    import numpy as np
    import pandas as pd
    p = np.clip(np.asarray(prob, dtype=float), 1e-4, 1 - 1e-4)
    out = p.copy()
    df = pd.DataFrame({"g": gare, "p": p, "k": np.minimum(3, campo)})
    for _, idx in df.groupby("g").indices.items():
        q = p[idx]
        k = float(df["k"].iloc[idx[0]])
        if len(q) <= k:
            out[idx] = 1.0
            continue
        lo, hi = -20.0, 20.0
        lq = temperatura * np.log(q / (1 - q))
        for _ in range(60):  # cerca lo spostamento che porta la somma a k
            mid = (lo + hi) / 2
            s = (1 / (1 + np.exp(-(lq + mid)))).sum()
            lo, hi = (mid, hi) if s < k else (lo, mid)
        out[idx] = 1 / (1 + np.exp(-(lq + (lo + hi) / 2)))
    return out


# ─────────────────────────────────────────────────────────────────────────────
#  Allenamento e verifica (a mano)
# ─────────────────────────────────────────────────────────────────────────────

def _misure(y, p, gare):
    import numpy as np
    import pandas as pd
    from sklearn.metrics import roc_auc_score, log_loss, brier_score_loss
    p = np.clip(p, 1e-4, 1 - 1e-4)
    d = pd.DataFrame({"y": y, "p": p, "g": gare})
    # I tre con la stima piu' alta in ogni corsa: quanti arrivano davvero nei primi tre?
    d["rk"] = d.groupby("g")["p"].rank(ascending=False, method="first")
    scelti = d[d["rk"] <= 3]
    return {
        "auc": round(float(roc_auc_score(y, p)), 4),
        "log_loss": round(float(log_loss(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "tre_scelti_a_segno": round(float(scelti["y"].mean()), 4),
    }


def campo_pieno(d):
    """Corse di cui l'archivio conosce TUTTI i partenti, decise per corsa e non
    per riga. Fino alla versione 3 il controllo era fatto riga per riga: in
    una corsa con il numero di partenti scritto in modo diverso per un solo
    cavallo (10 invece di 11), quel cavallo da solo passava il controllo, la
    normalizzazione lo trovava unico nella "sua" corsa e gli dava il 100%.
    Era questa, e non il modello, la causa dell'ottimismo sopra il 70%
    (79% stimato, 71% reale): con il controllo per corsa la fascia piu' alta
    da' 76% stimato e 78% reale."""
    g = d.groupby("gara")
    return ((g["cavallo"].transform("count") >= g["partenti"].transform("max"))
            & g["_campo_noto"].transform("min").astype(bool)).to_numpy()


def prepara_allenamento(conn):
    print("costruisco le variabili...", flush=True)
    df = costruisci_variabili(conn)
    return df[df["top3"].notna() & (df["data"] >= "2015-01-01")].copy()


def _temperatura(p, y, gare, campo):
    """La temperatura che rende piu' credibili le stime normalizzate, cercata
    su una griglia (si misura con il log loss: punisce chi e' sicuro e sbaglia)."""
    import numpy as np
    from sklearn.metrics import log_loss
    migliore, t_migl = None, 1.0
    for t in np.arange(0.70, 1.31, 0.05):
        pn = normalizza_per_gara(p, gare, campo, float(t))
        ll = log_loss(y, np.clip(pn, 1e-4, 1 - 1e-4))
        if migliore is None or ll < migliore:
            migliore, t_migl = ll, float(round(t, 2))
    return t_migl


def allena(conn=None, df=None, variabili=None, salva=True):
    """Allena, verifica e (se `salva`) scrive il modello. Con `variabili`
    diverse si prova una variante senza toccare il modello in uso."""
    import numpy as np
    import pandas as pd
    import xgboost as xgb

    VARIABILI_USO = list(variabili or VARIABILI)
    if conn is None:
        conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    if df is None:
        df = prepara_allenamento(conn)
    print(f"partenze utilizzabili: {len(df):,}", flush=True)

    tr = df[df["data"] < "2024-01-01"]
    va = df[(df["data"] >= "2024-01-01") & (df["data"] < "2025-01-01")]
    te = df[df["data"] >= "2025-01-01"]
    X = lambda d: d[VARIABILI_USO].to_numpy(dtype="float32")
    dtr = xgb.DMatrix(X(tr), label=tr["top3"], feature_names=VARIABILI_USO)
    dva = xgb.DMatrix(X(va), label=va["top3"], feature_names=VARIABILI_USO)
    par = dict(objective="binary:logistic", eval_metric="logloss", eta=0.05, max_depth=6,
               min_child_weight=50, subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
               tree_method="hist", nthread=2, seed=7)
    bst = xgb.train(par, dtr, 2000, evals=[(dva, "verifica")], early_stopping_rounds=60, verbose_eval=100)
    n_alberi = bst.best_iteration + 1
    print("alberi:", n_alberi, flush=True)
    # Taratura: si misura sul 2024 con il modello che il 2024 non l'ha visto,
    # nelle corse con il campo completo (le sole dove si normalizza).
    pieno_va = campo_pieno(va)
    p_va = bst.predict(xgb.DMatrix(X(va), feature_names=VARIABILI_USO), iteration_range=(0, n_alberi))
    temperatura = _temperatura(p_va[pieno_va], va["top3"].to_numpy()[pieno_va],
                               va["gara"].to_numpy()[pieno_va], va["partenti"].to_numpy()[pieno_va])
    print("temperatura:", temperatura, flush=True)
    # Riallena su allenamento + 2024 con lo stesso numero di alberi; il 2025-26 resta mai visto.
    trva = pd.concat([tr, va])
    bst = xgb.train(par, xgb.DMatrix(X(trva), label=trva["top3"], feature_names=VARIABILI_USO), n_alberi)
    # Il modello in uso, sulle stesse partenze: per dire se il nuovo e' meglio.
    precedente = None
    if FILE_MODELLO.exists() and FILE_VERIFICA.exists():
        try:
            vecchio = Alberi(FILE_MODELLO)
            pv = vecchio.probabilita(te[list(vecchio.variabili)].to_numpy(dtype="float32"))
            precedente = {"nome": json.loads(FILE_VERIFICA.read_text()).get("nome"),
                          **_misure(te["top3"].to_numpy(), pv, te["gara"].to_numpy())}
        except Exception as e:  # noqa: BLE001
            print("modello precedente non confrontabile:", e, flush=True)
    CARTELLA.mkdir(exist_ok=True)
    percorso = FILE_MODELLO if salva else Path("/tmp") / "top3_prova.json"
    bst.save_model(str(percorso))

    # Il lettore senza XGBoost deve dare gli stessi numeri.
    lettore = Alberi(percorso)
    p_xgb = bst.predict(xgb.DMatrix(X(te), feature_names=VARIABILI_USO))
    p_mio = lettore.probabilita(X(te))
    scarto = float(np.max(np.abs(p_xgb - p_mio)))
    print("scarto massimo fra XGBoost e il lettore:", scarto, flush=True)
    assert scarto < 1e-4, "il lettore degli alberi non coincide con XGBoost"
    # Anche i contributi di ogni variabile (le ragioni mostrate nel calendario).
    campione = te.sample(min(2000, len(te)), random_state=1)
    c_xgb = bst.predict(xgb.DMatrix(X(campione), feature_names=VARIABILI_USO), pred_contribs=True, approx_contribs=True)
    c_mio, b_mio = lettore.contributi(X(campione))
    scarto_c = float(max(np.max(np.abs(c_xgb[:, :-1] - c_mio)), np.max(np.abs(c_xgb[:, -1] - b_mio))))
    print("scarto massimo sui contributi:", scarto_c, flush=True)
    assert scarto_c < 1e-3, "i contributi del lettore non coincidono con XGBoost"

    y = te["top3"].to_numpy()
    gare = te["gara"].to_numpy()

    # Metodi semplici da battere.
    # 1) solo il numero di partenza (con il numero di partenti), misurato sul passato.
    base = trva.assign(pz=trva["partenza"].fillna(-1), cp=trva["partenti"].clip(upper=16).fillna(-1))
    tab = base.groupby(["pz", "cp"])["top3"].mean()
    k = te.assign(pz=te["partenza"].fillna(-1), cp=te["partenti"].clip(upper=16).fillna(-1))
    p_partenza = k.set_index(["pz", "cp"]).index.map(tab).to_numpy(dtype=float)
    p_partenza = np.where(np.isnan(p_partenza), trva["top3"].mean(), p_partenza)
    # 2) solo la forma: piazzamenti nelle ultime 5 corse (attenuata verso la media).
    m0 = trva["top3"].mean()
    n5 = te["h_n"].clip(upper=5).fillna(0)
    p_forma = ((te["h_ult5_top3"].fillna(m0) * n5 + m0 * 2) / (n5 + 2)).to_numpy()
    # 3) il metodo che il calendario usa oggi: il voto attuale del cavallo.
    #    Attenzione: e' avvantaggiato, perche' il voto di oggi conosce anche le
    #    corse del 2025-26 su cui lo stiamo provando.
    voti = pd.read_sql_query("SELECT name AS cavallo, score FROM horse_ratings WHERE rating_mode='performance'", conn)
    mappa = voti.drop_duplicates("cavallo").set_index("cavallo")["score"]
    sc = pd.to_numeric(te["cavallo"].map(mappa), errors="coerce").to_numpy(dtype=float)
    sc = np.where(np.isfinite(sc), sc, np.nanmedian(sc))
    e = np.exp(np.clip(sc, -100, 100) / 20)
    somma = pd.Series(e).groupby(pd.Series(gare), dropna=False).transform("sum").to_numpy()
    p_voto = np.clip(3 * e / somma, 1e-4, 0.99)

    ris = {
        "modello": _misure(y, p_mio, gare),
        "solo_partenza": _misure(y, p_partenza, gare),
        "solo_forma": _misure(y, p_forma, gare),
        "voto_attuale": _misure(y, p_voto, gare),
    }

    # Corse con il campo completo (tutti i partenti nell'archivio): li' si
    # puo' provare anche la versione normalizzata, che e' quella del calendario.
    # Solo dove la fonte dice quanti erano i partenti: se il numero manca,
    # quelli che conosciamo sembrerebbero "tutti" anche quando non lo sono.
    pieno = campo_pieno(te)
    p_norm1 = normalizza_per_gara(p_mio[pieno], gare[pieno], te["partenti"].to_numpy()[pieno])
    p_norm = normalizza_per_gara(p_mio[pieno], gare[pieno], te["partenti"].to_numpy()[pieno], temperatura)
    ris["campo_completo"] = {
        "corse": int(pd.Series(gare[pieno]).nunique()),
        "modello": _misure(y[pieno], p_mio[pieno], gare[pieno]),
        "modello_normalizzato": _misure(y[pieno], p_norm, gare[pieno]),
        "modello_normalizzato_senza_taratura": _misure(y[pieno], p_norm1, gare[pieno]),
        "solo_partenza": _misure(y[pieno], p_partenza[pieno], gare[pieno]),
        "voto_attuale": _misure(y[pieno], p_voto[pieno], gare[pieno]),
    }

    # Le percentuali sono credibili? Per fasce di stima, quanti arrivano davvero.
    def _fasce(pp):
        fasce = []
        edges = [0, .1, .2, .3, .4, .5, .6, .7, 1.01]
        for a, b in zip(edges[:-1], edges[1:]):
            sel = (pp >= a) & (pp < b)
            if sel.sum() >= 50:
                fasce.append({"da": a, "a": min(b, 1), "n": int(sel.sum()),
                              "stimato": round(float(pp[sel].mean()), 3),
                              "reale": round(float(y[pieno][sel].mean()), 3)})
        return fasce
    ris["fasce"] = _fasce(p_norm)
    ris["fasce_senza_taratura"] = _fasce(p_norm1)
    ris["temperatura"] = temperatura

    imp = bst.get_score(importance_type="gain")
    tot = sum(imp.values()) or 1
    ris["peso_variabili"] = sorted(({"variabile": k, "peso": round(v / tot, 4)} for k, v in imp.items()),
                                   key=lambda r: -r["peso"])

    mod, sp, vo = ris["modello"], ris["solo_partenza"], ris["voto_attuale"]
    supera = (mod["log_loss"] < sp["log_loss"] and mod["auc"] > max(sp["auc"], vo["auc"], ris["solo_forma"]["auc"]))
    ris["supera_i_metodi_semplici"] = bool(supera)
    ris["periodo_prova"] = {"da": str(te["data"].min().date()), "a": str(te["data"].max().date()),
                            "partenze": int(len(te)), "corse": int(pd.Series(gare).nunique())}
    ris["periodo_allenamento"] = {"da": str(trva["data"].min().date()), "a": str(trva["data"].max().date()),
                                  "partenze": int(len(trva))}
    ris["alberi"] = int(n_alberi)
    ris["modello_precedente"] = precedente
    ris["nome"] = NOME_MODELLO
    ris["allenato_il"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ris["variabili"] = VARIABILI_USO
    if salva:
        FILE_VERIFICA.write_text(json.dumps(ris, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in ris.items() if k not in ("peso_variabili", "variabili")}, indent=2, ensure_ascii=False))
    return ris


# ─────────────────────────────────────────────────────────────────────────────
#  Fase notturna: stime per le gare in calendario
# ─────────────────────────────────────────────────────────────────────────────

# Le variabili raccolte in gruppi che si spiegano in una frase. Il testo dice
# cosa fa il gruppo per QUESTO cavallo rispetto agli avversari della corsa.
GRUPPI = {
    "forma": (["h_ult5_top3", "h_ult3_pos", "h_ult_top3", "r_ult5_top3", "s_ult5_top3"],
              "forma recente migliore degli avversari", "forma recente peggiore degli avversari"),
    "guidatore": (["d_top3", "d_n", "r_d_top3"],
                  "guidatore di oggi tra i piu' efficaci", "guidatore di oggi meno efficace degli altri"),
    "allenatore": (["a_top3", "a_n", "a_top3_365", "r_a_top3"],
                   "allenatore che piazza spesso i suoi cavalli", "allenatore con pochi piazzamenti"),
    "partenza": (["partenza", "partenza_rel", "partenti"],
                 "numero di partenza favorevole", "numero di partenza sfavorevole"),
    "premi": (["h_premi_365", "h_gare_365", "r_premi_365", "s_premi_365"],
              "ha vinto piu' degli altri nell'ultimo anno", "ha vinto meno degli altri nell'ultimo anno"),
    "tempi": (["h_tempo_migl", "h_tempo_ult", "r_tempo_migl", "s_tempo_migl"],
              "tempi migliori degli avversari", "tempi piu' lenti degli avversari"),
    "carriera": (["h_n", "h_top3", "h_vitt", "r_top3"],
                 "buoni piazzamenti in carriera", "pochi piazzamenti in carriera"),
    "livello": (["h_classe5", "h_classe_top3", "r_classe5", "s_classe5"],
                "abituato a corse di livello piu' alto", "viene da corse di livello piu' basso"),
    "pista": (["h_pista_top3", "h_pista_n"],
              "va bene su questa pista", "su questa pista finora ha reso poco"),
    "distanza": (["distanza", "dist_handicap", "dist_vs_solita", "h_fascia_top3", "h_fascia_n", "r_fascia_top3"],
                 "distanza adatta", "distanza meno adatta"),
    "riposo": (["h_giorni"], "giusto riposo dall'ultima corsa", "rientra dopo una lunga sosta"),
    "eta": (["eta", "maschio"], "eta' favorevole", "eta' sfavorevole"),
}
SOGLIA_MOTIVO = 0.08   # sotto questo spostamento (sul log delle quote) non si nomina


def _contributi_per_gruppo(lettore, X, gare, noti):
    """Per ogni gruppo, lo spostamento della stima del cavallo meno quello
    medio della sua corsa. Se nella corsa i cavalli noti sono meno di
    quattro, il confronto con gli avversari non vuol dire niente: si usa lo
    spostamento rispetto al cavallo medio dell'archivio."""
    import numpy as np
    import pandas as pd
    c, _ = lettore.contributi(X)
    pos = {v: i for i, v in enumerate(lettore.variabili)}
    out = {}
    for g, (vv, _, _) in GRUPPI.items():
        cols = [pos[v] for v in vv if v in pos]
        val = c[:, cols].sum(axis=1) if cols else np.zeros(len(X))
        media = pd.Series(val).groupby(pd.Series(gare)).transform("mean").to_numpy()
        out[g] = np.where(np.asarray(noti) >= 4, val - media, val)
    return out


def _motivi(riga, gruppi: dict | None = None) -> list[dict]:
    """Fino a tre ragioni in parole semplici: i gruppi di dati che spostano
    di piu' la stima di questo cavallo rispetto agli avversari (dalla
    versione 4 si leggono direttamente dal modello)."""
    out = []
    for g, v in (gruppi or {}).items():
        if not (v == v) or abs(v) < SOGLIA_MOTIVO:
            continue
        _, pro, contro = GRUPPI[g]
        testo = pro if v > 0 else contro
        if g == "partenza" and riga.get("partenza") == riga.get("partenza"):
            testo += f" (numero {int(riga['partenza'])})"
        if g == "riposo" and v < 0 and (riga.get("h_giorni") or 0) > 60:
            testo = f"fermo da {int(riga['h_giorni'])} giorni"
        if g == "distanza" and v < 0 and (riga.get("dist_handicap") or 0) > 0:
            testo = f"parte con {int(riga['dist_handicap'])} metri in piu'"
        out.append({"testo": testo, "pro": bool(v > 0), "forza": abs(float(v))})
    out.sort(key=lambda m: -m["forza"])
    out = [{"testo": m["testo"], "pro": m["pro"]} for m in out[:3]]
    # Cavalli che hanno corso quasi solo all'estero (Fragolino Rosso a Torino
    # 11/10: 16 corse, tutte fuori Italia). La stima usa quei risultati come
    # se fossero italiani, ma gli avversari erano altri e spesso il numero di
    # partenti non si conosce. Sul 2025-26 per questi cavalli la stima e'
    # risultata piuttosto bassa che alta (41,6% stimato, 47,2% reale su 267
    # partenze), quindi non la si taglia: la si segnala come prima voce.
    n = riga.get("h_n") or 0
    n_est = riga.get("h_n_estero") or 0
    if n >= 3 and n_est / n >= 0.7:
        quante = "tutte" if n_est == n else f"{int(n_est)} su {int(n)}"
        out.insert(0, {"testo": f"corse {quante} all'estero: avversari non confrontabili",
                       "pro": False})
    return out[:4]


def _temperatura_salvata() -> float:
    try:
        return float(json.loads(FILE_VERIFICA.read_text()).get("temperatura") or 1.0)
    except Exception:  # noqa: BLE001
        return 1.0


def _ripara_piste_storico(conn):
    """Stime salvate con la pista scritta in sigla (BO, CS, RO, MON...) invece
    che col nome dell'archivio: la verifica non trovava l'arrivo. Per ogni
    corsa si guarda dove hanno corso davvero quel giorno i suoi cavalli e si
    prende la pista della maggioranza. Cosi' si risolve anche CS, che nel
    calendario e' Casarano ma in altre tabelle era Castelluccio."""
    nomi = {r[0] for r in conn.execute("SELECT DISTINCT track FROM races WHERE race_date >= '2025-01-01'")}
    corse = conn.execute("""SELECT DISTINCT race_date, pista, corsa FROM pronostico_top3_storico""").fetchall()
    for data, pista, corsa in corse:
        if pista in nomi:
            continue
        voti = conn.execute("""
            SELECT r.track, COUNT(*) FROM pronostico_top3_storico s
            JOIN races r ON r.horse_name = s.horse_name AND r.race_date = s.race_date
            WHERE s.race_date = ? AND s.pista = ? AND s.corsa = ?
            GROUP BY r.track ORDER BY 2 DESC""", (data, pista, corsa)).fetchall()
        giusta = voti[0][0] if voti else PISTE.get(str(pista).upper())
        if not giusta or giusta == pista:
            continue
        # Una stima ricostruita non deve mai prendere il posto di quella del
        # giorno: se la corsa ha gia' stime del giorno sulla pista giusta, le
        # ricostruite (fatte con un'archivio parziale) si tolgono.
        conn.execute("""DELETE FROM pronostico_top3_storico
                        WHERE race_date = ? AND pista = ? AND corsa = ? AND tipo = 'ricostruito'
                          AND EXISTS (SELECT 1 FROM pronostico_top3_storico d
                                      WHERE d.race_date = ? AND d.pista = ? AND d.tipo = 'del_giorno')""",
                     (data, pista, corsa, data, giusta))
        conn.execute("""DELETE FROM pronostico_top3_storico
                        WHERE race_date = ? AND pista = ? AND corsa = ?
                          AND horse_name IN (SELECT horse_name FROM pronostico_top3_storico
                                             WHERE race_date = ? AND pista = ?)""",
                     (data, pista, corsa, data, giusta))
        conn.execute("""UPDATE OR IGNORE pronostico_top3_storico SET pista = ?
                        WHERE race_date = ? AND pista = ? AND corsa = ?""", (giusta, data, pista, corsa))
    conn.commit()


def _crea_storico(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS pronostico_top3_storico (
        pista TEXT, race_date TEXT, corsa TEXT, horse_name TEXT,
        prob REAL, prob_grezza REAL, affidabile INTEGER, n_corse INTEGER,
        campo_completo INTEGER, tipo TEXT, modello TEXT, calcolato_il TEXT,
        PRIMARY KEY (race_date, pista, horse_name))""")


GIORNI_RICOSTRUITI = 30


def _ricostruisci(conn, df, lettore, ora) -> int:
    """Stime per le gare gia' corse degli ultimi 30 giorni che non hanno una
    stima del giorno: calcolate adesso, ma con i soli dati di prima della
    gara (le variabili sono costruite cosi'). Il modello e' allenato fino al
    2024, quindi queste gare non le ha mai viste. Sono segnate "ricostruito",
    e non sostituiscono mai una stima fatta davvero il giorno prima."""
    import numpy as np
    import pandas as pd
    oggi = pd.Timestamp(datetime.now(timezone.utc).date())
    sel = df[(~df["futura"].astype(bool)) & (df["data"] >= oggi - pd.Timedelta(days=GIORNI_RICOSTRUITI)) & (df["data"] < oggi)]
    if sel.empty:
        return 0
    gia = pd.read_sql_query("SELECT race_date, pista, horse_name, tipo FROM pronostico_top3_storico", conn)
    chiave = sel["data"].dt.strftime("%Y-%m-%d") + "|" + sel["pista"].astype(str) + "|" + sel["cavallo"]
    presenti = set(gia["race_date"] + "|" + gia["pista"].astype(str) + "|" + gia["horse_name"])
    sel = sel[~chiave.isin(presenti)]
    # Niente ricostruite per piste e giorni che hanno gia' la stima del giorno:
    # vuol dire che la corsa era in calendario, e la stima vera e' quella. Le
    # gare arrivate dopo (anche con la pista in sigla, RO invece di ROMA) non
    # devono creare una seconda stima.
    dg = gia[gia["tipo"] == "del_giorno"]
    giorni_dg = set(dg["race_date"] + "|" + dg["pista"].astype(str))
    cavalli_dg = set(dg["race_date"] + "|" + dg["horse_name"])
    gp = sel["data"].dt.strftime("%Y-%m-%d") + "|" + sel["pista"].map(lambda c: PISTE.get(str(c).upper(), c)).astype(str)
    gc = sel["data"].dt.strftime("%Y-%m-%d") + "|" + sel["cavallo"]
    sel = sel[~gp.isin(giorni_dg) & ~gc.isin(cavalli_dg)]
    if sel.empty:
        return 0
    grezza = lettore.probabilita(sel[list(lettore.variabili)].to_numpy(dtype="float32"))
    # Si normalizza solo dove l'archivio conosce tutti i partenti; altrimenti
    # la somma a tre ripartirebbe i posti fra una parte del campo soltanto.
    completo = campo_pieno(sel)
    prob = grezza.copy()
    if completo.any():
        prob[completo] = normalizza_per_gara(grezza[completo], sel["gara"].to_numpy()[completo],
                                             sel["partenti"].to_numpy()[completo], _temperatura_salvata())
    righe = []
    for (_, r), pg, pn, cc in zip(sel.iterrows(), grezza, prob, completo):
        ncorse = int(r["h_n"]) if r["h_n"] == r["h_n"] else 0
        righe.append((r["pista"], r["data"].strftime("%Y-%m-%d"), str(r["numero"]), r["cavallo"],
                      round(float(pn), 4), round(float(pg), 4), 1 if ncorse >= 5 else 0, ncorse,
                      1 if cc else 0, NOME_MODELLO, ora))
    conn.executemany("""INSERT OR IGNORE INTO pronostico_top3_storico
                        (pista, race_date, corsa, horse_name, prob, prob_grezza, affidabile,
                         n_corse, campo_completo, tipo, modello, calcolato_il)
                        VALUES (?,?,?,?,?,?,?,?,?,'ricostruito',?,?)""", righe)
    return len(righe)


def phase_pronostico_top3(conn: sqlite3.Connection) -> int:
    """Riscrive la tabella pronostico_top3 per le gare in calendario.
    Non deve mai far fallire il lavoro notturno: in caso di problemi lascia la
    tabella com'e' e lo dice."""
    try:
        import numpy as np  # noqa: F401
        import pandas as pd  # noqa: F401
    except ImportError:
        print("[PRONOSTICO] numpy/pandas non installati: salto", file=sys.stderr)
        return 0
    if not FILE_MODELLO.exists():
        print("[PRONOSTICO] modello non trovato: salto", file=sys.stderr)
        return 0
    try:
        verifica = json.loads(FILE_VERIFICA.read_text()) if FILE_VERIFICA.exists() else {}
        df = costruisci_variabili(conn, con_calendario=True)
        fut = df[df["futura"].astype(bool)].copy()
        # Quanti partenti della corsa hanno gia' corse in archivio: serve a
        # non dire "tra i migliori" quando il confronto e' con uno o due.
        fut["_noti"] = fut.groupby("gara")["h_n"].transform(lambda x: (x > 0).sum())
        conn.execute("""CREATE TABLE IF NOT EXISTS pronostico_top3 (
            track TEXT, race_date TEXT, race_time TEXT, horse_name TEXT,
            prob REAL, prob_grezza REAL, affidabile INTEGER, n_corse INTEGER,
            motivi TEXT, modello TEXT, verificato INTEGER, calcolato_il TEXT,
            PRIMARY KEY (track, race_date, race_time, horse_name))""")
        conn.execute("DELETE FROM pronostico_top3")
        if fut.empty:
            _crea_storico(conn)
            n_ric = _ricostruisci(conn, df, Alberi(FILE_MODELLO), datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
            conn.commit()
            return n_ric
        lettore = Alberi(FILE_MODELLO)
        Xf = fut[list(lettore.variabili)].to_numpy(dtype="float32")
        grezza = lettore.probabilita(Xf)
        prob = normalizza_per_gara(grezza, fut["gara"].to_numpy(), fut["partenti"].to_numpy(),
                                   float(verifica.get("temperatura") or 1.0))
        # Le ragioni: quanto ogni gruppo di dati sposta la stima del cavallo
        # rispetto agli avversari della stessa corsa.
        gruppi = _contributi_per_gruppo(lettore, Xf, fut["gara"].to_numpy(), fut["_noti"].to_numpy())
        ora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        verificato = 1 if verifica.get("supera_i_metodi_semplici") else 0
        righe = []
        for i, ((_, r), pg, pn) in enumerate(zip(fut.iterrows(), grezza, prob)):
            d = r.to_dict()
            ncorse = int(d["h_n"]) if d["h_n"] == d["h_n"] else 0
            righe.append((d["gara"].split("|")[1], d["data"].strftime("%Y-%m-%d"), str(d["numero"]), d["cavallo"],
                          round(float(pn), 4), round(float(pg), 4), 1 if ncorse >= 5 else 0, ncorse,
                          json.dumps(_motivi(d, {g: v[i] for g, v in gruppi.items()}), ensure_ascii=False), NOME_MODELLO, verificato, ora))
        conn.executemany("INSERT OR REPLACE INTO pronostico_top3 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", righe)
        # Lo storico conserva la stima del giorno anche dopo la gara, quando il
        # calendario la cancella: serve per verificarla con l'arrivo vero.
        _crea_storico(conn)
        storico = []
        for (_, r), pg, pn in zip(fut.iterrows(), grezza, prob):
            ncorse = int(r["h_n"]) if r["h_n"] == r["h_n"] else 0
            storico.append((r["pista"], r["data"].strftime("%Y-%m-%d"), str(r["numero"]), r["cavallo"],
                            round(float(pn), 4), round(float(pg), 4), 1 if ncorse >= 5 else 0, ncorse,
                            NOME_MODELLO, ora))
        conn.executemany("""INSERT OR REPLACE INTO pronostico_top3_storico
                            (pista, race_date, corsa, horse_name, prob, prob_grezza, affidabile,
                             n_corse, campo_completo, tipo, modello, calcolato_il)
                            VALUES (?,?,?,?,?,?,?,?,1,'del_giorno',?,?)""", storico)
        # Le stime "del giorno" salvate senza orario appartengono a piu' corse
        # fuse insieme per un errore di lettura del calendario (Bologna 08/10,
        # Roma 09/10, Torino 11/10, Montecatini 12/10): non sono verificabili
        # e falserebbero il controllo con gli arrivi, quindi si tolgono.
        conn.execute("DELETE FROM pronostico_top3_storico WHERE corsa = '' AND tipo = 'del_giorno'")
        _ripara_piste_storico(conn)
        n_ric = _ricostruisci(conn, df, lettore, ora)
        conn.commit()
        if n_ric:
            print(f"[PRONOSTICO] ricostruite {n_ric} stime di gare gia' corse", file=sys.stderr)
        print(f"[PRONOSTICO] {len(righe)} stime per {fut['gara'].nunique()} corse", file=sys.stderr)
        return len(righe)
    except Exception as e:  # mai bloccare la notte per questo
        print(f"[PRONOSTICO] errore, salto: {e!r}", file=sys.stderr)
        try:
            conn.rollback()
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    if "--allena" in sys.argv:
        allena()
    elif "--prova-varianti" in sys.argv:
        # Stesse partenze, stesso periodo di prova: quanto aggiunge ogni gruppo
        # nuovo della versione 4. Non tocca il modello in uso.
        c = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
        d = prepara_allenamento(c)
        base = [v for v in VARIABILI if v not in VARIABILI_V4]
        esiti = {}
        for nome, vv in (("v3", base), ("v3+allenatore", base + VARIABILI_V4[:4]),
                         ("v3+livello", base + VARIABILI_V4[4:]), ("v4", VARIABILI)):
            r = allena(c, d, vv, salva=False)
            esiti[nome] = {"modello": r["modello"], "campo_completo": r["campo_completo"]["modello_normalizzato"],
                           "temperatura": r["temperatura"]}
        (CARTELLA / "top3_varianti.json").write_text(json.dumps(esiti, indent=2, ensure_ascii=False))
        print(json.dumps(esiti, indent=2))
    else:
        conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
        print(phase_pronostico_top3(conn))
