#!/usr/bin/env node

/**
 * User Management CLI Tool
 * 
 * Usage:
 *   pnpm cli user create <email> <password> [name]
 *   pnpm cli user delete <email>
 *   pnpm cli user list [--status=ACTIVE] [--role=USER]
 *   pnpm cli user show <email>
 *   pnpm cli user update-status <email> <status>
 *   pnpm cli user update-role <email> <role>
 *   pnpm cli user update-password <email> <newPassword>
 */

import { prisma } from "../lib/db/prisma";
import { hashPassword } from "../lib/utils/auth";

// Get args - when called from index.ts, "user" is already removed
// When called directly, we need to handle it
const args = process.argv.slice(2);
const commandArgs = args[0] === "user" ? args.slice(1) : args;

if (commandArgs.length === 0) {
  console.log(`
User Management CLI Tool

Commands:
  create <email> <password> [name]     Create a new user
  delete <email>                       Delete a user
  list [--status=STATUS] [--role=ROLE] List users with optional filters
  show <email>                         Show user details
  update-status <email|number> <status> Update user status (PENDING|ACTIVE|SUSPENDED|DELETED)
  update-role <email|number> <role>    Update user role (USER|ADMIN|MODERATOR|AGENT)
  update-password <email|number> <password> Update user password

User Selection:
  You can select users by email or by number. Use 'list' command first to see user numbers.
  Numbers are 1-based (first user = 1, second user = 2, etc.)

Examples:
  # Create a user
  pnpm cli user create admin@example.com SecurePass123 "Admin User"
  
  # List users (to see numbers)
  pnpm cli user list
  pnpm cli user list --status=ACTIVE --role=ADMIN
  
  # Show user details
  pnpm cli user show user@example.com
  
  # Update status (by email or number)
  pnpm cli user update-status user@example.com ACTIVE
  pnpm cli user update-status 1 ACTIVE  # Select first user from list
  
  # Update role (by email or number)
  pnpm cli user update-role user@example.com ADMIN
  pnpm cli user update-role 2 MODERATOR  # Select second user from list
  
  # Update password (by email or number)
  pnpm cli user update-password user@example.com NewPassword123
  pnpm cli user update-password 1 SecureNewPass123  # Select first user from list
  
  # Delete user
  pnpm cli user delete user@example.com

Status Options: PENDING, ACTIVE, SUSPENDED, DELETED
Role Options: USER, ADMIN, MODERATOR, AGENT
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
      case "update-status":
        await handleUpdateStatus();
        break;
      case "update-role":
        await handleUpdateRole();
        break;
      case "update-password":
        await handleUpdatePassword();
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

async function handleCreate() {
  if (commandArgs.length < 3) {
    console.error("Usage: create <email> <password> [name]");
    process.exit(1);
  }

  const email = commandArgs[1];
  const password = commandArgs[2];
  const name = commandArgs[3] || null;

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Invalid email format");
    process.exit(1);
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    console.error(`User with email ${email} already exists`);
    process.exit(1);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: "USER",
      status: "PENDING",
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  console.log("✅ User created successfully!");
  console.log(JSON.stringify(user, null, 2));
}

async function handleDelete() {
  if (commandArgs.length < 2) {
    console.error("Usage: delete <email>");
    process.exit(1);
  }

  const email = commandArgs[1];

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  // Delete user (cascade will handle related records)
  await prisma.user.delete({
    where: { email },
  });

  console.log(`✅ User ${email} deleted successfully!`);
}

async function handleList() {
  const where: any = {};

  // Parse filters
  for (let i = 1; i < commandArgs.length; i++) {
    const arg = commandArgs[i];
    if (arg.startsWith("--status=")) {
      const status = arg.split("=")[1];
      if (!["PENDING", "ACTIVE", "SUSPENDED", "DELETED"].includes(status)) {
        console.error(`Invalid status: ${status}`);
        process.exit(1);
      }
      where.status = status;
    } else if (arg.startsWith("--role=")) {
      const role = arg.split("=")[1];
      if (!["USER", "ADMIN", "MODERATOR", "AGENT"].includes(role)) {
        console.error(`Invalid role: ${role}`);
        process.exit(1);
      }
      where.role = role;
    }
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (users.length === 0) {
    console.log("No users found");
    return;
  }

  console.log(`\nFound ${users.length} user(s):\n`);
  console.table(
    users.map((u: typeof users[0]) => ({
      Email: u.email,
      Name: u.name || "-",
      Role: u.role,
      Status: u.status,
      Verified: u.emailVerified ? "✓" : "✗",
      Created: u.createdAt.toLocaleDateString(),
      "Last Login": u.lastLoginAt?.toLocaleDateString() || "Never",
    }))
  );
}

async function handleShow() {
  if (commandArgs.length < 2) {
    console.error("Usage: show <email>");
    process.exit(1);
  }

  const email = commandArgs[1];

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      avatar: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      _count: {
        select: {
          createdTickets: true,
          assignedTickets: true,
          ticketComments: true,
          sessions: true,
        },
      },
    },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  console.log("\n📋 User Details:\n");
  console.log(`ID:              ${user.id}`);
  console.log(`Email:           ${user.email}`);
  console.log(`Name:            ${user.name || "-"}`);
  console.log(`Role:            ${user.role}`);
  console.log(`Status:          ${user.status}`);
  console.log(`Email Verified:  ${user.emailVerified ? "Yes" : "No"}`);
  console.log(`Avatar:          ${user.avatar || "-"}`);
  console.log(`Bio:             ${user.bio || "-"}`);
  console.log(`Created:         ${user.createdAt.toLocaleString()}`);
  console.log(`Updated:         ${user.updatedAt.toLocaleString()}`);
  console.log(`Last Login:      ${user.lastLoginAt?.toLocaleString() || "Never"}`);
  console.log(`Last Login IP:   ${user.lastLoginIp || "-"}`);
  console.log(`\n📊 Statistics:`);
  console.log(`  Created Tickets:    ${user._count.createdTickets}`);
  console.log(`  Assigned Tickets:    ${user._count.assignedTickets}`);
  console.log(`  Ticket Comments:     ${user._count.ticketComments}`);
  console.log(`  Active Sessions:     ${user._count.sessions}`);
}

async function handleUpdateStatus() {
  if (commandArgs.length < 3) {
    console.error("Usage: update-status <email|number> <status>");
    console.error("Status must be one of: PENDING, ACTIVE, SUSPENDED, DELETED");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const status = commandArgs[2].toUpperCase();
  let email: string;

  // Check if selection is a number (for selecting from list)
  const userIndex = parseInt(selection) - 1;
  
  if (!isNaN(userIndex) && userIndex >= 0) {
    // Selection is a number - fetch users and select by index
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        role: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    email = users[userIndex].email;
    console.log(`Selected user: ${email}${users[userIndex].name ? ` (${users[userIndex].name})` : ""} - Current status: ${users[userIndex].status}`);
  } else {
    // Selection is an email
    email = selection;
  }

  // Validate status
  if (!["PENDING", "ACTIVE", "SUSPENDED", "DELETED"].includes(status)) {
    console.error(`Invalid status: ${status}`);
    console.error("Status must be one of: PENDING, ACTIVE, SUSPENDED, DELETED");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, status: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  if (user.status === status) {
    console.log(`User status is already ${status}`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { status: status as any },
  });

  console.log(`✅ User ${user.email}${user.name ? ` (${user.name})` : ""} status updated: ${user.status} → ${status}`);
}

async function handleUpdateRole() {
  if (commandArgs.length < 3) {
    console.error("Usage: update-role <email|number> <role>");
    console.error("Role must be one of: USER, ADMIN, MODERATOR, AGENT");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const role = commandArgs[2].toUpperCase();
  let email: string;

  // Check if selection is a number (for selecting from list)
  const userIndex = parseInt(selection) - 1;
  
  if (!isNaN(userIndex) && userIndex >= 0) {
    // Selection is a number - fetch users and select by index
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    email = users[userIndex].email;
    console.log(`Selected user: ${email}${users[userIndex].name ? ` (${users[userIndex].name})` : ""} - Current role: ${users[userIndex].role}`);
  } else {
    // Selection is an email
    email = selection;
  }

  if (!["USER", "ADMIN", "MODERATOR", "AGENT"].includes(role)) {
    console.error(`Invalid role: ${role}`);
    console.error("Role must be one of: USER, ADMIN, MODERATOR, AGENT");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`User role is already ${role}`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { role: role as any },
  });

  console.log(`✅ User ${user.email}${user.name ? ` (${user.name})` : ""} role updated: ${user.role} → ${role}`);
}

async function handleUpdatePassword() {
  if (commandArgs.length < 3) {
    console.error("Usage: update-password <email|number> <newPassword>");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
  const newPassword = commandArgs[2];
  let email: string;

  // Check if selection is a number (for selecting from list)
  const userIndex = parseInt(selection) - 1;
  
  if (!isNaN(userIndex) && userIndex >= 0) {
    // Selection is a number - fetch users and select by index
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    email = users[userIndex].email;
    console.log(`Selected user: ${email}${users[userIndex].name ? ` (${users[userIndex].name})` : ""}`);
  } else {
    // Selection is an email
    email = selection;
  }

  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters long");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  console.log(`✅ Password updated for user ${user.email}${user.name ? ` (${user.name})` : ""}`);
}

main();
