import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
  useSensor, 
  useSensors,
  useDroppable,
  closestCenter,
  DragOverEvent
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Phone, X, Send, Maximize2, Plus, Trash2, Pencil, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Contact = {
  id: number;
  name: string | null;
  whatsappNumber: string;
  kanbanStatus: string | null;
  profilePicUrl: string | null;
  metadata?: Record<string, any> | null;
};

type KanbanColumn = {
  id: string;
  title: string;
  color: string;
  isSeller?: boolean;
};

type SellerColumn = {
  id: string;
  name: string;
};

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "new_contact", title: "Novo Contato", color: "bg-blue-500" },
  { id: "waiting_attendant", title: "Aguardando Atendente", color: "bg-orange-500" },
  { id: "negotiating", title: "Negociando", color: "bg-purple-500" },
];

function ContactCard({ contact, onClick, onArchive }: { contact: Contact; onClick?: () => void; onArchive?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `contact-${contact.id}`,
    data: {
      type: 'contact',
      contact,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'pointer',
  };

  const hasUnread = Boolean(contact.metadata?.unread);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      onClick={(e) => {
        // Só chama onClick se não estiver arrastando
        if (!isDragging && onClick) {
          onClick();
        }
      }}
    >
      <Card className="relative p-3 hover:shadow-md transition-shadow hover:ring-2 hover:ring-primary">
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-background" />
        )}
        <div className="flex items-start justify-between gap-3">
          {contact.profilePicUrl ? (
            <img
              src={contact.profilePicUrl}
              alt={contact.name || "Contato"}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {contact.name?.charAt(0).toUpperCase() || "?"}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0 pr-2">
            <p className="font-medium text-sm truncate">{contact.name || "Sem nome"}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Phone className="w-3 h-3" />
              <span className="truncate">{contact.whatsappNumber}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {onArchive && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
              >
                <Archive className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function DroppableColumn({ 
  column, 
  contacts,
  onContactClick,
  onArchiveContact,
  onDeleteSellerColumn,
}: { 
  column: KanbanColumn; 
  contacts: Contact[];
  onContactClick: (contact: Contact) => void;
  onArchiveContact: (contact: Contact) => void;
  onDeleteSellerColumn?: (columnId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      columnId: column.id,
    },
  });

  return (
    <Card 
      ref={setNodeRef} 
      className={`flex flex-col h-[calc(100vh-250px)] transition-all ${
        isOver ? "ring-2 ring-primary bg-primary/5" : ""
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${column.color}`} />
            <CardTitle className="text-base">{column.title}</CardTitle>
          </div>
          {column.isSeller && onDeleteSellerColumn && (
            <Button
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-600"
              onClick={() => onDeleteSellerColumn(column.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {contacts.length} {contacts.length === 1 ? "contato" : "contatos"}
        </p>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-2">
        <SortableContext
          items={contacts.map((c) => `contact-${c.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {contacts.length > 0 ? (
            contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onClick={() => onContactClick(contact)}
                onArchive={() => onArchiveContact(contact)}
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Nenhum contato
            </div>
          )}
        </SortableContext>
      </CardContent>
    </Card>
  );
}

export default function Kanban() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: workspace, refetch: refetchWorkspace } = trpc.workspaces.current.useQuery();
  const { data: contacts, refetch } = trpc.contacts.list.useQuery(undefined, {
    refetchInterval: autoRefresh ? 5000 : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      refetch();
    }, 5000);

    return () => clearInterval(timer);
  }, [refetch]);
  const updateStatus = trpc.contacts.updateKanbanStatus.useMutation();
  const updateKanbanSeller = trpc.workspaces.updateKanbanSeller.useMutation();
  const renameContactMutation = trpc.contacts.rename.useMutation();
  const markAsReadMutation = trpc.contacts.markAsRead.useMutation();
  const archiveContactMutation = trpc.contacts.archive.useMutation();
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const sellerColumns: SellerColumn[] = Array.isArray(
    (workspace?.metadata as any)?.kanbanSellerColumns
  )
    ? (workspace?.metadata as any).kanbanSellerColumns
    : [];

  const dynamicColumns: KanbanColumn[] = sellerColumns.map((column) => ({
    id: column.id,
    title: column.name,
    color: "bg-emerald-500",
    isSeller: true,
  }));

  const kanbanColumns = [...DEFAULT_COLUMNS, ...dynamicColumns];
  const allowedStatuses = new Set(kanbanColumns.map((column) => column.id));

  const normalizeStatus = (status?: string | null) => {
    if (status === "archived") {
      return null;
    }
    if (status && allowedStatuses.has(status)) {
      return status;
    }
    return "waiting_attendant";
  };

  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
    markAsReadMutation
      .mutateAsync({ contactId: contact.id })
      .then(() => refetch())
      .catch(() => undefined);
  };

  const handleAddSellerColumn = async () => {
    const name = window.prompt("Nome do vendedor?");
    if (!name || !name.trim()) {
      return;
    }

    try {
      await updateKanbanSeller.mutateAsync({
        action: "add",
        name: name.trim(),
      });
      toast.success("Coluna criada com sucesso!");
      await refetchWorkspace();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar coluna");
    }
  };

  const handleDeleteSellerColumn = async (columnId: string) => {
    if (
      !window.confirm(
        "Deseja remover esta coluna? Todos os contatos nela voltarão para 'Aguardando Atendente'."
      )
    ) {
      return;
    }

    try {
      await updateKanbanSeller.mutateAsync({
        action: "delete",
        columnId,
      });
      toast.success("Coluna removida!");
      await Promise.all([refetchWorkspace(), refetch()]);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao remover coluna");
    }
  };

  const handleRenameContact = async () => {
    if (!selectedContact) return;
    const newName = window.prompt(
      "Novo nome do contato",
      selectedContact.name || ""
    )?.trim();
    if (!newName) return;

    try {
      await renameContactMutation.mutateAsync({
        contactId: selectedContact.id,
        name: newName,
      });
      toast.success("Contato renomeado!");
      setSelectedContact({ ...selectedContact, name: newName });
      await refetch();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao renomear contato");
    }
  };

  const handleArchiveContact = async (contact: Contact) => {
    if (
      !window.confirm(
        "Remover este contato do quadro? Ele vai reaparecer automaticamente se enviar uma nova mensagem."
      )
    ) {
      return;
    }

    try {
      await archiveContactMutation.mutateAsync({ contactId: contact.id });
      toast.success("Contato removido do quadro. Ele voltará ao enviar nova mensagem.");
      await refetch();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao remover contato");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const contactId = event.active.id.toString().replace('contact-', '');
    const contact = contacts?.find((c) => c.id === parseInt(contactId));
    if (contact) {
      setActiveContact(contact);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveContact(null);

    if (!over) return;

    // Extrair ID do contato
    const contactId = parseInt(active.id.toString().replace('contact-', ''));
    
    // O over.id pode ser o ID da coluna ou de outro card
    let newStatus = over.id.toString();
    
    // Se dropou em outro card, pegar a coluna desse card
    if (newStatus.startsWith('contact-')) {
      const overContactId = parseInt(newStatus.replace('contact-', ''));
      const overContact = contacts?.find((c) => c.id === overContactId);
      if (overContact?.kanbanStatus) {
        newStatus = overContact.kanbanStatus;
      }
    }

    const contact = contacts?.find((c) => c.id === contactId);
    if (!contact || contact.kanbanStatus === newStatus) return;

    if (!allowedStatuses.has(newStatus)) {
      newStatus = "waiting_attendant";
    }

    try {
      await updateStatus.mutateAsync({
        contactId,
        status: newStatus,
      });
      
      toast.success("Status atualizado!");
      refetch();
    } catch (error) {
      toast.error("Erro ao atualizar status");
      console.error(error);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) return;

    // Feedback visual durante o drag
    console.log('Dragging over:', over.id);
  };

  const getContactsByStatus = (status: string) => {
    return (
      contacts
        ?.filter((c) => {
          const normalized = normalizeStatus(c.kanbanStatus || "new_contact");
          if (!normalized) return false;
          return normalized === status;
        }) || []
    );
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-8">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">CRM Kanban</h1>
              <p className="text-muted-foreground">Arraste os cards para mudar o status dos contatos</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setAutoRefresh((prev) => !prev)}>
                {autoRefresh ? "Pausar auto refresh" : "Ativar auto refresh"}
              </Button>
              <Button onClick={handleAddSellerColumn}>
                <Plus className="w-4 h-4 mr-2" />
                Novo vendedor
              </Button>
            </div>
          </div>

          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter}
            onDragStart={handleDragStart} 
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Atualizar agora
              </Button>
            </div>

            <div className="flex flex-wrap gap-4">
              {kanbanColumns.map((column) => {
                const columnContacts = getContactsByStatus(column.id);
                return (
                  <div
                    key={column.id}
                    className="flex-1 min-w-[260px] max-w-[360px]"
                  >
                    <DroppableColumn
                      column={column}
                      contacts={columnContacts}
                      onContactClick={handleContactClick}
                  onArchiveContact={handleArchiveContact}
                      onDeleteSellerColumn={
                        column.isSeller ? () => handleDeleteSellerColumn(column.id) : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>

            <DragOverlay>
              {activeContact ? (
                <Card className="p-3 shadow-lg rotate-3 opacity-90">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {activeContact.name?.charAt(0).toUpperCase() || "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{activeContact.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{activeContact.whatsappNumber}</p>
                    </div>
                  </div>
                </Card>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Painel Lateral de Chat */}
        {selectedContact && (
          <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-lg z-50 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                {selectedContact.profilePicUrl ? (
                  <img
                    src={selectedContact.profilePicUrl}
                    alt={selectedContact.name || "Contato"}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {selectedContact.name?.charAt(0).toUpperCase() || "?"}
                    </span>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{selectedContact.name || "Sem nome"}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRenameContact}
                      title="Renomear contato"
                      className="h-8 w-8"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedContact.whatsappNumber}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.location.href = `/inbox?contact=${selectedContact.id}`}
                  title="Expandir em tela cheia"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedContact(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Mensagens */}
            <ChatPanel contactId={selectedContact.id} />
          </div>
        )}
      </DashboardLayout>
    </WorkspaceGuard>
  );
}

// Componente de Chat
function ChatPanel({ contactId }: { contactId: number }) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: conversations } = trpc.conversations.list.useQuery();
  const conversation = conversations?.find(c => c.contactId === contactId);
  const { data: messages, refetch } = trpc.messages.list.useQuery(
    { conversationId: conversation?.id || 0 },
    { enabled: !!conversation?.id, refetchInterval: 3000 } // Atualiza a cada 3 segundos
  );
  const sendMessage = trpc.messages.send.useMutation();

  // Scroll automático para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || !conversation) return;

    try {
      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        content: message,
      });
      setMessage("");
      refetch();
      // Toast removido para não atrapalhar digitação
    } catch (error) {
      toast.error("Erro ao enviar mensagem");
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {!conversation ? (
            <div className="text-center text-sm text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : !messages || messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">
              Nenhuma mensagem ainda
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.senderType === "contact" ? "justify-start" : "justify-end"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.senderType === "contact"
                      ? "bg-muted"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(msg.sentAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input de mensagem */}
      <div className="p-4 border-t flex-shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Digite sua mensagem..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button size="icon" onClick={handleSend} disabled={!message.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

