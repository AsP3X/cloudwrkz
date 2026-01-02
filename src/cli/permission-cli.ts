#!/usr/bin/env node

/**
 * Permission Management CLI Tool
 * 
 * Usage:
 *   pnpm cli permission list [--category=CATEGORY] [--module=MODULE]
 *   pnpm cli permission show <key>
 *   pnpm cli permission grant <group> <permission>
 *   pnpm cli permission revoke <group> <permission>
 *   pnpm cli permission list-group <group>
 *   pnpm cli permission grant-user <user-email> <permission>
 *   pnpm cli permission revoke-user <user-email> <permission>
 *   pnpm cli permission list-user <user-email>
 *   pnpm cli permission sync
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
  paginatedSelect,
  paginatedCheckbox,
} from "./prompts";
import chalk from "chalk";

const args = process.argv.slice(2);
const commandArgs = args[0] === "permission" ? args.slice(1) : args;

const isRunDirectly = process.argv[1]?.includes("permission-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Permission Management CLI Tool

Commands:
  list [--category=CATEGORY] [--module=MODULE]  List permissions with filters
  show <key>                                     Show permission details
  grant <group> <permission>                     Grant permission to group
  revoke <group> <permission>                    Revoke permission from group
  list-group <group>                             List permissions for a group
  grant-user <user-email> <permission>           Grant permission to user
  revoke-user <user-email> <permission>          Revoke permission from user
  list-user <user-email>                          List permissions for a user
  sync                                           Sync permissions from code definitions

Examples:
  pnpm cli permission list
  pnpm cli permission list --category=tickets
  pnpm cli permission grant "Support Team" "tickets.create"
  pnpm cli permission list-group "Support Team"
  pnpm cli permission grant-user "user@example.com" "tickets.create"
  pnpm cli permission list-user "user@example.com"
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
        case "grant":
          await handleGrant();
          break;
        case "revoke":
          await handleRevoke();
          break;
        case "list-group":
          await handleListGroup();
          break;
        case "sync":
          await handleSync();
          break;
        case "grant-user":
          await handleGrantUser();
          break;
        case "revoke-user":
          await handleRevokeUser();
          break;
        case "list-user":
          await handleListUser();
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
  const category = parsed.category as string | undefined;
  const moduleKey = parsed.module as string | undefined;

  const spinner = createSpinner("Loading permissions...");
  spinner.start();

  try {
    const where: any = {};
    if (category) where.category = category;
    if (moduleKey) where.module = moduleKey;

    const permissions = await prisma.permission.findMany({
      where,
      include: {
        _count: {
          select: {
            groupPermissions: true,
          },
        },
      },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    spinner.succeed(`Found ${permissions.length} permission(s)`);

    if (permissions.length === 0) {
      notice("No permissions found.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["Key", "Name", "Category", "Module", "Groups"],
      { colWidths: [30, 30, 15, 15, 10] }
    );

    permissions.forEach((p) => {
      table.push([
        p.key,
        p.name,
        p.category,
        p.module || "-",
        p._count.groupPermissions.toString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load permissions");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <key>");
    process.exit(1);
  }

  const key = commandArgs[1];
  const spinner = createSpinner("Loading permission details...");
  spinner.start();

  try {
    const permission = await prisma.permission.findUnique({
      where: { key },
      include: {
        groupPermissions: {
          include: {
            group: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    spinner.succeed("Permission details loaded");

    if (!permission) {
      error(`Permission with key "${key}" not found`);
      process.exit(1);
    }

    separator();
    sectionHeader("Permission Details");
    displayKeyValue("Key", permission.key);
    displayKeyValue("Name", permission.name);
    displayKeyValue("Description", permission.description || "-");
    displayKeyValue("Category", permission.category);
    displayKeyValue("Module", permission.module || "-");
    displayKeyValue("Groups", permission.groupPermissions.length.toString());

    if (permission.groupPermissions.length > 0) {
      separator();
      sectionHeader("Groups with this Permission");
      permission.groupPermissions.forEach((gp) => {
        console.log(chalk.gray(`  ${gp.group.name}`));
      });
    }
  } catch (err) {
    spinner.fail("Failed to load permission details");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleGrant(groupNameArg?: string, permissionKeyArg?: string) {
  const groupName = groupNameArg ?? commandArgs[1];
  const permissionKey = permissionKeyArg ?? commandArgs[2];

  if (!groupName || !permissionKey) {
    console.error("Usage: grant <group> <permission>");
    process.exit(1);
  }

  const spinner = createSpinner("Granting permission...");
  spinner.start();

  try {
    const group = await prisma.group.findUnique({
      where: { name: groupName },
      select: { id: true },
    });

    if (!group) {
      spinner.fail("Group not found");
      error(`Group "${groupName}" not found`);
      process.exit(1);
    }

    const permission = await prisma.permission.findUnique({
      where: { key: permissionKey },
      select: { id: true },
    });

    if (!permission) {
      spinner.fail("Permission not found");
      error(`Permission "${permissionKey}" not found`);
      process.exit(1);
    }

    const existing = await prisma.groupPermission.findUnique({
      where: {
        groupId_permissionId: {
          groupId: group.id,
          permissionId: permission.id,
        },
      },
    });

    if (existing) {
      spinner.succeed("Permission already granted");
      notice(`Group "${groupName}" already has permission "${permissionKey}"`, "info");
      return;
    }

    await prisma.groupPermission.create({
      data: {
        groupId: group.id,
        permissionId: permission.id,
      },
    });

    spinner.succeed("Permission granted");
    console.log(`\n✅ Permission "${permissionKey}" has been granted to group "${groupName}".`);
  } catch (err) {
    spinner.fail("Failed to grant permission");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleRevoke(groupNameArg?: string, permissionKeyArg?: string) {
  const groupName = groupNameArg ?? commandArgs[1];
  const permissionKey = permissionKeyArg ?? commandArgs[2];

  if (!groupName || !permissionKey) {
    console.error("Usage: revoke <group> <permission>");
    process.exit(1);
  }

  const spinner = createSpinner("Revoking permission...");
  spinner.start();

  try {
    const group = await prisma.group.findUnique({
      where: { name: groupName },
      select: { id: true },
    });

    if (!group) {
      spinner.fail("Group not found");
      error(`Group "${groupName}" not found`);
      process.exit(1);
    }

    const permission = await prisma.permission.findUnique({
      where: { key: permissionKey },
      select: { id: true },
    });

    if (!permission) {
      spinner.fail("Permission not found");
      error(`Permission "${permissionKey}" not found`);
      process.exit(1);
    }

    await prisma.groupPermission.delete({
      where: {
        groupId_permissionId: {
          groupId: group.id,
          permissionId: permission.id,
        },
      },
    });

    spinner.succeed("Permission revoked");
    console.log(`\n✅ Permission "${permissionKey}" has been revoked from group "${groupName}".`);
  } catch (err) {
    spinner.fail("Failed to revoke permission");
    if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
      notice(`Group "${groupName}" does not have permission "${permissionKey}"`, "info");
    } else {
      error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

async function handleListGroup() {
  if (commandArgs.length < 2) {
    console.error("Usage: list-group <group>");
    process.exit(1);
  }

  const groupName = commandArgs[1];
  const spinner = createSpinner("Loading group permissions...");
  spinner.start();

  try {
    const group = await prisma.group.findUnique({
      where: { name: groupName },
      select: { id: true, name: true },
    });

    if (!group) {
      spinner.fail("Group not found");
      error(`Group "${groupName}" not found`);
      process.exit(1);
    }

    const groupPermissions = await prisma.groupPermission.findMany({
      where: { groupId: group.id },
      include: {
        permission: {
          select: {
            key: true,
            name: true,
            category: true,
            module: true,
          },
        },
      },
      orderBy: {
        permission: {
          category: "asc",
        },
      },
    });

    spinner.succeed(`Found ${groupPermissions.length} permission(s)`);

    if (groupPermissions.length === 0) {
      notice(`Group "${groupName}" has no permissions.`, "info");
      return;
    }

    separator();
    sectionHeader(`Permissions for "${groupName}"`);

    const table = createTable(
      ["Key", "Name", "Category", "Module"],
      { colWidths: [30, 30, 15, 15] }
    );

    groupPermissions.forEach((gp) => {
      table.push([
        gp.permission.key,
        gp.permission.name,
        gp.permission.category,
        gp.permission.module || "-",
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load group permissions");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleSync() {
  notice("Permission sync functionality - use seed-permissions script: pnpm db:seed-permissions", "info");
}

async function handleGrantUser() {
  if (commandArgs.length < 3) {
    console.error("Usage: grant-user <user-email> <permission>");
    process.exit(1);
  }

  const userEmail = commandArgs[1];
  const permissionKey = commandArgs[2];

  const spinner = createSpinner("Granting permission...");
  spinner.start();

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email "${userEmail}" not found`);
      process.exit(1);
    }

    const permission = await prisma.permission.findUnique({
      where: { key: permissionKey },
      select: { id: true },
    });

    if (!permission) {
      spinner.fail("Permission not found");
      error(`Permission "${permissionKey}" not found`);
      process.exit(1);
    }

    const existing = await prisma.userPermission.findUnique({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
    });

    if (existing) {
      spinner.succeed("Permission already granted");
      notice(`User "${userEmail}" already has permission "${permissionKey}"`, "info");
      return;
    }

    await prisma.userPermission.create({
      data: {
        userId: user.id,
        permissionId: permission.id,
      },
    });

    spinner.succeed("Permission granted");
    console.log(`\n✅ Permission "${permissionKey}" has been granted to user "${userEmail}".`);
  } catch (err) {
    spinner.fail("Failed to grant permission");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleRevokeUser() {
  if (commandArgs.length < 3) {
    console.error("Usage: revoke-user <user-email> <permission>");
    process.exit(1);
  }

  const userEmail = commandArgs[1];
  const permissionKey = commandArgs[2];

  const spinner = createSpinner("Revoking permission...");
  spinner.start();

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email "${userEmail}" not found`);
      process.exit(1);
    }

    const permission = await prisma.permission.findUnique({
      where: { key: permissionKey },
      select: { id: true },
    });

    if (!permission) {
      spinner.fail("Permission not found");
      error(`Permission "${permissionKey}" not found`);
      process.exit(1);
    }

    await prisma.userPermission.delete({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
    });

    spinner.succeed("Permission revoked");
    console.log(`\n✅ Permission "${permissionKey}" has been revoked from user "${userEmail}".`);
  } catch (err) {
    spinner.fail("Failed to revoke permission");
    if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
      notice(`User "${userEmail}" does not have permission "${permissionKey}"`, "info");
    } else {
      error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

async function handleListUser() {
  if (commandArgs.length < 2) {
    console.error("Usage: list-user <user-email>");
    process.exit(1);
  }

  const userEmail = commandArgs[1];
  const spinner = createSpinner("Loading user permissions...");
  spinner.start();

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      spinner.fail("User not found");
      error(`User with email "${userEmail}" not found`);
      process.exit(1);
    }

    const userPermissions = await prisma.userPermission.findMany({
      where: { userId: user.id },
      include: {
        permission: {
          select: {
            key: true,
            name: true,
            category: true,
            module: true,
          },
        },
      },
      orderBy: {
        permission: {
          category: "asc",
        },
      },
    });

    spinner.succeed(`Found ${userPermissions.length} permission(s)`);

    if (userPermissions.length === 0) {
      notice(`User "${userEmail}" has no direct permissions.`, "info");
      return;
    }

    separator();
    sectionHeader(`Permissions for "${user.name || user.email}" (${user.email})`);

    const table = createTable(
      ["Key", "Name", "Category", "Module"],
      { colWidths: [30, 30, 15, 15] }
    );

    userPermissions.forEach((up) => {
      table.push([
        up.permission.key,
        up.permission.name,
        up.permission.category,
        up.permission.module || "-",
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load user permissions");
    error(err instanceof Error ? err.message : String(err));
  }
}

// Interactive versions

export async function handleListInteractive() {
  try {
    header("List Permissions", "View all permissions with optional filters");

    const useFilters = await confirm("Would you like to filter by category/module?", false);

    const flags: string[] = ["list"];

    if (useFilters) {
      const filterChoice = await select("Choose filter type:", ["category", "module", "both"], [
        "By category",
        "By module",
        "By category and module",
      ]);

      if (filterChoice === "category" || filterChoice === "both") {
        const category = await prompt("Enter category to filter by (e.g. tickets, projects, admin):", {
          required: true,
        });
        flags.push(`--category=${category}`);
      }

      if (filterChoice === "module" || filterChoice === "both") {
        const moduleKey = await prompt("Enter module key to filter by (e.g. tickets, projects, timetracking):", {
          required: true,
        });
        flags.push(`--module=${moduleKey}`);
      }
    }

    commandArgs.length = 0;
    commandArgs.push(...flags);

    await handleList();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleShowInteractive() {
  try {
    header("Show Permission Details", "View detailed information for a permission");

    const spinner = createSpinner("Loading permissions...");
    spinner.start();

    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    spinner.succeed(`Loaded ${permissions.length} permission(s)`);

    if (permissions.length === 0) {
      notice("No permissions found. Run the seed-permissions script first.", "warning");
      return;
    }

    const selected = await paginatedSelect(
      "Select a permission to view:",
      permissions,
      (p, index) => `${index + 1}. [${p.category}] ${p.name} (${p.key})`
    );

    if (!selected) {
      notice("No permission selected.", "warning");
      return;
    }

    commandArgs.length = 0;
    commandArgs.push("show", selected.key);

    await handleShow();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleGrantInteractive() {
  try {
    header("Grant Permission to Group", "Assign a permission to a group");

    const spinner = createSpinner("Loading groups and permissions...");
    spinner.start();

    const [groups, permissions] = await Promise.all([
      prisma.group.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.permission.findMany({
        orderBy: [{ category: "asc" }, { key: "asc" }],
      }),
    ]);

    spinner.succeed("Loaded groups and permissions");

    if (groups.length === 0) {
      notice("No groups found. Create a group first using the Group Management CLI.", "warning");
      return;
    }

    if (permissions.length === 0) {
      notice("No permissions found. Run the seed-permissions script first.", "warning");
      return;
    }

    const group = await paginatedSelect(
      "Select a group:",
      groups,
      (g, index) => `${index + 1}. ${g.name}${g.description ? ` - ${g.description}` : ""}`
    );

    if (!group) {
      notice("No group selected.", "warning");
      return;
    }

    const selectedPermissions = await paginatedCheckbox(
      "Select permission(s) to grant (use Space to toggle, Enter to confirm):",
      permissions,
      (p, index) => `${index + 1}. [${p.category}] ${p.name} (${p.key})`
    );

    if (!selectedPermissions || selectedPermissions.length === 0) {
      notice("No permissions selected.", "warning");
      return;
    }

    const confirmed = await confirm(
      `Grant ${selectedPermissions.length} permission(s) to group "${group.name}"?`,
      true
    );

    if (!confirmed) {
      notice("Permission grant cancelled.", "info");
      return;
    }

    for (const permission of selectedPermissions) {
      await handleGrant(group.name, permission.key);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleRevokeInteractive() {
  try {
    header("Revoke Permission from Group", "Remove a permission from a group");

    const spinner = createSpinner("Loading groups...");
    spinner.start();

    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
    });

    spinner.succeed(`Loaded ${groups.length} group(s)`);

    if (groups.length === 0) {
      notice("No groups found. Create a group first using the Group Management CLI.", "warning");
      return;
    }

    const group = await paginatedSelect(
      "Select a group:",
      groups,
      (g, index) => `${index + 1}. ${g.name}${g.description ? ` - ${g.description}` : ""}`
    );

    if (!group) {
      notice("No group selected.", "warning");
      return;
    }

    const permSpinner = createSpinner("Loading group permissions...");
    permSpinner.start();

    const groupPermissions = await prisma.groupPermission.findMany({
      where: { groupId: group.id },
      include: {
        permission: true,
      },
      orderBy: {
        permission: {
          category: "asc",
        },
      },
    });

    permSpinner.succeed(`Loaded ${groupPermissions.length} permission(s)`);

    if (groupPermissions.length === 0) {
      notice(`Group "${group.name}" has no permissions to revoke.`, "info");
      return;
    }

    const selectedPermissions = await paginatedCheckbox(
      "Select permission(s) to revoke (use Space to toggle, Enter to confirm):",
      groupPermissions,
      (gp, index) =>
        `${index + 1}. [${gp.permission.category}] ${gp.permission.name} (${gp.permission.key})`
    );

    if (!selectedPermissions || selectedPermissions.length === 0) {
      notice("No permissions selected.", "warning");
      return;
    }

    const confirmed = await confirm(
      `Revoke ${selectedPermissions.length} permission(s) from group "${group.name}"?`,
      true
    );

    if (!confirmed) {
      notice("Permission revoke cancelled.", "info");
      return;
    }

    for (const selected of selectedPermissions) {
      await handleRevoke(group.name, selected.permission.key);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleListGroupInteractive() {
  try {
    header("List Group Permissions", "View permissions assigned to a group");

    const spinner = createSpinner("Loading groups...");
    spinner.start();

    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
    });

    spinner.succeed(`Loaded ${groups.length} group(s)`);

    if (groups.length === 0) {
      notice("No groups found. Create a group first using the Group Management CLI.", "warning");
      return;
    }

    const group = await paginatedSelect(
      "Select a group:",
      groups,
      (g, index) => `${index + 1}. ${g.name}${g.description ? ` - ${g.description}` : ""}`
    );

    if (!group) {
      notice("No group selected.", "warning");
      return;
    }

    commandArgs.length = 0;
    commandArgs.push("list-group", group.name);

    await handleListGroup();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleSyncInteractive() {
  try {
    header("Sync Permissions", "Sync permission definitions into the database");

    const confirmed = await confirm(
      "This will not automatically seed permissions, but will show you the recommended seeding command. Continue?",
      true
    );

    if (!confirmed) {
      notice("Permission sync cancelled.", "info");
      return;
    }

    await handleSync();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}
