/**
 * index.js — Express bootstrap for the Altruon Merchant Demo backend.
 *
 * Responsibilities:
 *   1. Load environment configuration (server/.env via dotenv).
 *   2. Mount the demo API under /api (see routes.js).
 *   3. In production builds, serve the compiled React app from client/dist
 *      so the whole demo can run as a single Node process.
 *
 * In development you don't hit this server directly: the Vite dev server
 * (client/vite.config.js) proxies /api/* requests here.
 */

// Environment loading happens in altruonClient.js (imported via routes.js),
// which resolves server/.env relative to the source file — so starting the
// server from any working directory behaves the same.
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { router } from "./routes.js";
import { getConfig } from "./altruonClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4242;

const app = express();

// CORS is open because this is a local demo. In production, restrict the
// origin to your storefront's domain.
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// All demo endpoints live under /api — see routes.js for documentation.
app.use("/api", router);

// Optional: serve the built frontend (run `npm run build` at the repo root
// first). This makes `npm start` a complete one-process deployment.
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: let React Router handle /result and any other route.
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.listen(PORT, () => {
  const cfg = getConfig();
  /* eslint-disable no-console */
  console.log("");
  console.log("  Altruon Merchant Demo — backend");
  console.log("  --------------------------------");
  console.log(`  Listening on:        http://localhost:${PORT}`);
  console.log(`  Altruon tenant:      ${cfg.tenant || "(not configured)"}`);
  console.log(`  Altruon API:         ${cfg.apiBaseUrl || "(not configured)"}`);
  console.log(`  Secret key loaded:   ${cfg.secretKey ? "yes" : "NO — set ALTRUON_SECRET_KEY in server/.env"}`);
  console.log("");
});
