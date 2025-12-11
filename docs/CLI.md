# CloudWrkz CLI Tool

Command-line interface for managing CloudWrkz users and modules.

## Installation

The CLI tool is included with the project. Make sure you have `.env.local` configured with your database connection.

## Usage

```bash
pnpm cli <category> <command> [options]
```

## User Selection

You can select users by **email** or by **number**. When using numbers:
1. First run `pnpm cli user list` to see all users with their numbers
2. Use the number (1-based: first user = 1, second = 2, etc.) instead of email
3. Numbers correspond to the order shown in the list (newest first)

**Example:**
```bash
# List users to see numbers
pnpm cli user list
# Output: 1. admin@example.com - ACTIVE [ADMIN]
#         2. user@example.com - PENDING [USER]

# Update using number
pnpm cli user update-status 1 ACTIVE
```

## User Management

### Create User

Create a new user account.

```bash
pnpm cli user create <email> <password> [name]
```

**Examples:**
```bash
pnpm cli user create admin@example.com SecurePass123 "Admin User"
pnpm cli user create user@example.com Password123
```

**Note:** Users created via the CLI are **immediately marked as email-verified** and their account status is set to **ACTIVE**. This is intended for administrator/bootstrap scenarios and avoids the usual email verification flow.

### List Users

List all users with optional filters.

```bash
pnpm cli user list [--status=STATUS] [--role=ROLE]
```

**Status options:** `PENDING`, `ACTIVE`, `SUSPENDED`, `DELETED`  
**Role options:** `USER`, `ADMIN`, `MODERATOR`, `AGENT`

**Examples:**
```bash
pnpm cli user list
pnpm cli user list --status=ACTIVE
pnpm cli user list --role=ADMIN
pnpm cli user list --status=ACTIVE --role=ADMIN
```

### Show User Details

Display detailed information about a specific user. You can select a user by email or by number.

```bash
pnpm cli user show <email|number>
```

**Examples:**
```bash
# Show by email
pnpm cli user show admin@example.com

# Show by number (from list)
pnpm cli user list
pnpm cli user show 1  # Shows details for the first user in the list
```

### Update User Status

Change a user's account status. You can select a user by email or by number (when listing users first).

```bash
pnpm cli user update-status <email|number> <status>
```

**Status options:** `PENDING`, `ACTIVE`, `SUSPENDED`, `DELETED`

**Examples:**
```bash
# Update by email
pnpm cli user update-status user@example.com ACTIVE
pnpm cli user update-status user@example.com SUSPENDED

# First list users to see numbers, then update by number
pnpm cli user list
pnpm cli user update-status 1 ACTIVE  # Updates the first user in the list
```

### Update User Role

Change a user's role/permissions. You can select a user by email or by number.

```bash
pnpm cli user update-role <email|number> <role>
```

**Role options:** `USER`, `ADMIN`, `MODERATOR`, `AGENT`

**Examples:**
```bash
# Update by email
pnpm cli user update-role user@example.com ADMIN
pnpm cli user update-role admin@example.com USER

# Update by number (from list)
pnpm cli user list
pnpm cli user update-role 1 ADMIN  # Updates the first user in the list
```

### Update User Password

Reset a user's password. You can select a user by email or by number.

```bash
pnpm cli user update-password <email|number> <newPassword>
```

**Examples:**
```bash
# Update by email
pnpm cli user update-password user@example.com NewSecurePassword123

# Update by number (from list)
pnpm cli user list
pnpm cli user update-password 1 NewSecurePassword123  # Updates the first user in the list
```

**Note:** Password must be at least 8 characters long.

### Delete User

Permanently delete a user account.

```bash
pnpm cli user delete <email>
```

**Example:**
```bash
pnpm cli user delete user@example.com
```

**Warning:** This action cannot be undone. All user data, tickets, and sessions will be deleted.

## Examples

### Complete User Setup Workflow

