import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as db from "./db";
import { processIncomingMessage } from "./aiService";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import QRCode from "qrcode";
import { fileTypeFromBuffer } from "file-type";

// Configuração do diretório de sessões
const BASE_SESSIONS_DIR = process.env.WHATSAPP_SESSIONS_DIR
  ? path.resolve(process.env.WHATSAPP_SESSIONS_DIR)
  : path.resolve(process.cwd(), "data", "whatsapp-sessions");

if (!fs.existsSync(BASE_SESSIONS_DIR)) {
  fs.mkdirSync(BASE_SESSIONS_DIR, { recursive: true });
}

// Mapa para resolução manual de LID -> Phone em memória (além do banco)
const lidResolutionMap = new Map<string, string>();

// Armazenar sockets (clientes) ativos
const activeSockets = new Map<string, WASocket>();

export function getWhatsAppClient(instanceKey: string): WASocket | undefined {
  return activeSockets.get(instanceKey);
}

/**
 * Tenta resolver um LID para um número real de forma síncrona/on-demand
 */
export async function resolveLidSync(instanceKey: string, currentNumber: string, metadataLid?: string): Promise<string | undefined> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) return undefined;

  const lid = metadataLid || (currentNumber.length >= 14 ? (currentNumber.includes("@") ? currentNumber : `${currentNumber}@lid`) : undefined);
  if (!lid) {
    console.log(`[WhatsApp] resolveLidSync: No LID found/detected for ${currentNumber}`);
    return undefined;
  }

  // 1. Verificar mapa em memória primeiro
  const fromMap = lidResolutionMap.get(lid);
  if (fromMap) {
    console.log(`[WhatsApp] LID ${lid} already in cache: ${fromMap}`);
    return fromMap;
  }

  // 2. Tentar onWhatsApp se for um LID JID válido
  try {
    const jid = lid.includes("@") ? lid : `${lid}@lid`;
    console.log(`[WhatsApp] Querying onWhatsApp for JID: ${jid}...`);
    const results = await sock.onWhatsApp(jid);

    if (results && results.length > 0) {
      const result = results[0];
      console.log(`[WhatsApp] onWhatsApp result for ${jid}:`, JSON.stringify(result));

      if (result.exists && result.jid && result.jid.includes("@s.whatsapp.net")) {
        const realNumber = result.jid.split("@")[0];
        console.log(`[WhatsApp] Successfully resolved ${lid} to ${realNumber}`);
        lidResolutionMap.set(lid, realNumber);
        return realNumber;
      }
    } else {
      console.log(`[WhatsApp] No onWhatsApp results for ${jid}`);
    }
  } catch (err) {
    console.error(`[WhatsApp] Error resolving LID ${lid} via onWhatsApp:`, err);
  }

  return undefined;
}

// Helper para buscar foto de perfil
export async function fetchAndSaveProfilePic(sock: WASocket, jid: string, contactId: number) {
  console.log(`[WhatsApp] fetchAndSaveProfilePic called for JID: ${jid}, Contact ID: ${contactId}`);
  try {
    const ppUrl = await sock.profilePictureUrl(jid, "image").catch((err) => {
      console.log(`[WhatsApp] Profile pic not found or private for ${jid}:`, err?.message || err);
      return null;
    });

    if (ppUrl) {
      console.log(`[WhatsApp] Profile pic found for ${jid}: ${ppUrl.substring(0, 50)}...`);
      await db.updateContactProfilePic(contactId, ppUrl);
    } else {
      console.log(`[WhatsApp] No profile pic URL returned for ${jid}`);
    }
  } catch (err) {
    console.error(`[WhatsApp] Unexpected error in fetchAndSaveProfilePic for ${jid}:`, err);
  }
}

// Configuração do Logger
const logger = pino({ level: "silent" }); // Use "info" ou "debug" para ver logs detalhados

