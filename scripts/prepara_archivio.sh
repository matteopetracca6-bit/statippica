#!/usr/bin/env bash
#
# Prepara data.db prima che il sito parta.
#
# L'archivio NON sta dentro il progetto. Dentro git ogni versione nuova si
# somma alle precedenti per sempre, e un binario compresso da 30 MB che cambia
# ogni notte non ha nulla in comune con quello di ieri: git non puo'
# condividere niente e aggiunge 30 MB di cronologia a notte, circa 900 MB al
# mese. In tre mesi il progetto era arrivato a 477 MB, con GitHub che
# raccomanda di restare sotto 1 GB.
#
# Quindi l'archivio sta in un RILASCIO, a un indirizzo fisso. La copia nuova
# sostituisce la vecchia, il peso resta fermo a 30 MB, e i rilasci non contano
# nel peso del progetto.
#
# Il server apre data.db relativo alla cartella di lavoro
# (server/routes.ts: DB_PATH = cwd + "data.db"), quindi va riaperto QUI, nella
# cartella del progetto, non sul disco montato.

set -uo pipefail

INDIRIZZO="https://github.com/matteopetracca6-bit/statippica/releases/download/archivio/data.db.gz"
BYTE_MINIMI=20000000     # un archivio vero compresso sta sopra i 25 MB
GARE_MINIME=500000       # a settembre 2026 sono 613.686

# Quanto e' grande e quante gare ha l'archivio aperto, per decidere se fidarsi.
verifica() {
  local f="$1"
  [ -f "$f" ] || return 1
  local byte; byte=$(stat -c%s "$f" 2>/dev/null || echo 0)
  if [ "$byte" -lt 90000000 ]; then
    echo "   archivio troppo piccolo da aperto: $byte byte"
    return 1
  fi
  local gare
  gare=$(node -e "
    try {
      const D = require('better-sqlite3');
      const n = new D('$f', {readonly:true})
        .prepare('select count(*) c from races').get().c;
      console.log(n);
    } catch (e) { console.log(0); }
  " 2>/dev/null || echo 0)
  if [ "$gare" -lt "$GARE_MINIME" ]; then
    echo "   solo $gare gare, me ne aspetto almeno $GARE_MINIME"
    return 1
  fi
  echo "   archivio buono: $byte byte, $gare gare"
  return 0
}

echo "== Preparo l'archivio =="

# 1) La strada normale: scaricarlo dal rilascio.
echo "-> Scarico l'archivio dal rilascio"
if curl -fsSL --retry 3 --retry-delay 5 -m 300 -o /tmp/archivio.gz "$INDIRIZZO"; then
  byte=$(stat -c%s /tmp/archivio.gz 2>/dev/null || echo 0)
  echo "   scaricati $byte byte"
  if [ "$byte" -ge "$BYTE_MINIMI" ] && gunzip -c /tmp/archivio.gz > data.db 2>/dev/null; then
    if verifica data.db; then
      echo "== Pronto (dal rilascio) =="
      exit 0
    fi
  fi
  echo "   quello scaricato non va bene, provo la copia di riserva"
else
  echo "   scaricamento non riuscito, provo la copia di riserva"
fi

# 2) La riserva: la copia dentro il progetto, se c'e' ancora. Serve durante il
#    passaggio e come rete di sicurezza se il rilascio non risponde.
if [ -f data.db.gz ]; then
  echo "-> Uso la copia di riserva dentro il progetto"
  if gunzip -c data.db.gz > data.db 2>/dev/null && verifica data.db; then
    echo "== Pronto (copia di riserva) =="
    exit 0
  fi
fi

# 3) Nessuna delle due va: fermarsi qui e' molto meglio che avviare il sito
#    senza archivio, dove ogni pagina risponderebbe con un errore.
echo "!! Nessun archivio utilizzabile. Mi fermo invece di avviare un sito vuoto." >&2
rm -f data.db
exit 1
