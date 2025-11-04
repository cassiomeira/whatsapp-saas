import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import * as db from "./db";
import { detectarIntencaoIXC, processarConsultaFatura, processarDesbloqueio, enriquecerPromptComIXC } from "./ixcAiHelper";
import { detectarPedidoAtendente, gerarMensagemTransferencia, enriquecerPromptComAtendimento } from "./humanAttendantHelper";
import type { Product } from "../drizzle/schema";

function extractProductKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s]/gi, " ")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(part => part.length >= 2)
    .slice(0, 8);
}

function normalizeToken(token: string): string {
  return token.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function generateKeywordVariants(token: string): string[] {
  const variants = new Set<string>();
  const base = normalizeToken(token.toLowerCase());
  variants.add(base);

  if (base.endsWith("s") && base.length > 3) {
    variants.add(base.slice(0, -1));
  }

  if (base.length > 5) {
    variants.add(base.slice(0, 5));
  }

  if (base.length > 4) {
    variants.add(base.slice(0, 4));
  }

  return Array.from(variants);
}

export async function generateBotResponse(
  workspaceId: number,
  conversationId: number,
  userMessage: string,
  imageUrl?: string
): Promise<string> {
  try {
    console.log("[AI Service] generateBotResponse chamado para workspace:", workspaceId);
    
    // Buscar configuração do bot
    const botConfig = await db.getBotConfigByWorkspace(workspaceId);
    console.log("[AI Service] botConfig:", botConfig ? "encontrado" : "não encontrado", "isActive:", botConfig?.isActive);
    
    if (!botConfig || !botConfig.isActive) {
      console.log("[AI Service] Bot não está ativo ou não tem config");
      return "Olá! No momento estou indisponível. Por favor, aguarde que um atendente irá te responder em breve.";
    }

    // Buscar histórico de mensagens da conversa
    const messages = await db.getMessagesByConversation(conversationId);

    const keywords = extractProductKeywords(userMessage);
    const productMatches: Product[] = [];
    const seenProductIds = new Set<number>();

    if (keywords.length > 0) {
      for (const keyword of keywords) {
        const keywordVariants = generateKeywordVariants(keyword);

        for (const variant of keywordVariants) {
          const results = await db.searchProducts(workspaceId, variant, 5);
          for (const product of results) {
            if (product.id === undefined) {
              continue;
            }
            if (!seenProductIds.has(product.id)) {
              seenProductIds.add(product.id);
              productMatches.push(product);
            }
          }
          if (productMatches.length >= 5) {
            break;
          }
        }
      }
    }

    const productInquiryKeywords = /(produto|rem[eé]dio|medicamento|pre[cç]o|valor|tem\s|vende|estoque|sku|caps?ula|comprimido|ml|mg)/i;

    if (keywords.length > 0 && productMatches.length === 0 && productInquiryKeywords.test(userMessage)) {
      await db.updateConversationStatus(conversationId, "pending_human");
      return "Não encontrei esse item no catálogo. Vou chamar um atendente humano para continuar o atendimento.";
    }

    // Construir contexto da conversa
    const conversationHistory = messages.slice(-10).map(msg => ({
      role: msg.senderType === "contact" ? "user" as const : "assistant" as const,
      content: msg.content,
    }));

    // Chamar a IA (com vision se houver imagem)
    const lastMessage: any = imageUrl ? {
      role: "user",
      content: [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    } : {
      role: "user",
      content: userMessage,
    };
    
    // Enriquecer prompt com contexto IXC e atendimento humano
    let systemPrompt = botConfig.masterPrompt || "Você é um assistente de atendimento profissional e prestativo.";
    systemPrompt = enriquecerPromptComIXC(systemPrompt);
    systemPrompt = enriquecerPromptComAtendimento(systemPrompt);

    const productContextMessage = productMatches.length > 0
      ? `Produtos relacionados encontrados no catálogo (máximo 5):\n${productMatches
          .map(prod => `• SKU ${prod.sku} — ${prod.name} — preço ${
            (prod.price / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          } — quantidade ${prod.quantity} — descrição: ${prod.description ?? "sem descrição"}`)
          .join("\n")}\nUse apenas esses dados para responder perguntas sobre disponibilidade, preço ou características.`
      : "Nenhum produto relacionado foi recuperado do catálogo.";

    console.log("[AI Service] Chamando invokeLLM com", conversationHistory.length + 3, "mensagens");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "system",
          content: productContextMessage,
        },
        ...conversationHistory,
        lastMessage,
      ],
    });
    console.log("[AI Service] LLM respondeu com sucesso");

    const botResponse = typeof response.choices[0]?.message?.content === "string" 
      ? response.choices[0].message.content 
      : "Desculpe, não consegui processar sua mensagem.";

    // Verificar regras de transbordo
    if (botConfig.transferRules && Array.isArray(botConfig.transferRules)) {
      for (const rule of botConfig.transferRules) {
        if (shouldTransferToHuman(userMessage, botResponse, rule)) {
          // Atualizar status da conversa para pending_human
          await db.updateConversationStatus(conversationId, "pending_human");
          return "Entendi! Vou transferir você para um atendente humano. Por favor, aguarde um momento.";
        }
      }
    }

    return botResponse;
  } catch (error: any) {
    console.error("[AI Service] Error generating response:", error);
    console.error("[AI Service] Error message:", error?.message);
    console.error("[AI Service] Error stack:", error?.stack);
    return "Desculpe, ocorreu um erro ao processar sua mensagem. Um atendente irá te ajudar em breve.";
  }
}

