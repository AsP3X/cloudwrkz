#!/usr/bin/env node

/**
 * Task Management CLI Tool
 * 
 * Usage:
 *   pnpm cli task list [--project=PROJECT] [--status=STATUS] [--assignee=EMAIL]
 *   pnpm cli task show <id>
 *   pnpm cli task create <project> <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]
 *   pnpm cli task update <id> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]
 *   pnpm cli task assign <id> <user>
 *   pnpm cli task complete <id>
 *   pnpm cli task delete <id>
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
const commandArgs = args[0] === "task" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("task-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Task Management CLI Tool

Commands:
  list [--project=PROJECT] [--status=STATUS] [--assignee=EMAIL]  List tasks with filters
  show <id>                                                       Show task details
  create <project> <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]  Create a new task
  update <id> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]  Update task
  assign <id> <user>                                             Assign task to user
  complete <id>                                                  Mark task as completed
  delete <id>                                                    Delete a task

Status: NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED, CANCELLED

Examples:
  pnpm cli task list
  pnpm cli task list --project=PROJ-000001 --status=IN_PROGRESS
  pnpm cli task create PROJ-000001 "Task Title" --assignee=user@example.com
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

async function handleList() {
  const parsed = parseArgs(commandArgs.slice(1));
  const projectCode = parsed.project as string | undefined;
  const status = parsed.status as string | undefined;
  const assigneeEmail = parsed.assignee as string | undefined;

  const spinner = createSpinner("Loading tasks...");
  spinner.start();

  try {
    const where: any = {};

    if (projectCode) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ code: projectCode }, { id: projectCode }] },
        select: { id: true },
      });
      if (project) where.projectId = project.id;
    }

    if (status) where.status = status;
    if (assigneeEmail) {
      const user = await prisma.user.findUnique({
        where: { email: assigneeEmail },
        select: { id: true },
      });
      if (user) where.assignedToId = user.id;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { code: true, name: true } },
        assignedTo: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    spinner.succeed(`Found ${tasks.length} task(s)`);

    if (tasks.length === 0) {
      notice("No tasks found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["ID", "Title", "Project", "Status", "Assignee", "Due Date"],
      { colWidths: [12, 30, 15, 15, 25, 15] }
    );

    tasks.forEach((t) => {
      table.push([
        t.id.substring(0, 8) + "...",
        t.title.substring(0, 28),
        t.project.code,
        t.status,
        t.assignedTo?.email || "-",
        t.dueDate?.toLocaleDateString() || "-",
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load tasks");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <id>");
    process.exit(1);
  }

  const taskId = commandArgs[1];
  const spinner = createSpinner("Loading task details...");
  spinner.start();

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { code: true, name: true } },
        assignedTo: { select: { email: true, name: true } },
      },
    });

    spinner.succeed("Task details loaded");

    if (!task) {
      error(`Task with ID ${taskId} not found`);
      process.exit(1);
    }

    separator();
    sectionHeader("Task Details");
    displayKeyValue("ID", task.id);
    displayKeyValue("Title", task.title);
    displayKeyValue("Description", task.description || "-");
    displayKeyValue("Project", `${task.project.code} - ${task.project.name}`);
    displayKeyValue("Status", task.status);
    displayKeyValue("Priority", task.priority);
    displayKeyValue("Assignee", task.assignedTo ? `${task.assignedTo.email}${task.assignedTo.name ? ` (${task.assignedTo.name})` : ""}` : "-");
    displayKeyValue("Due Date", task.dueDate?.toLocaleString() || "-");
    displayKeyValue("Created", task.createdAt.toLocaleString());
    displayKeyValue("Updated", task.updatedAt.toLocaleString());
  } catch (err) {
    spinner.fail("Failed to load task details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleCreate() {
  if (commandArgs.length < 3) {
    console.error("Usage: create <project> <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]");
    process.exit(1);
  }

  const projectCode = commandArgs[1];
  const title = commandArgs[2];
  const parsed = parseArgs(commandArgs.slice(3));
  const description = parsed.description as string | undefined;
  const assigneeEmail = parsed.assignee as string | undefined;
  const dueDateStr = parsed["due-date"] as string | undefined;

  const spinner = createSpinner("Creating task...");
  spinner.start();

  try {
    const project = await prisma.project.findFirst({
      where: { OR: [{ code: projectCode }, { id: projectCode }] },
      select: { id: true },
    });

    if (!project) {
      spinner.fail("Project not found");
      error(`Project "${projectCode}" not found`);
      process.exit(1);
    }

    const data: any = {
      projectId: project.id,
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

    const task = await prisma.task.create({
      data,
      select: {
        id: true,
        title: true,
        project: { select: { code: true } },
        status: true,
      },
    });

    spinner.succeed("Task created");
    console.log(`\n✅ Task "${task.title}" has been created in project ${task.project.code}.`);
  } catch (err) {
    spinner.fail("Failed to create task");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleUpdate() {
  if (commandArgs.length < 2) {
    console.error("Usage: update <id> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]");
    process.exit(1);
  }

  const taskId = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));

  const spinner = createSpinner("Updating task...");
  spinner.start();

  try {
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

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    spinner.succeed("Task updated");
    console.log(`\n✅ Task "${updated.title}" has been updated.`);
  } catch (err) {
    spinner.fail("Failed to update task");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleAssign() {
  if (commandArgs.length < 3) {
    console.error("Usage: assign <id> <user>");
    process.exit(1);
  }

  const taskId = commandArgs[1];
  const userEmail = commandArgs[2];

  const spinner = createSpinner("Assigning task...");
  spinner.start();

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email ${userEmail} not found`);
      process.exit(1);
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: user.id },
      select: {
        title: true,
        assignedTo: { select: { email: true } },
      },
    });

    spinner.succeed("Task assigned");
    console.log(`\n✅ Task "${task.title}" has been assigned to ${task.assignedTo?.email}.`);
  } catch (err) {
    spinner.fail("Failed to assign task");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleComplete() {
  if (commandArgs.length < 2) {
    console.error("Usage: complete <id>");
    process.exit(1);
  }

  const taskId = commandArgs[1];

  const spinner = createSpinner("Completing task...");
  spinner.start();

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedDate: new Date(),
      },
      select: {
        title: true,
        status: true,
      },
    });

    spinner.succeed("Task completed");
    console.log(`\n✅ Task "${task.title}" has been marked as completed.`);
  } catch (err) {
    spinner.fail("Failed to complete task");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleDelete() {
  if (commandArgs.length < 2) {
    console.error("Usage: delete <id>");
    process.exit(1);
  }

  const taskId = commandArgs[1];

  const confirmed = await confirm(
    `⚠️  WARNING: Delete task? This cannot be undone.`,
    false
  );

  if (!confirmed) {
    notice("Deletion cancelled.", "info");
    return;
  }

  const spinner = createSpinner("Deleting task...");
  spinner.start();

  try {
    await prisma.task.delete({
      where: { id: taskId },
    });

    spinner.succeed("Task deleted");
    console.log(`\n✅ Task has been deleted.`);
  } catch (err) {
    spinner.fail("Failed to delete task");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