```bash
# Create an admin user
pnpm cli user create admin@example.com AdminPass123 "System Administrator"
# Promote to admin role (user is already ACTIVE and verified)
pnpm cli user update-role admin@example.com ADMIN
```

### User Management

```bash
# List all active users
pnpm cli user list --status=ACTIVE

# Suspend a problematic user
pnpm cli user update-status problematic@example.com SUSPENDED

# Reset a user's password
pnpm cli user update-password user@example.com NewPassword123

# Delete an inactive user
pnpm cli user delete inactive@example.com
```

## Permissions

**Note:** Currently, the CLI tool does not enforce permissions. In production, you should:
- Restrict access to the CLI tool
- Add authentication/authorization checks
- Audit all CLI operations
- Consider adding a permissions system for fine-grained control

## Troubleshooting

### Database Connection Error

Make sure your `.env.local` file contains a valid `DATABASE_URL`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/cloudwrkz"
```

### User Already Exists

If you get an error that a user already exists, use `show` to check the user details or `update-password` to change the password instead of creating a new user.

### Invalid Status/Role

Make sure you're using the exact status/role values:
- Status: `PENDING`, `ACTIVE`, `SUSPENDED`, `DELETED` (case-insensitive)
- Role: `USER`, `ADMIN`, `MODERATOR`, `AGENT` (case-insensitive)

## Module Management

### List Modules

List all modules with their status.

```bash
pnpm cli module list
```

### Enable Module

Enable a system module.

```bash
pnpm cli module enable <module-key>
```

**Module keys:** `tickets`, `timetracking`, `projects`

### Disable Module

Disable a system module.

```bash
pnpm cli module disable <module-key>
```

### Show Module Details

Display detailed module information.

```bash
pnpm cli module show <module-key>
```

### Configure Module

Update module configuration (JSON).

```bash
pnpm cli module config <module-key> [config-json]
```

### Module Status

View overall module status.

```bash
pnpm cli module status
```

### Sync Modules

Sync modules from code definitions.

```bash
pnpm cli module sync
```

## Session Management

### List Sessions

List all sessions with optional filters.

```bash
pnpm cli session list [--user=EMAIL] [--active] [--expired]
```

### Show Session Details

Display detailed session information.

```bash
pnpm cli session show <id>
```

### Revoke Session

Revoke a specific session.

```bash
pnpm cli session revoke <id>
```

### Revoke User Sessions

Revoke all sessions for a user.

```bash
pnpm cli session revoke-user <email>
```

### Revoke All Sessions

Revoke all sessions (with confirmation).

```bash
pnpm cli session revoke-all
```

### Cleanup Expired Sessions

Remove expired sessions.

```bash
pnpm cli session cleanup
```

### Session Statistics

View session statistics.

```bash
pnpm cli session stats
```

## Project Management

### List Projects

List all projects with optional filters.

```bash
pnpm cli project list [--status=STATUS] [--priority=PRIORITY]
```

**Status options:** `PLANNING`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED`, `ARCHIVED`  
**Priority options:** `LOW`, `MEDIUM`, `HIGH`, `URGENT`

### Create Project

Create a new project.

```bash
pnpm cli project create <name> [description] [--status=STATUS] [--priority=PRIORITY]
```

### Show Project Details

Display detailed project information.

```bash
pnpm cli project show <id|code>
```

### Update Project

Update project details.

```bash
pnpm cli project update <id|code> [--name=NAME] [--status=STATUS] [--priority=PRIORITY]
```

### Delete Project

Delete a project.

```bash
pnpm cli project delete <id|code>
```

### Add Project Member

Add a user to a project.

```bash
pnpm cli project add-member <project> <user> [--role=ROLE]
```

**Role options:** `MANAGER`, `MEMBER`

### Remove Project Member

Remove a user from a project.

```bash
pnpm cli project remove-member <project> <user>
```

### List Project Members

List all members of a project.

```bash
pnpm cli project list-members <project>
```

### Add Project Group

Add a group to a project.

