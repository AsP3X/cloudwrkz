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
  while (true) {
    clear();
    console.log("╔════════════════════════════════════════════╗");
    console.log("║         User Management                    ║");
    console.log("╚════════════════════════════════════════════╝\n");

    const choice = await menu("Select a command:", [
      { key: "c", label: "Create User" },
      { key: "l", label: "List Users" },
      { key: "s", label: "Show User Details" },
      { key: "us", label: "Update User Status" },
      { key: "ur", label: "Update User Role" },
      { key: "up", label: "Update User Password" },
      { key: "cc", label: "Cookie Consent Management" },
      { key: "d", label: "Delete User" },
      { key: "b", label: "Back to Main Menu" },
    ]);

    // Import user CLI functions
    const userCli = await import("./user-cli");

    switch (choice) {
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
      case "s":
        clear();
        await userCli.handleShowInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "us":
        clear();
        await userCli.handleUpdateStatusInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "ur":
        clear();
        await userCli.handleUpdateRoleInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "up":
        clear();
        await userCli.handleUpdatePasswordInteractive();
        await prompt("\nPress Enter to continue...");
        break;
      case "cc":
        await runCookieConsentInteractive();
        break;
      case "d":
        clear();
        await userCli.handleDeleteInteractive();
        await prompt("\nPress Enter to continue...");
        break;
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

function executeCommand(args: string[]) {
  const category = args[0];

  switch (category) {
    case "user":
      // Import and run user CLI
      import("./user-cli");
      break;
    case "group":
      // Import and run group CLI
      import("./group-cli");
      break;
    case "module":
      console.log("Module management commands coming soon!");
      process.exit(0);
      break;
    default:
      console.error(`Unknown category: ${category}`);
      console.log("Run 'pnpm cli help' for available commands");
      process.exit(1);
  }
}

function showHelp() {
  console.log(`
CloudWrkz CLI Tool

Available command categories:
  user      User management (create, delete, list, show, update-status, update-role, update-password, cookie-accept, cookie-revoke, cookie-status)
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
