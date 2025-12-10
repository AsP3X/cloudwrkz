# Group-Based Permission System Implementation Plan

## Executive Summary

This document outlines the implementation plan for a comprehensive group-based permission system that extends the existing role-based access control. The system will allow admins to create permission groups, assign granular permissions to these groups, and assign users to groups. Users will gain access to features based on the permissions of all groups they belong to.

## Current State Analysis

### Existing Infrastructure

1. **Database Models:**
   - `Group` model exists with `id`, `name`, `description`
   - `GroupMembership` model links users to groups (many-to-many)
   - `ProjectGroup` model links groups to projects
   - Groups are currently used for ticket assignment filtering

2. **Current Permission System:**
   - Role-based: `USER`, `AGENT`, `ADMIN`, `MODERATOR`
   - Permission checks use `requireRole()` and `requireAnyRole()` functions
   - Groups are used for ticket visibility (agents see tickets assigned to their groups)

3. **Existing UI:**
   - Group overview page: `/dashboard/admin/groups`
   - Group detail page: `/dashboard/admin/groups/[id]`
   - Basic CRUD operations for groups
   - Add/remove agents from groups

4. **Features/Modules:**
   - Tickets
   - Projects
   - Time Tracking
   - Tasks
   - Risks/Issues
   - Notes
   - Admin features (users, groups, settings, modules, sessions, statistics)

## Implementation Plan

### Phase 1: Database Schema Extensions

#### 1.1 Permission Model
Create a new `Permission` model to define available permissions:

```prisma
model Permission {
  id          String   @id @default(cuid())
  key         String   @unique // e.g., "tickets.create", "projects.view", "admin.users.manage"
  name        String   // Display name
  description String?  // Description of what this permission allows
  category    String   // e.g., "tickets", "projects", "admin", "time_tracking"
  module      String?  // Optional: link to module (tickets, projects, timetracking)
  
  // Relations
  groupPermissions GroupPermission[]
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([key])
  @@index([category])
  @@index([module])
  @@map("permissions")
}
```

#### 1.2 GroupPermission Model
Create a many-to-many relationship between Groups and Permissions:

```prisma
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

#### 1.3 Update Group Model
Add relation to GroupPermission:

```prisma
model Group {
  // ... existing fields
  permissions GroupPermission[] // Add this line
  // ... rest of model
}
```

### Phase 2: Permission Definitions

#### 2.1 Permission Categories

**Tickets:**
- `tickets.view` - View tickets
- `tickets.create` - Create new tickets
- `tickets.update` - Update existing tickets
- `tickets.delete` - Delete tickets
- `tickets.assign` - Assign tickets to users/groups
- `tickets.comment` - Add comments to tickets
- `tickets.view_all` - View all tickets (not just assigned/group tickets)

**Projects:**
- `projects.view` - View projects
- `projects.create` - Create new projects
- `projects.update` - Update existing projects
- `projects.delete` - Delete projects
- `projects.manage_members` - Add/remove project members
- `projects.manage_groups` - Assign groups to projects
- `projects.view_all` - View all projects (not just assigned)

**Time Tracking:**
- `time_tracking.view` - View time entries
- `time_tracking.create` - Create time entries
- `time_tracking.update` - Update time entries
- `time_tracking.delete` - Delete time entries
- `time_tracking.view_all` - View all time entries (not just own)

**Tasks:**
- `tasks.view` - View tasks
- `tasks.create` - Create tasks
- `tasks.update` - Update tasks
- `tasks.delete` - Delete tasks

**Risks/Issues:**
- `risks.view` - View project risks
- `risks.create` - Create risks
- `risks.update` - Update risks
- `risks.delete` - Delete risks
- `issues.view` - View project issues
- `issues.create` - Create issues
- `issues.update` - Update issues
- `issues.delete` - Delete issues

**Notes:**
- `notes.view` - View project notes
- `notes.create` - Create notes
- `notes.update` - Update notes
- `notes.delete` - Delete notes

**Admin:**
- `admin.users.view` - View users list
- `admin.users.create` - Create users
- `admin.users.update` - Update users
- `admin.users.delete` - Delete users
- `admin.groups.manage` - Manage groups and permissions
- `admin.settings.manage` - Manage system settings
- `admin.modules.manage` - Manage modules
- `admin.sessions.view` - View user sessions
- `admin.statistics.view` - View statistics
- `admin.tickets.manage` - Full ticket management (admin view)

#### 2.2 Permission Seeding Script
Create a script to seed default permissions into the database.

### Phase 3: Permission Checking Utilities

#### 3.1 Enhanced Auth Utilities
Extend `auth-server.ts` with permission checking functions:

```typescript
// Check if user has a specific permission (via role or group)
export async function hasPermission(
  userId: string,
  permissionKey: string
): Promise<boolean>

