#!/usr/bin/env node

/**
 * Ticket Management CLI Tool
 * 
 * Usage:
 *   pnpm cli ticket list [--status=STATUS] [--priority=PRIORITY] [--type=TYPE] [--assignee=EMAIL]
 *   pnpm cli ticket show <id|number>
 *   pnpm cli ticket create <title> [--description=DESC] [--priority=PRIORITY] [--type=TYPE]
 *   pnpm cli ticket update <id|number> [--status=STATUS] [--priority=PRIORITY] [--assignee=EMAIL]
 *   pnpm cli ticket assign <id|number> <user|group>
 *   pnpm cli ticket close <id|number> [--reason=REASON]
 *   pnpm cli ticket reopen <id|number>
 *   pnpm cli ticket delete <id|number>
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
const commandArgs = args[0] === "ticket" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("ticket-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Ticket Management CLI Tool

Commands:
  list [--status=STATUS] [--priority=PRIORITY] [--type=TYPE] [--assignee=EMAIL]  List tickets with filters
  show <id|number>                                                               Show ticket details
  create <title> [--description=DESC] [--priority=PRIORITY] [--type=TYPE]        Create a new ticket
  update <id|number> [--status=STATUS] [--priority=PRIORITY] [--assignee=EMAIL]  Update ticket
  assign <id|number> <user|group>                                                Assign ticket to user or group
  close <id|number> [--reason=REASON]                                            Close a ticket
  reopen <id|number>                                                             Reopen a closed ticket
  delete <id|number>                                                             Delete a ticket

Status: OPEN, IN_PROGRESS, PENDING, RESOLVED, CLOSED, CANCELLED
Priority: LOW, MEDIUM, HIGH, URGENT
Type: BUG, FEATURE, QUESTION, SUPPORT, TASK

Examples:
  pnpm cli ticket list
  pnpm cli ticket list --status=OPEN --priority=HIGH
  pnpm cli ticket create "Bug Report" --type=BUG --priority=HIGH
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
        case "create":
          await handleCreate();
          break;
        case "update":
          await handleUpdate();
          break;
        case "assign":
          await handleAssign();
          break;
        case "close":
          await handleClose();
          break;
        case "reopen":
          await handleReopen();
          break;
        case "delete":
          await handleDelete();
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

async function resolveTicket(selection: string) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [{ id: selection }, { ticketNumber: selection }],
    },
    select: { id: true, ticketNumber: true, title: true },
  });

  if (!ticket) {
    console.error(`Ticket not found: ${selection}`);
    process.exit(1);
  }

  return ticket;
}

async function handleList() {
  const parsed = parseArgs(commandArgs.slice(1));
  const status = parsed.status as string | undefined;
  const priority = parsed.priority as string | undefined;
  const type = parsed.type as string | undefined;
  const assigneeEmail = parsed.assignee as string | undefined;

  const spinner = createSpinner("Loading tickets...");
  spinner.start();

  try {
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (assigneeEmail) {
      const user = await prisma.user.findUnique({
        where: { email: assigneeEmail },
        select: { id: true },
      });
      if (user) where.assignedToId = user.id;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        createdBy: { select: { email: true } },
        assignedTo: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    spinner.succeed(`Found ${tickets.length} ticket(s)`);

    if (tickets.length === 0) {
      notice("No tickets found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["Number", "Title", "Type", "Status", "Priority", "Assignee", "Created"],
      { colWidths: [12, 30, 12, 15, 10, 25, 20] }
    );

    tickets.forEach((t) => {
      table.push([
        t.ticketNumber,
        t.title.substring(0, 28),
        t.type,
        t.status,
        t.priority,
        t.assignedTo?.email || "-",
        t.createdAt.toLocaleDateString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load tickets");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <id|number>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const spinner = createSpinner("Loading ticket details...");
  spinner.start();

  try {
    const ticket = await resolveTicket(selection);

    const fullTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        createdBy: { select: { email: true, name: true } },
        assignedTo: { select: { email: true, name: true } },
        assignedToGroup: { select: { name: true } },
        _count: {
          select: {
            comments: true,
            activities: true,
          },
        },
      },
    });

    spinner.succeed("Ticket details loaded");

    if (!fullTicket) {
      error("Ticket not found");
      process.exit(1);
    }

    separator();
    sectionHeader("Ticket Details");
    displayKeyValue("Number", fullTicket.ticketNumber);
    displayKeyValue("Title", fullTicket.title);
    displayKeyValue("Description", fullTicket.descriptionPlain || "-");
    displayKeyValue("Type", fullTicket.type);
    displayKeyValue("Status", fullTicket.status);
    displayKeyValue("Priority", fullTicket.priority);
    displayKeyValue("Created By", fullTicket.createdBy ? `${fullTicket.createdBy.email}${fullTicket.createdBy.name ? ` (${fullTicket.createdBy.name})` : ""}` : "-");
    displayKeyValue("Assigned To", fullTicket.assignedTo ? `${fullTicket.assignedTo.email}${fullTicket.assignedTo.name ? ` (${fullTicket.assignedTo.name})` : ""}` : fullTicket.assignedToGroup ? `Group: ${fullTicket.assignedToGroup.name}` : "-");
    displayKeyValue("Comments", fullTicket._count.comments.toString());
    displayKeyValue("Activities", fullTicket._count.activities.toString());
    displayKeyValue("Created", fullTicket.createdAt.toLocaleString());
    displayKeyValue("Updated", fullTicket.updatedAt.toLocaleString());
  } catch (err) {
    spinner.fail("Failed to load ticket details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleCreate() {
  if (commandArgs.length < 2) {
    console.error("Usage: create <title> [--description=DESC] [--priority=PRIORITY] [--type=TYPE]");
    process.exit(1);
  }

  const title = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));
  const description = parsed.description as string | undefined;
  const priority = (parsed.priority as string) || "MEDIUM";
  const type = (parsed.type as string) || "SUPPORT";

  const spinner = createSpinner("Creating ticket...");
  spinner.start();

  try {
    // Generate ticket number
    const existingTickets = await prisma.ticket.findMany({
      where: { ticketNumber: { startsWith: "#INC-" } },
      orderBy: { ticketNumber: "desc" },
      take: 1,
    });

    let nextNumber = 1;
    if (existingTickets.length > 0) {
      const match = existingTickets[0].ticketNumber.match(/#INC-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const ticketNumber = `#INC-${nextNumber.toString().padStart(6, "0")}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title: title.trim(),
        descriptionPlain: description?.trim() || null,
        type: type as any,
        priority: priority as any,
        status: "OPEN",
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
      },
    });

    spinner.succeed("Ticket created");
    console.log(`\n✅ Ticket "${ticket.title}" (${ticket.ticketNumber}) has been created.`);
  } catch (err) {
    spinner.fail("Failed to create ticket");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleUpdate() {
  if (commandArgs.length < 2) {
    console.error("Usage: update <id|number> [--status=STATUS] [--priority=PRIORITY] [--assignee=EMAIL]");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));

  const spinner = createSpinner("Updating ticket...");
  spinner.start();

  try {
    const ticket = await resolveTicket(selection);

    const updateData: any = {};
    if (parsed.status) updateData.status = parsed.status;
    if (parsed.priority) updateData.priority = parsed.priority;
    if (parsed.assignee) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.assignee as string },
        select: { id: true },
      });
      if (user) updateData.assignedToId = user.id;
    }

    if (Object.keys(updateData).length === 0) {
      spinner.fail("No updates specified");
      error("Please specify at least one field to update");
      process.exit(1);
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: updateData,
      select: {
        ticketNumber: true,
        title: true,
        status: true,
      },
    });

    spinner.succeed("Ticket updated");
    console.log(`\n✅ Ticket "${updated.title}" (${updated.ticketNumber}) has been updated.`);
  } catch (err) {
    spinner.fail("Failed to update ticket");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleAssign() {
  if (commandArgs.length < 3) {
    console.error("Usage: assign <id|number> <user|group>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const assignee = commandArgs[2];

  const spinner = createSpinner("Assigning ticket...");
  spinner.start();

  try {
    const ticket = await resolveTicket(selection);

    // Try user first
    const user = await prisma.user.findUnique({
      where: { email: assignee },
      select: { id: true },
    });

    if (user) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { assignedToId: user.id, assignedToGroupId: null },
      });
      spinner.succeed("Ticket assigned");
      console.log(`\n✅ Ticket "${ticket.ticketNumber}" has been assigned to ${assignee}.`);
      return;
    }

    // Try group
    const group = await prisma.group.findUnique({
      where: { name: assignee },
      select: { id: true },
    });

    if (group) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { assignedToGroupId: group.id, assignedToId: null },
      });
      spinner.succeed("Ticket assigned");
      console.log(`\n✅ Ticket "${ticket.ticketNumber}" has been assigned to group "${assignee}".`);
      return;
    }

    spinner.fail("User or group not found");
    error(`User or group "${assignee}" not found`);
    process.exit(1);
  } catch (err) {
    spinner.fail("Failed to assign ticket");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleClose() {
  if (commandArgs.length < 2) {
    console.error("Usage: close <id|number> [--reason=REASON]");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));
  const reason = parsed.reason as string | undefined;

  const spinner = createSpinner("Closing ticket...");
  spinner.start();

  try {
    const ticket = await resolveTicket(selection);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
      },
    });

    spinner.succeed("Ticket closed");
    console.log(`\n✅ Ticket "${ticket.ticketNumber}" has been closed.${reason ? ` Reason: ${reason}` : ""}`);
  } catch (err) {
    spinner.fail("Failed to close ticket");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleReopen() {
  if (commandArgs.length < 2) {
    console.error("Usage: reopen <id|number>");
    process.exit(1);
  }

  const selection = commandArgs[1];

  const spinner = createSpinner("Reopening ticket...");
  spinner.start();

  try {
    const ticket = await resolveTicket(selection);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "OPEN",
        closedAt: null,
      },
    });

    spinner.succeed("Ticket reopened");
    console.log(`\n✅ Ticket "${ticket.ticketNumber}" has been reopened.`);
  } catch (err) {
    spinner.fail("Failed to reopen ticket");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleDelete() {
  if (commandArgs.length < 2) {
    console.error("Usage: delete <id|number>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const ticket = await resolveTicket(selection);

  const confirmed = await confirm(
    `⚠️  WARNING: Delete ticket "${ticket.ticketNumber}"? This cannot be undone.`,
    false
  );

  if (!confirmed) {
    notice("Deletion cancelled.", "info");
    return;
  }

  const spinner = createSpinner("Deleting ticket...");
  spinner.start();

  try {
    await prisma.ticket.delete({
      where: { id: ticket.id },
    });

    spinner.succeed("Ticket deleted");
    console.log(`\n✅ Ticket "${ticket.ticketNumber}" has been deleted.`);
  } catch (err) {
    spinner.fail("Failed to delete ticket");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
