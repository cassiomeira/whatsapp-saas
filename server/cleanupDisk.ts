import fs from "fs";
import path from "path";
import * as db from "./db";

const BASE_SESSIONS_DIR = process.env.WHATSAPP_SESSIONS_DIR
  ? path.resolve(process.env.WHATSAPP_SESSIONS_DIR)
  : path.resolve(process.cwd(), "data", "whatsapp-sessions");

/**
 * Limpar sessões de instâncias desconectadas
 */
export async function cleanupDisconnectedSessions(): Promise<number> {
  let cleaned = 0;
  
  try {
    // Buscar todas as instâncias no banco
    const allInstances = await db.getAllWhatsappInstances();
    const activeInstanceKeys = new Set(
      allInstances
        .filter(i => i.status === "connected" || i.status === "connecting")
        .map(i => i.instanceKey)
        .filter((key): key is string => Boolean(key))
    );
    
    // Listar todas as sessões no disco
    if (!fs.existsSync(BASE_SESSIONS_DIR)) {
      return 0;
    }
    
    const sessionDirs = fs.readdirSync(BASE_SESSIONS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    for (const sessionDir of sessionDirs) {
      // Se a sessão não corresponde a uma instância ativa, limpar
      if (!activeInstanceKeys.has(sessionDir)) {
        const sessionPath = path.join(BASE_SESSIONS_DIR, sessionDir);
        try {
          console.log(`[Cleanup] Removing disconnected session: ${sessionDir}`);
          fs.rmSync(sessionPath, { recursive: true, force: true });
          cleaned++;
        } catch (error) {
          console.warn(`[Cleanup] Failed to remove session ${sessionDir}:`, error);
        }
      }
    }
    
    // Limpar cache do Chromium em sessões ativas (manter apenas o essencial)
    for (const instanceKey of activeInstanceKeys) {
      const sessionPath = path.join(BASE_SESSIONS_DIR, instanceKey);
      if (fs.existsSync(sessionPath)) {
        try {
          cleanupChromiumCache(sessionPath);
        } catch (error) {
          console.warn(`[Cleanup] Failed to cleanup cache for ${instanceKey}:`, error);
        }
      }
    }
    
    console.log(`[Cleanup] Cleaned ${cleaned} disconnected sessions`);
    return cleaned;
  } catch (error) {
    console.error("[Cleanup] Error cleaning sessions:", error);
    return cleaned;
  }
}

/**
 * Limpar cache do Chromium (mantém apenas o essencial para funcionar)
 */
function cleanupChromiumCache(sessionPath: string) {
  const cacheDirs = [
    path.join(sessionPath, "Default", "Cache"),
    path.join(sessionPath, "Default", "Code Cache"),
    path.join(sessionPath, "Default", "GPUCache"),
    path.join(sessionPath, "Default", "Service Worker"),
    path.join(sessionPath, "Default", "Storage", "ext"),
  ];
  
  for (const cacheDir of cacheDirs) {
    if (fs.existsSync(cacheDir)) {
      try {
        const stats = fs.statSync(cacheDir);
        if (stats.isDirectory()) {
          // Calcular tamanho antes de deletar
          const size = getDirectorySize(cacheDir);
          if (size > 50 * 1024 * 1024) { // Mais de 50MB
            console.log(`[Cleanup] Removing cache: ${cacheDir} (${(size / 1024 / 1024).toFixed(2)}MB)`);
            fs.rmSync(cacheDir, { recursive: true, force: true });
          }
        }
      } catch (error) {
        // Ignorar erros ao limpar cache
      }
    }
  }
}

function getDirectorySize(dirPath: string): number {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (error) {
    // Ignorar erros
  }
  return size;
}

/**
 * Otimizar banco de dados (VACUUM)
 */
export async function optimizeDatabase(): Promise<void> {
  try {
    const database = await db.getDb();
    if (!database) {
      console.warn("[Cleanup] Database not available for optimization");
      return;
    }
    
    console.log("[Cleanup] Optimizing database (VACUUM)...");
    await database.run({ sql: "VACUUM", args: [] });
    console.log("[Cleanup] Database optimized");
  } catch (error) {
    console.error("[Cleanup] Error optimizing database:", error);
  }
}

/**
 * Executar limpeza completa
 */
export async function runCleanup(): Promise<{ sessionsCleaned: number }> {
  console.log("[Cleanup] Starting disk cleanup...");
  
  const sessionsCleaned = await cleanupDisconnectedSessions();
  
  // Otimizar banco apenas se limpou muitas sessões
  if (sessionsCleaned > 0) {
    await optimizeDatabase();
  }
  
  console.log("[Cleanup] Cleanup completed");
  return { sessionsCleaned };
}

