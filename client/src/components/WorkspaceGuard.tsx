import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";

interface WorkspaceGuardProps {
  children: ReactNode;
}

export default function WorkspaceGuard({ children }: WorkspaceGuardProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user && !user.workspaceId) {
      // Usuário logado mas sem workspace, redireciona para onboarding
      setLocation("/onboarding");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Não logado, deixa o DashboardLayout lidar com isso
    return <>{children}</>;
  }

  if (!user.workspaceId) {
    // Vai redirecionar para onboarding
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

