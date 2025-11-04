import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { InsertWorkspace, User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (process.env.NODE_ENV === "development") {
    const workspaceId = 1;
    const simulatedUser: User = {
      id: 1,
      openId: "local-user",
      name: "Administrador Local",
      email: "admin@local.com",
      loginMethod: "local",
      role: "admin",
      status: "approved",
      workspaceId,
      workspaceRole: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    user = simulatedUser;

    // Verificar se o workspace padrão existe, se não, criar.
    const existingWorkspace = await db.getWorkspaceById(workspaceId);
    if (!existingWorkspace) {
      await db.createWorkspace({
        id: workspaceId,
        name: "Workspace Padrão Local",
        ownerId: simulatedUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`[DB] Workspace padrão para o usuário ${simulatedUser.name} criado com sucesso.`);
    }
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
