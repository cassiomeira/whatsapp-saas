import { eq, and, desc, like, or, sql, asc, inArray } from "drizzle-orm";

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import {
  InsertUser,
  users,
  workspaces,
  InsertWorkspace,
  whatsappInstances,
  InsertWhatsappInstance,
  contacts,
  InsertContact,
  conversations,
  InsertConversation,
  messages,
  InsertMessage,
  botConfigs,
  InsertBotConfig,
  conversationFlows,
  InsertConversationFlow,
  campaigns,
  InsertCampaign,
  products,
  InsertProduct,
  productUploads,
  InsertProductUpload,
  campaignAudiences,
  InsertCampaignAudience,
  campaignAudienceMembers,
  ixcEvents,
  InsertIxcEvent,
  IxcEvent,
  contactStatusEvents,
  InsertContactStatusEvent,
  ContactStatusEvent,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export function normalizePhone(raw: string): string {
  let n = raw.replace(/[^\d]/g, "");

  // remover prefixos de operadora e zeros à esquerda
  while (n.startsWith("0")) n = n.slice(1);
  if (n.startsWith("15") && n.length > 11) n = n.slice(2); // prefixo de operadora (ex: 015)

  // ajustar DDI duplicado/zero extra após 55
  if (n.startsWith("550")) {
    n = "55" + n.slice(3);
  }

  // se muito longo com 55 no início, manter apenas os últimos 11 dígitos após o 55
  if (n.length > 13 && n.startsWith("55")) {
    n = "55" + n.slice(-11);
  }

  // se não tiver DDI e tiver 10 ou 11 dígitos, prefixar 55
  if (!n.startsWith("55") && (n.length === 10 || n.length === 11)) {
    n = "55" + n;
  }

  // remover eventuais repetições 5555
  while (n.startsWith("5555")) {
    n = "55" + n.slice(4);
  }

  return n;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = createClient({ url: process.env.DATABASE_URL });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      (values as Record<string, unknown>)[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (user.status !== undefined) {
      values.status = user.status;
      updateSet.status = user.status;
    }

    if (user.workspaceId !== undefined) {
      values.workspaceId = user.workspaceId;
      updateSet.workspaceId = user.workspaceId;
    }
    if (user.workspaceRole !== undefined) {
      values.workspaceRole = user.workspaceRole;
      updateSet.workspaceRole = user.workspaceRole;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersCount(): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot count users: database not available");
    return 0;
  }

  const result = await db.select({ count: sql<number>`count(*)` }).from(users);
  return result?.[0]?.count ?? 0;
}

// Workspace functions
export async function getWorkspaceById(id: number) {
  console.log(`[DB] getWorkspaceById: Chamado com id: ${id}`);
  const db = await getDb();
  if (!db) {
    console.warn("[DB] getWorkspaceById: Database não disponível");
    return undefined;
  }
  const result = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  console.log("[DB] getWorkspaceById: Resultado da consulta:", result);
  return result[0];
}

export async function updateWorkspaceMetadata(id: number, updater: (metadata: any) => any) {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] updateWorkspaceMetadata: Database não disponível");
    throw new Error("Database not available");
  }

  const workspace = await getWorkspaceById(id);
  const currentMetadata = (workspace?.metadata as any) ?? {};
  const nextMetadata = updater({ ...currentMetadata }) ?? {};

  await db.update(workspaces)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(workspaces.id, id));

  return nextMetadata;
}

export type IxcMetricType = "consulta" | "boleto" | "desbloqueio";

export async function incrementIxcMetric(
  workspaceId: number,
  type: IxcMetricType,
  success: boolean
) {
  await updateWorkspaceMetadata(workspaceId, (metadata: any = {}) => {
    const current = metadata.ixcStats ?? {};
    const safe = {
      consulta: { success: 0, fail: 0, ...(current.consulta || {}) },
      boleto: { success: 0, fail: 0, ...(current.boleto || {}) },
      desbloqueio: { success: 0, fail: 0, ...(current.desbloqueio || {}) },
    };

    const target = safe[type];
    if (success) target.success = (target.success || 0) + 1;
    else target.fail = (target.fail || 0) + 1;

    return { ...metadata, ixcStats: safe };
  });
}

