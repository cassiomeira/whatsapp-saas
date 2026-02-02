import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { X, Send, Paperclip, Mic, StopCircle, Camera, Smile, Trash2, Forward, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CameraCapture from "@/components/CameraCapture";
import { trpc } from "@/lib/trpc";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ChatPanelProps {
    contactId: number;
    handleImagePreview: (url: string) => void;
    hideHeader?: boolean;
}

export default function ChatPanel({ contactId, handleImagePreview, hideHeader = false }: ChatPanelProps) {
    const [message, setMessage] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isFFmpegLoading, setIsFFmpegLoading] = useState(false);
    const [forwardMessageId, setForwardMessageId] = useState<number | null>(null);
    const [forwardSearch, setForwardSearch] = useState("");
    const [forwardFilter, setForwardFilter] = useState<'all' | 'contacts' | 'groups'>('all');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const ffmpegRef = useRef<FFmpeg | null>(null);
    const ffmpegLoadPromiseRef = useRef<Promise<FFmpeg | null> | null>(null);
    const isUserScrollingRef = useRef(false);
    const wasAtBottomRef = useRef(true);
    const previousMessagesLengthRef = useRef(0);

    const { data: conversations } = trpc.conversations.list.useQuery();
    const conversation = conversations?.find(c => c.contactId === contactId);
    const { data: messages, refetch } = trpc.messages.list.useQuery(
        { conversationId: conversation?.id || 0 },
        { enabled: !!conversation?.id, refetchInterval: 3000 }
    );

    const { data: contacts } = trpc.contacts.list.useQuery();
    const { data: groups } = trpc.groups.list.useQuery();

    const startConversation = trpc.contacts.startConversation.useMutation();

    const sendMessage = trpc.messages.send.useMutation();
    const uploadMedia = trpc.messages.uploadMedia.useMutation();
    const deleteMessageMutation = trpc.messages.deleteForEveryone.useMutation({
        onSuccess: () => {
            refetch();
            toast.success("Mensagem apagada");
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao apagar mensagem");
        },
    });

    // Verificar se o usuário está no final do scroll
    const checkIfAtBottom = () => {
        const container = messagesContainerRef.current;
        if (!container) return false;

        const threshold = 100;
        const isAtBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;

        wasAtBottomRef.current = isAtBottom;
        return isAtBottom;
    };

    // Scroll automático
    useEffect(() => {
        const hasNewMessages = messages && messages.length > previousMessagesLengthRef.current;
        previousMessagesLengthRef.current = messages?.length || 0;

        if (wasAtBottomRef.current || hasNewMessages) {
            setTimeout(() => {
                if (!isUserScrollingRef.current) {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }
            }, 100);
        }
    }, [messages]);

    // Detectar scroll manual
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        let scrollTimeout: NodeJS.Timeout;

        const handleScroll = () => {
            isUserScrollingRef.current = true;
            checkIfAtBottom();

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isUserScrollingRef.current = false;
            }, 1000);
        };

        container.addEventListener('scroll', handleScroll);
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
            if (file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/")) {
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

    const handleCameraCapture = (file: File, type: "image" | "video") => {
        setSelectedFile(file);
        setFilePreview(URL.createObjectURL(file));
        toast.success(`${type === "image" ? "Foto capturada" : "Vídeo gravado"} com sucesso!`);
    };

    const loadFFmpeg = useCallback(async (): Promise<FFmpeg | null> => {
        if (ffmpegRef.current) return ffmpegRef.current;
        if (ffmpegLoadPromiseRef.current) return ffmpegLoadPromiseRef.current;

        const loadPromise = (async () => {
            setIsFFmpegLoading(true);
            try {
                const instance = new FFmpeg();
                const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
                const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
                const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");

                await instance.load({ coreURL, wasmURL });
                ffmpegRef.current = instance;
                return instance;
            } catch (error) {
                console.error("FFmpeg error:", error);
                toast.error("Falha ao carregar conversor de áudio");
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
            const ffmpeg = await loadFFmpeg();
            if (!ffmpeg) throw new Error("FFmpeg indísponivel");

            const inputName = `input-${Date.now()}.webm`;
            const outputName = `output-${Date.now()}.ogg`;
            const fileData = await fetchFile(webmFile);

            await ffmpeg.writeFile(inputName, fileData);
            await ffmpeg.exec(["-i", inputName, "-vn", "-c:a", "libopus", "-f", "ogg", outputName]);
            const data = await ffmpeg.readFile(outputName);

            await ffmpeg.deleteFile(inputName);
            await ffmpeg.deleteFile(outputName);

            return new Blob([data], { type: "audio/ogg" });
        } catch (error) {
            console.error("Conversion error:", error);
            return null;
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream); // Default format
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                const file = new File([audioBlob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
                setSelectedFile(file);
                setFilePreview(URL.createObjectURL(file));
                setIsRecording(false);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        } catch (error) {
            toast.error("Erro ao iniciar gravação");
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
            const caption = message.trim();

            if (selectedFile) {
                let fileToUpload = selectedFile;

                // Conversão de áudio para OGG (Melhor compatibilidade com WhatsApp/iPhone)
                if (fileToUpload.type.includes("audio/webm") || fileToUpload.name.endsWith(".webm")) {
                    toast.info("Processando áudio...");
                    const oggBlob = await convertWebMToOGG(fileToUpload);
                    if (oggBlob) {
                        fileToUpload = new File([oggBlob], fileToUpload.name.replace(".webm", ".ogg"), { type: "audio/ogg" });
                    } else {
                        console.warn("Falha na conversão de áudio, enviando original...");
                    }
                }

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
                            mediaType = uploadResult.mediaType;
                            resolve();
                        } catch (e) { reject(e); }
                    };
                    reader.onerror = reject;
                });
            }

            const msgPayload: any = {
                conversationId: conversation.id,
                content: caption || undefined,
                caption: caption || undefined,
            };

            if (mediaUrl && mediaType) {
                msgPayload.mediaUrl = mediaUrl;
                msgPayload.mediaType = mediaType;
            }

            await sendMessage.mutateAsync(msgPayload);

            setMessage("");
            removeFile();
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            refetch();
        } catch (error) {
            toast.error("Erro ao enviar mensagem");
        }
    };

    const handleForward = async (targetContactId: number) => {
        if (!forwardMessageId) return;

        const msgToForward = messages?.find(m => m.id === forwardMessageId);
        if (!msgToForward) return;

        try {
            // Se já tem conversa, usa ela. Se não, cria/busca via startConversation
            let targetConvId = conversations?.find(c => c.contactId === targetContactId)?.id;

            if (!targetConvId) {
                const result = await startConversation.mutateAsync({
                    whatsappNumber: "", // Não precisa se passar contactId, backend deve resolver
                    // Hack: startConversation espera whatsappNumber, mas deveria aceitar contactId.
                    // Vamos verificar se conseguimos passar o número.
                    // Precisamos achar o contato/grupo primeiro.
                });
                // Oops, a mutation startConversation do frontend atual (Kanban.tsx) pede numero.
                // Mas o router backend (routers.ts) aceita contactId se modificarmos ou usarmos outra mutation?
                // Verificando Kanban, ele usa startConversation com whatsappNumber.

                // Vamos buscar o contato na lista completa para pegar o número correto
                const target = [...(contacts || []), ...(groups || [])].find(c => c.id === targetContactId);
                if (target) {
                    const res = await startConversation.mutateAsync({
                        whatsappNumber: target.whatsappNumber,
                    });
                    targetConvId = res.conversationId;
                }
            }

            if (!targetConvId) {
                toast.error("Não foi possível iniciar a conversa.");
                return;
            }

            const validMediaTypes = ["image", "audio", "video", "document"];
            const isMedia = validMediaTypes.includes(msgToForward.messageType);

            await sendMessage.mutateAsync({
                conversationId: targetConvId,
                content: msgToForward.content || "",
                mediaUrl: isMedia ? (msgToForward.mediaUrl || undefined) : undefined,
                mediaType: isMedia ? (msgToForward.messageType as any) : undefined,
                caption: msgToForward.content
            });
            toast.success("Mensagem encaminhada!");
            setForwardMessageId(null);
        } catch (err) {
            console.error(err);
            toast.error("Erro ao encaminhar");
        }
    };

    const allDestinations = [
        ...(contacts?.map(c => ({ ...c, type: 'contact' })) || []),
        ...(groups?.map(g => ({ ...g, type: 'group' })) || [])
    ];

    const filteredContacts = allDestinations.filter(c => {
        const matchesSearch = c.name?.toLowerCase().includes(forwardSearch.toLowerCase()) ||
            c.whatsappNumber.includes(forwardSearch);

        if (!matchesSearch) return false;

        if (forwardFilter === 'all') return true;
        if (forwardFilter === 'contacts') return c.type === 'contact';
        if (forwardFilter === 'groups') return c.type === 'group';

        return true;
    });


    const targetContact = contacts?.find(c => c.id === contactId);

    return (
        <>
            {/* Header do ChatPanel (ocultável) */}
            {!hideHeader && (
                <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src={targetContact?.profilePicUrl || undefined} />
                            <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div>
                            <h3 className="font-medium leading-none">
                                {(() => {
                                    const meta = targetContact?.metadata as any;
                                    const looksLikeId = (n: string) => /^[\d\-@]+$/.test(n);
                                    return meta?.subject ||
                                        (targetContact?.name && !looksLikeId(targetContact.name) ? targetContact.name : null) ||
                                        meta?.pushName ||
                                        targetContact?.whatsappNumber ||
                                        "Desconhecido";
                                })()}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {targetContact?.whatsappNumber || "..."}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-0">
                <div className="space-y-4">
                    {!conversation ? (
                        <div className="text-center text-muted-foreground">Nenhuma conversa encontrada</div>
                    ) : !messages || messages.length === 0 ? (
                        <div className="text-center text-muted-foreground">Nenhuma mensagem ainda</div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.senderType === "contact" ? "justify-start" : "justify-end"} items-end gap-2`}>
                                {/* Avatar do Participante (apenas em grupos e mensagens recebidas) */}
                                {msg.senderType === "contact" && (msg.metadata as any)?.isGroup && (
                                    <Avatar className="w-8 h-8 mb-1 shrink-0">
                                        <AvatarImage src={
                                            // Priorizar foto salva nos metadados da mensagem, depois do contato
                                            (msg.metadata as any)?.participantProfilePic ||
                                            contacts?.find(c => c.whatsappNumber === (msg.metadata as any)?.participant?.split("@")[0])?.profilePicUrl ||
                                            undefined
                                        } />
                                        <AvatarFallback className="text-[10px] bg-primary/20">
                                            {(msg.metadata as any)?.pushName?.[0]?.toUpperCase() || "?"}
                                        </AvatarFallback>
                                    </Avatar>
                                )}

                                <div className={`max-w-[80%] rounded-lg p-3 group relative overflow-hidden ${msg.senderType === "contact" ? "bg-muted" : "bg-primary text-primary-foreground"}`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>

                                    {/* Mostrar Nome do Participante em Grupos */}
                                    {msg.senderType === "contact" && (msg.metadata as any)?.isGroup && (
                                        <div className="text-xs font-bold mb-1 opacity-70 flex items-center gap-1" style={{ color: '#e5ab5f' }}>
                                            {
                                                contacts?.find(c => c.whatsappNumber === (msg.metadata as any)?.participant?.split("@")[0])?.name ||
                                                (msg.metadata as any)?.pushName ||
                                                (msg.metadata as any)?.participant?.split('@')[0] ||
                                                "Desconhecido"
                                            }
                                        </div>
                                    )}

                                    {/* Botões de Ação (Hover) */}
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                                        <button
                                            onClick={() => setForwardMessageId(msg.id)}
                                            className="p-1 hover:bg-black/20 rounded text-foreground/80 hover:text-foreground bg-background/50 shadow-sm"
                                            title="Encaminhar"
                                        >
                                            <Forward className="w-3 h-3" />
                                        </button>
                                        {msg.senderType === "agent" && (
                                            <button
                                                onClick={() => {
                                                    if (confirm("Apagar mensagem para todos?")) deleteMessageMutation.mutate({ messageId: msg.id });
                                                }}
                                                className="p-1 hover:bg-black/20 rounded text-destructive hover:text-destructive/80 bg-background/50"
                                                title="Apagar"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    {msg.mediaUrl && msg.messageType === "image" && (
                                        <div className="mb-2">
                                            <img src={msg.mediaUrl} alt="Imagem" className="max-w-full h-auto rounded-md max-h-64 object-cover cursor-zoom-in" onClick={() => handleImagePreview(msg.mediaUrl!)} />
                                        </div>
                                    )}
                                    {msg.mediaUrl && msg.messageType === "audio" && (
                                        <audio controls src={msg.mediaUrl} className="w-full mb-2 max-w-[300px]" />
                                    )}
                                    {msg.mediaUrl && msg.messageType === "video" && (
                                        <video controls src={msg.mediaUrl} className="max-w-full h-auto rounded-md mb-2 max-h-64" />
                                    )}
                                    {msg.mediaUrl && msg.messageType === "document" && (
                                        <a
                                            href={msg.mediaUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 p-2 mb-2 rounded-md bg-background/20 hover:bg-background/30 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded bg-red-500/20 flex items-center justify-center shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {(msg.metadata as any)?.fileName || "Documento"}
                                                </p>
                                                <p className="text-xs opacity-70">Clique para abrir</p>
                                            </div>
                                        </a>
                                    )}

                                    {msg.content && (() => {
                                        const content = msg.content;

                                        // Filtrar mensagens de protocolo do WhatsApp que não devem ser exibidas
                                        const protocolMessages = [
                                            '[senderKeyDistributionMessage]',
                                            'senderKeyDistributionMessage',
                                            '[protocolMessage]',
                                            'protocolMessage',
                                        ];
                                        if (protocolMessages.some(pm => content.toLowerCase().includes(pm.toLowerCase()))) {
                                            return null; // Não mostrar nada para mensagens de protocolo
                                        }

                                        // Padrão para detectar base64 de imagens
                                        const base64Regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
                                        const base64Matches = content.match(base64Regex) || [];

                                        if (base64Matches.length > 0) {
                                            // Remover todas as ocorrências de base64 para extrair texto
                                            let textOnly = content;
                                            base64Matches.forEach(match => {
                                                textOnly = textOnly.replace(match, '');
                                            });
                                            textOnly = textOnly.replace(/\n{2,}/g, '\n').trim();

                                            // Verificar se a imagem não é muito grande (evitar travar o navegador)
                                            const firstImage = base64Matches[0];
                                            const showImage = firstImage && firstImage.length < 500000;

                                            return (
                                                <>
                                                    {showImage && (
                                                        <div className="mb-2">
                                                            <img
                                                                src={firstImage}
                                                                alt="Imagem"
                                                                className="max-w-full h-auto rounded-md max-h-64 object-cover cursor-zoom-in"
                                                                onClick={() => handleImagePreview(firstImage)}
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                            />
                                                        </div>
                                                    )}
                                                    {!showImage && base64Matches.length > 0 && (
                                                        <p className="text-xs italic opacity-50">[Imagem]</p>
                                                    )}
                                                    {textOnly && <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{textOnly}</p>}
                                                </>
                                            );
                                        }

                                        // Verificar se é conteúdo binário puro (base64 sem header, muito longo, sem espaços)
                                        const looksLikeBinary = content.length > 500 &&
                                            !content.includes(' ') &&
                                            /^[A-Za-z0-9+/=\n]+$/.test(content);

                                        if (looksLikeBinary) {
                                            return <p className="text-xs italic opacity-50">[Conteúdo de mídia]</p>;
                                        }

                                        // Texto normal - sempre com quebra de linha para evitar overflow
                                        return <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{content}</p>;
                                    })()}

                                    <p className="text-xs opacity-70 mt-1 text-right">
                                        {new Date(msg.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                </div>
                            </div>

                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="p-4 border-t flex-shrink-0">
                {selectedFile && (
                    <div className="relative p-2 border rounded-md mb-2 flex items-center justify-between">
                        <span className="text-sm truncate">{selectedFile.name}</span>
                        <Button variant="ghost" size="icon" onClick={removeFile}><X className="w-4 h-4" /></Button>
                    </div>
                )}

                {showEmojiPicker && (
                    <div className="mb-2 p-2 border rounded-md bg-background grid grid-cols-8 gap-1">
                        {["😊", "😂", "❤️", "👍", "👏", "🙏", "✅", "❌", "🔥", "⭐", "💯", "🎉", "😍", "🤔"].map(e => (
                            <button key={e} onClick={() => { setMessage(prev => prev + e); setShowEmojiPicker(false); }} className="text-xl p-1 hover:bg-accent rounded">{e}</button>
                        ))}
                    </div>
                )}

                <div className="space-y-2">
                    <textarea
                        ref={textareaRef}
                        placeholder="Digite sua mensagem..."
                        value={message}
                        onChange={(e) => {
                            setMessage(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px';
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        className="w-full min-h-[40px] max-h-[144px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        rows={1}
                        disabled={isRecording}
                    />
                    <div className="flex gap-2 justify-end">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <Button variant="outline" size="icon" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile className="w-4 h-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()}><Paperclip className="w-4 h-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => setIsCameraOpen(true)}><Camera className="w-4 h-4" /></Button>
                        {isRecording ? (
                            <Button variant="destructive" size="icon" onClick={stopRecording}><StopCircle className="w-4 h-4" /></Button>
                        ) : (
                            <Button variant="outline" size="icon" onClick={startRecording} disabled={!!selectedFile}><Mic className="w-4 h-4" /></Button>
                        )}
                        <Button size="icon" onClick={handleSend} disabled={(!message.trim() && !selectedFile) || isRecording}><Send className="w-4 h-4" /></Button>
                    </div>
                </div>
            </div>

            <CameraCapture open={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handleCameraCapture} />

            {/* Modal de Encaminhamento */}
            <Dialog open={!!forwardMessageId} onOpenChange={(open) => !open && setForwardMessageId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Encaminhar para...</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Button
                                variant={forwardFilter === 'all' ? "default" : "outline"}
                                size="sm"
                                onClick={() => setForwardFilter('all')}
                                className="flex-1"
                            >
                                Todos
                            </Button>
                            <Button
                                variant={forwardFilter === 'contacts' ? "default" : "outline"}
                                size="sm"
                                onClick={() => setForwardFilter('contacts')}
                                className="flex-1"
                            >
                                Contatos
                            </Button>
                            <Button
                                variant={forwardFilter === 'groups' ? "default" : "outline"}
                                size="sm"
                                onClick={() => setForwardFilter('groups')}
                                className="flex-1"
                            >
                                Grupos
                            </Button>
                        </div>

                        <div className="flex items-center border rounded-md px-3">
                            <Search className="w-4 h-4 text-muted-foreground mr-2" />
                            <Input
                                placeholder="Buscar contato ou grupo..."
                                className="border-0 focus-visible:ring-0"
                                value={forwardSearch}
                                onChange={(e) => setForwardSearch(e.target.value)}
                            />
                        </div>
                        <ScrollArea className="h-[300px]">
                            <div className="space-y-2">
                                {filteredContacts?.map(contact => (
                                    <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer" onClick={() => handleForward(contact.id)}>
                                        <div className="flex items-center gap-3">
                                            <Avatar>
                                                <AvatarImage src={contact.profilePicUrl || undefined} />
                                                <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-medium">{contact.name || contact.whatsappNumber}</p>
                                                <p className="text-xs text-muted-foreground">{contact.whatsappNumber}</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon"><Send className="w-4 h-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setForwardMessageId(null)}>Cancelar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
