"""Quanto e' affidabile il voto di un cavallo, a seconda dell'eta' a cui lo si legge.

Il voto si calcola sulla carriera fatta finora. A due anni quella carriera e'
una manciata di corse, a otto e' tutto quello che il cavallo fara' mai: la
stessa lettera non puo' avere lo stesso valore nei due casi.

Qui lo si misura invece di supporlo. Si prendono i cavalli nati fra il 2012 e
il 2016, che oggi hanno chiuso la carriera, e per ogni eta' si ricostruisce il
voto che avrebbero avuto ALLORA - usando solo le gare corse entro quell'eta' e
confrontandoli con i coetanei di allora, non con la popolazione di oggi. Poi si
guarda che voto hanno raggiunto alla fine.

Il risultato dice, per ogni lettera e ogni eta', quanti sono rimasti li',
quanti sono saliti e quanti sono scesi. A due anni resta fermo meno di un
cavallo su tre: a quell'eta' la lettera e' poco piu' di un sorteggio.

Scrive grade_stability.json. Non tocca l'archivio.
"""
import sqlite3, collections, bisect, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data.db")
USCITA = os.path.join(ROOT, "grade_stability.json")

ORDINE = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"]
SCALA = [(99,"SSS"), (95,"SS"), (90,"S"), (75,"A"), (60,"B"), (40,"C"), (25,"D"), (10,"E")]
# Annate con la carriera conclusa e le gare datate.
PRIMA, ULTIMA = 2012, 2016
MIN_GRUPPO = 30

def main() -> int:
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

    nati = dict(c.execute(f"""
        SELECT UPPER(TRIM(name)), birth_year FROM horses
        WHERE birth_year BETWEEN {PRIMA} AND {ULTIMA}
          AND COALESCE(horse_class,'athlete') = 'athlete'"""))

    gare = collections.defaultdict(list)
    for hn, d, pl, pz, tk in c.execute("""
            SELECT UPPER(TRIM(horse_name)), race_date, placement, prize_net, time_km
            FROM races WHERE race_date LIKE '____-%'"""):
        by = nati.get(hn)
        if by is None:
            continue
        eta = int(d[:4]) - by
        if 0 <= eta <= 14:
            gare[hn].append((eta, pl, pz or 0.0, tk))

    def voti_entro(eta_max: int) -> dict:
        """Il voto che ogni cavallo avrebbe avuto entro una certa eta'."""
        dati = {}
        for n, g in gare.items():
            fino = [x for x in g if x[0] <= eta_max]
            if not fino:
                continue
            tt = [x[3] for x in fino if x[3] and x[3] > 1]
            dati[n] = {"euro": sum(x[2] for x in fino),
                       "vitt": sum(1 for x in fino if x[1] == 1),
                       "gare": len(fino),
                       "t": min(tt) if tt else None}
        if not dati:
            return {}
        se = sorted(d["euro"] for d in dati.values())
        st = sorted(d["t"] for d in dati.values() if d["t"])
        tv = sum(d["vitt"] for d in dati.values())
        tc = sum(d["gare"] for d in dati.values())
        media_v = tv / tc * 100 if tc else 0.0

        punti = {}
        for n, d in dati.items():
            pg = bisect.bisect_right(se, d["euro"]) / len(se) * 100
            # Senza record misurato si usa il percentile guadagni, per non
            # trasformare un dato mancante in una bocciatura.
            pr = ((len(st) - bisect.bisect_left(st, d["t"])) / len(st) * 100) \
                if (d["t"] and st) else pg
            pw = (d["vitt"] + 20 * media_v / 100) / (d["gare"] + 20) * 100
            # La tenuta e' esclusa di proposito: a due o tre anni non e'
            # misurabile, e includerla renderebbe i confronti fra eta' falsi.
            punti[n] = pg * 0.60 + pr * 0.20 + pw * 0.20

        s = sorted(punti.values()); N = len(s)
        limiti = [(s[min(int(p / 100 * N), N - 1)], g) for p, g in SCALA] + [(0, "F")]
        out = {}
        for n, x in punti.items():
            for soglia, g in limiti:
                if x >= soglia:
                    out[n] = g
                    break
        return out

    finale = voti_entro(14)
    per_eta = {}
    for eta in range(2, 9):
        allora = voti_entro(eta)
        blocco = {}
        for g in ORDINE:
            figli = [n for n in allora if allora[n] == g and n in finale]
            if len(figli) < MIN_GRUPPO:
                continue
            cnt = collections.Counter(finale[n] for n in figli)
            tot = len(figli)
            i_g = ORDINE.index(g)
            blocco[g] = {
                "n": tot,
                "resta": round(cnt.get(g, 0) / tot * 100, 1),
                "sale": round(sum(v for k, v in cnt.items() if ORDINE.index(k) < i_g) / tot * 100, 1),
                "scende": round(sum(v for k, v in cnt.items() if ORDINE.index(k) > i_g) / tot * 100, 1),
            }
        if blocco:
            per_eta[str(eta)] = blocco

    json.dump({
        "descrizione": "Quanto e' affidabile il voto di un cavallo, secondo l'eta' a "
                       "cui lo si legge. Il voto si calcola sulla carriera fatta finora: "
                       "a due anni e' una manciata di corse, a otto e' tutto.",
        "metodo": f"Cavalli nati fra il {PRIMA} e il {ULTIMA}, con la carriera conclusa. "
                  "Per ogni eta' si ricostruisce il voto che avevano allora, usando solo "
                  "le gare corse entro quel momento e confrontandoli con i coetanei di "
                  "allora. Poi si guarda il voto raggiunto a fine carriera.",
        "lettura": "resta = quota che ha chiuso con la stessa lettera; sale = finita piu' "
                   "in alto; scende = finita piu' in basso. Percentuali.",
        "limiti": [
            "E' una statistica di gruppo, non una previsione sul singolo cavallo.",
            "La tenuta non entra nel voto ricostruito: a due o tre anni non e' misurabile, "
            "e includerla renderebbe falso il confronto fra eta'.",
            f"Si basa sulle annate {PRIMA}-{ULTIMA}, le uniche con carriera conclusa e gare datate.",
        ],
        "gruppo_minimo": MIN_GRUPPO,
        "per_eta": per_eta,
    }, open(USCITA, "w"), ensure_ascii=False, indent=1)

    print(f"[STABILITA] Salvato {USCITA}: eta' {sorted(per_eta)}", file=sys.stderr)
    for eta in sorted(per_eta, key=int):
        b = per_eta[eta]
        print(f"  a {eta} anni: " + "  ".join(f"{g} {b[g]['resta']:.0f}%" for g in ORDINE if g in b),
              file=sys.stderr)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
