"""Quanto un voto giovane ANTICIPA il voto finale, e quanto resta da guadagnare.

Due tabelle.

La prima: chi era C a tre anni, dove e' finito? Se il voto giovane fosse una
promessa affidabile, quasi tutti resterebbero C. Se invece si sparpagliano, la
lettera a tre anni non e' un giudizio ma una fotografia provvisoria.

La seconda: a parita' di lettera, quanto ha ancora da incassare un cavallo a
tre anni e quanto uno a sette. Questa e' la domanda pratica di chi compra.
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
    """Voto che ogni cavallo avrebbe avuto entro una certa eta'."""
    dati = {}
    for n, g in gare.items():
        fino = [x for x in g if x[0] <= eta_max]
        if not fino:
            continue
        euro = sum(x[2] for x in fino)
        vitt = sum(1 for x in fino if x[1] == 1)
        tt = [x[3] for x in fino if x[3] and x[3] > 1]
        dati[n] = {"euro": euro, "vitt": vitt, "gare": len(fino),
                   "t": min(tt) if tt else None}
    if not dati:
        return {}
    se = sorted(d["euro"] for d in dati.values())
    st = sorted(d["t"] for d in dati.values() if d["t"])
    tv = sum(d["vitt"] for d in dati.values()); tc = sum(d["gare"] for d in dati.values())
    mv = tv / tc * 100 if tc else 0
    punti = {}
    for n, d in dati.items():
        pg = bisect.bisect_right(se, d["euro"]) / len(se) * 100
        pr = ((len(st) - bisect.bisect_left(st, d["t"])) / len(st) * 100) if (d["t"] and st) else pg
        pw = (d["vitt"] + 20 * mv / 100) / (d["gare"] + 20) * 100
        punti[n] = pg * 0.60 + pr * 0.20 + pw * 0.20
    s = sorted(punti.values()); N = len(s)
    lim = [(s[min(int(p/100*N), N-1)], g) for p, g in SC] + [(0, "F")]
    out = {}
    for n, x in punti.items():
        for l, g in lim:
            if x >= l:
                out[n] = g; break
    return out

v3 = voti_a(3)
vfin = voti_a(14)

print("DOVE E' FINITO CHI AVEVA UN CERTO VOTO A TRE ANNI (in %)")
print("%-6s %5s  %s" % ("a 3a", "n", "  ".join("%5s" % g for g in ordine)))
for g in ordine:
    figli = [n for n in v3 if v3[n] == g and n in vfin]
    if len(figli) < 20: continue
    cnt = collections.Counter(vfin[n] for n in figli)
    print("%-6s %5d  %s" % (g, len(figli),
          "  ".join("%5.0f" % (cnt.get(x, 0) / len(figli) * 100) for x in ordine)))

print()
print("QUANTO RESTA DA GUADAGNARE DOPO, a parita' di voto raggiunto a quell'eta'")
print("(mediana dei premi incassati dall'eta' indicata in avanti)")
print("%-6s %12s %12s %12s" % ("voto", "dai 3 anni", "dai 5 anni", "dai 7 anni"))
resti = {}
for eta in (3, 5, 7):
    ve = voti_a(eta)
    for g in ordine:
        dopo = []
        for n, gg in ve.items():
            if gg != g: continue
            dopo.append(sum(x[2] for x in gare[n] if x[0] > eta))
        if len(dopo) >= 20:
            resti[(g, eta)] = statistics.median(dopo)
for g in ordine:
    r = [resti.get((g, e)) for e in (3, 5, 7)]
    if all(x is None for x in r): continue
    print("%-6s %12s %12s %12s" % (g,
          *[("%s" % format(int(x), ",")) if x is not None else "-" for x in r]))
