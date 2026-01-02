#!/usr/bin/env node

/**
 * Statistics & Analytics CLI Tool
 * 
 * Usage:
 *   pnpm cli stats overview
 *   pnpm cli stats users [--period=WEEK|MONTH|YEAR]
 *   pnpm cli stats tickets [--period=PERIOD] [--status=STATUS]
 *   pnpm cli stats time [--user=EMAIL] [--period=PERIOD]
 *   pnpm cli stats export [--type=TYPE] [--format=CSV|JSON] [--output=FILE]
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
const commandArgs = args[0] === "stats" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("stats-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Statistics & Analytics CLI Tool

Commands:
  overview                    System-wide statistics overview
  users [--period=WEEK|MONTH|YEAR]  User statistics
  tickets [--period=PERIOD] [--status=STATUS]  Ticket statistics
  time [--user=EMAIL] [--period=PERIOD]  Time tracking statistics
  export [--type=TYPE] [--format=CSV|JSON] [--output=FILE]  Export statistics

Examples:
  pnpm cli stats overview
  pnpm cli stats users --period=MONTH
  pnpm cli stats tickets --period=WEEK
`);
  process.exit(0);
}

const command = commandArgs[0];

if (shouldExecute && command) {
  async function main() {
    try {
      switch (command) {
        case "overview":
          await handleOverview();
          break;
        case "users":
          await handleUsers();
          break;
        case "tickets":
          await handleTickets();
          break;
        case "time":
          await handleTime();
          break;
        case "export":
          await handleExport();
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

async function handleOverview() {
  const spinner = createSpinner("Calculating statistics...");
  spinner.start();

  try {
    const [
      userCount,
      activeUsers,
      ticketCount,
      openTickets,
      timeEntryCount,
      totalTime,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.timeEntry.count(),
      prisma.timeEntry.aggregate({
        _sum: { totalDuration: true },
      }),
    ]);

    spinner.succeed("Statistics calculated");

    separator();
    sectionHeader("System Overview");
    displayKeyValue("Total Users", userCount.toString());
    displayKeyValue("Active Users", activeUsers.toString());
    displayKeyValue("Total Tickets", ticketCount.toString());
    displayKeyValue("Open Tickets", openTickets.toString());
    displayKeyValue("Time Entries", timeEntryCount.toString());
    displayKeyValue("Total Time Tracked", formatDuration(totalTime._sum.totalDuration || 0));
  } catch (err) {
    spinner.fail("Failed to calculate statistics");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleUsers() {
  const parsed = parseArgs(commandArgs.slice(1));
  const period = (parsed.period as string) || "ALL";

  const spinner = createSpinner("Calculating user statistics...");
  spinner.start();

  try {
    const where: any = {};
    if (period !== "ALL") {
      const now = new Date();
      let startDate: Date;
      if (period === "WEEK") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "MONTH") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === "YEAR") {
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(0);
      }
      where.createdAt = { gte: startDate };
    }

    const [total, byStatus, byRole] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      prisma.user.groupBy({
        by: ["role"],
        where,
        _count: true,
      }),
    ]);

    spinner.succeed("User statistics calculated");

    separator();
    sectionHeader(`User Statistics${period !== "ALL" ? ` (${period})` : ""}`);
    displayKeyValue("Total Users", total.toString());

    separator();
    sectionHeader("By Status");
    byStatus.forEach((item) => {
      displayKeyValue(item.status, item._count.toString());
    });

    separator();
    sectionHeader("By Role");
    byRole.forEach((item) => {
      displayKeyValue(item.role, item._count.toString());
    });
  } catch (err) {
    spinner.fail("Failed to calculate user statistics");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleTickets() {
  const parsed = parseArgs(commandArgs.slice(1));
  const period = parsed.period as string | undefined;
  const status = parsed.status as string | undefined;

  const spinner = createSpinner("Calculating ticket statistics...");
  spinner.start();

  try {
    const where: any = {};
    if (status) where.status = status;
    if (period) {
      const now = new Date();
      let startDate: Date;
      if (period === "WEEK") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "MONTH") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(0);
      }
      where.createdAt = { gte: startDate };
    }

    const [total, byStatus, byPriority, byType] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ["priority"],
        where,
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ["type"],
        where,
        _count: true,
      }),
    ]);

    spinner.succeed("Ticket statistics calculated");

    separator();
    sectionHeader(`Ticket Statistics${period ? ` (${period})` : ""}`);
    displayKeyValue("Total Tickets", total.toString());

    separator();
    sectionHeader("By Status");
    byStatus.forEach((item) => {
      displayKeyValue(item.status, item._count.toString());
    });

    separator();
    sectionHeader("By Priority");
    byPriority.forEach((item) => {
      displayKeyValue(item.priority, item._count.toString());
    });

    separator();
    sectionHeader("By Type");
    byType.forEach((item) => {
      displayKeyValue(item.type, item._count.toString());
    });
  } catch (err) {
    spinner.fail("Failed to calculate ticket statistics");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleTime() {
  const parsed = parseArgs(commandArgs.slice(1));
  const userEmail = parsed.user as string | undefined;
  const period = parsed.period as string | undefined;

  const spinner = createSpinner("Calculating time statistics...");
  spinner.start();

  try {
    const where: any = {};
    if (userEmail) {
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id: true },
      });
      if (user) where.userId = user.id;
    }
    if (period) {
      const now = new Date();
      let startDate: Date;
      if (period === "WEEK") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "MONTH") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === "YEAR") {
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(0);
      }
      where.createdAt = { gte: startDate };
    }

    const [total, totalTime, byStatus] = await Promise.all([
      prisma.timeEntry.count({ where }),
      prisma.timeEntry.aggregate({
        where,
        _sum: { totalDuration: true },
      }),
      prisma.timeEntry.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
    ]);

    spinner.succeed("Time statistics calculated");

    separator();
    sectionHeader(`Time Statistics${period ? ` (${period})` : ""}`);
    displayKeyValue("Total Entries", total.toString());
    displayKeyValue("Total Time", formatDuration(totalTime._sum.totalDuration || 0));

    separator();
    sectionHeader("By Status");
    byStatus.forEach((item) => {
      displayKeyValue(item.status, item._count.toString());
    });
  } catch (err) {
    spinner.fail("Failed to calculate time statistics");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleExport() {
  notice("Export functionality - coming soon. Use individual stats commands and redirect output.", "info");
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
