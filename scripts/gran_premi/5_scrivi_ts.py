"""Scrive client/src/data/granPremi.ts da /tmp/gp/granPremi.json (uscita di 4_albo_finale.py)."""
import json
d = json.load(open('/tmp/gp/granPremi.json'))
INFO = {"derby":"3 anni · 2100 m","lotteria":"4 anni e oltre · 1600 m, batterie e finale","mangelli":"3 anni · 1600 m, batterie e finale","nazioni":"4 anni e oltre · 2100–2250 m","costa":"4 anni e oltre · 1600 m","continentale":"4 anni · 2060 m","triossi":"4 anni · 2100 m","ue":"4 anni · 2080–2100 m","oaks":"femmine di 3 anni · 1600–1640 m","turilli":"4 anni e oltre · 2100 m","giovanardi":"3 anni · 2060–2080 m","marangoni":"3 anni · 2100 m","italia":"3 anni · dal 2020 maschi e femmine separati","montecatini":"4 anni e oltre · 1640 m, batterie e finale","allevatori":"2 anni · maschi e femmine","anact":"2 anni · finale maschi e finale femmine, 1600 m",
 "nazionale":"3 anni · Milano, 2100–2250 m","nazionale_filly":"femmine di 3 anni · Milano, 1650 m",
 "napoli":"3 anni · Napoli, 2100 m","napoli_filly":"femmine di 3 anni · Napoli, 1600 m",
 "duomo":"anziani · Firenze, 1600 m","europeo":"anziani · Cesena, 1660 m, batterie e finale",
 "biasuzzi":"4 anni · Treviso, 1609 m","duemari":"anziani · Taranto, 1600 m","sicilia":"anziani · Palermo, 1600 m",
 "torino":"4 anni · Torino, 2060 m, maschi e femmine","cacciari":"femmine di 3 anni · Modena, 1600 m",
 "firenze":"4 anni · Firenze, 2020 m","carena":"femmine di 4 anni · Milano, 1600 m","orlandi":"anziani · Modena, 1600 m"}
NOTE = {"anact":"Dal 2023 si chiama ANACT Stakes Plus+; la pista cambia ogni anno (Napoli, Treviso, Firenze, Bologna, Torino, Roma).","marangoni":"Nel 2018 la corsa non si è disputata.","ue":"Fino al 2017 si chiamava Gran Premio d'Europa.","allevatori":"Dal 2018 al 2023 si chiamava Gran Premio MIPAAF / MASAF; fino al 2019 la corsa delle femmine era il Gran Premio Allevatori Filly.","italia":"Dal 2020 si corre in due prove, una per i maschi e una per le femmine."}
for g in d['gare']:
    g['info'] = INFO[g['id']]; g['nota'] = NOTE.get(g['id'])
testa = open('client/src/data/granPremi.ts').read().split('export const GARE_GP')[0]
coda = open('client/src/data/granPremi.ts').read().split('export function nomeGara')[1]
ts = (testa + 'export const GARE_GP: GaraGP[] = ' + json.dumps(d['gare'], ensure_ascii=False, indent=1) + ';\n'
      + 'export const VITTORIE_GP: VittoriaGP[] = ' + json.dumps(d['vincitori'], ensure_ascii=False) + ';\n\n'
      + 'export function nomeGara' + coda)
open('client/src/data/granPremi.ts', 'w').write(ts)
