#!/usr/bin/env node

/**
 * CloudWrkz CLI Tool
 *
 * Main entry point for CLI commands
 *
 * Usage:
 *   pnpm cli                          Interactive mode
 *   pnpm cli user <command>           User management commands
 *   pnpm cli group <command>          Group management commands
 *   pnpm cli module <command>         Module management commands (future)
 *   pnpm cli help                     Show help
 */

import { menu, separator, prompt, confirm, clear } from "./prompts";
import { prisma } from "../lib/db/prisma";

const args = process.argv.slice(2);

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\nGoodbye! 👋\n");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Check for help flag
if (args.length > 0 && (args[0] === "help" || args[0] === "--help" || args[0] === "-h")) {
  showHelp();
  process.exit(0);
}

// If no arguments, start interactive mode
if (args.length === 0) {
  runInteractiveMode();
} else {
  // Non-interactive mode - execute command directly
  executeCommand(args);
}

async function runInteractiveMode() {
  while (true) {
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║       CloudWrkz CLI - Interactive Mode     ║");
    console.log("╚════════════════════════════════════════════╝\n");

    const choice = await menu("Select a category:", [
      { key: "u", label: "User Management" },
      { key: "g", label: "Group Management" },
      { key: "m", label: "Module Management (coming soon)" },
      { key: "h", label: "Show Help" },
      { key: "q", label: "Quit" },
    ]);

    switch (choice) {
      case "u":
        await runUserInteractive();
        break;
      case "g":
        await runGroupInteractive();
        break;
      case "m":
        clear();
        console.log("Module management commands coming soon!");
        await prompt("\nPress Enter to continue...");
        break;
      case "h":
        clear();
        showHelp();
        await prompt("\nPress Enter to continue...");
        break;
      case "q":
        clear();
        console.log("Goodbye! 👋\n");
        await prisma.$disconnect();
        process.exit(0);
        break;
    }
  }
}

async function runUserInteractive() {
  // Import user CLI functions once (modules are cached)
  const userCli = await import("./user-cli");

  while (true) {
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║         User Management                    ║");
    console.log("╚════════════════════════════════════════════╝\n");

    const choice = await menu("Select an option:", [
      { key: "s", label: "Select User (to perform actions)" },
      { key: "c", label: "Create User" },
      { key: "l", label: "List Users" },
      { key: "b", label: "Back to Main Menu" },
    ]);

    switch (choice) {
      case "s":
        // Select a user first, then show actions menu
        const selectedUser = await selectUserForActions();
        if (selectedUser) {
          await runUserActionsInteractive(selectedUser);
        }
        break;
      case "c":
        clear();
        await userCli.handleCreateInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "l":
        clear();
        await userCli.handleListInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "b":
        return;
    }
  }
}

