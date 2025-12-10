import { createRequire } from "module";
import * as db from "./db";
import { processIncomingMessage } from "./aiService";
import path from "path";
import fs from "fs";
import type { Client as WhatsAppClient, Message as WhatsAppMessage, MessageMedia } from "whatsapp-web.js";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const wweb = require("whatsapp-web.js");
const Client = wweb.Client as typeof WhatsAppClient;
const Message = wweb.Message as typeof WhatsAppMessage;
const MessageMedia = wweb.MessageMedia as typeof MessageMedia;
const LocalAuth = wweb.LocalAuth;

const BASE_SESSIONS_DIR = process.env.WHATSAPP_SESSIONS_DIR
  ? path.resolve(process.env.WHATSAPP_SESSIONS_DIR)
  : path.resolve(process.cwd(), "data", "whatsapp-sessions");

if (!fs.existsSync(BASE_SESSIONS_DIR)) {
  fs.mkdirSync(BASE_SESSIONS_DIR, { recursive: true });
}

const LOCK_FILES = [
  "SingletonLock",
  "SingletonCookie",
  "SingletonStartupLock",
  "lockfile",
  "LOCK",
];

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

    // Verificar se o bucket existe
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);

    if (!bucketExists) {
      console.log(`[WhatsApp] Creating Supabase Storage bucket: ${bucketName}`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024, // 50MB
      });
      if (createError && !createError.message.includes("already exists")) {
        console.error("[WhatsApp] Failed to create bucket:", createError);
        return undefined;
      }
    }

    const buffer = Buffer.from(mediaBase64, "base64");
    const filePath = `workspaces/${workspaceId}/media/${Date.now()}-${fileName}`;
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, { contentType: mimeType, upsert: false });

    if (error) {
      console.error("[WhatsApp] Supabase Storage upload error:", error);
      return undefined;
    }

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    console.log(`[WhatsApp] Media uploaded to Supabase Storage: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error("[WhatsApp] Error uploading media to Supabase:", error);
    return undefined;
  }
}

function cleanupChromiumLocks(instanceKey: string) {
  const profileDir = path.join(BASE_SESSIONS_DIR, instanceKey, "Default");
  const instanceDir = path.join(BASE_SESSIONS_DIR, instanceKey);
  
  // Limpar locks no diretório Default
  for (const file of LOCK_FILES) {
    const lockPath = path.join(profileDir, file);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.log(`[WhatsApp] Removed Chromium lock file: ${lockPath}`);
      }
    } catch (error) {
      console.warn(`[WhatsApp] Failed to remove lock file ${lockPath}:`, error);
    }
  }
  
  // Limpar locks no diretório raiz da instância também
  for (const file of LOCK_FILES) {
    const lockPath = path.join(instanceDir, file);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.log(`[WhatsApp] Removed Chromium lock file: ${lockPath}`);
      }
    } catch (error) {
      console.warn(`[WhatsApp] Failed to remove lock file ${lockPath}:`, error);
    }
  }
  
  // Tentar remover todo o diretório Default se estiver corrompido (opcional, mais agressivo)
  try {
    const singletonLock = path.join(profileDir, "SingletonLock");
    if (fs.existsSync(singletonLock)) {
      // Se o SingletonLock ainda existe após tentar remover, pode ser que o diretório esteja corrompido
      console.warn(`[WhatsApp] SingletonLock still exists for ${instanceKey}, profile may be corrupted`);
    }
  } catch (error) {
    // Ignorar erros aqui
  }
}

// Armazenar clientes ativos
const activeClients = new Map<string, WhatsAppClient>();

export function getWhatsAppClient(instanceKey: string): WhatsAppClient | undefined {
  return activeClients.get(instanceKey);
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  qrcode?: {
    code: string;
    base64: string;
  };
}

export interface InstanceStatus {
  instanceName: string;
  status: string;
  phoneNumber?: string;
}

/**
 * Criar uma nova instância do WhatsApp usando whatsapp-web.js
 */
export async function createWhatsAppInstance(instanceKey: string): Promise<CreateInstanceResponse> {
  try {
    // Verificar se já existe um cliente para esta instância
    if (activeClients.has(instanceKey)) {
      console.log(`[WhatsApp] Client already exists for ${instanceKey}, checking state...`);
      const existingClient = activeClients.get(instanceKey)!;
      try {
        const state = await existingClient.getState();
        console.log(`[WhatsApp] Existing client state for ${instanceKey}: ${state}`);
        
        return {
          instance: {
            instanceName: instanceKey,
            status: state === "CONNECTED" ? "connected" : "connecting",
          },
        };
      } catch (error) {
        console.error(`[WhatsApp] Error getting state of existing client, recreating:`, error);
        // Se houver erro ao obter o estado, remover e recriar
        try {
          await existingClient.destroy();
        } catch (destroyError) {
          console.error(`[WhatsApp] Error destroying existing client:`, destroyError);
        }
        activeClients.delete(instanceKey);
        // Continuar para criar um novo cliente
      }
    }

    // Tentar encontrar o Chrome instalado
    let executablePath: string | undefined = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      const os = require("os");
      const platform = os.platform();
      
      // Locais comuns para Chrome no Windows
      const possiblePaths: string[] = [];
      
      if (platform === "win32") {
        // Cache do Puppeteer
        const cacheDir = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
        if (fs.existsSync(cacheDir)) {
          try {
            const chromeDirs = fs.readdirSync(cacheDir);
            for (const dir of chromeDirs) {
              const chromePath = path.join(cacheDir, dir, "chrome-win64", "chrome.exe");
              if (fs.existsSync(chromePath)) {
                possiblePaths.push(chromePath);
              }
            }
          } catch (error) {
            console.warn(`[WhatsApp] Error reading Puppeteer cache:`, error);
          }
        }
        
        // Chrome instalado no sistema
        const localAppData = process.env.LOCALAPPDATA || "";
        if (localAppData) {
          possiblePaths.push(
            path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(localAppData, "Google", "Chrome SxS", "Application", "chrome.exe")
          );
        }
        
        const programFiles = process.env.PROGRAMFILES || "";
        if (programFiles) {
          possiblePaths.push(
            path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe")
          );
        }
        
        const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "";
        if (programFilesX86) {
          possiblePaths.push(
            path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")
          );
        }
        
        // Procurar o primeiro que existe
        for (const chromePath of possiblePaths) {
          if (fs.existsSync(chromePath)) {
            executablePath = chromePath;
            break;
          }
        }
      }
    }

    console.log(`[WhatsApp] Creating new client for ${instanceKey}...`);

    // Criar cliente WhatsApp
    cleanupChromiumLocks(instanceKey);
    const puppeteerOptions: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-blink-features=AutomationControlled",
        "--disable-software-rasterizer",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--disable-component-extensions-with-background-pages",
        "--disable-ipc-flooding-protection",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--force-color-profile=srgb",
        "--metrics-recording-only",
        "--mute-audio",
      ],
      // Timeout mais longo para inicialização
      timeout: 60000,
      // Ignorar erros HTTPS
      ignoreHTTPSErrors: true,
    };

    // Adicionar executablePath se encontrado, senão deixar Puppeteer baixar
    if (executablePath) {
      console.log(`[WhatsApp] Using Chrome at: ${executablePath}`);
      puppeteerOptions.executablePath = executablePath;
    } else {
      console.log(`[WhatsApp] Chrome not found in common locations, Puppeteer will download it automatically`);
      // Deixar Puppeteer baixar o Chrome automaticamente
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: instanceKey,
        dataPath: BASE_SESSIONS_DIR,
      }),
      puppeteer: puppeteerOptions,
    });

    console.log(`[WhatsApp] Client created, registering event handlers for ${instanceKey}...`);

    let qrCodeBase64: string | null = null;

    // Evento: QR Code gerado
    client.on("qr", async (qr: string) => {
      console.log(`[WhatsApp] QR Code event fired for ${instanceKey}`);
      console.log(`[WhatsApp] QR Code generated for ${instanceKey}`);
      
      // Converter QR Code para base64
      try {
        const QRCode = await import("qrcode");
        qrCodeBase64 = await QRCode.toDataURL(qr);
        
        // Atualizar QR Code no banco de dados
        const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
        if (dbInstance) {
          await db.updateWhatsappInstanceStatus(dbInstance.id, "connecting", undefined, qrCodeBase64);
          console.log(`[WhatsApp] QR Code updated in database for ${instanceKey}`);
        }
      } catch (error) {
        console.error(`[WhatsApp] Error generating QR Code image:`, error);
      }
    });

    // Evento: Cliente pronto (conectado)
    client.on("ready", async () => {
      console.log(`[WhatsApp] Client ready for ${instanceKey}`);
      
      const info = client.info;
      const phoneNumber = info?.wid?.user || undefined;
      
      // Atualizar status no banco
      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (dbInstance) {
        await db.updateWhatsappInstanceStatus(dbInstance.id, "connected", phoneNumber);
        console.log(`[WhatsApp] Instance ${instanceKey} connected with phone: ${phoneNumber}`);
      }
    });

    // Evento: Autenticação realizada
    client.on("authenticated", () => {
      console.log(`[WhatsApp] Authenticated for ${instanceKey}`);
    });

    // Evento: Autenticação falhou
    client.on("auth_failure", async (msg: string) => {
      console.error(`[WhatsApp] Authentication failed for ${instanceKey}:`, msg);
      
      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (dbInstance) {
        await db.updateWhatsappInstanceStatus(dbInstance.id, "disconnected");
      }
    });

    // Evento: Desconectado
    client.on("disconnected", async (reason: string) => {
      console.log(`[WhatsApp] Disconnected for ${instanceKey}:`, reason);
      
      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (dbInstance) {
        await db.updateWhatsappInstanceStatus(dbInstance.id, "disconnected");
      }
      
      // Remover cliente da memória
      activeClients.delete(instanceKey);
    });

    // Evento: Mensagem recebida
    console.log(`[WhatsApp] Registering message event handler for ${instanceKey}...`);
    client.on("message", async (message: WhatsAppMessage) => {
      try {
        console.log(`[WhatsApp] ===== MESSAGE EVENT FIRED FOR ${instanceKey} =====`);
        console.log(`[WhatsApp] Message event received for ${instanceKey}:`, {
          from: message.from,
          fromMe: message.fromMe,
          body: message.body?.substring(0, 50),
          type: message.type,
        });

        // Ignorar mensagens próprias
        if (message.fromMe) {
          console.log(`[WhatsApp] Ignoring own message from ${instanceKey}`);
          return;
        }
        
        // Ignorar mensagens de grupos (por enquanto)
        if (message.from.includes("@g.us") || message.author?.includes("@g.us")) {
          console.log(`[WhatsApp] Ignoring group message from ${message.from}`);
          return;
        }
        if (message.from === "status@broadcast" || message.id?.remote === "status@broadcast") {
          console.log("[WhatsApp] Ignoring status/broadcast message");
          return;
        }

        const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
        if (!dbInstance) {
          console.error(`[WhatsApp] Instance not found for key: ${instanceKey}`);
          return;
        }

        console.log(`[WhatsApp] Instance found: ${dbInstance.id}, workspace: ${dbInstance.workspaceId}`);
        
        if (message.timestamp && dbInstance.createdAt) {
          const instanceCreatedAtMs =
            dbInstance.createdAt instanceof Date
              ? dbInstance.createdAt.getTime()
              : typeof dbInstance.createdAt === "number"
                ? dbInstance.createdAt * 1000
                : new Date(dbInstance.createdAt).getTime();
          const messageTimestampMs = message.timestamp * 1000;
          
          if (instanceCreatedAtMs && messageTimestampMs && messageTimestampMs + 5000 < instanceCreatedAtMs) {
            console.log(
              `[WhatsApp] Ignoring old message (timestamp ${messageTimestampMs}) older than instance creation (${instanceCreatedAtMs})`
            );
            return;
          }
        }

        // Extrair número do WhatsApp (formato: 5511999999999@s.whatsapp.net)
        const whatsappNumber = message.from.split("@")[0];
        console.log(`[WhatsApp] Message received from ${whatsappNumber}: ${message.body}`);

        // Buscar ou criar contato
        let contacts = await db.getContactsByWorkspace(dbInstance.workspaceId);
        let contact = contacts.find(c => c.whatsappNumber === whatsappNumber);
        
        if (!contact) {
          console.log(`[WhatsApp] Creating new contact for ${whatsappNumber}`);
          const contactName = message.notifyName || message.pushName || whatsappNumber;
          const contactId = await db.createContact({
            workspaceId: dbInstance.workspaceId,
            whatsappNumber,
            name: contactName,
          });
          console.log(`[WhatsApp] Contact created with ID: ${contactId}`);
          // Recarregar contatos
          contacts = await db.getContactsByWorkspace(dbInstance.workspaceId);
          contact = contacts.find(c => c.id === contactId);
        } else {
          console.log(`[WhatsApp] Contact found: ${contact.id} - ${contact.name}`);
        }

        if (!contact) {
          console.error(`[WhatsApp] Failed to create or find contact for ${whatsappNumber}`);
          return;
        }

        let contactStatus = contact.kanbanStatus || "new_contact";
        if (contactStatus === "archived") {
          await db.updateContactKanbanStatus(contact.id, "new_contact");
          contactStatus = "new_contact";
        }
        await db.updateContactMetadata(contact.id, (metadata: any = {}) => ({
          ...metadata,
          unread: true,
        }));
        const isSellerStatus = contactStatus.startsWith("seller_");
        const contactWaiting = contactStatus === "waiting_attendant" || isSellerStatus;

        if (contactWaiting) {
          console.log(`[WhatsApp] Contact ${contact.id} in manual status (${contactStatus}). Bot will stay silent but message will be stored.`);
        }

        // Extrair conteúdo da mensagem
        let messageContent = message.body || "";
        let mediaUrl: string | undefined;
        let mediaType: "image" | "audio" | "video" | "document" | undefined;
        let mediaBase64: string | undefined;
        let mediaMimeType: string | undefined;

        // Verificar se é mídia
        if (message.hasMedia) {
          console.log(`[WhatsApp] Message has media, downloading...`);
          try {
            const media = await message.downloadMedia();
            if (media) {
              mediaBase64 = media.data;
              mediaMimeType = media.mimetype;
              
              // Detectar tipo de mídia
              if (media.mimetype?.startsWith("image/")) {
                mediaType = "image";
                messageContent = message.caption || "[Imagem]";
              } else if (media.mimetype?.startsWith("audio/")) {
                mediaType = "audio";
                messageContent = message.caption || "[Áudio]";
              } else if (media.mimetype?.startsWith("video/")) {
                mediaType = "video";
                messageContent = message.caption || "[Vídeo]";
              } else {
                // Documento (PDF, DOC, etc)
                mediaType = "document";
                // Tentar obter nome do arquivo de diferentes fontes
                const fileName = (message as any).filename || 
                  message.body?.split('/').pop() || 
                  message.caption || 
                  (mediaMimeType?.includes('pdf') ? 'documento.pdf' : 
                   mediaMimeType?.includes('doc') ? 'documento.doc' : 
                   'documento');
                messageContent = message.caption || `[Documento: ${fileName}]`;
              }
              
              console.log(`[WhatsApp] Media downloaded: ${mediaType}, mimeType: ${mediaMimeType}, size: ${mediaBase64.length}`);
              
              // Fazer upload para Supabase Storage
              if (mediaBase64 && dbInstance.workspaceId) {
                // Tentar obter nome do arquivo de diferentes fontes
                const fileName = (message as any).filename || 
                  message.body?.split('/').pop() || 
                  message.caption ||
                  (mediaType === "image" ? `imagem-${Date.now()}.jpg` : 
                   mediaType === "audio" ? `audio-${Date.now()}.ogg` : 
                   mediaType === "video" ? `video-${Date.now()}.mp4` : 
                   mediaType === "document" ? (mediaMimeType?.includes('pdf') ? `documento-${Date.now()}.pdf` : `documento-${Date.now()}`) :
                   `arquivo-${Date.now()}`);
                
                const uploadedUrl = await uploadMediaToSupabase(
                  dbInstance.workspaceId,
                  mediaBase64,
                  mediaMimeType || "application/octet-stream",
                  fileName
                );
                
                if (uploadedUrl) {
                  mediaUrl = uploadedUrl;
                  console.log(`[WhatsApp] Media uploaded to Supabase: ${uploadedUrl}`);
                }
              }
            }
          } catch (mediaError) {
            console.error(`[WhatsApp] Error downloading media:`, mediaError);
          }
        }

        // Nota: Removida transferência automática para imagens
        // Agora imagens são processadas normalmente pela IA (especialmente para NETCAR)

        const normalizedContent = `${message.body || ""} ${message.caption || ""}`.toLowerCase();
        const prescriptionKeywords = ["receita", "prescrição", "prescricao", "receitinha", "receitou"];
        const mentionsPrescription = normalizedContent
          ? prescriptionKeywords.some(keyword => normalizedContent.includes(keyword))
          : false;
        
        if (mentionsPrescription) {
          console.log("[WhatsApp] Prescription detected. Transferring to human attendant.");
          const transferMessage =
            "Recebi sua receita e, por segurança, vou transferir você imediatamente para um atendente humano que pode auxiliar melhor. Aguarde só um instante, por favor. 😊";
          
          try {
            await client.sendMessage(message.from, transferMessage);
          } catch (sendError) {
            console.error("[WhatsApp] Failed to send prescription transfer message:", sendError);
          }
          
          try {
            await db.updateContactKanbanStatus(contact.id, "negotiating");
          } catch (statusError) {
            console.error("[WhatsApp] Failed to update contact status during prescription transfer:", statusError);
          }
          
          // Não processar a receita com a IA
          return;
        }

        console.log(`[WhatsApp] Calling processIncomingMessage with:`, {
          workspaceId: dbInstance.workspaceId,
          contactId: contact.id,
          instanceId: dbInstance.id,
          messageContent: messageContent.substring(0, 50),
          whatsappNumber,
        });

        // Processar mensagem com IA
        await processIncomingMessage(
          dbInstance.workspaceId,
          contact.id,
          dbInstance.id,
          messageContent,
          whatsappNumber,
          mediaUrl,
          mediaType,
          mediaBase64,
          mediaMimeType
        );

        console.log(`[WhatsApp] Message processed successfully for ${whatsappNumber}`);
      } catch (error) {
        console.error(`[WhatsApp] Error processing message:`, error);
        console.error(`[WhatsApp] Error stack:`, (error as Error).stack);
      }
    });

    // Adicionar tratamento de erros do cliente ANTES de inicializar
    client.on("error", (error: Error) => {
      console.error(`[WhatsApp] Client error for ${instanceKey}:`, error);
    });

    // Armazenar cliente ANTES de inicializar para garantir que está disponível
    activeClients.set(instanceKey, client);
    console.log(`[WhatsApp] Client stored in activeClients map for ${instanceKey}`);

    // Inicializar cliente com timeout e tratamento de erros
    try {
      console.log(`[WhatsApp] Initializing client for ${instanceKey}...`);
      
      // Tentar inicializar com retry em caso de erro "Target closed"
      let initError: any = null;
      let attempts = 0;
      const maxAttempts = 2;
      
      while (attempts < maxAttempts) {
        try {
          await Promise.race([
            client.initialize(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Initialization timeout after 60 seconds")), 60000)
            )
          ]);
          console.log(`[WhatsApp] Client initialized successfully for ${instanceKey}`);
          initError = null;
          break;
        } catch (attemptError: any) {
          attempts++;
          initError = attemptError;
          
          // Se for "Target closed" e ainda tiver tentativas, limpar e tentar novamente
          if (attemptError.message?.includes("Target closed") && attempts < maxAttempts) {
            console.warn(`[WhatsApp] Target closed on attempt ${attempts}, retrying...`);
            // Limpar cliente atual
            activeClients.delete(instanceKey);
            try {
              await client.destroy();
            } catch (destroyError) {
              // Ignorar erros ao destruir
            }
            
            // Aguardar um pouco antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Não recriar o cliente aqui - apenas sair do loop e deixar o erro ser lançado
            // A função reconnectInstance já faz a limpeza correta
            break;
          }
        }
      }
      
      if (initError) {
        throw initError;
      }
    } catch (initError: any) {
      console.error(`[WhatsApp] Error initializing client for ${instanceKey}:`, initError);
      // Limpar cliente em caso de erro
      activeClients.delete(instanceKey);
      try {
        await client.destroy();
      } catch (destroyError) {
        console.error(`[WhatsApp] Error destroying client:`, destroyError);
      }
      
      // Mensagem de erro mais específica
      let errorMessage = initError.message || "Unknown error";
      if (errorMessage.includes("Target closed")) {
        errorMessage = "Navegador fechado inesperadamente. A sessão pode estar corrompida. Tente novamente ou remova a instância e crie uma nova.";
      } else if (errorMessage.includes("Protocol error")) {
        errorMessage = "Erro de comunicação com o navegador. Verifique se o Chrome está instalado e tente novamente.";
      }
      
      throw new Error(`Failed to initialize WhatsApp client: ${errorMessage}`);
    }

    // Aguardar um pouco para ver se o QR Code é gerado
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Retornar resposta
    return {
      instance: {
        instanceName: instanceKey,
        status: "connecting",
      },
      qrcode: qrCodeBase64 ? {
        code: "",
        base64: qrCodeBase64,
      } : undefined,
    };
  } catch (error: any) {
    console.error(`[WhatsApp] Error creating instance ${instanceKey}:`, error);
    
    // Limpar cliente se ainda estiver na memória
    if (activeClients.has(instanceKey)) {
      const client = activeClients.get(instanceKey);
      if (client) {
        try {
          await client.destroy();
        } catch (destroyError) {
          console.error(`[WhatsApp] Error destroying client on error:`, destroyError);
        }
      }
      activeClients.delete(instanceKey);
    }
    
    // Mensagem de erro mais amigável
    let errorMessage = error.message || "Unknown error";
    if (errorMessage.includes("ECONNRESET")) {
      errorMessage = "Conexão resetada. Verifique se o Chrome está instalado corretamente e tente novamente.";
    } else if (errorMessage.includes("browser") || errorMessage.includes("Chrome")) {
      errorMessage = "Não foi possível iniciar o navegador. Verifique se o Chrome está instalado.";
    }
    
    throw new Error(`Failed to create WhatsApp instance: ${errorMessage}`);
  }
}

/**
 * Obter QR Code de uma instância
 */
export async function getQRCode(instanceKey: string): Promise<{ base64: string; code: string }> {
  const client = activeClients.get(instanceKey);
  
  if (!client) {
    throw new Error("Instance not found or not initialized");
  }

  const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
  if (dbInstance?.qrCode) {
    return {
      base64: dbInstance.qrCode,
      code: "",
    };
  }

  throw new Error("QR Code not available");
}

/**
 * Obter status de uma instância
 */
export async function getInstanceStatus(instanceKey: string): Promise<InstanceStatus> {
  const client = activeClients.get(instanceKey);
  
  if (!client) {
    // Verificar no banco de dados
    const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
    return {
      instanceName: instanceKey,
      status: dbInstance?.status || "disconnected",
      phoneNumber: dbInstance?.phoneNumber || undefined,
    };
  }

  try {
    const state = await client.getState();
    const info = client.info;
    
    return {
      instanceName: instanceKey,
      status: state === "CONNECTED" ? "connected" : 
              state === "CONNECTING" ? "connecting" : 
              "disconnected",
      phoneNumber: info?.wid?.user || undefined,
    };
  } catch (error) {
    return {
      instanceName: instanceKey,
      status: "disconnected",
    };
  }
}

/**
 * Enviar mensagem de texto
 */
export async function sendTextMessage(instanceKey: string, number: string, text: string): Promise<string | null> {
  let client = activeClients.get(instanceKey);
  
  // Se o cliente não estiver no Map, tentar recriar a partir do banco
  if (!client) {
    console.log(`[WhatsApp] Client not found in memory for ${instanceKey}, checking database...`);
    const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
    
    if (dbInstance && (dbInstance.status === "connected" || dbInstance.status === "connecting")) {
      console.log(`[WhatsApp] Instance found in database with status: ${dbInstance.status}, recreating client...`);
      try {
        // Recriar o cliente (isso vai registrar os event handlers novamente)
        await createWhatsAppInstance(instanceKey);
        client = activeClients.get(instanceKey);
        
        if (!client) {
          throw new Error("Failed to recreate client");
        }
        
        // Aguardar um pouco para o cliente se conectar se necessário
        let attempts = 0;
        while (attempts < 10) {
          const state = await client.getState();
          if (state === "CONNECTED") {
            console.log(`[WhatsApp] Client recreated and connected for ${instanceKey}`);
            break;
          }
          if (state === "UNPAIRED" || state === "LOGOUT") {
            throw new Error(`Client is ${state}, cannot send messages`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      } catch (error: any) {
        console.error(`[WhatsApp] Error recreating client for ${instanceKey}:`, error);
        throw new Error(`Instance not found or not connected: ${error.message}`);
      }
    } else {
      throw new Error(`Instance not found in database or not connected (status: ${dbInstance?.status || "unknown"})`);
    }
  }

  if (!client) {
    throw new Error("Instance not found or not connected");
  }

  try {
    // Verificar estado do cliente
    let state: string | null;
    try {
      state = await client.getState();
    } catch (stateError: any) {
      console.error(`[WhatsApp] Error getting client state for ${instanceKey}:`, stateError);
      state = null;
    }
    
    // Se o estado for null ou não conectado, tentar recriar o cliente
    if (!state || state !== "CONNECTED") {
      console.warn(`[WhatsApp] Client state is ${state || "null"}, attempting to recreate...`);
      const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
      if (dbInstance && (dbInstance.status === "connected" || dbInstance.status === "connecting")) {
        try {
          await createWhatsAppInstance(instanceKey);
          client = activeClients.get(instanceKey);
          if (client) {
            state = await client.getState();
            if (state !== "CONNECTED") {
              throw new Error(`Client recreated but still not connected. State: ${state}`);
            }
          } else {
            throw new Error(`Failed to recreate client`);
          }
        } catch (recreateError: any) {
          throw new Error(`Client is not connected (state: ${state || "null"}) and failed to recreate: ${recreateError.message}`);
        }
      } else {
        throw new Error(`Client is not connected. Current state: ${state || "null"}. Instance status: ${dbInstance?.status || "unknown"}`);
      }
    }

    // Formatar número (remover caracteres especiais, adicionar @s.whatsapp.net se necessário)
    const formattedNumber = number.includes("@") ? number : `${number}@s.whatsapp.net`;
    
    console.log(`[WhatsApp] Sending message from ${instanceKey} to ${formattedNumber}: ${text.substring(0, 50)}...`);
    const sentMessage = await client.sendMessage(formattedNumber, text);
    const whatsappMessageId = (sentMessage as any).id?._serialized || (sentMessage as any).id?.id || null;
    console.log(`[WhatsApp] Message sent successfully from ${instanceKey} to ${formattedNumber}, messageId: ${whatsappMessageId}`);
    return whatsappMessageId;
  } catch (error: any) {
    console.error(`[WhatsApp] Error sending message from ${instanceKey} to ${number}:`, error);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * Enviar mensagem de mídia (imagem, áudio, vídeo, documento)
 */
export async function sendMediaMessage(
  instanceKey: string,
  number: string,
  mediaUrl: string,
  mediaType: "image" | "audio" | "video" | "document",
  caption?: string
): Promise<string | null> {
  let client = activeClients.get(instanceKey);
  
  // Se o cliente não estiver no Map, tentar recriar a partir do banco
  if (!client) {
    console.log(`[WhatsApp] Client not found in memory for ${instanceKey}, checking database...`);
    const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
    
    if (dbInstance && (dbInstance.status === "connected" || dbInstance.status === "connecting")) {
      console.log(`[WhatsApp] Instance found in database with status: ${dbInstance.status}, recreating client...`);
      try {
        await createWhatsAppInstance(instanceKey);
        client = activeClients.get(instanceKey);
        
        if (!client) {
          throw new Error("Failed to recreate client");
        }
        
        // Aguardar um pouco para o cliente se conectar se necessário
        let attempts = 0;
        while (attempts < 10) {
          const state = await client.getState();
          if (state === "CONNECTED") {
            console.log(`[WhatsApp] Client recreated and connected for ${instanceKey}`);
            break;
          }
          if (state === "UNPAIRED" || state === "LOGOUT") {
            throw new Error(`Client is ${state}, cannot send messages`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      } catch (error: any) {
        console.error(`[WhatsApp] Error recreating client for ${instanceKey}:`, error);
        throw new Error(`Instance not found or not connected: ${error.message}`);
      }
    } else {
      throw new Error(`Instance not found in database or not connected (status: ${dbInstance?.status || "unknown"})`);
    }
  }

  if (!client) {
    throw new Error("Instance not found or not connected");
  }

  try {
    // Verificar estado do cliente
    const state = await client.getState();
    if (state !== "CONNECTED") {
      throw new Error(`Client is not connected. Current state: ${state}`);
    }

    // Formatar número
    const formattedNumber = number.includes("@") ? number : `${number}@s.whatsapp.net`;
    
    console.log(`[WhatsApp] Sending media from ${instanceKey} to ${formattedNumber}: ${mediaType} - ${mediaUrl}`);
    
    // Tentar usar MessageMedia.fromUrl se disponível (mais confiável)
    let media: any;
    
    // Detectar se é OGG para garantir MIME type correto
    const isOGG = mediaUrl.toLowerCase().includes('.ogg') || mediaType === 'audio';
    const expectedMimeType = isOGG ? 'audio/ogg; codecs=opus' : undefined;
    
    try {
      // Verificar se MessageMedia.fromUrl existe
      if (typeof (MessageMedia as any).fromUrl === 'function') {
        console.log(`[WhatsApp] Using MessageMedia.fromUrl for better compatibility`);
        media = await (MessageMedia as any).fromUrl(mediaUrl);
        console.log(`[WhatsApp] MessageMedia created from URL successfully`);
        
        // Se for OGG, garantir que o MIME type está correto
        if (isOGG && media && (!media.mimetype || !media.mimetype.includes('ogg'))) {
          console.log(`[WhatsApp] Forcing correct MIME type for OGG: audio/ogg; codecs=opus`);
          media.mimetype = 'audio/ogg; codecs=opus';
        }
        
        // Log do MIME type final
        console.log(`[WhatsApp] Final MIME type: ${media?.mimetype || 'unknown'}`);
      } else {
        throw new Error("MessageMedia.fromUrl not available");
      }
    } catch (fromUrlError: any) {
      console.log(`[WhatsApp] MessageMedia.fromUrl not available or failed, using manual download:`, fromUrlError.message);
      
      // Fallback: baixar manualmente
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to download media from URL: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Verificar tamanho do arquivo (WhatsApp tem limite de ~16MB)
      const fileSizeMB = buffer.length / (1024 * 1024);
      if (fileSizeMB > 16) {
        throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB. Maximum size is 16MB.`);
      }
      
      // Se for documento, forçar MIME type como application/octet-stream
      let finalMimeType: string;
      let fileName: string;
      
      if (mediaType === 'document') {
        // Para documentos, usar application/octet-stream para garantir que seja enviado como documento
        finalMimeType = 'application/octet-stream';
        
        // Extrair nome do arquivo da URL (sem query params)
        try {
          const urlPath = new URL(mediaUrl).pathname;
          fileName = urlPath.split('/').pop() || `document.${mediaUrl.split('.').pop() || 'bin'}`;
        } catch {
          fileName = mediaUrl.split('/').pop() || `document.${mediaUrl.split('.').pop() || 'bin'}`;
        }
        
        console.log(`[WhatsApp] Sending as DOCUMENT: ${fileName} (${finalMimeType})`);
      } else {
        // Para outros tipos de mídia, usar o MIME type detectado
        let mimeType = response.headers.get("content-type") || getMimeTypeFromUrl(mediaUrl, mediaType);
        
        // Extrair nome do arquivo da URL (sem query params)
        try {
          const urlPath = new URL(mediaUrl).pathname;
          fileName = urlPath.split('/').pop() || `file.${mediaType}`;
        } catch {
          fileName = mediaUrl.split('/').pop() || `file.${mediaType}`;
        }
        
        // Se for OGG, garantir MIME type correto
        if (fileName.endsWith('.ogg') && mediaType === 'audio') {
          console.log(`[WhatsApp] Detected OGG audio, ensuring correct MIME type`);
          mimeType = 'audio/ogg; codecs=opus';
        }
        
        // Se for webm de áudio, avisar sobre possível problema de compatibilidade
        if (fileName.endsWith('.webm') && mediaType === 'audio') {
          console.warn(`[WhatsApp] WARNING: Audio is in WebM format. WhatsApp Web does not support WebM audio.`);
          console.warn(`[WhatsApp] Consider sending as document instead.`);
          mimeType = 'audio/webm';
        }
        
        finalMimeType = mimeType;
      }
      
      // Limpar nome do arquivo (remover caracteres especiais)
      fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      
      // Converter buffer para base64
      const base64Data = buffer.toString("base64");
      
      console.log(`[WhatsApp] Creating MessageMedia manually: type=${finalMimeType}, size=${fileSizeMB.toFixed(2)}MB, filename=${fileName}`);
      
      // Criar MessageMedia manualmente
      try {
        media = new MessageMedia(finalMimeType, base64Data, fileName);
        console.log(`[WhatsApp] MessageMedia created successfully`);
      } catch (createError: any) {
        console.error(`[WhatsApp] Error creating MessageMedia:`, createError);
        // Tentar criar objeto manualmente
        media = {
          mimetype: finalMimeType,
          data: base64Data,
          filename: fileName,
        };
        console.log(`[WhatsApp] Using manual MessageMedia object`);
      }
    }
    
    // Enviar mídia com opções
    const sendOptions: any = {};
    if (caption && caption.trim()) {
      sendOptions.caption = caption.trim();
    }
    
    // Log detalhado antes de enviar
    console.log(`[WhatsApp] Preparing to send media:`, {
      mediaType,
      mimeType: media?.mimetype || 'unknown',
      hasData: !!media?.data,
      dataLength: media?.data?.length || 0,
      filename: media?.filename || 'unknown',
      hasCaption: !!sendOptions.caption
    });
    
    let sentMessage: any = null;
    try {
      sentMessage = await client.sendMessage(formattedNumber, media, sendOptions);
      const whatsappMessageId = (sentMessage as any)?.id?._serialized || (sentMessage as any)?.id?.id || null;
      console.log(`[WhatsApp] Media sent successfully from ${instanceKey} to ${formattedNumber}, messageId: ${whatsappMessageId}`);
      return whatsappMessageId;
    } catch (sendError: any) {
      // Se falhar, tentar sem opções
      if (sendOptions.caption) {
        console.warn(`[WhatsApp] Failed to send with caption, trying without caption:`, sendError.message);
        try {
          sentMessage = await client.sendMessage(formattedNumber, media);
          const whatsappMessageId = (sentMessage as any)?.id?._serialized || (sentMessage as any)?.id?.id || null;
          console.log(`[WhatsApp] Media sent successfully (without caption) from ${instanceKey} to ${formattedNumber}, messageId: ${whatsappMessageId}`);
          return whatsappMessageId;
        } catch (retryError: any) {
          // Se ainda falhar, tentar sem filename
          console.warn(`[WhatsApp] Failed without caption, trying without filename:`, retryError.message);
          try {
            const mediaWithoutFilename = {
              mimetype: media.mimetype,
              data: media.data,
            };
            sentMessage = await client.sendMessage(formattedNumber, mediaWithoutFilename);
            const whatsappMessageId = (sentMessage as any)?.id?._serialized || (sentMessage as any)?.id?.id || null;
            console.log(`[WhatsApp] Media sent successfully (without filename) from ${instanceKey} to ${formattedNumber}, messageId: ${whatsappMessageId}`);
            return whatsappMessageId;
          } catch (finalError: any) {
            // Log detalhado do erro para debug
            console.error(`[WhatsApp] Final error details:`, {
              error: finalError.message,
              stack: finalError.stack,
              mediaType: mediaType,
              mimeType: media.mimetype,
              hasData: !!media.data,
              dataLength: media.data?.length,
              filename: media.filename,
            });
            
            // Mensagem de erro mais específica
            let errorMessage: string;
            if (mediaType === 'audio' && media.mimetype?.includes('webm')) {
              errorMessage = `Failed to send audio: WhatsApp Web does not support WebM audio format. Please try recording in MP3 or OGG format, or send an image/video instead. Original error: ${finalError.message}`;
            } else if (mediaType === 'audio' && media.mimetype?.includes('ogg')) {
              errorMessage = `Failed to send OGG audio: ${finalError.message}. The OGG format may not be fully supported by WhatsApp Web. Consider sending as a document instead.`;
            } else {
              errorMessage = `Failed to send media after all retries. The media format may not be supported by WhatsApp. Error: ${finalError.message}`;
            }
            throw new Error(errorMessage);
          }
        }
      } else {
        throw sendError;
      }
    }
  } catch (error: any) {
    console.error(`[WhatsApp] Error sending media from ${instanceKey} to ${number}:`, error);
    throw new Error(`Failed to send media: ${error.message}`);
  }
}

