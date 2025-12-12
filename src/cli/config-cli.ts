#!/usr/bin/env node

/**
 * Configuration Management CLI Tool
 * 
 * Usage:
 *   pnpm cli config list
 *   pnpm cli config get <key>
 *   pnpm cli config set <key> <value>
 *   pnpm cli config unset <key>
 *   pnpm cli config validate
 *   pnpm cli config export [--output=FILE]
 *   pnpm cli config import <file>
 */

import { prisma } from "../lib/db/prisma";
import { Prisma } from "@prisma/client";
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
} from "./prompts";
import chalk from "chalk";

const args = process.argv.slice(2);
const commandArgs = args[0] === "config" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("config-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Configuration Management CLI Tool

Commands:
  list                    List all configuration
  get <key>               Get configuration value
  set <key> <value>       Set configuration value
  unset <key>             Remove configuration
  validate                Validate configuration
  export [--output=FILE]  Export configuration
  import <file>           Import configuration

Note: This CLI manages module configurations stored in the database.
For environment variables, edit .env.local file.

Examples:
  pnpm cli config list
  pnpm cli config get tickets.maxTickets
  pnpm cli config set tickets.maxTickets 100
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
        case "get":
          await handleGet();
          break;
        case "set":
          await handleSet();
          break;
        case "unset":
          await handleUnset();
          break;
        case "validate":
          await handleValidate();
          break;
        case "export":
          await handleExport();
          break;
        case "import":
          await handleImport();
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

function parseArgs(args: string[]): { [key: string]: string | boolean } {
  const parsed: { [key: string]: string | boolean } = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.substring(2).split("=");
      parsed[key] = value !== undefined ? value : true;
    }
  }
  return parsed;
}

async function handleList() {
  const spinner = createSpinner("Loading configuration...");
  spinner.start();

  try {
    const modules = await prisma.module.findMany({
      where: {
        config: { not: Prisma.JsonNull },
      },
      select: {
        key: true,
        name: true,
        config: true,
      },
      orderBy: { key: "asc" },
    });

    spinner.succeed(`Found ${modules.length} module(s) with configuration`);

    if (modules.length === 0) {
      notice("No module configurations found.", "info");
      return;
    }

    separator();

    modules.forEach((m) => {
      sectionHeader(`${m.name} (${m.key})`);
      console.log(JSON.stringify(m.config, null, 2));
      separator();
    });
  } catch (err) {
    spinner.fail("Failed to load configuration");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleGet() {
  if (commandArgs.length < 2) {
    console.error("Usage: get <key>");
    console.error("Example: get tickets.maxTickets");
    process.exit(1);
  }

  const key = commandArgs[1];
  const [moduleKey, configKey] = key.split(".");

  const spinner = createSpinner("Getting configuration...");
  spinner.start();

  try {
    const moduleData = await prisma.module.findUnique({
      where: { key: moduleKey },
      select: { config: true },
    });

    if (!moduleData) {
      spinner.fail("Module not found");
      error(`Module "${moduleKey}" not found`);
      process.exit(1);
    }

    if (!moduleData.config) {
      spinner.succeed("No configuration found");
      notice(`Module "${moduleKey}" has no configuration`, "info");
      return;
    }

    const config = moduleData.config as any;
    const value = configKey ? config[configKey] : config;

    spinner.succeed("Configuration retrieved");

    separator();
    sectionHeader(`Configuration: ${key}`);
    if (value === undefined) {
      notice(`Configuration key "${configKey}" not found in module "${moduleKey}"`, "warning");
    } else {
      console.log(JSON.stringify(value, null, 2));
    }
  } catch (err) {
    spinner.fail("Failed to get configuration");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleSet() {
  if (commandArgs.length < 3) {
    console.error("Usage: set <key> <value>");
    console.error("Example: set tickets.maxTickets 100");
    process.exit(1);
  }

  const key = commandArgs[1];
  const value = commandArgs.slice(2).join(" ");
  const [moduleKey, configKey] = key.split(".");

  const spinner = createSpinner("Setting configuration...");
  spinner.start();

  try {
    const moduleData = await prisma.module.findUnique({
      where: { key: moduleKey },
      select: { config: true },
    });

    if (!moduleData) {
      spinner.fail("Module not found");
      error(`Module "${moduleKey}" not found`);
      process.exit(1);
    }

    let config = (moduleData.config as any) || {};
    let parsedValue: any;

    // Try to parse as JSON, otherwise use as string
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    if (configKey) {
      config[configKey] = parsedValue;
    } else {
      config = parsedValue;
    }

    await prisma.module.update({
      where: { key: moduleKey },
      data: { config },
    });

    spinner.succeed("Configuration updated");
    console.log(`\n✅ Configuration "${key}" has been set.`);
  } catch (err) {
    spinner.fail("Failed to set configuration");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleUnset() {
  if (commandArgs.length < 2) {
    console.error("Usage: unset <key>");
    console.error("Example: unset tickets.maxTickets");
    process.exit(1);
  }

  const key = commandArgs[1];
  const [moduleKey, configKey] = key.split(".");

  const spinner = createSpinner("Removing configuration...");
  spinner.start();

  try {
    const moduleData = await prisma.module.findUnique({
      where: { key: moduleKey },
      select: { config: true },
    });

    if (!moduleData || !moduleData.config) {
      spinner.fail("Configuration not found");
      error(`Configuration "${key}" not found`);
      process.exit(1);
    }

    const config = moduleData.config as any;

    if (configKey) {
      if (config[configKey] === undefined) {
        spinner.fail("Configuration key not found");
        error(`Configuration key "${configKey}" not found in module "${moduleKey}"`);
        process.exit(1);
      }
      delete config[configKey];
    } else {
      // Clear entire config
      await prisma.module.update({
        where: { key: moduleKey },
        data: { config: Prisma.JsonNull },
      });
      spinner.succeed("Configuration removed");
      console.log(`\n✅ Configuration for module "${moduleKey}" has been removed.`);
      return;
    }

    await prisma.module.update({
      where: { key: moduleKey },
      data: { config },
    });

    spinner.succeed("Configuration removed");
    console.log(`\n✅ Configuration "${key}" has been removed.`);
  } catch (err) {
    spinner.fail("Failed to remove configuration");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleValidate() {
  const spinner = createSpinner("Validating configuration...");
  spinner.start();

  try {
    const modules = await prisma.module.findMany({
      select: {
        key: true,
        name: true,
        config: true,
      },
    });

    let valid = true;
    const issues: string[] = [];

    for (const moduleData of modules) {
      if (moduleData.config) {
        try {
          JSON.parse(JSON.stringify(moduleData.config));
        } catch {
          valid = false;
          issues.push(`Module "${moduleData.key}" has invalid JSON configuration`);
        }
      }
    }

    spinner.succeed("Validation completed");

    separator();
    sectionHeader("Configuration Validation");
    if (valid && issues.length === 0) {
      success("All configurations are valid.");
    } else {
      warning("Configuration validation issues found:");
      issues.forEach((issue) => {
        console.log(chalk.yellow(`  - ${issue}`));
      });
    }
  } catch (err) {
    spinner.fail("Validation failed");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleExport() {
  notice("Export functionality - coming soon. Use 'list' command and redirect output.", "info");
}

async function handleImport() {
  notice("Import functionality - coming soon.", "info");
}
