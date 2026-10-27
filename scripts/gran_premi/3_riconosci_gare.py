import json,re
R=json.load(open('corse.json'))
def mp(r): return float(r['montepremi'].replace('.',''))
seen=set(); U=[]
for r in R:
    k=(r['data'],r['codice'],r['corsa'])
    if k in seen: continue
    seen.add(k); U.append(r)
RULES={
 "derby":(r"DERBY (IT|TROTTO|DEL TROTTO)",None),
 "lotteria":(r"LOTTERIA",None),
 "mangelli":(r"MANGELLI|PAOLO E ORSINO|PAOLO E O",r"FILLY"),
 "nazioni":(r"NAZIONI",None),
 "costa":(r"COSTA AZZURRA",None),
 "continentale":(r"CONTINENTALE",r"FILLY"),
 "triossi":(r"TRIOSSI",None),
 "ue":(r"UNIONE EUROPEA|UNIONE EUROPA|GRAN PREMIO EUROPA|GP D' ?EUROPA|^GR\.1 M\.2080",None),
 "oaks":(r"OAKS DEL TROTTO",None),
 "turilli":(r"TURILLI",None),
 "giovanardi":(r"GIOVANARDI",None),
 "marangoni":(r"MARANGONI",r"FILLY"),
 "italia":(r"GRAN PREMIO ITALIA|GP ITALIA|G\.P\. ITALIA",None),
 "montecatini":(r"MONTECA",None),
 "allevatori":(r"ALLEVATORI|MIPAAF|MASAF|ALLEVAMENTO",None),
}
EXC=r"CONSOLAZ|BATT|SELEZ|ROAD TO|PRESENTAZ|QUALIF|PROVA|ELIMIN|CORSA [AB]\b|GENTLEMEN|AMATORI|ALLIEVI|SFIDA"
out={}
for k,(inc,exc) in RULES.items():
    xs=[]
    for r in U:
        n=r['nome'].upper()
        if not re.search(inc,n): continue
        if exc and re.search(exc,n): continue
        if re.search(EXC,n) and not re.search("FINALE",n): continue
        if re.search(r"BATT|CONSOLAZ",n): continue
        if mp(r)<25000: continue
        xs.append(r)
    out[k]=sorted(xs,key=lambda r:r['data'])
json.dump(out,open('cand.json','w'),ensure_ascii=False)
for k,xs in out.items():
    print("=====",k)
    for r in xs: print(" ",r['data'],r['pista'][:10],r['corsa'],r['nome'][:58],"|",r['montepremi'],r['metri'],"|",r['vincitore'],r['sesso_eta'])
