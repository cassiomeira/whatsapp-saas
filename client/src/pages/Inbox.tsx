import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Send, Bot, User as UserIcon, Phone, Clock, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Inbox() {
  const { user } = useAuth();
  const { data: conversations } = trpc.conversations.list.useQuery(undefined, {
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });
  const { data: contacts } = trpc.contacts.list.useQuery(undefined, {
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const { data: messages, refetch: refetchMessages } = trpc.messages.list.useQuery(
    { conversationId: selectedConversationId! },
    { enabled: !!selectedConversationId, refetchInterval: 3000, refetchOnWindowFocus: false }
  );
  const selectedConversation = conversations?.find(c => c.id === selectedConversationId);
  const selectedContact = contacts?.find(c => c.id === selectedConversation?.contactId);
  const slaWindowStart = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // últimos 30 dias
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const selectedDayRange = useMemo(() => {
    if (!selectedDate) return { from: slaWindowStart, to: undefined };
    const start = new Date(selectedDate + "T00:00:00");
    const end = new Date(selectedDate + "T23:59:59");
    return {
      from: Math.floor(start.getTime() / 1000),
      to: Math.floor(end.getTime() / 1000),
    };
  }, [selectedDate]);

  const { data: slaContact } = trpc.analytics.slaContact.useQuery(
    {
      contactId: selectedConversation?.contactId ?? 0,
      from: selectedDayRange.from,
      to: selectedDayRange.to,
    },
    { enabled: !!selectedConversation?.contactId }
  );
  const sendMessage = trpc.messages.send.useMutation();
  const assignConversation = trpc.conversations.assign.useMutation();
  const closeConversation = trpc.conversations.close.useMutation();
  
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const wasAtBottomRef = useRef(true);
  const previousMessagesLengthRef = useRef(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Selecionar conversa pelo parâmetro ?contact=ID (usado pelo link "Ver conversa")
  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const contactParam = params.get("contact");
    if (!contactParam) return;
    const contactId = Number(contactParam);
    if (Number.isNaN(contactId)) return;
    const conv = conversations.find(c => c.contactId === contactId);
    if (conv) {
      setSelectedConversationId(conv.id);
    }
  }, [conversations]);

  // Verificar se o usuário está no final do scroll
  const checkIfAtBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return false;
    
    const threshold = 100; // Margem de erro de 100px
    const isAtBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    
    wasAtBottomRef.current = isAtBottom;
    return isAtBottom;
  };

  // Scroll automático apenas se o usuário estiver no final
  useEffect(() => {
    // Se novas mensagens foram adicionadas (não apenas atualização)
    const hasNewMessages = messages && messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages?.length || 0;

    // Só fazer scroll automático se:
    // 1. O usuário estava no final do scroll (não estava lendo mensagens antigas)
    // 2. OU novas mensagens foram adicionadas (sempre mostrar novas mensagens)
    if (wasAtBottomRef.current || hasNewMessages) {
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => {
        if (!isUserScrollingRef.current) {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  }, [messages]);

  // Detectar quando o usuário está rolando manualmente
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      isUserScrollingRef.current = true;
      checkIfAtBottom();
      
      // Resetar flag após 1 segundo sem scroll
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 1000);
    };

    container.addEventListener('scroll', handleScroll);
    
    // Verificar posição inicial
    checkIfAtBottom();
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [selectedConversationId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversationId) return;

    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversationId,
        content: messageText,
      });
      setMessageText("");
      refetchMessages();
    } catch (error) {
      toast.error("Erro ao enviar mensagem");
    }
  };

  const handleAssign = async () => {
    if (!selectedConversationId) return;
    try {
      await assignConversation.mutateAsync({ conversationId: selectedConversationId });
      toast.success("Conversa assumida!");
    } catch (error) {
      toast.error("Erro ao assumir conversa");
    }
  };

  const handleClose = async () => {
    if (!selectedConversationId) return;
    try {
      await closeConversation.mutateAsync({ conversationId: selectedConversationId });
      toast.success("Conversa encerrada!");
      setSelectedConversationId(null);
    } catch (error) {
      toast.error("Erro ao encerrar conversa");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      bot_handling: { variant: "secondary", label: "Bot" },
      pending_human: { variant: "outline", label: "Pendente" },
      in_progress: { variant: "default", label: "Em Atendimento" },
      closed: { variant: "destructive", label: "Encerrada" },
    };
    const config = variants[status] || variants.pending_human;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
          {/* Lista de conversas (coluna esquerda) */}
          <div className="w-80 min-w-[320px] max-w-[320px] flex-shrink-0 border-r flex flex-col min-h-0">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-lg">Conversas</h2>
              <p className="text-sm text-muted-foreground">
                {conversations?.length || 0} {conversations?.length === 1 ? "conversa" : "conversas"}
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {conversations && conversations.length > 0 ? (
                    conversations.map((conv) => {
                      const contact = contacts?.find(c => c.id === conv.contactId);
                      const title = contact?.name || contact?.whatsappNumber || `Conversa #${conv.id}`;
                      const subtitle = contact?.whatsappNumber
                        ? contact.whatsappNumber
                        : conv.contactId
                        ? `Contato ID: ${conv.contactId}`
                        : "Contato não identificado";
                      return (
                    <Card
                      key={conv.id}
                      className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                        selectedConversationId === conv.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedConversationId(conv.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Phone className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                                <p className="font-medium text-sm">{title}</p>
                                <p className="text-xs text-muted-foreground">{subtitle}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        {getStatusBadge(conv.status)}
                        {conv.lastMessageAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(conv.lastMessageAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </Card>
                      );
                    })
                ) : (
                  <div className="text-center text-muted-foreground p-8">
                    <p>Nenhuma conversa</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            </div>
          </div>

          {/* Área de chat (coluna direita) */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
            {selectedConversation ? (
              <>
                {/* Header do chat */}
                <div className="p-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {selectedContact?.name || `Contato #${selectedConversation.contactId}`}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedContact?.whatsappNumber
                        ? selectedContact.whatsappNumber
                        : `Contato ID: ${selectedConversation.contactId}`}
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">Tempos por card (h:m):</p>
                        <input
                          type="date"
                          className="bg-transparent border border-border rounded px-2 py-1 text-xs text-foreground"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                        />
                      </div>
                      {slaContact?.perStatus?.length ? (
                        slaContact.perStatus.map((s) => {
                          const fmt = (seconds: number) => {
                            const h = Math.floor(seconds / 3600);
                            const m = Math.floor((seconds % 3600) / 60);
                            return `${h}h ${m}m`;
                          };
                          return (
                            <p key={s.status}>
                              {s.status}: {fmt(s.averageSeconds)} média • {fmt(s.totalSeconds)} total
                            </p>
                          );
                        })
                      ) : (
                        <p className="text-muted-foreground">Sem dados neste dia.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedConversation.status === "pending_human" && (
                      <Button size="sm" onClick={handleAssign}>
                        Assumir Conversa
                      </Button>
                    )}
                    {selectedConversation.status !== "closed" && (
                      <Button size="sm" variant="outline" onClick={handleClose}>
                        Encerrar
                      </Button>
                    )}
                  </div>
                </div>

                {/* Mensagens */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    {messages && messages.length > 0 ? (
                      messages.map((msg) => {
                        const isAgent = msg.senderType === "agent";
                        const isBot = msg.senderType === "bot";
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isAgent || isBot ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-lg p-3 group relative ${
                                isAgent
                                  ? "bg-primary text-primary-foreground"
                                  : isBot
                                  ? "bg-secondary text-secondary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                {isBot ? (
                                  <Bot className="w-4 h-4" />
                                ) : isAgent ? (
                                  <UserIcon className="w-4 h-4" />
                                ) : (
                                  <Phone className="w-4 h-4" />
                                )}
                                <span className="text-xs font-medium">
                                  {isBot ? "Bot" : isAgent ? "Você" : "Cliente"}
                                </span>
                              </div>
                                {isAgent && (
                                  <button
                                    onClick={() => {
                                      if (confirm("Tem certeza que deseja apagar esta mensagem para todos?")) {
                                        deleteMessageMutation.mutate({ messageId: msg.id });
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-primary/20 rounded"
                                    title="Apagar mensagem"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {/* Mídia */}
                              {msg.mediaUrl && msg.messageType === "image" && (
                                <div className="mb-2 space-y-1">
                                  <img
                                    src={msg.mediaUrl}
                                    alt="Imagem"
                                    className="max-w-full rounded-md border border-border cursor-pointer"
                                    onClick={() => setPreviewImageUrl(msg.mediaUrl!)}
                                  />
                                  <a
                                    href={msg.mediaUrl}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs underline"
                                  >
                                    Baixar imagem
                                  </a>
                                </div>
                              )}
                              {msg.mediaUrl && msg.messageType === "audio" && (
                                <div className="mb-2">
                                  <audio controls src={msg.mediaUrl} className="w-full" />
                                </div>
                              )}
                              {msg.mediaUrl && msg.messageType === "video" && (
                                <div className="mb-2">
                                  <video controls src={msg.mediaUrl} className="w-full rounded-md" />
                                  <a
                                    href={msg.mediaUrl}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs underline"
                                  >
                                    Baixar vídeo
                                  </a>
                                </div>
                              )}
                              {msg.mediaUrl && msg.messageType === "document" && (
                                <div className="mb-2">
                                  <a
                                    href={msg.mediaUrl}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                  >
                                    Abrir/baixar documento
                                  </a>
                                </div>
                              )}

                              {/* Texto (se houver) */}
                              {msg.content && msg.content.trim().length > 0 && (
                              <p className="text-sm">{msg.content}</p>
                              )}
                              <p className="text-xs opacity-70 mt-1">
                                {new Date(msg.sentAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-muted-foreground">
                        Nenhuma mensagem ainda
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Input de mensagem */}
                {selectedConversation.status !== "closed" && (
                  <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      disabled={sendMessage.isPending}
                    />
                    <Button type="submit" disabled={sendMessage.isPending || !messageText.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Phone className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Selecione uma conversa para começar</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal de visualização de imagem */}
        <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Imagem</DialogTitle>
            </DialogHeader>
            {previewImageUrl ? (
              <div className="space-y-3">
                <img src={previewImageUrl} alt="Imagem" className="w-full h-auto rounded-md" />
                <div className="text-right">
                  <a
                    href={previewImageUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-sm"
                  >
                    Baixar
                  </a>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}