export async function getWorkspaceIxcMetrics(workspaceId: number) {
  const workspace = await getWorkspaceById(workspaceId);
  const stats = (workspace?.metadata as any)?.ixcStats ?? {};
  return {
    consulta: { success: 0, fail: 0, ...(stats.consulta || {}) },
    boleto: { success: 0, fail: 0, ...(stats.boleto || {}) },
    desbloqueio: { success: 0, fail: 0, ...(stats.desbloqueio || {}) },
  };
}

/**
 * IXC Events helpers (consultas, boletos, desbloqueios)
 */
async function ensureIxcEventsTable() {
  if (!process.env.DATABASE_URL) {
    console.warn("[DB] ensureIxcEventsTable: DATABASE_URL não definido");
    return;
  }
  const client = createClient({ url: process.env.DATABASE_URL });
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ixc_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspaceId INTEGER NOT NULL,
        contactId INTEGER,
        conversationId INTEGER,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        invoiceId INTEGER,
        message TEXT,
        createdAt INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  } catch (err) {
    console.error("[DB] ensureIxcEventsTable failed:", err);
  } finally {
    try {
      await (client as any)?.close?.();
    } catch {}
  }
}

export async function createIxcEvent(event: Omit<InsertIxcEvent, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) return;
  try {
    await ensureIxcEventsTable();
    await db.insert(ixcEvents).values(event);
    console.log(`[DB] Evento IXC gravado: ${event.type} - ${event.status}`);
  } catch (error) {
    console.error(`[DB] Erro ao gravar evento IXC:`, error);
  }

  // Fallback: registrar também no metadata (histórico curto) para garantir visualização
  try {
    const workspace = await getWorkspaceById(event.workspaceId);
    const metadata = (workspace?.metadata as any) || {};
    const lista = Array.isArray(metadata.ixcEventsRecent) ? metadata.ixcEventsRecent : [];
    const novo = {
      id: Date.now(),
      workspaceId: event.workspaceId,
      contactId: event.contactId ?? null,
      conversationId: event.conversationId ?? null,
      type: event.type,
      status: event.status,
      invoiceId: event.invoiceId ?? null,
      message: event.message ?? "",
      createdAt: Math.floor(Date.now() / 1000),
    };
    const atualizada = [novo, ...lista].slice(0, 100); // manter últimos 100
    await updateWorkspaceMetadata(event.workspaceId, (m: any = {}) => ({
      ...m,
      ixcEventsRecent: atualizada,
    }));
  } catch (err) {
    console.warn("[DB] Não foi possível atualizar ixcEventsRecent no metadata:", err);
  }
}

export async function getIxcEvents(
  workspaceId: number,
  filters?: {
    type?: "consulta" | "boleto" | "desbloqueio";
    status?: "success" | "fail";
    limit?: number;
  }
): Promise<IxcEvent[]> {
  const db = await getDb();
  const limit = Math.min(filters?.limit ?? 50, 200);
  let results: IxcEvent[] = [];

  if (db) {
    try {
      await ensureIxcEventsTable();
      const whereClauses = [eq(ixcEvents.workspaceId, workspaceId)];
      if (filters?.type) whereClauses.push(eq(ixcEvents.type, filters.type));
      if (filters?.status) whereClauses.push(eq(ixcEvents.status, filters.status));

      console.log(`[DB] Buscando eventos IXC para workspace ${workspaceId} com filtros:`, filters);

      results = await db
        .select()
        .from(ixcEvents)
        .where(and(...whereClauses))
        .orderBy(desc(ixcEvents.id))
        .limit(limit);

      console.log(`[DB] Eventos encontrados: ${results.length}`);
    } catch (error) {
      console.error("[DB] Erro ao buscar eventos IXC:", error);
    }
  }

  // Fallback para metadata se não houver resultados no banco
  if (!results || results.length === 0) {
    const workspace = await getWorkspaceById(workspaceId);
    const metadata = (workspace?.metadata as any) || {};
    const lista = Array.isArray(metadata.ixcEventsRecent) ? metadata.ixcEventsRecent : [];
    let filtrada = lista;
    if (filters?.type) filtrada = filtrada.filter((e: any) => e.type === filters.type);
    if (filters?.status) filtrada = filtrada.filter((e: any) => e.status === filters.status);
    results = filtrada.slice(0, limit) as any;
    console.log(`[DB] Eventos retornados do metadata: ${results.length}`);
  }

  return results;
}

