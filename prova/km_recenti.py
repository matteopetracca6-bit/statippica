"""Tempo previsto per le corse degli ultimi 20 giorni (solo dati di prima della corsa)."""
import json, sqlite3, sys
sys.path.insert(0, ".")
import numpy as np, pandas as pd
import pronostico_top3 as p, tempo_previsto as tp
c = sqlite3.connect("data.db")
df = p.costruisci_variabili(c)
df["rif_km"] = tp.riferimento(df)
fine = df["data"].max()
r = df[(df["data"] > fine - pd.Timedelta(days=20)) & df["rif_km"].notna()].copy()
ver = json.load(open(tp.FILE_VERIFICA))
L = p.Alberi(tp.FILE_MODELLO)
r["km"] = L.margine(r[ver["variabili"]].to_numpy(dtype="float32")) + r["rif_km"].to_numpy()
out = {f"{d.strftime('%Y-%m-%d')}|{pi}|{ca}": round(60 + float(k), 2) for d, pi, ca, k in zip(r["data"], r["pista"], r["cavallo"], r["km"]) if np.isfinite(k)}
ok = r[r["tempo"].notna()]
print("KM", len(out), "errore medio", round(float(np.mean(np.abs(ok["km"] - ok["tempo"]))), 3))
json.dump(out, open("prova/km.json", "w"))