async function selectUserForActions(): Promise<{ id: string; email: string; name: string | null } | null> {
  const { prisma } = await import("../lib/db/prisma");
  const { formatUserName } = await import("../lib/utils/users");
  
  clear();
  console.log("╔════════════════════════════════════════════╗");
  console.log("║         Select User                        ║");
  console.log("╚════════════════════════════════════════════╝\n");

  // Fetch users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      originalEmail: true,
      name: true,
      role: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (users.length === 0) {
    console.log("No users found.");
    await prompt("\nPress Enter to continue...");
    return null;
  }

  // Display users in a table format
  console.log(`Found ${users.length} user(s):\n`);
  users.forEach((u, index) => {
    const displayName = formatUserName(u);
    const emailDisplay = u.status === "DELETED" && u.originalEmail 
      ? ` (original: ${u.originalEmail})`
      : u.status !== "DELETED" && u.email !== displayName 
        ? ` (${u.email})`
        : "";
    console.log(`${index + 1}. ${displayName} - ${u.status} [${u.role}]${emailDisplay}`);
  });
  console.table(
    users.map((u) => ({
      "#": users.indexOf(u) + 1,
      Email: u.status === "DELETED" && u.originalEmail ? u.originalEmail : (u.status === "DELETED" ? formatUserName(u) : u.email),
      Name: u.status === "DELETED" ? formatUserName(u) : (u.name || "-"),
      Role: u.role,
      Status: u.status,
    }))
  );

  separator();

  // Create menu options for selection (using 1-based keys to match display)
  // For deleted users, show originalEmail if available, otherwise show current email
  const userOptions = users.map((u, index) => {
    const displayEmail = u.status === "DELETED" && u.originalEmail 
      ? u.originalEmail 
      : u.email;
    return {
      key: (index + 1).toString(),
      label: `${displayEmail}${u.name ? ` (${u.name})` : ""} - ${u.status} [${u.role}]`,
    };
  });

  // Add option to enter email manually
  userOptions.push({ key: "e", label: "Enter email manually" });
  userOptions.push({ key: "b", label: "Back" });

  try {
    const choice = await menu("Select a user:", userOptions);

    if (choice === "b") {
      return null;
    }

    if (choice === "e") {
      const emailInput = await prompt("Enter user email: ");
      if (!emailInput || emailInput.trim() === "") {
        console.error(`\nEmail cannot be empty`);
        await prompt("\nPress Enter to continue...");
        return null;
      }
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: emailInput.trim() },
            { originalEmail: emailInput.trim() },
          ],
        },
        select: {
          id: true,
          email: true,
          originalEmail: true,
          name: true,
          role: true,
          status: true,
        },
      });
      if (!user) {
        console.error(`\nUser not found: ${emailInput}`);
        await prompt("\nPress Enter to continue...");
        return null;
      }
      // For deleted users, show originalEmail in the confirmation message if available
      const displayEmail = user.status === "DELETED" && user.originalEmail 
        ? user.originalEmail 
        : user.email;
      console.log(`\n✅ Selected user: ${displayEmail}${user.name ? ` (${user.name})` : ""}`);
      await prompt("\nPress Enter to continue...");
      return user;
    }

    // Choice should be a number string like "1", "2", etc.
    const userIndex = parseInt(choice) - 1; // Convert back to 0-based index
    if (isNaN(userIndex) || userIndex < 0 || userIndex >= users.length) {
      console.error(`\nInvalid selection: ${choice}`);
      await prompt("\nPress Enter to continue...");
      return null;
    }

    const selectedUser = users[userIndex];
    if (!selectedUser) {
      console.error(`\nUser not found at index ${userIndex}`);
      await prompt("\nPress Enter to continue...");
      return null;
    }

    // For deleted users, show originalEmail in the confirmation message if available
    const displayEmail = selectedUser.status === "DELETED" && selectedUser.originalEmail 
      ? selectedUser.originalEmail 
      : selectedUser.email;
    console.log(`\n✅ Selected user: ${displayEmail}${selectedUser.name ? ` (${selectedUser.name})` : ""}`);
    await prompt("\nPress Enter to continue...");
    return selectedUser;
  } catch (error) {
    console.error(`\nError selecting user:`, error instanceof Error ? error.message : error);
    await prompt("\nPress Enter to continue...");
    return null;
  }
}

