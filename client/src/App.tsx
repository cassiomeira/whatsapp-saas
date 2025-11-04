import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Contacts from "./pages/Contacts";
import Kanban from "./pages/Kanban";
import WhatsApp from "./pages/WhatsApp";
import BotConfig from "./pages/BotConfig";
import Flows from "./pages/Flows";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import UserManagement from "./pages/UserManagement";
import PendingApproval from "./pages/PendingApproval";
import Products from "./pages/Products";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/onboarding"} component={Onboarding} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/inbox"} component={Inbox} />
      <Route path={"/contacts"} component={Contacts} />
      <Route path={"/kanban"} component={Kanban} />
      <Route path={"/whatsapp"} component={WhatsApp} />
      <Route path={"/products"} component={Products} />
      <Route path={"/bot"} component={BotConfig} />
      <Route path={"/flows"} component={Flows} />
      <Route path={"/campaigns"} component={Campaigns} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/users"} component={UserManagement} />
      <Route path={"/pending"} component={PendingApproval} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

