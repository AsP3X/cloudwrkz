# Admin Dashboard Implementation Plan

## Overview

This document outlines the implementation plan for the Admin Dashboard feature. The admin dashboard will provide comprehensive system management capabilities for administrators, following the existing design patterns and component architecture.

## Design Reference

The admin dashboard will follow the existing design system:
- **Color Scheme**: Primary/secondary gradients, neutral grays with dark mode support
- **Components**: Reuse existing UI components (Button, Input, Select, Dialog, Card)
- **Layout**: Consistent with dashboard layout (sidebar + header)
- **Styling**: Tailwind CSS with soft shadows, rounded corners, backdrop blur effects
- **Typography**: Same font system and text hierarchy

## Access Control

- **Route Protection**: Admins use the same `/dashboard` route as users/agents
- **Content Display**: Dashboard content changes based on role (USER, AGENT, ADMIN)
- **Server Actions**: All admin actions require `requireRole("ADMIN")`
- **UI Visibility**: Admin navigation items only visible to admins in sidebar

## Routes Structure

**Main Dashboard**: `/dashboard` (same for all roles)
- Shows role-specific content:
  - **USER**: User dashboard (existing)
  - **AGENT**: Agent dashboard (existing)
  - **ADMIN**: Admin dashboard (new - system stats and overview)

**Admin Management Pages**: `/dashboard/admin/*` (only accessible to admins)
```
/dashboard/admin/
├── users/
│   ├── page.tsx               # User management list
│   └── [id]/
│       └── page.tsx           # User detail/edit page
├── modules/
│   └── page.tsx               # Module management
├── groups/
│   ├── page.tsx               # Group management list
│   ├── [id]/
│   │   └── page.tsx           # Group detail/edit page
│   └── new/
│       └── page.tsx           # Create new group
└── settings/
    └── page.tsx               # System settings
```

## Features to Implement

### 1. Admin Dashboard Overview (`/dashboard` - Admin View)

**Purpose**: High-level system statistics and quick actions

**Implementation**: 
- Modify `/dashboard/page.tsx` to detect ADMIN role and render `AdminDashboard` component
- Follow existing pattern: The page already checks `user.role === "AGENT"` and renders `AgentDashboard`
- Add similar check: `if (user.role === "ADMIN") return <AdminDashboard user={user} />`
- Update redirect check to include ADMIN role: `if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN"))`

**Components Needed**:
- `AdminDashboard` component (similar structure to `AgentDashboard`)
- Stats cards (similar to agent dashboard)
- Quick action buttons linking to admin management pages
- Recent activity feed (optional)

**Statistics to Display**:
- Total users (by status: ACTIVE, PENDING, SUSPENDED, DELETED)
- Total tickets (by status)
- Active sessions count
- Enabled modules count
- Groups count
- Recent registrations (last 7 days)
- Tickets created (last 7 days)

**Design Pattern**: Similar to existing `/dashboard/page.tsx` with stats grid, matching agent dashboard style

**Server Actions Needed**:
- `getAdminStats()` - Aggregate statistics
- `getRecentActivity()` - Recent user registrations, ticket creations (optional)

### 2. User Management (`/dashboard/admin/users`)

**Purpose**: Comprehensive user CRUD operations

**Features**:
- List all users with filters (status, role, search)
- View user details
- Edit user (name, email, role, status)
- Create new user
- Delete user (with confirmation)
- Bulk actions (suspend multiple, activate multiple)
- Export users (optional)

**Components Needed**:
- `UserListTable` - Table with pagination, sorting, filtering
- `UserFilterBar` - Filter by status, role, search
- `UserCreateDialog` - Modal form to create user
- `UserEditDialog` - Modal form to edit user
- `UserDeleteDialog` - Confirmation dialog
- `UserStatusBadge` - Badge component for status
- `UserRoleBadge` - Badge component for role

