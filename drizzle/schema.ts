import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = sqliteTable("users", {
  id: int("id").primaryKey(),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(),
  status: text("status").default("pending").notNull(),
  workspaceId: int("workspaceId"),
  workspaceRole: text("workspaceRole").default("agent"),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  lastSignedIn: int("lastSignedIn", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Workspaces - cada cliente tem seu próprio workspace
 */
export const workspaces = sqliteTable("workspaces", {
  id: int("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: int("ownerId").notNull(),
  metadata: text("metadata", { mode: "json" }),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

/**
 * Instâncias do WhatsApp conectadas
 */
export const whatsappInstances = sqliteTable("whatsapp_instances", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: text("name").notNull(),
  phoneNumber: text("phoneNumber"),
  status: text("status").default("disconnected").notNull(),
  instanceKey: text("instanceKey"),
  qrCode: text("qrCode"),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
export type InsertWhatsappInstance = typeof whatsappInstances.$inferInsert;

/**
 * Contatos/Leads que entram pelo WhatsApp
 */
export const contacts = sqliteTable("contacts", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  whatsappNumber: text("whatsappNumber").notNull(),
  name: text("name"),
  profilePicUrl: text("profilePicUrl"),
  kanbanStatus: text("kanbanStatus").default("new_contact"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

/**
 * Conversas com os contatos
 */
export const conversations = sqliteTable("conversations", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  contactId: int("contactId").notNull(),
  instanceId: int("instanceId").notNull(),
  assignedToId: int("assignedToId"),
  status: text("status").default("bot_handling").notNull(),
  lastMessageAt: int("lastMessageAt", { mode: "timestamp" }),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Mensagens individuais
 */
export const messages = sqliteTable("messages", {
  id: int("id").primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderType: text("senderType").notNull(),
  senderId: int("senderId"),
  content: text("content").notNull(),
  messageType: text("messageType").default("text").notNull(),
  mediaUrl: text("mediaUrl"),
  sentAt: int("sentAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  isRead: int("isRead", { mode: "boolean" }).default(sql`0`).notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Configuração do Bot/IA
 */
export const botConfigs = sqliteTable("bot_configs", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull().unique(),
  masterPrompt: text("masterPrompt"),
  transferRules: text("transferRules", { mode: "json" }).$type<Array<{
    type: string;
    value: string;
    action: string;
  }>>(),
  isActive: int("isActive", { mode: "boolean" }).default(sql`1`).notNull(),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type BotConfig = typeof botConfigs.$inferSelect;
export type InsertBotConfig = typeof botConfigs.$inferInsert;

/**
 * Fluxos de conversa
 */
export const conversationFlows = sqliteTable("conversation_flows", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  flowData: text("flowData", { mode: "json" }),
  isActive: int("isActive", { mode: "boolean" }).default(sql`1`).notNull(),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type ConversationFlow = typeof conversationFlows.$inferSelect;
export type InsertConversationFlow = typeof conversationFlows.$inferInsert;

/**
 * Campanhas de disparo em massa
 */
export const campaigns = sqliteTable("campaigns", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  mediaUrl: text("mediaUrl"),
  mediaType: text("mediaType"),
  status: text("status").default("draft").notNull(),
  totalContacts: int("totalContacts").default(0),
  sentCount: int("sentCount").default(0),
  scheduledAt: int("scheduledAt", { mode: "timestamp" }),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

/**
 * Grupos/listas de disparo de campanhas
 */
export const campaignAudiences = sqliteTable("campaign_audiences", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: text("name").notNull(),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type CampaignAudience = typeof campaignAudiences.$inferSelect;
export type InsertCampaignAudience = typeof campaignAudiences.$inferInsert;

export const campaignAudienceMembers = sqliteTable(
  "campaign_audience_members",
  {
    id: int("id").primaryKey(),
    audienceId: int("audienceId").notNull(),
    contactId: int("contactId").notNull(),
    createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  },
  table => ({
    audienceContactUnique: uniqueIndex("campaign_audience_members_unique").on(
      table.audienceId,
      table.contactId
    ),
  })
);

export type CampaignAudienceMember = typeof campaignAudienceMembers.$inferSelect;
export type InsertCampaignAudienceMember = typeof campaignAudienceMembers.$inferInsert;

/**
 * Uploads de catálogo de produtos
 */
export const productUploads = sqliteTable("product_uploads", {
  id: int("id").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  fileName: text("fileName").notNull(),
  status: text("status").default("processing").notNull(),
  rowCount: int("rowCount"),
  errorMessage: text("errorMessage"),
  createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
});

export type ProductUpload = typeof productUploads.$inferSelect;
export type InsertProductUpload = typeof productUploads.$inferInsert;

/**
 * Catálogo de produtos disponíveis para a IA
 */
export const products = sqliteTable(
  "products",
  {
    id: int("id").primaryKey(),
    workspaceId: int("workspaceId").notNull(),
    uploadId: int("uploadId").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    price: int("price").notNull(), // armazenado em centavos
    quantity: int("quantity").default(0),
    description: text("description"),
    createdAt: int("createdAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
    updatedAt: int("updatedAt", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`).notNull(),
  },
  table => ({
    workspaceSkuUnique: uniqueIndex("products_workspace_sku_unique").on(
      table.workspaceId,
      table.sku
    ),
  })
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

