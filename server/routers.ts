import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { processIncomingMessage } from "./aiService";
import { getEvolutionService } from "./evolutionService";
import { TRPCError } from "@trpc/server";
import { parse } from "csv-parse/sync";
import type { InsertProduct } from "../drizzle/schema";

const MAX_UPLOAD_ERRORS = 10;

function normalizeCsvRecord(record: Record<string, unknown>) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!key) continue;
    const trimmedKey = key.trim().toLowerCase();
    const stringValue = typeof value === "string" ? value.trim() : value ?? "";
    normalized[trimmedKey] = String(stringValue).trim();
  }
  return normalized;
}

function parsePriceToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    return Math.round(value * 100);
  }

  let normalized = String(value).trim();
  if (!normalized) return null;

  normalized = normalized.replace(/R\$/gi, "").replace(/\s+/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const numeric = Number(normalized);
  if (Number.isNaN(numeric)) return null;

  return Math.round(numeric * 100);
}

function parseQuantity(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  if (!cleaned) return 0;
  const quantity = Number.parseInt(cleaned, 10);
  if (Number.isNaN(quantity)) return 0;
  return Math.max(quantity, 0);
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  workspaces: router({
    // Obter workspace atual
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }
      const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
      if (!workspace) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
      }
      return workspace;
    }),
    
    // Atualizar workspace
    update: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        metadata: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        await db.updateWorkspace(ctx.user.workspaceId, input);
        return { success: true };
      }),
    // Criar workspace
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const workspaceId = await db.createWorkspace({
          name: input.name,
          ownerId: ctx.user.id,
        });

        // Atualizar usuário com o workspace
        await db.upsertUser({
          openId: ctx.user.openId,
          workspaceId: workspaceId as number,
          workspaceRole: "owner",
        });

        // Criar configuração padrão do bot
        await db.upsertBotConfig({
          workspaceId: workspaceId as number,
          masterPrompt: "Você é um assistente de atendimento profissional e prestativo.",
          transferRules: [],
          isActive: true,
        });

        return { workspaceId };
      }),

    // Listar workspaces do usuário
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        return [];
      }
      return db.getWorkspacesByOwnerId(ctx.user.id);
    }),

    // Obter workspace atual
    current: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        return null;
      }
      return db.getWorkspaceById(ctx.user.workspaceId);
    }),
  }),

  contacts: router({
    // Listar contatos
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }
      return db.getContactsByWorkspace(ctx.user.workspaceId);
    }),

    // Atualizar status do Kanban
    updateKanbanStatus: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        status: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await db.updateContactKanbanStatus(input.contactId, input.status);
        return { success: true };
      }),
  }),

  conversations: router({
    // Listar conversas
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        return db.getConversationsByWorkspace(ctx.user.workspaceId, input?.status);
      }),

    // Assumir conversa
    assign: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await db.updateConversationStatus(
          input.conversationId,
          "in_progress",
          ctx.user.id
        );
        return { success: true };
      }),

    // Fechar conversa
    close: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateConversationStatus(input.conversationId, "closed");
        return { success: true };
      }),
  }),

  messages: router({
    // Listar mensagens de uma conversa
    list: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
      }))
      .query(async ({ input }) => {
        return db.getMessagesByConversation(input.conversationId);
      }),

    // Enviar mensagem
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
        messageType: z.string().default("text"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Salvar mensagem no banco
        const messageId = await db.createMessage({
          conversationId: input.conversationId,
          senderType: "agent",
          senderId: ctx.user.id,
          content: input.content,
          messageType: input.messageType,
        });

        // Buscar conversa para pegar o contato
        const conversations = await db.getConversationsByWorkspace(ctx.user.workspaceId!);
        const conversation = conversations.find(c => c.id === input.conversationId);
        
        if (conversation) {
          // Buscar contato
          const contacts = await db.getContactsByWorkspace(ctx.user.workspaceId!);
          const contact = contacts.find(c => c.id === conversation.contactId);
          
          if (contact) {
            // Buscar instância WhatsApp
            const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId!);
            const instance = instances.find(i => i.id === conversation.instanceId);
            
            if (instance && instance.instanceKey) {
              // Buscar configurações Evolution API
              const workspace = await db.getWorkspaceById(ctx.user.workspaceId!);
              const metadata = workspace?.metadata as any;
              
              if (metadata?.evolutionApiUrl && metadata?.evolutionApiKey) {
                try {
                  const { getEvolutionService } = await import("./evolutionService");
                  const evolution = getEvolutionService({
                    apiUrl: metadata.evolutionApiUrl,
                    apiKey: metadata.evolutionApiKey,
                  });
                  
                  // Enviar mensagem via WhatsApp
                  await evolution.sendTextMessage(
                    instance.instanceKey,
                    contact.whatsappNumber,
                    input.content
                  );
                  
                  console.log(`[Messages] Mensagem do atendente enviada para ${contact.whatsappNumber}`);
                } catch (error) {
                  console.error(`[Messages] Erro ao enviar mensagem via WhatsApp:`, error);
                  // Não lança erro para não bloquear o salvamento
                }
              }
            }
          }
        }

        return { messageId };
      }),
  }),

  products: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }

      return db.getProductsByWorkspace(ctx.user.workspaceId, 10000);
    }),

    search: protectedProcedure
      .input(z.object({
        query: z.string().min(1),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        return db.searchProducts(ctx.user.workspaceId, input.query, 50);
      }),

    getUploads: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }

      return db.getProductUploadsByWorkspace(ctx.user.workspaceId);
    }),

    uploadCsv: protectedProcedure
      .input(z.object({
        fileContent: z.string().min(1),
        fileName: z.string().min(1),
        fileSize: z.number().nonnegative(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const uploadId = await db.createProductUpload({
          workspaceId: ctx.user.workspaceId,
          fileName: input.fileName,
          status: "processing",
          rowCount: 0,
        });

        try {
          const parsedRows = parse(input.fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }) as Record<string, unknown>[];

          if (!parsedRows || parsedRows.length === 0) {
            await db.updateProductUpload(uploadId, {
              status: "failed",
              errorMessage: "CSV vazio ou sem cabeçalho.",
            });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "CSV vazio ou sem cabeçalho.",
            });
          }

          const items: InsertProduct[] = [];
          const errors: string[] = [];

          parsedRows.forEach((rawRow, index) => {
            const lineNumber = index + 2;
            const row = normalizeCsvRecord(rawRow);

            const sku = row["sku"];
            const name = row["name"];
            const priceCents = parsePriceToCents(row["price"]);
            const quantity = parseQuantity(row["quantity"]);
            const description = row["description"] ?? "";

            if (!sku) {
              if (errors.length < MAX_UPLOAD_ERRORS) {
                errors.push(`Linha ${lineNumber}: SKU obrigatório.`);
              }
              return;
            }

            if (!name) {
              if (errors.length < MAX_UPLOAD_ERRORS) {
                errors.push(`Linha ${lineNumber}: Nome obrigatório.`);
              }
              return;
            }

            if (priceCents === null) {
              if (errors.length < MAX_UPLOAD_ERRORS) {
                errors.push(`Linha ${lineNumber}: Preço inválido.`);
              }
              return;
            }

            items.push({
              workspaceId: ctx.user.workspaceId!,
              uploadId,
              sku,
              name,
              price: priceCents,
              quantity,
              description: description || null,
            });
          });

          if (items.length === 0) {
            const message =
              errors.length > 0
                ? errors.join(" | ")
                : "Nenhuma linha válida encontrada no CSV.";
            await db.updateProductUpload(uploadId, {
              status: "failed",
              errorMessage: message.slice(0, 1000),
            });
            throw new TRPCError({ code: "BAD_REQUEST", message });
          }

          await db.bulkUpsertProducts(items);

          await db.updateProductUpload(uploadId, {
            status: "completed",
            rowCount: items.length,
            errorMessage: errors.length
              ? errors.join(" | ").slice(0, 1000)
              : null,
          });

          return {
            uploadId,
            processed: items.length,
            warnings: errors,
          } as const;
        } catch (error) {
          const message =
            error instanceof TRPCError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Erro desconhecido ao processar CSV";

          await db.updateProductUpload(uploadId, {
            status: "failed",
            errorMessage: message.slice(0, 1000),
          });

          if (error instanceof TRPCError) {
            throw error;
          }

          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    deleteUpload: protectedProcedure
      .input(z.object({
        uploadId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const upload = await db.getProductUploadById(input.uploadId);
        if (!upload || upload.workspaceId !== ctx.user.workspaceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Upload não encontrado" });
        }

        await db.deleteProductUpload(input.uploadId);
        return { success: true };
      }),
  }),

  bot: router({
    // Testar resposta do bot
    testResponse: protectedProcedure
      .input(z.object({
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        // Criar conversa de teste temporária
        const testContactId = await db.createContact({
          workspaceId: ctx.user.workspaceId,
          whatsappNumber: "test-bot-" + Date.now(),
          name: "Teste Bot",
        });
        
        const testConvId = await db.createConversation({
          workspaceId: ctx.user.workspaceId,
          contactId: testContactId as number,
          instanceId: 1,
          status: "bot_handling",
        });
        
        // Gerar resposta da IA SEM enviar para WhatsApp
        const { generateBotResponse } = await import("./aiService");
        const botResponse = await generateBotResponse(
          ctx.user.workspaceId,
          testConvId as number,
          input.message
        );
        
        return { response: botResponse };
      }),

    // Obter configuração do bot
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }
      return db.getBotConfigByWorkspace(ctx.user.workspaceId);
    }),

    // Atualizar configuração do bot
    updateConfig: protectedProcedure
      .input(z.object({
        masterPrompt: z.string(),
        transferRules: z.array(z.object({
          type: z.string(),
          value: z.string(),
          action: z.string(),
        })).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await db.upsertBotConfig({
          workspaceId: ctx.user.workspaceId,
          ...input,
        });
        return { success: true };
      }),
  }),

  whatsapp: router({
    // Criar e conectar instância
    createInstance: protectedProcedure
      .input(z.object({
        name: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        try {
          // Pegar configurações do workspace
          const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
          if (!workspace) {
            throw new Error("Workspace not found");
          }
          
          const metadata = workspace.metadata as any;
          if (!metadata?.evolutionApiUrl || !metadata?.evolutionApiKey) {
            throw new Error("Evolution API não configurada. Configure em Settings > Evolution API");
          }
          
          const evolution = getEvolutionService({
            apiUrl: metadata.evolutionApiUrl,
            apiKey: metadata.evolutionApiKey,
          });
          
          const instanceKey = `ws${ctx.user.workspaceId}_${Date.now()}`;
          
          // Montar URL do webhook
          const webhookUrl = metadata.webhookUrl || `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/webhook/evolution`;
          
          // Criar instância na Evolution API com webhook configurado
          const result = await evolution.createInstance(instanceKey, webhookUrl);
          
          // Configurar webhook (garantir que está configurado)
          try {
            await evolution.setWebhook(instanceKey, webhookUrl);
            console.log(`[WhatsApp] Webhook configured for ${instanceKey}: ${webhookUrl}`);
          } catch (error) {
            console.error(`[WhatsApp] Failed to set webhook for ${instanceKey}:`, error);
          }
          
          // Salvar no banco
          const instanceId = await db.createWhatsappInstance({
            workspaceId: ctx.user.workspaceId,
            name: input.name,
            instanceKey,
            status: "connecting",
            qrCode: result.qrcode?.base64,
          });
          
          return {
            instanceId,
            qrCode: result.qrcode?.base64,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }),
    
    // Obter QR Code
    getQRCode: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        try {
          const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
          const instance = instances.find(i => i.id === input.instanceId);
          
          if (!instance || !instance.instanceKey) {
            throw new Error("Instance not found");
          }
          
          const evolution = getEvolutionService();
          const qrData = await evolution.getQRCode(instance.instanceKey);
          
          // Atualizar QR no banco
          await db.updateWhatsappInstanceStatus(instance.id, "connecting", undefined, qrData.base64);
          
          return { qrCode: qrData.base64 };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }),
    
    // Verificar status
    checkStatus: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        try {
          const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
          const instance = instances.find(i => i.id === input.instanceId);
          
          if (!instance || !instance.instanceKey) {
            throw new Error("Instance not found");
          }
          
          // Pegar configurações do workspace
          const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
          if (!workspace) {
            throw new Error("Workspace not found");
          }
          
          const metadata = workspace.metadata as any;
          if (!metadata?.evolutionApiUrl || !metadata?.evolutionApiKey) {
            throw new Error("Evolution API não configurada");
          }
          
          const evolution = getEvolutionService({
            apiUrl: metadata.evolutionApiUrl,
            apiKey: metadata.evolutionApiKey,
          });
          const status = await evolution.getInstanceStatus(instance.instanceKey);
          
          // Atualizar status no banco
          const statusMap: Record<string, string> = {
            open: "connected",
            close: "disconnected",
            connecting: "connecting",
          };
          
          const dbStatus = statusMap[status.status] || "disconnected";
          await db.updateWhatsappInstanceStatus(instance.id, dbStatus);
          
          return {
            status: dbStatus,
            phoneNumber: status.phoneNumber,
          };
        } catch (error: any) {
          return {
            status: "disconnected",
            phoneNumber: null,
          };
        }
      }),
    
    // Desconectar instância
    disconnect: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        try {
          const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
          const instance = instances.find(i => i.id === input.instanceId);
          
          if (!instance || !instance.instanceKey) {
            throw new Error("Instance not found");
          }
          
          const evolution = getEvolutionService();
          await evolution.logoutInstance(instance.instanceKey);
          await db.updateWhatsappInstanceStatus(instance.id, "disconnected");
          
          return { success: true };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }),

    // Reconectar instância
    reconnect: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        try {
          const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
          const instance = instances.find(i => i.id === input.instanceId);
          
          if (!instance || !instance.instanceKey) {
            throw new Error("Instance not found");
          }
          
          // Pegar configurações do workspace
          const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
          if (!workspace) {
            throw new Error("Workspace not found");
          }
          
          const metadata = workspace.metadata as any;
          if (!metadata?.evolutionApiUrl || !metadata?.evolutionApiKey) {
            throw new Error("Evolution API não configurada. Configure em Settings > Evolution API");
          }
          
          const evolution = getEvolutionService({
            apiUrl: metadata.evolutionApiUrl,
            apiKey: metadata.evolutionApiKey,
          });
          
          // Primeiro desconectar se estiver conectado
          try {
            await evolution.logoutInstance(instance.instanceKey);
          } catch (error) {
            // Ignorar erro se já estiver desconectado
          }
          
          // Pegar novo QR Code
          const qrData = await evolution.getQRCode(instance.instanceKey);
          
          // Configurar webhook novamente (pode ter sido perdido após desconexão)
          const webhookUrl = metadata.webhookUrl || `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/webhook/evolution`;
          try {
            await evolution.setWebhook(instance.instanceKey, webhookUrl);
            console.log(`[WhatsApp] Webhook reconfigured for ${instance.instanceKey}: ${webhookUrl}`);
          } catch (error) {
            console.error(`[WhatsApp] Failed to reconfigure webhook for ${instance.instanceKey}:`, error);
          }
          
          // Atualizar status no banco
          await db.updateWhatsappInstanceStatus(
            instance.id,
            "connecting",
            undefined, // phoneNumber
            qrData.base64 // qrCode
          );
          
          return {
            qrCode: qrData.base64,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }),

    // Listar instâncias
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }
      
      const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
      
      // Tentar atualizar status de cada instância
      const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
      if (workspace?.metadata) {
        const metadata = workspace.metadata as any;
        if (metadata?.evolutionApiUrl && metadata?.evolutionApiKey) {
          const evolution = getEvolutionService({
            apiUrl: metadata.evolutionApiUrl,
            apiKey: metadata.evolutionApiKey,
          });
          
          // Atualizar status de cada instância
          for (const instance of instances) {
            if (!instance.instanceKey) continue;
            try {
              const status = await evolution.getInstanceStatus(instance.instanceKey);
              const normalizedStatus = status.status === 'open' ? 'connected' : 
                                      status.status === 'close' ? 'disconnected' : 
                                      status.status as any;
              if (normalizedStatus !== instance.status) {
                await db.updateWhatsappInstanceStatus(instance.id, normalizedStatus, status.phoneNumber || undefined);
                instance.status = normalizedStatus;
                instance.phoneNumber = status.phoneNumber || null;
              }
            } catch (error) {
              // Ignorar erros de status
            }
          }
        }
      }
      
      return instances;
    }),

    // Deletar instância
    deleteInstance: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        
        try {
          const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
          const instance = instances.find(i => i.id === input.instanceId);
          
          if (!instance) {
            throw new Error("Instance not found");
          }
          
          // Tentar desconectar da Evolution API antes de deletar
          if (instance.instanceKey) {
            try {
              const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
              if (workspace?.metadata) {
                const metadata = workspace.metadata as any;
                if (metadata?.evolutionApiUrl && metadata?.evolutionApiKey) {
                  const evolution = getEvolutionService({
                    apiUrl: metadata.evolutionApiUrl,
                    apiKey: metadata.evolutionApiKey,
                  });
                  await evolution.deleteInstance(instance.instanceKey);
                }
              }
            } catch (error) {
              // Ignorar erro se não conseguir deletar da Evolution API
              console.error("[WhatsApp] Error deleting from Evolution API:", error);
            }
          }
          
          // Deletar do banco de dados
          await db.deleteWhatsappInstance(input.instanceId);
          
          return { success: true };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }),

  }),

  flows: router({
    // Listar fluxos
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }
      return db.getFlowsByWorkspace(ctx.user.workspaceId);
    }),
  }),

  campaigns: router({
    // Listar campanhas
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }
      return db.getCampaignsByWorkspace(ctx.user.workspaceId);
    }),
  }),

  admin: router({
    // Listar todos os usuários (apenas owner)
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.workspaceRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o proprietário pode gerenciar usuários" });
      }
      return db.getUsersByWorkspace(ctx.user.workspaceId!);
    }),

    // Aprovar usuário
    approveUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.workspaceRole !== "owner") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o proprietário pode aprovar usuários" });
        }
        await db.updateUserStatus(input.userId, "approved");
        return { success: true };
      }),

    // Bloquear usuário
    blockUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.workspaceRole !== "owner") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o proprietário pode bloquear usuários" });
        }
        await db.updateUserStatus(input.userId, "blocked");
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

