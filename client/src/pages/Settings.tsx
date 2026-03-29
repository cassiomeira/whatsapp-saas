import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Settings as SettingsIcon, Key, Building2, User, Lock, Clock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { APP_LOGO } from "@/const";
import { supabase } from "@/lib/supabase";

export default function Settings() {
  const { user, refresh } = useAuth();
  const { data: workspace } = trpc.workspaces.getCurrent.useQuery();
  const updateWorkspace = trpc.workspaces.update.useMutation();
  const workspaceUtils = trpc.useUtils();
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // IXC Soft Config
  const [ixcUrl, setIxcUrl] = useState("");
  const [ixcToken, setIxcToken] = useState("");

  // Account / password
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
  // Workspace Config
  const [workspaceName, setWorkspaceName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [isSavingLogo, setIsSavingLogo] = useState(false);

  // Operating Hours Config
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [weekdayOpen, setWeekdayOpen] = useState("07:30");
  const [weekdayClose, setWeekdayClose] = useState("20:00");
  const [sundayOpen, setSundayOpen] = useState("08:00");
  const [sundayClose, setSundayClose] = useState("20:00");
  const [outOfHoursMessage, setOutOfHoursMessage] = useState(
    "No momento estamos fora do nosso horário de atendimento. Assim que retomarmos o expediente, um atendente dará continuidade ao seu atendimento. 😊"
  );

  // Detectar se tem IXC configurado
  const wsMetadata = (workspace as any)?.metadata || {};
  const hasIXC = !!(wsMetadata.ixcApiUrl && wsMetadata.ixcApiToken);

  useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name);
      const metadata = (workspace as any).metadata || {};
      if (metadata?.ixcApiUrl) {
        setIxcUrl(metadata.ixcApiUrl);
      }
      if (metadata?.ixcApiToken) {
        setIxcToken(metadata.ixcApiToken);
      }
      if (metadata?.logoDataUrl) {
        setLogoDataUrl(metadata.logoDataUrl);
      } else {
        setLogoDataUrl("");
      }
      // Operating Hours
      const oh = metadata?.operatingHours;
      if (oh) {
        setHoursEnabled(oh.enabled ?? false);
        if (oh.weekdayOpenHour !== undefined) {
          setWeekdayOpen(`${String(oh.weekdayOpenHour).padStart(2, "0")}:${String(oh.weekdayOpenMinute ?? 0).padStart(2, "0")}`);
        }
        if (oh.weekdayCloseHour !== undefined) {
          setWeekdayClose(`${String(oh.weekdayCloseHour).padStart(2, "0")}:${String(oh.weekdayCloseMinute ?? 0).padStart(2, "0")}`);
        }
        if (oh.sundayOpenHour !== undefined) {
          setSundayOpen(`${String(oh.sundayOpenHour).padStart(2, "0")}:${String(oh.sundayOpenMinute ?? 0).padStart(2, "0")}`);
        }
        if (oh.sundayCloseHour !== undefined) {
          setSundayClose(`${String(oh.sundayCloseHour).padStart(2, "0")}:${String(oh.sundayCloseMinute ?? 0).padStart(2, "0")}`);
        }
        if (oh.outOfHoursMessage) {
          setOutOfHoursMessage(oh.outOfHoursMessage);
        }
      }
    }
  }, [workspace]);

  useEffect(() => {
    let isMounted = true;
    const resolveEmail = async () => {
      if (user?.email) {
        setAccountEmail(user.email);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const sessionEmail = data.session?.user?.email ?? "";
      if (sessionEmail && isMounted) {
        setAccountEmail(sessionEmail);
      }
    };
    resolveEmail();
    return () => {
      isMounted = false;
    };
  }, [user?.email]);

  const getCurrentMetadata = () => ((workspace as any)?.metadata || {});

  const syncWorkspaceData = async () => {
    await Promise.all([
      workspaceUtils.workspaces.getCurrent.invalidate(),
      refresh(),
    ]);
  };

  const handleSaveWorkspace = async () => {
    if (!workspaceName.trim()) {
      toast.error("Digite um nome para o workspace");
      return;
    }

    try {
      await updateWorkspace.mutateAsync({
        name: workspaceName,
      });
      await syncWorkspaceData();
      toast.success("Workspace atualizado!");
    } catch (error) {
      toast.error("Erro ao atualizar workspace");
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (PNG, JPG, SVG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande. Limite 2MB.");
      return;
    }

    setIsSavingLogo(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await updateWorkspace.mutateAsync({
          metadata: {
            ...getCurrentMetadata(),
            logoDataUrl: dataUrl,
          },
        });
        setLogoDataUrl(dataUrl);
        toast.success("Logomarca atualizada!");
        await syncWorkspaceData();
      } catch (error) {
        console.error(error);
        toast.error("Erro ao salvar logomarca");
      } finally {
        setIsSavingLogo(false);
        if (logoInputRef.current) {
          logoInputRef.current.value = "";
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    if (!logoDataUrl) return;
    setIsSavingLogo(true);
    try {
      const currentMetadata = { ...getCurrentMetadata() };
      delete currentMetadata.logoDataUrl;
      await updateWorkspace.mutateAsync({
        metadata: currentMetadata,
      });
      setLogoDataUrl("");
      toast.success("Logomarca removida.");
      await syncWorkspaceData();
    } catch (error) {
      toast.error("Erro ao remover logomarca");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!accountEmail) {
      toast.error("Não foi possível identificar o e-mail da conta logada.");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não coincide com a nova senha.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error(updateError.message || "Erro ao atualizar a senha.");
      }

      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar a senha.";
      toast.error(message);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const parseTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return { hour: h || 0, minute: m || 0 };
  };

  const handleSaveOperatingHours = async () => {
    try {
      const wOpen = parseTime(weekdayOpen);
      const wClose = parseTime(weekdayClose);
      const sOpen = parseTime(sundayOpen);
      const sClose = parseTime(sundayClose);

      await updateWorkspace.mutateAsync({
        metadata: {
          ...getCurrentMetadata(),
          operatingHours: {
            enabled: hoursEnabled,
            weekdayOpenHour: wOpen.hour,
            weekdayOpenMinute: wOpen.minute,
            weekdayCloseHour: wClose.hour,
            weekdayCloseMinute: wClose.minute,
            sundayOpenHour: sOpen.hour,
            sundayOpenMinute: sOpen.minute,
            sundayCloseHour: sClose.hour,
            sundayCloseMinute: sClose.minute,
            outOfHoursMessage: outOfHoursMessage,
          },
        },
      });
      toast.success("Horário de funcionamento salvo!");
      await syncWorkspaceData();
    } catch (error) {
      toast.error("Erro ao salvar horário de funcionamento");
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
              <TabsTrigger value="account">
                <User className="w-4 h-4 mr-2" />
                Conta
              </TabsTrigger>
              <TabsTrigger value="hours">
                <Clock className="w-4 h-4 mr-2" />
                Horário
              </TabsTrigger>
              {hasIXC && (
                <TabsTrigger value="ixc">
                  <Building2 className="w-4 h-4 mr-2" />
                  IXC Soft
                </TabsTrigger>
              )}
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
                  <div className="space-y-2">
                    <Label>Logomarca</Label>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="w-20 h-20 rounded-xl border bg-background flex items-center justify-center overflow-hidden">
                        <img
                          src={logoDataUrl || APP_LOGO}
                          alt="Logo do workspace"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isSavingLogo}
                        >
                          {isSavingLogo ? "Enviando..." : "Selecionar imagem"}
                        </Button>
                        {logoDataUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={handleRemoveLogo}
                            disabled={isSavingLogo}
                          >
                            Remover logo
                          </Button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      title="Upload Logo"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <p className="text-xs text-muted-foreground">
                      Formatos recomendados: PNG ou JPG até 2MB.
                    </p>
                  </div>
                  <Button onClick={handleSaveWorkspace} disabled={updateWorkspace.isPending}>
                    {updateWorkspace.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Account settings */}
            <TabsContent value="account">
              <Card>
                <CardHeader>
                  <CardTitle>Segurança da Conta</CardTitle>
                  <CardDescription>
                    Atualize sua senha de acesso sempre que necessário
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="accountEmail">E-mail</Label>
                    <Input
                      id="accountEmail"
                      value={accountEmail}
                      disabled
                      readOnly
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Nova senha</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Mínimo de 8 caracteres"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repita a nova senha"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button onClick={handleUpdatePassword} disabled={isUpdatingPassword}>
                      <Lock className="w-4 h-4 mr-2" />
                      {isUpdatingPassword ? "Atualizando..." : "Alterar senha"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Por segurança, utilize uma senha forte com letras maiúsculas, minúsculas, números e símbolos.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Operating Hours Settings */}
            <TabsContent value="hours">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Horário de Funcionamento
                  </CardTitle>
                  <CardDescription>
                    Configure o horário de atendimento da sua empresa. Fora desse horário, a IA envia uma mensagem automática informando que a empresa está fechada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Controle de horário</p>
                      <p className="text-sm text-muted-foreground">
                        {hoursEnabled
                          ? "A IA responde apenas dentro do horário configurado"
                          : "A IA responde a qualquer hora (24h)"}
                      </p>
                    </div>
                    <Switch
                      checked={hoursEnabled}
                      onCheckedChange={setHoursEnabled}
                    />
                  </div>

                  {hoursEnabled && (
                    <>
                      {/* Weekday hours */}
                      <div className="space-y-3">
                        <h3 className="font-medium text-sm">Segunda a Sábado</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Abertura</Label>
                            <Input
                              type="time"
                              value={weekdayOpen}
                              onChange={(e) => setWeekdayOpen(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fechamento</Label>
                            <Input
                              type="time"
                              value={weekdayClose}
                              onChange={(e) => setWeekdayClose(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sunday hours */}
                      <div className="space-y-3">
                        <h3 className="font-medium text-sm">Domingos e Feriados</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Abertura</Label>
                            <Input
                              type="time"
                              value={sundayOpen}
                              onChange={(e) => setSundayOpen(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fechamento</Label>
                            <Input
                              type="time"
                              value={sundayClose}
                              onChange={(e) => setSundayClose(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Out of hours message */}
                      <div className="space-y-2">
                        <Label>Mensagem fora do horário</Label>
                        <Textarea
                          value={outOfHoursMessage}
                          onChange={(e) => setOutOfHoursMessage(e.target.value)}
                          placeholder="Mensagem enviada automaticamente quando a empresa está fechada"
                          rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                          Esta mensagem será enviada automaticamente quando um cliente mandar mensagem fora do horário de funcionamento.
                        </p>
                      </div>
                    </>
                  )}

                  <Button onClick={handleSaveOperatingHours} disabled={updateWorkspace.isPending}>
                    <Clock className="w-4 h-4 mr-2" />
                    {updateWorkspace.isPending ? "Salvando..." : "Salvar Horário"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* IXC Soft Settings - Só aparece quando IXC está configurado */}
            {hasIXC && (
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
                        title="IXC Token"
                        placeholder="seu-token-ixc"
                        value={ixcToken}
                        onChange={(e) => setIxcToken(e.target.value)}
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
                          await updateWorkspace.mutateAsync({
                            metadata: {
                              ...getCurrentMetadata(),
                              ixcApiUrl: ixcUrl,
                              ixcApiToken: ixcToken,
                            },
                          });
                          toast.success("Configuração IXC Soft salva!");
                          await syncWorkspaceData();
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
            )}
          </Tabs>
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}