async function runUserActionsInteractive(selectedUser: { id: string; email: string; name: string | null }) {
  const userCli = await import("./user-cli");
  const { prisma } = await import("../lib/db/prisma");

  // Helper function to refresh user data
  const refreshUser = async () => {
    // Try to find by ID first (most reliable), then by email or originalEmail
    const refreshed = await prisma.user.findFirst({
      where: {
        OR: [
          { id: selectedUser.id },
          { email: selectedUser.email },
          { originalEmail: selectedUser.email },
        ],
      },
      select: {
        id: true,
        email: true,
        originalEmail: true,
        name: true,
        role: true,
        status: true,
      },
    });
    if (refreshed) {
      selectedUser.id = refreshed.id;
      selectedUser.email = refreshed.email; // Update to current email (might have changed after reactivation)
      selectedUser.name = refreshed.name;
    }
    return refreshed;
  };

  while (true) {
    // Refresh user data to show current info
    const refreshed = await refreshUser();
    
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║         User Actions                       ║");
    console.log("╚════════════════════════════════════════════╝\n");
    
    // For deleted users, show originalEmail if available, otherwise show current email
    const displayEmail = refreshed && refreshed.status === "DELETED" && refreshed.originalEmail
      ? refreshed.originalEmail
      : selectedUser.email;
    console.log(`Selected User: ${displayEmail}${selectedUser.name ? ` (${selectedUser.name})` : ""}\n`);

    const actions = [
      { key: "s", label: "Show User Details" },
      { key: "us", label: "Update User Status" },
      { key: "ur", label: "Update User Role" },
      { key: "up", label: "Update User Password" },
      { key: "v", label: "Verify User Email" },
      { key: "cc", label: "Cookie Consent Management" },
    ];
    
    // Add reactivate option if user is deleted
    if (refreshed && refreshed.status === "DELETED") {
      actions.push({ key: "r", label: "Reactivate User" });
    }
    
    actions.push(
      { key: "d", label: "Delete User" },
      { key: "c", label: "Change User" },
      { key: "b", label: "Back to User Management" }
    );

    const choice = await menu("Select an action:", actions);

    switch (choice) {
      case "s":
        clear();
        // Use the selected user directly - find by ID or email/originalEmail to handle reactivated users
        const { prisma } = await import("../lib/db/prisma");
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { id: selectedUser.id },
              { email: selectedUser.email },
              { originalEmail: selectedUser.email },
            ],
          },
          select: {
            id: true,
            email: true,
            originalEmail: true,
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

        if (user) {
          console.log("\n📋 User Details:\n");
          console.log(`ID:              ${user.id}`);
          // For deleted users, show originalEmail if available, otherwise show current email
          const displayEmail = user.status === "DELETED" && user.originalEmail
            ? user.originalEmail
            : user.email;
          console.log(`Email:           ${displayEmail}`);
          if (user.status === "DELETED" && user.originalEmail && user.email !== user.originalEmail) {
            console.log(`Current Email:   ${user.email} (deleted format)`);
          }
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
        await prompt("\nPress Enter to continue...");
        break;
      case "us":
        clear();
        await userCli.handleUpdateStatusInteractiveWithUser(selectedUser);
        await prompt("\nPress Enter to continue...");
        break;
      case "ur":
        clear();
        await userCli.handleUpdateRoleInteractiveWithUser(selectedUser);
        await prompt("\nPress Enter to continue...");
        break;
      case "up":
        clear();
        await userCli.handleUpdatePasswordInteractiveWithUser(selectedUser);
        await prompt("\nPress Enter to continue...");
        break;
      case "v":
        clear();
        await userCli.handleVerifyInteractiveWithUser(selectedUser);
        await prompt("\nPress Enter to continue...");
        break;
      case "cc":
        await runCookieConsentInteractiveWithUser(selectedUser);
        break;
      case "r":
        clear();
        await userCli.handleReactivateInteractiveWithUser(selectedUser);
        // Refresh user data after reactivation to get updated email
        await refreshUser();
        await prompt("\nPress Enter to continue...");
        break;
      case "d":
        clear();
        await userCli.handleDeleteInteractiveWithUser(selectedUser);
        await prompt("\nPress Enter to continue...");
        break;
      case "c":
        // Change user - go back to selection
        return;
      case "b":
        return;
    }
  }
}

async function runCookieConsentInteractive() {
  while (true) {
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║      Cookie Consent Management             ║");
    console.log("╚════════════════════════════════════════════╝\n");

    const choice = await menu("Select a command:", [
      { key: "a", label: "Accept Cookie Consent" },
      { key: "r", label: "Revoke Cookie Consent" },
      { key: "s", label: "Check Cookie Consent Status" },
      { key: "b", label: "Back to User Management" },
    ]);

    // Import user CLI functions
    const userCli = await import("./user-cli");

    switch (choice) {
      case "a":
        clear();
        await userCli.handleCookieAcceptInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "r":
        clear();
        await userCli.handleCookieRevokeInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "s":
        clear();
        await userCli.handleCookieStatusInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "b":
        return;
    }
  }
}

async function runCookieConsentInteractiveWithUser(user: { id: string; email: string; name: string | null }) {
  const userCli = await import("./user-cli");

  while (true) {
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║      Cookie Consent Management             ║");
    console.log("╚════════════════════════════════════════════╝\n");
    console.log(`Selected User: ${user.email}${user.name ? ` (${user.name})` : ""}\n`);

    const choice = await menu("Select a command:", [
      { key: "a", label: "Accept Cookie Consent" },
      { key: "r", label: "Revoke Cookie Consent" },
      { key: "s", label: "Check Cookie Consent Status" },
      { key: "b", label: "Back to User Actions" },
    ]);

    switch (choice) {
      case "a":
        clear();
        await userCli.handleCookieAcceptInteractiveWithUser(user);
        await prompt("\nPress Enter to continue...");
        break;
      case "r":
        clear();
        await userCli.handleCookieRevokeInteractiveWithUser(user);
        await prompt("\nPress Enter to continue...");
        break;
      case "s":
        clear();
        await userCli.handleCookieStatusInteractiveWithUser(user);
        await prompt("\nPress Enter to continue...");
        break;
      case "b":
        return;
    }
  }
}

