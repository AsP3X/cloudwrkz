# Group-Based Permission System - Schema & Structure

## Database Schema

### New Models

```prisma
// Permission Model - Defines all available permissions
model Permission {
  id          String   @id @default(cuid())
  key         String   @unique // e.g., "tickets.create", "projects.view"
  name        String   // Display name: "Create Tickets"
  description String?  // "Allows users to create new support tickets"
  category    String   // "tickets", "projects", "admin", "time_tracking"
  module      String?  // Optional: "tickets", "projects", "timetracking"
  
  groupPermissions GroupPermission[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([key])
  @@index([category])
  @@index([module])
  @@map("permissions")
}

// GroupPermission Model - Links Groups to Permissions
model GroupPermission {
  id           String     @id @default(cuid())
  groupId      String
  permissionId String
  group        Group      @relation(fields: [groupId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  createdAt    DateTime   @default(now())
  
  @@unique([groupId, permissionId])
  @@index([groupId])
  @@index([permissionId])
  @@map("group_permissions")
}
```

### Updated Models

```prisma
// Updated Group Model
model Group {
  id          String  @id @default(cuid())
  name        String  @unique
  description String?
  
  // Existing relations
  members            GroupMembership[]
  tickets            Ticket[]
  projectMemberships ProjectGroup[]
  
  // New relation
  permissions        GroupPermission[] // ADD THIS
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([name])
  @@map("groups")
}
```

## Permission Structure

### Permission Key Format
`{category}.{action}` or `{category}.{resource}.{action}`

Examples:
- `tickets.view`
- `tickets.create`
- `projects.manage_members`
- `admin.users.delete`

### Complete Permission List

#### Tickets Category
| Key | Name | Description |
|-----|------|-------------|
| `tickets.view` | View Tickets | View tickets assigned to user or user's groups |
| `tickets.view_all` | View All Tickets | View all tickets regardless of assignment |
| `tickets.create` | Create Tickets | Create new support tickets |
| `tickets.update` | Update Tickets | Update existing tickets |
| `tickets.delete` | Delete Tickets | Delete tickets |
| `tickets.assign` | Assign Tickets | Assign tickets to users or groups |
| `tickets.comment` | Comment on Tickets | Add comments to tickets |

#### Projects Category
| Key | Name | Description |
|-----|------|-------------|
| `projects.view` | View Projects | View projects user is a member of |
| `projects.view_all` | View All Projects | View all projects |
| `projects.create` | Create Projects | Create new projects |
| `projects.update` | Update Projects | Update project details |
| `projects.delete` | Delete Projects | Delete projects |
| `projects.manage_members` | Manage Project Members | Add/remove project members |
| `projects.manage_groups` | Manage Project Groups | Assign groups to projects |

#### Time Tracking Category
| Key | Name | Description |
|-----|------|-------------|
| `time_tracking.view` | View Time Entries | View own time entries |
| `time_tracking.view_all` | View All Time Entries | View all time entries |
| `time_tracking.create` | Create Time Entries | Create new time entries |
| `time_tracking.update` | Update Time Entries | Update time entries |
| `time_tracking.delete` | Delete Time Entries | Delete time entries |

#### Tasks Category
| Key | Name | Description |
|-----|------|-------------|
| `tasks.view` | View Tasks | View tasks in accessible projects |
| `tasks.create` | Create Tasks | Create new tasks |
| `tasks.update` | Update Tasks | Update existing tasks |
| `tasks.delete` | Delete Tasks | Delete tasks |

#### Risks Category
| Key | Name | Description |
|-----|------|-------------|
| `risks.view` | View Risks | View project risks |
| `risks.create` | Create Risks | Create new risks |
| `risks.update` | Update Risks | Update existing risks |
| `risks.delete` | Delete Risks | Delete risks |

#### Issues Category
| Key | Name | Description |
|-----|------|-------------|
| `issues.view` | View Issues | View project issues |
| `issues.create` | Create Issues | Create new issues |
| `issues.update` | Update Issues | Update existing issues |
| `issues.delete` | Delete Issues | Delete issues |

#### Notes Category
| Key | Name | Description |
|-----|------|-------------|
| `notes.view` | View Notes | View project notes |
| `notes.create` | Create Notes | Create new notes |
| `notes.update` | Update Notes | Update existing notes |
| `notes.delete` | Delete Notes | Delete notes |

#### Admin Category
| Key | Name | Description |
|-----|------|-------------|
| `admin.users.view` | View Users | View user list |
| `admin.users.create` | Create Users | Create new users |
| `admin.users.update` | Update Users | Update user details |
| `admin.users.delete` | Delete Users | Delete users |
| `admin.groups.manage` | Manage Groups | Create/edit/delete groups and assign permissions |
| `admin.settings.manage` | Manage Settings | Modify system settings |
| `admin.modules.manage` | Manage Modules | Enable/disable modules |
| `admin.sessions.view` | View Sessions | View user sessions |
| `admin.statistics.view` | View Statistics | View system statistics |
| `admin.tickets.manage` | Manage All Tickets | Full ticket management (admin view) |

## Permission Inheritance

### Role-Based Default Permissions