// --- BRUTE FORCE FIXER ---
// Executar a cada 30 segundos para garantir que LIDs sejam resolvidos
setInterval(async () => {
  try {
    const instances = Array.from(activeSockets.keys());
    if (instances.length === 0) {
      console.log("[AutoFix] No active sockets, skipping sync");
      return;
    }

    console.log(`[AutoFix] Starting sync cycle with ${instances.length} active instances`);

    // Iterar por todas as instâncias ativas
    for (const instanceKey of instances) {
      try {
        const anySocket = activeSockets.get(instanceKey);
        if (!anySocket) continue;

        const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
        if (!dbInstance) {
          console.log(`[AutoFix] No DB instance found for key: ${instanceKey}`);
          continue;
        }

        console.log(`[AutoFix] Processing workspace ${dbInstance.workspaceId} with instance ${instanceKey}`);

        const allContacts = await db.getContactsByWorkspace(dbInstance.workspaceId);
        const suspicious = allContacts.filter(c => c.whatsappNumber.length >= 14 && !c.whatsappNumber.includes("-"));
        const missingPic = allContacts.filter(c => !c.profilePicUrl && c.whatsappNumber.length < 14 && !c.whatsappNumber.includes("-")); // Contatos normais sem foto

        console.log(`[AutoFix] Workspace ${dbInstance.workspaceId}: ${allContacts.length} total, ${suspicious.length} suspicious LIDs, ${missingPic.length} missing pics`);

        // Corrigir contatos sem foto (normais)
        if (missingPic.length > 0) {
          console.log(`[AutoFix] Fetching ${missingPic.length} missing profile pictures...`);
          for (const c of missingPic) {
            const jid = c.whatsappNumber.includes("@") ? c.whatsappNumber : `${c.whatsappNumber}@s.whatsapp.net`;
            await fetchAndSaveProfilePic(anySocket, jid, c.id);
          }
        }

        if (suspicious.length > 0) {
          console.log(`[AutoFix] Found ${suspicious.length} suspicious LIDs. Attempting resolution...`);

          for (const c of suspicious) {
            // LID original pode estar no whatsappNumber ou no metadata.whatsappLid
            const lid = (c.metadata as any)?.whatsappLid ||
              (c.whatsappNumber.includes("@lid") ? c.whatsappNumber : `${c.whatsappNumber}@lid`);

            console.log(`[AutoFix] Processing suspicious contact ${c.id} (${c.whatsappNumber}). Target LID: ${lid}`);
            try {
              const resolvedNumber = await resolveLidSync(instanceKey, c.whatsappNumber, lid);

              if (resolvedNumber && resolvedNumber !== c.whatsappNumber) {
                console.log(`[AutoFix] SUCCESS: Resolved ${c.whatsappNumber} -> ${resolvedNumber}`);

                await db.updateContactWhatsappNumber(c.id, resolvedNumber);
                if (c.name === c.whatsappNumber) {
                  await db.updateContactName(c.id, resolvedNumber);
                }

                // Atualizar metadata com o número real também
                await db.updateContactMetadata(c.id, (m: any = {}) => ({
                  ...m,
                  whatsappJid: `${resolvedNumber}@s.whatsapp.net`,
                  whatsappLid: lid
                }));

                // Buscar foto de perfil já que resolvemos o número
                await fetchAndSaveProfilePic(anySocket, `${resolvedNumber}@s.whatsapp.net`, c.id);
              } else {
                console.log(`[AutoFix] Could not resolve ${lid} to Phone yet. Trying profile pic for LID directly...`);
                // Fallback: tentar buscar foto do LID mesmo se não resolver o número
                await fetchAndSaveProfilePic(anySocket, lid, c.id);
              }
            } catch (err) {
              console.error(`[AutoFix] Failed to resolve contact ${c.id} (${c.whatsappNumber}):`, err);
            }
          }
        }
      } catch (instanceErr) {
        console.error(`[AutoFix] Error processing instance ${instanceKey}:`, instanceErr);
      }
    }

    console.log("[AutoFix] Sync cycle completed");
  } catch (err) {
    console.error("[AutoFix] Error in sync loop:", err);
  }
}, 30000); // 30 segundos

// Iniciar servidor exportado se houver (mantendo final do arquivo)

/**
 * Upload de mídia para Supabase Storage
 */
async function uploadMediaToSupabase(
  workspaceId: number,
  mediaBase64: string,
  mimeType: string,
  fileName: string
): Promise<string | undefined> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("[WhatsApp] Supabase not configured for media uploads");
      return undefined;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucketName = "whatsapp-media";

    // Verificar se o bucket existe (otimização: assumir que sim ou tratar erro)
    // Para simplificar, vamos tentar upload direto e criar se falhar

    const buffer = Buffer.from(mediaBase64, "base64");
    const filePath = `workspaces/${workspaceId}/media/${Date.now()}-${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, { contentType: mimeType, upsert: false });

    if (error) {
      // Se o bucket não existir, tentar criar (apenas uma vez)
      if (error.message.includes("Bucket not found")) {
        console.log(`[WhatsApp] Creating Supabase Storage bucket: ${bucketName}`);
        await supabase.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: 50 * 1024 * 1024, // 50MB
        });
        // Tentar novamente
        const retry = await supabase.storage
          .from(bucketName)
          .upload(filePath, buffer, { contentType: mimeType, upsert: false });

        if (retry.error) {
          console.error("[WhatsApp] Supabase Storage upload error (retry):", retry.error);
          return undefined;
        }
      } else {
        console.error("[WhatsApp] Supabase Storage upload error:", error);
        return undefined;
      }
    }

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    console.log(`[WhatsApp] Media uploaded to Supabase Storage: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error("[WhatsApp] Error uploading media to Supabase:", error);
    return undefined;
  }
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  qrcode?: {
    code: string; // URL crua do QR (se houver)
    base64: string; // Imagem Base64
  };
}

export interface InstanceStatus {
  instanceName: string;
  status: string;
  phoneNumber?: string;
}

/**
 * Criar uma nova instância do WhatsApp usando Baileys
 */