async function runGroupInteractive() {
  while (true) {
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║         Group Management                   ║");
    console.log("╚════════════════════════════════════════════╝\n");

    const choice = await menu("Select a command:", [
      { key: "c", label: "Create Group" },
      { key: "l", label: "List Groups" },
      { key: "s", label: "Show Group Details" },
      { key: "u", label: "Update Group" },
      { key: "aa", label: "Add Agent to Group" },
      { key: "ra", label: "Remove Agent from Group" },
      { key: "la", label: "List Agents in Group" },
      { key: "d", label: "Delete Group" },
      { key: "b", label: "Back to Main Menu" },
    ]);

    // Import group CLI functions
    const groupCli = await import("./group-cli");

    switch (choice) {
      case "c":
        clear();
        await groupCli.handleCreateInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "l":
        clear();
        await groupCli.handleListInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "s":
        clear();
        await groupCli.handleShowInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "u":
        clear();
        await groupCli.handleUpdateInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "aa":
        clear();
        await groupCli.handleAddAgentInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "ra":
        clear();
        await groupCli.handleRemoveAgentInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "la":
        clear();
        await groupCli.handleListAgentsInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "d":
        clear();
        await groupCli.handleDeleteInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "b":
        return;
    }
  }
}

async function executeCommand(args: string[]) {
  const category = args[0];
  const commandArgs = args.slice(1); // Remove category, keep rest

  switch (category) {
    case "user":
      // Import and execute user CLI command
      const userCli = await import("./user-cli");
      // The user-cli module will handle execution via its own main() function
      // when it detects commandArgs, but we need to ensure it runs
      // Since user-cli checks process.argv directly, we need to let it handle it
      // But we also need to ensure the process doesn't exit immediately
      if (commandArgs.length === 0) {
        // Show help if no command provided
        console.log(`
User Management CLI Tool

Commands:
  create <email> <password> [name]     Create a new user
  delete <email|number>                Permanently delete a user and all associated data
  list [--status=STATUS] [--role=ROLE] List users with optional filters
  show <email|number>                  Show user details
  update-status <email|number> <status> Update user status (PENDING|ACTIVE|SUSPENDED|DELETED)
  update-role <email|number> <role>    Update user role (USER|ADMIN|MODERATOR|AGENT)
  update-password <email|number> <password> Update user password
  cookie-accept <email|number>         Accept cookie consent for a user
  cookie-revoke <email|number>         Revoke cookie consent for a user
  cookie-status <email|number>         Check cookie consent status for a user
  verify <email|number>                Verify user email and optionally activate account

Run 'pnpm cli user <command>' to execute a command.
Run 'pnpm cli help' for more information.
`);
        await prisma.$disconnect();
        process.exit(0);
      }
      // The module will handle execution when imported
      break;
    case "group":
      // Import and execute group CLI command
      await import("./group-cli");
      if (commandArgs.length === 0) {
        // Show help if no command provided
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

Run 'pnpm cli group <command>' to execute a command.
Run 'pnpm cli help' for more information.
`);
        await prisma.$disconnect();
        process.exit(0);
      }
      // The module will handle execution when imported
      break;
    case "module":
      console.log("Module management commands coming soon!");
      await prisma.$disconnect();
      process.exit(0);
      break;
    default:
      console.error(`Unknown category: ${category}`);
      console.log("Run 'pnpm cli help' for available commands");
      await prisma.$disconnect();
      process.exit(1);
  }
}

function showHelp() {
  console.log(`
CloudWrkz CLI Tool

Available command categories:
  user      User management (create, delete, list, show, update-status, update-role, update-password, verify, cookie-accept, cookie-revoke, cookie-status)
  group     Group management (create, delete, list, show, update, add-agent, remove-agent, list-agents)
  module    Module management (future)

User Selection:
  You can select users by email or by number. Use 'list' command first to see user numbers.
  Numbers are 1-based (first user = 1, second user = 2, etc.)

Examples:
  # Create a user
  pnpm cli user create admin@example.com SecurePass123 "Admin User"
  
  # List users (to see numbers)
  pnpm cli user list
  pnpm cli user list --status=ACTIVE
  
  # Update status (by email or number)
  pnpm cli user update-status user@example.com ACTIVE
  pnpm cli user update-status 1 ACTIVE  # Select first user from list
  
  # Update role (by email or number)
  pnpm cli user update-role user@example.com ADMIN
  pnpm cli user update-role 2 MODERATOR  # Select second user from list
  pnpm cli user update-role 3 AGENT  # Select third user from list
  
  # Show user details
  pnpm cli user show user@example.com
  
  # Group management examples
  pnpm cli group create "Support Team" "Primary support team"
  pnpm cli group list
  pnpm cli group add-agent "Support Team" agent@example.com
  pnpm cli group list-agents "Support Team"

Interactive Mode:
  Run 'pnpm cli' without arguments to start interactive mode

For detailed help on a category:
  pnpm cli user
  pnpm cli group
`);
}