export async function initAuxTables() {
  await ensureIxcEventsTable();
  await ensureContactStatusEventsTable();
  await ensureMessagesWhatsappIdColumn();
}

/**
 * Garantir que a coluna whatsappMessageId existe na tabela messages
 */
async function ensureMessagesWhatsappIdColumn() {
  if (!process.env.DATABASE_URL) {
    console.warn("[DB] ensureMessagesWhatsappIdColumn: DATABASE_URL não definido");
    return;
  }
  const client = createClient({ url: process.env.DATABASE_URL });
  try {
    // Verificar se a coluna já existe
    const check = await client.execute(
      "SELECT name FROM pragma_table_info('messages') WHERE name = 'whatsappMessageId';"
    );
    if (check && Array.isArray((check as any).rows) && (check as any).rows.length > 0) {
      console.log("[DB] Coluna whatsappMessageId já existe na tabela messages");
      return;
    }

    // Tentar adicionar a coluna
    await client.execute("ALTER TABLE messages ADD COLUMN whatsappMessageId TEXT;");
    console.log("[DB] Coluna whatsappMessageId adicionada com sucesso na tabela messages");
  } catch (err: any) {
    const errorMsg = err?.message?.toLowerCase() || "";
    if (errorMsg.includes("duplicate column") || errorMsg.includes("already exists")) {
      console.log("[DB] Coluna whatsappMessageId já existe na tabela messages (isso é OK)");
    } else if (errorMsg.includes("no such table: messages")) {
      console.error("[DB] Tabela messages não encontrada - verifique a base de dados");
    } else {
      console.error("[DB] ensureMessagesWhatsappIdColumn failed:", err);
    }
  } finally {
    try {
      await (client as any)?.close?.();
    } catch {}
  }
}

/**
 * Contact Status Events helpers (SLA por card)
 */
async function ensureContactStatusEventsTable() {
  if (!process.env.DATABASE_URL) {
    console.warn("[DB] ensureContactStatusEventsTable: DATABASE_URL não definido");
    return;
  }
  const client = createClient({ url: process.env.DATABASE_URL });
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS contact_status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspaceId INTEGER NOT NULL,
        contactId INTEGER NOT NULL,
        statusFrom TEXT NOT NULL,
        statusTo TEXT NOT NULL,
        assignedToId INTEGER,
        changedAt INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  } catch (err) {
    console.error("[DB] ensureContactStatusEventsTable failed:", err);
  } finally {
    try {
      await (client as any)?.close?.();
    } catch {}
  }
}

export async function createContactStatusEvent(event: Omit<InsertContactStatusEvent, "id" | "changedAt">) {
  const db = await getDb();
  if (!db) return;
  try {
    await ensureContactStatusEventsTable();
    await db.insert(contactStatusEvents).values(event);
  } catch (error) {
    console.error("[DB] Erro ao gravar contact_status_event:", error);
  }
}

export async function getContactStatusEvents(
  workspaceId: number,
  filters?: {
    contactId?: number;
    from?: number; // timestamp (s)
    to?: number;   // timestamp (s)
  }
): Promise<ContactStatusEvent[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureContactStatusEventsTable();

  let conditions: any[] = [eq(contactStatusEvents.workspaceId, workspaceId)];
  if (filters?.contactId) conditions.push(eq(contactStatusEvents.contactId, filters.contactId));
  if (filters?.from) conditions.push(sql`${contactStatusEvents.changedAt} >= ${filters.from}`);
  if (filters?.to) conditions.push(sql`${contactStatusEvents.changedAt} <= ${filters.to}`);

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  return db
    .select()
    .from(contactStatusEvents)
    .where(whereClause)
    .orderBy(desc(contactStatusEvents.changedAt));
}

