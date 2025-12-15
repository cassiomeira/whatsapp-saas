import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getWorkspaceIxcMetrics, getIxcEvents, getContactStatusEvents, getContactSla, deleteContactFully, deleteAllContacts, createContact, getContactByNumber, normalizePhone } from "./db";
import { processIncomingMessage } from "./aiService";
import { getEvolutionService } from "./evolutionService";
import { TRPCError } from "@trpc/server";
import { parse } from "csv-parse/sync";
import type { InsertProduct, Contact } from "../drizzle/schema";
import { createClient } from "@supabase/supabase-js";

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

  analytics: router({
    ixc: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Workspace não encontrado" });
      }
      return getWorkspaceIxcMetrics(ctx.user.workspaceId);
    }),
    ixcEvents: protectedProcedure
      .input(z.object({
        type: z.enum(["consulta", "boleto", "desbloqueio"]).optional(),
        status: z.enum(["success", "fail"]).optional(),
        limit: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Workspace não encontrado" });
        }
        return getIxcEvents(ctx.user.workspaceId, {
          type: input?.type,
          status: input?.status,
          limit: input?.limit,
        });
      }),
    sla: protectedProcedure
      .input(z.object({
        from: z.number().optional(), // timestamp (s)
        to: z.number().optional(),   // timestamp (s)
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Workspace não encontrado" });
        }

        const now = Math.floor(Date.now() / 1000);
        const events = await getContactStatusEvents(ctx.user.workspaceId, {
          from: input?.from,
          to: input?.to,
        });

        // Agrupar por contato e ordenar por tempo
        const byContact: Record<number, typeof events> = {};
        for (const ev of events) {
          if (!byContact[ev.contactId]) byContact[ev.contactId] = [];
          byContact[ev.contactId].push(ev);
        }
        Object.values(byContact).forEach(list => list.sort((a, b) => a.changedAt - b.changedAt));

        const perStatus: Record<string, { totalSeconds: number; transitions: number }> = {};
        const perAttendant: Record<string, { totalSeconds: number; transitions: number }> = {};

        for (const list of Object.values(byContact)) {
          let lastStatus = list[0]?.statusFrom || list[0]?.statusTo || "desconhecido";
          let lastAssigned = list[0]?.assignedToId ?? null;
          let lastTime = list[0]?.changedAt || now;

          for (const ev of list) {
            const duration = Math.max(0, ev.changedAt - lastTime);
            const keyStatus = lastStatus;
            perStatus[keyStatus] = perStatus[keyStatus] || { totalSeconds: 0, transitions: 0 };
            perStatus[keyStatus].totalSeconds += duration;
            perStatus[keyStatus].transitions += 1;

            const keyAtt = lastAssigned !== null && lastAssigned !== undefined ? String(lastAssigned) : "sem_atendente";
            perAttendant[keyAtt] = perAttendant[keyAtt] || { totalSeconds: 0, transitions: 0 };
            perAttendant[keyAtt].totalSeconds += duration;
            perAttendant[keyAtt].transitions += 1;

            lastStatus = ev.statusTo;
            lastAssigned = ev.assignedToId ?? null;
            lastTime = ev.changedAt;
          }

          // tempo até agora no status atual
          const tailDuration = Math.max(0, now - lastTime);
          const keyStatusTail = lastStatus;
          perStatus[keyStatusTail] = perStatus[keyStatusTail] || { totalSeconds: 0, transitions: 0 };
          perStatus[keyStatusTail].totalSeconds += tailDuration;
          perStatus[keyStatusTail].transitions += 1;

          const keyAttTail = lastAssigned !== null && lastAssigned !== undefined ? String(lastAssigned) : "sem_atendente";
          perAttendant[keyAttTail] = perAttendant[keyAttTail] || { totalSeconds: 0, transitions: 0 };
          perAttendant[keyAttTail].totalSeconds += tailDuration;
          perAttendant[keyAttTail].transitions += 1;
        }

        const perStatusArr = Object.entries(perStatus).map(([status, v]) => ({
          status,
          totalSeconds: v.totalSeconds,
          transitions: v.transitions,
          averageSeconds: v.transitions > 0 ? v.totalSeconds / v.transitions : 0,
        }));

        const perAttendantArr = Object.entries(perAttendant).map(([att, v]) => ({
          attendantId: att === "sem_atendente" ? null : Number(att),
          totalSeconds: v.totalSeconds,
          transitions: v.transitions,
          averageSeconds: v.transitions > 0 ? v.totalSeconds / v.transitions : 0,
        }));

        return {
          perStatus: perStatusArr,
          perAttendant: perAttendantArr,
          totalEvents: events.length,
        };
      }),

    slaContact: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        from: z.number().optional(),
        to: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Workspace não encontrado" });
        }
        return getContactSla(ctx.user.workspaceId, input.contactId, input.from, input.to);
      }),
  }),

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

    // Importar contatos via VCF
    importVcf: protectedProcedure
      .input(z.object({
        vcfText: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const cards = input.vcfText
          .split(/BEGIN:VCARD/i)
          .map((chunk) => chunk.trim())
          .filter((chunk) => chunk.length > 0)
          .map((chunk) => `BEGIN:VCARD\n${chunk}`);

        let created = 0;
        let skipped = 0;

        for (const card of cards) {
          const nameMatch = card.match(/FN:(.+)/i);
          const name = nameMatch ? nameMatch[1].trim() : null;

          const telMatches = Array.from(card.matchAll(/TEL[^:]*:([^\r\n]+)/gi));
          if (!telMatches.length) continue;

          for (const tel of telMatches) {
            const rawPhone = (tel[1] || "").trim();
            if (!rawPhone) continue;
            const normalized = normalizePhone(rawPhone);
            if (!normalized) continue;

            const exists = await getContactByNumber(ctx.user.workspaceId, normalized);
            if (exists) {
              skipped += 1;
              continue;
            }

            await createContact({
              workspaceId: ctx.user.workspaceId,
              whatsappNumber: normalized,
              name,
              // Não colocar no Kanban; só aparecerá quando houver conversa/mensagem
              kanbanStatus: "archived",
              metadata: { imported: true },
            });
            created += 1;
          }
        }

        return { created, skipped };
      }),

    // Importar contatos via CSV (name;whatsappNumber;kanbanStatus)
    importCsv: protectedProcedure
      .input(z.object({
        csvText: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const lines = input.csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return { created: 0, skipped: 0 };

        // Detectar header
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes("whatsapp") || header.includes("name") || header.includes("kanban");
        const startIndex = hasHeader ? 1 : 0;

        let created = 0;
        let skipped = 0;

        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(";").map(c => c.trim().replace(/^"|"$/g, ""));
          if (cols.length < 2) continue;
          const name = cols[0] || null;
          const rawPhone = cols[1] || "";
          if (!rawPhone) continue;
          const normalized = normalizePhone(rawPhone);
          if (!normalized) continue;

          const exists = await getContactByNumber(ctx.user.workspaceId, normalized);
          if (exists) {
            skipped += 1;
            continue;
          }

          await createContact({
            workspaceId: ctx.user.workspaceId,
            whatsappNumber: normalized,
            name,
            kanbanStatus: "archived",
            metadata: { imported: true },
          });
          created += 1;
        }

        return { created, skipped };
      }),

    delete: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await deleteContactFully(ctx.user.workspaceId, input.contactId);
        return { success: true };
      }),

    deleteAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }
        await deleteAllContacts(ctx.user.workspaceId);
        return { success: true };
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
        const normalizedNumber = normalizePhone(input.whatsappNumber);
        
        // Buscar ou criar contato
        let contact = await db.getContactByNumber(ctx.user.workspaceId, normalizedNumber);
        
        if (!contact) {
          // Criar novo contato
          const destinationJid = `${normalizedNumber}@c.us`;
          const contactId = await db.createContact({
            workspaceId: ctx.user.workspaceId,
            whatsappNumber: normalizedNumber,
            name: input.name || null,
            kanbanStatus: "waiting_attendant", // Marcar como aguardando atendente para IA não interferir
            metadata: {
              startedByAgent: true, // Flag para indicar que foi iniciado pelo atendente
              whatsappJid: destinationJid,
              displayNumber: normalizedNumber,
              lastNormalized: normalizedNumber,
            },
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
            whatsappJid: metadata.whatsappJid || `${normalizedNumber}@c.us`,
            displayNumber: metadata.displayNumber || normalizedNumber,
            lastNormalized: normalizedNumber,
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

    // Upload de mídia (usando Supabase Storage)
    uploadMedia: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        fileData: z.string(), // base64
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const buffer = Buffer.from(input.fileData, "base64");
        const extension = input.fileName.split('.').pop()?.toLowerCase() || '';
        let mediaType: "image" | "audio" | "video" | "document" = "document";
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
          mediaType = "image";
        } else if (['mp3', 'ogg', 'wav', 'm4a', 'opus', 'webm'].includes(extension)) {
          mediaType = "audio";
        } else if (['mp4', 'webm', 'mov', 'avi'].includes(extension)) {
          mediaType = "video";
        }

        const contentType = input.fileType || `application/octet-stream`;
        let mediaUrl: string | undefined;

        // Usar Supabase Storage
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
          try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const bucketName = "whatsapp-media";
            
            // Verificar se o bucket existe, criar se não existir
            const { data: buckets } = await supabase.storage.listBuckets();
            const bucketExists = buckets?.some(b => b.name === bucketName);
            
            if (!bucketExists) {
              console.log(`[Messages] Creating Supabase Storage bucket: ${bucketName}`);
              const { error: createError } = await supabase.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: 50 * 1024 * 1024, // 50MB
              });
              if (createError && !createError.message.includes("already exists")) {
                console.error("[Messages] Failed to create bucket:", createError);
                throw createError;
              }
            }
            
            const filePath = `workspaces/${ctx.user.workspaceId}/media/${Date.now()}-${input.fileName}`;
            const { data, error } = await supabase.storage
              .from(bucketName)
              .upload(filePath, buffer, {
                contentType,
                upsert: false,
              });
            
            if (error) {
              console.error("[Messages] Supabase Storage upload error:", error);
              throw error;
            }
            
            const { data: urlData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filePath);
            
            console.log(`[Messages] Media uploaded to Supabase Storage: ${urlData.publicUrl}`);
            return { mediaUrl: urlData.publicUrl, mediaType, fileName: input.fileName };
          } catch (supabaseError: any) {
            console.error("[Messages] Supabase Storage failed:", supabaseError.message || supabaseError);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Failed to upload media: ${supabaseError.message || "Unknown error"}`,
            });
          }
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Supabase Storage not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
          });
        }
      }),

    // Enviar mensagem (texto ou mídia)
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string().optional(), // Opcional se houver mídia
        messageType: z.string().default("text"),
        mediaUrl: z.string().optional(),
        mediaType: z.enum(["image", "audio", "video", "document"]).optional(),
        caption: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!input.content && !input.mediaUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Message content or media is required" });
        }

        // Salvar mensagem no banco (sem whatsappMessageId ainda, será atualizado após envio)
        let messageId = await db.createMessage({
          conversationId: input.conversationId,
          senderType: "agent",
          senderId: ctx.user.id,
          content: input.content || input.caption || `[${input.mediaType || 'arquivo'}]`,
          messageType: input.mediaType || input.messageType,
          mediaUrl: input.mediaUrl,
        });

        // Buscar conversa para pegar o contato
        console.log(`[Messages] Looking for conversation ${input.conversationId} in workspace ${ctx.user.workspaceId}`);
        const conversations = await db.getConversationsByWorkspace(ctx.user.workspaceId!);
        const conversation = conversations.find(c => c.id === input.conversationId);
        
        console.log(`[Messages] Conversation found:`, conversation ? {
          id: conversation.id,
          contactId: conversation.contactId,
          instanceId: conversation.instanceId,
          status: conversation.status
        } : "NOT FOUND");
        
        if (conversation) {
          // Buscar contato
          const contacts = await db.getContactsByWorkspace(ctx.user.workspaceId!);
          const contact = contacts.find(c => c.id === conversation.contactId);
          
          console.log(`[Messages] Contact found:`, contact ? {
            id: contact.id,
            whatsappNumber: contact.whatsappNumber,
            name: contact.name
          } : "NOT FOUND");
          
          if (contact) {
            const destinationNumber =
              (contact.metadata as any)?.whatsappJid ||
              contact.whatsappNumber;

            await db.updateContactMetadata(contact.id, (metadata: any = {}) => ({
              ...metadata,
              unread: false,
            }));
            // Buscar instância WhatsApp
            const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId!);
            console.log(`[Messages] Found ${instances.length} instances for workspace ${ctx.user.workspaceId}, looking for instanceId: ${conversation.instanceId}`);
            console.log(`[Messages] Available instances:`, instances.map(i => ({ id: i.id, instanceKey: i.instanceKey, status: i.status })));
            
            let instance = instances.find(i => i.id === conversation.instanceId);
            
            // Se a instância da conversa não existir, tentar usar a primeira instância conectada
            if (!instance || !instance.instanceKey) {
              console.warn(`[Messages] Instance ${conversation.instanceId} not found or invalid, trying to use first connected instance`);
              instance = instances.find(i => i.instanceKey && (i.status === "connected" || i.status === "connecting"));
              
              if (instance) {
                console.log(`[Messages] Using fallback instance: ${instance.instanceKey} (ID: ${instance.id})`);
                // Atualizar a conversa para usar a instância correta
                try {
                  await db.updateConversationStatus(conversation.id, conversation.status, undefined);
                  // Nota: updateConversationStatus não atualiza instanceId, mas pelo menos logamos
                  console.log(`[Messages] Note: Conversation still references old instanceId ${conversation.instanceId}, but using ${instance.id} for sending`);
                } catch (updateError) {
                  console.warn(`[Messages] Could not update conversation instance reference:`, updateError);
                }
              }
            } else {
              console.log(`[Messages] Using conversation's instance: ${instance.instanceKey} (ID: ${instance.id}, status: ${instance.status})`);
            }
            
            if (instance && instance.instanceKey) {
              // Enviar mensagem/mídia via WhatsApp
              try {
                const { sendTextMessage, sendMediaMessage } = await import("./whatsappService");
                
                let whatsappMessageId: string | null = null;
                
                if (input.mediaUrl && input.mediaType) {
                  console.log(`[Messages] Attempting to send media from app:`, {
                    instanceKey: instance.instanceKey,
                    whatsappNumber: destinationNumber,
                    mediaType: input.mediaType,
                    mediaUrl: input.mediaUrl,
                  });
                  
                  whatsappMessageId = await sendMediaMessage(
                    instance.instanceKey,
                    destinationNumber,
                    input.mediaUrl,
                    input.mediaType,
                    input.caption || input.content
                  );
                  
                  console.log(`[Messages] Mídia do atendente enviada com sucesso para ${destinationNumber}, messageId: ${whatsappMessageId}`);
                } else if (input.content) {
                  console.log(`[Messages] Attempting to send message from app:`, {
                    instanceKey: instance.instanceKey,
                    whatsappNumber: destinationNumber,
                    content: input.content.substring(0, 50),
                  });
                  
                  whatsappMessageId = await sendTextMessage(
                    instance.instanceKey,
                    destinationNumber,
                    input.content
                  );
                  
                  console.log(`[Messages] Mensagem do atendente enviada com sucesso para ${destinationNumber}, messageId: ${whatsappMessageId}`);
                }
                
                // Atualizar mensagem com whatsappMessageId
                if (whatsappMessageId && messageId) {
                  await db.updateMessageWhatsappId(messageId, whatsappMessageId);
                }
                } catch (error: any) {
                console.error(`[Messages] Erro ao enviar mensagem/mídia via WhatsApp:`, error);
                console.error(`[Messages] Error stack:`, error?.stack);
                
                // Mensagem de erro mais específica
                let errorMessage = `Failed to send message/media: ${error.message}`;
                
                // Erro de conexão do WhatsApp
                if (error.message.includes('not connected') || error.message.includes('state: null')) {
                  errorMessage = `A instância WhatsApp não está conectada. Por favor, verifique se a instância está online e conectada ao WhatsApp.`;
                } else if (input.mediaType === 'audio' && error.message.includes('Evaluation failed')) {
                  errorMessage = `Falha ao enviar áudio: O WhatsApp Web não suporta o formato WebM. Por favor, tente gravar em outro formato (MP3, OGG) ou envie uma imagem/vídeo para testar.`;
                }
                
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: errorMessage,
                });
              }
            } else {
              console.error(`[Messages] Instance not found or invalid:`, {
                instanceId: conversation.instanceId,
                instance: instance ? "found" : "not found",
                instanceKey: instance?.instanceKey || "missing",
              });
              
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Instância WhatsApp não encontrada ou inválida (ID: ${conversation.instanceId}). Verifique se a instância está configurada corretamente.`,
              });
            }
          } else {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Contato não encontrado para esta conversa.",
            });
          }
        } else {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Conversa não encontrada.",
          });
        }

        return { messageId };
      }),

    // Deletar mensagem para todos (apenas mensagens do atendente, dentro de 1 hora)
    deleteForEveryone: protectedProcedure
      .input(z.object({
        messageId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const message = await db.getMessageById(input.messageId);
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        // Verificar se a mensagem é do atendente e se é do usuário atual
        if (message.senderType !== "agent" || message.senderId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own agent messages" });
        }

        // Verificar se a mensagem tem menos de 1 hora
        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600; // 1 hora em segundos
        const messageTimestamp = message.sentAt.getTime() / 1000;
        if (messageTimestamp < oneHourAgo) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete messages older than 1 hour" });
        }

        // Verificar se tem whatsappMessageId
        if (!message.whatsappMessageId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "WhatsApp message ID not found for this message" });
        }

        // Buscar conversa para pegar a instância
        const conversations = await db.getConversationsByWorkspace(ctx.user.workspaceId);
        const conversation = conversations.find(c => c.id === message.conversationId);
        if (!conversation || !conversation.instanceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation or instance not found" });
        }

        const instances = await db.getWhatsappInstancesByWorkspace(ctx.user.workspaceId);
        const instance = instances.find(i => i.id === conversation.instanceId);
        if (!instance || !instance.instanceKey) {
          throw new TRPCError({ code: "NOT_FOUND", message: "WhatsApp instance not found or not connected" });
        }

        // Deletar no WhatsApp
        try {
          const { getWhatsAppClient } = await import("./whatsappService");
          const client = getWhatsAppClient(instance.instanceKey);
          if (!client) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "WhatsApp client not ready" });
          }

          const contacts = await db.getContactsByWorkspace(ctx.user.workspaceId);
          const contact = contacts.find(c => c.id === conversation.contactId);
          if (!contact) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
          }

          // Obter a mensagem direto pelo ID serializado
          const msg = await client.getMessageById(message.whatsappMessageId);
          
          if (msg) {
            await msg.delete(true); // true para deleteForEveryone
            console.log(`[Messages] Message ${message.id} deleted for everyone on WhatsApp.`);
          } else {
            console.warn(`[Messages] WhatsApp message ${message.whatsappMessageId} not found for deletion.`);
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Mensagem não encontrada no WhatsApp para apagar",
            });
          }
        } catch (error: any) {
          console.error("[Messages] Error deleting message on WhatsApp:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to delete message on WhatsApp: ${error.message || "Unknown error"}`,
          });
        }

        // Atualizar mensagem no banco para refletir a exclusão
        await db.updateMessageContent(input.messageId, "Mensagem apagada", "text", null);

        return { success: true };
      }),
  }),

  storage: router({
    // Obter estatísticas do storage
    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.workspaceId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
      }

      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Supabase Storage not configured",
        });
      }

      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const bucketName = "whatsapp-media";
        const workspacePath = `workspaces/${ctx.user.workspaceId}/media/`;

        // Listar todos os arquivos do workspace
        const { data: files, error } = await supabase.storage
          .from(bucketName)
          .list(workspacePath, {
            limit: 10000,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (error) {
          console.error("[Storage] Error listing files:", error);
          throw error;
        }

        // Calcular tamanho total e contar arquivos
        let totalSize = 0;
        let fileCount = 0;
        const filesByType: Record<string, { count: number; size: number }> = {
          audio: { count: 0, size: 0 },
          image: { count: 0, size: 0 },
          video: { count: 0, size: 0 },
          document: { count: 0, size: 0 },
        };

        if (files && files.length > 0) {
          // O Supabase Storage retorna o tamanho no campo metadata.size
          for (const file of files) {
            // O tamanho pode estar em metadata.size ou em size diretamente
            const size = (file.metadata as any)?.size || (file as any).size || 0;
            
            if (size > 0) {
              totalSize += size;
              fileCount++;

              // Classificar por tipo
              const ext = file.name.split('.').pop()?.toLowerCase() || '';
              if (['mp3', 'ogg', 'wav', 'm4a', 'opus', 'webm'].includes(ext)) {
                filesByType.audio.count++;
                filesByType.audio.size += size;
              } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                filesByType.image.count++;
                filesByType.image.size += size;
              } else if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
                filesByType.video.count++;
                filesByType.video.size += size;
              } else {
                filesByType.document.count++;
                filesByType.document.size += size;
              }
            }
          }
        }

        // Limite do plano Free: 1 GB = 1073741824 bytes
        const limitBytes = 1073741824;
        const usagePercent = (totalSize / limitBytes) * 100;

        return {
          totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
          totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(4),
          fileCount,
          limitBytes,
          limitGB: 1,
          usagePercent: usagePercent.toFixed(2),
          filesByType,
        };
      } catch (error: any) {
        console.error("[Storage] Error getting stats:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get storage stats: ${error.message || "Unknown error"}`,
        });
      }
    }),

    // Limpar arquivos antigos
    cleanup: protectedProcedure
      .input(z.object({
        olderThanDays: z.number().min(1).max(365).default(30),
        fileTypes: z.array(z.enum(["audio", "image", "video", "document"])).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No workspace" });
        }

        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Supabase Storage not configured",
          });
        }

        try {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const bucketName = "whatsapp-media";
          const workspacePath = `workspaces/${ctx.user.workspaceId}/media/`;

          // Data limite (arquivos mais antigos que isso serão deletados)
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - input.olderThanDays);

          // Listar todos os arquivos
          const { data: files, error: listError } = await supabase.storage
            .from(bucketName)
            .list(workspacePath, {
              limit: 10000,
              sortBy: { column: "created_at", order: "asc" },
            });

          if (listError) {
            throw listError;
          }

          if (!files || files.length === 0) {
            return { deleted: 0, freedMB: 0 };
          }

          // Filtrar arquivos antigos
          const filesToDelete: string[] = [];
          let totalSizeToFree = 0;

          for (const file of files) {
            if (!file.id) continue;

            // Verificar tipo de arquivo se especificado
            if (input.fileTypes && input.fileTypes.length > 0) {
              const ext = file.name.split('.').pop()?.toLowerCase() || '';
              let fileType: "audio" | "image" | "video" | "document" = "document";
              
              if (['mp3', 'ogg', 'wav', 'm4a', 'opus', 'webm'].includes(ext)) {
                fileType = "audio";
              } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                fileType = "image";
              } else if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
                fileType = "video";
              }

              if (!input.fileTypes.includes(fileType)) {
                continue;
              }
            }

            // Verificar data de criação
            if (file.created_at) {
              const fileDate = new Date(file.created_at);
              if (fileDate < cutoffDate) {
                filesToDelete.push(`${workspacePath}${file.name}`);
                
                // Tentar obter tamanho do arquivo
                const size = (file.metadata as any)?.size || (file as any).size || 0;
                totalSizeToFree += size;
              }
            }
          }

          // Deletar arquivos
          let deletedCount = 0;
          if (filesToDelete.length > 0) {
            const { error: deleteError } = await supabase.storage
              .from(bucketName)
              .remove(filesToDelete);

            if (deleteError) {
              console.error("[Storage] Error deleting files:", deleteError);
              throw deleteError;
            }

            deletedCount = filesToDelete.length;
          }

          const freedMB = (totalSizeToFree / (1024 * 1024)).toFixed(2);

          console.log(`[Storage] Cleaned up ${deletedCount} files, freed ${freedMB} MB`);

          return {
            deleted: deletedCount,
            freedMB: parseFloat(freedMB),
          };
        } catch (error: any) {
          console.error("[Storage] Error cleaning up files:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to cleanup storage: ${error.message || "Unknown error"}`,
          });
        }
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

