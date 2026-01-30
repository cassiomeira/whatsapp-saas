import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Video, X, SwitchCamera, Circle, Square } from "lucide-react";
import { toast } from "sonner";

type CameraCaptureProps = {
    open: boolean;
    onClose: () => void;
    onCapture: (file: File, type: "image" | "video") => void;
};

export default function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
    const [mode, setMode] = useState<"photo" | "video">("photo");
    const [isRecording, setIsRecording] = useState(false);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    // Iniciar câmera quando abrir
    useEffect(() => {
        if (open) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [open, facingMode]);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode },
                audio: mode === "video",
            });

            setStream(mediaStream);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (error) {
            console.error("Erro ao acessar câmera:", error);
            toast.error("Não foi possível acessar a câmera. Verifique as permissões.");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
    };

    const switchCamera = () => {
        setFacingMode(prev => prev === "user" ? "environment" : "user");
    };

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
                onCapture(file, "image");
                handleClose();
            }
        }, "image/jpeg", 0.95);
    };

    const startRecording = () => {
        if (!stream) return;

        // Tentar MP4 primeiro (melhor compatibilidade com WhatsApp)
        const supportedFormats = [
            { mimeType: "video/mp4", ext: "mp4" },
            { mimeType: "video/mp4;codecs=h264", ext: "mp4" },
            { mimeType: "video/webm;codecs=h264", ext: "webm" },
            { mimeType: "video/webm;codecs=vp9", ext: "webm" },
            { mimeType: "video/webm", ext: "webm" },
        ];

        let selectedFormat = supportedFormats.find(format =>
            MediaRecorder.isTypeSupported(format.mimeType)
        );

        if (!selectedFormat) {
            toast.error("Formato de vídeo não suportado neste navegador");
            return;
        }

        const options: MediaRecorderOptions = {
            videoBitsPerSecond: 2500000,
        };

        if (selectedFormat.mimeType) {
            options.mimeType = selectedFormat.mimeType;
        }

        try {
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: selectedFormat!.mimeType });
                const file = new File([blob], `video-${Date.now()}.${selectedFormat!.ext}`, {
                    type: selectedFormat!.mimeType
                });
                onCapture(file, "video");
                handleClose();
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordedChunks(chunks);

            console.log(`[Camera] Gravando vídeo em ${selectedFormat.mimeType}`);
            toast.info(`Gravando em ${selectedFormat.ext.toUpperCase()}: ${selectedFormat.mimeType}`);
        } catch (error) {
            console.error("Erro ao iniciar gravação:", error);
            toast.error("Erro ao iniciar gravação de vídeo");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleClose = () => {
        stopCamera();
        setIsRecording(false);
        setRecordedChunks([]);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "photo" ? "Tirar Foto" : "Gravar Vídeo"}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "photo"
                            ? "Posicione a câmera e clique no botão para capturar"
                            : "Clique para iniciar/parar a gravação"}
                    </DialogDescription>
                </DialogHeader>

                {/* Preview da Câmera */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />

                    {/* Canvas oculto para captura de foto */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Indicador de gravação */}
                    {isRecording && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full animate-pulse">
                            <Circle className="w-3 h-3 fill-current" />
                            <span className="text-sm font-medium">Gravando...</span>
                        </div>
                    )}

                    {/* Botão de trocar câmera */}
                    <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-4 right-4 rounded-full"
                        onClick={switchCamera}
                    >
                        <SwitchCamera className="w-5 h-5" />
                    </Button>
                </div>

                <DialogFooter className="flex justify-between items-center">
                    {/* Alternar modo */}
                    <div className="flex gap-2">
                        <Button
                            variant={mode === "photo" ? "default" : "outline"}
                            onClick={() => setMode("photo")}
                            disabled={isRecording}
                        >
                            <Camera className="w-4 h-4 mr-2" />
                            Foto
                        </Button>
                        <Button
                            variant={mode === "video" ? "default" : "outline"}
                            onClick={() => setMode("video")}
                            disabled={isRecording}
                        >
                            <Video className="w-4 h-4 mr-2" />
                            Vídeo
                        </Button>
                    </div>

                    {/* Ações principais */}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleClose}>
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                        </Button>

                        {mode === "photo" ? (
                            <Button onClick={takePhoto} className="bg-blue-600 hover:bg-blue-700">
                                <Camera className="w-4 h-4 mr-2" />
                                Capturar
                            </Button>
                        ) : (
                            <Button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={isRecording ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}
                            >
                                {isRecording ? (
                                    <>
                                        <Square className="w-4 h-4 mr-2" />
                                        Parar
                                    </>
                                ) : (
                                    <>
                                        <Circle className="w-4 h-4 mr-2" />
                                        Gravar
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