export async function getContactSla(
  workspaceId: number,
  contactId: number,
  from?: number,
  to?: number
): Promise<{
  perStatus: Array<{ status: string; totalSeconds: number; transitions: number; averageSeconds: number }>;
  perAttendant: Array<{ attendantId: number | null; totalSeconds: number; transitions: number; averageSeconds: number }>;
  totalEvents: number;
}> {
  const db = await getDb();
  if (!db) return { perStatus: [], perAttendant: [], totalEvents: 0 };
  await ensureContactStatusEventsTable();

  const conditions: any[] = [
    eq(contactStatusEvents.workspaceId, workspaceId),
    eq(contactStatusEvents.contactId, contactId),
  ];
  if (from) conditions.push(sql`${contactStatusEvents.changedAt} >= ${from}`);
  if (to) conditions.push(sql`${contactStatusEvents.changedAt} <= ${to}`);

  const events = await db
    .select()
    .from(contactStatusEvents)
    .where(and(...conditions))
    .orderBy(contactStatusEvents.changedAt);

  const now = Math.floor(Date.now() / 1000);
  const windowStart = from ?? 0;
  const windowEnd = to ?? now;

  if (!events.length) {
    return { perStatus: [], perAttendant: [], totalEvents: 0 };
  }

  const perStatus: Record<string, { totalSeconds: number; transitions: number }> = {};
  const perAttendant: Record<string, { totalSeconds: number; transitions: number }> = {};

  const addDuration = (status: string, assigned: number | null, start: number, end: number) => {
    const a = Math.max(start, windowStart);
    const b = Math.min(end, windowEnd);
    if (b <= a) return;
    const duration = b - a;
    const keyStatus = status;
    perStatus[keyStatus] = perStatus[keyStatus] || { totalSeconds: 0, transitions: 0 };
    perStatus[keyStatus].totalSeconds += duration;
    perStatus[keyStatus].transitions += 1;

    const keyAtt = assigned !== null && assigned !== undefined ? String(assigned) : "sem_atendente";
    perAttendant[keyAtt] = perAttendant[keyAtt] || { totalSeconds: 0, transitions: 0 };
    perAttendant[keyAtt].totalSeconds += duration;
    perAttendant[keyAtt].transitions += 1;
  };

  let lastStatus = events[0].statusFrom || events[0].statusTo || "desconhecido";
  let lastAssigned = events[0].assignedToId ?? null;
  let lastTime = events[0].changedAt;

  for (const ev of events) {
    addDuration(lastStatus, lastAssigned, lastTime, ev.changedAt);
    lastStatus = ev.statusTo;
    lastAssigned = ev.assignedToId ?? null;
    lastTime = ev.changedAt;
  }

  addDuration(lastStatus, lastAssigned, lastTime, windowEnd);

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
}

export async function updateWorkspace(id: number, data: { name?: string; metadata?: any }) {
  console.log(`[DB] updateWorkspace: Chamado com id: ${id}, data:`, data);
  const db = await getDb();
  if (!db) {
    console.warn("[DB] updateWorkspace: Database não disponível");
    throw new Error("Database not available");
  }
  
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.metadata !== undefined) updateData.metadata = data.metadata; 
  
  console.log("[DB] updateWorkspace: Dados para atualização:", updateData);

  try {
    await db.update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, id));
    console.log(`[DB] updateWorkspace: Workspace ${id} atualizado com sucesso.`);
  } catch (error) {
    console.error(`[DB] updateWorkspace: Erro ao atualizar workspace ${id}:`, error);
    throw error; // Re-lança o erro para que o tRPC possa tratá-lo
  }
}

export async function createWorkspace(workspace: InsertWorkspace) {
  console.log("[DB] createWorkspace: Chamado com dados:", workspace);
  const db = await getDb();
  if (!db) {
    console.warn("[DB] createWorkspace: Database não disponível");
    throw new Error("Database not available");
  }
  
  try {
    const result = await db.insert(workspaces).values(workspace);
    const insertId = Number((result as any).lastInsertRowid ?? 0);
    console.log(`[DB] createWorkspace: Workspace ${insertId} criado com sucesso. Resultado:`, result);
    return insertId;
  } catch (error) {
    console.error("[DB] createWorkspace: Erro ao criar workspace:", error);
    throw error;
  }
}

