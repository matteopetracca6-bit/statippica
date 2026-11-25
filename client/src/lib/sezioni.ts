import { colorePista } from "./piste";
/**
 * Le sezioni del sito, in un posto solo.
 *
 * Menu in alto e pagina iniziale mostrano gli stessi gruppi con gli stessi
 * colori: prima la pagina iniziale aveva un suo elenco di riquadri, e ogni
 * pagina nuova andava aggiunta in due posti (e a volte se ne aggiungeva uno).
 */
import { Trophy, Users, BookOpen, Sparkles, GitCompare, Calendar, Network, Award, Building2, FlaskConical, Heart, MapPin, BookMarked, Scale, Briefcase, History, Medal, Timer, GitBranch, Crown, KeyRound, Flag, Star, Layers, Calculator, Target } from "lucide-react";

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
    { href: "/qualifiche", label: "Qualifiche", nota: "Il primo tempo ufficiale dei giovani", icon: Award, colore: "hsl(57 72% 66%)",
      descrizione: "Il primo tempo ufficiale dei cavalli giovani, prima che debuttino in corsa" },
    { href: "/compare", label: "Comparazione", nota: "Due cavalli uno accanto all'altro", icon: GitCompare, colore: "hsl(46 95% 54%)",
      descrizione: "Confronta due cavalli su statistiche, carriera e genealogia" },
    { href: "/generazioni", label: "Generazioni ed età", nota: "Le annate di nascita e i migliori 2, 3, 4 anni e anziani", icon: Layers, colore: "hsl(44 88% 60%)",
      descrizione: "Ogni annata di nascita a confronto, con grafici, e le classifiche per età: in carriera o in una sola stagione" },
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
    { href: "/guidatori", label: "Guidatori, allenatori e proprietari", nota: "Chi guida, chi allena e chi possiede: classifiche e schede", icon: Users, colore: "hsl(10 72% 60%)",
      descrizione: "Chi porta i cavalli a rendere più del loro solito, a parità di cavallo e di partenza" },
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
    { href: "/allevamento", label: "Allevatori", nota: "Chi alleva, stazioni di monta e classifica stagione per stagione", icon: Building2, colore: "hsl(318 52% 58%)",
      descrizione: "Allevatori e stazioni di monta in un'unica scheda, con la qualità media della produzione" },
    { href: "/advisor", label: "Advisor", nota: "Scegli l'accoppiamento per una fattrice, e quanto è affidabile", icon: Sparkles, colore: "hsl(306 45% 67%)",
      descrizione: "Simula accoppiamenti, costi e ritorni, e controlla la consanguineità" },
  ] },
  { nome: "Economia", icon: Scale, colore: "hsl(160 60% 50%)",
    descrizione: "Costi, premi attesi, prezzo dei puledri e rischio della scuderia",
    schede: [
    { href: "/conto", label: "Fai il conto", nota: "Un puledro o un cavallo: conviene?", icon: Calculator, colore: "hsl(160 60% 50%)",
      descrizione: "Hai un puledro o un cavallo che corre? Quanto pagarlo, se venderlo, se tenerlo: una risposta sola, con le tue spese" },
    { href: "/rende", label: "Chi rende di più", nota: "Stalloni, allenatori, ippodromi e aste in fila", icon: Trophy, colore: "hsl(160 60% 50%)",
      descrizione: "Stalloni, allenatori, ippodromi, aste e voti messi in fila per quanto rendono davvero, e chi fa meglio del previsto" },
    { href: "/scuderia", label: "La tua scuderia", nota: "I tuoi cavalli insieme: cassa, rischio e valore", icon: Briefcase, colore: "hsl(160 60% 50%)",
      descrizione: "Entrate e spese dei prossimi 12 mesi, rischio della scuderia, valore di carriera e offerte" },
  ] },
  { nome: "Metodo", icon: BookMarked, colore: "hsl(40 40% 72%)",
    descrizione: "Da dove vengono i numeri e le prove che le stime funzionano",
    schede: [
    { href: "/metodo", label: "Metodo", nota: "Dati, come si fa il pronostico e controllo a posteriori", icon: BookMarked, colore: "hsl(40 40% 72%)",
      descrizione: "Da dove vengono i numeri, come si calcola ogni voto e quando si è aggiornato l'archivio" },
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
  "/validazione-advisor": "/advisor", "/allevatori/classifiche": "/allevamento", "/metodo/pronostico": "/metodo",
  "/trend": "/ippodromi", "/piste": "/ippodromi", "/ippodromo": "/ippodromi",
  "/guidatore": "/guidatori",
  "/allenatore": "/guidatori", "/allenatori": "/guidatori",
  "/proprietario": "/guidatori", "/proprietari": "/guidatori",
  "/controllo-a-posteriori": "/metodo", "/controllo": "/metodo", "/come-si-fa-il-pronostico": "/metodo", "/validazione": "/advisor",
  "/portafoglio": "/scuderia",
  "/prezzo-massimo": "/conto", "/vendere": "/conto", "/economia": "/conto", "/puledro": "/conto", "/tenere": "/conto",
  "/break-even": "/rende", "/pareggio": "/rende", "/mercato": "/rende", "/chi-rende": "/rende", "/annate": "/generazioni",
  "/aste": "/rende", "/generazione-m": "/generazioni", "/classifiche-eta": "/generazioni", "/sopra-previsto": "/rende",
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
  // Le pagine diventate linguette di un'altra (25/11/2026) prendono il suo colore.
  const h = ALIAS[href] ?? href;
  for (const g of GRUPPI) for (const sc of g.schede) if (sc.href === h) return sc.colore;
  return "hsl(183 70% 55%)";
}
