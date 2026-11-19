"""Il voto dato a un cavallo giovane vale quanto quello dato a un adulto?

Il sospetto: il voto si calcola sulla carriera FATTA FINORA. Un tre anni ha
corso una stagione, un sette anni ne ha corse cinque. Se prendono la stessa
lettera, quella lettera non puo' voler dire la stessa cosa.

Come si verifica. Si prendono i cavalli con la carriera ormai conclusa e si
ricostruisce il voto che avrebbero avuto a tre anni, usando SOLO le gare corse
entro quell'eta' e confrontandoli con i loro coetanei di allora. Poi si guarda
quanto hanno incassato DAVVERO in tutta la carriera. Se la lettera a tre anni
prevedesse il futuro, i gruppi sarebbero ben separati.
"""
import sqlite3, collections, statistics, bisect, json

ANNO = 2026
ETA_GIUDIZIO = 3
c = sqlite3.connect("file:data.db?mode=ro", uri=True)

# Carriere concluse: nati 2012-2016, quindi oggi hanno 10-14 anni.
nati = {}
for n, by in c.execute("""SELECT UPPER(TRIM(name)), birth_year FROM horses
                          WHERE birth_year BETWEEN 2012 AND 2016
                            AND COALESCE(horse_class,'athlete')='athlete'"""):
    nati[n] = by
print("cavalli con carriera conclusa (nati 2012-2016):", len(nati))

# Gare divise per eta'.
entro = collections.defaultdict(lambda: {"gare":0,"vitt":0,"euro":0.0,"t":None})
totale = collections.defaultdict(lambda: {"gare":0,"vitt":0,"euro":0.0})
for hn, d, pl, pz, tk in c.execute("""SELECT UPPER(TRIM(horse_name)), race_date,
                                             placement, prize_net, time_km
                                      FROM races WHERE race_date LIKE '____-%'"""):
    by = nati.get(hn)
    if by is None:
        continue
    eta = int(d[:4]) - by
    if eta < 0 or eta > 14:
        continue
    t = totale[hn]
    t["gare"] += 1; t["euro"] += (pz or 0.0)
    if pl == 1: t["vitt"] += 1
    if eta <= ETA_GIUDIZIO:
        e = entro[hn]
        e["gare"] += 1; e["euro"] += (pz or 0.0)
        if pl == 1: e["vitt"] += 1
        if tk and tk > 1 and (e["t"] is None or tk < e["t"]): e["t"] = tk

# Deve aver corso entro i tre anni, altrimenti non c'e' niente da giudicare.
sogg = [n for n in nati if entro[n]["gare"] > 0 and totale[n]["gare"] > 0]
print("di cui hanno corso entro i %d anni: %d" % (ETA_GIUDIZIO, len(sogg)))

def percentili(valori):
    s = sorted(valori)
    return lambda v: (bisect.bisect_right(s, v) / len(s) * 100) if s else 0.0

pe = percentili([entro[n]["euro"] for n in sogg])
tempi = sorted(entro[n]["t"] for n in sogg if entro[n]["t"])
def pt(t):
    if not t or not tempi: return None
    return (len(tempi) - bisect.bisect_left(tempi, t)) / len(tempi) * 100

tv = sum(entro[n]["vitt"] for n in sogg); tc = sum(entro[n]["gare"] for n in sogg)
media_v = tv / tc * 100 if tc else 0

# Stesso impianto del voto vero, ma senza tenuta: a tre anni non e' misurabile.
punteggi = {}
for n in sogg:
    e = entro[n]
    g = pe(e["euro"])
    r = pt(e["t"])
    w = (e["vitt"] + 20 * media_v / 100) / (e["gare"] + 20) * 100
    punteggi[n] = g * 0.60 + (r if r is not None else g) * 0.20 + w * 0.20

s = sorted(punteggi.values()); N = len(s)
def soglia(p): return s[min(int(p / 100 * N), N - 1)]
SC = [(99,"SSS"),(95,"SS"),(90,"S"),(75,"A"),(60,"B"),(40,"C"),(25,"D"),(10,"E")]
lim = [(soglia(p), g) for p, g in SC] + [(0, "F")]
def voto(x):
    for l, g in lim:
        if x >= l: return g
    return "F"

gruppi = collections.defaultdict(list)
for n in sogg:
    gruppi[voto(punteggi[n])].append(totale[n]["euro"])

print()
print("GUADAGNI DI TUTTA LA CARRIERA, per il voto che avevano a %d anni" % ETA_GIUDIZIO)
print("%-5s %6s %10s %10s %10s %10s" % ("voto","n","mediana","media","25esimo","75esimo"))
ordine = ["SSS","SS","S","A","B","C","D","E","F"]
for g in ordine:
    v = sorted(gruppi.get(g, []))
    if len(v) < 5: continue
    q = lambda p: v[int(p*len(v))]
    print("%-5s %6d %10s %10s %10s %10s" % (g, len(v),
          format(int(statistics.median(v)),","), format(int(statistics.mean(v)),","),
          format(int(q(0.25)),","), format(int(q(0.75)),",")))

# Confronto con il voto di oggi, quello sulla carriera intera.
attuale = {}
for n, sc, g in c.execute("""SELECT UPPER(TRIM(name)), score, grade FROM horse_ratings
                             WHERE rating_mode='performance' AND horse_class='athlete'"""):
    attuale[n] = g
ga = collections.defaultdict(list)
for n in sogg:
    if n in attuale:
        ga[attuale[n]].append(totale[n]["euro"])
print()
print("Per confronto: gli stessi cavalli, per il voto DI OGGI (carriera intera)")
print("%-5s %6s %10s %10s" % ("voto","n","mediana","media"))
for g in ordine:
    v = ga.get(g, [])
    if len(v) < 5: continue
    print("%-5s %6d %10s %10s" % (g, len(v), format(int(statistics.median(v)),","),
                                  format(int(statistics.mean(v)),",")))

json.dump({"a_tre_anni":{g:v for g,v in gruppi.items()},
           "oggi":{g:v for g,v in ga.items()}}, open("/tmp/eta_voto.json","w"))
