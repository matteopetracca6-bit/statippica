import { lazy, Suspense } from "react";
import { Switch, Route, Router } from "wouter";
import { Caricamento } from "./components/Caricamento";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";
import Home from "./pages/Home";
// La pagina Cavalli e' stata unita alla Leaderboard: mostravano la stessa
// tabella con filtri diversi, e chi cercava un cavallo per nome doveva
// rinunciare ai filtri della classifica, e viceversa. L'indirizzo resta
// attivo e porta alla pagina unica, per non rompere i collegamenti salvati.
import NotFound from "./pages/not-found";
import ErrorBoundary from "./components/ErrorBoundary";

// Ogni pagina si scarica solo quando la si apre: prima il sito intero era un
// unico file di oltre un milione di caratteri, da scaricare tutto anche per
// guardare la pagina iniziale (lento soprattutto sul telefono).
const IppodromiTrendPage = lazy(() => import("./pages/IppodromiTrendPage"));
const PareggioPage = lazy(() => import("./pages/PareggioPage"));
const TenerePage = lazy(() => import("./pages/TenerePage"));
const GenerazionePage = lazy(() => import("./pages/GenerazionePage"));
const ScuderiaPage = lazy(() => import("./pages/ScuderiaPage"));
const PuledroPage = lazy(() => import("./pages/PuledroPage"));
const ControlloPage = lazy(() => import("./pages/ControlloPage"));
const HorsePage = lazy(() => import("./pages/HorsePage"));
const StallionPage = lazy(() => import("./pages/StallionPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const AdvisorPage = lazy(() => import("./pages/AdvisorPage"));
const ValidazionePage = lazy(() => import("./pages/ValidazionePage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const StudFarmsPage = lazy(() => import("./pages/StudFarmsPage"));
const AllevamentoHubPage = lazy(() => import("./pages/AllevamentoHubPage"));
const TrendsPage = lazy(() => import("./pages/TrendsPage"));
const StallionDirectoryPage = lazy(() => import("./pages/StallionDirectoryPage"));
const PedigreePage = lazy(() => import("./pages/PedigreePage"));
const MaresPage = lazy(() => import("./pages/MaresPage"));
const MarePage = lazy(() => import("./pages/MarePage"));
const QualifichePage = lazy(() => import("./pages/QualifichePage"));
const BreedersPage = lazy(() => import("./pages/BreedersPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const DriversPage = lazy(() => import("./pages/DriversPage"));
const DriverPage = lazy(() => import("./pages/DriverPage"));
const TracksPage = lazy(() => import("./pages/TracksPage"));
const MetodoPage = lazy(() => import("./pages/MetodoPage"));
const TrackPage = lazy(() => import("./pages/TrackPage"));

// Gli indirizzi possono portare dei parametri dopo il "?" (per esempio
// #/puledro?padre=...): per scegliere la pagina conta solo il percorso, i
// parametri li legge la pagina da window.location.hash.
function useHashSenzaParametri(): [string, (to: string, opts?: any) => void] {
  const [luogo, naviga] = useHashLocation();
  return [luogo.split("?")[0], naviga];
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark">
        <Router hook={useHashSenzaParametri as any}>
          <Layout>
            {/* Se una pagina va in errore, si vede un messaggio al posto suo:
                prima l'intero sito diventava una schermata bianca. */}
            <ErrorBoundary>
            <Suspense fallback={<div className="page-shell"><Caricamento testo="Apro la pagina..." /></div>}>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/horse/:name/:year" component={HorsePage} />
              <Route path="/stallion/:name" component={StallionPage} />
              <Route path="/leaderboard" component={LeaderboardPage} />
              <Route path="/advisor" component={AdvisorPage} />
              <Route path="/validazione" component={ValidazionePage} />
              <Route path="/validazione-advisor" component={ValidazionePage} />
              <Route path="/compare" component={ComparePage} />
              <Route path="/stallioni" component={StallionDirectoryPage} />
              {/* "stalloni" e' la parola giusta: l'indirizzo con la doppia i
                  resta valido per non rompere i link gia' salvati. */}
              <Route path="/stalloni" component={StallionDirectoryPage} />
              <Route path="/allevamento" component={AllevamentoHubPage} />
              <Route path="/allevamenti" component={AllevamentoHubPage} />
              <Route path="/trend" component={IppodromiTrendPage} />
              <Route path="/pedigree" component={PedigreePage} />
              <Route path="/cavalli" component={LeaderboardPage} />
              <Route path="/fattrici" component={MaresPage} />
              <Route path="/fattrice/:name" component={MarePage} />
              <Route path="/calendario" component={CalendarPage} />
              {/* Guidatori e ippodromi: due indirizzi ciascuno, singolare e
                  plurale, perche' e' l'errore di battitura piu' probabile. */}
              <Route path="/guidatori" component={DriversPage} />
              <Route path="/guidatore/:name" component={DriverPage} />
              <Route path="/ippodromi" component={IppodromiTrendPage} />
              <Route path="/pareggio" component={PareggioPage} />
              <Route path="/tenere" component={TenerePage} />
              <Route path="/generazione-m" component={GenerazionePage} />
              <Route path="/aste" component={GenerazionePage} />
              <Route path="/controllo" component={ControlloPage} />
              <Route path="/controllo-a-posteriori" component={ControlloPage} />
              <Route path="/scuderia" component={ScuderiaPage} />
              <Route path="/portafoglio" component={ScuderiaPage} />
              <Route path="/puledro" component={PuledroPage} />
              <Route path="/prezzo-massimo" component={PuledroPage} />
              <Route path="/vendere" component={PuledroPage} />
              <Route path="/break-even" component={PareggioPage} />
              <Route path="/ippodromo/:code" component={TrackPage} />
              <Route path="/piste" component={IppodromiTrendPage} />
              <Route path="/metodo" component={MetodoPage} />
              <Route path="/metodo-e-dati" component={MetodoPage} />
              <Route path="/qualifiche" component={QualifichePage} />
              <Route path="/allevatori" component={AllevamentoHubPage} />
              <Route path="/allevatore/:name" component={AllevamentoHubPage} />
              <Route component={NotFound} />
            </Switch>
            </Suspense>
            </ErrorBoundary>
          </Layout>
        </Router>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
