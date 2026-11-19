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
 # 19/11/2026: ANACT Stakes Plus, 2 anni, finale maschi e finale femmine
 # (Vinovo, novembre). Non la versione dei 4 anni.
 "anact":(r"ANACT",r"4 ANNI|4 YEARS|QUATTRO|ANACT STAKES PLUS 4|ASTE|TROFEO"),
 # 19/11/2026: le altre corse con piu' di 25.000 euro al vincitore che si
 # corrono da almeno 3 anni (montepremi minimo 50.000, vedi MINIMO).
 "nazionale":(r"GRAN PREMIO NAZIONALE|G\.? ?P\.? NAZIONALE",r"FILLY|FEMMIN"),
 "nazionale_filly":(r"NAZIONALE (FILLY|FEMMIN)",None),
 "napoli":(r"CITTA'? DI NAPOLI",r"FILLY|FEMMIN"),
 "napoli_filly":(r"CITTA'? DI NAPOLI (FILLY|FEMMIN)",None),
 "duomo":(r"\bDUOMO\b",None),
 "europeo":(r"CAMPIONATO EUROPEO",r"CALCIO"),   # 2016: una corsa per 2 anni dedicata agli Europei di calcio
 "biasuzzi":(r"BIASUZZI",None),
 "duemari":(r"DUE MARI",None),
 "sicilia":(r"REGIONE SICILIA",None),
 "torino":(r"CITTA'? DI TORINO",None),
 "cacciari":(r"CACCIARI",None),
 "firenze":(r"^(PREMIO )?FIRENZE\b",None),
 "carena":(r"CARENA",None),
 "orlandi":(r"RENZO ORLANDI",None),
}
# Le edizioni con montepremi ridotto (Covid, tagli) entrano lo stesso,
# per non lasciare buchi nell'albo: basta il nome della corsa (19/11/2026).
MINIMO={k:10000 for k in ("nazionale","nazionale_filly","napoli","napoli_filly","duomo","europeo","biasuzzi",
                          "duemari","sicilia","torino","cacciari","firenze","carena","orlandi")}
# Corse legate a un ippodromo: con il montepremi ridotto il solo nome non
# basta (a Modena c'e' anche un "Premio Duomo" da 10.000 euro).
PISTA={"duomo":r"FIRENZE","firenze":r"FIRENZE","duemari":r"TARANTO","sicilia":r"PALERMO","cacciari":r"MODENA",
       "orlandi":r"MODENA","biasuzzi":r"TREVISO","europeo":r"CESENA","torino":r"TORINO","napoli":r"NAPOLI|COSMA",
       "napoli_filly":r"NAPOLI|COSMA","nazionale":r"MILANO","nazionale_filly":r"MILANO"}
# Una sola edizione l'anno (la piu' ricca) per le corse senza divisioni.
UNA_L_ANNO=set(MINIMO)-{"torino"}
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
        if mp(r)<MINIMO.get(k,25000): continue
        # Il controllo della pista vale per le edizioni ridotte: quelle piene
        # a volte cambiano ippodromo (Nazionale Filly 2022 e 2024, Biasuzzi 2026).
        if k in PISTA and mp(r)<50000 and not re.search(PISTA[k],(r['pista'] or '').upper()): continue
        xs.append(r)
    if k in UNA_L_ANNO:
        migliori={}
        for r in xs:
            a=r['data'][:4]
            if a not in migliori or mp(r)>mp(migliori[a]): migliori[a]=r
        xs=list(migliori.values())
    out[k]=sorted(xs,key=lambda r:r['data'])
json.dump(out,open('cand.json','w'),ensure_ascii=False)
for k,xs in out.items():
    print("=====",k)
    for r in xs: print(" ",r['data'],r['pista'][:10],r['corsa'],r['nome'][:58],"|",r['montepremi'],r['metri'],"|",r['vincitore'],r['sesso_eta'])
