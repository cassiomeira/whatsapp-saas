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
        __dirname,
        "../..",
        "client",
        "index.html"
      );

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
  const distCandidates = [
    path.resolve(__dirname, "../../dist/public"),
    path.resolve(__dirname, "../dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "../dist/public"),
  ];

  const distPath = distCandidates.find(candidate => fs.existsSync(candidate));

  if (!distPath) {
    console.error(
      `Could not find the build directory. Tried:\n${distCandidates.join("\n")}`
    );
    return;
  }

  console.log(`Serving static files from: ${distPath}`);

  app.use(
    express.static(distPath, {
      index: false,
      maxAge: "1y",
      etag: true,
    })
  );

  app.get("*", (req, res, next) => {
    if (req.path.includes(".")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}