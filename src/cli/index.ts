#!/usr/bin/env node

/**
 * Enterprise CLI Tool
 *
 * Professional command-line interface for managing the platform
 *
 * Usage:
 *   pnpm cli                          Interactive mode
 *   pnpm cli user <command>           User management commands
 *   pnpm cli group <command>          Group management commands
 *   pnpm cli module <command>         Module management commands (future)
 *   pnpm cli help                     Show help
 */

import {
  menu,
  separator,
  prompt,
  confirm,
  clear,
  header,
  success,
  error,
  warning,
  info,
  notice,
  waitForEnter,
  createSpinner,
  paginatedCheckbox,
} from "./prompts";
import { prisma } from "../lib/db/prisma";
import { APP_CONFIG } from "../lib/constants/config";
import chalk from "chalk";

const args = process.argv.slice(2);

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log();
  notice("Goodbye! 👋", "info");
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
    header(`${APP_CONFIG.name} Management Console`, "Enterprise CLI Tool v1.0");

    const choice = await menu("Select a category:", [
      {
        key: "u",
        label: "👤 User Management",
        description: "Create, update, and manage user accounts",
      },
      {
        key: "g",
        label: "👥 Group Management",
        description: "Manage groups and team memberships",
      },
      {
        key: "m",
        label: "📦 Module Management",
        description: "Configure and manage system modules",
      },
      {
        key: "s",
        label: "🔐 Session Management",
        description: "Manage user sessions and authentication",
      },
      {
        key: "p",
        label: "📁 Project Management",
        description: "Manage projects and project members",
      },
      {
        key: "t",
        label: "📋 Todo Management",
        description: "Manage todos and todo assignments",
      },
      {
        key: "tk",
        label: "🎫 Ticket Management",
        description: "Manage support tickets",
      },
      {
        key: "tm",
        label: "⏱️  Time Tracking",
        description: "Manage time entries and tracking",
      },
      {
        key: "perm",
        label: "🔑 Permission Management",
        description: "Manage permissions and access control",
      },
      {
        key: "stats",
        label: "📊 Statistics & Analytics",
        description: "View system statistics and reports",
      },
      {
        key: "db",
        label: "🗄️  Database Maintenance",
        description: "Database operations and maintenance",
      },
      {
        key: "h",
        label: "❓ Help & Documentation",
        description: "View help and usage examples",
      },
      {
        key: "q",
        label: "🚪 Quit",
        description: "Exit the CLI",
      },
    ]);

    switch (choice) {
      case "u":
        await runUserInteractive();
        break;
      case "g":
        await runGroupInteractive();
        break;
      case "m":
        await runModuleInteractive();
        break;
      case "s":
        await runSessionInteractive();
        break;
      case "p":
        await runProjectInteractive();
        break;
      case "t":
        await runTodoInteractive();
        break;
      case "tk":
        await runTicketInteractive();
        break;
      case "tm":
        await runTimeInteractive();
        break;
      case "perm":
        await runPermissionInteractive();
        break;
      case "stats":
        await runStatsInteractive();
        break;
      case "db":
        await runDbInteractive();
        break;
      case "h":
        clear();
        showHelp();
        await waitForEnter();
        break;
      case "q":
        clear();
        notice(`Thank you for using ${APP_CONFIG.name} CLI. Goodbye! 👋`, "info");
        await prisma.$disconnect();
        process.exit(0);
        break;
    }
  }
}

async function runUserInteractive() {
  const userCli = await import("./user-cli");

  while (true) {
    clear();
    header("User Management", "Manage user accounts, roles, and permissions");

    const choice = await menu("Select an action:", [
      {
        key: "s",
        label: "🔍 Select User(s)",
        description: "Select one or more users to perform actions on",
      },
      {
        key: "c",
        label: "➕ Create User",
        description: "Create a new user account",
      },
      {
        key: "l",
        label: "📋 List Users",
        description: "View all users with filters and search",
      },
      {
        key: "back",
        label: "⬅️  Back to Main Menu",
        description: "Return to main menu",
      },
    ]);

    switch (choice) {
      case "s":
        const selectedUsers = await selectUsersForActions();
        if (selectedUsers && selectedUsers.length > 0) {
          await runUserActionsInteractive(selectedUsers);
        }
        break;
      case "c":
        clear();
        await userCli.handleCreateInteractive();
        await waitForEnter();
        break;
      case "l":
        clear();
        await userCli.handleListInteractive();
        await waitForEnter();
        break;
      case "back":
        return;
    }
  }
}

