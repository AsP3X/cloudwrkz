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
import { prompt, promptPassword, select, confirm, separator } from "./prompts";

// Get args - when called from index.ts, "user" is already removed
// When called directly, we need to handle it
const args = process.argv.slice(2);
const commandArgs = args[0] === "user" ? args.slice(1) : args;

// Check if this file is being run directly (not imported)
// When imported, process.argv[1] won't match this file path
const isRunDirectly = process.argv[1]?.includes("user-cli");

if (isRunDirectly && commandArgs.length === 0) {
  console.log(`
User Management CLI Tool

Commands:
  create <email> <password> [name]     Create a new user
  delete <email|number>                Permanently delete a user and all associated data
  list [--status=STATUS] [--role=ROLE] List users with optional filters
  show <email>                         Show user details
  update-status <email|number> <status> Update user status (PENDING|ACTIVE|SUSPENDED|DELETED)
  update-role <email|number> <role>    Update user role (USER|ADMIN|MODERATOR|AGENT)
  update-password <email|number> <password> Update user password
  cookie-accept <email|number>         Accept cookie consent for a user
  cookie-revoke <email|number>         Revoke cookie consent for a user
  cookie-status <email|number>         Check cookie consent status for a user
  verify <email|number>                Verify user email and optionally activate account

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
  
  # Cookie consent management (by email or number)
  pnpm cli user cookie-accept user@example.com
  pnpm cli user cookie-revoke user@example.com
  pnpm cli user cookie-status user@example.com
  
  # Verify user email (by email or number)
  pnpm cli user verify user@example.com
  pnpm cli user verify 1  # Verify first user from list
  
  # Delete user (by email or number)
  pnpm cli user delete user@example.com
  pnpm cli user delete 1  # Delete first user from list

Status Options: PENDING, ACTIVE, SUSPENDED, DELETED
Role Options: USER, ADMIN, MODERATOR, AGENT
`);
  process.exit(0);
}

const command = commandArgs[0];

// Only run main if there's a command (non-interactive mode) and file is run directly
if (isRunDirectly && command) {
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
        case "cookie-accept":
          await handleCookieAccept();
          break;
        case "cookie-revoke":
          await handleCookieRevoke();
          break;
        case "cookie-status":
          await handleCookieStatus();
          break;
        case "verify":
          await handleVerify();
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
    console.error("Usage: delete <email|number>");
    console.error("\nTip: Use 'list' command first to see user numbers");
    console.error("\n⚠️  WARNING: This will permanently delete the user and all associated data!");
    console.error("   - All tickets created by the user");
    console.error("   - All ticket comments by the user");
    console.error("   - All sessions");
    console.error("   - All group memberships");
    console.error("   - This action cannot be undone!");
    process.exit(1);
  }

  const selection = commandArgs[1];
  let userId: string;
  let userEmail: string;
  let userName: string | null;

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
        _count: {
          select: {
            createdTickets: true,
            assignedTickets: true,
            ticketComments: true,
            sessions: true,
            groupMemberships: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    const selectedUser = users[userIndex];
    userId = selectedUser.id;
    userEmail = selectedUser.email;
    userName = selectedUser.name;

    console.log(`\n⚠️  WARNING: You are about to permanently delete:`);
    console.log(`   User: ${userEmail}${userName ? ` (${userName})` : ""}`);
    console.log(`   Status: ${selectedUser.status} | Role: ${selectedUser.role}`);
    console.log(`\n   This will also delete:`);
    console.log(`   - ${selectedUser._count.createdTickets} ticket(s) created by this user`);
    console.log(`   - ${selectedUser._count.ticketComments} ticket comment(s)`);
    console.log(`   - ${selectedUser._count.sessions} session(s)`);
    console.log(`   - ${selectedUser._count.groupMemberships} group membership(s)`);
    console.log(`   - ${selectedUser._count.assignedTickets} ticket assignment(s) will be unassigned`);
    console.log(`\n   This action CANNOT be undone!`);
  } else {
    // Selection is an email
    const user = await prisma.user.findUnique({
      where: { email: selection },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        role: true,
        _count: {
          select: {
            createdTickets: true,
            assignedTickets: true,
            ticketComments: true,
            sessions: true,
            groupMemberships: true,
          },
        },
      },
    });

    if (!user) {
      console.error(`User with email ${selection} not found`);
      process.exit(1);
    }

    userId = user.id;
    userEmail = user.email;
    userName = user.name;

    console.log(`\n⚠️  WARNING: You are about to permanently delete:`);
    console.log(`   User: ${userEmail}${userName ? ` (${userName})` : ""}`);
    console.log(`   Status: ${user.status} | Role: ${user.role}`);
    console.log(`\n   This will also delete:`);
    console.log(`   - ${user._count.createdTickets} ticket(s) created by this user`);
    console.log(`   - ${user._count.ticketComments} ticket comment(s)`);
    console.log(`   - ${user._count.sessions} session(s)`);
    console.log(`   - ${user._count.groupMemberships} group membership(s)`);
    console.log(`   - ${user._count.assignedTickets} ticket assignment(s) will be unassigned`);
    console.log(`\n   This action CANNOT be undone!`);
  }

  // Delete all user sessions first
  await prisma.session.deleteMany({
    where: { userId },
  });

  // Delete the user account - cascading deletes will handle related data
  // This will delete:
  // - All tickets created by the user (Cascade)
  // - All ticket comments by the user (Cascade)
  // - All group memberships (Cascade)
  // - Assigned tickets will be unassigned (SetNull)
  await prisma.user.delete({
    where: { id: userId },
  });

  console.log(`\n✅ User ${userEmail}${userName ? ` (${userName})` : ""} and all associated data deleted successfully!`);
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
      cookieConsentAccepted: true,
      cookieConsentAcceptedAt: true,
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
      "Cookie Consent": u.cookieConsentAccepted ? "✓" : "✗",
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
      cookieConsentAccepted: true,
      cookieConsentAcceptedAt: true,
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
  console.log(`Cookie Consent:  ${user.cookieConsentAccepted ? "Yes" : "No"}`);
  if (user.cookieConsentAcceptedAt) {
    console.log(`Consent Date:    ${user.cookieConsentAcceptedAt.toLocaleString()}`);
  }
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

