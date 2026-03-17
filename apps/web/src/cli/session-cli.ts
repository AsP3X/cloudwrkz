#!/usr/bin/env node

/**
 * Session Management CLI Tool
 * 
 * Usage:
 *   pnpm cli session list [--user=EMAIL] [--active] [--expired]
 *   pnpm cli session show <id>
 *   pnpm cli session revoke <id>
 *   pnpm cli session revoke-user <email>
 *   pnpm cli session revoke-all
 *   pnpm cli session cleanup
 *   pnpm cli session stats
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
  waitForEnter,
  paginatedSelect,
} from "./prompts";
import { parseFlags } from "./cli-core";
import chalk from "chalk";

const args = process.argv.slice(2);
const commandArgs = args[0] === "session" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("session-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Session Management CLI Tool

Commands:
  list [--user=EMAIL] [--active] [--expired]  List sessions with filters
  show <id>                                    Show session details
  revoke <id>                                  Revoke a specific session
  revoke-user <email>                          Revoke all sessions for a user
  revoke-all                                   Revoke all sessions (with confirmation)
  cleanup                                      Remove expired sessions
  stats                                        Show session statistics

Examples:
  pnpm cli session list
  pnpm cli session list --user=user@example.com
  pnpm cli session list --active
  pnpm cli session list --expired
  pnpm cli session show <session-id>
  pnpm cli session revoke <session-id>
  pnpm cli session revoke-user user@example.com
  pnpm cli session revoke-all
  pnpm cli session cleanup
  pnpm cli session stats
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
        case "show":
          await handleShow();
          break;
        case "revoke":
          await handleRevoke();
          break;
        case "revoke-user":
          await handleRevokeUser();
          break;
        case "revoke-all":
          await handleRevokeAll();
          break;
        case "cleanup":
          await handleCleanup();
          break;
        case "stats":
          await handleStats();
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
  const parsed = parseFlags(commandArgs.slice(1));
  const userEmail = parsed.user as string | undefined;
  const activeOnly = parsed.active === true;
  const expiredOnly = parsed.expired === true;

  const spinner = createSpinner("Loading sessions...");
  spinner.start();

  try {
    const where: any = {};

    if (userEmail) {
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id: true },
      });

      if (!user) {
        spinner.fail("User not found");
        error(`User with email ${userEmail} not found`);
        process.exit(1);
      }

      where.userId = user.id;
    }

    if (activeOnly) {
      where.expiresAt = { gt: new Date() };
    } else if (expiredOnly) {
      where.expiresAt = { lte: new Date() };
    }

    const sessions = await prisma.session.findMany({
      where,
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
        deviceName: true,
        deviceType: true,
        deviceOs: true,
        deviceBrowser: true,
        ipAddress: true,
        user: {
          select: {
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000, // Limit to prevent huge lists
    });

    spinner.succeed(`Found ${sessions.length} session(s)`);

    if (sessions.length === 0) {
      notice("No sessions found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["ID", "User", "Email", "Role", "Device", "IP", "Created", "Expires", "Status"],
      { colWidths: [10, 18, 22, 10, 18, 14, 18, 18, 10] }
    );

    const now = new Date();
    sessions.forEach((s) => {
      const isExpired = s.expiresAt <= now;
      const status = isExpired ? chalk.gray("Expired") : chalk.green("Active");
      const expiresStr = s.expiresAt.toLocaleString();
      const createdStr = s.createdAt.toLocaleString();
      const userName = s.user.name || "-";
      const shortId = s.id.substring(0, 8) + "...";
      const deviceParts: string[] = [];
      if (s.deviceName) deviceParts.push(s.deviceName);
      else {
        if (s.deviceType) deviceParts.push(s.deviceType);
        if (s.deviceOs) deviceParts.push(s.deviceOs);
        if (s.deviceBrowser) deviceParts.push(s.deviceBrowser);
      }
      const device = deviceParts.length ? deviceParts.join(" / ") : "-";
      const ip = s.ipAddress || "-";

      table.push([
        shortId,
        userName,
        s.user.email,
        s.user.role,
        device,
        ip,
        createdStr,
        expiresStr,
        status,
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load sessions");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <session-id>");
    process.exit(1);
  }

  const sessionId = commandArgs[1];

  const spinner = createSpinner("Loading session details...");
  spinner.start();

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        token: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        deviceId: true,
        deviceName: true,
        deviceType: true,
        deviceOs: true,
        deviceBrowser: true,
        userAgent: true,
        ipAddress: true,
      },
    });

    spinner.succeed("Session details loaded");

    if (!session) {
      error(`Session with ID ${sessionId} not found`);
      process.exit(1);
    }

    const now = new Date();
    const isExpired = session.expiresAt <= now;
    const timeRemaining = isExpired
      ? "Expired"
      : formatDuration(session.expiresAt.getTime() - now.getTime());

    separator();
    sectionHeader("Session Details");
    displayKeyValue("ID", session.id);
    displayKeyValue("Token", session.token.substring(0, 20) + "...");
    displayKeyValue("User", session.user.name || "-");
    displayKeyValue("Email", session.user.email);
    displayKeyValue("Role", session.user.role);
    displayKeyValue("User Status", session.user.status);
    displayKeyValue("Device Name", session.deviceName || "-");
    displayKeyValue("Device Type", session.deviceType || "-");
    displayKeyValue("Device OS", session.deviceOs || "-");
    displayKeyValue("Device Browser", session.deviceBrowser || "-");
    displayKeyValue("Device ID", session.deviceId || "-");
    displayKeyValue("IP Address", session.ipAddress || "-");
    if (session.userAgent) {
      displayKeyValue("User Agent", session.userAgent);
    }
    displayKeyValue("Created", session.createdAt.toLocaleString());
    displayKeyValue("Updated", session.updatedAt.toLocaleString());
    displayKeyValue("Expires", session.expiresAt.toLocaleString());
    displayKeyValue("Status", isExpired ? chalk.gray("Expired") : chalk.green("Active"));
    if (!isExpired) {
      displayKeyValue("Time Remaining", timeRemaining);
    }
  } catch (err) {
    spinner.fail("Failed to load session details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleRevoke() {
  if (commandArgs.length < 2) {
    console.error("Usage: revoke <session-id>");
    process.exit(1);
  }

  const sessionId = commandArgs[1];

  const spinner = createSpinner("Revoking session...");
  spinner.start();

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!session) {
      spinner.fail("Session not found");
      error(`Session with ID ${sessionId} not found`);
      process.exit(1);
    }

    await prisma.session.delete({
      where: { id: sessionId },
    });

    spinner.succeed("Session revoked");
    console.log(
      `\n✅ Session for ${session.user.email}${session.user.name ? ` (${session.user.name})` : ""} has been revoked.`
    );
  } catch (err) {
    spinner.fail("Failed to revoke session");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleRevokeUser() {
  if (commandArgs.length < 2) {
    console.error("Usage: revoke-user <email>");
    process.exit(1);
  }

  const email = commandArgs[1];

  const spinner = createSpinner("Finding user...");
  spinner.start();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email ${email} not found`);
      process.exit(1);
    }

    if (user._count.sessions === 0) {
      spinner.succeed("No sessions found");
      notice(`User ${email} has no active sessions.`, "info");
      return;
    }

    spinner.text = `Revoking ${user._count.sessions} session(s)...`;

    const result = await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    spinner.succeed(`Revoked ${result.count} session(s)`);
    console.log(
      `\n✅ All sessions for ${user.email}${user.name ? ` (${user.name})` : ""} have been revoked.`
    );
  } catch (err) {
    spinner.fail("Failed to revoke user sessions");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function handleRevokeAll() {
  const confirmed = await confirm(
    "⚠️  WARNING: This will revoke ALL sessions for ALL users. Continue?",
    false
  );

  if (!confirmed) {
    notice("Operation cancelled.", "info");
    return;
  }

  const spinner = createSpinner("Counting sessions...");
  spinner.start();

  try {
    const count = await prisma.session.count();
    spinner.text = `Revoking ${count} session(s)...`;

    const result = await prisma.session.deleteMany({});

    spinner.succeed(`Revoked ${result.count} session(s)`);
    console.log(`\n✅ All ${result.count} session(s) have been revoked.`);
    warning("All users will need to log in again.");
  } catch (err) {
    spinner.fail("Failed to revoke all sessions");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleCleanup() {
  const spinner = createSpinner("Finding expired sessions...");
  spinner.start();

  try {
    const now = new Date();
    const count = await prisma.session.count({
      where: {
        expiresAt: { lte: now },
      },
    });

    if (count === 0) {
      spinner.succeed("No expired sessions found");
      notice("No expired sessions to clean up.", "info");
      return;
    }

    spinner.text = `Removing ${count} expired session(s)...`;

    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    });

    spinner.succeed(`Removed ${result.count} expired session(s)`);
    console.log(`\n✅ Cleaned up ${result.count} expired session(s).`);
  } catch (err) {
    spinner.fail("Failed to cleanup expired sessions");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleStats() {
  const spinner = createSpinner("Calculating statistics...");
  spinner.start();

  try {
    const now = new Date();

    const [
      totalSessions,
      activeSessions,
      expiredSessions,
      sessionsByUser,
      recentSessions,
    ] = await Promise.all([
      prisma.session.count(),
      prisma.session.count({
        where: { expiresAt: { gt: now } },
      }),
      prisma.session.count({
        where: { expiresAt: { lte: now } },
      }),
      prisma.session.groupBy({
        by: ["userId"],
        _count: {
          userId: true,
        },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      }),
      prisma.session.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    spinner.succeed("Statistics calculated");

    separator();
    sectionHeader("Session Statistics");
    displayKeyValue("Total Sessions", totalSessions.toString());
    displayKeyValue("Active Sessions", chalk.green(activeSessions.toString()));
    displayKeyValue("Expired Sessions", chalk.gray(expiredSessions.toString()));
    displayKeyValue("Sessions (Last 24h)", recentSessions.toString());

    if (sessionsByUser.length > 0) {
      separator();
      sectionHeader("Top Users by Session Count");
      for (const item of sessionsByUser.slice(0, 5)) {
        const user = await prisma.user.findUnique({
          where: { id: item.userId },
          select: { email: true, name: true },
        });
        const userName = user ? `${user.email}${user.name ? ` (${user.name})` : ""}` : item.userId;
        console.log(chalk.gray(`${userName.padEnd(40)} ${item._count.userId} session(s)`));
      }
    }
  } catch (err) {
    spinner.fail("Failed to calculate statistics");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Interactive versions
export async function handleListInteractive() {
  try {
    header("List Sessions", "View all sessions with filters");
    await handleList();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleShowInteractive() {
  try {
    header("Show Session Details", "View detailed session information");

    const sessions = await prisma.session.findMany({
      take: 50,
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (sessions.length === 0) {
      notice("No sessions found.", "info");
      return;
    }

    const selected = await paginatedSelect(
      "Select session to view:",
      sessions,
      (s, index) => {
        const now = new Date();
        const isExpired = s.expiresAt <= now;
        const status = isExpired ? chalk.gray("Expired") : chalk.green("Active");
        return `${index + 1}. ${s.user.email} - ${status} - ${s.createdAt.toLocaleString()}`;
      },
      { pageSize: 15 }
    );

    if (!selected) return;

    commandArgs.length = 0;
    commandArgs.push("show", selected.id);
    await handleShow();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleRevokeInteractive() {
  try {
    header("Revoke Session", "Revoke a specific session");

    const sessions = await prisma.session.findMany({
      where: {
        expiresAt: { gt: new Date() }, // Only show active sessions
      },
      take: 50,
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (sessions.length === 0) {
      notice("No active sessions found.", "info");
      return;
    }

    const selected = await paginatedSelect(
      "Select session to revoke:",
      sessions,
      (s, index) => {
        return `${index + 1}. ${s.user.email}${s.user.name ? ` (${s.user.name})` : ""} - ${s.createdAt.toLocaleString()}`;
      },
      { pageSize: 15 }
    );

    if (!selected) return;

    const confirmed = await confirm(`Revoke session for ${selected.user.email}?`, false);
    if (!confirmed) {
      notice("Operation cancelled.", "info");
      return;
    }

    commandArgs.length = 0;
    commandArgs.push("revoke", selected.id);
    await handleRevoke();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleRevokeUserInteractive() {
  try {
    header("Revoke User Sessions", "Revoke all sessions for a user");

    const email = await prompt("Enter user email:", { required: true });

    commandArgs.length = 0;
    commandArgs.push("revoke-user", email);
    await handleRevokeUser();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleCleanupInteractive() {
  try {
    header("Cleanup Expired Sessions", "Remove all expired sessions");

    const confirmed = await confirm("Remove all expired sessions?", true);
    if (!confirmed) {
      notice("Operation cancelled.", "info");
      return;
    }

    await handleCleanup();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleStatsInteractive() {
  try {
    header("Session Statistics", "View session statistics");
    await handleStats();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}
