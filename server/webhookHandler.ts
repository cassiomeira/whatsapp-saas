import { Request, Response } from "express";
import * as db from "./db";
import { processIncomingMessage } from "./aiService";

export interface WebhookPayload {
  event: string;
  instance: string;
  data: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      imageMessage?: {
        caption?: string;
      };
      videoMessage?: {
        caption?: string;
      };
    };
    messageType?: string;
    pushName?: string;
  };
}

export async function handleEvolutionWebhook(req: Request, res: Response) {
  try {
    // Verificar API Key se fornecida (opcional, mas recomendado)
    const providedApiKey = (req.body as any).apikey || req.headers['apikey'] || req.headers['x-api-key'];
    const expectedApiKey = process.env.EVOLUTION_API_KEY || 'NetcarSecret2024';
    
    // Se uma API Key foi fornecida, validar
    if (providedApiKey && providedApiKey !== expectedApiKey) {
      console.warn("[Webhook] Invalid API key provided:", providedApiKey);
      // Não rejeitar, apenas logar (algumas versões da Evolution API não enviam)
    }
    
    const payload: WebhookPayload = req.body;
    
    console.log("[Webhook] Received event:", payload.event);
    console.log("[Webhook] Full payload:", JSON.stringify(payload, null, 2));

    // Processar apenas mensagens recebidas
    if (payload.event === "messages.upsert" || payload.event === "MESSAGES_UPSERT") {
      await handleIncomingMessage(payload);
    }
    
    // Atualizar status de conexão
    if (payload.event === "connection.update" || payload.event === "CONNECTION_UPDATE") {
      await handleConnectionUpdate(payload);
    }
    
    // Atualizar QR Code quando for gerado (v2.2.3)
    if (payload.event === "qrcode.updated" || payload.event === "QRCODE_UPDATED") {
      await handleQRCodeUpdate(payload);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Webhook] Error processing webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleIncomingMessage(payload: WebhookPayload) {
  try {
    const { data, instance } = payload;
    
    // Ignorar mensagens enviadas por nós
    if (data.key?.fromMe) {
      return;
    }

    const remoteJid = data.key?.remoteJid;
    if (!remoteJid) {
      return;
    }
    
    // **FILTRO: Ignorar mensagens de grupos**
    // Grupos terminam com @g.us, conversas diretas com @s.whatsapp.net
    if (remoteJid.endsWith('@g.us')) {
      console.log('[Webhook] Mensagem de grupo ignorada:', remoteJid);
      return;
    }

    // Extrair número do WhatsApp
    const whatsappNumber = remoteJid.split("@")[0];
    
    // Extrair texto e mídia da mensagem
    let messageText = "";
    let mediaUrl: string | undefined;
    let mediaType: "image" | "audio" | "video" | undefined;
    let mediaBase64: string | undefined;
    let mediaMimeType: string | undefined;
    const rawMessage = data.message as any;

    if (data.message?.conversation) {
      messageText = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      messageText = data.message.extendedTextMessage.text;
    } else if (rawMessage?.audioMessage) {
      messageText = rawMessage.audioMessage?.caption || "[Áudio]";
      mediaType = "audio";
      mediaUrl = rawMessage.audioMessage?.url || rawMessage.audioMessage?.mediaUrl || rawMessage.audioMessage?.directPath;
      mediaBase64 = rawMessage.audioMessage?.data || rawMessage.audioMessage?.base64;
      mediaMimeType = rawMessage.audioMessage?.mimetype;
    } else if (data.message?.imageMessage) {
      messageText = data.message.imageMessage.caption || "[Imagem]";
      mediaType = "image";
      mediaUrl = rawMessage?.imageMessage?.url || rawMessage?.imageMessage?.mediaUrl || rawMessage?.imageMessage?.directPath;
      mediaBase64 = rawMessage?.imageMessage?.data || rawMessage?.imageMessage?.base64;
      mediaMimeType = rawMessage?.imageMessage?.mimetype;
    } else if (data.message?.videoMessage) {
      messageText = data.message.videoMessage.caption || "[Vídeo]";
      mediaType = "video";
      mediaUrl = rawMessage?.videoMessage?.url || rawMessage?.videoMessage?.mediaUrl || rawMessage?.videoMessage?.directPath;
      mediaBase64 = rawMessage?.videoMessage?.data || rawMessage?.videoMessage?.base64;
      mediaMimeType = rawMessage?.videoMessage?.mimetype;
    } else {
      messageText = `[${data.messageType || "Mensagem"}]`;
    }

    if (!mediaBase64 && (rawMessage?.base64 || rawMessage?.data)) {
      mediaBase64 = rawMessage.base64 || rawMessage.data;
    }

    console.log(`[Webhook] Message from ${whatsappNumber}: ${messageText}`);

    // Buscar instância no banco
    const dbInstance = await db.getWhatsappInstanceByKey(instance);
    
    if (!dbInstance) {
      console.error("[Webhook] Instance not found:", instance);
      return;
    }

    // Buscar ou criar contato
    let contacts = await db.getContactsByWorkspace(dbInstance.workspaceId);
    let contact = contacts.find(c => c.whatsappNumber === whatsappNumber);
    
    if (!contact) {
      const contactId = await db.createContact({
        workspaceId: dbInstance.workspaceId,
        whatsappNumber,
        name: data.pushName || whatsappNumber,
      });
      // Recarregar contatos
      contacts = await db.getContactsByWorkspace(dbInstance.workspaceId);
      contact = contacts.find(c => c.id === contactId);
    }

    if (!contact) {
      console.error("[Webhook] Failed to create or find contact");
      return;
    }

    // Processar mensagem com IA
    await processIncomingMessage(
      dbInstance.workspaceId,
      contact.id,
      dbInstance.id,
      messageText,
      whatsappNumber,
      mediaUrl,
      mediaType,
      mediaBase64,
      mediaMimeType
    );

  } catch (error) {
    console.error("[Webhook] Error handling incoming message:", error);
  }
}

async function handleQRCodeUpdate(payload: WebhookPayload) {
  try {
    const { instance, data } = payload;
    
    // Buscar instância no banco
    const dbInstance = await db.getWhatsappInstanceByKey(instance);
    
    if (!dbInstance) {
      return;
    }

    // Na v2.2.3, o QR Code pode vir em data.qrcode ou data
    const qrCodeData = (data as any).qrcode || data;
    const qrCodeBase64 = qrCodeData?.base64 || qrCodeData?.code;
    
    if (qrCodeBase64) {
      await db.updateWhatsappInstanceStatus(dbInstance.id, "connecting", undefined, qrCodeBase64);
      console.log(`[Webhook] QR Code updated for instance ${instance}`);
    }
  } catch (error) {
    console.error("[Webhook] Error handling QR code update:", error);
  }
}

async function handleConnectionUpdate(payload: WebhookPayload) {
  try {
    const { instance, data } = payload;
    
    // Buscar instância no banco
    const dbInstance = await db.getWhatsappInstanceByKey(instance);
    
    if (!dbInstance) {
      return;
    }

    // Atualizar status
    const state = (data as any).state || (data as any).status;
    const statusMap: Record<string, string> = {
      open: "connected",
      close: "disconnected",
      connecting: "connecting",
    };
    
    const newStatus = statusMap[state] || "disconnected";
    await db.updateWhatsappInstanceStatus(dbInstance.id, newStatus);
    
    console.log(`[Webhook] Instance ${instance} status updated to ${newStatus}`);
    
    // Se a instância conectou com sucesso, configurar webhook agora
    if (state === "open" || newStatus === "connected") {
      try {
        const workspace = await db.getWorkspaceById(dbInstance.workspaceId);
        if (workspace?.metadata) {
          const metadata = workspace.metadata as any;
          if (metadata?.webhookUrl && metadata?.evolutionApiUrl && metadata?.evolutionApiKey) {
            const { getEvolutionService } = await import("./evolutionService");
            const evolution = getEvolutionService({
              apiUrl: metadata.evolutionApiUrl,
              apiKey: metadata.evolutionApiKey,
            });
            
            await evolution.setWebhook(instance, metadata.webhookUrl);
            console.log(`[Webhook] Webhook configured for ${instance} after successful connection`);
          }
        }
      } catch (webhookError: any) {
        console.warn(`[Webhook] Failed to configure webhook after connection:`, webhookError.message);
        // Não falhar se o webhook não configurar
      }
    }
    
    // Se a instância está conectando, configurar webhook imediatamente (para receber QR Code)
    if (state === "connecting" || newStatus === "connecting") {
      try {
        const workspace = await db.getWorkspaceById(dbInstance.workspaceId);
        if (workspace?.metadata) {
          const metadata = workspace.metadata as any;
          if (metadata?.webhookUrl && metadata?.evolutionApiUrl && metadata?.evolutionApiKey) {
            const { getEvolutionService } = await import("./evolutionService");
            const evolution = getEvolutionService({
              apiUrl: metadata.evolutionApiUrl,
              apiKey: metadata.evolutionApiKey,
            });
            
            await evolution.setWebhook(instance, metadata.webhookUrl);
            console.log(`[Webhook] Webhook configured for ${instance} during connection`);
          }
        }
      } catch (webhookError: any) {
        console.warn(`[Webhook] Failed to configure webhook during connection:`, webhookError.message);
      }
    }
  } catch (error) {
    console.error("[Webhook] Error handling connection update:", error);
  }
}

