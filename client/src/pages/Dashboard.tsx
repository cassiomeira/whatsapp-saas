import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Users, PhoneCall, TrendingUp, FileText, Download, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

import WorkspaceGuard from "@/components/WorkspaceGuard";
export default function Dashboard() {
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<"consulta" | "boleto" | "desbloqueio" | null>(null);
  const { data: workspace } = trpc.workspaces.getCurrent.useQuery();
  const { data: contacts } = trpc.contacts.list.useQuery();
  const { data: conversations } = trpc.conversations.list.useQuery();
  const { data: instances } = trpc.whatsapp.list.useQuery();
  const { data: ixcStats } = trpc.analytics.ixc.useQuery();
  const { data: ixcEvents } = trpc.analytics.ixcEvents.useQuery(
    filterType ? { type: filterType, limit: 50 } : undefined
  );

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
    {
      title: "Consultas IXC",
      value: ixcStats ? `${ixcStats.consulta.success}/${ixcStats.consulta.fail}` : "0/0",
      icon: FileText,
      description: "Sucesso / Falha",
      action: () => { setFilterType("consulta"); setOpen(true); },
    },
    {
      title: "Boletos enviados",
      value: ixcStats ? `${ixcStats.boleto.success}/${ixcStats.boleto.fail}` : "0/0",
      icon: Download,
      description: "Sucesso / Falha",
      action: () => { setFilterType("boleto"); setOpen(true); },
    },
    {
      title: "Desbloqueios",
      value: ixcStats ? `${ixcStats.desbloqueio.success}/${ixcStats.desbloqueio.fail}` : "0/0",
      icon: Unlock,
      description: "Sucesso / Falha",
      action: () => { setFilterType("desbloqueio"); setOpen(true); },
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
              <Card key={stat.title} className="cursor-pointer" onClick={stat.action}>
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {filterType === "boleto"
                  ? "Boletos enviados"
                  : filterType === "desbloqueio"
                  ? "Desbloqueios"
                  : filterType === "consulta"
                  ? "Consultas IXC"
                  : "Eventos IXC"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!ixcEvents || ixcEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {ixcEvents.map(ev => {
                    const contact = contacts?.find(c => c.id === ev.contactId);
                    const contactLabel = contact
                      ? `${contact.name || "Sem nome"} (${contact.whatsappNumber})`
                      : ev.contactId
                      ? `Contato #${ev.contactId}`
                      : "Contato não identificado";
                    return (
                      <Card key={ev.id}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant={ev.status === "success" ? "default" : "destructive"}>
                                  {ev.type} • {ev.status}
                                </Badge>
                                {ev.invoiceId ? <span className="text-xs text-muted-foreground">Fatura: {ev.invoiceId}</span> : null}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                                <span>{contactLabel}</span>
                                {ev.contactId ? (
                                  <Link
                                    href={`/inbox?contact=${ev.contactId}`}
                                    className="text-primary underline"
                                  >
                                    Ver conversa
                                  </Link>
                                ) : null}
                              </div>
                              {ev.message ? (
                                <p className="text-sm">{ev.message}</p>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground text-right">
                              {new Date((ev.createdAt || 0) * 1000).toLocaleString("pt-BR")}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
    </WorkspaceGuard>
  );
}