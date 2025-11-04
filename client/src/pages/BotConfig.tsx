import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Send } from "lucide-react";

export default function BotConfig() {
  const { data: config, refetch } = trpc.bot.getConfig.useQuery();
  const updateConfig = trpc.bot.updateConfig.useMutation();
  const testBot = trpc.bot.testResponse.useMutation();
  
  const [prompt, setPrompt] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [botResponse, setBotResponse] = useState("");

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({ masterPrompt: prompt || config?.masterPrompt || "" });
      toast.success("Configuração salva com sucesso!");
      refetch();
    } catch (error) {
      toast.error("Erro ao salvar configuração");
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) {
      toast.error("Digite uma mensagem para testar");
      return;
    }
    
    try {
      const result = await testBot.mutateAsync({ message: testMessage });
      setBotResponse(result.response);
      toast.success("Resposta gerada!");
    } catch (error) {
      toast.error("Erro ao testar bot");
    }
  };

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Configurar IA</h1>
            <p className="text-muted-foreground">Configure como sua IA deve se comportar</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Configuração */}
            <Card>
              <CardHeader>
                <CardTitle>Prompt Mestre</CardTitle>
                <CardDescription>
                  Define a personalidade e comportamento do bot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={prompt || config?.masterPrompt || ""}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: Você é um assistente de atendimento profissional e prestativo..."
                  rows={10}
                />
                <Button onClick={handleSave} disabled={updateConfig.isPending} className="w-full">
                  {updateConfig.isPending ? "Salvando..." : "Salvar Configuração"}
                </Button>
              </CardContent>
            </Card>

            {/* Teste */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  Testar Bot
                </CardTitle>
                <CardDescription>
                  Envie uma mensagem de teste para ver como o bot responde
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensagem de Teste</Label>
                  <div className="flex gap-2">
                    <Input
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="Ex: Olá, preciso de ajuda"
                      onKeyDown={(e) => e.key === "Enter" && handleTest()}
                    />
                    <Button onClick={handleTest} disabled={testBot.isPending}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {botResponse && (
                  <div className="space-y-2">
                    <Label>Resposta do Bot</Label>
                    <div className="p-4 rounded-lg bg-secondary">
                      <p className="text-sm">{botResponse}</p>
                    </div>
                  </div>
                )}

                {testBot.isPending && (
                  <div className="flex items-center justify-center p-8">
                    <Bot className="w-8 h-8 animate-pulse text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Regras de Transbordo */}
          <Card>
            <CardHeader>
              <CardTitle>Regras de Transbordo</CardTitle>
              <CardDescription>
                Configure quando o bot deve transferir para um atendente humano
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Funcionalidade em desenvolvimento. Em breve você poderá configurar palavras-chave e condições para transferência automática.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}