export async function getWorkspacesByOwnerId(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(workspaces).where(eq(workspaces.ownerId, ownerId));
}

// WhatsApp Instance functions
export async function createWhatsappInstance(instance: InsertWhatsappInstance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(whatsappInstances).values(instance);
  return Number((result as any).lastInsertRowid ?? 0);
}

export async function getWhatsappInstancesByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(whatsappInstances).where(eq(whatsappInstances.workspaceId, workspaceId));
}

export async function getAllWhatsappInstances() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappInstances);
}

export async function getWhatsappInstanceByKey(instanceKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(whatsappInstances).where(eq(whatsappInstances.instanceKey, instanceKey)).limit(1);
  return result[0];
}

export async function getAllConnectedWhatsappInstances() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(whatsappInstances).where(
    or(
      eq(whatsappInstances.status, "connected"),
      eq(whatsappInstances.status, "connecting")
    )
  );
}

export async function updateWhatsappInstanceStatus(id: number, status: string, phoneNumber?: string, qrCode?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
  const updateData: any = { status: status as any, updatedAt: new Date() };
  if (qrCode !== undefined) updateData.qrCode = qrCode;
  if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
  
  await db.update(whatsappInstances)
    .set(updateData)
    .where(eq(whatsappInstances.id, id));
  } catch (error: any) {
    console.error(`[DB] Error updating WhatsApp instance ${id} status:`, error);
    if (error?.code === "SQLITE_FULL" || error?.cause?.code === "SQLITE_FULL") {
      throw new Error("Database is full. Please free up space or use a remote database.");
    }
    throw error;
  }
}

export async function deleteWhatsappInstance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
  await db.delete(whatsappInstances).where(eq(whatsappInstances.id, id));
  } catch (error: any) {
    console.error(`[DB] Error deleting WhatsApp instance ${id}:`, error);
    if (error?.code === "SQLITE_FULL" || error?.cause?.code === "SQLITE_FULL") {
      throw new Error("Database is full. Please free up space or use a remote database.");
    }
    throw error;
  }
}

// Contact functions
export async function createContact(contact: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(contacts).values(contact);
  return Number((result as any).lastInsertRowid ?? 0);
}

export async function getContactsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db.select().from(contacts)
    .where(eq(contacts.workspaceId, workspaceId))
    .orderBy(desc(contacts.updatedAt));

  return results.map(contact =>
    contact.kanbanStatus === "negociating"
      ? { ...contact, kanbanStatus: "negotiating" }
      : contact
  );
}

export async function getContactByNumber(workspaceId: number, whatsappNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const normalized = normalizePhone(whatsappNumber);
  const candidates = new Set<string>();

  if (whatsappNumber) {
    candidates.add(whatsappNumber);
    // Se vier com domínio (@c.us / @lid), usar apenas a parte do usuário também
    const userPart = whatsappNumber.split("@")[0];
    if (userPart) candidates.add(userPart);
  }
  if (normalized) {
    candidates.add(normalized);
    candidates.add(`+${normalized}`);
  }

  const result = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        inArray(contacts.whatsappNumber, Array.from(candidates))
      )
    )
    .limit(1);

  return result[0];
}

export async function getContactsByIds(workspaceId: number, contactIds: number[]) {
  if (!contactIds.length) return [];
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        inArray(contacts.id, contactIds)
      )
    );
}

export async function deleteContactFully(workspaceId: number, contactId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar conversas do contato
  const convs = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.contactId, contactId)));

  for (const conv of convs) {
    await db.delete(messages).where(eq(messages.conversationId, conv.id));
    await db.delete(conversations).where(eq(conversations.id, conv.id));
  }

  await db.delete(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, contactId)));
}

export async function deleteAllContacts(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId));

  for (const conv of convs) {
    await db.delete(messages).where(eq(messages.conversationId, conv.id));
    await db.delete(conversations).where(eq(conversations.id, conv.id));
  }

  await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
}

