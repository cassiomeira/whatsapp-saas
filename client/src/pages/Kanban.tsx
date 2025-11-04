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
import { Phone, X, Send, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Contact = {
  id: number;
  name: string | null;
  whatsappNumber: string;
  kanbanStatus: string | null;
  profilePicUrl: string | null;
};

const KANBAN_COLUMNS = [
  { id: "new_contact", title: "Novo Contato", color: "bg-blue-500" },
  { id: "contacted", title: "Contatado", color: "bg-yellow-500" },
  { id: "waiting_attendant", title: "Aguardando Atendente", color: "bg-orange-500" },
  { id: "negotiating", title: "Negociando", color: "bg-purple-500" },
  { id: "sold", title: "Vendido", color: "bg-green-500" },
  { id: "lost", title: "Perdido", color: "bg-red-500" },
];

function ContactCard({ contact, onClick }: { contact: Contact; onClick?: () => void }) {
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
      <Card className="p-3 hover:shadow-md transition-shadow hover:ring-2 hover:ring-primary">
        <div className="flex items-start gap-3">
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
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{contact.name || "Sem nome"}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Phone className="w-3 h-3" />
              <span className="truncate">{contact.whatsappNumber}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DroppableColumn({ 
  column, 
  contacts,
  onContactClick
}: { 
  column: typeof KANBAN_COLUMNS[0]; 
  contacts: Contact[];
  onContactClick: (contact: Contact) => void;
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
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${column.color}`} />
          <CardTitle className="text-base">{column.title}</CardTitle>
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
              <ContactCard key={contact.id} contact={contact} onClick={() => onContactClick(contact)} />
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
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const handleContactClick = (contact: Contact) => {
    // Abrir painel lateral de chat
    setSelectedContact(contact);
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
    return contacts?.filter((c) => c.kanbanStatus === status) || [];
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">CRM Kanban</h1>
            <p className="text-muted-foreground">Arraste os cards para mudar o status dos contatos</p>
          </div>

          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter}
            onDragStart={handleDragStart} 
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Atualizar agora
            </Button>
          </div>

          {KANBAN_COLUMNS.map((column) => {
                const columnContacts = getContactsByStatus(column.id);
                return (
                  <DroppableColumn 
                    key={column.id} 
                    column={column} 
                    contacts={columnContacts}
                    onContactClick={handleContactClick}
                  />
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
                  <p className="font-medium">{selectedContact.name || "Sem nome"}</p>
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

