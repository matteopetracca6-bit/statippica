import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import HorsePage from "./pages/HorsePage";
import StallionPage from "./pages/StallionPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import AdvisorPage from "./pages/AdvisorPage";
import ValidazionePage from "./pages/ValidazionePage";
import ComparePage from "./pages/ComparePage";
import StudFarmsPage from "./pages/StudFarmsPage";
import AllevamentoHubPage from "./pages/AllevamentoHubPage";
import TrendsPage from "./pages/TrendsPage";
import StallionDirectoryPage from "./pages/StallionDirectoryPage";
import PedigreePage from "./pages/PedigreePage";
// La pagina Cavalli e' stata unita alla Leaderboard: mostravano la stessa
// tabella con filtri diversi, e chi cercava un cavallo per nome doveva
// rinunciare ai filtri della classifica, e viceversa. L'indirizzo resta
// attivo e porta alla pagina unica, per non rompere i collegamenti salvati.
import MaresPage from "./pages/MaresPage";
import MarePage from "./pages/MarePage";
import QualifichePage from "./pages/QualifichePage";
import BreedersPage from "./pages/BreedersPage";
import CalendarPage from "./pages/CalendarPage";
import NotFound from "./pages/not-found";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark">
        <Router hook={useHashLocation}>
          <Layout>
            {/* Se una pagina va in errore, si vede un messaggio al posto suo:
                prima l'intero sito diventava una schermata bianca. */}
            <ErrorBoundary>
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
              <Route path="/trend" component={TrendsPage} />
              <Route path="/pedigree" component={PedigreePage} />
              <Route path="/cavalli" component={LeaderboardPage} />
              <Route path="/fattrici" component={MaresPage} />
              <Route path="/fattrice/:name" component={MarePage} />
              <Route path="/calendario" component={CalendarPage} />
              <Route path="/qualifiche" component={QualifichePage} />
              <Route path="/allevatori" component={AllevamentoHubPage} />
              <Route component={NotFound} />
            </Switch>
            </ErrorBoundary>
          </Layout>
        </Router>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
