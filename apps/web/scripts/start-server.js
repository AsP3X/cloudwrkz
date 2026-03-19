#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");

const appRoot = path.join(__dirname, "..");
// Load .env and .env.local so the standalone server gets DATABASE_URL etc. (.env.local overrides)
dotenv.config({ path: path.join(appRoot, ".env") });
dotenv.config({ path: path.join(appRoot, ".env.local") });

const standaloneRoot = path.join(appRoot, ".next", "standalone");
// Monorepo with outputFileTracingRoot: server is at standalone/apps/web/server.js
const monorepoServer = path.join(standaloneRoot, "apps", "web", "server.js");
// Non-monorepo: server is at standalone/server.js
const flatServer = path.join(standaloneRoot, "server.js");

const serverPath = fs.existsSync(monorepoServer)
  ? monorepoServer
  : fs.existsSync(flatServer)
    ? flatServer
    : null;
const serverCwd = serverPath
  ? path.dirname(serverPath)
  : null;

if (!serverPath || !serverCwd) {
  console.error("No standalone build found. Run 'pnpm build' first.");
  process.exit(1);
}

const result = spawnSync("node", [path.basename(serverPath)], {
  stdio: "inherit",
  cwd: serverCwd,
});

process.exit(result.status ?? 1);