#### ADMIN Role
- **All permissions** (cannot be restricted)
- Automatically granted all permissions regardless of group membership

#### MODERATOR Role
- All tickets permissions
- All projects permissions
- All time tracking permissions
- All tasks, risks, issues, notes permissions
- Admin: users.view, groups.manage, sessions.view, statistics.view
- **NOT**: admin.settings.manage, admin.modules.manage

#### AGENT Role
- tickets.view, tickets.create, tickets.update, tickets.comment
- tickets.view_all (if in group with permission)
- time_tracking.view, time_tracking.create, time_tracking.update
- projects.view (assigned projects only)
- tasks.view, tasks.create, tasks.update (in assigned projects)
- **NOT**: tickets.delete, projects.create, admin permissions

#### USER Role
- tickets.view (own tickets), tickets.create
- time_tracking.view (own entries), time_tracking.create
- projects.view (assigned projects only)
- **NOT**: Most update/delete permissions, admin permissions

### Group-Based Permissions
- Permissions are **additive** - user gets permissions from all groups
- Group permissions **extend** role permissions, don't replace them
- If user has `tickets.view` from role, group can add `tickets.view_all`
- Groups cannot remove role-based permissions

## Permission Checking Flow

```
User Action Request
    ↓
1. Check User Role
    ↓
2. Get User's Groups
    ↓
3. Get Permissions from:
   - Role (default permissions)
   - All Groups (group permissions)
    ↓
4. Check if Required Permission Exists
    ↓
5. If Yes → Allow Action
   If No → Deny Action (403 Forbidden)
```

## Example Scenarios

### Scenario 1: Agent with Group Permissions
- **User**: Agent (role: AGENT)
- **Groups**: "Support Team" (has `tickets.view_all`, `tickets.delete`)
- **Effective Permissions**:
  - From Role: `tickets.view`, `tickets.create`, `tickets.update`, `tickets.comment`
  - From Group: `tickets.view_all`, `tickets.delete`
  - **Result**: Can view all tickets and delete tickets (beyond normal agent permissions)

### Scenario 2: User with Multiple Groups
- **User**: User (role: USER)
- **Groups**: 
  - "Project Team A" (has `projects.view`, `tasks.view`, `tasks.create`)
  - "Time Trackers" (has `time_tracking.view_all`)
- **Effective Permissions**:
  - From Role: `tickets.view` (own), `tickets.create`, `time_tracking.view` (own), `time_tracking.create`
  - From Groups: `projects.view`, `tasks.view`, `tasks.create`, `time_tracking.view_all`
  - **Result**: Can view assigned projects, create tasks, and view all time entries

### Scenario 3: Admin
- **User**: Admin (role: ADMIN)
- **Groups**: None (or any groups)
- **Effective Permissions**:
  - **All permissions** (admin always has full access)
  - Groups are ignored for admins

## Database Relationships

```
User
  ├── GroupMembership (many-to-many)
  │     └── Group
  │           └── GroupPermission (many-to-many)
  │                 └── Permission
  │
  └── Role (USER, AGENT, MODERATOR, ADMIN)
        └── Default Permissions (hardcoded in code)
```

## Query Examples

### Get User's Effective Permissions
```typescript
// 1. Get role-based permissions (from code/constants)
const rolePermissions = getRolePermissions(user.role);

// 2. Get group-based permissions
const userGroups = await prisma.groupMembership.findMany({
  where: { userId: user.id },
  include: {
    group: {
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    }
  }
});

const groupPermissions = userGroups
  .flatMap(m => m.group.permissions)
  .map(gp => gp.permission.key);

// 3. Combine (union, no duplicates)
const effectivePermissions = [...new Set([...rolePermissions, ...groupPermissions])];
```

### Check if User Has Permission
```typescript
const hasPermission = effectivePermissions.includes('tickets.create');
```

### Get All Permissions for a Group
```typescript
const groupPermissions = await prisma.groupPermission.findMany({
  where: { groupId: groupId },
  include: { permission: true }
});
```

## Migration Strategy

### Step 1: Add Models
- Add Permission and GroupPermission models to schema
- Run migration

### Step 2: Seed Permissions
- Create seed script
- Insert all permission definitions
- Verify all permissions exist

### Step 3: Update Code
- Add permission checking utilities
- Update server actions gradually
- Maintain backward compatibility

### Step 4: Update UI
- Add permission management to group pages
- Update user pages to show permissions
- Add permission indicators

## Security Considerations

1. **Server-Side Only**: All permission checks must happen on the server
2. **No Client Trust**: Never rely on client-side permission checks
3. **Default Deny**: If permission check fails, deny access
4. **Admin Override**: Admins always have all permissions
5. **Audit Logging**: Log permission denials for security auditing
6. **Caching**: Cache user permissions for performance, but validate on each request

## Performance Optimization

1. **Cache User Permissions**: Store in session/context after first lookup
2. **Database Indexes**: Index permission keys, group IDs, user IDs
3. **Batch Checks**: Check multiple permissions in single query when possible
4. **Lazy Loading**: Load permissions only when needed
5. **Redis Cache**: Consider Redis for frequently accessed permissions (future)
