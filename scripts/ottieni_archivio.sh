#!/usr/bin/env bash
#
# Procura data.db ai lavori automatici, prima che comincino a lavorarci.
#
# PERCHE' ESISTE. L'archivio non sta dentro il progetto: in git ogni versione
# nuova si somma alle precedenti per sempre, e un binario compresso da 30 MB
# che cambia ogni notte non ha nulla in comune con quello di ieri, quindi git
# aggiungeva 30 MB di cronologia a notte (circa 900 MB al mese, 477 MB in tre
# mesi). Ora sta in un rilascio, dove la copia nuova sostituisce la vecchia.
#
# LA TRAPPOLA CHE QUESTO SCRIPT EVITA. Se data.db manca, sqlite3 non da'
# errore: lo CREA vuoto. Un lavoro notturno girerebbe su un archivio vuoto
# senza lamentarsi, e alla fine pubblicherebbe quel vuoto sopra l'archivio
# vero, cancellando tutto in silenzio. Per questo qui si verifica il numero di
# gare, e se non torna si esce con errore: fermarsi costa una notte di
# aggiornamento, procedere costa mesi di raccolta.
#
# Lo usano tutti e quattro i lavori automatici, cosi' la verifica e' una sola
# e non quattro copie che col tempo divergono.

set -uo pipefail

REPO="${GITHUB_REPOSITORY:-matteopetracca6-bit/statippica}"
INDIRIZZO="https://github.com/$REPO/releases/download/archivio/data.db.gz"
BYTE_MINIMI=20000000    # un archivio vero compresso sta sopra i 25 MB
GARE_MINIME=500000      # a settembre 2026 sono oltre 613.000

echo "== Procuro l'archivio =="

ottieni() {
  # 1) La strada normale: il rilascio.
  echo "-> Scarico dal rilascio: $INDIRIZZO"
  if curl -fsSL --retry 3 --retry-delay 5 -m 600 -o /tmp/archivio.gz "$INDIRIZZO"; then
    local byte; byte=$(stat -c%s /tmp/archivio.gz 2>/dev/null || echo 0)
    echo "   scaricati $byte byte"
    if [ "$byte" -ge "$BYTE_MINIMI" ] && gunzip -c /tmp/archivio.gz > data.db 2>/dev/null; then
      return 0
    fi
    echo "   quello scaricato non si apre o e' troppo piccolo"
  else
    echo "   scaricamento non riuscito"
  fi

  # 2) La riserva: una copia dentro il progetto, se per qualche motivo c'e'
  #    ancora (durante il passaggio, o se qualcuno la rimette a mano).
  if [ -f data.db.gz ]; then
    echo "-> Uso la copia di riserva nel progetto"
    gunzip -c data.db.gz > data.db 2>/dev/null && return 0
    echo "   la copia di riserva non si apre"
  fi

  return 1
}

if ! ottieni; then
  echo "::error::Non riesco a procurarmi l'archivio. Mi fermo: lavorare senza archivio lo farebbe ricreare vuoto e pubblicare al posto di quello vero."
  rm -f data.db
  exit 1
fi

# La verifica che conta davvero: quante gare ci sono dentro.
BYTE=$(stat -c%s data.db)
GARE=$(python3 -c "import sqlite3;print(sqlite3.connect('data.db').execute('select count(*) from races').fetchone()[0])" 2>/dev/null || echo 0)
echo "   archivio aperto: $BYTE byte, $GARE gare"

if [ "$GARE" -lt "$GARE_MINIME" ]; then
  echo "::error::l'archivio ha solo $GARE gare, me ne aspetto almeno $GARE_MINIME. Mi fermo per non pubblicare un archivio incompleto sopra quello buono."
  rm -f data.db
  exit 1
fi

echo "== Pronto: $GARE gare =="
