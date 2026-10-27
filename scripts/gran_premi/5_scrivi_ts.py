"""Scrive client/src/data/granPremi.ts da /tmp/gp/granPremi.json (uscita di 4_albo_finale.py)."""
import json
d = json.load(open('/tmp/gp/granPremi.json'))
INFO = {"derby":"3 anni · 2100 m","lotteria":"4 anni e oltre · 1600 m, batterie e finale","mangelli":"3 anni · 1600 m, batterie e finale","nazioni":"4 anni e oltre · 2100–2250 m","costa":"4 anni e oltre · 1600 m","continentale":"4 anni · 2060 m","triossi":"4 anni · 2100 m","ue":"4 anni · 2080–2100 m","oaks":"femmine di 3 anni · 1600–1640 m","turilli":"4 anni e oltre · 2100 m","giovanardi":"3 anni · 2060–2080 m","marangoni":"3 anni · 2100 m","italia":"3 anni · dal 2020 maschi e femmine separati","montecatini":"4 anni e oltre · 1640 m, batterie e finale","allevatori":"2 anni · maschi e femmine"}
NOTE = {"marangoni":"Nel 2018 la corsa non si è disputata.","ue":"Fino al 2017 si chiamava Gran Premio d'Europa.","allevatori":"Dal 2018 al 2023 si chiamava Gran Premio MIPAAF / MASAF; fino al 2019 la corsa delle femmine era il Gran Premio Allevatori Filly.","italia":"Dal 2020 si corre in due prove, una per i maschi e una per le femmine."}
for g in d['gare']:
    g['info'] = INFO[g['id']]; g['nota'] = NOTE.get(g['id'])
testa = open('client/src/data/granPremi.ts').read().split('export const GARE_GP')[0]
coda = open('client/src/data/granPremi.ts').read().split('export function nomeGara')[1]
ts = (testa + 'export const GARE_GP: GaraGP[] = ' + json.dumps(d['gare'], ensure_ascii=False, indent=1) + ';\n'
      + 'export const VITTORIE_GP: VittoriaGP[] = ' + json.dumps(d['vincitori'], ensure_ascii=False) + ';\n\n'
      + 'export function nomeGara' + coda)
open('client/src/data/granPremi.ts', 'w').write(ts)
