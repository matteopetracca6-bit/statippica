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
import ComparePage from "./pages/ComparePage";
import StudFarmsPage from "./pages/StudFarmsPage";
import AllevamentoHubPage from "./pages/AllevamentoHubPage";
import TrendsPage from "./pages/TrendsPage";
import StallionDirectoryPage from "./pages/StallionDirectoryPage";
import PedigreePage from "./pages/PedigreePage";
import HorsesPage from "./pages/HorsesPage";
import MaresPage from "./pages/MaresPage";
import MarePage from "./pages/MarePage";
import QualifichePage from "./pages/QualifichePage";
import BreedersPage from "./pages/BreedersPage";
import CalendarPage from "./pages/CalendarPage";
import NotFound from "./pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark">
        <Router hook={useHashLocation}>
          <Layout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/horse/:name/:year" component={HorsePage} />
              <Route path="/stallion/:name" component={StallionPage} />
              <Route path="/leaderboard" component={LeaderboardPage} />
              <Route path="/advisor" component={AdvisorPage} />
              <Route path="/compare" component={ComparePage} />
              <Route path="/stallioni" component={StallionDirectoryPage} />
              <Route path="/allevamento" component={AllevamentoHubPage} />
              <Route path="/allevamenti" component={AllevamentoHubPage} />
              <Route path="/trend" component={TrendsPage} />
              <Route path="/pedigree" component={PedigreePage} />
              <Route path="/cavalli" component={HorsesPage} />
              <Route path="/fattrici" component={MaresPage} />
              <Route path="/fattrice/:name" component={MarePage} />
              <Route path="/calendario" component={CalendarPage} />
              <Route path="/qualifiche" component={QualifichePage} />
              <Route path="/allevatori" component={AllevamentoHubPage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Router>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
