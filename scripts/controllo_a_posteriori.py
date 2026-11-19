"""
controllo_a_posteriori.py — Le stime del sito rifatte "come se fossimo nel
passato", con i soli dati di allora, e confrontate con quello che e' successo.

PERCHE'
  Una stima si giudica sul futuro che non ha visto. Qui si torna a una data
  passata, si guardano solo le corse precedenti, si rifa' il conto che il sito
  fa oggi e si controlla com'e' andata davvero dopo.

TRE PROVE
  1. Tenere o fermare. Alla data, ogni cavallo in attivita' riceve la stima dei
     premi dei 12 mesi successivi (lo stesso modello del sito) e l'esito che
     il sito mostrerebbe: perdita, pari, profitto rispetto a 14.400 euro
     l'anno. Si guarda quanto ha vinto davvero nei 12 mesi dopo.
  2. Rischio della scuderia. Scuderie di 5 cavalli: a caso, e con lo stesso
     guidatore principale (il piu' vicino a una scuderia vera che l'archivio
     permette: in Italia chi guida spesso allena). Per ognuna la probabilita'
     di chiudere in pari calcolata come fa il sito, e com'e' andata.
     Se le scuderie con lo stesso guidatore vanno peggio o meglio "tutte
     insieme" piu' del previsto, i cavalli non sono indipendenti.
  3. Puledri dell'asta 2024 (generazione I). Stima fatta a fine settembre 2024
     dai figli del padre gia' corsi, contro i premi veri a 2 anni (2025) e a 3
     anni (2026, stagione ancora in corso).

DATE
  La prova principale e' al 1 ottobre 2025: ne' il modello dei premi (allenato
  fino al 2023) ne' le fasce di rischio (fatte sulle fotografie gennaio-luglio
  2025) l'hanno vista. Le fotografie del 2024 sono una seconda prova: il
  modello non le ha viste come dati di partenza, ma i premi vinti nel 2024 erano
  gia' entrati come "risultato" delle fotografie del 2023.

USO
  DB_PATH=data.db python3 scripts/controllo_a_posteriori.py
  scrive controllo_a_posteriori.json nella cartella del progetto.
  Non gira di notte: si rifa' a mano quando l'archivio ha un anno in piu'.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))
from stima_premi import _corse, fotografia, _obiettivo, VARIABILI, FILE_MODELLO, FILE_VERIFICA  # noqa: E402
from pronostico_top3 import Alberi  # noqa: E402

COSTO_ANNO = 14_400
DATA_PRINCIPALE = "2025-10-01"
DATE_SECONDARIE = ["2024-01-01", "2024-04-01", "2024-07-01", "2024-10-01"]
CAVALLI_PER_SCUDERIA = 5
SCUDERIE = 3000
SIMULAZIONI = 2000
FATTORE_ASTA = 1.4
K_PADRE = 30
rng = np.random.default_rng(20261018)


# ── strumenti che rifanno i conti del sito ──────────────────────────────────
def fascia_di(fasce, attesi):
    for i, f in enumerate(fasce):
        if attesi >= f["da"] and (attesi < f["a"] or i == len(fasce) - 1):
            return f
    return fasce[0] if attesi < fasce[0]["da"] else fasce[-1]


def da_percentili(q, u):
    """Stessa funzione del sito (server/scuderia.ts), vettoriale."""
    q = np.asarray(q, float)
    n = len(q)
    out = np.empty_like(u)
    a = u <= 0.05
    out[a] = q[0] * (u[a] / 0.05)
    b = u >= 0.95
    passo = max(q[-1] - q[-2], 0.1 * q[-1])
    out[b] = q[-1] + passo * 6 * ((u[b] - 0.95) / 0.05) ** 2
    m = ~(a | b)
    pos = (u[m] - 0.05) / 0.05
    i = np.floor(pos).astype(int)
    r = pos - i
    out[m] = q[i] + (q[np.minimum(i + 1, n - 1)] - q[i]) * r
    return out


def campioni_cavallo(fasce, attesi):
    f = fascia_di(fasce, attesi)
    c = da_percentili(f["percentili"], rng.random(SIMULAZIONI))
    m = c.mean()
    return c * (attesi / m) if m > 0 else c


def esito(attesi, costo=COSTO_ANNO):
    # Come Tenere o fermare: pari se entro il 10% del costo.
    if attesi < 0.9 * costo:
        return "perdita"
    if attesi > 1.1 * costo:
        return "profitto"
    return "pari"


def tondo(x, n=0):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else (round(float(x), n) if n else int(round(float(x))))


# ── prova 1 e 2 ─────────────────────────────────────────────────────────────
def fotografia_con_stima(r, h, giorno, alberi):
    x = fotografia(r, h, giorno)
    x["stima"] = alberi.importo(x[VARIABILI].to_numpy(dtype="float32"))
    x["vero"] = _obiettivo(r, x, giorno)
    # Ha corso ancora? Serve per dire quanti si sono fermati da soli.
    g = pd.Timestamp(giorno)
    dopo = r[(r["data"] >= g) & (r["data"] < g + pd.Timedelta(days=365))]
    x["corse_dopo"] = x["cavallo"].map(dopo.groupby("cavallo").size()).fillna(0).astype(int)
    # Guidatore principale dell'ultimo anno.
    prima = r[(r["data"] < g) & (r["data"] >= g - pd.Timedelta(days=365)) & r["guidatore"].notna()]
    princ = prima.groupby(["cavallo", "guidatore"]).size().reset_index(name="n").sort_values("n").groupby("cavallo").tail(1)
    x = x.merge(princ[["cavallo", "guidatore"]], on="cavallo", how="left")
    return x


def prova_tenere(x, fasce):
    righe = []
    for es in ["perdita", "pari", "profitto"]:
        s = x[x["esito"] == es]
        if s.empty:
            continue
        righe.append({
            "esito": es, "cavalli": int(len(s)),
            "stima_media": tondo(s["stima"].mean()), "vero_medio": tondo(s["vero"].mean()),
            "vero_mediano": tondo(s["vero"].median()),
            "hanno_coperto": tondo(100 * (s["vero"] >= COSTO_ANNO).mean(), 1),
            "sotto_un_terzo": tondo(100 * (s["vero"] < COSTO_ANNO / 3).mean(), 1),
            "non_hanno_piu_corso": tondo(100 * (s["corse_dopo"] == 0).mean(), 1),
        })
    # La regola semplice "ha vinto meno di un terzo del costo nell'ultimo anno".
    poco = x["premi365"] < COSTO_ANNO / 3
    semplice = {
        "cavalli": int(poco.sum()),
        "hanno_coperto": tondo(100 * (x.loc[poco, "vero"] >= COSTO_ANNO).mean(), 1),
        "vero_medio": tondo(x.loc[poco, "vero"].mean()),
    }
    # Fra quelli che il sito dava in perdita, chi poi ha coperto: gli errori.
    sp = x[x["esito"] == "perdita"]
    falsi = sp[sp["vero"] >= COSTO_ANNO]
    pr = x[x["esito"] == "profitto"]
    # Probabilita' di coprire detta dal sito (fasce) contro quella vera.
    x = x.copy()
    x["p_copre"] = [1 - np.interp(COSTO_ANNO, fascia_di(fasce, a)["percentili"], np.linspace(0.05, 0.95, 19))
                    if COSTO_ANNO > fascia_di(fasce, a)["percentili"][0] else 0.95 for a in x["stima"]]
    tagli = [0, 0.05, 0.15, 0.3, 0.5, 0.7, 1.01]
    cal = []
    for lo, hi in zip(tagli[:-1], tagli[1:]):
        s = x[(x["p_copre"] >= lo) & (x["p_copre"] < hi)]
        if len(s) < 30:
            continue
        cal.append({"da": round(100 * lo), "a": round(100 * min(hi, 1)), "cavalli": int(len(s)),
                    "detta": tondo(100 * s["p_copre"].mean(), 1), "vera": tondo(100 * (s["vero"] >= COSTO_ANNO).mean(), 1)})
    return {
        "cavalli": int(len(x)),
        "per_esito": righe,
        "regola_semplice": semplice,
        "in_perdita_che_hanno_coperto": int(len(falsi)),
        "in_perdita_che_hanno_coperto_quota": tondo(100 * len(falsi) / max(len(sp), 1), 1),
        "in_profitto_che_non_hanno_coperto_quota": tondo(100 * (pr["vero"] < COSTO_ANNO).mean(), 1) if len(pr) else None,
        "premi_totali_stimati": tondo(x["stima"].sum()), "premi_totali_veri": tondo(x["vero"].sum()),
        "calibrazione_copre": cal,
    }


def prova_scuderie(x, fasce):
    x = x.reset_index(drop=True)
    camp = np.stack([campioni_cavallo(fasce, a) for a in x["stima"]])  # cavalli × simulazioni
    costo = CAVALLI_PER_SCUDERIA * COSTO_ANNO

    def valuta(gruppi):
        out = []
        for idx in gruppi:
            tot = camp[idx].sum(axis=0)
            vero = float(x.loc[idx, "vero"].sum())
            out.append({
                "p_pari": float((tot >= costo).mean()),
                "p10": float(np.quantile(tot, 0.1)), "p90": float(np.quantile(tot, 0.9)),
                "atteso": float(tot.mean()), "vero": vero,
            })
        return pd.DataFrame(out)

    a_caso = [rng.choice(len(x), CAVALLI_PER_SCUDERIA, replace=False) for _ in range(SCUDERIE)]
    per_guid = []
    for _, g in x[x["guidatore"].notna()].groupby("guidatore"):
        if len(g) >= CAVALLI_PER_SCUDERIA:
            idx = g.index.to_numpy()
            for _ in range(max(1, min(20, len(g) // CAVALLI_PER_SCUDERIA))):
                per_guid.append(rng.choice(idx, CAVALLI_PER_SCUDERIA, replace=False))
    if len(per_guid) > SCUDERIE:
        per_guid = [per_guid[i] for i in rng.choice(len(per_guid), SCUDERIE, replace=False)]

    def riassunto(df):
        tagli = [0, 0.1, 0.25, 0.5, 0.75, 1.01]
        cal = []
        for lo, hi in zip(tagli[:-1], tagli[1:]):
            s = df[(df["p_pari"] >= lo) & (df["p_pari"] < hi)]
            if len(s) < 20:
                continue
            cal.append({"da": round(100 * lo), "a": round(100 * min(hi, 1)), "scuderie": int(len(s)),
                        "detta": tondo(100 * s["p_pari"].mean(), 1), "vera": tondo(100 * (s["vero"] >= costo).mean(), 1)})
        return {
            "scuderie": int(len(df)),
            "in_pari_detto": tondo(100 * df["p_pari"].mean(), 1),
            "in_pari_vero": tondo(100 * (df["vero"] >= costo).mean(), 1),
            "premi_attesi_medi": tondo(df["atteso"].mean()), "premi_veri_medi": tondo(df["vero"].mean()),
            # Con una forchetta 10-90 giusta, l'80% delle scuderie ci cade dentro.
            "dentro_forchetta_10_90": tondo(100 * ((df["vero"] >= df["p10"]) & (df["vero"] <= df["p90"])).mean(), 1),
            "sotto_p10": tondo(100 * (df["vero"] < df["p10"]).mean(), 1),
            "sopra_p90": tondo(100 * (df["vero"] > df["p90"]).mean(), 1),
            "calibrazione": cal,
        }

    return {"a_caso": riassunto(valuta(a_caso)), "stesso_guidatore": riassunto(valuta(per_guid)) if per_guid else None}


# ── prova 3 ─────────────────────────────────────────────────────────────────
def prova_asta_2024(conn, r):
    data_stima = pd.Timestamp("2024-10-01")
    aste = pd.read_csv(RADICE / "aste_yearling.csv")
    aste = aste[(aste["anno_asta"] == 2024)].copy()
    aste["chiave"] = aste["puledro"].str.upper().str.strip()
    h = pd.read_sql_query("SELECT name, birth_year, sire FROM horses", conn)
    h["chiave"] = h["name"].str.upper().str.strip()
    # Premi per eta' (anno solare - anno di nascita).
    rr = r.merge(h[["name", "birth_year"]].rename(columns={"name": "cavallo"}), on="cavallo", how="left")
    rr["eta_gara"] = rr["data"].dt.year - rr["birth_year"]
    premi_eta = rr.groupby(["cavallo", "eta_gara"])["premio"].sum().unstack(fill_value=0)

    def premio(nome, eta, prima_di=None):
        if prima_di is not None:
            s = rr[(rr["cavallo"] == nome) & (rr["eta_gara"] == eta) & (rr["data"] < prima_di)]["premio"].sum()
            return float(s)
        return float(premi_eta.loc[nome, eta]) if nome in premi_eta.index and eta in premi_eta.columns else 0.0

    # Quello che si sapeva a fine settembre 2024: figli del padre nati 2018-2021,
    # premi a 2 anni (completi per tutti) e a 3 anni (completi per i nati 2018-2020).
    prima = rr[rr["data"] < data_stima]
    pe = prima.groupby(["cavallo", "eta_gara"])["premio"].sum().unstack(fill_value=0)
    figli = h[(h["birth_year"].between(2018, 2021))].copy()
    figli["p2"] = figli["name"].map(pe[2] if 2 in pe.columns else {}).fillna(0)
    figli["p3"] = figli["name"].map(pe[3] if 3 in pe.columns else {}).fillna(0)
    figli["padre"] = figli["sire"].str.upper().str.strip()
    m2_tutti = figli["p2"].mean()
    m3_tutti = figli.loc[figli["birth_year"] <= 2020, "p3"].mean()
    per_padre = figli.groupby("padre").agg(n2=("p2", "size"), m2=("p2", "mean"))
    p3 = figli[figli["birth_year"] <= 2020].groupby("padre").agg(n3=("p3", "size"), m3=("p3", "mean"))
    per_padre = per_padre.join(p3, how="left")

    # Parte della stagione dei 3 anni gia' corsa al giorno dell'ultimo dato.
    ultimo = r["data"].max()
    nati22 = h[h["birth_year"] == 2022]["name"]
    s3 = rr[(rr["cavallo"].isin(nati22)) & (rr["eta_gara"] == 3)]  # 2025
    giorno = ultimo.dayofyear
    quota3 = float(s3[s3["data"].dt.dayofyear <= giorno]["premio"].sum() / max(s3["premio"].sum(), 1))

    righe = []
    for _, l in aste.iterrows():
        padre = str(l["padre"]).upper().strip()
        pp = per_padre.loc[padre] if padre in per_padre.index else None
        w2 = pp["n2"] / (pp["n2"] + K_PADRE) if pp is not None else 0
        s2 = (w2 * pp["m2"] + (1 - w2) * m2_tutti) if pp is not None else m2_tutti
        n3 = pp["n3"] if pp is not None and pp["n3"] == pp["n3"] else 0
        w3 = n3 / (n3 + K_PADRE)
        s3_ = (w3 * pp["m3"] + (1 - w3) * m3_tutti) if n3 else m3_tutti
        trovato = h[(h["chiave"] == l["chiave"]) & (h["birth_year"] == 2023)]
        nome = trovato["name"].iloc[0] if len(trovato) else None
        righe.append({
            "puledro": l["puledro"], "padre": padre, "venduto": l["venduto"] == "si",
            "prezzo": float(l["prezzo_eur"]) if l["prezzo_eur"] == l["prezzo_eur"] else None,
            "figli_padre": int(pp["n2"]) if pp is not None else 0,
            "stima2": FATTORE_ASTA * s2, "stima3": FATTORE_ASTA * s3_,
            "vero2": premio(nome, 2) if nome else 0.0, "vero3": premio(nome, 3) if nome else 0.0,
            "in_archivio": nome is not None,
        })
    d = pd.DataFrame(righe)
    d["stima3_finora"] = d["stima3"] * quota3
    d["stima_due"] = d["stima2"] + d["stima3_finora"]
    d["vero_due"] = d["vero2"] + d["vero3"]

    def terzi(col, sotto):
        s = sotto.dropna(subset=[col]).copy()
        s["terzo"] = pd.qcut(s[col].rank(method="first"), 3, labels=["basso", "medio", "alto"])
        return [{"terzo": str(t), "lotti": int(len(g)), "da": tondo(g[col].min()), "a": tondo(g[col].max()),
                 "vero_medio": tondo(g["vero_due"].mean()), "vero_mediano": tondo(g["vero_due"].median()),
                 "hanno_corso_a_2": tondo(100 * (g["vero2"] > 0).mean(), 1)}
                for t, g in s.groupby("terzo", observed=True)]

    from scipy.stats import spearmanr
    v = d[d["venduto"]]
    corr_stima = float(spearmanr(d["stima_due"], d["vero_due"]).statistic)
    corr_prezzo = float(spearmanr(v["prezzo"], v["vero_due"]).statistic)
    # Chi si e' ripagato il prezzo d'asta con i primi due anni di premi.
    ripagati = v[v["vero_due"] >= v["prezzo"]]
    migliori = d.sort_values("vero_due", ascending=False).head(10)
    return {
        "data_stima": "2024-10-01", "ultimo_dato": str(ultimo.date()),
        "quota_stagione_3_anni_gia_corsa": round(quota3, 3),
        "lotti": int(len(d)), "venduti": int(d["venduto"].sum()), "in_archivio": int(d["in_archivio"].sum()),
        "stima_totale_2_anni": tondo(d["stima2"].sum()), "vero_totale_2_anni": tondo(d["vero2"].sum()),
        "stima_totale_3_anni_finora": tondo(d["stima3_finora"].sum()), "vero_totale_3_anni_finora": tondo(d["vero3"].sum()),
        "correlazione_stima": round(corr_stima, 3), "correlazione_prezzo": round(corr_prezzo, 3),
        "per_terzi_di_stima": terzi("stima_due", d),
        "per_terzi_di_prezzo": terzi("prezzo", v),
        "prezzi_pagati": tondo(v["prezzo"].sum()), "premi_venduti_due_anni": tondo(v["vero_due"].sum()),
        "ripagati_con_due_anni": int(len(ripagati)),
        "migliori": [{"puledro": m["puledro"], "padre": m["padre"], "prezzo": tondo(m["prezzo"]) if m["venduto"] else None,
                      "stima": tondo(m["stima_due"]), "vero": tondo(m["vero_due"])} for _, m in migliori.iterrows()],
    }


def main():
    conn = sqlite3.connect(os.environ.get("DB_PATH", "data.db"))
    r, h = _corse(conn)
    gd = pd.read_sql_query("SELECT horse_name AS cavallo, race_date AS data, driver AS guidatore FROM races WHERE race_date >= '2023-01-01'", conn)
    gd["data"] = pd.to_datetime(gd["data"], errors="coerce")
    gd = gd.dropna(subset=["data"]).drop_duplicates(["cavallo", "data"])
    r = r.merge(gd, on=["cavallo", "data"], how="left")
    r["guidatore"] = r["guidatore"].where(r["guidatore"].fillna("").str.strip() != "", None)
    alberi = Alberi(FILE_MODELLO)
    fasce = json.loads(FILE_VERIFICA.read_text())["fasce"]

    def una_data(g):
        print(f"fotografia {g}...", file=sys.stderr)
        x = fotografia_con_stima(r, h, g, alberi)
        x["esito"] = [esito(a) for a in x["stima"]]
        return x

    x = una_data(DATA_PRINCIPALE)
    principale = {"data": DATA_PRINCIPALE, "tenere": prova_tenere(x, fasce), "scuderie": prova_scuderie(x, fasce)}
    secondarie = []
    for g in DATE_SECONDARIE:
        y = una_data(g)
        t = prova_tenere(y, fasce)
        s = prova_scuderie(y, fasce)
        secondarie.append({"data": g, "cavalli": t["cavalli"],
                           "perdita_hanno_coperto": next((e["hanno_coperto"] for e in t["per_esito"] if e["esito"] == "perdita"), None),
                           "profitto_hanno_coperto": next((e["hanno_coperto"] for e in t["per_esito"] if e["esito"] == "profitto"), None),
                           "premi_stimati": t["premi_totali_stimati"], "premi_veri": t["premi_totali_veri"],
                           "scuderie_in_pari_detto": s["a_caso"]["in_pari_detto"], "scuderie_in_pari_vero": s["a_caso"]["in_pari_vero"],
                           "stesso_guidatore_detto": s["stesso_guidatore"]["in_pari_detto"] if s["stesso_guidatore"] else None,
                           "stesso_guidatore_vero": s["stesso_guidatore"]["in_pari_vero"] if s["stesso_guidatore"] else None,
                           "stesso_guidatore_dentro_10_90": s["stesso_guidatore"]["dentro_forchetta_10_90"] if s["stesso_guidatore"] else None,
                           "a_caso_dentro_10_90": s["a_caso"]["dentro_forchetta_10_90"]})
    print("asta 2024...", file=sys.stderr)
    asta = prova_asta_2024(conn, r)
    out = {
        "calcolato_il": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "costo_anno": COSTO_ANNO, "cavalli_per_scuderia": CAVALLI_PER_SCUDERIA,
        "principale": principale, "altre_date": secondarie, "asta_2024": asta,
    }
    (RADICE / "controllo_a_posteriori.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps(out, ensure_ascii=False, indent=1)[:6000])


if __name__ == "__main__":
    main()
