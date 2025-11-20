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

# Activate the user
pnpm cli user update-status admin@example.com ACTIVE

# Promote to admin role
pnpm cli user update-role admin@example.com ADMIN

# Verify the user
pnpm cli user show admin@example.com
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

## Future Features

- Module management commands
- Bulk user operations
- User import/export
- Permission management
- Audit logging
