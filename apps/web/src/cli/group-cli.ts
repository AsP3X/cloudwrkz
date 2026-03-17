#!/usr/bin/env node

/**
 * Group Management CLI Tool
 * 
 * Usage:
 *   pnpm cli group create <name> [description]
 *   pnpm cli group delete <name|number>
 *   pnpm cli group list
 *   pnpm cli group show <name|number>
 *   pnpm cli group update <name|number> <newName> [newDescription]
 *   pnpm cli group add-agent <groupName|number> <agentEmail|number>
 *   pnpm cli group remove-agent <groupName|number> <agentEmail|number>
 *   pnpm cli group list-agents <groupName|number>
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

// Get args - when called from index.ts, "group" is already removed
// When called directly, we need to handle it
const args = process.argv.slice(2);
const commandArgs = args[0] === "group" ? args.slice(1) : args;

// Check if this file is being run directly (not imported)
// When imported, process.argv[1] won't match this file path
// Also check if we're being called through index.ts (which includes "index.ts" or "cli/index")
const isRunDirectly = process.argv[1]?.includes("group-cli");
const isCalledFromIndex = process.argv[1]?.includes("cli/index") || process.argv[1]?.includes("index.ts");
const shouldExecute = isRunDirectly || (isCalledFromIndex && commandArgs.length > 0);

// Only show help and exit when the file is run directly with no arguments.
// When imported from the main CLI for interactive mode (no args), we must NOT exit here.
if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
Group Management CLI Tool

Commands:
  create <name> [description]              Create a new group
  delete <name|number>                     Delete a group
  list                                     List all groups
  show <name|number>                       Show group details with members
  update <name|number> <newName> [desc]    Update group name and/or description
  add-agent <group|number> <agent|number>  Add an agent to a group
  remove-agent <group|number> <agent|number> Remove an agent from a group
  list-agents <group|number>               List all agents in a group

Group Selection:
  You can select groups by name or by number. Use 'list' command first to see group numbers.
  Numbers are 1-based (first group = 1, second group = 2, etc.)

Agent Selection:
  You can select agents by email or by number. Use 'pnpm cli user list --role=AGENT' to see agent numbers.

Examples:
  # Create a group
  pnpm cli group create "Support Team" "Primary support team for customer issues"
  
  # List groups
  pnpm cli group list
  
  # Show group details
  pnpm cli group show "Support Team"
  pnpm cli group show 1  # Select first group from list
  
  # Update group
  pnpm cli group update "Support Team" "Customer Support" "Updated description"
  pnpm cli group update 1 "New Name" "New description"
  
  # Add agent to group
  pnpm cli group add-agent "Support Team" agent@example.com
  pnpm cli group add-agent 1 agent@example.com  # Select group by number
  pnpm cli group add-agent "Support Team" 2  # Select agent by number
  
  # Remove agent from group
  pnpm cli group remove-agent "Support Team" agent@example.com
  pnpm cli group remove-agent 1 agent@example.com
  
  # List agents in a group
  pnpm cli group list-agents "Support Team"
  pnpm cli group list-agents 1
  
  # Delete group
  pnpm cli group delete "Support Team"
  pnpm cli group delete 1
`);
  process.exit(0);
}

const command = commandArgs[0];

// Only run main if there's a command (non-interactive mode) and file is run directly or called from index
if (shouldExecute && command) {
  async function main() {
    try {
      switch (command) {
        case "create":
          await handleCreate();
          break;
        case "delete":
          await handleDelete();
          break;
        case "list":
          await handleList();
          break;
        case "show":
          await handleShow();
          break;
        case "update":
          await handleUpdate();
          break;
        case "add-agent":
          await handleAddAgent();
          break;
        case "remove-agent":
          await handleRemoveAgent();
          break;
        case "list-agents":
          await handleListAgents();
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

/**
 * Helper function to resolve group by name or number
 */
