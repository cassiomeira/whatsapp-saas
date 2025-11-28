import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Database, Trash2, RefreshCw, HardDrive, FileAudio, FileImage, FileVideo, FileText, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function Storage() {
  const { data: stats, refetch, isLoading } = trpc.storage.getStats.useQuery(undefined, {
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });
  
  const cleanup = trpc.storage.cleanup.useMutation({
    onSuccess: (data) => {
      toast.success(`Limpeza concluída! ${data.deleted} arquivos removidos, ${data.freedMB} MB liberados.`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao limpar: ${error.message}`);
    },
  });

  const [olderThanDays, setOlderThanDays] = useState(30);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);

  const handleCleanup = async () => {
    if (!confirm(`Tem certeza que deseja deletar arquivos mais antigos que ${olderThanDays} dias? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setIsCleaning(true);
    try {
      await cleanup.mutateAsync({
        olderThanDays,
        fileTypes: selectedTypes.length > 0 ? selectedTypes as any : undefined,
      });
    } finally {
      setIsCleaning(false);
    }
  };

  const toggleFileType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getUsageColor = (percent: number) => {
    if (percent < 50) return "bg-green-500";
    if (percent < 80) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Armazenamento</h1>
              <p className="text-muted-foreground mt-1">
                Gerencie o espaço de armazenamento do Supabase Storage
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {isLoading && !stats ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">Carregando estatísticas...</div>
              </CardContent>
            </Card>
          ) : stats ? (
            <>
              {/* Uso Total */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="w-5 h-5" />
                    Uso Total do Storage
                  </CardTitle>
                  <CardDescription>
                    Limite do plano Free: 1 GB
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Espaço usado</span>
                      <span className="font-medium">
                        {stats.totalSizeGB} GB / {stats.limitGB} GB ({stats.usagePercent}%)
                      </span>
                    </div>
                    <Progress 
                      value={parseFloat(stats.usagePercent)} 
                      className="h-3"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(stats.totalSize)}</span>
                      <span>{formatBytes(stats.limitBytes)}</span>
                    </div>
                  </div>

                  {parseFloat(stats.usagePercent) > 80 && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                      <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-sm text-yellow-800 dark:text-yellow-200">
                        Atenção: Você está usando mais de 80% do espaço disponível. Considere fazer limpeza ou fazer upgrade do plano.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{stats.fileCount}</div>
                      <div className="text-sm text-muted-foreground">Total de Arquivos</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{stats.filesByType.audio.count}</div>
                      <div className="text-sm text-muted-foreground">Áudios</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{stats.filesByType.image.count}</div>
                      <div className="text-sm text-muted-foreground">Imagens</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">
                        {stats.filesByType.video.count + stats.filesByType.document.count}
                      </div>
                      <div className="text-sm text-muted-foreground">Outros</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detalhes por Tipo */}
              <Card>
                <CardHeader>
                  <CardTitle>Detalhes por Tipo de Arquivo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileAudio className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="font-medium">Áudios</div>
                          <div className="text-sm text-muted-foreground">
                            {stats.filesByType.audio.count} arquivos
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(stats.filesByType.audio.size)}</div>
                        <div className="text-sm text-muted-foreground">
                          {((stats.filesByType.audio.size / stats.totalSize) * 100).toFixed(1)}% do total
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileImage className="w-5 h-5 text-green-500" />
                        <div>
                          <div className="font-medium">Imagens</div>
                          <div className="text-sm text-muted-foreground">
                            {stats.filesByType.image.count} arquivos
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(stats.filesByType.image.size)}</div>
                        <div className="text-sm text-muted-foreground">
                          {((stats.filesByType.image.size / stats.totalSize) * 100).toFixed(1)}% do total
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileVideo className="w-5 h-5 text-purple-500" />
                        <div>
                          <div className="font-medium">Vídeos</div>
                          <div className="text-sm text-muted-foreground">
                            {stats.filesByType.video.count} arquivos
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(stats.filesByType.video.size)}</div>
                        <div className="text-sm text-muted-foreground">
                          {((stats.filesByType.video.size / stats.totalSize) * 100).toFixed(1)}% do total
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-orange-500" />
                        <div>
                          <div className="font-medium">Documentos</div>
                          <div className="text-sm text-muted-foreground">
                            {stats.filesByType.document.count} arquivos
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(stats.filesByType.document.size)}</div>
                        <div className="text-sm text-muted-foreground">
                          {((stats.filesByType.document.size / stats.totalSize) * 100).toFixed(1)}% do total
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Limpeza */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Limpar Arquivos Antigos
                  </CardTitle>
                  <CardDescription>
                    Remova arquivos antigos para liberar espaço no storage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="days">Arquivos mais antigos que (dias):</Label>
                    <Input
                      id="days"
                      type="number"
                      min="1"
                      max="365"
                      value={olderThanDays}
                      onChange={(e) => setOlderThanDays(parseInt(e.target.value) || 30)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tipos de arquivo para limpar (deixe vazio para todos):</Label>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="audio"
                          checked={selectedTypes.includes("audio")}
                          onCheckedChange={() => toggleFileType("audio")}
                        />
                        <label htmlFor="audio" className="flex items-center gap-2 cursor-pointer">
                          <FileAudio className="w-4 h-4" />
                          Áudios
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="image"
                          checked={selectedTypes.includes("image")}
                          onCheckedChange={() => toggleFileType("image")}
                        />
                        <label htmlFor="image" className="flex items-center gap-2 cursor-pointer">
                          <FileImage className="w-4 h-4" />
                          Imagens
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="video"
                          checked={selectedTypes.includes("video")}
                          onCheckedChange={() => toggleFileType("video")}
                        />
                        <label htmlFor="video" className="flex items-center gap-2 cursor-pointer">
                          <FileVideo className="w-4 h-4" />
                          Vídeos
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="document"
                          checked={selectedTypes.includes("document")}
                          onCheckedChange={() => toggleFileType("document")}
                        />
                        <label htmlFor="document" className="flex items-center gap-2 cursor-pointer">
                          <FileText className="w-4 h-4" />
                          Documentos
                        </label>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="destructive"
                    onClick={handleCleanup}
                    disabled={isCleaning || cleanup.isPending}
                    className="w-full"
                  >
                    {isCleaning || cleanup.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Limpando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Limpar Arquivos Antigos
                      </>
                    )}
                  </Button>

                  {cleanup.data && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                      <div className="text-sm text-green-800 dark:text-green-200">
                        ✅ {cleanup.data.deleted} arquivos removidos, {cleanup.data.freedMB} MB liberados
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  Não foi possível carregar as estatísticas. Verifique se o Supabase está configurado.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}

