#!/bin/bash
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
curl -s -c /tmp/j -b /tmp/j -A "$UA" -o /dev/null https://www.letrot.com/
python3 -c "import json;[print(x[0]+'|'+str(x[1])) for x in json.load(open('rest.json'))]" | while IFS='|' read -r nome anno; do
  base=$(echo "$nome" | sed -E 's/ \([0-9]{4}\)$//')
  q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1].lower()))" "$base")
  s=$(curl -s -c /tmp/j -b /tmp/j -A "$UA" -H "Accept: application/json, text/plain, */*" -H "X-Requested-With: XMLHttpRequest" -H "Referer: https://www.letrot.com/" "https://www.letrot.com/v1/api/search/horse/$q")
  id=$(python3 -c "
import json,sys,re
try: it=json.loads(sys.argv[1])['horse']['items']
except Exception: it=[]
b=sys.argv[2]; a=sys.argv[3]
c=[x for x in it if re.sub(r'\s*\[\d+\]$','',x['horseName']).strip()==b]
if a!='None': c=[x for x in c if abs((x.get('ANNEE_NAISSANCE') or 0)-int(a))<=1]
print(c[0]['id'] if len(c)==1 else '')" "$s" "$base" "$anno")
  if [ -n "$id" ]; then
    slug=$(python3 -c "import re,sys;print(re.sub(r'[^a-z0-9]+','-',sys.argv[1].lower()).strip('-'))" "$base")
    url="https://www.letrot.com/stats/chevaux/$slug/$id/courses"
    t=$(curl -s -b /tmp/j -A "$UA" "$url" | python3 -c "
import re,sys,html
s=sys.stdin.read(); t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
t=html.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t))); i=t.find('Sexe'); print(t[i:i+800])")
    echo "P|$nome|$anno|$url|$t"
  else
    echo "N|$nome|$anno|$(echo "$s" | head -c 300)"
  fi
  sleep 1
done