async function resolveGroup(selection: string) {
  // Check if selection is a number
  const groupIndex = parseInt(selection) - 1;
  
  if (!isNaN(groupIndex) && groupIndex >= 0) {
    // Selection is a number - fetch groups and select by index
    const groups = await prisma.group.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: "asc" },
    });

    if (groupIndex >= groups.length) {
      console.error(`Invalid group number: ${selection}. Only ${groups.length} group(s) found.`);
      console.error("\nRun 'pnpm cli group list' to see available groups.");
      process.exit(1);
    }

    return groups[groupIndex];
  } else {
    // Selection is a name
    const group = await prisma.group.findUnique({
      where: { name: selection },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    if (!group) {
      console.error(`Group with name "${selection}" not found`);
      console.error("\nRun 'pnpm cli group list' to see available groups.");
      process.exit(1);
    }

    return group;
  }
}

/**
 * Helper function to resolve agent by email or number
 */
async function resolveAgent(selection: string) {
  // Check if selection is a number
  const agentIndex = parseInt(selection) - 1;
  
  if (!isNaN(agentIndex) && agentIndex >= 0) {
    // Selection is a number - fetch agents and select by index
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "ADMIN", "MODERATOR"] },
        status: { in: ["ACTIVE", "PENDING"] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    });

    if (agentIndex >= agents.length) {
      console.error(`Invalid agent number: ${selection}. Only ${agents.length} agent(s) found.`);
      console.error("\nRun 'pnpm cli user list --role=AGENT' to see available agents.");
      process.exit(1);
    }

    return agents[agentIndex];
  } else {
    // Selection is an email
    const agent = await prisma.user.findUnique({
      where: { email: selection },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!agent) {
      console.error(`Agent with email ${selection} not found`);
      console.error("\nRun 'pnpm cli user list --role=AGENT' to see available agents.");
      process.exit(1);
    }

    // Verify the user is an agent, admin, or moderator
    if (!["AGENT", "ADMIN", "MODERATOR"].includes(agent.role)) {
      console.error(`User ${selection} is not an agent, admin, or moderator (current role: ${agent.role})`);
      process.exit(1);
    }

    return agent;
  }
}

async function handleCreate() {
  if (commandArgs.length < 2) {
    console.error("Usage: create <name> [description]");
    process.exit(1);
  }

  const name = commandArgs[1];
  const description = commandArgs[2] || null;

  if (!name || name.trim().length === 0) {
    console.error("Group name cannot be empty");
    process.exit(1);
  }

  // Check if group already exists
  const existing = await prisma.group.findUnique({
    where: { name: name.trim() },
    select: { id: true },
  });

  if (existing) {
    console.error(`Group with name "${name}" already exists`);
    process.exit(1);
  }

  // Create group
  const group = await prisma.group.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
    },
  });

  console.log("✅ Group created successfully!");
  console.log(JSON.stringify(group, null, 2));
}