/**
 * Obter MIME type a partir da URL e tipo de mídia
 */
function getMimeTypeFromUrl(url: string, mediaType: "image" | "audio" | "video" | "document"): string {
  const extension = url.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    // Audio - WhatsApp suporta melhor mp3, ogg, m4a
    'mp3': 'audio/mpeg',
    'ogg': 'audio/ogg; codecs=opus',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'opus': 'audio/ogg; codecs=opus',
    'webm': 'audio/ogg; codecs=opus', // Converter webm para ogg para compatibilidade
    // Video
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
  };
  
  if (extension && mimeTypes[extension]) {
    return mimeTypes[extension];
  }
  
  // Fallback baseado no tipo
  const fallbacks: Record<"image" | "audio" | "video" | "document", string> = {
    image: 'image/jpeg',
    audio: 'audio/ogg; codecs=opus', // Usar ogg como padrão para melhor compatibilidade
    video: 'video/mp4',
    document: 'application/octet-stream',
  };
  
  return fallbacks[mediaType];
}

/**
 * Desconectar e remover instância
 */
export async function disconnectInstance(instanceKey: string): Promise<void> {
  const client = activeClients.get(instanceKey);
  
  if (client) {
    try {
      await client.logout();
      await client.destroy();
    } catch (error) {
      console.error(`[WhatsApp] Error disconnecting ${instanceKey}:`, error);
    }
    
    activeClients.delete(instanceKey);
  }

  // Atualizar status no banco
  const dbInstance = await db.getWhatsappInstanceByKey(instanceKey);
  if (dbInstance) {
    await db.updateWhatsappInstanceStatus(dbInstance.id, "disconnected");
  }
}

