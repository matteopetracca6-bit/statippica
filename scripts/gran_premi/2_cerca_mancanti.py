import json,re,datetime as dt,sys
sys.path.insert(0,'/tmp/gp')
exec(open('/tmp/gp/raccogli.py').read().split("db=sqlite3")[0])  # get(), imports
R=json.load(open('/tmp/gp/corse.json'))
KEYS=json.load(open('/tmp/gp/keys.json'))
def finale(k,r):
    n=r['nome'].upper()
    if not re.search(KEYS[k],n): return False
    if re.search(r'CONSOLAZ|BATT|FILL|SELEZ|ROAD TO',n) and not re.search('FINALE',n): return False
    return True
have={(k,int(r['data'][:4])) for k in KEYS for r in R if finale(k,r)}
want=set()
for k in KEYS:
    mds=sorted({r['data'][5:] for r in R if finale(k,r)})
    for y in range(2016,2027):
        if (k,y) in have: continue
        for md in mds:
            base=dt.date(y,int(md[:2]),int(md[3:]))
            for o in range(-6,7):
                d=base+dt.timedelta(o)
                if d<=dt.date(2026,10,26): want.add(d.isoformat())
done={r['data'] for r in R}
days=sorted(want-set())
print("missing",sorted(set((k,y) for k in KEYS for y in range(2016,2027))-have))
print("days",len(days))
import concurrent.futures as cf
def giornate(d):
    s=get(f"/risultati/{d}")
    return [(d,c) for c in sorted(set(re.findall(r'/risultati/giornata/T/(IT\d+)/'+d,s)))]
with cf.ThreadPoolExecutor(6) as ex: pairs=[p for x in ex.map(giornate,days) for p in x]
seen={(r['data'],r['codice']) for r in R}
pairs=[p for p in pairs if p not in seen]
print("new giornate",len(pairs))
src=open('/tmp/gp/raccogli.py').read()
exec(src[src.index("def leggi"):src.index("with cf.ThreadPoolExecutor(6) as ex:\n    res")])
with cf.ThreadPoolExecutor(6) as ex: new=[r for x in ex.map(leggi,pairs) for r in x]
R+=new; json.dump(R,open('/tmp/gp/corse.json','w'),ensure_ascii=False)
have={(k,int(r['data'][:4])) for k in KEYS for r in R if finale(k,r)}
print("still missing",sorted(set((k,y) for k in KEYS for y in range(2016,2027))-have))
