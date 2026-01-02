#!/usr/bin/env node

/**
 * Module Management CLI Tool
 * 
 * Usage:
 *   pnpm cli module list
 *   pnpm cli module enable <module-key>
 *   pnpm cli module disable <module-key>
 *   pnpm cli module show <module-key>
 *   pnpm cli module config <module-key> [config-json]
 *   pnpm cli module status
 *   pnpm cli module sync
 */

import { prisma } from "../lib/db/prisma";
import { MODULE_CONFIG, MODULE_KEYS } from "../lib/constants/modules";
import {
  prompt,
  select,
  confirm,
  separator,
  header,
  success,
  error,
  warning,
  info,
  createSpinner,
  createTable,
  sectionHeader,
  displayKeyValue,
  notice,
  waitForEnter,
} from "./prompts";
import chalk from "chalk";

const args = process.argv.slice(2);
const commandArgs = args[0] === "module" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("module-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Module Management CLI Tool

Commands:
  list                    List all modules with status
  enable <module-key>     Enable a module
  disable <module-key>    Disable a module
  show <module-key>       Show module details and config
  config <module-key> [json] Configure module settings (JSON)
  status                  Show overall module status
  sync                    Sync modules from code definitions

Module Keys: ${Object.values(MODULE_KEYS).join(", ")}

Examples:
  pnpm cli module list
  pnpm cli module enable tickets
  pnpm cli module disable timetracking
  pnpm cli module show tickets
  pnpm cli module config tickets '{"maxTickets": 100}'
  pnpm cli module status
  pnpm cli module sync
`);
  process.exit(0);
}

const command = commandArgs[0];

if (shouldExecute && command) {
  async function main() {
    try {
      switch (command) {
        case "list":
          await handleList();
          break;
        case "enable":
          await handleEnable();
          break;
        case "disable":
          await handleDisable();
          break;
        case "show":
          await handleShow();
          break;
        case "config":
          await handleConfig();
          break;
        case "status":
          await handleStatus();
          break;
        case "sync":
          await handleSync();
          break;
        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  main();
}

async function handleList() {
  const spinner = createSpinner("Loading modules...");
  spinner.start();

  try {
    // Initialize modules if they don't exist
    const moduleCount = await prisma.module.count();
    if (moduleCount === 0) {
      await initializeModules();
    }

    const modules = await prisma.module.findMany({
      orderBy: { name: "asc" },
    });

    spinner.succeed(`Found ${modules.length} module(s)`);

    if (modules.length === 0) {
      notice("No modules found. Run 'sync' to initialize modules.", "warning");
      return;
    }

    separator();

    const table = createTable(
      ["Key", "Name", "Description", "Status", "Config"],
      { colWidths: [15, 20, 35, 12, 20] }
    );

    modules.forEach((m) => {
      const status = m.enabled ? chalk.green("✓ Enabled") : chalk.gray("✗ Disabled");
      const configStr = m.config ? JSON.stringify(m.config).substring(0, 18) + "..." : "-";
      table.push([
        m.key,
        m.name,
        m.description || "-",
        status,
        configStr,
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load modules");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleEnable() {
  if (commandArgs.length < 2) {
    console.error("Usage: enable <module-key>");
    console.error(`\nAvailable module keys: ${Object.values(MODULE_KEYS).join(", ")}`);
    process.exit(1);
  }

  const moduleKey = commandArgs[1];

  if (!Object.values(MODULE_KEYS).includes(moduleKey as any)) {
    console.error(`Invalid module key: ${moduleKey}`);
    console.error(`\nAvailable module keys: ${Object.values(MODULE_KEYS).join(", ")}`);
    process.exit(1);
  }

  const spinner = createSpinner("Enabling module...");
  spinner.start();

  try {
    // Ensure module exists
    await initializeModules();

    const moduleData = await prisma.module.update({
      where: { key: moduleKey },
      data: { enabled: true },
      select: {
        id: true,
        key: true,
        name: true,
        enabled: true,
      },
    });

    spinner.succeed("Module enabled");
    console.log(`\n✅ Module "${moduleData.name}" (${moduleData.key}) has been enabled.`);
  } catch (err) {
    spinner.fail("Failed to enable module");
    if (err instanceof Error && err.message.includes("Record to update does not exist")) {
      error(`Module "${moduleKey}" not found. Run 'sync' to initialize modules.`);
    } else {
      error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

async function handleDisable() {
  if (commandArgs.length < 2) {
    console.error("Usage: disable <module-key>");
    console.error(`\nAvailable module keys: ${Object.values(MODULE_KEYS).join(", ")}`);
    process.exit(1);
  }

  const moduleKey = commandArgs[1];

  if (!Object.values(MODULE_KEYS).includes(moduleKey as any)) {
    console.error(`Invalid module key: ${moduleKey}`);
    console.error(`\nAvailable module keys: ${Object.values(MODULE_KEYS).join(", ")}`);
    process.exit(1);
  }

  const spinner = createSpinner("Disabling module...");
  spinner.start();

  try {
    const moduleData = await prisma.module.update({
      where: { key: moduleKey },
      data: { enabled: false },
      select: {
        id: true,
        key: true,
        name: true,
        enabled: true,
      },
    });

    spinner.succeed("Module disabled");
    console.log(`\n✅ Module "${moduleData.name}" (${moduleData.key}) has been disabled.`);
  } catch (err) {
    spinner.fail("Failed to disable module");
    if (err instanceof Error && err.message.includes("Record to update does not exist")) {
      error(`Module "${moduleKey}" not found. Run 'sync' to initialize modules.`);
    } else {
      error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <module-key>");
    console.error(`\nAvailable module keys: ${Object.values(MODULE_KEYS).join(", ")}`);
    process.exit(1);
  }

  const moduleKey = commandArgs[1];

  const spinner = createSpinner("Loading module details...");
  spinner.start();

  try {
    const moduleData = await prisma.module.findUnique({
      where: { key: moduleKey },
    });

    spinner.succeed("Module details loaded");

    if (!moduleData) {
      error(`Module "${moduleKey}" not found. Run 'sync' to initialize modules.`);
      process.exit(1);
    }

    separator();
    sectionHeader("Module Details");
    displayKeyValue("ID", moduleData.id);
    displayKeyValue("Key", moduleData.key);
    displayKeyValue("Name", moduleData.name);
    displayKeyValue("Description", moduleData.description || "-");
    displayKeyValue("Status", moduleData.enabled ? chalk.green("Enabled") : chalk.gray("Disabled"));
    displayKeyValue("Config", moduleData.config ? JSON.stringify(moduleData.config, null, 2) : "-");
    displayKeyValue("Created", moduleData.createdAt.toLocaleString());
    displayKeyValue("Updated", moduleData.updatedAt.toLocaleString());
  } catch (err) {
    spinner.fail("Failed to load module details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleConfig() {
  if (commandArgs.length < 2) {
    console.error("Usage: config <module-key> [config-json]");
    console.error(`\nAvailable module keys: ${Object.values(MODULE_KEYS).join(", ")}`);
    process.exit(1);
  }

  const moduleKey = commandArgs[1];
  let configJson: any = null;

  if (commandArgs.length >= 3) {
    try {
      configJson = JSON.parse(commandArgs.slice(2).join(" "));
    } catch (err) {
      console.error("Invalid JSON format for config");
      process.exit(1);
    }
  } else {
    // Interactive mode - get current config and allow editing
    const moduleData = await prisma.module.findUnique({
      where: { key: moduleKey },
      select: { config: true },
    });

    if (!moduleData) {
      error(`Module "${moduleKey}" not found. Run 'sync' to initialize modules.`);
      process.exit(1);
    }

    const currentConfig = moduleData.config ? JSON.stringify(moduleData.config, null, 2) : "{}";
    const configInput = await prompt("Enter config JSON (press Enter to keep current):", {
      default: currentConfig,
    });

    try {
      configJson = configInput.trim() ? JSON.parse(configInput) : moduleData.config;
    } catch (err) {
      error("Invalid JSON format");
      process.exit(1);
    }
  }

  const spinner = createSpinner("Updating module config...");
  spinner.start();

  try {
    const moduleData = await prisma.module.update({
      where: { key: moduleKey },
      data: { config: configJson },
      select: {
        key: true,
        name: true,
        config: true,
      },
    });

    spinner.succeed("Module config updated");
    console.log(`\n✅ Config for "${moduleData.name}" (${moduleData.key}) has been updated.`);
    console.log(`\nConfig: ${JSON.stringify(moduleData.config, null, 2)}`);
  } catch (err) {
    spinner.fail("Failed to update module config");
    if (err instanceof Error && err.message.includes("Record to update does not exist")) {
      error(`Module "${moduleKey}" not found. Run 'sync' to initialize modules.`);
    } else {
      error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

async function handleStatus() {
  const spinner = createSpinner("Loading module status...");
  spinner.start();

  try {
    // Initialize modules if they don't exist
    const moduleCount = await prisma.module.count();
    if (moduleCount === 0) {
      await initializeModules();
    }

    const modules = await prisma.module.findMany({
      orderBy: { name: "asc" },
    });

    spinner.succeed("Module status loaded");

    const enabledCount = modules.filter((m) => m.enabled).length;
    const disabledCount = modules.length - enabledCount;

    separator();
    sectionHeader("Module Status Overview");
    displayKeyValue("Total Modules", modules.length.toString());
    displayKeyValue("Enabled", chalk.green(enabledCount.toString()));
    displayKeyValue("Disabled", chalk.gray(disabledCount.toString()));

    separator();
    sectionHeader("Module Status Details");

    modules.forEach((m) => {
      const status = m.enabled ? chalk.green("✓") : chalk.gray("✗");
      console.log(`${status} ${m.name.padEnd(20)} (${m.key})`);
    });
  } catch (err) {
    spinner.fail("Failed to load module status");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleSync() {
  const spinner = createSpinner("Syncing modules...");
  spinner.start();

  try {
    await initializeModules();

    const modules = await prisma.module.findMany({
      orderBy: { name: "asc" },
    });

    spinner.succeed(`Synced ${modules.length} module(s)`);

    separator();
    sectionHeader("Synced Modules");
    modules.forEach((m) => {
      const status = m.enabled ? chalk.green("✓ Enabled") : chalk.gray("✗ Disabled");
      console.log(`${status} ${m.name.padEnd(20)} (${m.key})`);
    });

    success("Modules have been synced with code definitions.");
  } catch (err) {
    spinner.fail("Failed to sync modules");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function initializeModules() {
  const modules = Object.values(MODULE_CONFIG);

  for (const moduleConfig of modules) {
    await prisma.module.upsert({
      where: { key: moduleConfig.key },
      update: {
        name: moduleConfig.name,
        description: moduleConfig.description,
      },
      create: {
        key: moduleConfig.key,
        name: moduleConfig.name,
        description: moduleConfig.description,
        enabled: moduleConfig.defaultEnabled,
      },
    });
  }

  // Clean up unused modules
  const validModuleKeys = new Set(Object.keys(MODULE_CONFIG));
  const allModules = await prisma.module.findMany();

  const modulesToDelete = allModules.filter(
    (moduleData) => !validModuleKeys.has(moduleData.key)
  );

  if (modulesToDelete.length > 0) {
    await prisma.module.deleteMany({
      where: {
        key: {
          in: modulesToDelete.map((m) => m.key),
        },
      },
    });
  }
}

// Interactive versions
export async function handleListInteractive() {
  try {
    header("List Modules", "View all modules and their status");
    await handleList();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleEnableInteractive() {
  try {
    header("Enable Module", "Enable a system module");

    await handleList();
    separator();

    const moduleKey = await select(
      "Select module to enable:",
      Object.values(MODULE_KEYS),
      Object.values(MODULE_KEYS).map((key) => {
        const config = MODULE_CONFIG[key as keyof typeof MODULE_CONFIG];
        return `${config.name} (${key})`;
      })
    );

    commandArgs.length = 0;
    commandArgs.push("enable", moduleKey);
    await handleEnable();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleDisableInteractive() {
  try {
    header("Disable Module", "Disable a system module");

    await handleList();
    separator();

    const moduleKey = await select(
      "Select module to disable:",
      Object.values(MODULE_KEYS),
      Object.values(MODULE_KEYS).map((key) => {
        const config = MODULE_CONFIG[key as keyof typeof MODULE_CONFIG];
        return `${config.name} (${key})`;
      })
    );

    commandArgs.length = 0;
    commandArgs.push("disable", moduleKey);
    await handleDisable();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleShowInteractive() {
  try {
    header("Show Module Details", "View detailed module information");

    await handleList();
    separator();

    const moduleKey = await select(
      "Select module to view:",
      Object.values(MODULE_KEYS),
      Object.values(MODULE_KEYS).map((key) => {
        const config = MODULE_CONFIG[key as keyof typeof MODULE_CONFIG];
        return `${config.name} (${key})`;
      })
    );

    commandArgs.length = 0;
    commandArgs.push("show", moduleKey);
    await handleShow();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleConfigInteractive() {
  try {
    header("Configure Module", "Update module configuration");

    await handleList();
    separator();

    const moduleKey = await select(
      "Select module to configure:",
      Object.values(MODULE_KEYS),
      Object.values(MODULE_KEYS).map((key) => {
        const config = MODULE_CONFIG[key as keyof typeof MODULE_CONFIG];
        return `${config.name} (${key})`;
      })
    );

    commandArgs.length = 0;
    commandArgs.push("config", moduleKey);
    await handleConfig();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleStatusInteractive() {
  try {
    header("Module Status", "View overall module status");
    await handleStatus();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleSyncInteractive() {
  try {
    header("Sync Modules", "Sync modules from code definitions");

    const confirmed = await confirm(
      "This will sync modules from code definitions. Continue?",
      true
    );

    if (!confirmed) {
      notice("Sync cancelled.", "info");
      return;
    }

    await handleSync();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}