/**
 * Reconectar instância
 */
export async function reconnectInstance(instanceKey: string): Promise<{ qrCode: string | null }> {
  // Desconectar primeiro
  await disconnectInstance(instanceKey);
  
  // Limpar sessão corrompida se necessário
  const sessionPath = path.join(BASE_SESSIONS_DIR, instanceKey);
  
  if (fs.existsSync(sessionPath)) {
    try {
      console.log(`[WhatsApp] Cleaning up session directory for ${instanceKey}...`);
      // Remover apenas o diretório de cache/sessão, não toda a pasta
      const sessionFiles = fs.readdirSync(sessionPath);
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(sessionPath, file);
          if (fs.statSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.warn(`[WhatsApp] Error cleaning up ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[WhatsApp] Error cleaning session directory:`, error);
      // Se não conseguir limpar, tenta remover tudo
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (rmError) {
        console.warn(`[WhatsApp] Could not remove session directory:`, rmError);
      }
    }
  }
  
  // Aguardar um pouco antes de recriar para garantir que tudo foi limpo
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Criar novamente
  const result = await createWhatsAppInstance(instanceKey);
  
  return {
    qrCode: result.qrcode?.base64 || null,
  };
}

/**
 * Inicializar instâncias existentes ao iniciar o servidor
 */
/**
 * Enviar documento PDF via WhatsApp (boleto, etc)
 */
export async function sendPDFDocument(
  instanceKey: string,
  number: string,
  pdfBase64: string,
  filename: string,
  caption?: string
): Promise<void> {
  let client = activeClients.get(instanceKey);
  
  if (!client) {
    throw new Error("Instance not found or not connected");
  }

  try {
    const state = await client.getState();
    if (state !== "CONNECTED") {
      throw new Error(`Client is not connected. Current state: ${state}`);
    }

    const formattedNumber = number.includes("@") ? number : `${number}@s.whatsapp.net`;
    
    console.log(`[WhatsApp] Enviando PDF de ${instanceKey} para ${formattedNumber}: ${filename}`);
    
    // Criar MessageMedia diretamente do Base64
    const media = new MessageMedia('application/pdf', pdfBase64, filename);
    
    console.log(`[WhatsApp] MessageMedia criado:`, {
      mimetype: media.mimetype,
      filename: media.filename,
      dataLength: pdfBase64.length
    });
    
    await client.sendMessage(formattedNumber, media, { caption });
    console.log(`[WhatsApp] PDF enviado com sucesso para ${formattedNumber}`);
  } catch (error: any) {
    console.error(`[WhatsApp] Erro ao enviar PDF:`, error);
    throw new Error(`Failed to send PDF: ${error.message}`);
  }
}

export async function initializeExistingInstances(): Promise<void> {
  try {
    console.log("[WhatsApp] Initializing existing instances...");
    
    // Buscar todas as instâncias conectadas ou conectando
    const instances = await db.getAllConnectedWhatsappInstances();
    console.log(`[WhatsApp] Found ${instances.length} instances to initialize`);
    
    // PRIMEIRO: Limpar todos os locks de todas as instâncias
    console.log("[WhatsApp] Cleaning up Chromium locks for all instances...");
    for (const instance of instances) {
      if (instance.instanceKey) {
        try {
          cleanupChromiumLocks(instance.instanceKey);
        } catch (error) {
          console.warn(`[WhatsApp] Error cleaning locks for ${instance.instanceKey}:`, error);
        }
      }
    }
    
    // Aguardar um pouco para garantir que os locks foram liberados
    console.log("[WhatsApp] Waiting 3 seconds for locks to be released...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Inicializar cada instância sequencialmente para evitar conflitos
    for (const instance of instances.slice(0, 5)) {
      if (!instance.instanceKey) continue;
      
      try {
        console.log(`[WhatsApp] Initializing instance ${instance.instanceKey}...`);
        // Limpar locks novamente antes de cada inicialização
        cleanupChromiumLocks(instance.instanceKey);
        await createWhatsAppInstance(instance.instanceKey);
        console.log(`[WhatsApp] Instance ${instance.instanceKey} initialized`);
        // Pequeno delay entre inicializações
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`[WhatsApp] Error initializing instance ${instance.instanceKey}:`, error?.message || error);
        // Continuar com próxima instância mesmo se esta falhar
      }
    }
    
    console.log("[WhatsApp] Finished initializing existing instances");
  } catch (error) {
    console.error("[WhatsApp] Error initializing existing instances:", error);
  }
}

