import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Send, Bot, User as UserIcon, Phone, Clock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Inbox() {
  const { user } = useAuth();
  const { data: conversations } = trpc.conversations.list.useQuery();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const { data: messages, refetch: refetchMessages } = trpc.messages.list.useQuery(
    { conversationId: selectedConversationId! },
    { enabled: !!selectedConversationId }
  );
  const sendMessage = trpc.messages.send.useMutation();
  const assignConversation = trpc.conversations.assign.useMutation();
  const closeConversation = trpc.conversations.close.useMutation();
  
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations?.find(c => c.id === selectedConversationId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        <div className="h-[calc(100vh-4rem)] flex">
          {/* Lista de conversas */}
          <div className="w-80 border-r flex flex-col">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-lg">Conversas</h2>
              <p className="text-sm text-muted-foreground">
                {conversations?.length || 0} {conversations?.length === 1 ? "conversa" : "conversas"}
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {conversations && conversations.length > 0 ? (
                  conversations.map((conv) => (
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
                            <p className="font-medium text-sm">Conversa #{conv.id}</p>
                            <p className="text-xs text-muted-foreground">Contato ID: {conv.contactId}</p>
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
                  ))
                ) : (
                  <div className="text-center text-muted-foreground p-8">
                    <p>Nenhuma conversa</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Área de chat */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Header do chat */}
                <div className="p-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Conversa #{selectedConversation.id}</h3>
                    <p className="text-sm text-muted-foreground">
                      Contato ID: {selectedConversation.contactId}
                    </p>
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
                <ScrollArea className="flex-1 p-4">
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
                              className={`max-w-[70%] rounded-lg p-3 ${
                                isAgent
                                  ? "bg-primary text-primary-foreground"
                                  : isBot
                                  ? "bg-secondary text-secondary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
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
                              <p className="text-sm">{msg.content}</p>
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
                </ScrollArea>

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
      </DashboardLayout>
    </WorkspaceGuard>
  );
}