**Server Actions Needed**:
- `getAllUsersAdmin(filters)` - Get users with filters, pagination
- `getUserByIdAdmin(userId)` - Get full user details
- `createUserAdmin(input)` - Create new user
- `updateUserAdmin(userId, input)` - Update user
- `deleteUserAdmin(userId)` - Delete user
- `updateUserStatusAdmin(userId, status)` - Update status
- `updateUserRoleAdmin(userId, role)` - Update role
- `bulkUpdateUserStatusAdmin(userIds, status)` - Bulk status update

**Design Pattern**: Similar to `/dashboard/tickets/page.tsx` with table view

### 3. Module Management (`/dashboard/admin/modules`)

**Purpose**: Enable/disable system modules

**Features**:
- List all modules with enabled status
- Toggle module enabled/disabled
- View module configuration
- Module description and details

**Components Needed**:
- `ModuleList` - List of modules with toggle switches
- `ModuleCard` - Card component for each module
- `ModuleToggle` - Toggle switch component

**Server Actions Needed**:
- `getAllModules()` - Already exists
- `setModuleEnabled(moduleKey, enabled)` - Already exists
- `getModuleConfig(moduleKey)` - Get module configuration

**Design Pattern**: Card-based layout with toggle switches

### 4. Group Management (`/dashboard/admin/groups`)

**Purpose**: Manage agent groups

**Features**:
- List all groups
- Create new group
- Edit group (name, description)
- Delete group
- View group members
- Add/remove agents from groups

**Components Needed**:
- `GroupList` - List of groups
- `GroupCard` - Card component for each group
- `GroupCreateDialog` - Modal form to create group
- `GroupEditDialog` - Modal form to edit group
- `GroupMembersList` - List of group members
- `AddAgentToGroupDialog` - Modal to add agent to group

**Server Actions Needed**:
- `getGroups()` - Already exists
- `getGroup(id)` - Already exists
- `createGroup(input)` - Already exists
- `updateGroup(id, input)` - Already exists
- `deleteGroup(id)` - Already exists
- `addAgentToGroup(groupId, agentId)` - Already exists
- `removeAgentFromGroup(groupId, agentId)` - Already exists
- `getAgents()` - Already exists

**Design Pattern**: Card-based layout, similar to tickets list

### 5. System Settings (`/dashboard/admin/settings`)

**Purpose**: System-wide configuration

**Features**:
- System information
- Database statistics
- Purge deleted accounts (manual trigger)
- System health checks
- Configuration options (future)

**Components Needed**:
- `SystemInfoCard` - Display system information
- `DatabaseStatsCard` - Database statistics
- `PurgeAccountsCard` - Manual purge trigger
- `HealthCheckCard` - System health status

**Server Actions Needed**:
- `getSystemInfo()` - System information
- `getDatabaseStats()` - Database statistics
- `purgeDeletedAccounts()` - Manual purge trigger
- `getSystemHealth()` - Health check status

**Design Pattern**: Card-based layout with action buttons

## Component Architecture

### New Components to Create

#### Admin-Specific Components
```
src/components/features/admin/
├── AdminStats/
│   ├── AdminStats.tsx
│   ├── AdminStatCard.tsx
│   └── index.ts
├── UserManagement/
│   ├── UserListTable.tsx
│   ├── UserFilterBar.tsx
│   ├── UserCreateDialog.tsx
│   ├── UserEditDialog.tsx
│   ├── UserDeleteDialog.tsx
│   ├── UserStatusBadge.tsx
│   ├── UserRoleBadge.tsx
│   └── index.ts
├── ModuleManagement/
│   ├── ModuleList.tsx
│   ├── ModuleCard.tsx
│   ├── ModuleToggle.tsx
│   └── index.ts
├── GroupManagement/
│   ├── GroupList.tsx
│   ├── GroupCard.tsx
│   ├── GroupCreateDialog.tsx
│   ├── GroupEditDialog.tsx
│   ├── GroupMembersList.tsx
│   ├── AddAgentToGroupDialog.tsx
│   └── index.ts
└── SystemSettings/
    ├── SystemInfoCard.tsx
    ├── DatabaseStatsCard.tsx
    ├── PurgeAccountsCard.tsx
    ├── HealthCheckCard.tsx
    └── index.ts
```

