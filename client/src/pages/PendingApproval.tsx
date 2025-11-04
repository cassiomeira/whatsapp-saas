import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Clock, Mail } from "lucide-react";

export default function PendingApproval() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
            <Clock className="w-10 h-10 text-orange-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Aguardando Aprovação</h1>
          <p className="text-muted-foreground">
            Olá, <strong>{user?.name || user?.email}</strong>!
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm">
            Sua conta foi criada com sucesso, mas ainda está{" "}
            <strong>aguardando aprovação</strong> do administrador.
          </p>
          <p className="text-sm text-muted-foreground">
            Você receberá uma notificação assim que sua conta for aprovada.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Mail className="w-4 h-4" />
          <span>Entraremos em contato em breve</span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => logout()}
        >
          Sair
        </Button>

        <p className="text-xs text-muted-foreground">
          Precisa de ajuda? Entre em contato com o administrador.
        </p>
      </div>
    </div>
  );
}

