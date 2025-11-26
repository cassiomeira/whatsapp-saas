import { createRequire } from "module";
import * as db from "./db";
import { processIncomingMessage } from "./aiService";
import path from "path";
import fs from "fs";
import type { Client as WhatsAppClient, Message as WhatsAppMessage } from "whatsapp-web.js";

const require = createRequire(import.meta.url);
const wweb = require("whatsapp-web.js");
const Client = wweb.Client as typeof WhatsAppClient;
const Message = wweb.Message as typeof WhatsAppMessage;
const LocalAuth = wweb.LocalAuth;

const BASE_SESSIONS_DIR = process.env.WHATSAPP_SESSIONS_DIR
  ? path.resolve(process.env.WHATSAPP_SESSIONS_DIR)
  : path.resolve(process.cwd(), "data", "whatsapp-sessions");

if (!fs.existsSync(BASE_SESSIONS_DIR)) {
  fs.mkdirSync(BASE_SESSIONS_DIR, { recursive: true });
}

const LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonStartupLock"];

function cleanupChromiumLocks(instanceKey: string) {
  const profileDir = path.join(BASE_SESSIONS_DIR, instanceKey, "Default");
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
}

// Armazenar clientes ativos
const activeClients = new Map<string, WhatsAppClient>();

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
        let mediaType: "image" | "audio" | "video" | undefined;
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
              
              if (media.mimetype?.startsWith("image/")) {
                mediaType = "image";
                messageContent = message.caption || "[Imagem]";
              } else if (media.mimetype?.startsWith("audio/")) {
                mediaType = "audio";
                messageContent = message.caption || "[Áudio]";
              } else if (media.mimetype?.startsWith("video/")) {
                mediaType = "video";
                messageContent = message.caption || "[Vídeo]";
              }
              console.log(`[WhatsApp] Media downloaded: ${mediaType}, size: ${mediaBase64.length}`);
            }
          } catch (mediaError) {
            console.error(`[WhatsApp] Error downloading media:`, mediaError);
          }
        }

        // Se for imagem, transferir automaticamente para atendente (exceto se já estiver em status manual)
        if (mediaType === "image" && !contactWaiting) {
          console.log("[WhatsApp] Image detected. Transferring to human attendant.");
          const transferMessage =
            "Vou transferir você para um atendente para continuar o atendimento. Aguarde só um instante, por favor.";
          
          try {
            await client.sendMessage(message.from, transferMessage);
          } catch (sendError) {
            console.error("[WhatsApp] Failed to send image transfer message:", sendError);
          }
          
          try {
            await db.updateContactKanbanStatus(contact.id, "negotiating");
          } catch (statusError) {
            console.error("[WhatsApp] Failed to update contact status during image transfer:", statusError);
          }
          
          // Salvar a mensagem no banco antes de retornar
          try {
            await db.createMessage({
              workspaceId: dbInstance.workspaceId,
              contactId: contact.id,
              instanceId: dbInstance.id,
              content: messageContent,
              direction: "incoming",
              mediaUrl,
              mediaType,
              mediaBase64,
              mediaMimeType,
            });
          } catch (msgError) {
            console.error("[WhatsApp] Failed to save image message:", msgError);
          }
          
          // Não processar a imagem com a IA
          return;
        }

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
export async function sendTextMessage(instanceKey: string, number: string, text: string): Promise<void> {
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
    const state = await client.getState();
    if (state !== "CONNECTED") {
      throw new Error(`Client is not connected. Current state: ${state}`);
    }

    // Formatar número (remover caracteres especiais, adicionar @s.whatsapp.net se necessário)
    const formattedNumber = number.includes("@") ? number : `${number}@s.whatsapp.net`;
    
    console.log(`[WhatsApp] Sending message from ${instanceKey} to ${formattedNumber}: ${text.substring(0, 50)}...`);
    await client.sendMessage(formattedNumber, text);
    console.log(`[WhatsApp] Message sent successfully from ${instanceKey} to ${formattedNumber}`);
  } catch (error: any) {
    console.error(`[WhatsApp] Error sending message from ${instanceKey} to ${number}:`, error);
    throw new Error(`Failed to send message: ${error.message}`);
  }
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
export async function initializeExistingInstances(): Promise<void> {
  try {
    console.log("[WhatsApp] Initializing existing instances...");
    
    // Buscar todas as instâncias conectadas ou conectando
    const instances = await db.getAllConnectedWhatsappInstances();
    console.log(`[WhatsApp] Found ${instances.length} instances to initialize`);
    
    // Inicializar cada instância em paralelo (mas com limite para não sobrecarregar)
    const initPromises = instances.slice(0, 5).map(async (instance) => {
      if (!instance.instanceKey) return;
      
      try {
        console.log(`[WhatsApp] Initializing instance ${instance.instanceKey}...`);
        await createWhatsAppInstance(instance.instanceKey);
        console.log(`[WhatsApp] Instance ${instance.instanceKey} initialized`);
      } catch (error) {
        console.error(`[WhatsApp] Error initializing instance ${instance.instanceKey}:`, error);
      }
    });
    
    await Promise.all(initPromises);
    console.log("[WhatsApp] Finished initializing existing instances");
  } catch (error) {
    console.error("[WhatsApp] Error initializing existing instances:", error);
  }
}

