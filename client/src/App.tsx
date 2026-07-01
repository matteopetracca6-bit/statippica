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
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Router>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
