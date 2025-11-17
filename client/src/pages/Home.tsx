import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      // Se o usuário está logado, redireciona para o dashboard
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return null; // Vai redirecionar
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full text-center space-y-8">
          {/* Logo e Título */}
          <div className="flex flex-col items-center gap-6">
            {APP_LOGO && (
              <img src={APP_LOGO} alt={APP_TITLE} className="w-20 h-20 rounded-xl shadow-lg" />
            )}
            <h1 className="text-5xl font-bold tracking-tight">
              {APP_TITLE}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">
              Plataforma completa de atendimento e automação para WhatsApp com IA
            </p>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold text-lg mb-2">Automação com IA</h3>
              <p className="text-sm text-muted-foreground">
                Bot inteligente que atende seus clientes 24/7
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold text-lg mb-2">CRM Kanban</h3>
              <p className="text-sm text-muted-foreground">
                Gerencie seus leads visualmente
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold text-lg mb-2">Multi-WhatsApp</h3>
              <p className="text-sm text-muted-foreground">
                Vários números na mesma plataforma
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-12">
            <Button 
              size="lg" 
              className="text-lg px-8"
              onClick={() => setLocation(getLoginUrl())}
            >
              Começar Agora
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>© 2025 {APP_TITLE}. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

