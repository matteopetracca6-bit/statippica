#!/usr/bin/env bash
#
# L'UNICA strada per pubblicare l'archivio. Tutti i lavori passano da qui.
#
# PERCHE' ESISTE. Il 28/09/2026 un lavoro e' partito senza scaricare
# l'archivio: sqlite3 ne ha creato uno vuoto e il lavoro l'ha pubblicato,
# 2.309 byte al posto di 108 MB. Il sito e' rimasto senza dati per due giorni
# e i notturni si sono fermati. Ogni lavoro aveva il suo modo di pubblicare,
# con controlli diversi, e uno non ne aveva nessuno.
#
# I CONTROLLI, tutti obbligatori:
#  1. il lavoro deve aver scaricato l'archivio con ottieni_archivio.sh
#     (che lascia il segno .archivio_iniziale): chi parte da un archivio
#     inventato non pubblica;
#  2. l'archivio deve aprirsi ed essere integro;
#  3. almeno 500.000 gare;
#  4. non meno gare di quante ne aveva all'inizio (tolleranza 0,5%): un
#     lavoro puo' aggiungere o correggere, non far sparire gare;
#  5. prima di sostituire la copia pubblicata, se e' buona la si mette da
#     parte come data.db.precedente.gz: e' la scorta da cui il sito e i
#     lavori ripartono se un giorno la copia principale risultasse rovinata;
#  6. dopo il caricamento si riscarica e si controlla che sia arrivata intera.

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-matteopetracca6-bit/statippica}"
BASE="https://github.com/$REPO/releases/download/archivio"
GARE_MINIME=500000
BYTE_MINIMI=20000000

errore() { echo "::error::$1 Non pubblico: il sito resta sull'archivio di prima."; exit 1; }
conta() { python3 -c "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select count(*) from races').fetchone()[0])" "$1" 2>/dev/null || echo 0; }

echo "== Pubblico l'archivio =="
[ -f data.db ] || errore "data.db non c'e'."

# 1. Da dove viene
if [ -f .archivio_iniziale ]; then
  GARE_INIZIALI=$(cat .archivio_iniziale)
elif [ "${ORIGINE_A_MANO:-}" = "1" ]; then
  GARE_INIZIALI=0
  echo "   caricamento a mano: salto il confronto con l'archivio di partenza"
else
  errore "questo lavoro non ha scaricato l'archivio con ottieni_archivio.sh, quindi non so da dove venga."
fi

# 2 e 3. Integro e abbastanza grande
INTEGRO=$(python3 -c "import sqlite3;print(sqlite3.connect('data.db').execute('pragma quick_check').fetchone()[0])" 2>/dev/null || echo rotto)
[ "$INTEGRO" = "ok" ] || errore "l'archivio non e' integro ($INTEGRO)."
GARE=$(conta data.db)
echo "   gare: $GARE (all'inizio del lavoro: $GARE_INIZIALI)"
[ "$GARE" -ge "$GARE_MINIME" ] || errore "solo $GARE gare, ne servono almeno $GARE_MINIME."

# 4. Non ha perso gare
SOGLIA=$(( GARE_INIZIALI - GARE_INIZIALI / 200 ))
[ "$GARE" -ge "$SOGLIA" ] || [ "${CONSENTI_CALO:-}" = "1" ] || errore "le gare sono scese da $GARE_INIZIALI a $GARE: il lavoro ne ha perse."

# 4b. Nessuno ha pubblicato mentre lavoravo? Se la copia pubblicata non e'
#     piu' quella da cui sono partito, pubblicare cancellerebbe il lavoro di
#     chi l'ha pubblicata. E' la rete di sicurezza sotto aspetta_turno.sh.
if [ -s .archivio_targa ]; then
  ORA=$(curl -sIL -m 60 "$BASE/data.db.gz" | tr -d '\r' | grep -i '^last-modified:' | tail -1)
  if [ -n "$ORA" ] && [ "$ORA" != "$(cat .archivio_targa)" ] && [ "${CONSENTI_CALO:-}" != "1" ]; then
    errore "mentre lavoravo un altro lavoro ha pubblicato l'archivio ($(cat .archivio_targa) -> $ORA): pubblicando cancellerei il suo lavoro. Va rifatto questo lavoro."
  fi
fi

# La copia compressa va rifatta se manca o se e' piu' vecchia dell'archivio.
if [ ! -f data.db.gz ] || [ data.db -nt data.db.gz ]; then
  gzip -9 -c data.db > data.db.gz
fi
BYTE=$(stat -c%s data.db.gz)
[ "$BYTE" -ge "$BYTE_MINIMI" ] || errore "la copia compressa pesa solo $BYTE byte."
python3 -c "import gzip,sys;sys.exit(0 if gzip.open('data.db.gz').read(15)==b'SQLite format 3' else 1)" || errore "la copia compressa non contiene un archivio."

# 5. La scorta: solo se quella attuale e' buona (una scorta rovinata non serve)
if curl -fsSL --retry 3 --retry-delay 5 -m 600 -o /tmp/attuale.gz "$BASE/data.db.gz"; then
  if gunzip -c /tmp/attuale.gz > /tmp/attuale.db 2>/dev/null && [ "$(conta /tmp/attuale.db)" -ge "$GARE_MINIME" ]; then
    cp /tmp/attuale.gz /tmp/data.db.precedente.gz
    gh release upload archivio /tmp/data.db.precedente.gz --repo "$REPO" --clobber \
      && echo "   scorta aggiornata con la copia che sto per sostituire" \
      || echo "::warning::non sono riuscito ad aggiornare la scorta"
  else
    echo "::warning::la copia pubblicata ora non e' buona: la scorta resta quella di prima"
  fi
  rm -f /tmp/attuale.db /tmp/attuale.gz /tmp/data.db.precedente.gz
fi

# Caricamento
gh release upload archivio data.db.gz --repo "$REPO" --clobber

# 6. Verifica: si riscarica e si confronta. L'indirizzo pubblico passa da una
#    rete di copie che per qualche tempo puo' ancora dare la versione di
#    prima: il 30/09 dopo 5 secondi, l'08/10 per piu' di due minuti (il
#    caricamento era riuscito, ma la verifica ha dichiarato fallito il lavoro
#    e il sito non e' stato fatto ripartire). Ora si riprova per sei minuti e,
#    se la rete di copie e' ancora indietro, si chiede direttamente a GitHub
#    la dimensione del file caricato: se coincide il caricamento e' riuscito.
OK=0
for i in $(seq 1 12); do
  sleep 30
  if curl -fsSL --retry 3 --retry-delay 10 -m 600 -o /tmp/verifica.gz "$BASE/data.db.gz" \
     && [ "$(stat -c%s /tmp/verifica.gz)" = "$BYTE" ]; then OK=1; break; fi
  echo "   la copia scaricata non e' ancora quella nuova, riprovo ($i)"
done
rm -f /tmp/verifica.gz
if [ "$OK" != 1 ]; then
  SU_GITHUB=$(gh release view archivio --repo "$REPO" --json assets \
    -q '.assets[] | select(.name == "data.db.gz") | .size' 2>/dev/null || echo 0)
  if [ "$SU_GITHUB" = "$BYTE" ]; then
    echo "::warning::la rete di copie da' ancora la versione di prima, ma GitHub conferma il file caricato ($BYTE byte): considero la pubblicazione riuscita."
    OK=1
  fi
fi
[ "$OK" = 1 ] || { echo "::error::dopo sei minuti si scarica ancora una copia diversa da quella caricata, e GitHub non conferma il file."; exit 1; }
echo "== Pubblicato: $GARE gare, $BYTE byte =="
