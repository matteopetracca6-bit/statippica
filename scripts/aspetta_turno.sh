#!/usr/bin/env bash
#
# Fa aspettare il proprio turno ai lavori che pubblicano l'archivio.
#
# PERCHE' ESISTE. Ogni lavoro scarica l'archivio, ci lavora e alla fine lo
# ripubblica intero. Se due lavori girano insieme, l'ultimo che finisce
# pubblica la SUA copia, che non contiene quello che ha fatto l'altro: il
# lavoro del primo sparisce senza nessun errore. Succede facilmente, perche'
# GitHub fa partire i lavori a orario anche con ore di ritardo e finiscono
# per sovrapporsi.
#
# COME FUNZIONA. Prima di scaricare l'archivio, il lavoro guarda se ce n'e'
# un altro della stessa famiglia gia' in corso e partito prima di lui. Se si',
# aspetta che finisca, poi scarica l'archivio aggiornato da quello. Chi e'
# partito per primo non aspetta nessuno, quindi non si bloccano mai a vicenda.
#
# Non si usa il "concurrency" di GitHub perche' tiene in coda un solo lavoro
# per volta e cancella gli altri: un notturno cancellato in silenzio e' proprio
# il tipo di buco che si vuole evitare.

set -uo pipefail

REPO="${GITHUB_REPOSITORY:-matteopetracca6-bit/statippica}"
MIO="${GITHUB_RUN_ID:-}"
ATTESA_MASSIMA_MIN="${ATTESA_MASSIMA_MIN:-330}"
# I lavori che ripubblicano l'archivio. Chi lo legge soltanto non conta.
FAMIGLIA='nightly-results|nightly-maintenance|nightly-pedigree|weekly-stallion-catalog|archivio-'

if [ -z "$MIO" ] || [ -z "${GH_TOKEN:-}" ]; then
  echo "Fuori da GitHub o senza permesso di lettura: non controllo il turno."
  exit 0
fi

MIA_PARTENZA=$(gh api "repos/$REPO/actions/runs/$MIO" -q .run_started_at)
MIO_PERCORSO=$(gh api "repos/$REPO/actions/runs/$MIO" -q .path)
if ! echo "$MIO_PERCORSO" | grep -qE "$FAMIGLIA"; then
  echo "Questo lavoro legge l'archivio ma non lo pubblica: non serve aspettare."
  exit 0
fi
echo "== Aspetto il turno (partito alle $MIA_PARTENZA) =="

# Chi e' in corso prima di me. Si leggono gli ultimi lavori SENZA il filtro
# "in corso" di GitHub e si guarda lo stato di ciascuno: il 30/09 quel filtro
# ha omesso per un momento un lavoro ancora aperto, e chi aspettava e' partito
# troppo presto (il suo lavoro e' stato poi coperto da quello dell'altro).
# Stampa i lavori della famiglia partiti prima di me e non ancora finiti.
# Se GitHub non risponde stampa un segnaposto: meglio aspettare che partire
# alla cieca.
prima_di_me() {
  local grezzo
  if ! grezzo=$(gh api "repos/$REPO/actions/runs?per_page=100" \
      -q ".workflow_runs[] | select(.id != $MIO and .status != \"completed\") | [.id, .path, .run_started_at, .name] | @tsv" 2>/dev/null); then
    printf "x\tx\tx\t(GitHub non risponde)\n"; return
  fi
  echo "$grezzo" | grep -E "$FAMIGLIA" \
    | awk -F'\t' -v t="$MIA_PARTENZA" -v mio="$MIO" '$3 < t || ($3 == t && $1 < mio)' || true
}

INIZIO=$(date +%s)
while true; do
  PRIMA_DI_ME=$(prima_di_me)
  if [ -z "$PRIMA_DI_ME" ]; then
    # Conferma: deve risultare libero due volte di fila, a mezzo minuto.
    sleep 30
    PRIMA_DI_ME=$(prima_di_me)
  fi
  if [ -z "$PRIMA_DI_ME" ]; then
    echo "   nessun altro lavoro in corso: tocca a me."
    exit 0
  fi
  PASSATI=$(( ($(date +%s) - INIZIO) / 60 ))
  if [ "$PASSATI" -ge "$ATTESA_MASSIMA_MIN" ]; then
    echo "::error::aspetto da $PASSATI minuti un altro lavoro che non finisce. Mi fermo per non sovrascrivere il suo archivio."
    exit 1
  fi
  echo "   in corso prima di me: $(echo "$PRIMA_DI_ME" | cut -f4 | paste -sd ', ') - riprovo fra un minuto ($PASSATI min)"
  sleep 60
done
