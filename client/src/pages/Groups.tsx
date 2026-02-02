import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Users, RefreshCw, Info, Crown, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { ArrowLeft } from "lucide-react";

export default function Groups() {
    const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [showParticipants, setShowParticipants] = useState(false);
    const isMobile = useIsMobile();

    const utils = trpc.useUtils();

    // Usar a nova rota de grupos
    const { data: groups, isLoading, refetch } = trpc.groups.list.useQuery();

    // Mutation para sincronizar grupos
    const syncGroups = trpc.groups.sync.useMutation({
        onSuccess: (data) => {
            toast.success(`Sincronizado! ${data.created} novos, ${data.updated} atualizados`);
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao sincronizar grupos");
        },
    });

    // Query para detalhes do grupo selecionado
    const { data: groupDetails, isLoading: loadingDetails } = trpc.groups.getDetails.useQuery(
        { contactId: selectedContactId! },
        { enabled: !!selectedContactId && showParticipants }
    );

    // Filtrar grupos pela busca
    const filteredGroups = groups?.filter(c => {
        const name = c.name || (c.metadata as any)?.subject || "";
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.whatsappNumber.includes(searchTerm);
        return matchesSearch;
    });

    const selectedGroup = groups?.find(g => g.id === selectedContactId);
    const participantCount = selectedGroup ? (selectedGroup.metadata as any)?.participantCount || 0 : 0;

    return (
        <WorkspaceGuard>
            <DashboardLayout>
                <div className="flex h-[calc(100vh-7rem)] gap-4 overflow-hidden">

                    {/* Sidebar - Lista de Grupos */}
                    <Card className={`flex flex-col flex-shrink-0 flex-grow-0 ${isMobile ? 'w-full' : 'w-80'} ${isMobile && selectedContactId ? 'hidden' : ''}`}>
                        <div className="p-4 border-b space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="font-semibold flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Grupos
                                </h2>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => syncGroups.mutate()}
                                    disabled={syncGroups.isPending}
                                >
                                    <RefreshCw className={`w-4 h-4 mr-2 ${syncGroups.isPending ? "animate-spin" : ""}`} />
                                    Sincronizar
                                </Button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar grupos..."
                                    className="pl-8 bg-muted/50"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {isLoading ? (
                                <div className="text-center p-4 text-muted-foreground">Carregando...</div>
                            ) : filteredGroups?.length === 0 ? (
                                <div className="text-center p-8 text-muted-foreground">
                                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>Nenhum grupo encontrado</p>
                                    <p className="text-xs mt-2">Clique em "Sincronizar" para buscar grupos do WhatsApp</p>
                                </div>
                            ) : (
                                filteredGroups?.map((group) => {
                                    const metadata = group.metadata as any;
                                    // Verificar se o nome parece um ID de grupo (números e traços)
                                    const looksLikeGroupId = (name: string) => /^[\d\-@]+$/.test(name);
                                    // Priorizar subject do metadata, depois name (se não for ID)
                                    const groupName = metadata?.subject ||
                                        (group.name && !looksLikeGroupId(group.name) ? group.name : null) ||
                                        metadata?.pushName ||
                                        "Grupo sem nome";
                                    const pCount = metadata?.participantCount || metadata?.participants?.length || 0;

                                    return (
                                        <button
                                            key={group.id}
                                            onClick={() => setSelectedContactId(group.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${selectedContactId === group.id
                                                ? "bg-primary/10 text-primary"
                                                : "hover:bg-muted"
                                                }`}
                                        >
                                            <Avatar>
                                                <AvatarImage src={group.profilePicUrl || undefined} />
                                                <AvatarFallback className="bg-primary/10">
                                                    <Users className="w-4 h-4" />
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">{groupName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {pCount > 0 ? `${pCount} participantes` : group.whatsappNumber}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </Card>

                    {/* Chat Panel - Área Principal */}
                    <Card className={`flex-1 flex flex-col overflow-hidden ${isMobile && !selectedContactId ? 'hidden' : ''}`} style={!isMobile ? { minWidth: 0, maxWidth: 'calc(100% - 336px)' } : {}}>
                        {selectedContactId ? (
                            <>
                                {/* Header personalizado para grupos */}
                                <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {isMobile && (
                                            <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8" onClick={() => setSelectedContactId(null)}>
                                                <ArrowLeft className="w-5 h-5" />
                                            </Button>
                                        )}
                                        <Avatar className="h-10 w-10 shrink-0">
                                            <AvatarImage src={selectedGroup?.profilePicUrl || undefined} />
                                            <AvatarFallback className="bg-primary/10">
                                                <Users className="w-5 h-5" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <h3 className="font-medium leading-none truncate">
                                                {(() => {
                                                    const meta = selectedGroup?.metadata as any;
                                                    const looksLikeId = (n: string) => /^[\d\-@]+$/.test(n);
                                                    return meta?.subject ||
                                                        (selectedGroup?.name && !looksLikeId(selectedGroup.name) ? selectedGroup.name : null) ||
                                                        "Grupo";
                                                })()}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {participantCount > 0 ? `${participantCount} participantes` : "Grupo do WhatsApp"}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowParticipants(true)}
                                        className="shrink-0 ml-2"
                                    >
                                        <Info className="w-4 h-4 mr-2" />
                                        Ver participantes
                                    </Button>
                                </div>

                                {/* Chat Panel */}
                                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                                    <ChatPanel
                                        contactId={selectedContactId}
                                        handleImagePreview={setPreviewImage}
                                        hideHeader={true}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                                <Users className="w-16 h-16 mb-4 opacity-20" />
                                <h3 className="text-lg font-medium">Selecione um grupo</h3>
                                <p>Escolha um grupo na lista ao lado para ver as mensagens</p>
                                <p className="text-xs mt-4 text-center max-w-md">
                                    A IA não responde em grupos. Você pode acompanhar as conversas e enviar mensagens manualmente.
                                </p>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Modal Preview de Imagem */}
                <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex items-center justify-center bg-transparent border-0 shadow-none">
                        {previewImage && (
                            <img
                                src={previewImage}
                                alt="Preview"
                                className="max-w-full max-h-[90vh] object-contain rounded-md"
                            />
                        )}
                    </DialogContent>
                </Dialog>

                {/* Modal de Participantes */}
                <Dialog open={showParticipants} onOpenChange={setShowParticipants}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Users className="w-5 h-5" />
                                Participantes do Grupo
                            </DialogTitle>
                        </DialogHeader>

                        {loadingDetails ? (
                            <div className="py-8 text-center text-muted-foreground">
                                Carregando participantes...
                            </div>
                        ) : groupDetails ? (
                            <div className="space-y-4">
                                {/* Info do grupo */}
                                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={groupDetails.profilePicUrl || undefined} />
                                        <AvatarFallback className="bg-primary/10">
                                            <Users className="w-6 h-6" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <h4 className="font-medium">{groupDetails.name}</h4>
                                        <p className="text-sm text-muted-foreground">
                                            {groupDetails.participantCount} participantes
                                        </p>
                                        {groupDetails.description && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {groupDetails.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <Separator />

                                {/* Lista de participantes */}
                                <ScrollArea className="h-[300px]">
                                    <div className="space-y-2">
                                        {groupDetails.participants.map((participant) => (
                                            <div
                                                key={participant.id}
                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                                            >
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={participant.profilePicUrl || undefined} />
                                                    <AvatarFallback className="text-xs">
                                                        {(participant.name || participant.number || "?")[0]?.toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm truncate">
                                                        {participant.name || participant.number}
                                                    </p>
                                                    {participant.name && participant.name !== participant.number && (
                                                        <p className="text-xs text-muted-foreground">
                                                            +{participant.number}
                                                        </p>
                                                    )}
                                                </div>
                                                {participant.isSuperAdmin && (
                                                    <Crown className="w-4 h-4 text-yellow-500" title="Criador do grupo" />
                                                )}
                                                {participant.admin === "admin" && !participant.isSuperAdmin && (
                                                    <Shield className="w-4 h-4 text-blue-500" title="Administrador" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-muted-foreground">
                                Não foi possível carregar os participantes
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

            </DashboardLayout>
        </WorkspaceGuard>
    );
}
