import json
d = json.load(open('/tmp/tavola.json'))
FASCE, tav, ETA_MAX = d["fasce"], d["tavola"], d["eta_max"]
CUM = d["cumulato"]

out = {}
for f in FASCE:
    righe = {r["eta"]: r for r in tav[f]}
    per_eta = {}
    for a in range(2, ETA_MAX + 1):
        # probabilita' di essere ancora in attivita' a ogni eta' futura,
        # partendo da un cavallo che a `a` anni sta correndo
        sopravv = 1.0
        med = medio = p25 = p75 = 0.0
        valore_totale = valore_su_fascia = 0.0
        dettaglio = []
        for e in range(a + 1, ETA_MAX + 1):
            r = righe.get(e)
            if not r: break
            sopravv *= r["prob_corre_ancora"]
            if sopravv < 0.005: break
            contributo = sopravv * r["guadagno_mediano"]
            valore_totale += contributo
            if r["fonte_guadagno"] == "fascia" and r["fonte_probabilita"] == "fascia":
                valore_su_fascia += contributo
            med   += contributo
            medio += sopravv * r["guadagno_medio"]
            p25   += sopravv * r["guadagno_p25"]
            p75   += sopravv * r["guadagno_p75"]
            dettaglio.append({"eta": e, "prob_attivo": round(sopravv, 3),
                              "guadagno_mediano_anno": r["guadagno_mediano"],
                              "su_dati_della_fascia":
                                  r["fonte_guadagno"] == "fascia"
                                  and r["fonte_probabilita"] == "fascia"})
        # anni di carriera ancora attesi
        anni = sum(x["prob_attivo"] for x in dettaglio)
        # A che punto della carriera TIPICA della sua fascia si trova, e
        # quanto vale quello che un cavallo di quella fascia ha di solito
        # gia' in cassa a quell'eta'. Serve per confrontare il cavallo con
        # i suoi pari invece che con una grandezza di scala diversa.
        cum_qui = CUM[f][str(a)]["mediano"] if str(a) in CUM[f] else CUM[f][a]["mediano"]
        per_eta[a] = {
            "cumulato_tipico_a_questa_eta": cum_qui,
            "quota_futura_tipica":
                round(med / (cum_qui + med), 3) if (cum_qui + med) > 0 else 0.0,
            "residuo_mediano": round(med),
            "residuo_medio": round(medio),
            "residuo_p25": round(p25),
            "residuo_p75": round(p75),
            "anni_attesi_ancora": round(anni, 1),
            # Alle eta' avanzate i cavalli osservati sono pochi e il conto si
            # appoggia a tutte le fasce insieme: in quel caso la stima
            # descrive il cavallo medio, non quella fascia di voto. Va detto,
            # perche' e' la ragione per cui un cavallo scarso e vecchio puo'
            # sembrare valere piu' di uno scarso e giovane.
            # Quota del valore stimato che poggia su cavalli della STESSA
            # fascia di voto. Quando scende, il conto si appoggia a tutte le
            # fasce insieme e descrive il cavallo medio invece di quello
            # specifico: e' la ragione per cui un cavallo scarso e anziano
            # puo' altrimenti sembrare valere piu' di uno scarso e giovane.
            "quota_su_dati_della_fascia":
                round(valore_su_fascia / valore_totale, 2) if valore_totale > 0 else 0.0,
            "stima_solida": bool(valore_totale > 0 and valore_su_fascia / valore_totale >= 0.6),
            "prossimi_anni": dettaglio[:6],
        }
    out[f] = per_eta

modello = {
    "descrizione":
        "Quanto puo' ancora guadagnare un cavallo che oggi corre, in base "
        "al suo voto e alla sua eta'. Costruito come una tavola di "
        "sopravvivenza: per ogni anno futuro si moltiplica il guadagno "
        "tipico di quell'eta' per la probabilita' di essere ancora in "
        "attivita'.",
    "metodo":
        "Osservazioni su cavalli nati dal 2014 in poi, di cui l'archivio "
        "copre la carriera dall'inizio. Ogni eta' entra nei conti solo se "
        "l'anno solare corrispondente e' gia' concluso, altrimenti i "
        "cavalli giovani sembrerebbero ritirati quando invece e' "
        "l'archivio a fermarsi.",
    "limiti": [
        "E' una media storica per fascia di voto, non una previsione sul "
        "singolo cavallo: infortuni, cambio di scuderia e qualita' del "
        "driver non sono considerati.",
        "Le gare archiviate partono dal 2014, quindi la tavola descrive il "
        "montepremi di questi ultimi anni e non e' rivalutata per "
        "l'inflazione.",
        "Alle eta' avanzate i cavalli osservati sono pochi e il dato si "
        "appoggia a tutte le fasce insieme.",
    ],
    "anno_ultimo_completo": d["anno_ultimo_completo"],
    "eta_max": ETA_MAX,
    "fasce": FASCE,
    "residuo": out,
    "tavola_sopravvivenza": tav,
}
json.dump(modello, open('career_value_model.json','w'), ensure_ascii=False, indent=1)

print("ESEMPI — quanto puo' ancora guadagnare (mediana)")
print(f"{'fascia':>8} | " + " | ".join(f"{a:>2}anni" for a in [3,4,5,6,7,8,9]))
for f in FASCE:
    print(f"{f:>8} | " + " | ".join(
        f"{out[f][a]['residuo_mediano']:>6.0f}" for a in [3,4,5,6,7,8,9]))
print()
print("ANNI DI CARRIERA ANCORA ATTESI")
print(f"{'fascia':>8} | " + " | ".join(f"{a:>2}anni" for a in [3,4,5,6,7,8,9]))
for f in FASCE:
    print(f"{f:>8} | " + " | ".join(
        f"{out[f][a]['anni_attesi_ancora']:>6.1f}" for a in [3,4,5,6,7,8,9]))
