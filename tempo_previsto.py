"""
tempo_previsto.py — Il tempo al km che ogni partente dovrebbe fare (XGBoost).

Il modello stima di quanto il cavallo stara' sopra o sotto il tempo tipico di
quella pista e di quella distanza (misurato sull'anno prima, come l'indice di
velocita' del pronostico), con le stesse variabili del pronostico della notte.
Prova (24/11/2026, 85.371 arrivi dal 2025): sbaglia in media di 0,94 secondi
al km, contro 1,14 del "tempo tipico della pista piu' l'indice medio del
cavallo" e 1,44 dell'ultimo tempo; il piu' veloce previsto vince il 29,6%
delle corse, contro il 23,5%.

Di notte legge le variabili gia' calcolate dal pronostico (ULTIME_VARIABILI)
e scrive `tempo_previsto` (calendario) e `tempo_previsto_storico` (per
controllare a corsa fatta). Non fa mai fallire la notte.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent / "modelli"
FILE_MODELLO = CARTELLA / "tempo_km_xgb.json"
FILE_VERIFICA = CARTELLA / "tempo_km_verifica.json"


def riferimento(df):
    """Tempo tipico di pista e fascia di distanza nell'anno prima (o due anni
    prima, o di tutte le piste su quella fascia)."""
    import pandas as pd
    anno = df["data"].dt.year
    fascia = pd.cut(df["distanza"], [0, 1799, 2199, 9999], labels=False)
    base = pd.DataFrame({"pista": df["pista"], "f": fascia, "anno": anno, "t": df["tempo"]})[df["tempo"].notna() & fascia.notna()]
    tab = base.groupby(["pista", "f", "anno"])["t"].agg(["median", "count"]).reset_index()
    tab = tab[tab["count"] >= 30]
    tab_g = base.groupby(["f", "anno"])["t"].median().reset_index().rename(columns={"t": "mg"})
    q1 = pd.DataFrame({"pista": df["pista"], "f": fascia, "anno": anno - 1}).merge(tab[["pista", "f", "anno", "median"]], on=["pista", "f", "anno"], how="left")
    q2 = pd.DataFrame({"pista": df["pista"], "f": fascia, "anno": anno - 2}).merge(tab[["pista", "f", "anno", "median"]], on=["pista", "f", "anno"], how="left")
    q3 = pd.DataFrame({"f": fascia, "anno": anno - 1}).merge(tab_g, on=["f", "anno"], how="left")
    return q1["median"].fillna(q2["median"]).fillna(q3["mg"]).to_numpy()


def phase_tempo_previsto(conn, df) -> int:
    if df is None or not FILE_MODELLO.exists() or not FILE_VERIFICA.exists():
        print("[TEMPO PREVISTO] variabili o modello assenti: salto", file=sys.stderr)
        return 0
    try:
        import numpy as np
        import pronostico_top3 as pt
        ver = json.loads(FILE_VERIFICA.read_text())
        variabili = ver["variabili"]
        d = df.copy()
        d["rif_km"] = riferimento(d)
        fut = d[d["futura"].astype(bool) & d["rif_km"].notna()].copy()
        conn.execute("""CREATE TABLE IF NOT EXISTS tempo_previsto (
            track TEXT, race_date TEXT, race_time TEXT, horse_name TEXT, km REAL, rif_km REAL,
            modello TEXT, calcolato_il TEXT, PRIMARY KEY (track, race_date, race_time, horse_name))""")
        conn.execute("""CREATE TABLE IF NOT EXISTS tempo_previsto_storico (
            pista TEXT, race_date TEXT, corsa TEXT, horse_name TEXT, km REAL, rif_km REAL,
            modello TEXT, calcolato_il TEXT, PRIMARY KEY (pista, race_date, corsa, horse_name))""")
        conn.execute("DELETE FROM tempo_previsto")
        if fut.empty:
            conn.commit()
            return 0
        lettore = pt.Alberi(FILE_MODELLO)
        km = lettore.margine(fut[variabili].to_numpy(dtype="float32")) + fut["rif_km"].to_numpy()
        ora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        righe, storico = [], []
        for (_, r), k in zip(fut.iterrows(), km):
            if not np.isfinite(k):
                continue
            data = r["data"].strftime("%Y-%m-%d")
            righe.append((r["gara"].split("|")[1], data, str(r["numero"]), r["cavallo"], round(float(k), 2),
                          round(float(r["rif_km"]), 2), ver.get("nome"), ora))
            storico.append((r["pista"], data, str(r["numero"]), r["cavallo"], round(float(k), 2),
                            round(float(r["rif_km"]), 2), ver.get("nome"), ora))
        conn.executemany("INSERT OR REPLACE INTO tempo_previsto VALUES (?,?,?,?,?,?,?,?)", righe)
        conn.executemany("INSERT OR REPLACE INTO tempo_previsto_storico VALUES (?,?,?,?,?,?,?,?)", storico)
        conn.commit()
        print(f"[TEMPO PREVISTO] {len(righe)} stime per {fut['gara'].nunique()} corse", file=sys.stderr)
        return len(righe)
    except Exception as e:  # noqa: BLE001
        print(f"[TEMPO PREVISTO] errore, salto: {e!r}", file=sys.stderr)
        try:
            conn.rollback()
        except Exception:
            pass
        return 0
