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
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Phone, X, Send, Maximize2, Plus, Trash2, Pencil, Archive, MessageSquarePlus, Paperclip, Mic, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

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
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newConversationNumber, setNewConversationNumber] = useState("");
  const [newConversationName, setNewConversationName] = useState("");
  const [isStartingConversation, setIsStartingConversation] = useState(false);

  const { data: workspace, refetch: refetchWorkspace } = trpc.workspaces.current.useQuery();
  const { data: contacts, refetch } = trpc.contacts.list.useQuery(undefined, {
    refetchInterval: autoRefresh ? 5000 : false,
    refetchOnWindowFocus: true,
  });
  const startConversationMutation = trpc.contacts.startConversation.useMutation();

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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
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

  const handleStartNewConversation = async () => {
    if (!newConversationNumber.trim()) {
      toast.error("Por favor, informe o número do WhatsApp");
      return;
    }

    setIsStartingConversation(true);
    try {
      const result = await startConversationMutation.mutateAsync({
        whatsappNumber: newConversationNumber.trim(),
        name: newConversationName.trim() || undefined,
      });

      toast.success("Conversa iniciada com sucesso!");
      setNewConversationOpen(false);
      setNewConversationNumber("");
      setNewConversationName("");
      
      // Atualizar lista de contatos
      const { data: updatedContacts } = await refetch();
      
      // Buscar o contato atualizado na lista ou usar o retornado
      const newContact = updatedContacts?.find(c => c.id === result.contactId) || result.contact;
      if (newContact) {
        setSelectedContact(newContact as Contact);
      }
    } catch (error: any) {
      console.error("Erro ao iniciar conversa:", error);
      toast.error(error?.message || "Erro ao iniciar conversa");
    } finally {
      setIsStartingConversation(false);
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
              <Button onClick={() => setNewConversationOpen(true)} variant="default">
                <MessageSquarePlus className="w-4 h-4 mr-2" />
                Nova Conversa
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

        {/* Dialog para Nova Conversa */}
        <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Iniciar Nova Conversa</DialogTitle>
              <DialogDescription>
                Digite o número do WhatsApp do cliente para iniciar uma conversa. A IA não irá interferir nesta conversa.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp-number">Número do WhatsApp *</Label>
                <Input
                  id="whatsapp-number"
                  placeholder="5511999999999 ou +5511999999999"
                  value={newConversationNumber}
                  onChange={(e) => setNewConversationNumber(e.target.value)}
                  disabled={isStartingConversation}
                />
                <p className="text-xs text-muted-foreground">
                  Digite o número com código do país (ex: 5511999999999)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-name">Nome do Cliente (opcional)</Label>
                <Input
                  id="contact-name"
                  placeholder="Nome do cliente"
                  value={newConversationName}
                  onChange={(e) => setNewConversationName(e.target.value)}
                  disabled={isStartingConversation}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setNewConversationOpen(false);
                  setNewConversationNumber("");
                  setNewConversationName("");
                }}
                disabled={isStartingConversation}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleStartNewConversation}
                disabled={isStartingConversation || !newConversationNumber.trim()}
              >
                {isStartingConversation ? "Iniciando..." : "Iniciar Conversa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}

// Componente de Chat
function ChatPanel({ contactId }: { contactId: number }) {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isFFmpegLoading, setIsFFmpegLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const ffmpegLoadPromiseRef = useRef<Promise<FFmpeg | null> | null>(null);
  const isUserScrollingRef = useRef(false);
  const wasAtBottomRef = useRef(true);
  const previousMessagesLengthRef = useRef(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  const { data: conversations } = trpc.conversations.list.useQuery();
  const conversation = conversations?.find(c => c.contactId === contactId);
  const { data: messages, refetch } = trpc.messages.list.useQuery(
    { conversationId: conversation?.id || 0 },
    { enabled: !!conversation?.id, refetchInterval: 3000 } // Atualiza a cada 3 segundos
  );
  const sendMessage = trpc.messages.send.useMutation();
  const uploadMedia = trpc.messages.uploadMedia.useMutation();

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
  }, [conversation?.id]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith("image/")) {
        setFilePreview(URL.createObjectURL(file));
      } else if (file.type.startsWith("audio/")) {
        setFilePreview(URL.createObjectURL(file));
      } else if (file.type.startsWith("video/")) {
        setFilePreview(URL.createObjectURL(file));
      }
    }
  };

  const removeFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadFFmpeg = useCallback(async (): Promise<FFmpeg | null> => {
    if (ffmpegRef.current) {
      console.log("[Audio] FFmpeg já está carregado, reutilizando instância");
      return ffmpegRef.current;
    }

    if (ffmpegLoadPromiseRef.current) {
      console.log("[Audio] FFmpeg já está sendo carregado, aguardando...");
      return ffmpegLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
      setIsFFmpegLoading(true);
      try {
        console.log("[Audio] Criando nova instância FFmpeg...");
        const instance = new FFmpeg();
        
        console.log("[Audio] Preparando URLs dos arquivos WASM...");
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        
        console.log("[Audio] Convertendo ffmpeg-core.js para blob URL...");
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
        console.log("[Audio] ffmpeg-core.js convertido:", coreURL.substring(0, 50) + "...");
        
        console.log("[Audio] Convertendo ffmpeg-core.wasm para blob URL...");
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");
        console.log("[Audio] ffmpeg-core.wasm convertido:", wasmURL.substring(0, 50) + "...");
        
        console.log("[Audio] Carregando FFmpeg WASM (isso pode levar alguns segundos)...");
        const loadStartTime = Date.now();
        
        // Timeout de 60 segundos para o carregamento
        const loadTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Timeout: carregamento do FFmpeg demorou mais de 60 segundos")), 60000);
        });
        
        await Promise.race([
          instance.load({ coreURL, wasmURL }),
          loadTimeout
        ]);
        
        const loadDuration = Date.now() - loadStartTime;
        console.log(`[Audio] FFmpeg WASM carregado com sucesso em ${loadDuration}ms`);
        
        ffmpegRef.current = instance;
        return instance;
      } catch (error: any) {
        console.error("[Audio] Falha ao carregar FFmpeg WASM:", error);
        console.error("[Audio] Erro detalhado:", error.message);
        console.error("[Audio] Stack:", error.stack);
        
        const errorMessage = error?.message || "Erro desconhecido";
        if (errorMessage.includes("Timeout")) {
          toast.error("Carregamento do conversor demorou muito. Verifique sua conexão e tente novamente.");
        } else {
          toast.error("Falha ao carregar o conversor de áudio (FFmpeg). Tente novamente.");
        }
        return null;
      } finally {
        setIsFFmpegLoading(false);
        ffmpegLoadPromiseRef.current = null;
      }
    })();

    ffmpegLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }, []);

  const convertWebMToOGG = async (webmFile: File): Promise<Blob | null> => {
    try {
      console.log("[Audio] Iniciando conversão WebM para OGG/Opus com FFmpeg...");
      console.log("[Audio] Arquivo original:", {
        name: webmFile.name,
        size: webmFile.size,
        type: webmFile.type
      });

      console.log("[Audio] Carregando FFmpeg...");
      const ffmpeg = await loadFFmpeg();
      if (!ffmpeg) {
        throw new Error("FFmpeg não está disponível");
      }
      console.log("[Audio] FFmpeg carregado com sucesso");

      const inputName = `input-${Date.now()}.webm`;
      const outputName = `output-${Date.now()}.ogg`;

      console.log("[Audio] Lendo arquivo WebM...");
      const fileData = await fetchFile(webmFile);
      console.log("[Audio] Arquivo lido, tamanho:", fileData.byteLength, "bytes");

      console.log("[Audio] Escrevendo arquivo temporário no FFmpeg...");
      await ffmpeg.writeFile(inputName, fileData);
      console.log("[Audio] Arquivo temporário escrito");

      console.log("[Audio] Executando conversão FFmpeg...");
      const execPromise = ffmpeg.exec([
        "-i",
        inputName,
        "-vn",
        "-ac",
        "1",
        "-c:a",
        "libopus",
        "-b:a",
        "64000",
        "-compression_level",
        "10",
        "-f",
        "ogg",
        outputName,
      ]);

      // Timeout de 30 segundos para a conversão
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout: conversão demorou mais de 30 segundos")), 30000);
      });

      await Promise.race([execPromise, timeoutPromise]);
      console.log("[Audio] Conversão FFmpeg concluída");

      console.log("[Audio] Lendo arquivo OGG convertido...");
      const data = await ffmpeg.readFile(outputName);
      console.log("[Audio] Arquivo OGG lido, tamanho:", data.byteLength, "bytes");

      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        console.log("[Audio] Arquivos temporários removidos");
      } catch (cleanupError) {
        console.warn("[Audio] Erro ao limpar arquivos temporários:", cleanupError);
        // Ignorar erros ao limpar arquivos temporários
      }

      const oggBlob = new Blob([data], { type: "audio/ogg" });
      console.log("[Audio] Blob OGG criado, tamanho:", oggBlob.size, "bytes");

      if (oggBlob.size === 0) {
        throw new Error("Arquivo OGG acabou vazio após conversão");
      }

      console.log("[Audio] Conversão para OGG concluída com sucesso:", {
        original: webmFile.size,
        converted: oggBlob.size,
        ratio: ((oggBlob.size / webmFile.size) * 100).toFixed(1) + "%"
      });

      return oggBlob;
    } catch (error: any) {
      console.error("[Audio] Erro ao converter WebM para OGG:", error);
      console.error("[Audio] Erro detalhado:", error.message);
      console.error("[Audio] Stack:", error.stack);
      return null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Verificar formatos suportados e priorizar OGG (compatível com WhatsApp)
      const supportedFormats = [
        { mime: "audio/ogg; codecs=opus", ext: "ogg", name: "OGG Opus" },
        { mime: "audio/webm; codecs=opus", ext: "webm", name: "WebM Opus" },
        { mime: "audio/webm", ext: "webm", name: "WebM" },
        { mime: "audio/mp4", ext: "m4a", name: "MP4" },
      ];
      
      let selectedFormat = supportedFormats.find(f => MediaRecorder.isTypeSupported(f.mime));
      
      if (!selectedFormat) {
        // Fallback: usar o formato padrão do navegador
        selectedFormat = { mime: "", ext: "webm", name: "WebM (padrão)" };
      }
      
      console.log(`[Audio] Formatos suportados:`, supportedFormats.map(f => ({
        format: f.name,
        supported: MediaRecorder.isTypeSupported(f.mime)
      })));
      console.log(`[Audio] Usando formato: ${selectedFormat.name} (${selectedFormat.mime})`);
      
      const options: MediaRecorderOptions = {};
      if (selectedFormat.mime) {
        options.mimeType = selectedFormat.mime;
      }
      
      const recorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedFormat.mime || "audio/webm" });
        
        // Criar arquivo imediatamente sem conversão (não travar a UI)
        const file = new File([audioBlob], `audio-${Date.now()}.${selectedFormat.ext}`, { 
          type: selectedFormat.mime || "audio/webm" 
        });
        setSelectedFile(file);
        setFilePreview(URL.createObjectURL(file));
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
        
        // Registrar no log o formato gravado (sem exibir toast para não cobrir os botões)
        console.log(`[Audio] Áudio gravado em ${selectedFormat.name} (${selectedFormat.mime || "padrão"})`);
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      
      // Mostrar no log qual formato está sendo usado (sem toast para não atrapalhar UI)
      console.log(`[Audio] Gravando em ${selectedFormat.name}...`);
    } catch (error) {
      toast.error("Erro ao iniciar gravação de áudio");
      console.error("Error starting audio recording:", error);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleSend = async () => {
    if (!conversation) return;
    if (!message.trim() && !selectedFile) {
      toast.error("Digite uma mensagem ou selecione um arquivo.");
      return;
    }

    try {
      let mediaUrl: string | undefined = undefined;
      let mediaType: "image" | "audio" | "video" | "document" | undefined = undefined;
      let caption = message.trim();

      // Se houver arquivo, fazer upload primeiro
      if (selectedFile) {
        let fileToUpload = selectedFile;
        let finalMediaType = mediaType; // Variável para controlar o tipo final
        
        // Detectar se é WebM (por tipo MIME ou extensão)
        const isWebM = selectedFile.type.includes('webm') || 
                       selectedFile.name.toLowerCase().endsWith('.webm') ||
                       selectedFile.name.toLowerCase().includes('webm');
        
        // Se for áudio WebM, converter para OGG (compatível com WhatsApp)
        if (selectedFile.type.includes('audio') && isWebM) {
          console.log("[Audio] Detectado WebM, iniciando conversão...", {
            fileName: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size
          });
          
          if (isFFmpegLoading) {
            toast.info("Carregando conversor de áudio (FFmpeg WASM ~7MB, primeira vez pode demorar)...");
          } else {
            toast.info("Convertendo áudio WebM para OGG (pode levar 10-30 segundos)...");
          }
          
          try {
            const convertedBlob = await convertWebMToOGG(selectedFile);
            
            if (convertedBlob && convertedBlob.size > 0) {
              fileToUpload = new File([convertedBlob], selectedFile.name.replace(/\.webm$/i, '.ogg'), { 
                type: 'audio/ogg' 
              });
              finalMediaType = "audio"; // Enviar como áudio OGG
              toast.success("Áudio convertido para OGG com sucesso!");
              console.log("[Audio] Arquivo convertido:", {
                original: selectedFile.name,
                converted: fileToUpload.name,
                originalSize: selectedFile.size,
                convertedSize: fileToUpload.size
              });
            } else {
              // Se falhar, NÃO enviar - WebM não funciona no WhatsApp
              console.error("[Audio] Conversão retornou null ou arquivo vazio");
              toast.error("Conversão falhou. WebM não é compatível com WhatsApp. Tente gravar ou converter novamente.");
              throw new Error("Conversão falhou: arquivo vazio ou null");
            }
          } catch (error: any) {
            console.error("[Audio] Erro na conversão:", error);
            console.error("[Audio] Stack:", error?.stack);
            
            const errorMessage = error?.message || "Erro desconhecido";
            if (errorMessage.includes("Timeout")) {
              toast.error("Conversão demorou muito. O arquivo pode ser muito grande. Tente gravar um áudio mais curto.");
            } else {
              toast.error(`Erro na conversão: ${errorMessage}. WebM não é compatível com WhatsApp. Tente gravar novamente.`);
            }
            throw error; // Impede o envio
          }
        } else if (selectedFile.type.includes('audio') && !isWebM) {
          // Se for outro formato de áudio (não WebM), tentar enviar como áudio
          console.log("[Audio] Formato de áudio não-WebM detectado:", selectedFile.type);
          finalMediaType = "audio";
        }
        
        // Usar o tipo final determinado acima
        mediaType = finalMediaType;
        
        const reader = new FileReader();
        reader.readAsDataURL(fileToUpload);
        
        await new Promise<void>((resolve, reject) => {
          reader.onloadend = async () => {
            try {
              const base64Data = (reader.result as string).split(",")[1];
              const uploadResult = await uploadMedia.mutateAsync({
                fileName: fileToUpload.name,
                fileType: fileToUpload.type,
                fileSize: fileToUpload.size,
                fileData: base64Data,
              });
              
              mediaUrl = uploadResult.mediaUrl;
              // IMPORTANTE: Preservar o mediaType escolhido (document para áudios)
              // Se foi definido como "document", manter como "document"
              if (finalMediaType) {
                mediaType = finalMediaType;
              } else {
                mediaType = uploadResult.mediaType;
              }
              console.log(`[Messages] Tipo de mídia final: ${mediaType} (escolhido: ${finalMediaType || "auto"})`);
              resolve();
            } catch (uploadError) {
              reject(uploadError);
            }
          };
          reader.onerror = (error) => reject(error);
        });
      }

      // Enviar mensagem
      // Só enviar mediaUrl e mediaType se realmente houver mídia
      const messagePayload: any = {
        conversationId: conversation.id,
        content: caption || undefined,
        caption: caption || undefined,
      };
      
      // Só adicionar mídia se houver arquivo
      if (mediaUrl && mediaType) {
        messagePayload.mediaUrl = mediaUrl;
        messagePayload.mediaType = mediaType;
      }
      
      await sendMessage.mutateAsync(messagePayload);
      
      setMessage("");
      removeFile();
      refetch();
    } catch (error) {
      toast.error("Erro ao enviar mensagem/mídia");
      console.error("Error sending message/media:", error);
    }
  };

  return (
    <>
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
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
                  {/* Exibir mídia se houver */}
                  {msg.mediaUrl && msg.messageType === "image" && (
                    <div className="mb-2 space-y-1">
                      <img 
                        src={msg.mediaUrl} 
                        alt="Imagem" 
                        className="max-w-full h-auto rounded-md max-h-64 object-cover cursor-zoom-in" 
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
                    <audio 
                      controls 
                      src={msg.mediaUrl} 
                      className="w-full mb-2"
                      style={{ maxWidth: "300px" }}
                    />
                  )}
                  {msg.mediaUrl && msg.messageType === "video" && (
                    <video 
                      controls 
                      src={msg.mediaUrl} 
                      className="max-w-full h-auto rounded-md mb-2 max-h-64"
                    />
                  )}
                  {msg.mediaUrl && msg.messageType === "document" && (
                    <div className="mb-2 flex items-center gap-2">
                      <Paperclip className="w-4 h-4" />
                      <a 
                        href={msg.mediaUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="underline hover:opacity-80"
                      >
                        {msg.content || "Documento"}
                      </a>
                    </div>
                  )}
                  
                  {/* Exibir texto se houver (e não for apenas placeholder de mídia) */}
                  {msg.content && 
                   !(msg.mediaUrl && (msg.content === "[audio]" || msg.content === "[image]" || msg.content === "[video]" || msg.content === "[document]")) && (
                    <p className="text-sm">{msg.content}</p>
                  )}
                  
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
        {/* Preview de arquivo selecionado */}
        {selectedFile && (
          <div className="relative p-2 border rounded-md mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedFile.type.startsWith("image/") && filePreview && (
                <img src={filePreview} alt="Preview" className="w-12 h-12 object-cover rounded-md" />
              )}
              {selectedFile.type.startsWith("audio/") && filePreview && (
                <audio controls src={filePreview} className="w-32" />
              )}
              {selectedFile.type.startsWith("video/") && filePreview && (
                <video controls src={filePreview} className="w-32 h-12 object-cover rounded-md" />
              )}
              {!selectedFile.type.startsWith("image/") && !selectedFile.type.startsWith("audio/") && !selectedFile.type.startsWith("video/") && (
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="text-sm truncate">{selectedFile.name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={removeFile}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        
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
            disabled={isRecording}
          />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,audio/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
          />
          <Button 
            size="icon" 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          {isRecording ? (
            <Button size="icon" variant="destructive" onClick={stopRecording}>
              <StopCircle className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              size="icon" 
              variant="outline" 
              onClick={startRecording}
              disabled={selectedFile !== null}
            >
              <Mic className="w-4 h-4" />
            </Button>
          )}
          <Button 
            size="icon" 
            onClick={handleSend} 
            disabled={(!message.trim() && !selectedFile) || isRecording}
          >
            <Send className="w-4 h-4" />
          </Button>
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
    </>
  );
}

