import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Megaphone,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Plus,
  Trash2,
  Upload,
  Pencil,
} from "lucide-react";

import WorkspaceGuard from "@/components/WorkspaceGuard";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CampaignStatus = "draft" | "processing" | "completed" | "partial" | "failed";

type CampaignTargetMode = "all" | "audiences" | "manual";

const parseNumbersFromText = (text: string): string[] => {
  if (!text) return [];

  const chunks = text
    .split(/[\n,;]+/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  const numbers = new Set<string>();

  chunks.forEach(chunk => {
    const digits = chunk.replace(/\D+/g, "");
    const normalized = digits.replace(/^0+/, "");
    if (normalized.length >= 8) {
      numbers.add(normalized);
    }
  });

  return Array.from(numbers);
};

export default function Campaigns() {
  const utils = trpc.useUtils();

  const campaignsQuery = trpc.campaigns.list.useQuery();
  const audiencesQuery = trpc.campaigns.audiences.list.useQuery();

  const createCampaign = trpc.campaigns.createAndSend.useMutation({
    onSuccess: async result => {
      toast.success("Campanha enviada com sucesso!", {
        description: `Mensagens entregues: ${result.sentCount}/${result.totalContacts}`,
      });
      await utils.campaigns.list.invalidate();
      resetForm();
      setDialogOpen(false);
    },
    onError: error => {
      toast.error("Erro ao criar campanha", {
        description: error.message ?? "Verifique as configurações e tente novamente.",
      });
    },
  });

  const createAudience = trpc.campaigns.audiences.create.useMutation({
    onSuccess: async audience => {
      toast.success("Grupo criado!");
      setNewAudienceName("");
      setNewAudienceNumbersInput("");
      await utils.campaigns.audiences.list.invalidate();
      if (audience?.id) {
        setSelectedAudienceId(audience.id);
      }
    },
    onError: error => {
      toast.error("Não foi possível criar o grupo", {
        description: error.message,
      });
    },
  });

  const renameAudience = trpc.campaigns.audiences.rename.useMutation({
    onSuccess: async () => {
      toast.success("Nome do grupo atualizado!");
      await utils.campaigns.audiences.list.invalidate();
    },
    onError: error => {
      toast.error("Não foi possível renomear o grupo", {
        description: error.message,
      });
    },
  });

  const deleteAudience = trpc.campaigns.audiences.delete.useMutation({
    onSuccess: async (_response, variables) => {
      toast.success("Grupo removido!");
      await utils.campaigns.audiences.list.invalidate();
      if (selectedAudienceId === variables.audienceId) {
        setSelectedAudienceId(null);
      }
    },
    onError: error => {
      toast.error("Não foi possível remover o grupo", {
        description: error.message,
      });
    },
  });

  const importAudienceNumbers = trpc.campaigns.audiences.importNumbers.useMutation({
    onSuccess: async (_response, variables) => {
      toast.success("Números atualizados para o grupo!");
      setAudienceNumbersInput("");
      await Promise.all([
        utils.campaigns.audiences.list.invalidate(),
        utils.campaigns.audiences.members.invalidate({ audienceId: variables.audienceId }),
      ]);
    },
    onError: error => {
      toast.error("Não foi possível importar os números", {
        description: error.message,
      });
    },
  });

  const removeAudienceMember = trpc.campaigns.audiences.removeMember.useMutation({
    onSuccess: async (_response, variables) => {
      await Promise.all([
        utils.campaigns.audiences.list.invalidate(),
        utils.campaigns.audiences.members.invalidate({ audienceId: variables.audienceId }),
      ]);
    },
    onError: error => {
      toast.error("Não foi possível remover o contato", {
        description: error.message,
      });
    },
  });

  const updateCampaign = trpc.campaigns.update.useMutation({
    onSuccess: async () => {
      toast.success("Campanha atualizada!");
      await utils.campaigns.list.invalidate();
      closeDialog();
    },
    onError: error => {
      toast.error("Não foi possível atualizar a campanha", {
        description: error.message,
      });
    },
  });

  const deleteCampaignMutation = trpc.campaigns.delete.useMutation({
    onSuccess: async () => {
      toast.success("Campanha excluída!");
      await utils.campaigns.list.invalidate();
    },
    onError: error => {
      toast.error("Não foi possível excluir a campanha", {
        description: error.message,
      });
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [campaignDialogMode, setCampaignDialogMode] = useState<"create" | "edit">("create");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const [targetMode, setTargetMode] = useState<CampaignTargetMode>("all");
  const [selectedAudiences, setSelectedAudiences] = useState<number[]>([]);
  const [manualNumbersInput, setManualNumbersInput] = useState("");

  const [audienceManagerOpen, setAudienceManagerOpen] = useState(false);
  const [selectedAudienceId, setSelectedAudienceId] = useState<number | null>(null);
  const [newAudienceName, setNewAudienceName] = useState("");
  const [newAudienceNumbersInput, setNewAudienceNumbersInput] = useState("");
  const [audienceRename, setAudienceRename] = useState("");
  const [audienceNumbersInput, setAudienceNumbersInput] = useState("");
  const [replaceAudienceMembers, setReplaceAudienceMembers] = useState(false);

  const parsedManualNumbers = useMemo(() => parseNumbersFromText(manualNumbersInput), [manualNumbersInput]);
  const parsedAudienceNumbers = useMemo(() => parseNumbersFromText(audienceNumbersInput), [audienceNumbersInput]);
  const parsedNewAudienceNumbers = useMemo(() => parseNumbersFromText(newAudienceNumbersInput), [newAudienceNumbersInput]);

  const audiences = useMemo(() => audiencesQuery.data ?? [], [audiencesQuery.data]);
  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);

  type CampaignItem = (typeof campaigns)[number];
  const [campaignBeingEdited, setCampaignBeingEdited] = useState<CampaignItem | null>(null);

  useEffect(() => {
    setSelectedAudiences(prev => prev.filter(id => audiences.some(audience => audience.id === id)));
  }, [audiences]);

  useEffect(() => {
    if (!audienceManagerOpen) {
      return;
    }
    if (!audiences.length) {
      setSelectedAudienceId(null);
      return;
    }
    if (!selectedAudienceId || !audiences.some(audience => audience.id === selectedAudienceId)) {
      setSelectedAudienceId(audiences[0]?.id ?? null);
    }
  }, [audienceManagerOpen, audiences, selectedAudienceId]);

  useEffect(() => {
    const current = audiences.find(audience => audience.id === selectedAudienceId);
    setAudienceRename(current?.name ?? "");
    setAudienceNumbersInput("");
    setReplaceAudienceMembers(false);
  }, [selectedAudienceId, audiences]);

  const audienceMembersQuery = trpc.campaigns.audiences.members.useQuery(
    { audienceId: selectedAudienceId ?? 0 },
    { enabled: Boolean(selectedAudienceId) }
  );

  const audienceMembers = audienceMembersQuery.data ?? [];
  const selectedAudience = audiences.find(audience => audience.id === selectedAudienceId) ?? null;

  const totalSelectedAudienceContacts = useMemo(() => {
    if (!selectedAudiences.length) return 0;
    return audiences
      .filter(audience => selectedAudiences.includes(audience.id))
      .reduce((total, audience) => total + (audience.contactCount ?? 0), 0);
  }, [audiences, selectedAudiences]);

  const resetForm = () => {
    setName("");
    setMessage("");
    setTargetMode("all");
    setSelectedAudiences([]);
    setManualNumbersInput("");
    setCampaignBeingEdited(null);
    setCampaignDialogMode("create");
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const isSubmitting = createCampaign.isPending;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim() || !message.trim()) {
      toast.warning("Preencha o nome e a mensagem da campanha.");
      return;
    }

    if (campaignDialogMode === "edit") {
      if (!campaignBeingEdited) return;
      await updateCampaign.mutateAsync({
        campaignId: campaignBeingEdited.id,
        name: name.trim(),
        message: message.trim(),
      });
      return;
    }

    const payload: Parameters<typeof createCampaign.mutateAsync>[0] = {
      name: name.trim(),
      message: message.trim(),
    };

    if (targetMode === "audiences") {
      if (!selectedAudiences.length) {
        toast.warning("Selecione pelo menos um grupo para a campanha.");
        return;
      }
      payload.audienceIds = selectedAudiences;
    } else if (targetMode === "manual") {
      if (!parsedManualNumbers.length) {
        toast.warning("Cole ao menos um número válido para continuar.");
        return;
      }
      payload.manualNumbers = parsedManualNumbers;
    }

    await createCampaign.mutateAsync(payload);
  };

  const statusConfig: Record<CampaignStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    draft: { label: "Rascunho", variant: "secondary" },
    processing: { label: "Enviando", variant: "secondary" },
    completed: { label: "Concluída", variant: "default" },
    partial: { label: "Parcial", variant: "outline" },
    failed: { label: "Falhou", variant: "destructive" },
  };

  const renderStatusBadge = (status: string | null) => {
    const normalizedStatus = (status ?? "draft") as CampaignStatus;
    const config = statusConfig[normalizedStatus] ?? statusConfig.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatRelativeDate = (value: unknown) => {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value as any);
    if (Number.isNaN(date.getTime())) return "-";
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  };

  const totalContactsReached = useMemo(() => {
    return campaigns.reduce(
      (accumulator, campaign) => ({
        sent: accumulator.sent + (campaign.sentCount ?? 0),
        total: accumulator.total + (campaign.totalContacts ?? 0),
      }),
      { sent: 0, total: 0 }
    );
  }, [campaigns]);

  const estimatedRecipients =
    campaignDialogMode === "edit"
      ? undefined
      : targetMode === "audiences"
        ? totalSelectedAudienceContacts
        : targetMode === "manual"
          ? parsedManualNumbers.length
          : undefined;

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Campanhas</h1>
              <p className="text-muted-foreground">
                Dispare promoções e comunicados para toda a sua base de clientes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Dialog
                open={audienceManagerOpen}
                onOpenChange={open => {
                  setAudienceManagerOpen(open);
                  if (!open) {
                    setSelectedAudienceId(null);
                    setAudienceNumbersInput("");
                    setReplaceAudienceMembers(false);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Users className="w-4 h-4 mr-2" />
                    Gerenciar grupos
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Gerenciar grupos de disparo</DialogTitle>
                    <DialogDescription>
                      Organize seus contatos em grupos e importe números em massa para disparos segmentados.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-6 md:grid-cols-[240px,1fr]">
                    <div className="space-y-6">
                      <form
                        className="space-y-2"
                        onSubmit={event => {
                          event.preventDefault();
                          if (!newAudienceName.trim()) {
                            toast.warning("Informe um nome para o grupo.");
                            return;
                          }
                          createAudience.mutate({
                            name: newAudienceName.trim(),
                            numbers: parsedNewAudienceNumbers,
                          });
                        }}
                      >
                        <Label htmlFor="new-audience">Novo grupo</Label>
                        <div className="flex gap-2">
                          <Input
                            id="new-audience"
                            placeholder="Ex: Clientes VIP"
                            value={newAudienceName}
                            onChange={event => setNewAudienceName(event.target.value)}
                            disabled={createAudience.isPending}
                          />
                          <Button type="submit" disabled={createAudience.isPending}>
                            {createAudience.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <Textarea
                          placeholder={"Cole números com DDD, um por linha (opcional)."}
                          rows={3}
                          value={newAudienceNumbersInput}
                          onChange={event => setNewAudienceNumbersInput(event.target.value)}
                          disabled={createAudience.isPending}
                        />
                        <p className="text-xs text-muted-foreground">
                          {parsedNewAudienceNumbers.length} número(s) válido(s) serão adicionados automaticamente.
                        </p>
                      </form>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Grupos existentes
                        </p>
                        <div className="space-y-2">
                          {audiencesQuery.isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Carregando grupos...
                            </div>
                          ) : audiences.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Nenhum grupo criado. Adicione um novo grupo para começar.
                            </p>
                          ) : (
                            audiences.map(audience => (
                              <button
                                key={audience.id}
                                type="button"
                                className={cn(
                                  "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                                  selectedAudienceId === audience.id
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "hover:border-primary/40"
                                )}
                                onClick={() => setSelectedAudienceId(audience.id)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{audience.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {audience.contactCount ?? 0} contato(s)
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {selectedAudience ? (
                        <>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Input
                                value={audienceRename}
                                onChange={event => setAudienceRename(event.target.value)}
                                disabled={renameAudience.isPending}
                              />
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    if (!audienceRename.trim()) {
                                      toast.warning("Informe um nome válido.");
                                      return;
                                    }
                                    renameAudience.mutate({
                                      audienceId: selectedAudience.id,
                                      name: audienceRename.trim(),
                                    });
                                  }}
                                  disabled={renameAudience.isPending || !audienceRename.trim()}
                                >
                                  {renameAudience.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Salvar nome"
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  onClick={() => {
                                    if (!window.confirm("Excluir este grupo? Esta ação não pode ser desfeita.")) {
                                      return;
                                    }
                                    deleteAudience.mutate({ audienceId: selectedAudience.id });
                                  }}
                                  disabled={deleteAudience.isPending}
                                >
                                  {deleteAudience.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Este grupo possui {selectedAudience.contactCount ?? 0} contato(s).
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>Números para adicionar</Label>
                            <Textarea
                              placeholder={"Cole números com DDD, um por linha. Ex: 559999999999\n558888888888"}
                              rows={6}
                              value={audienceNumbersInput}
                              onChange={event => setAudienceNumbersInput(event.target.value)}
                              disabled={importAudienceNumbers.isPending}
                            />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{parsedAudienceNumbers.length} número(s) válido(s) detectado(s).</span>
                              <label className="inline-flex items-center gap-2">
                                <Checkbox
                                  checked={replaceAudienceMembers}
                                  onCheckedChange={value => setReplaceAudienceMembers(Boolean(value))}
                                />
                                <span>Substituir contatos existentes</span>
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!parsedAudienceNumbers.length) {
                                    toast.warning("Cole ao menos um número válido.");
                                    return;
                                  }
                                  importAudienceNumbers.mutate({
                                    audienceId: selectedAudience.id,
                                    numbers: parsedAudienceNumbers,
                                    mode: replaceAudienceMembers ? "replace" : "append",
                                  });
                                }}
                                disabled={importAudienceNumbers.isPending}
                              >
                                {importAudienceNumbers.isPending ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Salvando...
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-2">
                                    <Upload className="h-4 w-4" />
                                    Salvar números
                                  </span>
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAudienceNumbersInput("")}
                                disabled={importAudienceNumbers.isPending}
                              >
                                Limpar
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Contatos atuais</Label>
                            <ScrollArea className="h-48 rounded-md border p-3">
                              {audienceMembersQuery.isLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Carregando contatos...
                                </div>
                              ) : audienceMembers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Nenhum contato neste grupo.
                                </p>
                              ) : (
                                <ul className="space-y-1 text-sm">
                                  {audienceMembers.map(member => (
                                    <li key={member.contactId} className="flex items-center justify-between gap-2">
                                      <div>
                                        <p>{member.whatsappNumber}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {member.name ?? "Sem nome"}
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => {
                                          if (removeAudienceMember.isPending) return;
                                          removeAudienceMember.mutate({
                                            audienceId: selectedAudience.id,
                                            contactId: member.contactId,
                                          });
                                        }}
                                        disabled={removeAudienceMember.isPending}
                                      >
                                        {removeAudienceMember.isPending ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </ScrollArea>
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                          Crie ou selecione um grupo para gerenciar seus contatos.
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={dialogOpen}
                onOpenChange={open => {
                  setDialogOpen(open);
                  if (!open) {
                    resetForm();
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Megaphone className="w-4 h-4 mr-2" />
                    Nova Campanha
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>
                      {campaignDialogMode === "edit" ? "Editar campanha" : "Criar nova campanha"}
                    </DialogTitle>
                    <DialogDescription>
                      {campaignDialogMode === "edit"
                        ? "Atualize as informações exibidas nesta campanha."
                        : "Dispare uma mensagem promocional imediatamente para os clientes selecionados."}
                    </DialogDescription>
                  </DialogHeader>

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                      <Label htmlFor="campaign-name">Nome interno</Label>
                      <Input
                        id="campaign-name"
                        placeholder="Ex: Promoção Dia das Mães"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        disabled={isSubmitting}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="campaign-message">Mensagem</Label>
                      <Textarea
                        id="campaign-message"
                        placeholder="Escreva a mensagem que será enviada pelo WhatsApp..."
                        value={message}
                        onChange={event => setMessage(event.target.value)}
                        rows={6}
                        disabled={isSubmitting}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        A campanha será disparada pelo número conectado via Evolution API. Garanta que a instância esteja online.
                      </p>
                    </div>

                    {campaignDialogMode === "create" ? (
                      <div className="space-y-3">
                        <Label>Destinatários</Label>
                        <RadioGroup value={targetMode} onValueChange={value => setTargetMode(value as CampaignTargetMode)}>
                          <div className="flex flex-col gap-3">
                            <label className="flex gap-3 rounded-md border p-3">
                              <RadioGroupItem value="all" id="target-all" />
                              <div className="space-y-1">
                                <span className="font-medium">Todos os contatos</span>
                                <p className="text-sm text-muted-foreground">
                                  Dispara para toda a base cadastrada no workspace.
                                </p>
                              </div>
                            </label>

                            <div className={cn(
                              "rounded-md border p-3 transition",
                              targetMode === "audiences" ? "border-primary" : ""
                            )}>
                              <label className="flex gap-3">
                                <RadioGroupItem value="audiences" id="target-audiences" />
                                <div className="space-y-1">
                                  <span className="font-medium">Grupos específicos</span>
                                  <p className="text-sm text-muted-foreground">
                                    Selecione um ou mais grupos para enviar a campanha.
                                  </p>
                                </div>
                              </label>

                              <div className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3">
                                {audiencesQuery.isLoading ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Carregando grupos...
                                  </div>
                                ) : audiences.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    Nenhum grupo cadastrado. Utilize o botão "Gerenciar grupos" para criar um novo.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {audiences.map(audience => (
                                      <label key={audience.id} className="flex items-start gap-2 text-sm">
                                        <Checkbox
                                          checked={selectedAudiences.includes(audience.id)}
                                          onCheckedChange={checked => {
                                            if (checked) {
                                              setSelectedAudiences(prev => [...prev, audience.id]);
                                            } else {
                                              setSelectedAudiences(prev => prev.filter(id => id !== audience.id));
                                            }
                                          }}
                                          disabled={targetMode !== "audiences"}
                                        />
                                        <div>
                                          <p className="font-medium">{audience.name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {audience.contactCount ?? 0} contato(s)
                                          </p>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setAudienceManagerOpen(true)}
                                >
                                  Gerenciar grupos
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                  {selectedAudiences.length
                                    ? `Aproximadamente ${totalSelectedAudienceContacts} contato(s) serão impactados.`
                                    : "Selecione pelo menos um grupo."}
                                </p>
                              </div>
                            </div>

                            <div className={cn(
                              "rounded-md border p-3 transition",
                              targetMode === "manual" ? "border-primary" : ""
                            )}>
                              <label className="flex gap-3">
                                <RadioGroupItem value="manual" id="target-manual" />
                                <div className="space-y-1">
                                  <span className="font-medium">Lista manual de números</span>
                                  <p className="text-sm text-muted-foreground">
                                    Cole números com DDD (um por linha) para disparar somente para contatos específicos.
                                  </p>
                                </div>
                              </label>
                              <Textarea
                                className="mt-3"
                                rows={4}
                                placeholder={"559999999999\n558888888888"}
                                value={manualNumbersInput}
                                onChange={event => setManualNumbersInput(event.target.value)}
                                disabled={targetMode !== "manual"}
                              />
                              <p className="text-xs text-muted-foreground">
                                {parsedManualNumbers.length} número(s) válido(s) detectado(s).
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                    ) : null}

                    <DialogFooter className="flex-col gap-2">
                      {campaignDialogMode === "create" ? (
                        <div className="w-full text-left text-xs text-muted-foreground">
                          Destinatários estimados: {estimatedRecipients === undefined
                            ? "Todos os contatos do workspace."
                            : `${estimatedRecipients} contato(s).`}
                        </div>
                      ) : null}
                      <div className="flex w-full justify-end gap-2">
                        <Button type="button" variant="outline" onClick={closeDialog} disabled={isSubmitting || updateCampaign.isPending}>
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting || updateCampaign.isPending}>
                          {isSubmitting || updateCampaign.isPending ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {campaignDialogMode === "edit" ? "Salvando..." : "Enviando..."}
                            </span>
                          ) : (
                            campaignDialogMode === "edit" ? "Salvar alterações" : "Iniciar envio"
                          )}
                        </Button>
                      </div>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Campanhas enviadas</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{campaigns.length}</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Mensagens entregues</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalContactsReached.sent}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  de {totalContactsReached.total}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Status recente</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                {campaigns.length === 0 ? (
                  <>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Nenhum disparo realizado ainda
                  </>
                ) : (
                  <>
                    {renderStatusBadge(campaigns[0].status ?? "draft")}
                    <span className="text-muted-foreground">
                      Atualizado {formatRelativeDate(campaigns[0].updatedAt)}
                    </span>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de campanhas</CardTitle>
            </CardHeader>
            <CardContent>
              {campaignsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando campanhas...
                </div>
              ) : campaigns.length === 0 ? (
                <div className="space-y-3 py-12 text-center text-muted-foreground">
                  <Megaphone className="mx-auto h-8 w-8" />
                  <div>
                    Nenhuma campanha cadastrada ainda. Clique em
                    <span className="font-medium text-foreground"> "Nova Campanha" </span>
                    para começar.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mensagens</TableHead>
                      <TableHead>Atualizado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map(campaign => {
                      const total = campaign.totalContacts ?? 0;
                      const sent = campaign.sentCount ?? 0;
                      const failed = Math.max(total - sent, 0);
                      return (
                        <TableRow key={campaign.id}>
                          <TableCell className="max-w-[280px] truncate">
                            <div className="text-sm font-medium text-foreground">{campaign.name}</div>
                            <div className="mt-1 line-clamp-2 pr-6 text-xs text-muted-foreground">
                              {campaign.message}
                            </div>
                          </TableCell>
                          <TableCell>{renderStatusBadge(campaign.status ?? "draft")}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              {sent}
                              {failed > 0 && (
                                <span className="ml-2 flex items-center gap-1 text-xs text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  {failed} falhou
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatRelativeDate(campaign.updatedAt ?? campaign.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setCampaignDialogMode("edit");
                                  setCampaignBeingEdited(campaign);
                                  setName(campaign.name ?? "");
                                  setMessage(campaign.message ?? "");
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  if (deleteCampaignMutation.isPending) return;
                                  if (!window.confirm("Excluir esta campanha?")) return;
                                  deleteCampaignMutation.mutate({ campaignId: campaign.id });
                                }}
                                disabled={deleteCampaignMutation.isPending}
                              >
                                {deleteCampaignMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}
