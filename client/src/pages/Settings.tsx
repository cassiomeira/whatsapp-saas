import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Settings as SettingsIcon, Webhook, Key, Server, Building2 } from "lucide-react";

export default function Settings() {
  const { data: workspace } = trpc.workspaces.getCurrent.useQuery();
  const updateWorkspace = trpc.workspaces.update.useMutation();
  
  // Evolution API Config
  const [evolutionUrl, setEvolutionUrl] = useState("http://localhost:8080");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  
  // IXC Soft Config
  const [ixcUrl, setIxcUrl] = useState("");
  const [ixcToken, setIxcToken] = useState("");
  
  // Workspace Config
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name);
      // Carregar configs da Evolution API se existirem
      const metadata = (workspace as any).metadata || {};
      if (metadata?.evolutionApiUrl) {
        setEvolutionUrl(metadata.evolutionApiUrl);
      }
      if (metadata?.evolutionApiKey) {
        setEvolutionKey(metadata.evolutionApiKey);
      }
      if (metadata?.webhookUrl) {
        setWebhookUrl(metadata.webhookUrl);
      }
      if (metadata?.ixcApiUrl) {
        setIxcUrl(metadata.ixcApiUrl);
      }
      if (metadata?.ixcApiToken) {
        setIxcToken(metadata.ixcApiToken);
      }
    }
  }, [workspace]);

  const handleSaveWorkspace = async () => {
    if (!workspaceName.trim()) {
      toast.error("Digite um nome para o workspace");
      return;
    }

    try {
      await updateWorkspace.mutateAsync({
        name: workspaceName,
      });
      toast.success("Workspace atualizado!");
    } catch (error) {
      toast.error("Erro ao atualizar workspace");
    }
  };

  const handleSaveEvolutionConfig = async () => {
    if (!evolutionUrl.trim() || !evolutionKey.trim()) {
      toast.error("Preencha a URL e a API Key");
      return;
    }

    if (!webhookUrl.trim()) {
      toast.error("Preencha a URL do Webhook (ngrok)");
      return;
    }

    try {
      // Salvar no metadata do workspace
      await updateWorkspace.mutateAsync({
        metadata: {
          evolutionApiUrl: evolutionUrl,
          evolutionApiKey: evolutionKey,
          webhookUrl: webhookUrl,
        },
      });
      
      toast.success("Configuração da Evolution API salva!");
      toast.info("Reinicie a aplicação para aplicar as mudanças");
    } catch (error) {
      toast.error("Erro ao salvar configuração");
    }
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Configurações</h1>
            <p className="text-muted-foreground">Gerencie as configurações da sua conta</p>
          </div>

          <Tabs defaultValue="workspace" className="space-y-4">
            <TabsList>
              <TabsTrigger value="workspace">
                <SettingsIcon className="w-4 h-4 mr-2" />
                Workspace
              </TabsTrigger>
              <TabsTrigger value="evolution">
                <Server className="w-4 h-4 mr-2" />
                Evolution API
              </TabsTrigger>
              <TabsTrigger value="webhook">
                <Webhook className="w-4 h-4 mr-2" />
                Webhook
              </TabsTrigger>
              <TabsTrigger value="ixc">
                <Building2 className="w-4 h-4 mr-2" />
                IXC Soft
              </TabsTrigger>
            </TabsList>

            {/* Workspace Settings */}
            <TabsContent value="workspace">
              <Card>
                <CardHeader>
                  <CardTitle>Informações do Workspace</CardTitle>
                  <CardDescription>
                    Configure as informações básicas do seu workspace
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Workspace</Label>
                    <Input
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Ex: Minha Empresa"
                    />
                  </div>
                  <Button onClick={handleSaveWorkspace} disabled={updateWorkspace.isPending}>
                    {updateWorkspace.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Evolution API Settings */}
            <TabsContent value="evolution">
              <Card>
                <CardHeader>
                  <CardTitle>Configuração da Evolution API</CardTitle>
                  <CardDescription>
                    Configure a conexão com sua instância da Evolution API
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      Como instalar a Evolution API
                    </h4>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Instale o Docker Desktop no Windows</li>
                      <li>Execute: <code className="bg-muted px-2 py-0.5 rounded">docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=sua-chave -e SERVER_URL=http://localhost:8080 atendai/evolution-api:latest</code></li>
                      <li>Configure abaixo com os mesmos valores</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <Label>URL da Evolution API</Label>
                    <Input
                      value={evolutionUrl}
                      onChange={(e) => setEvolutionUrl(e.target.value)}
                      placeholder="http://localhost:8080"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL onde sua Evolution API está rodando
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={evolutionKey}
                      onChange={(e) => setEvolutionKey(e.target.value)}
                      placeholder="sua-chave-secreta"
                    />
                    <p className="text-xs text-muted-foreground">
                      A mesma chave definida em AUTHENTICATION_API_KEY
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Webhook URL (ngrok)</Label>
                    <Input
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://seu-dominio.ngrok-free.dev/api/webhook/evolution"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL pública do ngrok + /api/webhook/evolution
                    </p>
                  </div>

                  <Button onClick={handleSaveEvolutionConfig} disabled={updateWorkspace.isPending}>
                    <Key className="w-4 h-4 mr-2" />
                    {updateWorkspace.isPending ? "Salvando..." : "Salvar Configuração"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Webhook Settings */}
            <TabsContent value="webhook">
              <Card>
                <CardHeader>
                  <CardTitle>Configuração do Webhook</CardTitle>
                  <CardDescription>
                    Configure o webhook na Evolution API para receber mensagens
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL do Webhook</Label>
                    <div className="flex gap-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          toast.success("URL copiada!");
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use esta URL ao configurar o webhook na Evolution API
                    </p>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-2">⚠️ Importante</h4>
                    <p className="text-sm text-muted-foreground">
                      Para receber mensagens em produção, você precisa:
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside mt-2">
                      <li>Publicar sua aplicação (botão Publish)</li>
                      <li>Usar a URL pública no webhook da Evolution API</li>
                      <li>Configurar o webhook via API ou interface da Evolution</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* IXC Soft Settings */}
            <TabsContent value="ixc">
              <Card>
                <CardHeader>
                  <CardTitle>Configuração IXC Soft</CardTitle>
                  <CardDescription>
                    Configure a integração com o ERP IXC Soft para consultas e desbloqueio automático
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Funcionalidades disponíveis
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Consulta automática de faturas em aberto</li>
                      <li>Desbloqueio de confiança via comando do cliente</li>
                      <li>Identificação de cliente por telefone/CPF/CNPJ</li>
                      <li>Informações de vencimento e valores</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label>URL da API IXC Soft</Label>
                    <Input
                      value={ixcUrl}
                      onChange={(e) => setIxcUrl(e.target.value)}
                      placeholder="sis.seudominio.com.br"
                    />
                    <p className="text-xs text-muted-foreground">
                      Domínio do seu IXC Soft (sem http:// ou https://)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Token de Acesso</Label>
                    <Input
                      type="password"
                      value={ixcToken}
                      onChange={(e) => setIxcToken(e.target.value)}
                      placeholder="seu-token-ixc"
                    />
                    <p className="text-xs text-muted-foreground">
                      Token gerado no IXC Soft (Sistema &gt; Configurações &gt; API)
                    </p>
                  </div>

                  <Button 
                    onClick={async () => {
                      if (!ixcUrl.trim() || !ixcToken.trim()) {
                        toast.error("Preencha a URL e o Token");
                        return;
                      }
                      try {
                        const currentMetadata = (workspace as any)?.metadata || {};
                        await updateWorkspace.mutateAsync({
                          metadata: {
                            ...currentMetadata,
                            ixcApiUrl: ixcUrl,
                            ixcApiToken: ixcToken,
                          },
                        });
                        toast.success("Configuração IXC Soft salva!");
                      } catch (error) {
                        toast.error("Erro ao salvar configuração");
                      }
                    }} 
                    disabled={updateWorkspace.isPending}
                  >
                    <Key className="w-4 h-4 mr-2" />
                    {updateWorkspace.isPending ? "Salvando..." : "Salvar Configuração"}
                  </Button>

                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mt-4">
                    <h4 className="font-medium text-sm mb-2">✅ Como funciona</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Após configurar, a IA detecta automaticamente quando o cliente:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li><strong>Pergunta sobre fatura:</strong> "Tenho alguma conta em aberto?"</li>
                      <li><strong>Pede desbloqueio:</strong> "Pode desbloquear minha internet?"</li>
                      <li><strong>Consulta valores:</strong> "Quanto estou devendo?"</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}