async function selectUsersForActions(): Promise<{ id: string; email: string; originalEmail: string | null; name: string | null; role: "USER" | "ADMIN" | "MODERATOR" | "AGENT"; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED" }[] | null> {
  const { prisma } = await import("../lib/db/prisma");
  const { formatUserName } = await import("../lib/utils/users");

  clear();
  header("Select User(s)", "Choose one or more users to perform actions on");

  const spinner = createSpinner("Loading users...");
  spinner.start();

  try {
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

    spinner.succeed(`Loaded ${users.length} user(s)`);

    if (users.length === 0) {
      notice("No users found in the system.", "warning");
      await waitForEnter();
      return null;
    }

    separator();
    info("Use Space to select/deselect users, Enter to confirm selection");

    const selectedUsers = await paginatedCheckbox(
      "Select user(s) (use Space to toggle, Enter to confirm):",
      users,
      (u, index) => {
        const displayName = formatUserName(u);
        const emailDisplay =
          u.status === "DELETED" && u.originalEmail
            ? ` (original: ${u.originalEmail})`
            : u.status !== "DELETED" && u.email !== displayName
              ? ` (${u.email})`
              : "";
        return `${index + 1}. ${displayName} - ${u.status} [${u.role}]${emailDisplay}`;
      },
      {
        pageSize: 15,
        emptyMessage: "No users found",
      }
    );

    if (!selectedUsers || selectedUsers.length === 0) {
      notice("No users selected.", "warning");
      await waitForEnter();
      return null;
    }

    if (selectedUsers.length === 1) {
      const displayEmail =
        selectedUsers[0].status === "DELETED" && selectedUsers[0].originalEmail
          ? selectedUsers[0].originalEmail
          : selectedUsers[0].email;
      success(`Selected user: ${displayEmail}${selectedUsers[0].name ? ` (${selectedUsers[0].name})` : ""}`);
    } else {
      success(`Selected ${selectedUsers.length} user(s) for operations`);
    }
    await waitForEnter();

    return selectedUsers;
  } catch (err) {
    spinner.fail("Failed to load users");
    error(err instanceof Error ? err.message : String(err));
    await waitForEnter();
    return null;
  }
}

