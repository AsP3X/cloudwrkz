#!/usr/bin/env node

/**
 * Project Management CLI Tool
 * 
 * Usage:
 *   pnpm cli project list [--status=STATUS] [--priority=PRIORITY]
 *   pnpm cli project create <name> [description] [--status=STATUS] [--priority=PRIORITY]
 *   pnpm cli project show <id|code>
 *   pnpm cli project update <id|code> [--name=NAME] [--status=STATUS] [--priority=PRIORITY]
 *   pnpm cli project delete <id|code>
 *   pnpm cli project add-member <project> <user> [--role=ROLE]
 *   pnpm cli project remove-member <project> <user>
 *   pnpm cli project list-members <project>
 *   pnpm cli project add-group <project> <group>
 *   pnpm cli project remove-group <project> <group>
 *   pnpm cli project list-groups <project>
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
import chalk from "chalk";

const args = process.argv.slice(2);
const commandArgs = args[0] === "project" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("project-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Project Management CLI Tool

Commands:
  list [--status=STATUS] [--priority=PRIORITY]  List projects with filters
  create <name> [description] [--status=STATUS] [--priority=PRIORITY]  Create a new project
  show <id|code>                                 Show project details
  update <id|code> [--name=NAME] [--status=STATUS] [--priority=PRIORITY]  Update project
  delete <id|code>                               Delete a project
  add-member <project> <user> [--role=ROLE]     Add a user to project
  remove-member <project> <user>                Remove a user from project
  list-members <project>                         List project members
  add-group <project> <group>                   Add a group to project
  remove-group <project> <group>                Remove a group from project
  list-groups <project>                          List project groups

Status: PLANNING, ACTIVE, ON_HOLD, COMPLETED, CANCELLED, ARCHIVED
Priority: LOW, MEDIUM, HIGH, URGENT
Role: MANAGER, MEMBER

Examples:
  pnpm cli project list
  pnpm cli project list --status=ACTIVE
  pnpm cli project create "New Project" "Description" --status=ACTIVE
  pnpm cli project show PROJ-000001
  pnpm cli project add-member PROJ-000001 user@example.com --role=MANAGER
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
        case "create":
          await handleCreate();
          break;
        case "show":
          await handleShow();
          break;
        case "update":
          await handleUpdate();
          break;
        case "delete":
          await handleDelete();
          break;
        case "add-member":
          await handleAddMember();
          break;
        case "remove-member":
          await handleRemoveMember();
          break;
        case "list-members":
          await handleListMembers();
          break;
        case "add-group":
          await handleAddGroup();
          break;
        case "remove-group":
          await handleRemoveGroup();
          break;
        case "list-groups":
          await handleListGroups();
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

async function resolveProject(selection: string) {
  const projectIndex = parseInt(selection) - 1;

  if (!isNaN(projectIndex) && projectIndex >= 0) {
    const projects = await prisma.project.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { createdAt: "desc" },
    });

    if (projectIndex >= projects.length) {
      console.error(`Invalid project number: ${selection}`);
      process.exit(1);
    }

    return projects[projectIndex];
  } else {
    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: selection }, { code: selection }],
      },
      select: { id: true, code: true, name: true },
    });

    if (!project) {
      console.error(`Project not found: ${selection}`);
      process.exit(1);
    }

    return project;
  }
}

async function generateProjectCode(): Promise<string> {
  const existingProjects = await prisma.project.findMany({
    where: { code: { startsWith: "PROJ-" } },
    select: { code: true },
    orderBy: { code: "desc" },
    take: 1,
  });

  let nextNumber = 1;
  if (existingProjects.length > 0) {
    const match = existingProjects[0].code.match(/PROJ-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `PROJ-${nextNumber.toString().padStart(6, "0")}`;
}

async function handleList() {
  const parsed = parseArgs(commandArgs.slice(1));
  const status = parsed.status as string | undefined;
  const priority = parsed.priority as string | undefined;

  const spinner = createSpinner("Loading projects...");
  spinner.start();

  try {
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const projects = await prisma.project.findMany({
      where,
      include: {
        _count: {
          select: {
            members: true,
            tickets: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    spinner.succeed(`Found ${projects.length} project(s)`);

    if (projects.length === 0) {
      notice("No projects found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["#", "Code", "Name", "Status", "Priority", "Members", "Tickets"],
      { colWidths: [4, 12, 25, 12, 10, 8, 8] }
    );

    projects.forEach((p, index) => {
      table.push([
        (index + 1).toString(),
        p.code,
        p.name,
        p.status,
        p.priority,
        p._count.members.toString(),
        p._count.tickets.toString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load projects");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleCreate() {
  const parsed = parseArgs(commandArgs.slice(1));
  const name = commandArgs[1] || parsed.name as string;
  const description = commandArgs[2] || parsed.description as string;
  const status = (parsed.status as string) || "PLANNING";
  const priority = (parsed.priority as string) || "MEDIUM";

  if (!name) {
    console.error("Usage: create <name> [description] [--status=STATUS] [--priority=PRIORITY]");
    process.exit(1);
  }

  const spinner = createSpinner("Creating project...");
  spinner.start();

  try {
    const code = await generateProjectCode();

    const project = await prisma.project.create({
      data: {
        code,
        name: name.trim(),
        description: description?.trim() || null,
        status: status as any,
        priority: priority as any,
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });

    spinner.succeed("Project created");
    console.log(`\n✅ Project "${project.name}" (${project.code}) has been created.`);
  } catch (err) {
    spinner.fail("Failed to create project");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <id|code>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const spinner = createSpinner("Loading project details...");
  spinner.start();

  try {
    const project = await resolveProject(selection);

    const fullProject = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        createdBy: {
          select: {
            email: true,
            name: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                email: true,
                name: true,
                role: true,
              },
            },
          },
        },
        groups: {
          include: {
            group: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            tickets: true,
            milestones: true,
            risks: true,
            issues: true,
          },
        },
      },
    });

    spinner.succeed("Project details loaded");

    if (!fullProject) {
      error("Project not found");
      process.exit(1);
    }

    separator();
    sectionHeader("Project Details");
    displayKeyValue("ID", fullProject.id);
    displayKeyValue("Code", fullProject.code);
    displayKeyValue("Name", fullProject.name);
    displayKeyValue("Description", fullProject.description || "-");
    displayKeyValue("Status", fullProject.status);
    displayKeyValue("Priority", fullProject.priority);
    displayKeyValue("Created By", fullProject.createdBy ? `${fullProject.createdBy.email}${fullProject.createdBy.name ? ` (${fullProject.createdBy.name})` : ""}` : "-");
    displayKeyValue("Created", fullProject.createdAt.toLocaleString());
    displayKeyValue("Updated", fullProject.updatedAt.toLocaleString());

    separator();
    sectionHeader("Statistics");
    displayKeyValue("Members", fullProject._count.members.toString());
    displayKeyValue("Tickets", fullProject._count.tickets.toString());
    displayKeyValue("Milestones", fullProject._count.milestones.toString());
    displayKeyValue("Risks", fullProject._count.risks.toString());
    displayKeyValue("Issues", fullProject._count.issues.toString());

    if (fullProject.members.length > 0) {
      separator();
      sectionHeader("Members");
      fullProject.members.forEach((m) => {
        console.log(chalk.gray(`  ${m.user.email}${m.user.name ? ` (${m.user.name})` : ""} - ${m.role}`));
      });
    }

    if (fullProject.groups.length > 0) {
      separator();
      sectionHeader("Groups");
      fullProject.groups.forEach((g) => {
        console.log(chalk.gray(`  ${g.group.name}`));
      });
    }
  } catch (err) {
    spinner.fail("Failed to load project details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleUpdate() {
  if (commandArgs.length < 2) {
    console.error("Usage: update <id|code> [--name=NAME] [--status=STATUS] [--priority=PRIORITY]");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const parsed = parseArgs(commandArgs.slice(2));

  const spinner = createSpinner("Updating project...");
  spinner.start();

  try {
    const project = await resolveProject(selection);

    const updateData: any = {};
    if (parsed.name) updateData.name = parsed.name;
    if (parsed.status) updateData.status = parsed.status;
    if (parsed.priority) updateData.priority = parsed.priority;

    if (Object.keys(updateData).length === 0) {
      spinner.fail("No updates specified");
      error("Please specify at least one field to update");
      process.exit(1);
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: updateData,
      select: {
        code: true,
        name: true,
        status: true,
        priority: true,
      },
    });

    spinner.succeed("Project updated");
    console.log(`\n✅ Project "${updated.name}" (${updated.code}) has been updated.`);
  } catch (err) {
    spinner.fail("Failed to update project");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleDelete() {
  if (commandArgs.length < 2) {
    console.error("Usage: delete <id|code>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const project = await resolveProject(selection);

  const confirmed = await confirm(
    `⚠️  WARNING: Delete project "${project.name}" (${project.code})? This cannot be undone.`,
    false
  );

  if (!confirmed) {
    notice("Deletion cancelled.", "info");
    return;
  }

  const spinner = createSpinner("Deleting project...");
  spinner.start();

  try {
    await prisma.project.delete({
      where: { id: project.id },
    });

    spinner.succeed("Project deleted");
    console.log(`\n✅ Project "${project.name}" (${project.code}) has been deleted.`);
  } catch (err) {
    spinner.fail("Failed to delete project");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleAddMember() {
  if (commandArgs.length < 3) {
    console.error("Usage: add-member <project> <user> [--role=ROLE]");
    process.exit(1);
  }

  const projectSelection = commandArgs[1];
  const userSelection = commandArgs[2];
  const parsed = parseArgs(commandArgs.slice(3));
  const role = (parsed.role as string) || "MEMBER";

  const spinner = createSpinner("Adding member...");
  spinner.start();

  try {
    const project = await resolveProject(projectSelection);

    const user = await prisma.user.findUnique({
      where: { email: userSelection },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email ${userSelection} not found`);
      process.exit(1);
    }

    const existing = await prisma.projectUser.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: project.id,
        },
      },
    });

    if (existing) {
      spinner.fail("Member already exists");
      error(`User ${userSelection} is already a member of this project`);
      process.exit(1);
    }

    await prisma.projectUser.create({
      data: {
        userId: user.id,
        projectId: project.id,
        role: role as any,
      },
    });

    spinner.succeed("Member added");
    console.log(`\n✅ ${user.email}${user.name ? ` (${user.name})` : ""} has been added to project "${project.name}" as ${role}.`);
  } catch (err) {
    spinner.fail("Failed to add member");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleRemoveMember() {
  if (commandArgs.length < 3) {
    console.error("Usage: remove-member <project> <user>");
    process.exit(1);
  }

  const projectSelection = commandArgs[1];
  const userSelection = commandArgs[2];

  const spinner = createSpinner("Removing member...");
  spinner.start();

  try {
    const project = await resolveProject(projectSelection);

    const user = await prisma.user.findUnique({
      where: { email: userSelection },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email ${userSelection} not found`);
      process.exit(1);
    }

    await prisma.projectUser.delete({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: project.id,
        },
      },
    });

    spinner.succeed("Member removed");
    console.log(`\n✅ ${user.email}${user.name ? ` (${user.name})` : ""} has been removed from project "${project.name}".`);
  } catch (err) {
    spinner.fail("Failed to remove member");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleListMembers() {
  if (commandArgs.length < 2) {
    console.error("Usage: list-members <project>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const spinner = createSpinner("Loading members...");
  spinner.start();

  try {
    const project = await resolveProject(selection);

    const members = await prisma.projectUser.findMany({
      where: { projectId: project.id },
      include: {
        user: {
          select: {
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    spinner.succeed(`Found ${members.length} member(s)`);

    if (members.length === 0) {
      notice("No members found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["Email", "Name", "Role", "Project Role", "Added"],
      { colWidths: [30, 25, 12, 12, 20] }
    );

    members.forEach((m) => {
      table.push([
        m.user.email,
        m.user.name || "-",
        m.user.role,
        m.role,
        m.createdAt.toLocaleDateString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load members");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleAddGroup() {
  if (commandArgs.length < 3) {
    console.error("Usage: add-group <project> <group>");
    process.exit(1);
  }

  const projectSelection = commandArgs[1];
  const groupSelection = commandArgs[2];

  const spinner = createSpinner("Adding group...");
  spinner.start();

  try {
    const project = await resolveProject(projectSelection);

    const group = await prisma.group.findUnique({
      where: { name: groupSelection },
      select: { id: true, name: true },
    });

    if (!group) {
      spinner.fail("Group not found");
      error(`Group "${groupSelection}" not found`);
      process.exit(1);
    }

    const existing = await prisma.projectGroup.findUnique({
      where: {
        groupId_projectId: {
          groupId: group.id,
          projectId: project.id,
        },
      },
    });

    if (existing) {
      spinner.fail("Group already added");
      error(`Group "${group.name}" is already assigned to this project`);
      process.exit(1);
    }

    await prisma.projectGroup.create({
      data: {
        groupId: group.id,
        projectId: project.id,
      },
    });

    spinner.succeed("Group added");
    console.log(`\n✅ Group "${group.name}" has been added to project "${project.name}".`);
  } catch (err) {
    spinner.fail("Failed to add group");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleRemoveGroup() {
  if (commandArgs.length < 3) {
    console.error("Usage: remove-group <project> <group>");
    process.exit(1);
  }

  const projectSelection = commandArgs[1];
  const groupSelection = commandArgs[2];

  const spinner = createSpinner("Removing group...");
  spinner.start();

  try {
    const project = await resolveProject(projectSelection);

    const group = await prisma.group.findUnique({
      where: { name: groupSelection },
      select: { id: true, name: true },
    });

    if (!group) {
      spinner.fail("Group not found");
      error(`Group "${groupSelection}" not found`);
      process.exit(1);
    }

    await prisma.projectGroup.delete({
      where: {
        groupId_projectId: {
          groupId: group.id,
          projectId: project.id,
        },
      },
    });

    spinner.succeed("Group removed");
    console.log(`\n✅ Group "${group.name}" has been removed from project "${project.name}".`);
  } catch (err) {
    spinner.fail("Failed to remove group");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleListGroups() {
  if (commandArgs.length < 2) {
    console.error("Usage: list-groups <project>");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const spinner = createSpinner("Loading groups...");
  spinner.start();

  try {
    const project = await resolveProject(selection);

    const groups = await prisma.projectGroup.findMany({
      where: { projectId: project.id },
      include: {
        group: {
          select: {
            name: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    spinner.succeed(`Found ${groups.length} group(s)`);

    if (groups.length === 0) {
      notice("No groups found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["Name", "Description", "Added"],
      { colWidths: [30, 40, 20] }
    );

    groups.forEach((g) => {
      table.push([
        g.group.name,
        g.group.description || "-",
        g.createdAt.toLocaleDateString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load groups");
    error(err instanceof Error ? err.message : String(err));
  }
}

// Interactive versions
export async function handleListInteractive() {
  try {
    header("List Projects", "View all projects");
    await handleList();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleCreateInteractive() {
  try {
    header("Create Project", "Create a new project");

    const name = await prompt("Project name:", { required: true });
    const description = await prompt("Description (optional):", { required: false });
    const status = await select("Status:", ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"]);
    const priority = await select("Priority:", ["LOW", "MEDIUM", "HIGH", "URGENT"]);

    commandArgs.length = 0;
    commandArgs.push("create", name, description || "", "--status=" + status, "--priority=" + priority);
    await handleCreate();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleShowInteractive() {
  try {
    header("Show Project", "View project details");

    const projects = await prisma.project.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (projects.length === 0) {
      notice("No projects found.", "info");
      return;
    }

    const selected = await paginatedSelect(
      "Select project:",
      projects,
      (p, index) => `${index + 1}. ${p.code} - ${p.name}`,
      { pageSize: 15 }
    );

    if (!selected) return;

    commandArgs.length = 0;
    commandArgs.push("show", selected.code);
    await handleShow();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}
