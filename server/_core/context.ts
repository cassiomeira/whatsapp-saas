import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { extractSupabaseToken, getSupabaseUser, type SupabaseUser } from "./supabase";
import { ENV } from "./env";

async function ensureWorkspaceForUser(user: User, supabaseUser: SupabaseUser): Promise<User> {
  if (user.workspaceId) {
    return user;
  }

  const displayName =
    (supabaseUser.user_metadata?.workspace_name as string | undefined) ||
    (supabaseUser.user_metadata?.company as string | undefined) ||
    (supabaseUser.user_metadata?.organization as string | undefined) ||
    (supabaseUser.email ? `Workspace de ${supabaseUser.email}` : `Workspace ${supabaseUser.id.slice(0, 8)}`);

  const workspaceId = await db.createWorkspace({
    name: displayName,
    ownerId: user.id,
  });

  await db.upsertUser({
    openId: user.openId,
    workspaceId,
    workspaceRole: "owner",
    status: "approved",
  });

  const existingBotConfig = await db.getBotConfigByWorkspace(workspaceId);
  if (!existingBotConfig) {
    await db.upsertBotConfig({
      workspaceId,
      masterPrompt: "Você é um assistente de atendimento profissional e prestativo.",
      transferRules: [],
      isActive: true,
    });
  }

  const refreshedUser = await db.getUserByOpenId(user.openId);
  return refreshedUser ?? user;
}

async function syncSupabaseUser(supabaseUser: SupabaseUser): Promise<User | null> {
  const existingUser = await db.getUserByOpenId(supabaseUser.id);
  const isNewUser = !existingUser;

  const nameFromMetadata =
    (supabaseUser.user_metadata?.full_name as string | undefined) ||
    (supabaseUser.user_metadata?.name as string | undefined) ||
    (supabaseUser.user_metadata?.fullName as string | undefined) ||
    supabaseUser.email ||
    supabaseUser.phone ||
    supabaseUser.id;

  let role = existingUser?.role;
  if (!role) {
    const userCount = await db.getUsersCount();
    role = userCount === 0 ? "admin" : "user";
  }

  await db.upsertUser({
    openId: supabaseUser.id,
    name: nameFromMetadata,
    email: supabaseUser.email ?? null,
    loginMethod: (supabaseUser.app_metadata?.provider as string | undefined) ?? "supabase",
    status: "approved",
    role,
  });

  let platformUser = await db.getUserByOpenId(supabaseUser.id);
  if (!platformUser) {
    return null;
  }

  if (isNewUser || !platformUser.workspaceId) {
    platformUser = await ensureWorkspaceForUser(platformUser, supabaseUser);
  }

  return platformUser;
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const accessToken = extractSupabaseToken(opts.req);
    if (accessToken) {
      const supabaseUser = await getSupabaseUser(accessToken);
      if (supabaseUser) {
        user = await syncSupabaseUser(supabaseUser);
      }
    }
  } catch (error) {
    console.error("[Auth] Failed to authenticate Supabase user:", error);
    user = null;
  }

  // Atalho para desenvolvimento DESABILITADO a pedido do usuário
  // Para permitir logout e troca de usuários em localhost
  // if (!user && !ENV.isProduction) {
  //   user = await db.getFirstUser();
  //   if (user) {
  //     console.log(`[Auth][DEV] Bypassing auth: using user ${user.name} (${user.id})`);
  //   } else {
  //     console.warn("[Auth][DEV] Bypass failed: no users found in database.");
  //   }
  // }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
