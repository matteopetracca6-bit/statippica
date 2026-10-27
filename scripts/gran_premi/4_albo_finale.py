import json,re,sqlite3
C=json.load(open('cand.json'))
R=json.load(open('corse.json'))
db=sqlite3.connect('/tmp/gendir/data.db')
PISTE={'Roma':'ROMA','Napoli':'NAPOLI','Milano':'MILANO','Torino':'TORINO','Bologna':'BOLOGNA','Modena':'MODENA','Montecatini':'MONTECATINI','SS.Cosma-D':'GARIGLIANO','Treviso':'TREVISO'}
def pista(p):
    for k,v in PISTE.items():
        if p.startswith(k): return v
    return p.upper()
def mp(r): return float(r['montepremi'].replace('.',''))
def extra(name,date,testo):
    row=db.execute("select driver,time_km,track from races where horse_name=? and race_date=? and placement=1",(name,date)).fetchone()
    drv=tm=None
    if row: drv,tm=row[0],row[1]
    m=re.search(r' 1 \d+ '+re.escape(name)+r' [mfc][a-z]{0,2}\d{1,2} \d{3,4} (?:[A-Z] )?(\d{2}\.\d) [\d,]+ (\S+) (\S+) (\S+)',testo or '')
    if m:
        if not tm: tm=float(m.group(1))
        if not drv:
            if m.group(2) in ('Di','De','Lo','La','Del','Da'): drv=m.group(4)[0]+'.'+m.group(2)+' '+m.group(3)
            else: drv=m.group(3)[0]+'.'+m.group(2)
    t=None
    if tm: t="1.%04.1f"%float(tm)
    return drv,t
def nato(name,anno,eta):
    rows=db.execute("select birth_year from horses where name=?",(name,)).fetchall()
    ys=[r[0] for r in rows if r[0]]
    if eta is not None:
        for y in ys:
            if abs((anno-y)-eta)<=0: return y
    return ys[0] if len(ys)==1 else (anno-eta if eta is not None else None)
NOMI={"derby":"Derby Italiano del Trotto","lotteria":"Gran Premio Lotteria di Agnano","mangelli":"Gran Premio Orsi Mangelli","nazioni":"Gran Premio delle Nazioni","costa":"Gran Premio Costa Azzurra","continentale":"Gran Premio Continentale","triossi":"Gran Premio Tino Triossi","ue":"Gran Premio Unione Europea","oaks":"Oaks del Trotto","turilli":"Gran Premio Turilli","giovanardi":"Gran Premio Giovanardi","marangoni":"Gran Premio Marangoni","italia":"Gran Premio Italia","montecatini":"Gran Premio Città di Montecatini","allevatori":"Gran Premio Allevatori – MASAF"}
DIV={"italia","allevatori"}
FONTE_UFF="https://database.grandeippicaitaliana.it/risultati/giornata/T/{c}/{d}"
out=[]
extra_rows={"mangelli":[('2018-11-01','IT44',8)],"nazioni":[('2018-11-01','IT44',7)],"ue":[('2020-11-15','IT34',5)]}
idx={(r['data'],r['codice'],r['corsa']):r for r in R}
for k,xs in C.items():
    xs=list(xs)+[idx[t] for t in extra_rows.get(k,[])]
    xs=[r for r in xs if not re.search(r"ROYAL MARES|SOCIETA' TERME",r['nome'].upper())]
    if k in ('derby','lotteria'): xs=[r for r in xs if mp(r)>=100000]
    byday={}
    for r in xs: byday.setdefault(r['data'],[]).append(r)
    for d,rs in byday.items():
        if k not in DIV: rs=[max(rs,key=mp)]
        for r in rs:
            n=r['nome'].upper(); div=None
            if k in DIV and len(rs)>1:
                div="Femmine" if re.search(r"FILL|FEMMIN",n) else ("Maschi" if "MASCHI" in n else None)
            if k=='allevatori' and len(rs)==1: div=None
            se=r['sesso_eta'] or ''
            eta=int(re.sub(r'\D','',se)) if re.search(r'\d',se) else None
            sesso={'m':'M','f':'F','c':'C'}.get(se[:1])
            drv,t=extra(r['vincitore'],d,r['testo'])
            nota=None
            if k=='ue' and d<'2018': nota="allora Gran Premio d'Europa"
            if k=='allevatori' and d<'2018' and div=='Femmine': nota="Gran Premio Allevatori Filly"
            out.append(dict(gara=k,anno=int(d[:4]),data=d,pista=pista(r['pista']),metri=r['metri'],montepremi=int(mp(r)),vincitore=r['vincitore'],sesso=sesso,eta=eta,nato=nato(r['vincitore'],int(d[:4]),eta),driver=drv,tempo=t,divisione=div,nota=nota,fonte=FONTE_UFF.format(c=r['codice'],d=d)))
