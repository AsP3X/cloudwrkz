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

// Get args - when called from index.ts, "group" is already removed
// When called directly, we need to handle it
const args = process.argv.slice(2);
const commandArgs = args[0] === "group" ? args.slice(1) : args;

if (commandArgs.length === 0) {
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

  if (groups.length === 0) {
    console.log("No groups found");
    return;
  }

  console.log(`\nFound ${groups.length} group(s):\n`);
  console.table(
    groups.map((g, index) => ({
      "#": index + 1,
      Name: g.name,
      Description: g.description || "-",
      Members: g._count.members,
      Tickets: g._count.tickets,
      Created: g.createdAt.toLocaleDateString(),
    }))
  );
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

main();