```bash
pnpm cli project add-group <project> <group>
```

### Remove Project Group

Remove a group from a project.

```bash
pnpm cli project remove-group <project> <group>
```

### List Project Groups

List all groups assigned to a project.

```bash
pnpm cli project list-groups <project>
```

## Task Management

### List Tasks

List all tasks with optional filters.

```bash
pnpm cli task list [--project=PROJECT] [--status=STATUS] [--assignee=EMAIL]
```

**Status options:** `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`, `CANCELLED`

### Show Task Details

Display detailed task information.

```bash
pnpm cli task show <id>
```

### Create Task

Create a new task.

```bash
pnpm cli task create <project> <title> [--description=DESC] [--assignee=EMAIL] [--due-date=DATE]
```

### Update Task

Update task details.

```bash
pnpm cli task update <id> [--status=STATUS] [--assignee=EMAIL] [--due-date=DATE]
```

### Assign Task

Assign a task to a user.

```bash
pnpm cli task assign <id> <user>
```

### Complete Task

Mark a task as completed.

```bash
pnpm cli task complete <id>
```

### Delete Task

Delete a task.

```bash
pnpm cli task delete <id>
```

## Ticket Management

### List Tickets

List all tickets with optional filters.

```bash
pnpm cli ticket list [--status=STATUS] [--priority=PRIORITY] [--type=TYPE] [--assignee=EMAIL]
```

**Status options:** `OPEN`, `IN_PROGRESS`, `PENDING`, `RESOLVED`, `CLOSED`, `CANCELLED`  
**Priority options:** `LOW`, `MEDIUM`, `HIGH`, `URGENT`  
**Type options:** `BUG`, `FEATURE`, `QUESTION`, `SUPPORT`, `TASK`

### Show Ticket Details

Display detailed ticket information.

```bash
pnpm cli ticket show <id|number>
```

### Create Ticket

Create a new ticket.

```bash
pnpm cli ticket create <title> [--description=DESC] [--priority=PRIORITY] [--type=TYPE]
```

### Update Ticket

Update ticket details.

```bash
pnpm cli ticket update <id|number> [--status=STATUS] [--priority=PRIORITY] [--assignee=EMAIL]
```

### Assign Ticket

Assign a ticket to a user or group.

```bash
pnpm cli ticket assign <id|number> <user|group>
```

### Close Ticket

Close a ticket.

```bash
pnpm cli ticket close <id|number> [--reason=REASON]
```

### Reopen Ticket

Reopen a closed ticket.

```bash
pnpm cli ticket reopen <id|number>
```

### Delete Ticket

Delete a ticket.

```bash
pnpm cli ticket delete <id|number>
```

## Time Tracking

### List Time Entries

List all time entries with optional filters.

```bash
pnpm cli time list [--user=EMAIL] [--project=PROJECT] [--date=DATE] [--status=STATUS]
```

**Status options:** `RUNNING`, `PAUSED`, `STOPPED`, `COMPLETED`

### Show Time Entry Details

Display detailed time entry information.

```bash
pnpm cli time show <id>
```

### Start Time Entry

Start a new time entry.

```bash
pnpm cli time start <project> [--description=DESC] [--task=TASK]
```

### Stop Time Entry

Stop current or specific time entry.

```bash
pnpm cli time stop [--id=ID]
```

### Pause Time Entry

Pause a time entry.

```bash
pnpm cli time pause [--id=ID]
```

### Resume Time Entry

Resume a paused time entry.

```bash
pnpm cli time resume [--id=ID]
```

### Create Time Entry

Create a manual time entry.

```bash
pnpm cli time create <project> <duration> [--description=DESC] [--date=DATE] [--task=TASK]
```

**Duration format:** `"2h 30m"` or `"150"` (minutes)

### Update Time Entry

Update time entry details.

```bash
pnpm cli time update <id> [--duration=DURATION] [--description=DESC] [--date=DATE]
```

### Delete Time Entry