# 2014-2015 e casi mancanti nell'archivio ufficiale
W={"https://fr.wikipedia.org/wiki/Derby_italien_du_trot":[("derby",2014,"SUGAR REY",None,"ROMA"),("derby",2015,"TESTIMONIAL OK","2015-10-11","ROMA")],
 "https://www.grandeippicaitaliana.it/albo-doro-gran-premio-lotteria/":[("lotteria",2014,"MACK GRACE SM","2014-05-04","NAPOLI"),("lotteria",2015,"VINCENNES","2015-05-03","NAPOLI")],
 "https://fr.wikipedia.org/wiki/Grand_Prix_Orsi_Mangelli":[("mangelli",2014,"JONTTE BOY",None,None),("mangelli",2015,"CHARLY DU NOYER",None,None)],
 "https://fr.wikipedia.org/wiki/Grand_Prix_des_Nations_(course_hippique)":[("nazioni",2014,"PRUSSIA",None,None),("nazioni",2015,"MOSES ROB",None,None)],
 "https://www.grandeippicaitaliana.it/albo-doro-costa-azzurra/":[("costa",2014,"NAPOLEON BAR",None,"TORINO"),("costa",2015,"PACE DEL RIO",None,"TORINO"),("costa",2019,"ARAZI BOKO",None,"TORINO")],
 "https://www.ippodromobologna.it/wp-content/uploads/2019/09/albOro_Continent.al2019.pdf":[("continentale",2014,"RADIOFRECCIA FI",None,"BOLOGNA"),("continentale",2015,"BRILLANTISSIME",None,"BOLOGNA")],
 "https://fr.wikipedia.org/wiki/Grand_Prix_Tino_Triossi":[("triossi",2014,"TIGER WOODS AS",None,None),("triossi",2015,"SUGAR REY",None,None)],
 "https://sv.wikipedia.org/wiki/Gran_Premio_d'Europa":[("ue",2014,"RADIOFRECCIA FI",None,None),("ue",2015,"BRILLANTISSIME",None,None)],
 "https://fr.wikipedia.org/wiki/Oaks_del_Trotto":[("oaks",2014,"SMERALDA JET",None,None),("oaks",2015,"TUSCANIA PAL","2015-10-11","ROMA")],
 "https://fr.wikipedia.org/wiki/Grand_Prix_Gaetano_Turilli":[("turilli",2014,"PRUSSIA",None,None),("turilli",2015,"NEPHENTA LUX",None,None)],
 "https://fr.wikipedia.org/wiki/Prix_Tito_Giovanardi":[("giovanardi",2014,"SING HALLELUJAH",None,"MODENA"),("giovanardi",2015,"TRESOR ZS","2015-05-10","MODENA")],
 "https://sv.wikipedia.org/wiki/Gran_Premio_Carlo_Marangoni":[("marangoni",2014,"SCEICCO",None,"TORINO"),("marangoni",2015,"TIMONE EK","2015-09-06","TORINO")],
 "https://www.ippodromobologna.it/wp-content/uploads/2026/03/albOro_Italia-al-2026.pdf":[("italia",2014,"SAVANNAH BI",None,"BOLOGNA"),("italia",2015,"TELECOMANDO OK",None,"BOLOGNA")],
 "https://fr.wikipedia.org/wiki/Grand_Prix_de_la_Ville_de_Montecatini":[("montecatini",2014,"MACK GRACE SM","2014-08-15","MONTECATINI"),("montecatini",2015,"ORSIA","2015-08-15","MONTECATINI")],
 "https://sv.wikipedia.org/wiki/Gran_Premio_Allevatori":[("allevatori",2014,"THEODOR GRIF","2014-12-26","ROMA"),("allevatori",2015,"URLO DEI VENTI","2015-12-26","ROMA")],
}
ETA={"derby":3,"oaks":3,"mangelli":3,"giovanardi":3,"marangoni":3,"italia":3,"continentale":4,"triossi":4,"ue":4,"allevatori":2}
for fonte,rows in W.items():
    for k,a,v,d,p in rows:
        drv=t=None; met=None
        if d:
            row=db.execute("select driver,time_km,distance,track from races where horse_name=? and race_date=? and placement=1",(v,d)).fetchone()
            if row: drv=row[0]; t="1.%04.1f"%row[1] if row[1] else None; met=row[2]; p=p or row[3]
        eta=ETA.get(k)
        out.append(dict(gara=k,anno=a,data=d,pista=p,metri=met,montepremi=None,vincitore=v,sesso="F" if k=='oaks' else None,eta=eta,nato=nato(v,a,eta) if eta else (lambda ys: ys[0] if len(ys)==1 else None)([r[0] for r in db.execute("select birth_year from horses where name=?",(v,))]),driver=drv,tempo=t,divisione=None,nota=None,fonte=fonte))
out.sort(key=lambda r:(r['gara'],r['anno'],r['divisione'] or ''))
# sanity: duplicates
from collections import Counter
c=Counter((r['gara'],r['anno'],r['divisione']) for r in out)
print("dup",[k for k,v in c.items() if v>1])
for k in NOMI:
    ys=sorted({r['anno'] for r in out if r['gara']==k}); miss=[y for y in range(2014,2027) if y not in ys]
    print(k,len([r for r in out if r['gara']==k]),"mancano",miss)
print("senza nato",[ (r['vincitore'],r['anno']) for r in out if not r['nato']])
def norm_drv(d):
    if not d or '.' in d: return d
    p=d.split()
    return p[0][0]+'.'+' '.join(p[1:]) if len(p)>=2 else d
for r in out:
    r['driver']=norm_drv(r['driver'])
for r in out:
    r['scheda']=bool(r['nato'] and db.execute("select 1 from horses where name=? and birth_year=?",(r['vincitore'],r['nato'])).fetchone())
json.dump(dict(gare=[dict(id=k,nome=v) for k,v in NOMI.items()],vincitori=out),open('/tmp/gp/granPremi.json','w'),ensure_ascii=False)
