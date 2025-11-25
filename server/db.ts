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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

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
  
  const updateData: any = { status: status as any, updatedAt: new Date() };
  if (qrCode !== undefined) updateData.qrCode = qrCode;
  if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
  
  await db.update(whatsappInstances)
    .set(updateData)
    .where(eq(whatsappInstances.id, id));
}

export async function deleteWhatsappInstance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(whatsappInstances).where(eq(whatsappInstances.id, id));
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
  
  const result = await db.select().from(contacts)
    .where(and(
      eq(contacts.workspaceId, workspaceId),
      eq(contacts.whatsappNumber, whatsappNumber)
    ))
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

export async function updateContactKanbanStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(contacts)
    .set({ kanbanStatus: status === "negociating" ? "negotiating" : status, updatedAt: new Date() })
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

