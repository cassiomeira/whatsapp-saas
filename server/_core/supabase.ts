import { createClient, type User as SupabaseAuthUser } from "@supabase/supabase-js";
import type { Request } from "express";

import { ENV } from "./env";

const supabaseAdminClient =
  ENV.supabaseUrl && ENV.supabaseServiceRoleKey
    ? createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

export function extractSupabaseToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const headerToken = req.headers["x-supabase-auth"];
  if (typeof headerToken === "string" && headerToken.length > 0) {
    return headerToken.trim();
  }

  return null;
}

export async function getSupabaseUser(accessToken: string): Promise<SupabaseAuthUser | null> {
  if (!supabaseAdminClient) {
    console.warn("[Supabase] Admin client not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return null;
  }

  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);

  if (error) {
    console.warn("[Supabase] auth.getUser failed:", error.message);
    return null;
  }

  return data.user ?? null;
}

export type SupabaseUser = SupabaseAuthUser;