async function handleCookieAccept() {
  if (commandArgs.length < 2) {
    console.error("Usage: cookie-accept <email|number>");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
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
        cookieConsentAccepted: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    email = users[userIndex].email;
    console.log(`Selected user: ${email}${users[userIndex].name ? ` (${users[userIndex].name})` : ""} - Current consent: ${users[userIndex].cookieConsentAccepted ? "Accepted" : "Not accepted"}`);
  } else {
    // Selection is an email
    email = selection;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, cookieConsentAccepted: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  if (user.cookieConsentAccepted) {
    console.log(`User ${user.email}${user.name ? ` (${user.name})` : ""} has already accepted cookie consent`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: {
      cookieConsentAccepted: true,
      cookieConsentAcceptedAt: new Date(),
    },
  });

  console.log(`✅ Cookie consent accepted for user ${user.email}${user.name ? ` (${user.name})` : ""}`);
}

async function handleCookieRevoke() {
  if (commandArgs.length < 2) {
    console.error("Usage: cookie-revoke <email|number>");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
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
        cookieConsentAccepted: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    email = users[userIndex].email;
    console.log(`Selected user: ${email}${users[userIndex].name ? ` (${users[userIndex].name})` : ""} - Current consent: ${users[userIndex].cookieConsentAccepted ? "Accepted" : "Not accepted"}`);
  } else {
    // Selection is an email
    email = selection;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, cookieConsentAccepted: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  if (!user.cookieConsentAccepted) {
    console.log(`User ${user.email}${user.name ? ` (${user.name})` : ""} has not accepted cookie consent yet`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: {
      cookieConsentAccepted: false,
      cookieConsentAcceptedAt: null,
    },
  });

  console.log(`✅ Cookie consent revoked for user ${user.email}${user.name ? ` (${user.name})` : ""}`);
  console.log(`   The user will see the cookie banner again on their next visit.`);
}

async function handleCookieStatus() {
  if (commandArgs.length < 2) {
    console.error("Usage: cookie-status <email|number>");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
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

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      cookieConsentAccepted: true,
      cookieConsentAcceptedAt: true,
    },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  console.log("\n🍪 Cookie Consent Status:\n");
  console.log(`User:            ${user.email}${user.name ? ` (${user.name})` : ""}`);
  console.log(`Status:          ${user.cookieConsentAccepted ? "✅ Accepted" : "❌ Not accepted"}`);
  if (user.cookieConsentAcceptedAt) {
    console.log(`Accepted Date:   ${user.cookieConsentAcceptedAt.toLocaleString()}`);
    const daysSince = Math.floor((Date.now() - user.cookieConsentAcceptedAt.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`Days Since:      ${daysSince} day(s) ago`);
  } else {
    console.log(`Accepted Date:   Never`);
  }
}

async function handleVerify() {
  if (commandArgs.length < 2) {
    console.error("Usage: verify <email|number>");
    console.error("\nTip: Use 'list' command first to see user numbers");
    process.exit(1);
  }

  const selection = commandArgs[1];
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
        emailVerified: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (userIndex >= users.length) {
      console.error(`Invalid user number: ${selection}. Only ${users.length} user(s) found.`);
      console.error("\nRun 'pnpm cli user list' to see available users.");
      process.exit(1);
    }

    email = users[userIndex].email;
    console.log(`Selected user: ${email}${users[userIndex].name ? ` (${users[userIndex].name})` : ""} - Email verified: ${users[userIndex].emailVerified ? "Yes" : "No"}, Status: ${users[userIndex].status}`);
  } else {
    // Selection is an email
    email = selection;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, status: true, emailVerified: true },
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  if (user.emailVerified) {
    console.log(`User ${user.email}${user.name ? ` (${user.name})` : ""} is already verified`);
    if (user.status !== "ACTIVE") {
      console.log(`Note: User status is ${user.status}. Consider updating status to ACTIVE for full access.`);
    }
    return;
  }

  // Update email verification and optionally set status to ACTIVE if PENDING
  const updateData: { emailVerified: boolean; status?: "ACTIVE" } = {
    emailVerified: true,
  };

  if (user.status === "PENDING") {
    updateData.status = "ACTIVE";
    await prisma.user.update({
      where: { email },
      data: updateData,
    });
    console.log(`✅ User ${user.email}${user.name ? ` (${user.name})` : ""} email verified and account activated (status changed from PENDING to ACTIVE)`);
  } else {
    await prisma.user.update({
      where: { email },
      data: updateData,
    });
    console.log(`✅ User ${user.email}${user.name ? ` (${user.name})` : ""} email verified`);
    if (user.status !== "ACTIVE") {
      console.log(`Note: User status is ${user.status}. User will need ACTIVE status to access protected pages.`);
    }
  }
}

// Helper function to select user interactively
async function selectUserInteractively(): Promise<{ id: string; email: string; name: string | null } | null> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (users.length === 0) {
    console.error("No users found");
    return null;
  }

  // Display the list of users for selection
  console.log("\nAvailable users:");
  users.forEach((u, index) => {
    console.log(`${index + 1}. ${u.email} - ${u.status} [${u.role}]${u.name ? ` (${u.name})` : ""}`);
  });

  const userChoice = await prompt("\nEnter user email or number: ");
  const userIndex = parseInt(userChoice) - 1;

  if (!isNaN(userIndex) && userIndex >= 0 && userIndex < users.length) {
    return users[userIndex];
  } else {
    const user = users.find((u) => u.email.toLowerCase() === userChoice.toLowerCase());
    if (!user) {
      console.error(`User not found: ${userChoice}`);
      return null;
    }
    return user;
  }
}

// Interactive versions of handlers
export async function handleCreateInteractive() {
  try {
    console.log("Create New User\n");

    const email = await prompt("Email: ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error("Invalid email format");
      return;
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      console.error(`User with email ${email} already exists`);
      return;
    }

    const password = await promptPassword("Password: ");
    if (password.length < 8) {
      console.error("Password must be at least 8 characters long");
      return;
    }

    const name = await prompt("Name (optional, press Enter to skip): ");

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
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

    console.log("\n✅ User created successfully!");
    console.log(JSON.stringify(user, null, 2));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleListInteractive() {
  try {
    separator();
    const statusFilter = await select("Filter by status:", ["All", "PENDING", "ACTIVE", "SUSPENDED", "DELETED"]);
    const roleFilter = await select("Filter by role:", ["All", "USER", "ADMIN", "MODERATOR", "AGENT"]);

    const where: any = {};
    if (statusFilter !== "All") {
      where.status = statusFilter;
    }
    if (roleFilter !== "All") {
      where.role = roleFilter;
    }

    await handleListWithFilters(where);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

async function handleListWithFilters(where: any) {
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      cookieConsentAccepted: true,
      cookieConsentAcceptedAt: true,
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
  users.forEach((u, index) => {
    console.log(`${index + 1}. ${u.email} - ${u.status} [${u.role}] ${u.name ? `(${u.name})` : ""}`);
  });
  console.table(
    users.map((u: typeof users[0]) => ({
      Email: u.email,
      Name: u.name || "-",
      Role: u.role,
      Status: u.status,
      Verified: u.emailVerified ? "✓" : "✗",
      "Cookie Consent": u.cookieConsentAccepted ? "✓" : "✗",
      Created: u.createdAt.toLocaleDateString(),
      "Last Login": u.lastLoginAt?.toLocaleDateString() || "Never",
    }))
  );
}

export async function handleShowInteractive() {
  try {
    // List users first
    await handleListWithFilters({});
    separator();

    const userChoice = await prompt("Enter user email or number: ");
    const userIndex = parseInt(userChoice) - 1;

    let email: string;
    const users = await prisma.user.findMany({
      select: { email: true },
      orderBy: { createdAt: "desc" },
    });

    if (!isNaN(userIndex) && userIndex >= 0 && userIndex < users.length) {
      email = users[userIndex].email;
    } else {
      email = userChoice;
    }

    // Use existing handleShow logic but set commandArgs temporarily
    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("show", email);
    await handleShow();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleUpdateStatusInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const status = await select("Select new status:", ["PENDING", "ACTIVE", "SUSPENDED", "DELETED"]);

    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("update-status", user.email, status);
    await handleUpdateStatus();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleUpdateRoleInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const role = await select("Select new role:", ["USER", "ADMIN", "MODERATOR", "AGENT"]);

    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("update-role", user.email, role);
    await handleUpdateRole();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleUpdatePasswordInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const password = await promptPassword("Enter new password: ");
    if (password.length < 8) {
      console.error("Password must be at least 8 characters long");
      return;
    }

    const confirmPassword = await promptPassword("Confirm password: ");
    if (password !== confirmPassword) {
      console.error("Passwords do not match");
      return;
    }

    const hashedPassword = await hashPassword(password);

    await prisma.user.update({
      where: { email: user.email },
      data: { password: hashedPassword },
    });

    console.log(`✅ Password updated for user ${user.email}${user.name ? ` (${user.name})` : ""}`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleCookieAcceptInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("cookie-accept", user.email);
    await handleCookieAccept();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleCookieRevokeInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("cookie-revoke", user.email);
    await handleCookieRevoke();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleCookieStatusInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("cookie-status", user.email);
    await handleCookieStatus();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleVerifyInteractive() {
  try {
    await handleListWithFilters({});
    separator();

    const user = await selectUserInteractively();
    if (!user) return;

    const originalArgs = commandArgs.slice();
    commandArgs.length = 0;
    commandArgs.push("verify", user.email);
    await handleVerify();
    commandArgs.length = 0;
    commandArgs.push(...originalArgs);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}

export async function handleDeleteInteractive() {
  try {
    console.log("Delete User\n");

    const user = await selectUserInteractively();
    if (!user) return;

    separator();

    // Get full user details with counts
    const fullUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        role: true,
        _count: {
          select: {
            createdTickets: true,
            assignedTickets: true,
            ticketComments: true,
            sessions: true,
            groupMemberships: true,
          },
        },
      },
    });

    if (!fullUser) {
      console.error("User not found");
      return;
    }

    console.log(`\n⚠️  WARNING: You are about to permanently delete:`);
    console.log(`   User: ${fullUser.email}${fullUser.name ? ` (${fullUser.name})` : ""}`);
    console.log(`   Status: ${fullUser.status} | Role: ${fullUser.role}`);
    console.log(`\n   This will also delete:`);
    console.log(`   - ${fullUser._count.createdTickets} ticket(s) created by this user`);
    console.log(`   - ${fullUser._count.ticketComments} ticket comment(s)`);
    console.log(`   - ${fullUser._count.sessions} session(s)`);
    console.log(`   - ${fullUser._count.groupMemberships} group membership(s)`);
    console.log(`   - ${fullUser._count.assignedTickets} ticket assignment(s) will be unassigned`);
    console.log(`\n   This action CANNOT be undone!`);

    const confirmed = await confirm("\nAre you sure you want to delete this user?", false);
    if (!confirmed) {
      console.log("Deletion cancelled.");
      return;
    }

    // Delete all user sessions first
    await prisma.session.deleteMany({
      where: { userId: fullUser.id },
    });

    // Delete the user account
    await prisma.user.delete({
      where: { id: fullUser.id },
    });

    console.log(`\n✅ User ${fullUser.email}${fullUser.name ? ` (${fullUser.name})` : ""} and all associated data deleted successfully!`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
  }
}