#### Reusable UI Components (if needed)
```
src/components/ui/
├── Table/
│   ├── Table.tsx
│   ├── TableHeader.tsx
│   ├── TableRow.tsx
│   ├── TableCell.tsx
│   └── index.ts
├── Badge/
│   ├── Badge.tsx
│   └── index.ts
├── Toggle/
│   ├── Toggle.tsx
│   └── index.ts
└── Pagination/
    ├── Pagination.tsx
    └── index.ts
```

### Server Actions Structure

```
src/server/actions/admin/
├── stats.ts              # Admin statistics
├── users.ts              # User management (admin-specific)
├── modules.ts            # Module management (already exists, may extend)
├── groups.ts             # Group management (already exists)
├── settings.ts           # System settings
└── health.ts             # System health checks
```

## Implementation Steps

### Phase 1: Foundation
1. ✅ Create feature branch `feature/admin-dashboard`
2. Add admin route constants to `src/lib/constants/routes.ts`
3. Update `DashboardSidebar` component:
   - Add `userRole` prop to `DashboardSidebarProps`
   - Add admin navigation items array
   - Filter admin items based on `userRole === "ADMIN"`
   - Update layout to pass `user.role` to sidebar
4. Update `/dashboard/page.tsx`:
   - Update redirect check to include ADMIN role
   - Add `AdminDashboard` component check: `if (user.role === "ADMIN") return <AdminDashboard user={user} />`
5. Ensure admin routes under `/dashboard/admin/*` are protected (require ADMIN role in each page)

### Phase 2: Admin Dashboard Overview
1. Create `getAdminStats()` server action
2. Create `AdminDashboard` component (similar to `AgentDashboard`)
3. Update `/dashboard/page.tsx` to detect ADMIN role and render admin dashboard
4. Add quick action buttons linking to admin management pages
5. Style to match existing dashboard design (same as agent dashboard)

### Phase 3: User Management
1. Create admin user management server actions
2. Create `UserListTable` component with pagination
3. Create `UserFilterBar` component
4. Create user CRUD dialogs (Create, Edit, Delete)
5. Implement user management page
6. Add bulk actions
7. Add user detail view page

### Phase 4: Module Management
1. Create `ModuleList` component
2. Create `ModuleCard` component
3. Create `ModuleToggle` component
4. Implement module management page
5. Add module configuration display

### Phase 5: Group Management
1. Create `GroupList` component
2. Create `GroupCard` component
3. Create group CRUD dialogs
4. Create `GroupMembersList` component
5. Create `AddAgentToGroupDialog` component
6. Implement group management pages

### Phase 6: System Settings
1. Create system info server actions
2. Create `SystemInfoCard` component
3. Create `DatabaseStatsCard` component
4. Create `PurgeAccountsCard` component
5. Create `HealthCheckCard` component
6. Implement system settings page

### Phase 7: Polish & Testing
1. Add loading states
2. Add error handling
3. Add success/error toast notifications
4. Test all CRUD operations
5. Test role-based access control
6. Responsive design testing
7. Dark mode testing

## Design Specifications

### Color Usage
- **Primary Actions**: `primary-600` / `primary-500`
- **Danger Actions**: `error-600` / `error-500`
- **Success States**: `success-600` / `success-500`
- **Warning States**: `warning-600` / `warning-500`
- **Status Badges**: 
  - ACTIVE: `success-100` bg, `success-700` text
  - PENDING: `warning-100` bg, `warning-700` text
  - SUSPENDED: `error-100` bg, `error-700` text
  - DELETED: `neutral-100` bg, `neutral-700` text

### Typography
- **Page Titles**: `text-3xl font-bold`
- **Section Headers**: `text-xl font-semibold`
- **Card Titles**: `text-lg font-semibold`
- **Body Text**: `text-sm` or `text-base`
- **Helper Text**: `text-xs text-neutral-500`

### Spacing
- **Page Padding**: `px-4 sm:px-6 lg:px-8`
- **Card Padding**: `p-6 sm:p-8`
- **Section Gap**: `space-y-6`
- **Grid Gap**: `gap-4 sm:gap-6`

