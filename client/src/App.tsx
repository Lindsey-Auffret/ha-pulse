import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import AppShell from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Compare from "@/pages/Compare";
import Stocks from "@/pages/Stocks";
import Correlation from "@/pages/Correlation";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppShell>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/compare" component={Compare} />
            <Route path="/stocks" component={Stocks} />
            <Route path="/correlation" component={Correlation} />
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
