#!/usr/bin/env node

/**
 * Database Maintenance CLI Tool
 * 
 * Usage:
 *   pnpm cli db status
 *   pnpm cli db migrate [--dry-run]
 *   pnpm cli db seed [--module=MODULE]
 *   pnpm cli db cleanup [--expired-sessions] [--old-tickets] [--soft-deleted-users]
 *   pnpm cli db optimize
 *   pnpm cli db stats
 *   pnpm cli db validate
 */

import { prisma } from "../lib/db/prisma";
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
const commandArgs = args[0] === "db" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("db-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Database Maintenance CLI Tool

Commands:
  status                    Database connection and health
  migrate [--dry-run]       Run migrations (use pnpm db:migrate)
  seed [--module=MODULE]    Seed data (use pnpm db:seed-permissions)
  cleanup [--expired-sessions] [--old-tickets] [--soft-deleted-users]  Cleanup old data
  optimize                  Run database optimization
  stats                     Database statistics (tables, sizes, etc.)
  validate                  Validate data integrity

Examples:
  pnpm cli db status
  pnpm cli db cleanup --expired-sessions
  pnpm cli db stats
`);
  process.exit(0);
}

const command = commandArgs[0];

if (shouldExecute && command) {
  async function main() {
    try {
      switch (command) {
        case "status":
          await handleStatus();
          break;
        case "migrate":
          await handleMigrate();
          break;
        case "seed":
          await handleSeed();
          break;
        case "cleanup":
          await handleCleanup();
          break;
        case "optimize":
          await handleOptimize();
          break;
        case "stats":
          await handleStats();
          break;
        case "validate":
          await handleValidate();
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

async function handleStatus() {
  const spinner = createSpinner("Checking database connection...");
  spinner.start();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();

    spinner.succeed("Database connection successful");

    separator();
    sectionHeader("Database Status");
    displayKeyValue("Status", chalk.green("Connected"));
    displayKeyValue("Provider", "PostgreSQL");
    displayKeyValue("Test Query", "Success");
    displayKeyValue("Sample Count", `${userCount} user(s) found`);
  } catch (err) {
    spinner.fail("Database connection failed");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleMigrate() {
  notice("Use 'pnpm db:migrate' to run migrations. This command is a placeholder.", "info");
}

async function handleSeed() {
  notice("Use 'pnpm db:seed-permissions' to seed permissions. This command is a placeholder.", "info");
}

async function handleCleanup() {
  const parsed = parseArgs(commandArgs.slice(1));
  const expiredSessions = parsed["expired-sessions"] === true;
  const oldTickets = parsed["old-tickets"] === true;
  const softDeletedUsers = parsed["soft-deleted-users"] === true;

  if (!expiredSessions && !oldTickets && !softDeletedUsers) {
    notice("No cleanup options specified. Use --expired-sessions, --old-tickets, or --soft-deleted-users", "info");
    return;
  }

  const spinner = createSpinner("Cleaning up...");
  spinner.start();

  try {
    let cleaned = 0;

    if (expiredSessions) {
      const now = new Date();
      const result = await prisma.session.deleteMany({
        where: {
          expiresAt: { lte: now },
        },
      });
      cleaned += result.count;
      spinner.text = `Cleaned ${cleaned} expired session(s)...`;
    }

    // Add more cleanup operations as needed

    spinner.succeed(`Cleanup completed`);
    console.log(`\n✅ Cleaned up ${cleaned} item(s).`);
  } catch (err) {
    spinner.fail("Cleanup failed");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleOptimize() {
  notice("Database optimization - use database-specific tools (VACUUM, ANALYZE, etc.)", "info");
}

async function handleStats() {
  const spinner = createSpinner("Calculating database statistics...");
  spinner.start();

  try {
    const [
      userCount,
      projectCount,
      ticketCount,
      taskCount,
      timeEntryCount,
      sessionCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.ticket.count(),
      prisma.task.count(),
      prisma.timeEntry.count(),
      prisma.session.count(),
    ]);

    spinner.succeed("Database statistics calculated");

    separator();
    sectionHeader("Database Statistics");
    displayKeyValue("Users", userCount.toString());
    displayKeyValue("Projects", projectCount.toString());
    displayKeyValue("Tickets", ticketCount.toString());
    displayKeyValue("Tasks", taskCount.toString());
    displayKeyValue("Time Entries", timeEntryCount.toString());
    displayKeyValue("Sessions", sessionCount.toString());
  } catch (err) {
    spinner.fail("Failed to calculate database statistics");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleValidate() {
  const spinner = createSpinner("Validating data integrity...");
  spinner.start();

  try {
    // Basic validation checks
    const orphanedTickets = await prisma.ticket.count({
      where: {
        createdById: { not: null },
        createdBy: null,
      },
    });

    const orphanedSessions = await prisma.session.count({
      where: {
        user: null,
      },
    });

    spinner.succeed("Validation completed");

    separator();
    sectionHeader("Data Integrity Validation");
    
    if (orphanedTickets === 0 && orphanedSessions === 0) {
      success("No data integrity issues found.");
    } else {
      warning("Some data integrity issues found:");
      if (orphanedTickets > 0) {
        displayKeyValue("Orphaned Tickets", orphanedTickets.toString());
      }
      if (orphanedSessions > 0) {
        displayKeyValue("Orphaned Sessions", orphanedSessions.toString());
      }
    }
  } catch (err) {
    spinner.fail("Validation failed");
    error(err instanceof Error ? err.message : String(err));
  }
}