### Cards
- **Background**: `bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm`
- **Border**: `border border-neutral-200/50 dark:border-neutral-800/50`
- **Shadow**: `shadow-soft-lg`
- **Border Radius**: `rounded-xl`
- **Hover**: `hover:shadow-soft-md transition-all duration-200`

### Tables
- **Header**: `bg-neutral-50 dark:bg-neutral-900`
- **Rows**: `hover:bg-neutral-50 dark:hover:bg-neutral-800`
- **Borders**: `border-b border-neutral-200 dark:border-neutral-800`
- **Padding**: `px-4 py-3`

## Security Considerations

1. **Role Verification**: All admin routes must verify ADMIN role
2. **Server Actions**: Use `requireRole("ADMIN")` in all admin server actions
3. **Input Validation**: Validate all inputs using Zod schemas
4. **CSRF Protection**: Server actions are CSRF-protected by Next.js
5. **SQL Injection**: Prisma ORM prevents SQL injection
6. **XSS Protection**: React automatically escapes content
7. **Rate Limiting**: Consider adding rate limiting for admin actions (future)

## Testing Checklist

- [ ] Admin dashboard accessible only to ADMIN role
- [ ] Non-admin users redirected from admin routes
- [ ] All CRUD operations work correctly
- [ ] Filters and search work properly
- [ ] Pagination works correctly
- [ ] Bulk actions work correctly
- [ ] Error handling displays properly
- [ ] Loading states display properly
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] Dark mode works correctly
- [ ] Form validation works correctly
- [ ] Confirmation dialogs prevent accidental actions

## Future Enhancements

1. **Activity Logs**: Track admin actions
2. **Audit Trail**: Log all user modifications
3. **Email Notifications**: Notify users of status/role changes
4. **Advanced Filtering**: More filter options for users/tickets
5. **Export Functionality**: Export users/tickets to CSV/Excel
6. **Bulk Import**: Import users from CSV
7. **System Monitoring**: Real-time system metrics
8. **Backup/Restore**: Database backup functionality
9. **API Management**: Manage API keys and tokens
10. **Custom Roles**: Create custom roles with permissions

## Notes

- **Dashboard Route**: Admins use the same `/dashboard` route as users/agents
- **Role-Based Rendering**: The main dashboard page conditionally renders content based on user role
- **Sidebar Navigation**: Admin navigation items are added to the existing sidebar (only visible to admins)
- All admin pages should follow the same layout structure as existing dashboard pages
- Reuse existing components where possible (Button, Input, Select, Dialog)
- Maintain consistency with existing design patterns
- Ensure all actions have proper loading and error states
- Use server actions for all data mutations
- Implement optimistic updates where appropriate
- Add proper TypeScript types for all components and actions

## Sidebar Navigation Updates

The `DashboardSidebar` component should be updated to include admin navigation items:

**Changes needed:**
1. Add `userRole` prop to `DashboardSidebarProps` interface
2. Update layout to pass `user.role` to sidebar: `<DashboardSidebar enabledModuleKeys={enabledModuleKeys} userRole={user.role} />`
3. Add admin navigation items array:

```typescript
const adminNavigation = [
  {
    name: "Users",
    href: "/dashboard/admin/users",
    icon: <UsersIcon />,
    adminOnly: true,
  },
  {
    name: "Modules",
    href: "/dashboard/admin/modules",
    icon: <ModulesIcon />,
    adminOnly: true,
  },
  {
    name: "Groups",
    href: "/dashboard/admin/groups",
    icon: <GroupsIcon />,
    adminOnly: true,
  },
  {
    name: "System Settings",
    href: "/dashboard/admin/settings",
    icon: <SettingsIcon />,
    adminOnly: true,
  },
];
```

4. Merge admin navigation with base navigation when `userRole === "ADMIN"`:
```typescript
const allNavigation = userRole === "ADMIN" 
  ? [...baseNavigation, ...adminNavigation]
  : baseNavigation;
```

**Note**: Since `DashboardSidebar` is a client component, the role must be passed as a prop from the server component layout.
