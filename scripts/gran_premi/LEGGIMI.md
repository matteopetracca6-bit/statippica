# Albo d'oro dei grandi premi

Come si rifà la tabella `client/src/data/granPremi.ts`:

1. `1_raccogli_giornate.py` – per ogni giornata con premi alti nell'archivio, legge le
   giornate ufficiali su database.grandeippicaitaliana.it (nome della corsa, vincitore).
2. `2_cerca_mancanti.py` – per le edizioni non trovate, rilegge i giorni vicini alle
   date degli altri anni.
3. `3_riconosci_gare.py` – riconosce le 15 corse dal nome (esclude batterie, consolazioni).
4. `4_albo_finale.py` – aggiunge 2014-2015 dagli albi d'oro (il database ufficiale parte
   dal 2016), driver e tempo dall'archivio, e scrive i dati.

Gli script lavorano in /tmp/gp (cache delle pagine) e leggono l'archivio in sola lettura.
5. `5_scrivi_ts.py` – scrive il file per il sito (da lanciare dalla cartella del progetto).