async function handleDelete() {
  if (commandArgs.length < 2) {
    console.error("Usage: delete <name|number>");
    console.error("\nTip: Use 'list' command first to see group numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const group = await resolveGroup(selection);

  // Check if group has tickets assigned
  const ticketCount = await prisma.ticket.count({
    where: { assignedToGroupId: group.id },
  });

  if (ticketCount > 0) {
    console.error(`Cannot delete group "${group.name}": ${ticketCount} ticket(s) are assigned to this group.`);
    console.error("Please reassign or remove tickets before deleting the group.");
    process.exit(1);
  }

  // Delete group (cascade will handle memberships)
  await prisma.group.delete({
    where: { id: group.id },
  });

  console.log(`✅ Group "${group.name}" deleted successfully!`);
}

async function handleList() {
  const spinner = createSpinner("Loading groups...");
  spinner.start();

  try {
    const groups = await prisma.group.findMany({
      include: {
        _count: {
          select: {
            members: true,
            tickets: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    spinner.succeed(`Found ${groups.length} group(s)`);

    if (groups.length === 0) {
      notice("No groups found in the system.", "info");
      return;
    }

    separator();

    const table = createTable(
      ["#", "Name", "Description", "Members", "Tickets", "Created"],
      { colWidths: [4, 25, 30, 10, 10, 12] }
    );

    groups.forEach((g, index) => {
      table.push([
        (index + 1).toString(),
        g.name,
        g.description || "-",
        g._count.members.toString(),
        g._count.tickets.toString(),
        g.createdAt.toLocaleDateString(),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    spinner.fail("Failed to load groups");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <name|number>");
    console.error("\nTip: Use 'list' command first to see group numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const group = await resolveGroup(selection);

  // Get full group details with members
  const fullGroup = await prisma.group.findUnique({
    where: { id: group.id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      _count: {
        select: {
          members: true,
          tickets: true,
        },
      },
    },
  });

  if (!fullGroup) {
    console.error(`Group not found`);
    process.exit(1);
  }

  console.log("\n📋 Group Details:\n");
  console.log(`ID:          ${fullGroup.id}`);
  console.log(`Name:        ${fullGroup.name}`);
  console.log(`Description: ${fullGroup.description || "-"}`);
  console.log(`Created:     ${fullGroup.createdAt.toLocaleString()}`);
  console.log(`Updated:     ${fullGroup.updatedAt.toLocaleString()}`);
  console.log(`\n📊 Statistics:`);
  console.log(`  Members: ${fullGroup._count.members}`);
  console.log(`  Tickets: ${fullGroup._count.tickets}`);

  if (fullGroup.members.length > 0) {
    console.log(`\n👥 Members (${fullGroup.members.length}):\n`);
    console.table(
      fullGroup.members.map((m) => ({
        Email: m.user.email,
        Name: m.user.name || "-",
        Role: m.user.role,
        Status: m.user.status,
        "Added": m.createdAt.toLocaleDateString(),
      }))
    );
  } else {
    console.log(`\n👥 Members: None`);
  }
}

async function handleUpdate() {
  if (commandArgs.length < 3) {
    console.error("Usage: update <name|number> <newName> [newDescription]");
    console.error("\nTip: Use 'list' command first to see group numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const newName = commandArgs[2];
  const newDescription = commandArgs[3] || null;

  if (!newName || newName.trim().length === 0) {
    console.error("Group name cannot be empty");
    process.exit(1);
  }

  const group = await resolveGroup(selection);

  // Check if new name conflicts with existing group
  if (newName.trim() !== group.name) {
    const existing = await prisma.group.findUnique({
      where: { name: newName.trim() },
      select: { id: true },
    });

    if (existing) {
      console.error(`Group with name "${newName}" already exists`);
      process.exit(1);
    }
  }

  const updated = await prisma.group.update({
    where: { id: group.id },
    data: {
      name: newName.trim(),
      description: newDescription?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
    },
  });

  console.log("✅ Group updated successfully!");
  console.log(JSON.stringify(updated, null, 2));
}

async function handleAddAgent() {
  if (commandArgs.length < 3) {
    console.error("Usage: add-agent <groupName|number> <agentEmail|number>");
    console.error("\nTip: Use 'list' command first to see group numbers");
    console.error("Tip: Use 'pnpm cli user list --role=AGENT' to see agent numbers");
    process.exit(1);
  }

  const groupSelection = commandArgs[1];
  const agentSelection = commandArgs[2];

  const group = await resolveGroup(groupSelection);
  const agent = await resolveAgent(agentSelection);

  // Check if agent is already a member
  const existing = await prisma.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId: agent.id,
        groupId: group.id,
      },
    },
  });

  if (existing) {
    console.log(`Agent ${agent.email}${agent.name ? ` (${agent.name})` : ""} is already a member of group "${group.name}"`);
    return;
  }

  // Add agent to group
  await prisma.groupMembership.create({
    data: {
      userId: agent.id,
      groupId: group.id,
    },
  });

  console.log(`✅ Agent ${agent.email}${agent.name ? ` (${agent.name})` : ""} added to group "${group.name}"`);
}

async function handleRemoveAgent() {
  if (commandArgs.length < 3) {
    console.error("Usage: remove-agent <groupName|number> <agentEmail|number>");
    console.error("\nTip: Use 'list' command first to see group numbers");
    console.error("Tip: Use 'pnpm cli user list --role=AGENT' to see agent numbers");
    process.exit(1);
  }

  const groupSelection = commandArgs[1];
  const agentSelection = commandArgs[2];

  const group = await resolveGroup(groupSelection);
  const agent = await resolveAgent(agentSelection);

  // Check if agent is a member
  const membership = await prisma.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId: agent.id,
        groupId: group.id,
      },
    },
  });

  if (!membership) {
    console.log(`Agent ${agent.email}${agent.name ? ` (${agent.name})` : ""} is not a member of group "${group.name}"`);
    return;
  }

  // Remove agent from group
  await prisma.groupMembership.delete({
    where: {
      userId_groupId: {
        userId: agent.id,
        groupId: group.id,
      },
    },
  });

  console.log(`✅ Agent ${agent.email}${agent.name ? ` (${agent.name})` : ""} removed from group "${group.name}"`);
}

async function handleListAgents() {
  if (commandArgs.length < 2) {
    console.error("Usage: list-agents <groupName|number>");
    console.error("\nTip: Use 'list' command first to see group numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const group = await resolveGroup(selection);

  // Get group members
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: group.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (memberships.length === 0) {
    console.log(`\nNo agents found in group "${group.name}"`);
    return;
  }

  console.log(`\nAgents in group "${group.name}" (${memberships.length}):\n`);
  console.table(
    memberships.map((m, index) => ({
      "#": index + 1,
      Email: m.user.email,
      Name: m.user.name || "-",
      Role: m.user.role,
      Status: m.user.status,
      "Added": m.createdAt.toLocaleDateString(),
    }))
  );
}

// Helper function to select group interactively
async function selectGroupInteractively(): Promise<{ id: string; name: string; description: string | null } | null> {
  const groups = await prisma.group.findMany({
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: { name: "asc" },
  });

  if (groups.length === 0) {
    console.error("No groups found");
    return null;
  }

  console.log("\nAvailable groups:");
  groups.forEach((g, index) => {
    console.log(`${index + 1}. ${g.name}${g.description ? ` - ${g.description}` : ""}`);
  });

  const groupChoice = await prompt("\nEnter group name or number: ");
  const groupIndex = parseInt(groupChoice) - 1;

  if (!isNaN(groupIndex) && groupIndex >= 0 && groupIndex < groups.length) {
    return groups[groupIndex];
  } else {
    const group = groups.find((g) => g.name.toLowerCase() === groupChoice.toLowerCase());
    if (!group) {
      console.error(`Group not found: ${groupChoice}`);
      return null;
    }
    return group;
  }
}

// Helper function to select agent interactively
async function selectAgentInteractively(): Promise<{ id: string; email: string; name: string | null; role: string } | null> {
  const agents = await prisma.user.findMany({
    where: {
      role: { in: ["AGENT", "ADMIN", "MODERATOR"] },
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
  });

  if (agents.length === 0) {
    console.error("No agents found");
    return null;
  }

  console.log("\nAvailable agents:");
  agents.forEach((a, index) => {
    console.log(`${index + 1}. ${a.email} - ${a.role}${a.name ? ` (${a.name})` : ""}`);
  });

  const agentChoice = await prompt("\nEnter agent email or number: ");
  const agentIndex = parseInt(agentChoice) - 1;

  if (!isNaN(agentIndex) && agentIndex >= 0 && agentIndex < agents.length) {
    return agents[agentIndex];
  } else {
    const agent = agents.find((a) => a.email.toLowerCase() === agentChoice.toLowerCase());
    if (!agent) {
      console.error(`Agent not found: ${agentChoice}`);
      return null;
    }
    return agent;
  }
}

// Interactive versions of handlers
export async function handleCreateInteractive() {
  try {
    header("Create New Group", "Add a new group to the system");

    const name = await prompt("Group name:", {
      required: true,
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return "Group name cannot be empty";
        }
        return true;
      },
    });

    const spinner = createSpinner("Checking if group exists...");
    spinner.start();

    const existing = await prisma.group.findUnique({
      where: { name: name.trim() },
      select: { id: true },
    });

    if (existing) {
      spinner.fail("Group already exists");
      error(`Group with name "${name}" already exists`);
      return;
    }
    spinner.succeed("Group name available");

    const description = await prompt("Description (optional, press Enter to skip):", {
      required: false,
    });

    const createSpinner2 = createSpinner("Creating group...");
    createSpinner2.start();

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
      },
    });

    createSpinner2.succeed("Group created successfully");

    separator();
    sectionHeader("Group Created");
    displayKeyValue("ID", group.id);
    displayKeyValue("Name", group.name);
    displayKeyValue("Description", group.description || "-");
    displayKeyValue("Created", group.createdAt.toLocaleString());
    success("Group has been created successfully!");
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleListInteractive() {
  try {
    header("List Groups", "View all groups in the system");
    await handleList();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleShowInteractive() {
  try {
    await handleList();
    separator();

    const group = await selectGroupInteractively();
    if (!group) return;

    // Use existing handleShow logic but set commandArgs temporarily
    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("show", group.name);
    await handleShow();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleUpdateInteractive() {
  try {
    await handleList();
    separator();

    const group = await selectGroupInteractively();
    if (!group) return;

    const newName = await prompt(`New name (current: ${group.name}): `);
    if (!newName || newName.trim().length === 0) {
      console.error("Group name cannot be empty");
      return;
    }

    // Check if new name conflicts with existing group
    if (newName.trim() !== group.name) {
      const existing = await prisma.group.findUnique({
        where: { name: newName.trim() },
        select: { id: true },
      });

      if (existing) {
        console.error(`Group with name "${newName}" already exists`);
        return;
      }
    }

    const newDescription = await prompt(`New description (current: ${group.description || "None"}, press Enter to skip): `);

    const updated = await prisma.group.update({
      where: { id: group.id },
      data: {
        name: newName.trim(),
        description: newDescription?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
      },
    });

    console.log("\n✅ Group updated successfully!");
    console.log(JSON.stringify(updated, null, 2));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleAddAgentInteractive() {
  try {
    await handleList();
    separator();

    const group = await selectGroupInteractively();
    if (!group) return;

    separator();
    const agent = await selectAgentInteractively();
    if (!agent) return;

    // Check if agent is already a member
    const existing = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: agent.id,
          groupId: group.id,
        },
      },
    });

    if (existing) {
      console.log(`\nAgent ${agent.email}${agent.name ? ` (${agent.name})` : ""} is already a member of group "${group.name}"`);
      return;
    }

    // Add agent to group
    await prisma.groupMembership.create({
      data: {
        userId: agent.id,
        groupId: group.id,
      },
    });

    console.log(`\n✅ Agent ${agent.email}${agent.name ? ` (${agent.name})` : ""} added to group "${group.name}"`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleRemoveAgentInteractive() {
  try {
    await handleList();
    separator();

    const group = await selectGroupInteractively();
    if (!group) return;

    // List agents in this group
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: group.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (memberships.length === 0) {
      console.log(`\nNo agents found in group "${group.name}"`);
      return;
    }

    console.log(`\nAgents in group "${group.name}":`);
    memberships.forEach((m, index) => {
      console.log(`${index + 1}. ${m.user.email} - ${m.user.role}${m.user.name ? ` (${m.user.name})` : ""}`);
    });

    separator();
    const agent = await selectAgentInteractively();
    if (!agent) return;

    // Check if agent is a member
    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: agent.id,
          groupId: group.id,
        },
      },
    });

    if (!membership) {
      console.log(`\nAgent ${agent.email}${agent.name ? ` (${agent.name})` : ""} is not a member of group "${group.name}"`);
      return;
    }

    // Remove agent from group
    await prisma.groupMembership.delete({
      where: {
        userId_groupId: {
          userId: agent.id,
          groupId: group.id,
        },
      },
    });

    console.log(`\n✅ Agent ${agent.email}${agent.name ? ` (${agent.name})` : ""} removed from group "${group.name}"`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleListAgentsInteractive() {
  try {
    await handleList();
    separator();

    const group = await selectGroupInteractively();
    if (!group) return;

    // Use existing handleListAgents logic but set commandArgs temporarily
    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("list-agents", group.name);
    await handleListAgents();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleDeleteInteractive() {
  try {
    await handleList();
    separator();

    const group = await selectGroupInteractively();
    if (!group) return;

    // Check if group has tickets assigned
    const ticketCount = await prisma.ticket.count({
      where: { assignedToGroupId: group.id },
    });

    if (ticketCount > 0) {
      console.error(`\nCannot delete group "${group.name}": ${ticketCount} ticket(s) are assigned to this group.`);
      console.error("Please reassign or remove tickets before deleting the group.");
      return;
    }

    const confirmed = await confirm(`\nAre you sure you want to delete group "${group.name}"?`, false);
    if (!confirmed) {
      console.log("Deletion cancelled.");
      return;
    }

    // Delete group (cascade will handle memberships)
    await prisma.group.delete({
      where: { id: group.id },
    });

    console.log(`\n✅ Group "${group.name}" deleted successfully!`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}