// Require a specific permission (throws if not granted)
export async function requirePermission(
  permissionKey: string
): Promise<CurrentUser>

// Check if user has any of the specified permissions
export async function hasAnyPermission(
  userId: string,
  permissionKeys: string[]
): Promise<boolean>

// Get all permissions for a user (from role + groups)
export async function getUserPermissions(
  userId: string
): Promise<string[]>

// Check if user has permission for a specific resource
// (e.g., can user update this specific ticket?)
export async function canAccessResource(
  userId: string,
  resourceType: string,
  resourceId: string,
  action: string
): Promise<boolean>
```

#### 3.2 Role-to-Permission Mapping
Define default permissions for each role:
- `ADMIN`: All permissions
- `MODERATOR`: Most permissions except admin settings
- `AGENT`: Limited permissions (tickets, time tracking, assigned projects)
- `USER`: Minimal permissions (own tickets, own time entries, assigned projects)

### Phase 4: Server Actions Updates

#### 4.1 Permission-Aware Actions
Update all server actions to check permissions:

**Tickets (`tickets.ts`):**
- `createTicket`: Check `tickets.create`
- `getTickets`: Check `tickets.view` + filter by group permissions
- `getTicket`: Check `tickets.view` + resource-level access
- `updateTicket`: Check `tickets.update` + resource-level access
- `deleteTicket`: Check `tickets.delete` + resource-level access

**Projects (`projects.ts`):**
- Similar pattern for all project operations

**Time Tracking (`time-tracking.ts`):**
- Similar pattern for all time tracking operations

**Tasks, Risks, Issues, Notes:**
- Similar pattern for all operations

**Admin Actions:**
- Check specific admin permissions for each action

#### 4.2 Group Permission Management Actions
Create new actions in `groups.ts`:

```typescript
// Get all available permissions
export async function getPermissions()

// Get permissions for a group
export async function getGroupPermissions(groupId: string)

// Add permission to group
export async function addPermissionToGroup(
  groupId: string,
  permissionId: string
): Promise<ActionResult>

// Remove permission from group
export async function removePermissionFromGroup(
  groupId: string,
  permissionId: string
): Promise<ActionResult>

