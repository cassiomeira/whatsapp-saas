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
    
    // Extrair texto da mensagem
    let messageText = "";
    if (data.message?.conversation) {
      messageText = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      messageText = data.message.extendedTextMessage.text;
    } else if (data.message?.imageMessage?.caption) {
      messageText = data.message.imageMessage.caption || "[Imagem]";
    } else if (data.message?.videoMessage?.caption) {
      messageText = data.message.videoMessage.caption || "[Vídeo]";
    } else {
      messageText = `[${data.messageType || "Mensagem"}]`;
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
      whatsappNumber
    );

  } catch (error) {
    console.error("[Webhook] Error handling incoming message:", error);
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
  } catch (error) {
    console.error("[Webhook] Error handling connection update:", error);
  }
}