function shouldTransferToHuman(
  userMessage: string,
  botResponse: string | (any)[],
  rule: { type: string; value: string; action: string }
): boolean {
  const lowerMessage = userMessage.toLowerCase();
  const lowerValue = rule.value.toLowerCase();

  switch (rule.type) {
    case "keyword":
      return lowerMessage.includes(lowerValue);
    case "phrase":
      return lowerMessage === lowerValue;
    case "sentiment":
      // Detectar palavras negativas/frustração
      const negativeWords = ["ruim", "péssimo", "horrível", "problema", "reclamar", "insatisfeito"];
      return negativeWords.some(word => lowerMessage.includes(word));
    default:
      return false;
  }
}

export async function processIncomingMessage(
  workspaceId: number,
  contactId: number,
  instanceId: number,
  messageContent: string,
  whatsappNumber: string,
  mediaUrl?: string,
  mediaType?: "image" | "audio" | "video"
): Promise<void> {
  try {
    // Buscar ou criar conversa
    let conversation = await db.getConversationsByWorkspace(workspaceId);
    let activeConv = conversation.find(
      c => c.contactId === contactId && c.status !== "closed"
    );

    if (!activeConv) {
      // Criar nova conversa
      const convId = await db.createConversation({
        workspaceId,
        contactId,
        instanceId,
        status: "bot_handling",
      });
      activeConv = await db.getConversationsByWorkspace(workspaceId).then(
        convs => convs.find(c => c.id === convId)
      );
    }

    if (!activeConv) {
      throw new Error("Failed to create or find conversation");
    }

    // Processar mídia se houver
    let processedContent = messageContent;
    
    if (mediaUrl && mediaType === "audio") {
      console.log(`[AI Service] Transcribing audio from ${mediaUrl}`);
      try {
        const transcription = await transcribeAudio({
          audioUrl: mediaUrl,
          language: "pt",
        });
        if ('text' in transcription) {
          processedContent = transcription.text || "[Áudio não pôde ser transcrito]";
          console.log(`[AI Service] Audio transcribed: ${processedContent}`);
        } else {
          console.error("[AI Service] Transcription error:", transcription.error);
          processedContent = "[Áudio recebido mas não pôde ser transcrito]";
        }
      } catch (error) {
        console.error("[AI Service] Error transcribing audio:", error);
        processedContent = "[Áudio recebido mas não pôde ser transcrito]";
      }
    }
    
    // Salvar mensagem do contato
    await db.createMessage({
      conversationId: activeConv.id,
      senderType: "contact",
      content: processedContent,
    });

    // Buscar contato para verificar status no Kanban
    const contacts = await db.getContactsByWorkspace(workspaceId);
    const contact = contacts.find(c => c.id === contactId);
    // Número de destino: se o recebido estiver vazio, use o do contato
    const destinationNumber = (contact?.whatsappNumber && contact.whatsappNumber.trim().length > 0)
      ? contact.whatsappNumber
      : whatsappNumber;

    // Se o contato está aguardando atendente, IA não responde
    const contactWaiting = contact?.kanbanStatus === "waiting_attendant";

    if (contactWaiting) {
      console.log(`[AI Service] Contato ${contactId} está aguardando atendente. IA não irá responder.`);
      return;
    }

    if (activeConv.status !== "bot_handling") {
      if (activeConv.status === "pending_human") {
        console.log(`[AI Service] Conversa ${activeConv.id} estava em pending_human, mas o contato não está aguardando atendente. Reativando bot.`);
      } else {
        console.log(`[AI Service] Conversa ${activeConv.id} com status '${activeConv.status}'. Reativando bot.`);
      }

      await db.updateConversationStatus(activeConv.id, "bot_handling");
      activeConv.status = "bot_handling" as any;
    }

    if (activeConv.status === "bot_handling") {
      // Detectar pedido de atendente humano
      const pedidoAtendente = detectarPedidoAtendente(processedContent);
      
      if (pedidoAtendente.precisaAtendente && pedidoAtendente.confianca > 0.5) {
        console.log(`[AI Service] Detectado pedido de atendente humano (confiança: ${pedidoAtendente.confianca})`);
        
        // Usar contato já buscado anteriormente
        const botResponse = gerarMensagemTransferencia(contact?.name || undefined);
        
        // Salvar resposta do bot
        await db.createMessage({
          conversationId: activeConv.id,
          senderType: "bot",
          content: botResponse,
        });
        
        // Enviar resposta via WhatsApp
        try {
          const { getEvolutionService } = await import("./evolutionService");
          const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
          const instance = instances.find(i => i.id === instanceId);
          
          if (instance && instance.instanceKey) {
            const workspace = await db.getWorkspaceById(workspaceId);
            const metadata = workspace?.metadata as any;
            
            if (metadata?.evolutionApiUrl && metadata?.evolutionApiKey) {
              const evolution = getEvolutionService({
                apiUrl: metadata.evolutionApiUrl,
                apiKey: metadata.evolutionApiKey,
              });
              await evolution.sendTextMessage(instance.instanceKey, destinationNumber, botResponse);
              console.log(`[AI Service] Mensagem de transferência enviada para ${destinationNumber}`);
            }
          }
        } catch (error) {
          console.error(`[AI Service] Erro ao enviar mensagem de transferência:`, error);
        }
        
        // Atualizar status do contato para "waiting_attendant"
        await db.updateContactKanbanStatus(contactId, "waiting_attendant");
        await db.updateConversationStatus(activeConv.id, "pending_human");
        console.log(`[AI Service] Contato ${contactId} movido para "Aguardando Atendente"`);
        
        return;
      }
      
      // Detectar intenção IXC
      const intencaoIXC = detectarIntencaoIXC(processedContent);
      let botResponse: string;

      if (intencaoIXC.tipo === "consulta_fatura" && intencaoIXC.confianca > 0.5) {
        console.log(`[AI Service] IXC: Detectada consulta de fatura (confiança: ${intencaoIXC.confianca})`);
        botResponse = await processarConsultaFatura(workspaceId, whatsappNumber, intencaoIXC.documento);
      } else if (intencaoIXC.tipo === "desbloqueio" && intencaoIXC.confianca > 0.5) {
        console.log(`[AI Service] IXC: Detectado pedido de desbloqueio (confiança: ${intencaoIXC.confianca})`);
        botResponse = await processarDesbloqueio(workspaceId, whatsappNumber, intencaoIXC.documento);
      } else {
        // Resposta normal da IA
        let finalMessage = processedContent;
        if (mediaUrl && mediaType === "image") {
          finalMessage = `[O usuário enviou uma imagem. Analise a imagem e responda adequadamente.]\n${processedContent || ""}`;
        }
        
        botResponse = await generateBotResponse(
          workspaceId,
          activeConv.id,
          finalMessage,
          mediaUrl && mediaType === "image" ? mediaUrl : undefined
        );
      }

      const transferKeywords = ["transferir", "atendente"];
      const botResponseString = botResponse.toLowerCase();
      const containsHumano = botResponseString.includes("humano");
      const responseIndicatesTransfer = transferKeywords.every(keyword => botResponseString.includes(keyword)) && containsHumano;

      const fallbackPhrases = [
        "não tenho informação",
        "não possuo informação",
        "não sei informar",
        "não possuo os dados",
        "não encontrei",
        "não consigo responder",
        "não posso fornecer",
        "não tenho acesso",
        "não está configurada",
        "não está disponível",
        "integração",
        "contato com o suporte",
        "procure um atendente",
        "não consigo acessar",
      ];

      const responseIndicatesUnknown = fallbackPhrases.some(phrase => botResponseString.includes(phrase));

      if (responseIndicatesTransfer || responseIndicatesUnknown) {
        if (responseIndicatesUnknown && !responseIndicatesTransfer) {
          botResponse += "\n\nVou transferir você para um atendente humano para que ele possa te ajudar melhor, tudo bem?";
        }

        console.log(`[AI Service] Bot response indica transferência/encaminhamento para humano. Atualizando status do contato ${contactId}.`);
        await db.updateContactKanbanStatus(contactId, "waiting_attendant");
        await db.updateConversationStatus(activeConv.id, "pending_human");
        activeConv.status = "pending_human" as any;
      }

      // Salvar resposta do bot
      await db.createMessage({
        conversationId: activeConv.id,
        senderType: "bot",
        content: botResponse,
      });

      // Enviar resposta via WhatsApp API
      console.log(`[AI Service] Bot response to ${destinationNumber}:`, botResponse);
      
      try {
        const { getEvolutionService } = await import("./evolutionService");
        
        // Buscar instância para enviar resposta
        const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
        const instance = instances.find(i => i.id === instanceId);
        if (instance && instance.instanceKey) {
          // Buscar configuração da Evolution API
          const workspace = await db.getWorkspaceById(workspaceId);
          const metadata = workspace?.metadata as any;
          
          if (!metadata?.evolutionApiUrl || !metadata?.evolutionApiKey) {
            console.error("[AI Service] Evolution API not configured");
            return;
          }
          
          const evolution = getEvolutionService({
            apiUrl: metadata.evolutionApiUrl,
            apiKey: metadata.evolutionApiKey,
          });
          
          await evolution.sendTextMessage(instance.instanceKey, destinationNumber, botResponse);
          console.log(`[AI Service] Response sent successfully to ${destinationNumber}`);
        } else {
          console.error(`[AI Service] Instance not found or invalid: ${instanceId}`);
        }
      } catch (error) {
        console.error(`[AI Service] Error sending response to WhatsApp:`, error);
      }
    }
  } catch (error) {
    console.error("[AI Service] Error processing incoming message:", error);
    throw error;
  }
}

