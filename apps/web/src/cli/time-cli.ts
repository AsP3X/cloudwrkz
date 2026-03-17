#!/usr/bin/env node

/**
 * Time Tracking CLI Tool
 * 
 * Usage:
 *   pnpm cli time list [--user=EMAIL] [--date=DATE] [--status=STATUS]
 *   pnpm cli time show <id>
 *   pnpm cli time start [--description=DESC] [--task=TASK]
 *   pnpm cli time stop [--id=ID]
 *   pnpm cli time pause [--id=ID]
 *   pnpm cli time resume [--id=ID]
 *   pnpm cli time create <duration> [--description=DESC] [--date=DATE] [--task=TASK]
 *   pnpm cli time update <id> [--duration=DURATION] [--description=DESC] [--date=DATE]
 *   pnpm cli time delete <id>
 *   pnpm cli time export [--user=EMAIL] [--start-date=DATE] [--end-date=DATE] [--format=CSV|JSON]
 *   pnpm cli time report [--user=EMAIL] [--period=WEEK|MONTH|YEAR]
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

const args = process.argv.slice(2);
const commandArgs = args[0] === "time" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("time-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Time Tracking CLI Tool

Commands:
  list [--user=EMAIL] [--date=DATE] [--status=STATUS]  List time entries
  show <id>                                             Show time entry details
  start [--description=DESC] [--task=TASK]             Start a new time entry
  stop [--id=ID]                                        Stop current or specific entry
  pause [--id=ID]                                       Pause time entry
  resume [--id=ID]                                      Resume paused entry
  create <duration> [--description=DESC] [--date=DATE] [--task=TASK]  Create manual time entry
  update <id> [--duration=DURATION] [--description=DESC] [--date=DATE]  Update time entry
  delete <id>                                           Delete time entry
  export [--user=EMAIL] [--start-date=DATE] [--end-date=DATE] [--format=CSV|JSON]  Export time entries
  report [--user=EMAIL] [--period=WEEK|MONTH|YEAR]      Generate time report

Status: RUNNING, PAUSED, STOPPED, COMPLETED
Duration format: "2h 30m" or "150" (minutes)

Examples:
  pnpm cli time list
  pnpm cli time start --description="Working on feature"
  pnpm cli time stop
  pnpm cli time create "2h 30m" --description="Meeting"
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
        case "start":
          await handleStart();
          break;
        case "stop":
          await handleStop();
          break;
        case "pause":
          await handlePause();
          break;
        case "resume":
          await handleResume();
          break;
        case "create":
          await handleCreate();
          break;
        case "update":
          await handleUpdate();
          break;
        case "delete":
          await handleDelete();
          break;
        case "export":
          await handleExport();
          break;
        case "report":
          await handleReport();
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

function parseDuration(duration: string): number {
  // Parse "2h 30m" or "150" (minutes)
  const hoursMatch = duration.match(/(\d+)h/);
  const minutesMatch = duration.match(/(\d+)m/);
  const numberMatch = duration.match(/^(\d+)$/);

  let totalMinutes = 0;
  if (hoursMatch) totalMinutes += parseInt(hoursMatch[1]) * 60;
  if (minutesMatch) totalMinutes += parseInt(minutesMatch[1]);
  if (numberMatch && !hoursMatch && !minutesMatch) totalMinutes = parseInt(numberMatch[1]);

  return totalMinutes * 60; // Convert to seconds
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

async function handleList() {
  const parsed = parseFlags(commandArgs.slice(1));
  const userEmail = parsed.user as string | undefined;
  const status = parsed.status as string | undefined;

  const spinner = createSpinner("Loading time entries...");
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
    if (status) where.status = status;

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    spinner.succeed(`Found ${entries.length} time entry/entries`);

    if (entries.length === 0) {
      notice("No time entries found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["ID", "Name", "User", "Duration", "Status", "Date"],
      { colWidths: [12, 25, 25, 12, 12, 20] }
    );

    entries.forEach((e) => {
      table.push([
        e.id.substring(0, 8) + "...",
        e.name.substring(0, 23),
        e.user.email,
        formatDuration(e.totalDuration),
        e.status,
        e.startedAt.toLocaleDateString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load time entries");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <id>");
    process.exit(1);
  }

  const entryId = commandArgs[1];
  const spinner = createSpinner("Loading time entry details...");
  spinner.start();

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: {
        user: { select: { email: true, name: true } },
        ticket: { select: { ticketNumber: true, title: true } },
      },
    });

    spinner.succeed("Time entry details loaded");

    if (!entry) {
      error(`Time entry with ID ${entryId} not found`);
      process.exit(1);
    }

    separator();
    sectionHeader("Time Entry Details");
    displayKeyValue("ID", entry.id);
    displayKeyValue("Name", entry.name);
    displayKeyValue("Description", entry.description || "-");
    displayKeyValue("User", `${entry.user.email}${entry.user.name ? ` (${entry.user.name})` : ""}`);
    displayKeyValue("Ticket", entry.ticket ? `${entry.ticket.ticketNumber} - ${entry.ticket.title}` : "-");
    displayKeyValue("Status", entry.status);
    displayKeyValue("Duration", formatDuration(entry.totalDuration));
    displayKeyValue("Started", entry.startedAt.toLocaleString());
    displayKeyValue("Created", entry.createdAt.toLocaleString());
  } catch (err) {
    spinner.fail("Failed to load time entry details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleStart() {
  const parsed = parseFlags(commandArgs.slice(1));
  const description = parsed.description as string | undefined;
  const taskId = parsed.task as string | undefined;

  const spinner = createSpinner("Starting time entry...");
  spinner.start();

  try {
    // For CLI, we'll use a default user (you may want to add authentication)
    const defaultUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (!defaultUser) {
      spinner.fail("No user found");
      error("No user found. Please create a user first.");
      process.exit(1);
    }

    const data: any = {
      userId: defaultUser.id,
      name: description || "Time entry",
      description: description || null,
      status: "RUNNING",
      startedAt: new Date(),
      lastResumedAt: new Date(),
    };

    if (taskId) {
      // TimeEntry doesn't have a direct todo relation in the schema,
      // but we can append the reference to the description for traceability.
      data.description = `${data.description || ""} [Task: ${taskId}]`.trim();
    }

    const entry = await prisma.timeEntry.create({
      data,
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    spinner.succeed("Time entry started");
    console.log(`\n✅ Time entry started.`);
    console.log(`   Entry ID: ${entry.id}`);
  } catch (err) {
    spinner.fail("Failed to start time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleStop() {
  const parsed = parseFlags(commandArgs.slice(1));
  const entryId = parsed.id as string | undefined;

  const spinner = createSpinner("Stopping time entry...");
  spinner.start();

  try {
    let entry;
    if (entryId) {
      entry = await prisma.timeEntry.findUnique({
        where: { id: entryId },
        select: { id: true, status: true, startedAt: true, lastResumedAt: true, totalDuration: true },
      });
    } else {
      // Find running entry
      entry = await prisma.timeEntry.findFirst({
        where: { status: "RUNNING" },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, startedAt: true, lastResumedAt: true, totalDuration: true },
      });
    }

    if (!entry) {
      spinner.fail("No running time entry found");
      error("No running time entry found to stop");
      process.exit(1);
    }

    if (entry.status !== "RUNNING") {
      spinner.fail("Time entry is not running");
      error(`Time entry is ${entry.status}, not RUNNING`);
      process.exit(1);
    }

    const now = new Date();
    const runningDuration = entry.lastResumedAt
      ? Math.floor((now.getTime() - entry.lastResumedAt.getTime()) / 1000)
      : Math.floor((now.getTime() - entry.startedAt.getTime()) / 1000);

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: "STOPPED",
        stoppedAt: now,
        totalDuration: entry.totalDuration + runningDuration,
      },
    });

    spinner.succeed("Time entry stopped");
    console.log(`\n✅ Time entry stopped. Total duration: ${formatDuration(entry.totalDuration + runningDuration)}`);
  } catch (err) {
    spinner.fail("Failed to stop time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handlePause() {
  const parsed = parseFlags(commandArgs.slice(1));
  const entryId = parsed.id as string | undefined;

  const spinner = createSpinner("Pausing time entry...");
  spinner.start();

  try {
    let entry;
    if (entryId) {
      entry = await prisma.timeEntry.findUnique({
        where: { id: entryId },
        select: { id: true, status: true, startedAt: true, lastResumedAt: true, totalDuration: true },
      });
    } else {
      entry = await prisma.timeEntry.findFirst({
        where: { status: "RUNNING" },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, startedAt: true, lastResumedAt: true, totalDuration: true },
      });
    }

    if (!entry || entry.status !== "RUNNING") {
      spinner.fail("No running time entry found");
      error("No running time entry found to pause");
      process.exit(1);
    }

    const now = new Date();
    const runningDuration = entry.lastResumedAt
      ? Math.floor((now.getTime() - entry.lastResumedAt.getTime()) / 1000)
      : Math.floor((now.getTime() - entry.startedAt.getTime()) / 1000);

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: "PAUSED",
        pausedAt: now,
        totalDuration: entry.totalDuration + runningDuration,
      },
    });

    spinner.succeed("Time entry paused");
    console.log(`\n✅ Time entry paused.`);
  } catch (err) {
    spinner.fail("Failed to pause time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleResume() {
  const parsed = parseFlags(commandArgs.slice(1));
  const entryId = parsed.id as string | undefined;

  const spinner = createSpinner("Resuming time entry...");
  spinner.start();

  try {
    let entry;
    if (entryId) {
      entry = await prisma.timeEntry.findUnique({
        where: { id: entryId },
        select: { id: true, status: true },
      });
    } else {
      entry = await prisma.timeEntry.findFirst({
        where: { status: "PAUSED" },
        orderBy: { pausedAt: "desc" },
        select: { id: true, status: true },
      });
    }

    if (!entry || entry.status !== "PAUSED") {
      spinner.fail("No paused time entry found");
      error("No paused time entry found to resume");
      process.exit(1);
    }

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: "RUNNING",
        lastResumedAt: new Date(),
        pausedAt: null,
      },
    });

    spinner.succeed("Time entry resumed");
    console.log(`\n✅ Time entry resumed.`);
  } catch (err) {
    spinner.fail("Failed to resume time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleCreate() {
  if (commandArgs.length < 2) {
    console.error("Usage: create <duration> [--description=DESC] [--date=DATE] [--task=TASK]");
    process.exit(1);
  }

  const durationStr = commandArgs[1];
  const parsed = parseFlags(commandArgs.slice(2));
  const description = parsed.description as string | undefined;
  const dateStr = parsed.date as string | undefined;
  const taskId = parsed.task as string | undefined;

  const spinner = createSpinner("Creating time entry...");
  spinner.start();

  try {
    const defaultUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (!defaultUser) {
      spinner.fail("No user found");
      error("No user found. Please create a user first.");
      process.exit(1);
    }

    const duration = parseDuration(durationStr);
    const startedAt = dateStr ? new Date(dateStr) : new Date();

    const data: any = {
      userId: defaultUser.id,
      name: description || `Time entry`,
      description: description || null,
      status: "COMPLETED",
      startedAt,
      stoppedAt: new Date(startedAt.getTime() + duration * 1000),
      completedAt: new Date(startedAt.getTime() + duration * 1000),
      totalDuration: duration,
    };

    if (taskId) {
      // TimeEntry doesn't have a direct todo relation in the schema,
      // but we can append the reference to the description for traceability.
      data.description = `${data.description || ""} [Task: ${taskId}]`.trim();
    }

    const entry = await prisma.timeEntry.create({
      data,
      select: {
        id: true,
        name: true,
        totalDuration: true,
      },
    });

    spinner.succeed("Time entry created");
    console.log(`\n✅ Time entry created.`);
    console.log(`   Duration: ${formatDuration(entry.totalDuration)}`);
  } catch (err) {
    spinner.fail("Failed to create time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleUpdate() {
  if (commandArgs.length < 2) {
    console.error("Usage: update <id> [--duration=DURATION] [--description=DESC] [--date=DATE]");
    process.exit(1);
  }

  const entryId = commandArgs[1];
  const parsed = parseFlags(commandArgs.slice(2));

  const spinner = createSpinner("Updating time entry...");
  spinner.start();

  try {
    const updateData: any = {};
    if (parsed.description) updateData.description = parsed.description;
    if (parsed.duration) {
      updateData.totalDuration = parseDuration(parsed.duration as string);
    }
    if (parsed.date) {
      updateData.startedAt = new Date(parsed.date as string);
    }

    if (Object.keys(updateData).length === 0) {
      spinner.fail("No updates specified");
      error("Please specify at least one field to update");
      process.exit(1);
    }

    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: updateData,
      select: {
        id: true,
        name: true,
        totalDuration: true,
      },
    });

    spinner.succeed("Time entry updated");
    console.log(`\n✅ Time entry "${updated.name}" has been updated.`);
  } catch (err) {
    spinner.fail("Failed to update time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleDelete() {
  if (commandArgs.length < 2) {
    console.error("Usage: delete <id>");
    process.exit(1);
  }

  const entryId = commandArgs[1];

  const confirmed = await confirm(
    `⚠️  WARNING: Delete time entry? This cannot be undone.`,
    false
  );

  if (!confirmed) {
    notice("Deletion cancelled.", "info");
    return;
  }

  const spinner = createSpinner("Deleting time entry...");
  spinner.start();

  try {
    await prisma.timeEntry.delete({
      where: { id: entryId },
    });

    spinner.succeed("Time entry deleted");
    console.log(`\n✅ Time entry has been deleted.`);
  } catch (err) {
    spinner.fail("Failed to delete time entry");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleExport() {
  notice("Export functionality - coming soon. Use list command and redirect output.", "info");
}

async function handleReport() {
  notice("Report functionality - coming soon. Use list command with filters.", "info");
}
