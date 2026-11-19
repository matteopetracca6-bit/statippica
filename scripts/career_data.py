import sqlite3, json, collections
c=sqlite3.connect('file:data.db?mode=ro',uri=True)
ANNO_OGGI = 2026

# voto e anno di nascita
voti = {}
for n,by,sc,g in c.execute("""
  SELECT UPPER(TRIM(name)), birth_year, score, grade FROM horse_ratings
  WHERE score IS NOT NULL AND birth_year IS NOT NULL AND birth_year>=2014"""):
    voti[n]=(by,sc,g)
print("cavalli votati nati dal 2014:", len(voti))

# guadagni per eta'
per_eta = collections.defaultdict(float)   # (cavallo, eta) -> premi
gare_eta = collections.defaultdict(int)
for hn, d, p in c.execute("""
  SELECT UPPER(TRIM(horse_name)), race_date, prize_net FROM races
  WHERE race_date LIKE '____-%'"""):
    v = voti.get(hn)
    if not v: continue
    eta = int(d[:4]) - v[0]
    if eta < 0 or eta > 14: continue
    per_eta[(hn,eta)] += (p or 0.0)
    gare_eta[(hn,eta)] += 1
print("coppie cavallo-eta:", len(per_eta))
json.dump({"voti":{k:list(v) for k,v in voti.items()},
           "per_eta":{f"{k[0]}|{k[1]}":v for k,v in per_eta.items()},
           "gare_eta":{f"{k[0]}|{k[1]}":v for k,v in gare_eta.items()}},
          open('/tmp/carriera.json','w'))
print("salvato")
