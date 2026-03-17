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
 *   pnpm cli db favicons-to-png      Convert uploaded favicons to .png and update links
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
import { parseFlags } from "./cli-core";
import chalk from "chalk";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

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
  favicons-to-png          Convert uploaded favicons to .png and update links

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
        case "favicons-to-png":
          await handleFaviconsToPng();
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
  const parsed = parseFlags(commandArgs.slice(1));
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
      ticketCount,
      todoCount,
      timeEntryCount,
      sessionCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.ticket.count(),
      prisma.todo.count(),
      prisma.timeEntry.count(),
      prisma.session.count(),
    ]);

    spinner.succeed("Database statistics calculated");

    separator();
    sectionHeader("Database Statistics");
    displayKeyValue("Users", userCount.toString());
    displayKeyValue("Tickets", ticketCount.toString());
    displayKeyValue("Todos", todoCount.toString());
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

    // Check for orphaned sessions (sessions with userId that doesn't exist in users table)
    // Since Session.user is a required relation with cascade delete, this shouldn't happen,
    // but we check using a raw query to be safe
    const orphanedSessionsResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM sessions s
      WHERE NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = s."userId"
      )
    `;
    const orphanedSessions = Number(orphanedSessionsResult[0]?.count || 0);

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

/**
 * Convert all non-.png favicon files under public/uploads/favicons to .png
 * and update Link.favicon paths accordingly.
 *
 * Usage:
 *   pnpm cli db favicons-to-png
 */
async function handleFaviconsToPng() {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "favicons");

  try {
    await fs.access(uploadsDir);
  } catch {
    warning(`Favicon uploads directory not found at ${uploadsDir}`);
    return;
  }

  separator();
  sectionHeader("Favicon Conversion");
  info(`This will scan ${uploadsDir} for non-.png files, create .png versions, and update link records.`);

  const proceed = await confirm("Proceed with converting favicons to .png?");
  if (!proceed) {
    notice("Aborted favicon conversion.", "info");
    return;
  }

  const spinner = createSpinner("Converting favicons to .png...");
  spinner.start();

  try {
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile());

    let convertedFiles = 0;
    let updatedLinks = 0;

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (ext === ".png") continue;

      const inputPath = path.join(uploadsDir, file.name);
      const base = path.basename(file.name, ext);
      const pngName = `${base}.png`;
      const pngPath = path.join(uploadsDir, pngName);

      try {
        const pngBuffer = await sharp(inputPath)
          .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        await fs.writeFile(pngPath, pngBuffer);
        convertedFiles += 1;

        const oldRel = `/uploads/favicons/${file.name}`;
        const newRel = `/uploads/favicons/${pngName}`;

        const result = await prisma.link.updateMany({
          where: { favicon: oldRel },
          data: { favicon: newRel },
        });
        updatedLinks += result.count;

        spinner.text = `Converted ${convertedFiles} file(s), updated ${updatedLinks} link(s)...`;
      } catch (err) {
        warning(
          `Failed to convert ${file.name} to .png: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    spinner.succeed("Favicon conversion completed");
    separator();
    sectionHeader("Favicon Conversion Summary");
    displayKeyValue("Files converted", convertedFiles.toString());
    displayKeyValue("Links updated", updatedLinks.toString());
  } catch (err) {
    spinner.fail("Favicon conversion failed");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