export async function createWhatsAppInstance(instanceKey: string): Promise<CreateInstanceResponse> {
  // Se já existe e está conectado, retornar status atual
  if (activeSockets.has(instanceKey)) {
    const sock = activeSockets.get(instanceKey)!;
    // Tentar inferir status baseada na presença do user
    const status = sock.user ? "connected" : "connecting";
    console.log(`[WhatsApp] Instance ${instanceKey} already active (status: ${status})`);

    return {
      instance: {
        instanceName: instanceKey,
        status,
      },
    };
  }


  console.log(`[WhatsApp] Creating new Baileys instance for ${instanceKey}...`);

  // Configurar diretório de autenticação
  const authPath = path.join(BASE_SESSIONS_DIR, instanceKey);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[WhatsApp] Using WA version v${version.join(".")}, isLatest: ${isLatest}`);

  // Criar o socket
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false, // Capturamos via evento
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // Otimizações para estabilidade
    generateHighQualityLinkPreview: true,
    browser: ["WhatsApp SaaS", "Chrome", "10.0.0"],
    syncFullHistory: true, // Sincronizar histórico recente (última semana)
  });

  // Mapa para guardar QR code temporariamente até ser consumido ou expirado
  let currentQrBase64: string | null = null;

  // Registrar gerenciamento de credenciais
  sock.ev.on("creds.update", saveCreds);

  // Gerenciamento de Conexão
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`[WhatsApp] QR Code generated for ${instanceKey}`);
      try {
        currentQrBase64 = await QRCode.toDataURL(qr);

        // Atualizar no banco
        const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
        if (dbInstance) {
          await db.updateWhatsappInstanceStatus(dbInstance.id, "connecting", undefined, currentQrBase64);
        }
      } catch (err) {
        console.error("[WhatsApp] Failed to generate QR Base64:", err);
      }
    }

    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(`[WhatsApp] Connection closed for ${instanceKey}. Reason: ${lastDisconnect?.error}, Reconnect: ${shouldReconnect}`);

      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);

      if (shouldReconnect) {
        if (dbInstance) await db.updateWhatsappInstanceStatus(dbInstance.id, "connecting");
        // Reconexão automática é tratada pelo Baileys na maioria dos casos se não deletarmos o socket?
        // Na prática, Baileys pede recriação do socket. Vamos chamar recursivamente.
        // IMPORTANTE: Pequeno delay para evitar loops rápidos
        setTimeout(() => createWhatsAppInstance(instanceKey), 3000);
      } else {
        // Desconectado (Log out)
        console.log(`[WhatsApp] Instance ${instanceKey} logged out.`);
        if (dbInstance) await db.updateWhatsappInstanceStatus(dbInstance.id, "disconnected");

        // Limpar sessão do sistema de arquivos
        activeSockets.delete(instanceKey);
        if (fs.existsSync(authPath)) {
          fs.rmSync(authPath, { recursive: true, force: true });
        }
      }

      activeSockets.delete(instanceKey);
    } else if (connection === "open") {
      console.log(`[WhatsApp] Connection opened for ${instanceKey}`);

      const userJid = sock.user?.id;
      const phoneNumber = userJid ? userJid.split(":")[0] : undefined;

      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (dbInstance) {
        await db.updateWhatsappInstanceStatus(dbInstance.id, "connected", phoneNumber);
      }

      activeSockets.set(instanceKey, sock);
    }
  });

  // Gerenciamento de Contatos (para mapear LID -> Phone)
  sock.ev.on("contacts.upsert", async (contacts) => {
    try {
      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (!dbInstance) return;

      console.log(`[WhatsApp] Received ${contacts.length} contacts sync for ${instanceKey}`);

      for (const contact of contacts) {
        // Log para debug temporário
        if (contact.lid || (contact.id && contact.id.length > 15)) {
          console.log(`[WhatsApp Debug] Contact Sync: ID=${contact.id}, LID=${contact.lid}, Name=${contact.name}`);
        }

        if (contact.id && contact.lid) {
          const phoneJid = contact.id.includes("@s.whatsapp.net") ? contact.id : undefined;
          const lidJid = contact.lid;

          if (phoneJid && lidJid) {
            const phoneNumber = phoneJid.split("@")[0];
            lidResolutionMap.set(lidJid, phoneNumber);

            // Buscar contato por workspace
            const allContacts = await db.getContactsByWorkspace(dbInstance.workspaceId);

            // Tentar achar contato que tenha esse LID ou que tenha o número igual ao LID
            const contactToUpdate = allContacts.find(c =>
              (c.metadata as any)?.whatsappLid === lidJid ||
              c.whatsappNumber === lidJid.split("@")[0] ||
              c.whatsappNumber === lidJid
            );

            if (contactToUpdate && contactToUpdate.whatsappNumber !== phoneNumber) {
              console.log(`[WhatsApp] Correcting contact ${contactToUpdate.id}: LID ${lidJid} -> Phone ${phoneNumber}`);
              await db.updateContactWhatsappNumber(contactToUpdate.id, phoneNumber);
              await db.updateContactMetadata(contactToUpdate.id, (m: any = {}) => ({
                ...m,
                whatsappLid: lidJid,
                whatsappJid: phoneJid
              }));

              // Se o nome for igual ao número antigo (LID), atualizar o nome também
              if (contactToUpdate.name === contactToUpdate.whatsappNumber) {
                await db.updateContactName(contactToUpdate.id, phoneNumber);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Error processing contacts.upsert:", err);
    }
  });

  // Gerenciamento de Histórico (Backfill de mensagens antigas)
  sock.ev.on("messaging-history.set", async ({ chats, contacts, messages, isLatest }) => {
    try {
      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (!dbInstance) return;

      console.log(`[WhatsApp] History sync received for ${instanceKey}: ${messages.length} messages, ${chats.length} chats, ${contacts.length} contacts`);

      // Filtrar apenas mensagens do último mês (30 dias)
      const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const recentMessages = messages.filter(msg => {
        const timestamp = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp?.low || 0) * 1000;
        return timestamp >= oneMonthAgo;
      });

      console.log(`[WhatsApp] Filtered to ${recentMessages.length} messages from last 30 days`);

      // Processar mensagens recentes
      for (const msg of recentMessages) {
        if (!msg.message) continue;

        const isFromMe = msg.key.fromMe;
        const remoteJid = msg.key.remoteJid;

        if (!remoteJid || remoteJid === "status@broadcast") continue;
        
        // Pular grupos no histórico - mensagens antigas de grupos não são importadas
        const isGroup = remoteJid.includes("@g.us");
        if (isGroup) {
          continue; // Não importar mensagens antigas de grupos
        }

        let jidUser = remoteJid.split("@")[0];
        let whatsappNumber = jidUser;

        // Priorizar senderPn 
        const senderPn = (msg as any).senderPn || (msg.key as any).senderPn;
        if (senderPn) {
          whatsappNumber = senderPn.split("@")[0];
          jidUser = whatsappNumber;
        }

        const contactName = msg.pushName || whatsappNumber;

        // Buscar/Criar contato
        let contact = await db.getContactByNumber(dbInstance.workspaceId, whatsappNumber);
        if (!contact) {
          const contactId = await db.createContact({
            workspaceId: dbInstance.workspaceId,
            whatsappNumber,
            name: contactName,
            kanbanStatus: "new_contact",
            metadata: {
              whatsappJid: remoteJid,
              whatsappLid: remoteJid.endsWith("@lid") ? remoteJid : undefined,
              pushName: msg.pushName
            }
          });
          contact = await db.getContactByNumber(dbInstance.workspaceId, whatsappNumber);
        }

        if (!contact) continue;

        // Buscar ou criar conversa
        let conversation = await db.getConversationByContact(dbInstance.workspaceId, contact.id);
        if (!conversation) {
          const newConvId = await db.createConversation({
            contactId: contact.id,
            instanceId: dbInstance.id,
            workspaceId: dbInstance.workspaceId,
            status: 'bot_handling'
          });
          conversation = { id: newConvId } as any;
        }

        // Extrair conteúdo da mensagem
        const messageType = Object.keys(msg.message)[0];
        const content = msg.message[messageType as keyof typeof msg.message] as any;
        const body = content?.text || content?.caption || msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        // Salvar mensagem
        await db.createMessage({
          conversationId: conversation!.id,
          content: body || "(Mensagem sem texto)",
          senderType: isFromMe ? "agent" : "contact",
          sentAt: new Date((typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp?.low || 0) * 1000),
          whatsappMessageId: msg.key.id,
          messageType: 'text',
          metadata: {
            pushName: msg.pushName
          }
        });
      }

      console.log(`[WhatsApp] History sync completed for ${instanceKey}`);
    } catch (err) {
      console.error("[WhatsApp] Error in messaging-history.set:", err);
    }
  });

  // Gerenciamento de Mensagens
  sock.ev.on("messages.upsert", async (m) => {
    try {
      if (m.type !== "notify") return; // Apenas novas mensagens notificadas

      for (const msg of m.messages) {
        if (!msg.message) continue; // Ignorar mensagens vazias

        const isFromMe = msg.key.fromMe;
        const remoteJid = msg.key.remoteJid;

        if (!remoteJid || remoteJid === "status@broadcast") continue;
        const isGroup = remoteJid.includes("@g.us"); // Ignorar grupos por enquanto

        if (isFromMe) {
          // Ajuste: Vamos processar mensagens enviadas pelo celular APENAS para salvar no histórico
          // A lógica de salvamento será feita mais abaixo (sem chamar a IA)
          console.log(`[WhatsApp] Message from ME detected (${remoteJid}). Will sync to history.`);
        }

        console.log(`[WhatsApp] New message from ${remoteJid}`);

        const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
        if (!dbInstance) continue;

        // Processamento básico de contato
        let jidUser = remoteJid.split("@")[0]; // Numero cru
        let whatsappNumber = jidUser;

        // Priorizar senderPn para resolver LID automaticamente (Baileys v6+)
        // Isso evita chamadas onWhatsApp desnecessárias
        const senderPn = (msg as any).senderPn || (msg.key as any).senderPn;
        if (senderPn && !isGroup) {
          const pn = senderPn.split("@")[0];
          console.log(`[WhatsApp] senderPn detected: ${pn}. Using as real number for ${remoteJid}`);
          whatsappNumber = pn;
          jidUser = pn;
        }

        let contactName = msg.pushName || whatsappNumber;

        // Se for grupo, tentar obter o nome real do grupo (subject)
        if (isGroup) {
          try {
            // Pequeno delay para garantir que a conexão esteja pronta para query
            const groupMeta = await sock.groupMetadata(remoteJid);
            if (groupMeta && groupMeta.subject) {
              contactName = groupMeta.subject;
              console.log(`[WhatsApp] Group subject found: ${contactName}`);
            }
          } catch (gErr) {
            console.log(`[WhatsApp] Could not fetch group metadata (might be syncing):`, gErr);
          }
        }

        // Verificar antigo timestamp
        if (msg.messageTimestamp) {
          const msgTime = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.low) * 1000;
          const instanceCreatedAtMs =
            dbInstance.createdAt instanceof Date
              ? dbInstance.createdAt.getTime()
              : typeof dbInstance.createdAt === "number"
                ? dbInstance.createdAt * 1000
                : new Date(dbInstance.createdAt).getTime();

          if (msgTime + 10000 < instanceCreatedAtMs) {
            // Ignorar mensagens muito antigas (antes do boot) para evitar flood
            continue;
          }
        }

        // Buscar/Criar contato
        let contact = await db.getContactByNumber(dbInstance.workspaceId, whatsappNumber);

        // Se o número buscado for um LID, tentar resolver para o número real se possível
        if (remoteJid.endsWith("@lid")) {
          console.log(`[WhatsApp] LID message detected from ${remoteJid}. Attempting on-demand resolution...`);

          // Tentar resolver agora mesmo
          const resolved = await resolveLidSync(instanceKey, jidUser, remoteJid);
          if (resolved) {
            console.log(`[WhatsApp] On-demand resolution success: ${remoteJid} -> ${resolved}`);
            whatsappNumber = resolved;
            jidUser = resolved;
            // Tentar buscar contato pelo novo número resolvido
            contact = await db.getContactByNumber(dbInstance.workspaceId, whatsappNumber);
          } else {
            console.warn(`[WhatsApp] On-demand resolution failed for ${remoteJid}.`);

            const allContacts = await db.getContactsByWorkspace(dbInstance.workspaceId);
            // 1. Tentar achar um contato que já tenha esse LID no metadados
            const foundByLid = allContacts.find(c => (c.metadata as any)?.whatsappLid === remoteJid);

            if (foundByLid) {
              contact = foundByLid;
              // Se achou pelo LID nos metadados, usar o número associado (mesmo se for o LID ainda)
              whatsappNumber = contact.whatsappNumber;
              jidUser = contact.whatsappNumber;
            }
          }
        }

        if (!contact) {
          const contactId = await db.createContact({
            workspaceId: dbInstance.workspaceId,
            whatsappNumber,
            name: contactName,
            metadata: {
              whatsappJid: remoteJid,
              whatsappLid: remoteJid.endsWith("@lid") ? remoteJid : undefined,
              pushName: msg.pushName
            }
          });
          contact = await db.getContactByNumber(dbInstance.workspaceId, whatsappNumber);
        } else {
          // Se o contato foi achado mas o número dele ainda é um ID estranho (@lid)
          // e o nosso mapa ou metadados já sabem o número real
          if (remoteJid.endsWith("@lid")) {
            const realPhone = lidResolutionMap.get(remoteJid);
            if (realPhone && contact.whatsappNumber !== realPhone) {
              console.log(`[WhatsApp] Real-time correction for contact ${contact.id}: ${contact.whatsappNumber} -> ${realPhone}`);
              await db.updateContactWhatsappNumber(contact.id, realPhone);
              contact.whatsappNumber = realPhone;
              whatsappNumber = realPhone;
              jidUser = realPhone;
            }
          }

          // Atualizar metadata se necessário
          await db.updateContactMetadata(contact.id, (metadata: any = {}) => ({
            ...metadata,
            whatsappJid: remoteJid,
            whatsappLid: remoteJid.endsWith("@lid") ? remoteJid : metadata.whatsappLid,
            pushName: msg.pushName || metadata.pushName
          }));

          // Tentar buscar foto de perfil se não tiver
          if (!contact.profilePicUrl) {
            const targetJid = remoteJid.includes("@lid") ?
              (contact.whatsappNumber.includes("@") ? contact.whatsappNumber : `${contact.whatsappNumber}@s.whatsapp.net`) :
              remoteJid;

            // Só busca se for @s.whatsapp.net (não funciona com LID direto geralmente)
            if (targetJid.includes("@s.whatsapp.net")) {
              fetchAndSaveProfilePic(sock, targetJid, contact.id);
            }
          }

          // Se estiver arquivado, trazer de volta para o Kanban
          if (contact.kanbanStatus === 'archived') {
            // Verificando se db.updateContactStatus existe ou se é updateContactKanbanStatus
            await db.updateContactKanbanStatus(contact.id, 'new_contact');
          }
        }

        if (!contact) continue;

        // Buscar ou Criar Conversa (Necessário para salvar mensagem enviada pelo celular)
        let conversation = await db.getConversationByContact(dbInstance.workspaceId, contact.id);
        if (!conversation) {
          const newConvId = await db.createConversation({
            contactId: contact.id,
            instanceId: dbInstance.id,
            workspaceId: dbInstance.workspaceId,
            status: 'bot_handling' // Default status
          });
          // Reconstruir objeto mínimo necessário ou buscar novamente
          conversation = { id: newConvId } as any;
        }

        // Atualizar status para não lido SOMENTE SE NÃO FOR MINHA MENSAGEM
        if (!isFromMe) {
          await db.updateContactMetadata(contact.id, (metadata: any = {}) => ({
            ...metadata,
            unread: true,
          }));
        }

        // Baixar mídia se houver
        let mediaUrl: string | undefined;
        let mediaType: "image" | "audio" | "video" | "document" | undefined;
        let mediaBase64: string | undefined;
        let mediaMimeType: string | undefined;

        // Simplificação: checar tipos comuns
        const messageType = Object.keys(msg.message)[0];
        const content = msg.message[messageType as keyof typeof msg.message] as any;

        // Extrair texto MELHORADO
        let body = content?.text || content?.caption || msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        // Fallback para tipos complexos se body estiver vazio
        if (!body) {
          if (messageType === 'stickerMessage') body = '[Figurinha]';
          else if (messageType === 'imageMessage') body = '[Imagem]';
          else if (messageType === 'videoMessage') body = '[Vídeo]';
          else if (messageType === 'audioMessage') body = '[Áudio]';
          else if (messageType === 'documentMessage') body = '[Documento]';
          else if (messageType === 'reactionMessage') body = null; // Ignorar reações por enquanto
          else if (messageType === 'protocolMessage') body = null; // Mensagens de sistema
          else if (messageType === 'senderKeyDistributionMessage') body = null; // Distribuição de chaves em grupos
          else body = `[${messageType}]`;
        }

        if (!body) continue; // Pular mensagens vazias ou ignoradas

        if (messageType === 'imageMessage' || messageType === 'videoMessage' || messageType === 'audioMessage' || messageType === 'documentMessage' || messageType === 'stickerMessage') {
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              logger,
              reuploadRequest: sock.updateMediaMessage
            }) as Buffer;

            mediaBase64 = buffer.toString('base64');
            mediaMimeType = content.mimetype;

            if (messageType === 'imageMessage') mediaType = 'image';
            else if (messageType === 'videoMessage') mediaType = 'video';
            else if (messageType === 'audioMessage') mediaType = 'audio';
            else if (messageType === 'documentMessage') mediaType = 'document';
            else if (messageType === 'stickerMessage') mediaType = 'image'; // Stickers são tratados como imagens

            const fileName = content.fileName || `${messageType}-${Date.now()}.${mediaMimeType?.split('/')[1] || 'webp'}`;

            if (dbInstance.workspaceId && mediaBase64) {
              mediaUrl = await uploadMediaToSupabase(dbInstance.workspaceId, mediaBase64, mediaMimeType || 'application/octet-stream', fileName);
            }

          } catch (err) {
            console.error(`[WhatsApp] Failed to download media:`, err);
          }
        }

        // Verificar transcrição de voz futuramente aqui se mediaType == 'audio'

        console.log(`[WhatsApp] Processing message from ${whatsappNumber}: ${body.substring(0, 50)}...`);

        // Se a mensagem é MINHA (enviada pelo celular), salvar como "agent" e NÃO chamar a IA
        if (isFromMe) {
          console.log(`[WhatsApp] Syncing sent message from device (isFromMe=true)`);

          await db.createMessage({
            conversationId: conversation!.id,
            content: body || (mediaUrl ? `[${mediaType}]` : " (Mensagem sem texto)"),
            senderType: "agent", // Marcar como enviado por "agente" (usuário real)
            sentAt: new Date(),
            whatsappMessageId: msg.key.id, // Coluna top-level correta
            mediaUrl,
            messageType: mediaType || 'text',
            metadata: {
              isGroup: isGroup,
              participant: msg.key.participant || (msg as any).participant,
              pushName: msg.pushName,
              fileName: content?.fileName
            }
          });

          continue; // IMPORTANTE: Parar aqui para não chamar a IA
        }

        // GRUPOS: Salvar mensagem mas NÃO chamar a IA
        if (isGroup) {
          console.log(`[WhatsApp] Group message detected. Saving without AI processing.`);
          
          // Buscar foto de perfil do participante
          const participantJid = msg.key.participant || (msg as any).participant;
          let participantProfilePic: string | undefined;
          if (participantJid) {
            try {
              participantProfilePic = await sock.profilePictureUrl(participantJid, 'image');
            } catch (e) {
              // Sem foto de perfil
            }
          }
          
          await db.createMessage({
            conversationId: conversation!.id,
            content: body || (mediaUrl ? `[${mediaType}]` : " (Mensagem sem texto)"),
            senderType: "contact",
            sentAt: new Date(),
            whatsappMessageId: msg.key.id,
            mediaUrl,
            messageType: mediaType || 'text',
            metadata: {
              isGroup: true,
              participant: participantJid,
              pushName: msg.pushName,
              participantProfilePic,
              fileName: content?.fileName
            }
          });

          continue; // IMPORTANTE: Parar aqui para NÃO chamar a IA em grupos
        }

        // Chamar IA apenas para mensagens de terceiros (NÃO grupos)
        await processIncomingMessage(
          dbInstance.workspaceId,
          contact.id,
          dbInstance.id,
          body,
          whatsappNumber,
          mediaUrl,
          mediaType,
          mediaBase64,
          mediaMimeType
        );

      }
    } catch (err) {
      console.error("[WhatsApp] Error in messages.upsert:", err);
    }
  });

  // Salvar socket ativo
  activeSockets.set(instanceKey, sock);

  // Aguardar um pouco para dar chance do QR ser gerado se for primeira conexão
  await new Promise(r => setTimeout(r, 2000));

  // Buscar no banco se gerou QR
  const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);

  return {
    instance: {
      instanceName: instanceKey,
      status: "connecting",
    },
    qrcode: dbInstance?.qrCode ? { base64: dbInstance.qrCode, code: "" } : currentQrBase64 ? { base64: currentQrBase64, code: "" } : undefined
  };
}

/**
 * Retornar QR Code
 */
export async function getQRCode(instanceKey: string): Promise<{ base64: string; code: string }> {
  const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
  if (dbInstance?.qrCode) {
    return { base64: dbInstance.qrCode, code: "" };
  }
  throw new Error("QR Code not available");
}

/**
 * Retornar Status
 */
export async function getInstanceStatus(instanceKey: string): Promise<InstanceStatus> {
  const sock = activeSockets.get(instanceKey);
  const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);

  // Se socket existe, usar user para ver se está conectado
  if (sock && sock.user) {
    return {
      instanceName: instanceKey,
      status: "connected",
      phoneNumber: sock.user.id.split(":")[0]
    };
  }

  // Se não, confiar no banco (pode estar conectando)
  return {
    instanceName: instanceKey,
    status: dbInstance?.status || "disconnected",
    phoneNumber: dbInstance?.phoneNumber || undefined
  };
}

/**
 * Desconectar
 */
export async function disconnectInstance(instanceKey: string): Promise<void> {
  const sock = activeSockets.get(instanceKey);
  if (sock) {
    console.log(`[WhatsApp] Disconnecting ${instanceKey}...`);
    sock.end(undefined);
    activeSockets.delete(instanceKey);
  }

  const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
  if (dbInstance) {
    await db.updateWhatsappInstanceStatus(dbInstance.id, "disconnected");
  }
}

/**
 * Reconectar // Apenas chama create novamente
 */
export async function reconnectInstance(instanceKey: string): Promise<CreateInstanceResponse> {
  await disconnectInstance(instanceKey); // Garantir limpo
  return createWhatsAppInstance(instanceKey);
}

/**
 * Enviar Texto
 */
export async function sendTextMessage(instanceKey: string, number: string, text: string): Promise<string> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  // Formatar JID
  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;

  const sent = await sock.sendMessage(jid, { text });
  return sent?.key.id || "unknown_id";
}

/**
 * Enviar Mídia
 */
export async function sendMediaMessage(
  instanceKey: string,
  number: string,
  mediaUrl: string,
  mediaType: "image" | "audio" | "video" | "document",
  caption?: string
): Promise<string> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;

  // Baileys suporta URL diretamente em muitos casos, mas backend pode precisar baixar antes se for complexo.
  // Para simplificar, assumimos que mediaUrl é publica ou acessivel.

  const payload: any = {};
  if (caption) payload.caption = caption;

  if (mediaType === "image") {
    payload.image = { url: mediaUrl };
  } else if (mediaType === "video") {
    payload.video = { url: mediaUrl };
    // Detectar mimetype correto baseado na extensão
    if (mediaUrl.endsWith(".mp4")) {
      payload.mimetype = "video/mp4";
    } else if (mediaUrl.endsWith(".webm")) {
      payload.mimetype = "video/webm";
    } else {
      payload.mimetype = "video/mp4"; // Padrão
    }
  } else if (mediaType === "audio") {
    payload.audio = { url: mediaUrl };
    // Detectar mimetype correto base na extensão
    if (mediaUrl.endsWith(".ogg")) {
      payload.mimetype = "audio/ogg; codecs=opus";
    } else {
      payload.mimetype = "audio/mp4";
    }
    payload.ptt = true; // Enviar como nota de voz? Geralmente sim para bots.
  } else {
    payload.document = { url: mediaUrl };
    payload.mimetype = "application/pdf"; // Tentar inferir se possível
  }

  const sent = await sock.sendMessage(jid, payload);
  return sent?.key.id || "unknown_id";
}

/**
 * Deletar mensagem para todos
 */
export async function deleteMessage(instanceKey: string, number: string, messageId: string, fromMe: boolean = true): Promise<void> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  // Formatar JID
  const remoteJid = number.includes("@") ? number : `${number}@s.whatsapp.net`;

  await sock.sendMessage(remoteJid, {
    delete: {
      remoteJid,
      fromMe,
      id: messageId,
      participant: undefined // usado para grupos
    }
  });
}

/**
 * Buscar histórico de mensagens de um chat específico
 */
export async function fetchChatHistory(
  instanceKey: string,
  remoteJid: string,
  limit: number = 50
): Promise<any[]> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  try {
    console.log(`[WhatsApp] Fetching history for ${remoteJid}, limit: ${limit}`);

    // Usar fetchMessagesFromWA do Baileys (função interna)
    // Nota: Baileys não expõe diretamente fetchMessageHistory como API pública
    // Vamos usar um workaround: buscar do histórico local do socket se disponível

    // Alternativa: usar chatModify para solicitar histórico (não funciona bem)
    // Melhor: processar do histórico já sincronizado via messaging-history.set

    // Por limitações do Baileys, vamos retornar vazio por enquanto
    // e documentar que o histórico principal vem do sync automático
    console.log(`[WhatsApp] Note: fetchChatHistory is limited by Baileys API. Use messaging-history.set for bulk sync.`);

    return [];
  } catch (err) {
    console.error(`[WhatsApp] Error fetching chat history for ${remoteJid}:`, err);
    throw err;
  }
}

/**
 * Inicializar instâncias existentes no banco
 */
export async function initializeExistingInstances(): Promise<void> {
  const instances = await db.getAllConnectedWhatsappInstances();
  for (const instance of instances) {
    if (instance.instanceKey) {
      console.log(`[WhatsApp] Reconnecting instance ${instance.instanceKey}...`);
      createWhatsAppInstance(instance.instanceKey).catch(err =>
        console.error(`[WhatsApp] Failed to reconnect ${instance.instanceKey}:`, err)
      );
    }
  }
}

/**
 * Buscar todos os grupos do WhatsApp
 */
export async function fetchAllGroups(instanceKey: string): Promise<Array<{
  id: string;
  name: string;
  subject: string;
  desc?: string;
  owner?: string;
  creation?: number;
  participants: Array<{
    id: string;
    admin?: string;
    isSuperAdmin?: boolean;
  }>;
  profilePicUrl?: string;
}>> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  try {
    console.log(`[WhatsApp] Fetching all groups for ${instanceKey}...`);
    
    // Buscar todos os grupos que participamos
    const groups = await sock.groupFetchAllParticipating();
    
    const result = [];
    
    for (const [jid, metadata] of Object.entries(groups)) {
      console.log(`[WhatsApp] Processing group: ${jid} - ${metadata.subject}`);
      
      // Tentar buscar foto do grupo
      let profilePicUrl: string | undefined;
      try {
        profilePicUrl = await sock.profilePictureUrl(jid, "image").catch(() => undefined);
      } catch (err) {
        console.log(`[WhatsApp] No profile pic for group ${jid}`);
      }
      
      result.push({
        id: jid,
        name: metadata.subject || "Grupo sem nome",
        subject: metadata.subject || "",
        desc: metadata.desc || undefined,
        owner: metadata.owner || undefined,
        creation: metadata.creation,
        participants: metadata.participants.map(p => ({
          id: p.id,
          admin: p.admin || undefined,
          isSuperAdmin: p.admin === "superadmin",
        })),
        profilePicUrl,
      });
    }
    
    console.log(`[WhatsApp] Found ${result.length} groups`);
    return result;
  } catch (err) {
    console.error(`[WhatsApp] Error fetching groups:`, err);
    throw err;
  }
}

/**
 * Buscar metadados de um grupo específico
 */
export async function fetchGroupMetadata(instanceKey: string, groupJid: string): Promise<{
  id: string;
  name: string;
  subject: string;
  desc?: string;
  owner?: string;
  creation?: number;
  participants: Array<{
    id: string;
    name?: string;
    admin?: string;
    isSuperAdmin?: boolean;
    profilePicUrl?: string;
  }>;
  profilePicUrl?: string;
} | null> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  try {
    console.log(`[WhatsApp] Fetching metadata for group ${groupJid}...`);
    
    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata) return null;
    
    // Buscar foto do grupo
    let profilePicUrl: string | undefined;
    try {
      profilePicUrl = await sock.profilePictureUrl(groupJid, "image").catch(() => undefined);
    } catch (err) {
      console.log(`[WhatsApp] No profile pic for group ${groupJid}`);
    }
    
    // Buscar fotos dos participantes
    const participantsWithPics = await Promise.all(
      metadata.participants.map(async (p) => {
        let participantPic: string | undefined;
        try {
          participantPic = await sock.profilePictureUrl(p.id, "image").catch(() => undefined);
        } catch (err) {
          // Ignorar erro de foto
        }
        
        return {
          id: p.id,
          name: undefined, // Será preenchido depois se tivermos no contato
          admin: p.admin || undefined,
          isSuperAdmin: p.admin === "superadmin",
          profilePicUrl: participantPic,
        };
      })
    );
    
    return {
      id: groupJid,
      name: metadata.subject || "Grupo sem nome",
      subject: metadata.subject || "",
      desc: metadata.desc || undefined,
      owner: metadata.owner || undefined,
      creation: metadata.creation,
      participants: participantsWithPics,
      profilePicUrl,
    };
  } catch (err) {
    console.error(`[WhatsApp] Error fetching group metadata for ${groupJid}:`, err);
    return null;
  }
}

/**
 * Enviar PDF
 */
export async function sendPDFDocument(
  instanceKey: string,
  number: string,
  pdfBase64: string,
  fileName: string,
  caption?: string
): Promise<string> {
  const sock = activeSockets.get(instanceKey);
  if (!sock) throw new Error("Instance not connected");

  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;

  const buffer = Buffer.from(pdfBase64, "base64");

  const sent = await sock.sendMessage(jid, {
    document: buffer,
    mimetype: "application/pdf",
    fileName: fileName,
    caption: caption
  });

  return sent?.key.id || "unknown_id";
}