export async function updateContactKanbanStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const existing = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!existing.length) return;
    const contact = existing[0];
    const statusFrom = contact.kanbanStatus || "new_contact";
    const statusTo = status === "negociating" ? "negotiating" : status;

    await db.update(contacts)
      .set({ kanbanStatus: statusTo, updatedAt: new Date() })
      .where(eq(contacts.id, id));

    await createContactStatusEvent({
      workspaceId: contact.workspaceId,
      contactId: contact.id,
      statusFrom,
      statusTo,
      assignedToId: contact.assignedToId ?? undefined,
    });
  } catch (error: any) {
    console.error(`[DB] Error updating contact ${id} kanban status:`, error);
    if (error?.code === "SQLITE_FULL" || error?.cause?.code === "SQLITE_FULL") {
      throw new Error("Database is full. Please free up space or use a remote database.");
    }
    throw error;
  }
}

export async function updateContactWhatsappNumber(id: number, whatsappNumber: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(contacts)
    .set({ whatsappNumber, updatedAt: new Date() })
    .where(eq(contacts.id, id));
}

export async function updateContactName(id: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(contacts)
    .set({ name, updatedAt: new Date() })
    .where(eq(contacts.id, id));
}

export async function updateContactMetadata(id: number, updater: (metadata: any) => any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!existing.length) return;
  const currentMetadata = (existing[0].metadata as any) ?? {};
  const nextMetadata = updater({ ...currentMetadata }) ?? {};

  await db.update(contacts)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(contacts.id, id));
}

export async function moveContactsToStatus(workspaceId: number, fromStatus: string, toStatus: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(contacts)
    .set({ kanbanStatus: toStatus, updatedAt: new Date() })
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.kanbanStatus, fromStatus)
      )
    );
}

// Conversation functions
export async function createConversation(conversation: InsertConversation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(conversations).values(conversation);
  return Number((result as any).lastInsertRowid ?? 0);
}

export async function getConversationByContact(workspaceId: number, contactId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.contactId, contactId)
      )
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  return result[0];
}

export async function getConversationsByWorkspace(workspaceId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  
  if (status) {
    return db.select().from(conversations)
      .where(and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.status, status as any)
      ))
      .orderBy(desc(conversations.lastMessageAt));
  }
  
  return db.select().from(conversations)
    .where(eq(conversations.workspaceId, workspaceId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function updateConversationStatus(id: number, status: string, assignedToId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { status, updatedAt: new Date() };
  if (assignedToId !== undefined) {
    updateData.assignedToId = assignedToId;
  }
  
  await db.update(conversations)
    .set(updateData)
    .where(eq(conversations.id, id));
}

// Message functions
export async function createMessage(message: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(messages).values(message);
  
  // Update conversation lastMessageAt
  await db.update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, message.conversationId));
  
  return Number((result as any).lastInsertRowid ?? 0);
}

export async function getMessagesByConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.sentAt);
}

export async function getMessageById(messageId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  
  return result[0];
}

export async function updateMessageWhatsappId(messageId: number, whatsappMessageId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(messages)
    .set({ whatsappMessageId })
    .where(eq(messages.id, messageId));
}

export async function updateMessageContent(messageId: number, content: string, messageType: string = "text", mediaUrl: string | null = null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(messages)
    .set({ content, messageType, mediaUrl })
    .where(eq(messages.id, messageId));
}

// Bot Config functions
export async function getBotConfigByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(botConfigs)
    .where(eq(botConfigs.workspaceId, workspaceId))
    .limit(1);
  
  return result[0];
}

export async function upsertBotConfig(config: InsertBotConfig) {
  const db = await getDb();
  if (!db) {
    console.warn("[DB] upsertBotConfig: Database não disponível");
    throw new Error("Database not available");
  }
  
  try {
    await db.insert(botConfigs).values(config)
      .onConflictDoUpdate({
        target: botConfigs.workspaceId, // A coluna que define a duplicidade
        set: {
          masterPrompt: config.masterPrompt,
          transferRules: config.transferRules,
          isActive: config.isActive,
          updatedAt: new Date(),
        },
      });
    console.log(`[DB] upsertBotConfig: Configuração do bot para workspace ${config.workspaceId} atualizada/criada com sucesso.`);
  } catch (error) {
    console.error(`[DB] upsertBotConfig: Erro ao upsert a configuração do bot para workspace ${config.workspaceId}:`, error);
    throw error;
  }
}

