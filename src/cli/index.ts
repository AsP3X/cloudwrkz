#!/usr/bin/env node

/**
 * CloudWrkz CLI Tool
 * 
 * Main entry point for CLI commands
 * 
 * Usage:
 *   pnpm cli user <command>     User management commands
 *   pnpm cli module <command>   Module management commands (future)
 *   pnpm cli help               Show help
 */

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  console.log(`
CloudWrkz CLI Tool

Available command categories:
  user      User management (create, delete, list, show, update-status, update-role, update-password)
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

For detailed help on a category:
  pnpm cli user
`);
  process.exit(0);
}

const category = args[0];

switch (category) {
  case "user":
    // Import and run user CLI
    import("./user-cli");
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