// Bulk update group permissions
export async function updateGroupPermissions(
  groupId: string,
  permissionIds: string[]
): Promise<ActionResult>
```

### Phase 5: UI Enhancements

#### 5.1 Group Overview Page Enhancements
Update `/dashboard/admin/groups/page.tsx`:
- Add column showing number of permissions per group
- Add filter/search by permission
- Show permission summary badges

#### 5.2 Group Detail Page Enhancements
Update `/dashboard/admin/groups/[id]/page.tsx`:
- Add "Permissions" tab/section
- Display all permissions with checkboxes
- Group permissions by category
- Search/filter permissions
- Bulk select/deselect by category
- Show permission descriptions on hover

#### 5.3 Permission Management Component
Create new component: `GroupPermissionsManager.tsx`
- Tree view of permissions organized by category
- Checkbox interface for selecting permissions
- Search functionality
- Category expansion/collapse
- Visual indicators for permission dependencies
- Save/cancel functionality

#### 5.4 User Detail Page Updates
Update `/dashboard/admin/users/[id]/page.tsx`:
- Show all groups user belongs to
- Show effective permissions (from role + groups)
- Allow adding/removing user from groups
- Visual permission summary

### Phase 6: Migration Strategy

#### 6.1 Data Migration
1. Create migration script to:
   - Create Permission and GroupPermission tables
   - Seed default permissions
   - Map existing roles to default permissions
   - Preserve existing group memberships

#### 6.2 Code Migration
1. Gradually migrate permission checks:
   - Start with new features
   - Migrate admin features first
   - Then migrate user-facing features
   - Maintain backward compatibility during transition

#### 6.3 Backward Compatibility
- Keep role-based checks as fallback
- Admins always have all permissions
- Default permissions for existing roles

### Phase 7: Testing & Validation

#### 7.1 Unit Tests
- Permission checking utilities
- Server actions with permission checks
- Group permission management

#### 7.2 Integration Tests
- User with multiple groups
- Permission inheritance
- Resource-level access control
- Edge cases (no permissions, all permissions, etc.)

#### 7.3 Manual Testing
- Admin can create groups and assign permissions
- Users gain access based on group membership
- Permission changes take effect immediately
- UI correctly reflects permissions

## Implementation Steps

### Step 1: Database Schema (Priority: High)
1. Update `schema.prisma` with Permission and GroupPermission models
2. Create and run migration
3. Create permission seeding script
4. Seed default permissions

### Step 2: Permission Utilities (Priority: High)
1. Create permission checking functions in `auth-server.ts`
2. Create permission constants file
3. Create role-to-permission mapping
4. Test permission checking logic

### Step 3: Group Permission Management (Priority: High)
1. Add server actions for managing group permissions
2. Create permission management UI component
3. Update group detail page with permissions section
4. Test group permission assignment

### Step 4: Update Server Actions (Priority: Medium)
1. Update ticket actions with permission checks
2. Update project actions with permission checks
3. Update time tracking actions with permission checks
4. Update other feature actions
5. Update admin actions

### Step 5: UI Enhancements (Priority: Medium)
1. Enhance group overview page
2. Enhance group detail page
3. Update user detail page
4. Add permission indicators throughout UI

### Step 6: Documentation & Testing (Priority: Low)
1. Write documentation for permission system
2. Create admin guide for managing permissions
3. Write tests
4. Manual testing and bug fixes

## Technical Considerations

### Performance
- Cache user permissions in session/context
- Use database indexes on permission lookups
- Batch permission checks when possible
- Consider Redis caching for frequently accessed permissions

### Security
- Always check permissions on the server side
- Never trust client-side permission checks
- Validate permissions on every action
- Log permission denials for auditing

### Scalability
- Design permission system to handle many permissions
- Consider permission hierarchies in the future
- Design for potential permission inheritance
- Consider permission templates/presets

### User Experience
- Clear error messages when permissions are denied
- Visual indicators of what users can/cannot do
- Helpful tooltips explaining permissions
- Permission request workflow (future enhancement)

## Future Enhancements

1. **Permission Inheritance**: Allow groups to inherit permissions from other groups
2. **Permission Templates**: Pre-defined permission sets for common roles
3. **Resource-Level Permissions**: Fine-grained permissions for specific resources
4. **Permission Request Workflow**: Users can request additional permissions
5. **Permission Audit Log**: Track permission changes and usage
6. **Time-Limited Permissions**: Permissions that expire after a certain time
7. **Conditional Permissions**: Permissions that depend on other conditions
8. **Permission Analytics**: Track which permissions are used most

## Files to Create/Modify

### New Files
- `prisma/migrations/XXXX_add_permissions.sql`
- `src/lib/constants/permissions.ts`
- `src/lib/utils/permissions.ts`
- `src/server/actions/permissions.ts`
- `src/components/features/admin/GroupManagement/GroupPermissionsManager.tsx`
- `scripts/seed-permissions.ts`

### Modified Files
- `prisma/schema.prisma`
- `src/lib/utils/auth-server.ts`
- `src/server/actions/groups.ts`
- `src/server/actions/tickets.ts`
- `src/server/actions/projects.ts`
- `src/server/actions/time-tracking.ts`
- `src/server/actions/tasks.ts`
- `src/server/actions/project-risks-issues.ts`
- `src/server/actions/project-notes.ts`
- `src/server/actions/admin/*.ts`
- `src/components/features/admin/GroupManagement/GroupDetailPage.tsx`
- `src/components/features/admin/GroupManagement/GroupManagementPage.tsx`
- `src/components/features/admin/UserManagement/UserDetailPage.tsx`

## Success Criteria

1. ✅ Admins can create groups and assign granular permissions
2. ✅ Users gain access based on group membership
3. ✅ Permission checks are enforced on all server actions
4. ✅ UI clearly shows permissions and access levels
5. ✅ System is backward compatible with existing role-based checks
6. ✅ Performance is acceptable with permission checks
7. ✅ All existing functionality continues to work
8. ✅ Comprehensive admin UI for permission management

## Timeline Estimate

- **Phase 1 (Database)**: 1-2 days
- **Phase 2 (Definitions)**: 1 day
- **Phase 3 (Utilities)**: 2-3 days
- **Phase 4 (Server Actions)**: 3-5 days
- **Phase 5 (UI)**: 3-4 days
- **Phase 6 (Migration)**: 1-2 days
- **Phase 7 (Testing)**: 2-3 days

**Total Estimated Time**: 13-20 days

## Notes

- This system extends rather than replaces the existing role-based system
- Admins always have all permissions (cannot be restricted)
- The system is designed to be backward compatible
- Permission checks should be fast and cached when possible
- Consider using a permission library in the future if complexity grows
