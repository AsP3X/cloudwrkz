/**
 * Initialize modules in the database
 * Run this script after database setup: pnpm tsx scripts/init-modules.ts
 */

import { initializeModules } from "../src/server/actions/modules";

async function main() {
  console.log("Initializing modules...");
  try {
    await initializeModules();
    console.log("✅ Modules initialized successfully!");
  } catch (error) {
    console.error("❌ Error initializing modules:", error);
    process.exit(1);
  }
}

main();
