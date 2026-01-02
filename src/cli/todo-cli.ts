#!/usr/bin/env node

/**
 * Todo Management CLI Tool
 * 
 * Usage:
 *   pnpm cli todo list [--status=STATUS] [--assignee=EMAIL]
 *   pnpm cli todo show <id|number>
 *   pnpm cli todo create <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]
 *   pnpm cli todo update <id|number> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]
 *   pnpm cli todo assign <id|number> <user>
 *   pnpm cli todo complete <id|number>
 *   pnpm cli todo delete <id|number>
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
const commandArgs = args[0] === "todo" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("todo-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Todo Management CLI Tool

Commands:
  list [--status=STATUS] [--assignee=EMAIL]  List todos with filters
  show <id>                                  Show todo details
  create <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]  Create a new todo
  update <id> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]  Update todo
  assign <id> <user>                                             Assign todo to user
  complete <id>                                                  Mark todo as completed
  delete <id>                                                    Delete a todo

Status: NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED, CANCELLED

Examples:
  pnpm cli todo list
  pnpm cli todo list --status=IN_PROGRESS
  pnpm cli todo create "Todo Title" --assignee=user@example.com
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
        case "complete":
          await handleComplete();
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

async function resolveTodo(selection: string) {
  const todo = await prisma.todo.findFirst({
    where: {
      OR: [{ id: selection }, { todoNumber: selection }],
    },
    select: {
      id: true,
      todoNumber: true,
      title: true,
    },
  });

  if (!todo) {
    console.error(`Todo not found: ${selection}`);
    process.exit(1);
  }

  return todo;
}

async function handleList() {
  const parsed = parseArgs(commandArgs.slice(1));
  const status = parsed.status as string | undefined;
  const assigneeEmail = parsed.assignee as string | undefined;

  const spinner = createSpinner("Loading todos...");
  spinner.start();

  try {
    const where: any = {};

    if (status) where.status = status;
    if (assigneeEmail) {
      const user = await prisma.user.findUnique({
        where: { email: assigneeEmail },
        select: { id: true },
      });
      if (user) where.assignedToId = user.id;
    }

    const todos = await prisma.todo.findMany({
      where,
      include: {
        assignedTo: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    spinner.succeed(`Found ${todos.length} todo(s)`);

    if (todos.length === 0) {
      notice("No todos found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["Number", "Title", "Status", "Assignee", "Due Date"],
      { colWidths: [14, 30, 15, 25, 15] }
    );

    todos.forEach((t) => {
      table.push([
        t.todoNumber || `${t.id.substring(0, 8)}...`,
        t.title.substring(0, 28),
        t.status,
        t.assignedTo?.email || "-",
        t.dueDate?.toLocaleDateString() || "-",
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load todos");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <id|number>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const spinner = createSpinner("Loading todo details...");
  spinner.start();

  try {
    const resolved = await resolveTodo(selection);
    const todo = await prisma.todo.findUnique({
      where: { id: resolved.id },
      include: {
        assignedTo: { select: { email: true, name: true } },
      },
    });

    spinner.succeed("Todo details loaded");

    if (!todo) {
      error(`Todo not found: ${selection}`);
      process.exit(1);
    }

    separator();
    sectionHeader("Todo Details");
    displayKeyValue("ID", todo.id);
    displayKeyValue("Number", todo.todoNumber || "(not set)");
    displayKeyValue("Title", todo.title);
    displayKeyValue("Description", todo.description || "-");
    displayKeyValue("Status", todo.status);
    displayKeyValue("Priority", todo.priority);
    displayKeyValue("Assignee", todo.assignedTo ? `${todo.assignedTo.email}${todo.assignedTo.name ? ` (${todo.assignedTo.name})` : ""}` : "-");
    displayKeyValue("Due Date", todo.dueDate?.toLocaleString() || "-");
    displayKeyValue("Created", todo.createdAt.toLocaleString());
    displayKeyValue("Updated", todo.updatedAt.toLocaleString());
  } catch (err) {
    spinner.fail("Failed to load todo details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleCreate() {
  if (commandArgs.length < 2) {
    console.error("Usage: create <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]");
    process.exit(1);
  }

  const title = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));
  const description = parsed.description as string | undefined;
  const assigneeEmail = parsed.assignee as string | undefined;
  const dueDateStr = parsed["due-date"] as string | undefined;

  const spinner = createSpinner("Creating todo...");
  spinner.start();

  try {
    const data: any = {
      title: title.trim(),
      description: description?.trim() || null,
    };

    if (assigneeEmail) {
      const user = await prisma.user.findUnique({
        where: { email: assigneeEmail },
        select: { id: true },
      });
      if (user) data.assignedToId = user.id;
    }

    if (dueDateStr) {
      data.dueDate = new Date(dueDateStr);
    }

    const todo = await prisma.todo.create({
      data,
    });

    spinner.succeed("Todo created");
    console.log(
      `\n✅ Todo "${todo.title}" (${todo.todoNumber || todo.id.substring(0, 8) + "..."}) has been created.`
    );
  } catch (err) {
    spinner.fail("Failed to create todo");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleUpdate() {
  if (commandArgs.length < 2) {
    console.error("Usage: update <id> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));

  const spinner = createSpinner("Updating todo...");
  spinner.start();

  try {
    const todo = await resolveTodo(selection);

    const updateData: any = {};
    if (parsed.status) updateData.status = parsed.status;
    if (parsed.assignee) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.assignee as string },
        select: { id: true },
      });
      if (user) updateData.assignedToId = user.id;
    }
    if (parsed["due-date"]) {
      updateData.dueDate = new Date(parsed["due-date"] as string);
    }

    if (Object.keys(updateData).length === 0) {
      spinner.fail("No updates specified");
      error("Please specify at least one field to update");
      process.exit(1);
    }

    const updated = await prisma.todo.update({
      where: { id: todo.id },
      data: updateData,
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    spinner.succeed("Todo updated");
    console.log(`\n✅ Todo "${updated.title}" has been updated.`);
  } catch (err) {
    spinner.fail("Failed to update todo");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleAssign() {
  if (commandArgs.length < 3) {
    console.error("Usage: assign <id|number> <user>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const userEmail = commandArgs[2];

  const spinner = createSpinner("Assigning todo...");
  spinner.start();

  try {
    const todo = await resolveTodo(selection);

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email ${userEmail} not found`);
      process.exit(1);
    }

    const updated = await prisma.todo.update({
      where: { id: todo.id },
      data: { assignedToId: user.id },
      select: {
        id: true,
        todoNumber: true,
        title: true,
        assignedTo: { select: { email: true } },
      },
    });

    spinner.succeed("Todo assigned");
    console.log(
      `\n✅ Todo "${updated.title}" (${updated.todoNumber || updated.id.substring(0, 8) + "..."}) has been assigned to ${
        updated.assignedTo?.email
      }.`
    );
  } catch (err) {
    spinner.fail("Failed to assign todo");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleComplete() {
  if (commandArgs.length < 2) {
    console.error("Usage: complete <id|number>");
    process.exit(1);
  }

  const selection = commandArgs[1];

  const spinner = createSpinner("Completing todo...");
  spinner.start();

  try {
    const todo = await resolveTodo(selection);

    const updated = await prisma.todo.update({
      where: { id: todo.id },
      data: {
        status: "COMPLETED",
        completedDate: new Date(),
      },
      select: {
        id: true,
        todoNumber: true,
        title: true,
        status: true,
      },
    });

    spinner.succeed("Todo completed");
    console.log(
      `\n✅ Todo "${updated.title}" (${updated.todoNumber || updated.id.substring(0, 8) + "..."}) has been marked as completed.`
    );
  } catch (err) {
    spinner.fail("Failed to complete todo");
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
  const todo = await resolveTodo(selection);

  const confirmed = await confirm(
    `⚠️  WARNING: Delete todo "${todo.todoNumber || todo.id.substring(0, 8) + "..."}"? This cannot be undone.`,
    false
  );

  if (!confirmed) {
    notice("Deletion cancelled.", "info");
    return;
  }

  const spinner = createSpinner("Deleting todo...");
  spinner.start();

  try {
    await prisma.todo.delete({
      where: { id: todo.id },
    });

    spinner.succeed("Todo deleted");
    console.log(`\n✅ Todo "${todo.todoNumber || todo.id.substring(0, 8) + "..."}" has been deleted.`);
  } catch (err) {
    spinner.fail("Failed to delete todo");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
