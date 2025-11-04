import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Users, PhoneCall, TrendingUp } from "lucide-react";

import WorkspaceGuard from "@/components/WorkspaceGuard";
export default function Dashboard() {
  const { data: workspace } = trpc.workspaces.getCurrent.useQuery();
  const { data: contacts } = trpc.contacts.list.useQuery();
  const { data: conversations } = trpc.conversations.list.useQuery();
  const { data: instances } = trpc.whatsapp.list.useQuery();

  const stats = [
    {
      title: "Total de Contatos",
      value: contacts?.length || 0,
      icon: Users,
      description: "Leads cadastrados",
    },
    {
      title: "Conversas Ativas",
      value: conversations?.filter(c => c.status !== "closed").length || 0,
      icon: MessageSquare,
      description: "Em andamento",
    },
    {
      title: "Instâncias WhatsApp",
      value: instances?.filter(i => i.status === "connected").length || 0,
      icon: PhoneCall,
      description: "Conectadas",
    },
    {
      title: "Taxa de Conversão",
      value: "0%",
      icon: TrendingUp,
      description: "Últimos 30 dias",
    },
  ];

  return (
    <WorkspaceGuard>
      <DashboardLayout>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Bem-vindo ao {workspace?.name || "seu workspace"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Atividade Recente</CardTitle>
              <CardDescription>
                Últimas conversas e interações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Nenhuma atividade recente
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status do Sistema</CardTitle>
              <CardDescription>
                Conexões e serviços
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">WhatsApp</span>
                  <span className="text-sm text-muted-foreground">
                    {instances?.some(i => i.status === "connected") 
                      ? "✓ Conectado" 
                      : "○ Desconectado"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Bot IA</span>
                  <span className="text-sm text-muted-foreground">✓ Ativo</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
    </WorkspaceGuard>
  );
}