import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Onboarding() {
  const { user } = useAuth();
  const [workspaceName, setWorkspaceName] = useState("");
  const [, setLocation] = useLocation();
  const createWorkspace = trpc.workspaces.create.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceName.trim()) {
      toast.error("Por favor, insira um nome para o workspace");
      return;
    }

    try {
      await createWorkspace.mutateAsync({ name: workspaceName });
      
      // Invalidar cache do usuário para recarregar com o novo workspaceId
      await utils.auth.me.invalidate();
      
      toast.success("Workspace criado com sucesso!");
      setLocation("/dashboard");
    } catch (error) {
      toast.error("Erro ao criar workspace");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {APP_LOGO && (
              <img src={APP_LOGO} alt={APP_TITLE} className="w-16 h-16 rounded-xl shadow-lg" />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl">Bem-vindo ao {APP_TITLE}!</CardTitle>
            <CardDescription className="mt-2">
              Olá, {user?.name}! Vamos criar seu workspace para começar.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Nome do Workspace</Label>
              <Input
                id="workspaceName"
                placeholder="Ex: Minha Empresa"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={createWorkspace.isPending}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Este será o nome da sua conta na plataforma
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={createWorkspace.isPending}
            >
              {createWorkspace.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Workspace"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

