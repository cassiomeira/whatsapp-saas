import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Smartphone, QrCode, CheckCircle, XCircle, Loader2, Plus } from "lucide-react";

export default function WhatsApp() {
  const { data: instances, refetch } = trpc.whatsapp.list.useQuery();
  const createInstance = trpc.whatsapp.createInstance.useMutation();
  const checkStatus = trpc.whatsapp.checkStatus.useQuery;
  const disconnect = trpc.whatsapp.disconnect.useMutation();
  const reconnect = trpc.whatsapp.reconnect.useMutation();
  const deleteInstance = trpc.whatsapp.deleteInstance.useMutation();
  
  // Função para buscar QR Code
  const fetchQRCode = async (instanceId: number) => {
    try {
      const response = await fetch(`/api/trpc/whatsapp.getQRCode?input=${encodeURIComponent(JSON.stringify({ instanceId }))}`);
      const data = await response.json();
      return data?.result?.data?.qrCode || null;
    } catch (error) {
      return null;
    }
  };
  
  // Polling automático para atualizar status a cada 10 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 10000); // 10 segundos
    
    return () => clearInterval(interval);
  }, [refetch]);
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);
  const [reconnectInstanceId, setReconnectInstanceId] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!instanceName.trim()) {
      toast.error("Digite um nome para a instância");
      return;
    }

    try {
      const result = await createInstance.mutateAsync({ name: instanceName });
      setQrCode(result.qrCode || null);
      setSelectedInstance(result.instanceId as number);
      setInstanceName("");
      
      // Se o QR Code não veio na resposta, buscar periodicamente (v2.2.3)
      if (!result.qrCode && result.instanceId) {
        toast.info("Aguardando QR Code...");
        let attempts = 0;
        const maxAttempts = 20; // 20 tentativas = 60 segundos
        
        const qrCodeInterval = setInterval(async () => {
          attempts++;
          try {
            // Buscar QR Code diretamente da API
            const qrCode = await fetchQRCode(result.instanceId as number);
            if (qrCode) {
              setQrCode(qrCode);
              clearInterval(qrCodeInterval);
              toast.success("QR Code gerado! Escaneie o QR Code");
              return;
            }
            
            // Também verificar na lista de instâncias
            const instancesResult = await refetch();
            const instance = instancesResult.data?.find((i: any) => i.id === result.instanceId);
            if (instance?.qrCode) {
              setQrCode(instance.qrCode);
              clearInterval(qrCodeInterval);
              toast.success("QR Code gerado! Escaneie o QR Code");
              return;
            }
            
            // Se conectou, parar de buscar
            if (instance?.status === "connected") {
              clearInterval(qrCodeInterval);
            }
            
            // Parar após máximo de tentativas
            if (attempts >= maxAttempts) {
              clearInterval(qrCodeInterval);
              toast.warning("QR Code não foi gerado. Tente reconectar a instância.");
            }
          } catch (error) {
            // Ignorar erros
          }
        }, 3000); // Buscar a cada 3 segundos
      } else {
        toast.success("Instância criada! Escaneie o QR Code");
      }
      
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar instância");
    }
  };

  const handleDisconnect = async (instanceId: number) => {
    try {
      await disconnect.mutateAsync({ instanceId });
      toast.success("Instância desconectada!");
      refetch();
    } catch (error) {
      toast.error("Erro ao desconectar");
    }
  };

  const handleReconnect = async (instanceId: number) => {
    try {
      const result = await reconnect.mutateAsync({ instanceId });
      setQrCode(result.qrCode || null);
      setReconnectInstanceId(instanceId);
      setShowReconnectDialog(true);
      toast.success("QR Code gerado! Escaneie para reconectar");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reconectar");
    }
  };

  const handleDelete = async (instanceId: number, instanceName: string) => {
    if (!confirm(`Tem certeza que deseja remover a instância "${instanceName}"?`)) {
      return;
    }
    try {
      await deleteInstance.mutateAsync({ instanceId });
      toast.success("Instância removida!");
      refetch();
    } catch (error) {
      toast.error("Erro ao remover instância");
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { icon: any; variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      connected: { icon: CheckCircle, variant: "default", label: "Conectado" },
      connecting: { icon: Loader2, variant: "secondary", label: "Conectando" },
      disconnected: { icon: XCircle, variant: "destructive", label: "Desconectado" },
    };
    
    const { icon: Icon, variant, label } = config[status] || config.disconnected;
    
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className={`w-3 h-3 ${status === "connecting" ? "animate-spin" : ""}`} />
        {label}
      </Badge>
    );
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">WhatsApp</h1>
              <p className="text-muted-foreground">Gerencie suas conexões WhatsApp</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Instância
            </Button>
          </div>

          {/* Lista de instâncias */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {instances && instances.length > 0 ? (
              instances.map((instance) => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  onDisconnect={handleDisconnect}
                  onReconnect={handleReconnect}
                  onDelete={handleDelete}
                  onRefresh={refetch}
                  getStatusBadge={getStatusBadge}
                />
              ))
            ) : (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Smartphone className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma instância WhatsApp configurada</p>
                  <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                    Criar Primeira Instância
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Dialog de criação */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Instância WhatsApp</DialogTitle>
                <DialogDescription>
                  Crie uma nova conexão WhatsApp para sua conta
                </DialogDescription>
              </DialogHeader>
              
              {!qrCode ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome da Instância</Label>
                    <Input
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                      placeholder="Ex: Atendimento Principal"
                    />
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={createInstance.isPending}
                    className="w-full"
                  >
                    {createInstance.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4 mr-2" />
                        Gerar QR Code
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center">
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      Escaneie este QR Code com seu WhatsApp
                    </p>
                    <div className="bg-white p-4 rounded-lg">
                      <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQrCode(null);
                      setSelectedInstance(null);
                      setShowCreateDialog(false);
                    }}
                    className="w-full"
                  >
                    Fechar
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Dialog de reconexão */}
          <Dialog open={showReconnectDialog} onOpenChange={setShowReconnectDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reconectar WhatsApp</DialogTitle>
                <DialogDescription>
                  Escaneie o QR Code para reconectar esta instância
                </DialogDescription>
              </DialogHeader>
              
              {qrCode && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center">
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      Escaneie este QR Code com seu WhatsApp
                    </p>
                    <div className="bg-white p-4 rounded-lg">
                      <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQrCode(null);
                      setReconnectInstanceId(null);
                      setShowReconnectDialog(false);
                    }}
                    className="w-full"
                  >
                    Fechar
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}

function InstanceCard({
  instance,
  onDisconnect,
  onReconnect,
  onDelete,
  onRefresh,
  getStatusBadge,
}: {
  instance: any;
  onDisconnect: (id: number) => void;
  onReconnect: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onRefresh: () => void;
  getStatusBadge: (status: string) => any;
}) {
  const { data: statusData } = trpc.whatsapp.checkStatus.useQuery(
    { instanceId: instance.id },
    { refetchInterval: instance.status === "connecting" ? 3000 : 10000 }
  );

  useEffect(() => {
    if (statusData?.status === "connected" && instance.status !== "connected") {
      onRefresh();
      toast.success(`${instance.name} conectado!`);
    }
  }, [statusData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{instance.name}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {statusData?.phoneNumber || "Aguardando conexão"}
            </CardDescription>
          </div>
          {getStatusBadge(statusData?.status || instance.status)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex gap-2">
            {(statusData?.status === "connected" || instance.status === "connected") && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDisconnect(instance.id)}
                className="flex-1"
              >
                Desconectar
              </Button>
            )}
            {(statusData?.status === "disconnected" || instance.status === "disconnected") && (
              <Button
                size="sm"
                variant="default"
                onClick={() => onReconnect(instance.id)}
                className="flex-1"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Reconectar
              </Button>
            )}
            {(statusData?.status === "connecting" || instance.status === "connecting") && (
              <div className="flex-1 text-center text-sm text-muted-foreground py-2">
                Aguardando QR Code...
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(instance.id, instance.name)}
            className="w-full text-destructive hover:text-destructive"
          >
            Remover Instância
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