Delete a time entry.

```bash
pnpm cli time delete <id>
```

### Export Time Entries

Export time entries (coming soon).

```bash
pnpm cli time export [--user=EMAIL] [--project=PROJECT] [--start-date=DATE] [--end-date=DATE] [--format=CSV|JSON]
```

### Time Report

Generate time report (coming soon).

```bash
pnpm cli time report [--user=EMAIL] [--project=PROJECT] [--period=WEEK|MONTH|YEAR]
```

## Permission Management

### List Permissions

List all permissions with optional filters.

```bash
pnpm cli permission list [--category=CATEGORY] [--module=MODULE]
```

### Show Permission Details

Display detailed permission information.

```bash
pnpm cli permission show <key>
```

### Grant Permission

Grant a permission to a group.

```bash
pnpm cli permission grant <group> <permission>
```

### Revoke Permission

Revoke a permission from a group.

```bash
pnpm cli permission revoke <group> <permission>
```

### List Group Permissions

List all permissions for a group.

```bash
pnpm cli permission list-group <group>
```

### Sync Permissions

Sync permissions from code definitions.

```bash
pnpm cli permission sync
```

**Note:** Use `pnpm db:seed-permissions` to seed permissions.

## Statistics & Analytics

### Overview

View system-wide statistics.

```bash
pnpm cli stats overview
```

### User Statistics

View user statistics.

```bash
pnpm cli stats users [--period=WEEK|MONTH|YEAR]
```

### Project Statistics

View project statistics.

```bash
pnpm cli stats projects [--status=STATUS]
```

### Ticket Statistics

View ticket statistics.

```bash
pnpm cli stats tickets [--period=PERIOD] [--status=STATUS]
```

### Time Statistics

View time tracking statistics.

```bash
pnpm cli stats time [--user=EMAIL] [--project=PROJECT] [--period=PERIOD]
```

### Export Statistics

Export statistics (coming soon).

```bash
pnpm cli stats export [--type=TYPE] [--format=CSV|JSON] [--output=FILE]
```

## Database Maintenance

### Database Status

Check database connection and health.

```bash
pnpm cli db status
```

### Database Migrate

Run database migrations.

```bash
pnpm cli db migrate [--dry-run]
```

**Note:** Use `pnpm db:migrate` for actual migrations.

### Database Seed

Seed database data.

```bash
pnpm cli db seed [--module=MODULE]
```

**Note:** Use `pnpm db:seed-permissions` for seeding permissions.

### Database Cleanup

Cleanup old data.

```bash
pnpm cli db cleanup [--expired-sessions] [--old-tickets] [--soft-deleted-users]
```

### Database Optimize

Run database optimization.

```bash
pnpm cli db optimize
```

**Note:** Use database-specific tools (VACUUM, ANALYZE, etc.).

### Database Statistics

View database statistics.

```bash
pnpm cli db stats
```

### Database Validate

Validate data integrity.

```bash
pnpm cli db validate
```

## Configuration Management

### List Configuration

List all module configurations.

```bash
pnpm cli config list
```

### Get Configuration

Get a configuration value.

```bash
pnpm cli config get <key>
```

**Example:** `pnpm cli config get tickets.maxTickets`

### Set Configuration

Set a configuration value.

```bash
pnpm cli config set <key> <value>
```

**Example:** `pnpm cli config set tickets.maxTickets 100`

### Unset Configuration

Remove a configuration.

```bash
pnpm cli config unset <key>
```

### Validate Configuration

Validate all configurations.

```bash
pnpm cli config validate
```

### Export Configuration

Export configuration (coming soon).

```bash
pnpm cli config export [--output=FILE]
```

### Import Configuration

Import configuration (coming soon).

```bash
pnpm cli config import <file>
```

## Future Features

- Data import/export commands
- Advanced user features (search, merge, activity logs)
- Enhanced interactive features (fuzzy search, command history, aliases)
- Audit logging
- API integration commands
