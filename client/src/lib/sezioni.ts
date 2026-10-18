/**
 * Le sezioni del sito, in un posto solo.
 *
 * Menu in alto e pagina iniziale mostrano gli stessi gruppi con gli stessi
 * colori: prima la pagina iniziale aveva un suo elenco di riquadri, e ogni
 * pagina nuova andava aggiunta in due posti (e a volte se ne aggiungeva uno).
 */
import { Trophy, Users, BookOpen, Sparkles, GitCompare, Calendar, TrendingUp, Network, Award, Building2,
         FlaskConical, Heart, MapPin, BookMarked, Scale, Gavel, Briefcase, Tag, History } from "lucide-react";

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

export const GRUPPI: Gruppo[] = [
  { nome: "Cavalli", icon: Trophy, colore: "hsl(51 80% 55%)",
    descrizione: "Voti, classifiche, primi tempi dei giovani, confronti e genealogia",
    schede: [
    { href: "/leaderboard", label: "Cavalli e classifica", nota: "Tutti i cavalli valutati, con voti e filtri", icon: Trophy, colore: "hsl(51 80% 55%)",
      descrizione: "Tutti i cavalli valutati: cerca per nome o ordina per voto, guadagni e vittorie" },
    { href: "/qualifiche", label: "Qualifiche", nota: "Il primo tempo ufficiale dei giovani", icon: Award, colore: "hsl(280 60% 62%)",
      descrizione: "Il primo tempo ufficiale dei cavalli giovani, prima che debuttino in corsa" },
    { href: "/compare", label: "Comparazione", nota: "Due cavalli uno accanto all'altro", icon: GitCompare, colore: "hsl(30 80% 55%)",
      descrizione: "Confronta due cavalli su statistiche, carriera e genealogia" },
    { href: "/pedigree", label: "Pedigree", nota: "Albero genealogico fino a 5 generazioni", icon: Network, colore: "hsl(220 60% 60%)",
      descrizione: "Albero genealogico fino a 5 generazioni, con consanguineità e incroci ripetuti" },
  ] },
  { nome: "Allevamento", icon: Building2, colore: "hsl(120 60% 50%)",
    descrizione: "Stalloni, fattrici, allevatori e la scelta dell'accoppiamento",
    schede: [
    { href: "/stalloni", label: "Stalloni", nota: "Catalogo, prezzi di monta e confronto", icon: BookOpen, colore: "hsl(120 60% 50%)",
      descrizione: "Tutti gli stalloni valutati, con prezzi di monta, allevamenti e provenienza" },
    { href: "/fattrici", label: "Fattrici", nota: "Fattrici valutate sui figli", icon: Heart, colore: "hsl(330 70% 58%)",
      descrizione: "Fattrici valutate sui figli: figli di vertice, guadagni medi e carriera della madre" },
    { href: "/allevamento", label: "Allevatori e stazioni di monta", nota: "Chi alleva e dove stanno gli stalloni", icon: Building2, colore: "hsl(20 70% 58%)",
      descrizione: "Allevatori e stazioni di monta in un'unica scheda, con la qualità media della produzione" },
    { href: "/advisor", label: "Advisor", nota: "Scegli l'accoppiamento per una fattrice", icon: Sparkles, colore: "hsl(280 60% 60%)",
      descrizione: "Simula accoppiamenti, costi e ritorni, e controlla la consanguineità" },
  ] },
  { nome: "Economia", icon: Scale, colore: "hsl(160 60% 50%)",
    descrizione: "Costi, premi attesi, prezzo dei puledri e rischio della scuderia",
    schede: [
    { href: "/scuderia", label: "La tua scuderia", nota: "I tuoi cavalli insieme: cassa, rischio e valore", icon: Briefcase, colore: "hsl(190 65% 52%)",
      descrizione: "Entrate e spese dei prossimi 12 mesi, rischio della scuderia e valore di carriera" },
    { href: "/puledro", label: "Quanto vale un puledro", nota: "Prezzo massimo per comprare, o se conviene vendere", icon: Tag, colore: "hsl(25 75% 58%)",
      descrizione: "Il prezzo massimo da pagare, caso per caso dal campione al non corre, o se conviene venderlo" },
    { href: "/generazione-m", label: "Aste e generazione M", nota: "I puledri delle aste 2026 con il prezzo massimo", icon: Gavel, colore: "hsl(38 80% 58%)",
      descrizione: "I nati 2025 e i puledri delle aste 2026, con il prezzo massimo di ogni lotto" },
    { href: "/tenere", label: "Tenere o fermare", nota: "Premi attesi e spese per ogni cavallo in attività", icon: TrendingUp, colore: "hsl(145 55% 52%)",
      descrizione: "Per ogni cavallo in attività: premi attesi nei prossimi 12 mesi contro le spese" },
    { href: "/pareggio", label: "Punto di pareggio", nota: "Quanto costa un cavallo, voti e incroci", icon: Scale, colore: "hsl(160 60% 50%)",
      descrizione: "Quanto deve vincere un cavallo per ripagarsi: per voto, per cavallo e per incrocio" },
  ] },
  { nome: "Corse", icon: Calendar, colore: "hsl(0 60% 55%)",
    descrizione: "Calendario con i pronostici, piste italiane e guidatori",
    schede: [
    { href: "/calendario", label: "Calendario", nota: "Prossime gare con iscritti e voti", icon: Calendar, colore: "hsl(0 60% 55%)",
      descrizione: "Prossime gare con iscritti, voti e probabilità di arrivare nei primi tre" },
    { href: "/ippodromi", label: "Ippodromi e trend", nota: "Le piste italiane e i numeri negli anni", icon: MapPin, colore: "hsl(95 55% 52%)",
      descrizione: "Le piste italiane, quanto pesa il numero di partenza e come cambiano i numeri negli anni" },
    { href: "/guidatori", label: "Guidatori", nota: "Chi fa rendere di più i cavalli", icon: Users, colore: "hsl(200 70% 58%)",
      descrizione: "Chi porta i cavalli a rendere più del loro solito, a parità di cavallo e di partenza" },
  ] },
  { nome: "Metodo", icon: BookMarked, colore: "hsl(40 40% 72%)",
    descrizione: "Da dove vengono i numeri e le prove che le stime funzionano",
    schede: [
    { href: "/metodo", label: "Metodo e dati", nota: "Da dove vengono i numeri e come si leggono", icon: BookMarked, colore: "hsl(40 40% 72%)",
      descrizione: "Da dove vengono i numeri, come si calcola ogni voto e quando si è aggiornato l'archivio" },
    { href: "/controllo", label: "Controllo a posteriori", nota: "Le stime rifatte nel passato, contro com'è andata", icon: History, colore: "hsl(265 45% 68%)",
      descrizione: "Le stime rifatte con i soli dati di una data passata, confrontate con com'è andata davvero" },
    { href: "/validazione", label: "Verifica Advisor", nota: "Il consiglio di accoppiamento messo alla prova", icon: FlaskConical, colore: "hsl(183 70% 52%)",
      descrizione: "Il consiglio di accoppiamento provato su puledri mai visti: perché resta sperimentale" },
  ] },
];
