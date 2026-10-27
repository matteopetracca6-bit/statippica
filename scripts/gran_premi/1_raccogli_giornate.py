import sqlite3, re, html, json, os, time, concurrent.futures as cf, urllib.request
B="https://database.grandeippicaitaliana.it"
UA={"User-Agent":"Mozilla/5.0 (StatIppica; matteopetracca9@gmail.com)"}
C="/tmp/gp/cache"; os.makedirs(C,exist_ok=True)
def get(path):
    f=os.path.join(C,path.strip('/').replace('/','_')+'.html')
    if os.path.exists(f): return open(f).read()
    for k in range(3):
        try:
            s=urllib.request.urlopen(urllib.request.Request(B+path,headers=UA),timeout=40).read().decode('utf-8','replace')
            open(f,'w').write(s); return s
        except Exception as e:
            time.sleep(2+k*3)
    return ""
db=sqlite3.connect("/tmp/gendir/data.db")
days=[r[0] for r in db.execute("select distinct race_date from races where placement=1 and max(coalesce(prize_gross,0),coalesce(prize_net,0))>=12000 and track!='ESTERO' and race_date>='2014-01-01' order by 1")]
print(len(days))
def giornate(d):
    s=get(f"/risultati/{d}")
    return sorted(set(re.findall(r'/risultati/giornata/T/(IT\d+)/'+d,s)))
with cf.ThreadPoolExecutor(6) as ex:
    gs=list(ex.map(giornate,days))
pairs=[(d,c) for d,cs in zip(days,gs) for c in cs]
print("giornate",len(pairs))
def leggi(p):
    d,c=p; s=get(f"/risultati/giornata/T/{c}/{d}")
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
    m=re.search(r'<title>Giornata a (.*?) di',s); pista=html.unescape(m.group(1)) if m else "?"
    t=html.unescape(re.sub(r'<[^>]+>',' ',t)); t=re.sub(r'\s+',' ',t)
    out=[]
    for blk in re.split(r'(?= Corsa \d+ delle )',t)[1:]:
        m=re.match(r' Corsa (\d+) delle (\S+) (.*?) - Euro ([\d\.]+)(.*?)- Metri (\d+)',blk)
        if not m: continue
        rest=blk[m.end():]
        w=re.search(r' 1 (\d+) (.+?) ([mfc][a-z]{0,2})(\d{1,2}) (\d{3,4}) ',rest)
        out.append(dict(data=d,codice=c,pista=pista,corsa=int(m.group(1)),nome=m.group(3).strip(),montepremi=m.group(4),metri=int(m.group(6)),vincitore=w.group(2).strip() if w else None,sesso_eta=(w.group(3)+w.group(4)) if w else None, testo=rest[:600]))
    return out
with cf.ThreadPoolExecutor(6) as ex:
    res=[r for x in ex.map(leggi,pairs) for r in x]
json.dump(res,open('/tmp/gp/corse.json','w'),ensure_ascii=False)
print("corse",len(res))
