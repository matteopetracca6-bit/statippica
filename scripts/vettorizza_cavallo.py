from PIL import Image
import numpy as np, potrace, subprocess

im=Image.open('horse.gif')
mk=[]
for i in range(12):
    im.seek(i); mk.append(np.array(im.convert('L'))>140)
u=np.zeros_like(mk[0])
for m in mk: u|=m
ys,xs=np.where(u); x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
W,H=x1-x0,y1-y0

def traccia(m):
    p=potrace.Bitmap(~m[y0:y1,x0:x1]).trace(turdsize=10,alphamax=1.0,opttolerance=1.2)
    o=[]
    for c in p:
        o.append(f"M{c.start_point.x:.0f} {c.start_point.y:.0f}")
        for s in c:
            if s.is_corner: o.append(f"L{s.c.x:.0f} {s.c.y:.0f}L{s.end_point.x:.0f} {s.end_point.y:.0f}")
            else: o.append(f"C{s.c1.x:.0f} {s.c1.y:.0f} {s.c2.x:.0f} {s.c2.y:.0f} {s.end_point.x:.0f} {s.end_point.y:.0f}")
        o.append("Z")
    return "".join(o)

ts=[traccia(m) for m in mk]
# Confronto affiancato: originale sopra, vettoriale sotto, per ogni fotogramma
sv=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W*4}" height="{H*6}"><rect width="100%" height="100%" fill="#666"/>']
for i in range(12):
    r,c=i//4,i%4
    sv.append(f'<g transform="translate({c*W},{r*H*2})"><image x="0" y="0" width="{W}" height="{H}" href="orig_{i}.png"/></g>')
    sv.append(f'<g transform="translate({c*W},{r*H*2+H})"><path d="{ts[i]}" fill="#fff"/></g>')
sv.append('</svg>')
for i in range(12):
    im.seek(i); im.convert('RGB').crop((x0,y0,x1,y1)).save(f'/tmp/orig_{i}.png')
open('/tmp/conf.svg','w').write("".join(sv))
subprocess.run(['convert','-density','100','/tmp/conf.svg','/tmp/conf.png'])
print('caratteri totali', sum(len(t) for t in ts))
open('/tmp/tracciati.txt','w').write(f"{W} {H}\n"+"\n".join(ts))
