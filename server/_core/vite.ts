import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // O código compilado está em dist/public
  // import.meta.dirname é server/_core, então subimos 2 níveis para chegar em dist/public
  const distPath = path.resolve(import.meta.dirname, "../../dist/public");
  
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
    return;
  }

  console.log(`Serving static files from: ${distPath}`);
  
  // Servir arquivos estáticos (assets, CSS, JS, etc)
  app.use(express.static(distPath, { 
    index: false,
    maxAge: '1y',
    etag: true
  }));

  // Fallback para index.html apenas para rotas que não são arquivos
  app.get("*", (req, res, next) => {
    // Se a requisição é para um arquivo (tem extensão), retorna 404
    if (req.path.includes('.')) {
      return next();
    }
    // Caso contrário, serve o index.html
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
