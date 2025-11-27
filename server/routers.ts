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
import type { InsertProduct, Contact } from "../drizzle/schema";

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

function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  const trimmed = digits.replace(/^0+/, "");
  if (trimmed.length < 8) return null;
  return trimmed;
}

function extractUniquePhoneNumbers(values: string[]): string[] {
  const unique = new Set<string>();
  for (const item of values) {
    const normalized = normalizePhoneNumber(item);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

async function ensureContactsForNumbers(workspaceId: number, numbers: string[]): Promise<Contact[]> {
  const normalizedNumbers = extractUniquePhoneNumbers(numbers);
  if (!normalizedNumbers.length) return [];

  const contactsMap = new Map<number, Contact>();

  for (const number of normalizedNumbers) {
    let contact = await db.getContactByNumber(workspaceId, number);
    if (!contact) {
      const contactId = await db.createContact({
        workspaceId,
        whatsappNumber: number,
        name: null,
      });
      if (contactId) {
        contact = await db.getContactByNumber(workspaceId, number);
      }
    }
    if (contact) {
      contactsMap.set(contact.id, contact);
    }
  }

  return Array.from(contactsMap.values());
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      let workspaceMetadata: any = null;
      if (ctx.user.workspaceId) {
        const workspace = await db.getWorkspaceById(ctx.user.workspaceId);
        workspaceMetadata = workspace?.metadata ?? null;
      }
      return {
        ...ctx.user,
        workspaceMetadata,
      };
    }),
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

    updateKanbanSeller: protectedProcedure
      .input(z.object({
        action: z.enum(["add", "delete"]),
        name: z.string().min(2).optional(),
        columnId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const workspaceId = ctx.user.workspaceId;

        if (input.action === "add") {
          if (!input.name) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nome do vendedor obrigatório" });
          }
          const slug = input.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          const columnId = `seller_${slug || "col"}_${Date.now()}`;

          await db.updateWorkspaceMetadata(workspaceId, (metadata: any = {}) => {
            const columns = Array.isArray(metadata.kanbanSellerColumns)
              ? metadata.kanbanSellerColumns
              : [];
            return {
              ...metadata,
              kanbanSellerColumns: [...columns, { id: columnId, name: input.name }],
            };
          });

          return { success: true };
        }

        if (!input.columnId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "columnId obrigatório para exclusão" });
        }

        await db.updateWorkspaceMetadata(workspaceId, (metadata: any = {}) => {
          const columns = Array.isArray(metadata.kanbanSellerColumns)
            ? metadata.kanbanSellerColumns
            : [];
          return {
            ...metadata,
            kanbanSellerColumns: columns.filter((col: any) => col.id !== input.columnId),
          };
        });

        await db.moveContactsToStatus(workspaceId, input.columnId, "waiting_attendant");

        return { success: true };
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
        
        try {
          console.log(`[Kanban] Updating contact ${input.contactId} status to ${input.status}`);
          await db.updateContactKanbanStatus(input.contactId, input.status);
          console.log(`[Kanban] Successfully updated contact ${input.contactId} status`);
          return { success: true };
        } catch (error: any) {
          console.error(`[Kanban] Error updating contact ${input.contactId} status:`, error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to update contact status: ${error?.message || "Unknown error"}`,
          });
        }
      }),

    rename: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        name: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await db.updateContactName(input.contactId, input.name);
        return { success: true };
      }),

    markAsRead: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await db.updateContactMetadata(input.contactId, (metadata: any = {}) => ({
          ...metadata,
          unread: false,
        }));
        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await db.updateContactKanbanStatus(input.contactId, "archived");
        await db.updateContactMetadata(input.contactId, (metadata: any = {}) => ({
          ...metadata,
          unread: false,
        }));
        return { success: true };
      }),

    // Iniciar nova conversa (criar/obter contato e conversa)
    startConversation: protectedProcedure
      .input(z.object({
        whatsappNumber: z.string().min(1),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        // Normalizar número (remover caracteres não numéricos, exceto +)
        const normalizedNumber = input.whatsappNumber.replace(/[^\d+]/g, "");
        
        // Buscar ou criar contato
        let contact = await db.getContactByNumber(ctx.user.workspaceId, normalizedNumber);
        
        if (!contact) {
          // Criar novo contato
          const contactId = await db.createContact({
            workspaceId: ctx.user.workspaceId,
            whatsappNumber: normalizedNumber,
            name: input.name || null,
            kanbanStatus: "waiting_attendant", // Marcar como aguardando atendente para IA não interferir
            metadata: { startedByAgent: true }, // Flag para indicar que foi iniciado pelo atendente
          });
          contact = await db.getContactByNumber(ctx.user.workspaceId, normalizedNumber);
        } else {
          // Atualizar status para waiting_attendant para garantir que IA não interfira
          await db.updateContactKanbanStatus(contact.id, "waiting_attendant");
          if (input.name && input.name.trim()) {
            await db.updateContactName(contact.id, input.name.trim());
          }
          // Atualizar metadata
          await db.updateContactMetadata(contact.id, (metadata: any = {}) => ({
            ...metadata,
            startedByAgent: true,
          }));
        }

        if (!contact) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create or find contact" });
        }

        // Buscar ou criar conversa
        let conversation = await db.getConversationByContact(ctx.user.workspaceId, contact.id);
        
        if (!conversation) {
          // Buscar instância ativa
          const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
          const activeInstance = instances.find(i => i.status === "connected") || instances[0];
          
          if (!activeInstance) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma instância WhatsApp conectada" });
          }

          const conversationId = await db.createConversation({
            workspaceId: ctx.user.workspaceId,
            contactId: contact.id,
            instanceId: activeInstance.id,
            status: "pending_human", // Status para indicar que é atendimento humano
          });
          
          conversation = await db.getConversationByContact(ctx.user.workspaceId, contact.id);
        } else {
          // Atualizar status da conversa para pending_human
          await db.updateConversationStatus(conversation.id, "pending_human");
        }

        if (!conversation) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create or find conversation" });
        }

        return {
          contactId: contact.id,
          conversationId: conversation.id,
          contact,
        };
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
            await db.updateContactMetadata(contact.id, (metadata: any = {}) => ({
              ...metadata,
              unread: false,
            }));
            // Buscar instância WhatsApp
            const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId!);
            const instance = instances.find(i => i.id === conversation.instanceId);
            
            if (instance && instance.instanceKey) {
              // Enviar mensagem via WhatsApp
              try {
                console.log(`[Messages] Attempting to send message from app:`, {
                  instanceKey: instance.instanceKey,
                  whatsappNumber: contact.whatsappNumber,
                  content: input.content.substring(0, 50),
                });
                
                const { sendTextMessage } = await import("./whatsappService");
                await sendTextMessage(
                  instance.instanceKey,
                  contact.whatsappNumber,
                  input.content
                );
                
                console.log(`[Messages] Mensagem do atendente enviada com sucesso para ${contact.whatsappNumber}`);
              } catch (error: any) {
                console.error(`[Messages] Erro ao enviar mensagem via WhatsApp:`, error);
                console.error(`[Messages] Error stack:`, error?.stack);
                // Não lança erro para não bloquear o salvamento
              }
            } else {
              console.error(`[Messages] Instance not found or invalid:`, {
                instanceId: conversation.instanceId,
                instance: instance ? "found" : "not found",
                instanceKey: instance?.instanceKey || "missing",
              });
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

    resetCatalog: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        await db.deleteProductsByWorkspace(ctx.user.workspaceId);
        await db.deleteProductUploadsByWorkspace(ctx.user.workspaceId);

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
          
          const instanceKey = `ws${ctx.user.workspaceId}_${Date.now()}`;
          
          // Importar serviço WhatsApp (whatsapp-web.js)
          const { createWhatsAppInstance } = await import("./whatsappService");
          
          // Criar instância WhatsApp
          const result = await createWhatsAppInstance(instanceKey);
          
          // Salvar no banco
          const instanceId = await db.createWhatsappInstance({
            workspaceId: ctx.user.workspaceId,
            name: input.name,
            instanceKey,
            status: result.instance.status,
            qrCode: result.qrcode?.base64,
          });
          
          return {
            instanceId,
            qrCode: result.qrcode?.base64 || null,
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
          
          const { getQRCode } = await import("./whatsappService");
          const qrData = await getQRCode(instance.instanceKey);
          
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
          
          const { getInstanceStatus } = await import("./whatsappService");
          const status = await getInstanceStatus(instance.instanceKey);
          
          // Atualizar status no banco
          await db.updateWhatsappInstanceStatus(instance.id, status.status, status.phoneNumber);
          
          return {
            status: status.status,
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
          
          const { disconnectInstance } = await import("./whatsappService");
          await disconnectInstance(instance.instanceKey);
          
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
          
          const { reconnectInstance } = await import("./whatsappService");
          const result = await reconnectInstance(instance.instanceKey);
          
          // Atualizar status no banco
          await db.updateWhatsappInstanceStatus(
            instance.id,
            "connecting",
            undefined, // phoneNumber
            result.qrCode || undefined // qrCode
          );
          
          return {
            qrCode: result.qrCode,
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
      const { getInstanceStatus } = await import("./whatsappService");
      
      for (const instance of instances) {
        if (!instance.instanceKey) continue;
        try {
          const status = await getInstanceStatus(instance.instanceKey);
          if (status.status !== instance.status) {
            await db.updateWhatsappInstanceStatus(instance.id, status.status, status.phoneNumber);
            instance.status = status.status as any;
            instance.phoneNumber = status.phoneNumber || null;
          }
        } catch (error) {
          // Ignorar erros de status
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
          
          // Desconectar antes de deletar
          if (instance.instanceKey) {
            try {
              const { disconnectInstance } = await import("./whatsappService");
              await disconnectInstance(instance.instanceKey);
            } catch (error) {
              // Ignorar erro se não conseguir desconectar
              console.warn("[WhatsApp] Error disconnecting instance before delete:", error);
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

    createAndSend: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        message: z.string().min(1),
        contactIds: z.array(z.number()).optional(),
        audienceIds: z.array(z.number()).optional(),
        manualNumbers: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const workspaceId = ctx.user.workspaceId;
        const workspace = await db.getWorkspaceById(workspaceId);
        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace não encontrado" });
        }

        const metadata = workspace.metadata as any;
        if (!metadata?.evolutionApiUrl || !metadata?.evolutionApiKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Configure a Evolution API em Configurações > Evolution API antes de enviar campanhas.",
          });
        }

        const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
        if (!instances.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhuma instância do WhatsApp configurada. Crie e conecte uma instância antes de enviar campanhas.",
          });
        }

        const activeInstance = instances.find(instance => instance.status === "connected" && instance.instanceKey) ??
          instances.find(instance => instance.instanceKey);

        if (!activeInstance || !activeInstance.instanceKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhuma instância conectada disponível para enviar a campanha.",
          });
        }

        const contactMap = new Map<number, Contact>();

        const requestedContactIds = Array.from(new Set(input.contactIds ?? []));
        if (requestedContactIds.length) {
          const contactsById = await db.getContactsByIds(workspaceId, requestedContactIds);
          contactsById.forEach(contact => {
            if (contact.whatsappNumber) {
              contactMap.set(contact.id, contact);
            }
          });
        }

        const requestedAudienceIds = Array.from(new Set(input.audienceIds ?? []));
        if (requestedAudienceIds.length) {
          const contactsByAudiences = await db.getContactsByAudienceIds(workspaceId, requestedAudienceIds);
          contactsByAudiences.forEach(contact => {
            if (contact.whatsappNumber) {
              contactMap.set(contact.id, contact);
            }
          });
        }

        if (input.manualNumbers?.length) {
          const contactsFromNumbers = await ensureContactsForNumbers(workspaceId, input.manualNumbers);
          contactsFromNumbers.forEach(contact => {
            if (contact.whatsappNumber) {
              contactMap.set(contact.id, contact);
            }
          });
        }

        if (contactMap.size === 0) {
          const allContacts = await db.getContactsByWorkspace(workspaceId);
          allContacts.forEach(contact => {
            if (contact.whatsappNumber) {
              contactMap.set(contact.id, contact);
            }
          });
        }

        const campaignContacts = Array.from(contactMap.values()).filter(contact => {
          const normalized = normalizePhoneNumber(contact.whatsappNumber);
          return Boolean(normalized);
        });

        if (!campaignContacts.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhum contato válido encontrado para enviar a campanha.",
          });
        }

        const campaignId = await db.createCampaign({
          workspaceId,
          name: input.name,
          message: input.message,
          status: "processing",
          totalContacts: campaignContacts.length,
          sentCount: 0,
        });

        const { sendTextMessage } = await import("./whatsappService");

        let successCount = 0;
        const failures: Array<{ contactId: number; reason: string }> = [];

        for (const contact of campaignContacts) {
          try {
            let conversation = await db.getConversationByContact(workspaceId, contact.id);
            let conversationId = conversation?.id;
            if (!conversationId) {
              conversationId = await db.createConversation({
                workspaceId,
                contactId: contact.id,
                instanceId: activeInstance.id,
                status: "bot_handling",
              });
            }

            await sendTextMessage(
              activeInstance.instanceKey,
              contact.whatsappNumber!,
              input.message,
            );

            await db.createMessage({
              conversationId,
              senderType: "bot",
              senderId: ctx.user.id,
              content: input.message,
              messageType: "text",
            });

            successCount += 1;
          } catch (error: any) {
            console.error("[Campaigns] Falha ao enviar mensagem para contato", contact.id, error);
            failures.push({
              contactId: contact.id,
              reason: error?.message ?? "Erro desconhecido ao enviar mensagem.",
            });
          }
        }

        const status = successCount === campaignContacts.length
          ? "completed"
          : successCount === 0
            ? "failed"
            : "partial";

        await db.updateCampaign(campaignId, {
          status,
          sentCount: successCount,
          totalContacts: campaignContacts.length,
        });

        return {
          campaignId,
          totalContacts: campaignContacts.length,
          sentCount: successCount,
          failedCount: campaignContacts.length - successCount,
          failures,
          status,
        } as const;
      }),

    update: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        name: z.string().min(1),
        message: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const workspaceId = ctx.user.workspaceId;
        if (!workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        const campaign = await db.getCampaignById(workspaceId, input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
        }
        await db.updateCampaignDetails(workspaceId, input.campaignId, {
          name: input.name.trim(),
          message: input.message.trim(),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const workspaceId = ctx.user.workspaceId;
        if (!workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        const campaign = await db.getCampaignById(workspaceId, input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
        }
        await db.deleteCampaign(workspaceId, input.campaignId);
        return { success: true };
      }),

    audiences: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        return db.getCampaignAudiences(ctx.user.workspaceId);
      }),

    create: protectedProcedure
      .input(z.object({
          name: z.string().min(1),
          numbers: z.array(z.string()).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const workspaceId = ctx.user.workspaceId;
          if (!workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
          }
          const name = input.name.trim();
          if (!name) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um nome para o grupo." });
          }
          const audienceId = await db.createCampaignAudience(workspaceId, name);

          if (input.numbers?.length) {
            const contacts = await ensureContactsForNumbers(workspaceId, input.numbers);
            const contactIds = contacts.map(contact => contact.id);
            if (contactIds.length) {
              await db.appendCampaignAudienceMembers(audienceId, contactIds);
            }
          }

          const audience = await db.getCampaignAudienceById(workspaceId, audienceId);
          return audience;
        }),

      rename: protectedProcedure
        .input(z.object({
          audienceId: z.number(),
          name: z.string().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
          if (!ctx.user.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
          }
          const name = input.name.trim();
          if (!name) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um nome para o grupo." });
          }
          const audience = await db.getCampaignAudienceById(ctx.user.workspaceId, input.audienceId);
          if (!audience) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado." });
          }
          await db.updateCampaignAudienceName(ctx.user.workspaceId, input.audienceId, name);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({
          audienceId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
          if (!ctx.user.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
          }
          const audience = await db.getCampaignAudienceById(ctx.user.workspaceId, input.audienceId);
          if (!audience) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado." });
          }
          await db.deleteCampaignAudience(ctx.user.workspaceId, input.audienceId);
          return { success: true };
        }),

      importNumbers: protectedProcedure
        .input(z.object({
          audienceId: z.number(),
          numbers: z.array(z.string()).min(1),
          mode: z.enum(["append", "replace"]).default("append"),
        }))
        .mutation(async ({ ctx, input }) => {
          if (!ctx.user.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
          }
          const audience = await db.getCampaignAudienceById(ctx.user.workspaceId, input.audienceId);
          if (!audience) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado." });
          }

          const contacts = await ensureContactsForNumbers(ctx.user.workspaceId, input.numbers);
          if (!contacts.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Nenhum número válido foi encontrado para importar.",
            });
          }

          const contactIds = contacts.map(contact => contact.id);
          if (input.mode === "replace") {
            await db.replaceCampaignAudienceMembers(input.audienceId, contactIds);
          } else {
            await db.appendCampaignAudienceMembers(input.audienceId, contactIds);
          }

          return {
            success: true,
            total: contactIds.length,
            mode: input.mode,
          } as const;
        }),

      members: protectedProcedure
        .input(z.object({
          audienceId: z.number(),
        }))
        .query(async ({ ctx, input }) => {
          if (!ctx.user.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
          }
          const audience = await db.getCampaignAudienceById(ctx.user.workspaceId, input.audienceId);
          if (!audience) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado." });
          }
          return db.getCampaignAudienceMembers(ctx.user.workspaceId, input.audienceId);
        }),
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

    removeMember: protectedProcedure
      .input(z.object({
        audienceId: z.number(),
        contactId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const workspaceId = ctx.user.workspaceId;
        if (!workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        const audience = await db.getCampaignAudienceById(workspaceId, input.audienceId);
        if (!audience) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado." });
        }
        await db.removeCampaignAudienceMember(input.audienceId, input.contactId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

