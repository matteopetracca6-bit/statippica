"""La frase da verificare: un cavallo che a tre anni e' C vale meno di uno che
e' C a sette, perche' il secondo ha davanti ancora sei o sette stagioni?

Si confrontano, a parita' di lettera, i guadagni di TUTTA la carriera: quelli
di chi aveva quella lettera a tre anni e quelli di chi l'aveva a sette.
"""
import sqlite3, collections, statistics, bisect

c = sqlite3.connect("file:data.db?mode=ro", uri=True)
ordine = ["SSS","SS","S","A","B","C","D","E","F"]
SC = [(99,"SSS"),(95,"SS"),(90,"S"),(75,"A"),(60,"B"),(40,"C"),(25,"D"),(10,"E")]

nati = {}
for n, by in c.execute("""SELECT UPPER(TRIM(name)), birth_year FROM horses
                          WHERE birth_year BETWEEN 2012 AND 2016
                            AND COALESCE(horse_class,'athlete')='athlete'"""):
    nati[n] = by
gare = collections.defaultdict(list)
for hn, d, pl, pz, tk in c.execute("""SELECT UPPER(TRIM(horse_name)), race_date,
                                             placement, prize_net, time_km
                                      FROM races WHERE race_date LIKE '____-%'"""):
    if hn in nati:
        eta = int(d[:4]) - nati[hn]
        if 0 <= eta <= 14:
            gare[hn].append((eta, pl, pz or 0.0, tk))

def voti_a(eta_max):
    dati = {}
    for n, g in gare.items():
        fino = [x for x in g if x[0] <= eta_max]
        if not fino: continue
        tt = [x[3] for x in fino if x[3] and x[3] > 1]
        dati[n] = {"euro": sum(x[2] for x in fino),
                   "vitt": sum(1 for x in fino if x[1] == 1),
                   "gare": len(fino), "t": min(tt) if tt else None}
    se = sorted(d["euro"] for d in dati.values())
    st = sorted(d["t"] for d in dati.values() if d["t"])
    tv = sum(d["vitt"] for d in dati.values()); tc = sum(d["gare"] for d in dati.values())
    mv = tv / tc * 100 if tc else 0
    punti = {}
    for n, d in dati.items():
        pg = bisect.bisect_right(se, d["euro"]) / len(se) * 100
        pr = ((len(st)-bisect.bisect_left(st, d["t"]))/len(st)*100) if (d["t"] and st) else pg
        pw = (d["vitt"] + 20*mv/100)/(d["gare"]+20)*100
        punti[n] = pg*0.60 + pr*0.20 + pw*0.20
    s = sorted(punti.values()); N = len(s)
    lim = [(s[min(int(p/100*N), N-1)], g) for p, g in SC] + [(0, "F")]
    out = {}
    for n, x in punti.items():
        for l, g in lim:
            if x >= l: out[n] = g; break
    return out

v3, v7 = voti_a(3), voti_a(7)
tot = {n: sum(x[2] for x in g) for n, g in gare.items()}
corse = {n: len(g) for n, g in gare.items()}

print("GUADAGNI DI TUTTA LA CARRIERA a parita' di lettera, secondo l'eta' a cui")
print("quella lettera e' stata assegnata")
print("%-5s | %5s %11s %7s | %5s %11s %7s | %s" %
      ("voto","n a 3a","mediana","corse","n a 7a","mediana","corse","rapporto"))
for g in ordine:
    a = [tot[n] for n in v3 if v3[n] == g]
    b = [tot[n] for n in v7 if v7[n] == g]
    ca = [corse[n] for n in v3 if v3[n] == g]
    cb = [corse[n] for n in v7 if v7[n] == g]
    if len(a) < 20 or len(b) < 20: continue
    ma, mb = statistics.median(a), statistics.median(b)
    print("%-5s | %6d %11s %7.0f | %6d %11s %7.0f | %s" %
          (g, len(a), format(int(ma),","), statistics.median(ca),
           len(b), format(int(mb),","), statistics.median(cb),
           ("x%.1f piu' il 7 anni" % (mb/ma)) if ma and mb > ma else
           ("x%.1f piu' il 3 anni" % (ma/mb) if mb else "-")))
