import { colorePista } from "./piste";
/**
 * Le sezioni del sito, in un posto solo.
 *
 * Menu in alto e pagina iniziale mostrano gli stessi gruppi con gli stessi
 * colori: prima la pagina iniziale aveva un suo elenco di riquadri, e ogni
 * pagina nuova andava aggiunta in due posti (e a volte se ne aggiungeva uno).
 */
import { Trophy, Users, BookOpen, Sparkles, GitCompare, Calendar, TrendingUp, Network, Award, Building2,
         FlaskConical, Heart, MapPin, BookMarked, Scale, Gavel, Briefcase, Tag, History, Medal, Timer, GitBranch, Crown, KeyRound, Compass, Flag, Star, Store, Layers } from "lucide-react";

export type Scheda = {
  href: string;
  label: string;
  /** Una riga, per la tendina del menu. */
  nota: string;
  /** Due righe, per la pagina iniziale. */
  descrizione: string;
  icon: typeof Trophy;
  colore: string;
};
export type Gruppo = { nome: string; descrizione: string; icon: typeof Trophy; colore: string; schede: Scheda[] };

// Novembre 2026: da cinque a sei gruppi. Gli stalloni, che avevano ormai
// quattro pagine, hanno un gruppo loro; Allevamento tiene fattrici,
// allevatori e la scelta dell'accoppiamento. L'ordine e' quello d'uso:
// prima cavalli e corse, poi l'allevamento, poi i conti e infine il metodo.
// Novembre 2026: le pagine di un gruppo sono sfumature del colore del gruppo
// (Cavalli tutte gialle, Corse rosse, Stalloni verdi, Allevamento rosa,
// Economia verde acqua, Metodo sabbia). Lo stesso colore lo prende la pagina
// aperta: le pagine lo leggono con coloreScheda().
export const GRUPPI: Gruppo[] = [
  { nome: "Cavalli", icon: Trophy, colore: "hsl(51 80% 55%)",
    descrizione: "Voti, classifiche per età, primi tempi dei giovani e confronti",
    schede: [
    { href: "/leaderboard", label: "Cavalli e classifica", nota: "Tutti i cavalli valutati, con voti e filtri", icon: Trophy, colore: "hsl(51 80% 55%)",
      descrizione: "Tutti i cavalli valutati: cerca per nome o ordina per voto, guadagni e vittorie" },
    { href: "/classifiche-eta", label: "Classifiche per età", nota: "I migliori 2, 3, 4 anni e anziani", icon: Medal, colore: "hsl(43 92% 58%)",
      descrizione: "I migliori 2 anni, 3 anni, 4 anni e anziani per vincite, in carriera o in una sola stagione" },
    { href: "/qualifiche", label: "Qualifiche", nota: "Il primo tempo ufficiale dei giovani", icon: Award, colore: "hsl(57 72% 66%)",
      descrizione: "Il primo tempo ufficiale dei cavalli giovani, prima che debuttino in corsa" },
    { href: "/compare", label: "Comparazione", nota: "Due cavalli uno accanto all'altro", icon: GitCompare, colore: "hsl(46 95% 54%)",
      descrizione: "Confronta due cavalli su statistiche, carriera e genealogia" },
    { href: "/generazioni", label: "Generazioni", nota: "Ogni annata di nascita: voti, premi, andamenti", icon: Layers, colore: "hsl(44 88% 60%)",
      descrizione: "Ogni annata di nascita a confronto, con grafici: nati, chi corre, voti, premi, velocità e campioni" },
    { href: "/seguiti", label: "Cavalli seguiti", nota: "I tuoi cavalli: prossime corse e ultimi arrivi", icon: Star, colore: "hsl(54 88% 62%)",
      descrizione: "I cavalli che segui con la stellina: quando corrono, dove, con chi, e come sono andati" },
  ] },
  { nome: "Corse", icon: Calendar, colore: "hsl(0 60% 55%)",
    descrizione: "Calendario con i pronostici, piste italiane, guidatori, allenatori e proprietari",
    schede: [
    { href: "/calendario", label: "Calendario", nota: "Prossime gare con iscritti e voti", icon: Calendar, colore: "hsl(0 62% 56%)",
      descrizione: "Prossime gare con iscritti, voti e probabilità di arrivare nei primi tre" },
    { href: "/simulatore", label: "Simulatore", nota: "La corsa simulata dal vivo, o mille volte", icon: Flag, colore: "hsl(355 72% 62%)",
      descrizione: "Una corsa in programma o già corsa simulata sulla pista: velocità, penalità, corda, galoppi e squalifiche, anche mille volte di fila" },
    { href: "/ippodromi", label: "Ippodromi e Gran Premi", nota: "Piste, albo d'oro delle grandi corse e trend", icon: MapPin, colore: "hsl(352 68% 64%)",
      descrizione: "Le piste italiane, quanto pesa il numero di partenza, i vincitori dei Gran Premi dal 2014 e come cambiano i numeri negli anni" },
    { href: "/guidatori", label: "Guidatori", nota: "Chi fa rendere di più i cavalli", icon: Users, colore: "hsl(10 72% 60%)",
      descrizione: "Chi porta i cavalli a rendere più del loro solito, a parità di cavallo e di partenza" },
    { href: "/allenatori", label: "Allenatori", nota: "Corse, vittorie, premi e cavalli dal 2016", icon: Timer, colore: "hsl(2 48% 70%)",
      descrizione: "Chi allena i cavalli: corse, vittorie, premi, scuderia e Gran Premi vinti dal 2016" },
    { href: "/proprietari", label: "Proprietari", nota: "Scuderie: cavalli, vittorie e premi dal 2016", icon: KeyRound, colore: "hsl(18 62% 66%)",
      descrizione: "Chi possiede i cavalli: corse, vittorie, premi, premi a cavallo all'anno, allenatori e Gran Premi dal 2016" },
  ] },
  { nome: "Stalloni", icon: Crown, colore: "hsl(120 60% 50%)",
    descrizione: "Catalogo, generazioni, classifiche dei figli e genealogia",
    schede: [
    { href: "/stalloni", label: "Catalogo stalloni", nota: "Catalogo, prezzi di monta e confronto", icon: BookOpen, colore: "hsl(120 60% 50%)",
      descrizione: "Tutti gli stalloni valutati, con prezzi di monta, allevamenti e provenienza" },
    { href: "/stalloni/albero", label: "Albero degli stalloni", nota: "Papà, nonni, bisnonni: le generazioni", icon: GitBranch, colore: "hsl(138 52% 52%)",
      descrizione: "Gli stalloni divisi per generazione, con anno di nascita, anni in monta e linea paterna" },
    { href: "/stalloni/classifiche", label: "Classifiche stalloni", nota: "La stagione dei figli e i nipoti", icon: Crown, colore: "hsl(102 55% 56%)",
      descrizione: "Gli stalloni stagione per stagione: figli in corsa, vincite, tempi, e quanto vincono i nipoti" },
    { href: "/pedigree", label: "Pedigree", nota: "Albero genealogico fino alla quinta generazione", icon: Network, colore: "hsl(150 42% 63%)",
      descrizione: "Albero genealogico fino alla quinta generazione, con consanguineità e incroci ripetuti" },
  ] },
  { nome: "Allevamento", icon: Building2, colore: "hsl(330 65% 62%)",
    descrizione: "Fattrici, allevatori e la scelta dell'accoppiamento",
    schede: [
    { href: "/fattrici", label: "Fattrici", nota: "Fattrici valutate sui figli", icon: Heart, colore: "hsl(330 65% 62%)",
      descrizione: "Fattrici valutate sui figli: figli di vertice, guadagni medi e carriera della madre" },
    { href: "/allevamento", label: "Allevatori e stazioni di monta", nota: "Chi alleva e dove stanno gli stalloni", icon: Building2, colore: "hsl(318 52% 58%)",
      descrizione: "Allevatori e stazioni di monta in un'unica scheda, con la qualità media della produzione" },
    { href: "/allevatori/classifiche", label: "Classifica allevatori", nota: "Gli allevamenti stagione per stagione", icon: Medal, colore: "hsl(342 72% 67%)",
      descrizione: "Gli allevamenti stagione per stagione: cavalli in corsa, vittorie, vincite e media a cavallo, per età" },
    { href: "/advisor", label: "Advisor", nota: "Scegli l'accoppiamento per una fattrice", icon: Sparkles, colore: "hsl(306 45% 67%)",
      descrizione: "Simula accoppiamenti, costi e ritorni, e controlla la consanguineità" },
  ] },
  { nome: "Economia", icon: Scale, colore: "hsl(160 60% 50%)",
    descrizione: "Costi, premi attesi, prezzo dei puledri e rischio della scuderia",
    schede: [
    { href: "/puledro", label: "Prima di correre", nota: "Un puledro: quanto pagarlo, venderlo, un incrocio", icon: Tag, colore: "hsl(160 60% 50%)",
      descrizione: "Un puledro che non ha ancora corso: il prezzo massimo, se conviene venderlo e se un incrocio si ripaga" },
    { href: "/tenere", label: "In corsa", nota: "Lo tengo o lo fermo: i prossimi 12 mesi", icon: TrendingUp, colore: "hsl(160 60% 50%)",
      descrizione: "Per ogni cavallo in attività: premi attesi nei prossimi 12 mesi contro la spesa di un anno" },
    { href: "/scuderia", label: "La tua scuderia", nota: "I tuoi cavalli insieme: cassa, rischio e valore", icon: Briefcase, colore: "hsl(160 60% 50%)",
      descrizione: "Entrate e spese dei prossimi 12 mesi, rischio della scuderia, valore di carriera e offerte" },
    { href: "/rende", label: "Chi rende di più", nota: "Stalloni, allenatori, ippodromi e aste in fila", icon: Trophy, colore: "hsl(160 60% 50%)",
      descrizione: "Chi rende di più fra stalloni, allenatori, ippodromi e puledri d'asta: numeri misurati, non previsioni" },
    { href: "/mercato", label: "Mercato", nota: "Aste 2026, generazione M, quanto rende ogni voto", icon: Store, colore: "hsl(160 60% 50%)",
      descrizione: "I dati, senza calcolatori: le aste lotto per lotto, i nati 2025 e il cavallo tipico di ogni voto contro i costi" },
  ] },
  { nome: "Metodo", icon: BookMarked, colore: "hsl(40 40% 72%)",
    descrizione: "Da dove vengono i numeri e le prove che le stime funzionano",
    schede: [
    { href: "/metodo", label: "Metodo e dati", nota: "Da dove vengono i numeri e come si leggono", icon: BookMarked, colore: "hsl(40 40% 72%)",
      descrizione: "Da dove vengono i numeri, come si calcola ogni voto e quando si è aggiornato l'archivio" },
    { href: "/controllo", label: "Controllo a posteriori", nota: "Le stime rifatte nel passato, contro com'è andata", icon: History, colore: "hsl(33 38% 62%)",
      descrizione: "Le stime rifatte con i soli dati di una data passata, confrontate con com'è andata davvero" },
    { href: "/validazione", label: "Verifica Advisor", nota: "Il consiglio di accoppiamento messo alla prova", icon: FlaskConical, colore: "hsl(46 48% 80%)",
      descrizione: "Il consiglio di accoppiamento provato su puledri mai visti: perché resta sperimentale" },
  ] },
];