// Conversation Flow functions
export async function getFlowsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(conversationFlows)
    .where(eq(conversationFlows.workspaceId, workspaceId))
    .orderBy(desc(conversationFlows.updatedAt));
}

// Campaign functions
export async function getCampaignsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(desc(campaigns.createdAt));
}

export async function createCampaign(campaign: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(campaigns).values(campaign);
  return Number((result as any).lastInsertRowid ?? 0);
}

export async function updateCampaign(
  id: number,
  data: Partial<Pick<InsertCampaign, "name" | "message" | "mediaUrl" | "mediaType" | "status" | "totalContacts" | "sentCount" | "scheduledAt">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(campaigns)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, id));
}

export async function getCampaignById(workspaceId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.id, id)
      )
    )
    .limit(1);

  return result[0];
}

// Campaign audience functions
export async function getCampaignAudiences(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];

  const audiences = await db
    .select()
    .from(campaignAudiences)
    .where(eq(campaignAudiences.workspaceId, workspaceId))
    .orderBy(desc(campaignAudiences.updatedAt));

  if (!audiences.length) return [];

  const audienceIds = audiences.map(audience => audience.id);
  const counts = await db
    .select({
      audienceId: campaignAudienceMembers.audienceId,
      count: sql<number>`count(*)`,
    })
    .from(campaignAudienceMembers)
    .where(inArray(campaignAudienceMembers.audienceId, audienceIds))
    .groupBy(campaignAudienceMembers.audienceId);

  const countMap = new Map<number, number>();
  counts.forEach(row => countMap.set(row.audienceId, row.count));

  return audiences.map(audience => ({
    ...audience,
    contactCount: countMap.get(audience.id) ?? 0,
  }));
}

export async function getCampaignAudienceById(workspaceId: number, audienceId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(campaignAudiences)
    .where(
      and(
        eq(campaignAudiences.workspaceId, workspaceId),
        eq(campaignAudiences.id, audienceId)
      )
    )
    .limit(1);

  return result[0];
}

export async function createCampaignAudience(workspaceId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(campaignAudiences).values({
    workspaceId,
    name,
  } satisfies InsertCampaignAudience);

  return Number((result as any).lastInsertRowid ?? 0);
}

export async function updateCampaignAudienceName(workspaceId: number, audienceId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(campaignAudiences)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaignAudiences.id, audienceId),
        eq(campaignAudiences.workspaceId, workspaceId)
      )
    );
}

export async function deleteCampaignAudience(workspaceId: number, audienceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(campaignAudienceMembers)
    .where(eq(campaignAudienceMembers.audienceId, audienceId));

  await db
    .delete(campaignAudiences)
    .where(
      and(
        eq(campaignAudiences.id, audienceId),
        eq(campaignAudiences.workspaceId, workspaceId)
      )
    );
}

export async function replaceCampaignAudienceMembers(audienceId: number, contactIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(campaignAudienceMembers)
    .where(eq(campaignAudienceMembers.audienceId, audienceId));

  if (contactIds.length === 0) {
    return;
  }

  const rows = contactIds.map(contactId => ({
    audienceId,
    contactId,
  }));

  await db
    .insert(campaignAudienceMembers)
    .values(rows)
    .onConflictDoNothing({
      target: [
        campaignAudienceMembers.audienceId,
        campaignAudienceMembers.contactId,
      ],
    });
}

export async function appendCampaignAudienceMembers(audienceId: number, contactIds: number[]) {
  if (!contactIds.length) return;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = contactIds.map(contactId => ({
    audienceId,
    contactId,
  }));

  await db
    .insert(campaignAudienceMembers)
    .values(rows)
    .onConflictDoNothing({
      target: [
        campaignAudienceMembers.audienceId,
        campaignAudienceMembers.contactId,
      ],
    });
}

export async function getContactsByAudienceIds(workspaceId: number, audienceIds: number[]) {
  if (!audienceIds.length) return [];
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      contactId: campaignAudienceMembers.contactId,
    })
    .from(campaignAudienceMembers)
    .innerJoin(
      campaignAudiences,
      eq(campaignAudienceMembers.audienceId, campaignAudiences.id)
    )
    .where(
      and(
        eq(campaignAudiences.workspaceId, workspaceId),
        inArray(campaignAudienceMembers.audienceId, audienceIds)
      )
    );

  if (!rows.length) return [];

  const uniqueContactIds = Array.from(new Set(rows.map(row => row.contactId)));
  return getContactsByIds(workspaceId, uniqueContactIds);
}