async function runUserActionsInteractive(selectedUsers: { id: string; email: string; originalEmail: string | null; name: string | null; role: "USER" | "ADMIN" | "MODERATOR" | "AGENT"; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED" }[]) {
  const userCli = await import("./user-cli");
  const { prisma } = await import("../lib/db/prisma");
  const { formatStatus, formatRole, displayKeyValue, sectionHeader } = await import("./prompts");
  const { formatUserName } = await import("../lib/utils/users");

  const isSingleUser = selectedUsers.length === 1;
  const selectedUser = isSingleUser ? selectedUsers[0] : null;

  // Helper function to refresh user data (for single user mode)
  const refreshUser = async () => {
    if (!selectedUser) return null;
    const refreshed = await prisma.user.findFirst({
      where: {
        OR: [{ id: selectedUser.id }, { email: selectedUser.email }, { originalEmail: selectedUser.email }],
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
    if (refreshed && selectedUser) {
      selectedUser.id = refreshed.id;
      selectedUser.email = refreshed.email;
      selectedUser.name = refreshed.name;
    }
    return refreshed;
  };

  while (true) {
    if (isSingleUser && selectedUser) {
      const refreshed = await refreshUser();

      clear();
      header("User Actions", "Manage selected user account");

      const displayEmail =
        refreshed && refreshed.status === "DELETED" && refreshed.originalEmail
          ? refreshed.originalEmail
          : selectedUser.email;

      sectionHeader("Selected User");
      displayKeyValue("Email", displayEmail);
      displayKeyValue("Name", selectedUser.name || "-");
      if (refreshed) {
        displayKeyValue("Status", formatStatus(refreshed.status));
        displayKeyValue("Role", formatRole(refreshed.role));
      }
      separator();

      const actions = [
        {
          key: "s",
          label: "📋 Show User Details",
          description: "View comprehensive user information and statistics",
        },
        {
          key: "us",
          label: "🔄 Update User Status",
          description: "Change user account status (PENDING/ACTIVE/SUSPENDED/DELETED)",
        },
        {
          key: "ur",
          label: "👤 Update User Role",
          description: "Change user role (USER/ADMIN/MODERATOR/AGENT)",
        },
        {
          key: "up",
          label: "🔐 Update Password",
          description: "Reset user password",
        },
        {
          key: "v",
          label: "✓ Verify Email",
          description: "Verify user email and activate account",
        },
        {
          key: "cc",
          label: "🍪 Cookie Consent",
          description: "Manage cookie consent settings",
        },
      ];

      if (refreshed && refreshed.status !== "BANNED") {
        actions.push({
          key: "ban",
          label: "🚫 Ban User",
          description: "Ban user account and prevent login",
        });
      }

      if (refreshed && refreshed.status === "BANNED") {
        actions.push({
          key: "unban",
          label: "✅ Unban User",
          description: "Unban user account and restore access",
        });
      }

      if (refreshed && refreshed.status === "DELETED") {
        actions.push({
          key: "r",
          label: "♻️  Reactivate User",
          description: "Restore a deleted user account",
        });
      }

      actions.push(
        {
          key: "d",
          label: "🗑️  Delete User",
          description: "Permanently delete user account (irreversible)",
        },
        {
          key: "c",
          label: "🔄 Change Selection",
          description: "Select different user(s)",
        },
        {
          key: "b",
          label: "⬅️  Back to User Management",
          description: "Return to user management menu",
        }
      );

      const choice = await menu("Select an action:", actions);

      switch (choice) {
        case "s":
          clear();
          await showUserDetails(selectedUser);
          await waitForEnter();
          break;
        case "us":
          clear();
          await userCli.handleUpdateStatusInteractiveWithUser(selectedUser);
          await waitForEnter();
          break;
        case "ur":
          clear();
          await userCli.handleUpdateRoleInteractiveWithUser(selectedUser);
          await waitForEnter();
          break;
        case "up":
          clear();
          await userCli.handleUpdatePasswordInteractiveWithUser(selectedUser);
          await waitForEnter();
          break;
        case "v":
          clear();
          await userCli.handleVerifyInteractiveWithUser(selectedUser);
          await waitForEnter();
          break;
        case "cc":
          await runCookieConsentInteractiveWithUser(selectedUser);
          break;
        case "ban":
          clear();
          await userCli.handleBanInteractiveWithUser(selectedUser);
          await refreshUser();
          await waitForEnter();
          break;
        case "unban":
          clear();
          await userCli.handleUnbanInteractiveWithUser(selectedUser);
          await refreshUser();
          await waitForEnter();
          break;
        case "r":
          clear();
          await userCli.handleReactivateInteractiveWithUser(selectedUser);
          await refreshUser();
          await waitForEnter();
          break;
        case "d":
          clear();
          await userCli.handleDeleteInteractiveWithUser(selectedUser);
          await waitForEnter();
          break;
        case "c":
          return;
        case "b":
          return;
      }
    } else {
      // Multiple users - show bulk operations menu
      clear();
      header("Bulk Operations", `Manage ${selectedUsers.length} selected user(s)`);

      sectionHeader("Selected Users");
      selectedUsers.forEach((user, index) => {
        const displayName = formatUserName(user);
        console.log(chalk.gray(`${index + 1}.`), `${displayName} (${user.email})`);
      });
      separator();

      const actions = [
        {
          key: "us",
          label: "🔄 Update Status",
          description: `Update status for ${selectedUsers.length} user(s)`,
        },
        {
          key: "ur",
          label: "👤 Update Role",
          description: `Update role for ${selectedUsers.length} user(s)`,
        },
        {
          key: "v",
          label: "✓ Verify Email",
          description: `Verify email for ${selectedUsers.length} user(s)`,
        },
        {
          key: "cc",
          label: "🍪 Accept Cookie Consent",
          description: `Accept cookie consent for ${selectedUsers.length} user(s)`,
        },
        {
          key: "ccr",
          label: "🍪 Revoke Cookie Consent",
          description: `Revoke cookie consent for ${selectedUsers.length} user(s)`,
        },
        {
          key: "d",
          label: "🗑️  Delete Users",
          description: `Permanently delete ${selectedUsers.length} user(s) (irreversible)`,
        },
        {
          key: "c",
          label: "🔄 Change Selection",
          description: "Select different users",
        },
        {
          key: "b",
          label: "⬅️  Back to User Management",
          description: "Return to user management menu",
        },
      ];

      const choice = await menu("Select a bulk operation:", actions);

      switch (choice) {
        case "us":
          clear();
          await userCli.handleBulkUpdateStatusInteractive(selectedUsers);
          await waitForEnter();
          break;
        case "ur":
          clear();
          await userCli.handleBulkUpdateRoleInteractive(selectedUsers);
          await waitForEnter();
          break;
        case "v":
          clear();
          await userCli.handleBulkVerifyInteractive(selectedUsers);
          await waitForEnter();
          break;
        case "cc":
          clear();
          await userCli.handleBulkCookieAcceptInteractive(selectedUsers);
          await waitForEnter();
          break;
        case "ccr":
          clear();
          await userCli.handleBulkCookieRevokeInteractive(selectedUsers);
          await waitForEnter();
          break;
        case "d":
          clear();
          await userCli.handleBulkDeleteInteractive(selectedUsers);
          await waitForEnter();
          break;
        case "c":
          return;
        case "b":
          return;
      }
    }
  }
}

async function showUserDetails(user: { id: string; email: string; originalEmail?: string | null; name: string | null }) {
  const { prisma } = await import("../lib/db/prisma");
  const { formatStatus, formatRole, displayKeyValue, sectionHeader, createTable } = await import("./prompts");

  header("User Details", "Comprehensive user information");

  const spinner = createSpinner("Loading user details...");
  spinner.start();

  try {
    const fullUser = await prisma.user.findFirst({
      where: {
        OR: [{ id: user.id }, { email: user.email }, { originalEmail: user.email }],
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

    spinner.succeed("User details loaded");

    if (!fullUser) {
      error("User not found");
      return;
    }

    const displayEmail =
      fullUser.status === "DELETED" && fullUser.originalEmail ? fullUser.originalEmail : fullUser.email;

    sectionHeader("Account Information");
    displayKeyValue("ID", fullUser.id);
    displayKeyValue("Email", displayEmail);
    if (fullUser.status === "DELETED" && fullUser.originalEmail && fullUser.email !== fullUser.originalEmail) {
      displayKeyValue("Current Email", `${fullUser.email} (deleted format)`);
    }
    displayKeyValue("Name", fullUser.name || "-");
    displayKeyValue("Role", formatRole(fullUser.role));
    displayKeyValue("Status", formatStatus(fullUser.status));
    displayKeyValue("Email Verified", fullUser.emailVerified ? "Yes ✓" : "No ✗");
    displayKeyValue("Cookie Consent", fullUser.cookieConsentAccepted ? "Accepted ✓" : "Not accepted ✗");
    if (fullUser.cookieConsentAcceptedAt) {
      displayKeyValue("Consent Date", fullUser.cookieConsentAcceptedAt.toLocaleString());
    }
    displayKeyValue("Avatar", fullUser.avatar || "-");
    displayKeyValue("Bio", fullUser.bio || "-");

    separator();

    sectionHeader("Timestamps");
    displayKeyValue("Created", fullUser.createdAt.toLocaleString());
    displayKeyValue("Updated", fullUser.updatedAt.toLocaleString());
    displayKeyValue("Last Login", fullUser.lastLoginAt?.toLocaleString() || "Never");
    displayKeyValue("Last Login IP", fullUser.lastLoginIp || "-");

    separator();

    sectionHeader("Statistics");
    const statsTable = createTable(["Metric", "Count"]);
    statsTable.push(["Created Tickets", fullUser._count.createdTickets.toString()]);
    statsTable.push(["Assigned Tickets", fullUser._count.assignedTickets.toString()]);
    statsTable.push(["Ticket Comments", fullUser._count.ticketComments.toString()]);
    statsTable.push(["Active Sessions", fullUser._count.sessions.toString()]);
    console.log(statsTable.toString());
  } catch (err) {
    spinner.fail("Failed to load user details");
    error(err instanceof Error ? err.message : String(err));
  }
}

async function runCookieConsentInteractiveWithUser(user: { id: string; email: string; originalEmail?: string | null; name: string | null }) {
  const userCli = await import("./user-cli");

  while (true) {
    clear();
    header("Cookie Consent Management", `Manage cookie consent for ${user.email}`);

    const choice = await menu("Select an action:", [
      {
        key: "a",
        label: "✓ Accept Cookie Consent",
        description: "Mark cookie consent as accepted",
      },
      {
        key: "r",
        label: "✗ Revoke Cookie Consent",
        description: "Revoke cookie consent",
      },
      {
        key: "s",
        label: "📋 Check Status",
        description: "View current cookie consent status",
      },
      {
        key: "b",
        label: "⬅️  Back to User Actions",
        description: "Return to user actions menu",
      },
    ]);

    switch (choice) {
      case "a":
        clear();
        await userCli.handleCookieAcceptInteractiveWithUser(user);
        await waitForEnter();
        break;
      case "r":
        clear();
        await userCli.handleCookieRevokeInteractiveWithUser(user);
        await waitForEnter();
        break;
      case "s":
        clear();
        await userCli.handleCookieStatusInteractiveWithUser(user);
        await waitForEnter();
        break;
      case "b":
        return;
    }
  }
}

async function runGroupInteractive() {
  while (true) {
    clear();
    header("Group Management", "Manage groups and team memberships");

    const choice = await menu("Select an action:", [
      {
        key: "c",
        label: "➕ Create Group",
        description: "Create a new group",
      },
      {
        key: "l",
        label: "📋 List Groups",
        description: "View all groups",
      },
      {
        key: "s",
        label: "🔍 Show Group Details",
        description: "View detailed group information",
      },
      {
        key: "u",
        label: "✏️  Update Group",
        description: "Modify group name or description",
      },
      {
        key: "aa",
        label: "➕ Add Agent",
        description: "Add an agent to a group",
      },
      {
        key: "ra",
        label: "➖ Remove Agent",
        description: "Remove an agent from a group",
      },
      {
        key: "la",
        label: "👥 List Agents",
        description: "View all agents in a group",
      },
      {
        key: "d",
        label: "🗑️  Delete Group",
        description: "Delete a group (irreversible)",
      },
      {
        key: "b",
        label: "⬅️  Back to Main Menu",
        description: "Return to main menu",
      },
    ]);

    const groupCli = await import("./group-cli");

    switch (choice) {
      case "c":
        clear();
        await groupCli.handleCreateInteractive();
        await waitForEnter();
        break;
      case "l":
        clear();
        await groupCli.handleListInteractive();
        await waitForEnter();
        break;
      case "s":
        clear();
        await groupCli.handleShowInteractive();
        await waitForEnter();
        break;
      case "u":
        clear();
        await groupCli.handleUpdateInteractive();
        await waitForEnter();
        break;
      case "aa":
        clear();
        await groupCli.handleAddAgentInteractive();
        await waitForEnter();
        break;
      case "ra":
        clear();
        await groupCli.handleRemoveAgentInteractive();
        await waitForEnter();
        break;
      case "la":
        clear();
        await groupCli.handleListAgentsInteractive();
        await waitForEnter();
        break;
      case "d":
        clear();
        await groupCli.handleDeleteInteractive();
        await waitForEnter();
        break;
      case "b":
        return;
    }
  }
}

async function runModuleInteractive() {
  const moduleCli = await import("./module-cli");

  while (true) {
    clear();
    header("Module Management", "Configure and manage system modules");

    const choice = await menu("Select an action:", [
      {
        key: "l",
        label: "📋 List Modules",
        description: "View all modules and their status",
      },
      {
        key: "e",
        label: "✅ Enable Module",
        description: "Enable a system module",
      },
      {
        key: "d",
        label: "❌ Disable Module",
        description: "Disable a system module",
      },
      {
        key: "s",
        label: "🔍 Show Module Details",
        description: "View detailed module information",
      },
      {
        key: "c",
        label: "⚙️  Configure Module",
        description: "Update module configuration",
      },
      {
        key: "st",
        label: "📊 Module Status",
        description: "View overall module status",
      },
      {
        key: "sync",
        label: "🔄 Sync Modules",
        description: "Sync modules from code definitions",
      },
      {
        key: "b",
        label: "⬅️  Back to Main Menu",
        description: "Return to main menu",
      },
    ]);

    switch (choice) {
      case "l":
        clear();
        await moduleCli.handleListInteractive();
        await waitForEnter();
        break;
      case "e":
        clear();
        await moduleCli.handleEnableInteractive();
        await waitForEnter();
        break;
      case "d":
        clear();
        await moduleCli.handleDisableInteractive();
        await waitForEnter();
        break;
      case "s":
        clear();
        await moduleCli.handleShowInteractive();
        await waitForEnter();
        break;
      case "c":
        clear();
        await moduleCli.handleConfigInteractive();
        await waitForEnter();
        break;
      case "st":
        clear();
        await moduleCli.handleStatusInteractive();
        await waitForEnter();
        break;
      case "sync":
        clear();
        await moduleCli.handleSyncInteractive();
        await waitForEnter();
        break;
      case "b":
        return;
    }
  }
}

async function runSessionInteractive() {
  const sessionCli = await import("./session-cli");

  while (true) {
    clear();
    header("Session Management", "Manage user sessions and authentication");

    const choice = await menu("Select an action:", [
      {
        key: "l",
        label: "📋 List Sessions",
        description: "View all sessions with filters",
      },
      {
        key: "s",
        label: "🔍 Show Session Details",
        description: "View detailed session information",
      },
      {
        key: "r",
        label: "🚫 Revoke Session",
        description: "Revoke a specific session",
      },
      {
        key: "ru",
        label: "🚫 Revoke User Sessions",
        description: "Revoke all sessions for a user",
      },
      {
        key: "ra",
        label: "🚫 Revoke All Sessions",
        description: "Revoke all sessions (with confirmation)",
      },
      {
        key: "c",
        label: "🧹 Cleanup Expired",
        description: "Remove expired sessions",
      },
      {
        key: "st",
        label: "📊 Session Statistics",
        description: "View session statistics",
      },
      {
        key: "b",
        label: "⬅️  Back to Main Menu",
        description: "Return to main menu",
      },
    ]);

    switch (choice) {
      case "l":
        clear();
        await sessionCli.handleListInteractive();
        await waitForEnter();
        break;
      case "s":
        clear();
        await sessionCli.handleShowInteractive();
        await waitForEnter();
        break;
      case "r":
        clear();
        await sessionCli.handleRevokeInteractive();
        await waitForEnter();
        break;
      case "ru":
        clear();
        await sessionCli.handleRevokeUserInteractive();
        await waitForEnter();
        break;
      case "ra":
        clear();
        await sessionCli.handleRevokeAll();
        await waitForEnter();
        break;
      case "c":
        clear();
        await sessionCli.handleCleanupInteractive();
        await waitForEnter();
        break;
      case "st":
        clear();
        await sessionCli.handleStatsInteractive();
        await waitForEnter();
        break;
      case "b":
        return;
    }
  }
}

async function runProjectInteractive() {
  const projectCli = await import("./project-cli");

  while (true) {
    clear();
    header("Project Management", "Manage projects and project members");

    const choice = await menu("Select an action:", [
      {
        key: "l",
        label: "📋 List Projects",
        description: "View all projects",
      },
      {
        key: "c",
        label: "➕ Create Project",
        description: "Create a new project",
      },
      {
        key: "s",
        label: "🔍 Show Project Details",
        description: "View detailed project information",
      },
      {
        key: "u",
        label: "✏️  Update Project",
        description: "Modify project details",
      },
      {
        key: "am",
        label: "➕ Add Member",
        description: "Add a user to project",
      },
      {
        key: "rm",
        label: "➖ Remove Member",
        description: "Remove a user from project",
      },
      {
        key: "lm",
        label: "👥 List Members",
        description: "View project members",
      },
      {
        key: "ag",
        label: "➕ Add Group",
        description: "Add a group to project",
      },
      {
        key: "rg",
        label: "➖ Remove Group",
        description: "Remove a group from project",
      },
      {
        key: "lg",
        label: "👥 List Groups",
        description: "View project groups",
      },
      {
        key: "d",
        label: "🗑️  Delete Project",
        description: "Delete a project (irreversible)",
      },
      {
        key: "b",
        label: "⬅️  Back to Main Menu",
        description: "Return to main menu",
      },
    ]);

    switch (choice) {
      case "l":
        clear();
        await projectCli.handleListInteractive();
        await waitForEnter();
        break;
      case "c":
        clear();
        await projectCli.handleCreateInteractive();
        await waitForEnter();
        break;
      case "s":
        clear();
        await projectCli.handleShowInteractive();
        await waitForEnter();
        break;
      case "u":
        clear();
        notice("Update project functionality - use non-interactive mode: pnpm cli project update <id|code> [--name=NAME] [--status=STATUS]", "info");
        await waitForEnter();
        break;
      case "am":
        clear();
        notice("Add member functionality - use non-interactive mode: pnpm cli project add-member <project> <user> [--role=ROLE]", "info");
        await waitForEnter();
        break;
      case "rm":
        clear();
        notice("Remove member functionality - use non-interactive mode: pnpm cli project remove-member <project> <user>", "info");
        await waitForEnter();
        break;
      case "lm":
        clear();
        notice("List members functionality - use non-interactive mode: pnpm cli project list-members <project>", "info");
        await waitForEnter();
        break;
      case "ag":
        clear();
        notice("Add group functionality - use non-interactive mode: pnpm cli project add-group <project> <group>", "info");
        await waitForEnter();
        break;
      case "rg":
        clear();
        notice("Remove group functionality - use non-interactive mode: pnpm cli project remove-group <project> <group>", "info");
        await waitForEnter();
        break;
      case "lg":
        clear();
        notice("List groups functionality - use non-interactive mode: pnpm cli project list-groups <project>", "info");
        await waitForEnter();
        break;
      case "d":
        clear();
        notice("Delete project functionality - use non-interactive mode: pnpm cli project delete <id|code>", "info");
        await waitForEnter();
        break;
      case "b":
        return;
    }
  }
}

async function runTodoInteractive() {
  clear();
  notice("Todo Management CLI - Use non-interactive mode: pnpm cli todo <command>", "info");
  await waitForEnter();
}

async function runTicketInteractive() {
  clear();
  notice("Ticket Management CLI - Use non-interactive mode: pnpm cli ticket <command>", "info");
  await waitForEnter();
}

async function runTimeInteractive() {
  clear();
  notice("Time Tracking CLI - Use non-interactive mode: pnpm cli time <command>", "info");
  await waitForEnter();
}

async function runPermissionInteractive() {
  const permissionCli = await import("./permission-cli");

  while (true) {
    clear();
    header("Permission Management", "Manage permissions and access control");

    const choice = await menu("Select an action:", [
      {
        key: "l",
        label: "📋 List Permissions",
        description: "View all permissions with optional filters",
      },
      {
        key: "s",
        label: "🔍 Show Permission Details",
        description: "View detailed information for a permission",
      },
      {
        key: "g",
        label: "➕ Grant Permission to Group",
        description: "Assign a permission to a group",
      },
      {
        key: "r",
        label: "➖ Revoke Permission from Group",
        description: "Remove a permission from a group",
      },
      {
        key: "lg",
        label: "👥 List Group Permissions",
        description: "View permissions assigned to a group",
      },
      {
        key: "sync",
        label: "🔄 Sync Permissions",
        description: "Show how to sync permission definitions",
      },
      {
        key: "b",
        label: "⬅️  Back to Main Menu",
        description: "Return to main menu",
      },
    ]);

    switch (choice) {
      case "l":
        clear();
        await permissionCli.handleListInteractive();
        await waitForEnter();
        break;
      case "s":
        clear();
        await permissionCli.handleShowInteractive();
        await waitForEnter();
        break;
      case "g":
        clear();
        await permissionCli.handleGrantInteractive();
        await waitForEnter();
        break;
      case "r":
        clear();
        await permissionCli.handleRevokeInteractive();
        await waitForEnter();
        break;
      case "lg":
        clear();
        await permissionCli.handleListGroupInteractive();
        await waitForEnter();
        break;
      case "sync":
        clear();
        await permissionCli.handleSyncInteractive();
        await waitForEnter();
        break;
      case "b":
        return;
    }
  }
}

async function runStatsInteractive() {
  clear();
  notice("Statistics & Analytics CLI - Use non-interactive mode: pnpm cli stats <command>", "info");
  await waitForEnter();
}

async function runDbInteractive() {
  clear();
  notice("Database Maintenance CLI - Use non-interactive mode: pnpm cli db <command>", "info");
  await waitForEnter();
}

async function executeCommand(args: string[]) {
  const category = args[0];
  const commandArgs = args.slice(1);

  switch (category) {
    case "user":
      const userCli = await import("./user-cli");
      if (commandArgs.length === 0) {
        console.log(`
User Management CLI Tool

Commands:
  create <email> <password> [name]     Create a new user
  delete <email|number>                Permanently delete a user and all associated data
  reactivate <email|number>            Reactivate a deleted user account
  list [--status=STATUS] [--role=ROLE] List users with optional filters
  show <email|number>                  Show user details
  update-status <email|number> <status> Update user status (PENDING|ACTIVE|SUSPENDED|DELETED)
  update-role <email|number> <role>    Update user role (USER|ADMIN|MODERATOR|AGENT)
  update-password <email|number> <password> Update user password
  cookie-accept <email|number>         Accept cookie consent for a user
  cookie-revoke <email|number>         Revoke cookie consent for a user
  cookie-status <email|number>         Check cookie consent status for a user
  verify <email|number>                Verify user email and optionally activate account
  ban <email|number> <reason>          Ban a user account
  unban <email|number> <reason>        Unban a user account

Run 'pnpm cli user <command>' to execute a command.
Run 'pnpm cli help' for more information.
`);
        await prisma.$disconnect();
        process.exit(0);
      }
      break;
    case "group":
      await import("./group-cli");
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

Run 'pnpm cli group <command>' to execute a command.
Run 'pnpm cli help' for more information.
`);
        await prisma.$disconnect();
        process.exit(0);
      }
      break;
    case "module":
      await import("./module-cli");
      break;
    case "session":
      await import("./session-cli");
      break;
    case "project":
      await import("./project-cli");
      break;
    case "todo":
      await import("./todo-cli");
      break;
    case "ticket":
      await import("./ticket-cli");
      break;
    case "time":
      await import("./time-cli");
      break;
    case "permission":
      await import("./permission-cli");
      break;
    case "stats":
      await import("./stats-cli");
      break;
    case "db":
      await import("./db-cli");
      break;
    default:
      error(`Unknown category: ${category}`);
      info("Run 'pnpm cli help' for available commands");
      await prisma.$disconnect();
      process.exit(1);
  }
}

function showHelp() {
  header(`${APP_CONFIG.name} CLI Help`, "Command-line interface documentation");

  console.log(chalk.bold("Available command categories:\n"));
  console.log(chalk.cyan("  user      "), "User management (create, delete, list, show, update-status, update-role, update-password, verify, cookie-accept, cookie-revoke, cookie-status, ban, unban)");
  console.log(chalk.cyan("  group     "), "Group management (create, delete, list, show, update, add-agent, remove-agent, list-agents)");
  console.log(chalk.cyan("  module    "), "Module management (list, enable, disable, show, config, status, sync)");
  console.log(chalk.cyan("  session   "), "Session management (list, show, revoke, revoke-user, revoke-all, cleanup, stats)");
  console.log(chalk.cyan("  project   "), "Project management (list, create, show, update, delete, add-member, remove-member, list-members, add-group, remove-group, list-groups)");
  console.log(chalk.cyan("  todo      "), "Todo management (list, show, create, update, assign, complete, delete)");
  console.log(chalk.cyan("  ticket    "), "Ticket management (list, show, create, update, assign, close, reopen, delete)");
  console.log(chalk.cyan("  time      "), "Time tracking (list, show, start, stop, pause, resume, create, update, delete, export, report)");
  console.log(chalk.cyan("  permission"), "Permission management (list, show, grant, revoke, list-group, sync)");
  console.log(chalk.cyan("  stats     "), "Statistics & analytics (overview, users, projects, tickets, time, export)");
  console.log(chalk.cyan("  db        "), "Database maintenance (status, migrate, seed, cleanup, optimize, stats, validate)");

  separator();

  console.log(chalk.bold("User Selection:\n"));
  console.log("  You can select users by email or by number. Use 'list' command first to see user numbers.");
  console.log("  Numbers are 1-based (first user = 1, second user = 2, etc.)");

  separator();

  console.log(chalk.bold("Examples:\n"));
  console.log(chalk.gray("  # Create a user"));
  console.log("  pnpm cli user create admin@example.com SecurePass123 \"Admin User\"\n");
  console.log(chalk.gray("  # List users (to see numbers)"));
  console.log("  pnpm cli user list");
  console.log("  pnpm cli user list --status=ACTIVE\n");
  console.log(chalk.gray("  # Update status (by email or number)"));
  console.log("  pnpm cli user update-status user@example.com ACTIVE");
  console.log("  pnpm cli user update-status 1 ACTIVE  # Select first user from list\n");
  console.log(chalk.gray("  # Ban/unban user examples"));
  console.log("  pnpm cli user ban user@example.com \"Violation of terms of service\"");
  console.log("  pnpm cli user unban user@example.com \"Appeal approved\"\n");
  console.log(chalk.gray("  # Group management examples"));
  console.log("  pnpm cli group create \"Support Team\" \"Primary support team\"");
  console.log("  pnpm cli group list");
  console.log("  pnpm cli group add-agent \"Support Team\" agent@example.com");

  separator();

  console.log(chalk.bold("Interactive Mode:\n"));
  console.log("  Run 'pnpm cli' without arguments to start interactive mode");

  separator();

  console.log(chalk.bold("For detailed help on a category:\n"));
  console.log("  pnpm cli user");
  console.log("  pnpm cli group");
}