/**
 * Il colore di una pagina, per i suoi riquadri. Ogni pagina prende il colore
 * che ha nel menu e nella pagina iniziale; le schede di dettaglio prendono
 * quello dell'elenco da cui si arriva (un cavallo come la classifica, uno
 * stallone come gli stalloni, ...). Anche gli indirizzi vecchi, che portano
 * alla stessa pagina, hanno il suo colore.
 */
const ALIAS: Record<string, string> = {
  "/horse": "/leaderboard", "/cavalli": "/leaderboard",
  "/stallion": "/stalloni", "/stallioni": "/stalloni",
  "/fattrice": "/fattrici",
  "/allevamenti": "/allevamento", "/allevatori": "/allevamento", "/allevatore": "/allevamento",
  "/validazione-advisor": "/validazione",
  "/trend": "/ippodromi", "/piste": "/ippodromi", "/ippodromo": "/ippodromi",
  "/guidatore": "/guidatori",
  "/allenatore": "/allenatori",
  "/proprietario": "/proprietari",
  "/controllo-a-posteriori": "/controllo",
  "/portafoglio": "/scuderia",
  "/prezzo-massimo": "/puledro", "/vendere": "/puledro", "/economia": "/puledro",
  "/break-even": "/mercato", "/pareggio": "/mercato", "/chi-rende": "/rende", "/annate": "/generazioni",
  "/aste": "/mercato", "/generazione-m": "/mercato",
  "/metodo-e-dati": "/metodo",
  "/gran-premi": "/ippodromi", "/albo-doro": "/ippodromi", "/palmares": "/ippodromi",
};
export function coloreDiPagina(percorso: string): string | null {
  const pezzi = percorso.split("?")[0].split("/");
  const primo = "/" + (pezzi[1] ?? "");
  // La scheda di un ippodromo prende il colore di quell'ippodromo.
  if (primo === "/ippodromo" && pezzi[2]) return colorePista(decodeURIComponent(pezzi[2]));
  const href = ALIAS[primo] ?? primo;
  for (const g of GRUPPI) for (const sc of g.schede) if (sc.href === href) return sc.colore;
  return null;
}

/** Il colore di una pagina del menu, per usarlo dentro la pagina stessa. */
export function coloreScheda(href: string): string {
  for (const g of GRUPPI) for (const sc of g.schede) if (sc.href === href) return sc.colore;
  return "hsl(183 70% 55%)";
}