export async function getCampaignAudienceMembers(workspaceId: number, audienceId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      contactId: campaignAudienceMembers.contactId,
      whatsappNumber: contacts.whatsappNumber,
      name: contacts.name,
    })
    .from(campaignAudienceMembers)
    .innerJoin(
      campaignAudiences,
      eq(campaignAudienceMembers.audienceId, campaignAudiences.id)
    )
    .innerJoin(
      contacts,
      eq(campaignAudienceMembers.contactId, contacts.id)
    )
    .where(
      and(
        eq(campaignAudiences.workspaceId, workspaceId),
        eq(campaignAudienceMembers.audienceId, audienceId)
      )
    )
    .orderBy(asc(contacts.whatsappNumber));
}

export async function removeCampaignAudienceMember(audienceId: number, contactId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(campaignAudienceMembers)
    .where(
      and(
        eq(campaignAudienceMembers.audienceId, audienceId),
        eq(campaignAudienceMembers.contactId, contactId)
      )
    );
}

export async function updateCampaignDetails(
  workspaceId: number,
  campaignId: number,
  data: Partial<Pick<InsertCampaign, "name" | "message">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(campaigns)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId)
      )
    );
}

export async function deleteCampaign(workspaceId: number, campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId)
      )
    );
}

// Product catalog functions
export async function createProductUpload(upload: InsertProductUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(productUploads).values(upload);
  return Number((result as any).lastInsertRowid ?? 0);
}

export async function updateProductUpload(
  id: number,
  data: Partial<Pick<InsertProductUpload, "status" | "rowCount" | "errorMessage">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(productUploads)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(productUploads.id, id));
}

export async function deleteProductUpload(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(productUploads).where(eq(productUploads.id, id));
}

export async function deleteProductsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(products).where(eq(products.workspaceId, workspaceId));
}

export async function deleteProductUploadsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(productUploads).where(eq(productUploads.workspaceId, workspaceId));
}

export async function getProductUploadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(productUploads).where(eq(productUploads.id, id)).limit(1);
  return result[0];
}

export async function getProductUploadsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(productUploads)
    .where(eq(productUploads.workspaceId, workspaceId))
    .orderBy(desc(productUploads.createdAt));
}

export async function bulkUpsertProducts(entries: InsertProduct[]) {
  if (!entries.length) return;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const chunkSize = 500;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    await db
      .insert(products)
      .values(chunk)
      .onConflictDoUpdate({
        target: [products.workspaceId, products.sku],
        set: {
          name: sql`excluded.name`,
          price: sql`excluded.price`,
          quantity: sql`excluded.quantity`,
          description: sql`excluded.description`,
          uploadId: sql`excluded.uploadId`,
          updatedAt: sql`strftime('%s', 'now')`,
        },
      });
  }
}

export async function getProductsByWorkspace(workspaceId: number, limit = 1000) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(products)
    .where(eq(products.workspaceId, workspaceId))
    .orderBy(desc(products.updatedAt))
    .limit(limit);
}

export async function searchProducts(workspaceId: number, query: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  const normalized = query.toLowerCase();
  const pattern = `%${normalized}%`;
  const collapsedPattern = `%${normalized.replace(/\s+/g, "%")}%`;

  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.workspaceId, workspaceId),
        or(
          sql`${products.name} LIKE ${collapsedPattern} COLLATE NOCASE`,
          sql`ifnull(${products.description}, '') LIKE ${collapsedPattern} COLLATE NOCASE`,
          sql`${products.sku} LIKE ${pattern}`
        )
      )
    )
    .orderBy(
      asc(products.price),
      asc(products.name)
    )
    .limit(limit);
}



// User management functions
export async function getUsersByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(users)
    .where(eq(users.workspaceId, workspaceId))
    .orderBy(desc(users.createdAt));
}

export async function updateUserStatus(userId: number, status: "pending" | "approved" | "blocked") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

