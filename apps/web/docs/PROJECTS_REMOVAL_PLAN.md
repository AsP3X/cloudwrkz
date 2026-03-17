# Projects Module Removal Plan

This document outlines the complete plan to remove the projects module from the codebase without affecting other modules.

## Overview

The projects module is integrated with:
- **Tickets**: Tickets can be assigned to projects
- **Time Tracking**: Time entries can be linked to projects
- **Search**: Projects are searchable
- **Navigation**: Project links in sidebars
- **Permissions**: Project-specific permissions
- **Database**: Multiple project-related models

## Removal Strategy

### Phase 1: Database Schema Changes

#### 1.1 Remove Project-Related Models from Prisma Schema
**File**: `prisma/schema.prisma`

Models to remove:
- `Project` (lines 479-530)
- `ProjectUser` (lines 538-553)
- `ProjectGroup` (lines 555-568)
- `Milestone` (lines 579-598) - Note: Milestones are linked to Todos, need to check if Todos depend on projects
- `ProjectRisk` (lines 712-736)
- `ProjectIssue` (lines 754-779)
- `ProjectNote` (lines 781-799)
- `BudgetCategory` (lines 801-815)

Enums to remove:
- `ProjectStatus` (lines 164-172)
- `ProjectPriority` (lines 174-180)
- `ProjectUserRole` (lines 532-536)
- `MilestoneStatus` (lines 570-577) - Check if used by Todos
- `RiskSeverity` (lines 695-701)
- `RiskStatus` (lines 703-710)
- `IssueStatus` (lines 738-744)
- `IssuePriority` (lines 746-752)

#### 1.2 Update Related Models
**File**: `prisma/schema.prisma`

**Ticket Model** (lines 270-322):
- Remove `projectId` field (line 296)
- Remove `project` relation (line 297)
- Remove `@@index([projectId])` (line 315)

**TimeEntry Model** (lines 393-437):
- Remove `projectId` field (line 415)
- Remove `project` relation (line 416)
- Remove `@@index([projectId])` (line 434)

**User Model** (lines 28-95):
- Remove `projectMemberships` relation (line 76)
- Remove `createdProjects` relation (line 77)
- Remove `ownedRisks` relation (line 79)
- Remove `assignedIssues` relation (line 80)
- Remove `reportedIssues` relation (line 81)
- Remove `projectNotes` relation (line 82)

**Group Model** (lines 236-253):
- Remove `projectMemberships` relation (line 244)

**Todo Model** (lines 617-669):
- Check if `milestoneId` and `milestone` relation should be removed (lines 646-647)
- Note: Todos are independent of projects according to code comments, but milestones are project-related

**TicketActivityType Enum** (lines 324-350):
- Remove `ASSIGNED_TO_PROJECT` (line 336)
- Remove `UNASSIGNED_FROM_PROJECT` (line 337)

### Phase 2: Server Actions

#### 2.1 Remove Project Server Action Files
- `src/server/actions/projects.ts` - DELETE
- `src/server/actions/project-analytics.ts` - DELETE
- `src/server/actions/project-risks-issues.ts` - DELETE
- `src/server/actions/project-notes.ts` - DELETE
- `src/server/actions/milestones.ts` - DELETE (if only used by projects)
- `src/server/actions/budget-categories.ts` - DELETE

#### 2.2 Update Tickets Server Actions
**File**: `src/server/actions/tickets.ts`

Remove project-related functionality:
- Remove `projectId` and `projectIds` from filter types (lines 35, 302-303)
- Remove project filtering logic (lines 414-474)
- Remove project assignment validation (lines 1194-1296)
- Remove project owner checks for deletion (lines 1387-1407, 1893-1928)
- Remove `projectId` and `project` from includes (lines 667-668, 903, 1362, 1882)
- Remove project activity logging (lines 1249-1296)

#### 2.3 Update Time Tracking Server Actions
**File**: `src/server/actions/time-tracking.ts`

- Remove `projectId` from `CreateTimeEntryInput` type (if exists)
- Remove project-related queries and filters
- Note: TimeEntry model has `projectId` field that will be removed in schema migration

#### 2.4 Update Search Server Actions
**File**: `src/server/actions/search.ts`

Remove project search:
- Remove `"project"` from search result types (line 14)
- Remove project search logic (lines 100-105, 152-156)
- Remove `searchProjects` function (lines 1064-1213)
- Remove project-related result formatting (lines 793-794, 828-829, 885-886)

#### 2.5 Update Todos Server Actions
**File**: `src/server/actions/todos.ts`

- Remove `getProjectTodos` function (lines 815-822) - already deprecated
- Verify todos are truly independent (code comments suggest they are)

### Phase 3: UI Components and Pages

#### 3.1 Remove Project Component Directories
- `src/components/features/projects/` - DELETE ENTIRE DIRECTORY
- `src/components/features/admin/ProjectManagement/` - DELETE ENTIRE DIRECTORY

#### 3.2 Remove Project Pages
- `src/app/(dashboard)/dashboard/projects/` - DELETE ENTIRE DIRECTORY
- `src/app/(dashboard)/dashboard/admin/projects/` - DELETE ENTIRE DIRECTORY

#### 3.3 Update Ticket Components
**File**: `src/components/features/tickets/ProjectAssignmentDialog/ProjectAssignmentDialog.tsx`
- DELETE this file entirely

**File**: `src/components/features/tickets/TicketAssignmentFields/TicketAssignmentFields.tsx`
- Remove project assignment field and related imports/logic

**File**: `src/components/features/tickets/TicketFilterConfig.ts`
- Remove project filter options (lines 43-48, 104-109)

**File**: `src/app/(dashboard)/dashboard/tickets/[id]/page.tsx`
- Remove project-related logic (lines 136-139)
- Remove project assignment UI components

#### 3.4 Update Filter Dialog
**File**: `src/components/ui/FilterDialog/FilterDialog.tsx`
- Remove any project-related filter handling

### Phase 4: Navigation and Routes

#### 4.1 Update Dashboard Sidebar
**File**: `src/components/layout/DashboardSidebar/DashboardSidebar.tsx`
- Remove `ProjectsIcon` component (lines 68-77)
- Remove "Projects" nav item from "Work" section (lines 140-145)

#### 4.2 Update Admin Sidebar
**File**: `src/components/layout/AdminSidebar/AdminSidebar.tsx`
- Remove `ProjectsIcon` component (lines 90-99)
- Remove "Projects" from "Content & Projects" section (lines 213-217)
- Consider renaming section to "Content" if only tickets remain

#### 4.3 Update Routes
**File**: `src/lib/constants/routes.ts`
- Remove `ADMIN_PROJECTS` (line 26)
- Remove `PROJECTS` (line 29)

### Phase 5: Permissions and Modules

#### 5.1 Remove Project Permissions
**File**: `src/lib/constants/permissions.ts`

Remove all project-related permissions:
- `projects.view` (lines 150-155)
- `projects.view_all` (lines 157-162)
- `projects.create` (lines 164-169)
- `projects.update` (lines 171-176)
- `projects.delete` (lines 178-183)
- `projects.manage_members` (lines 185-190)
- `projects.manage_groups` (lines 192-197)
- `projects.risks.view` (lines 199-204)
- `projects.risks.create` (lines 206-211)
- `projects.risks.update` (lines 213-218)
- `projects.risks.delete` (lines 220-225)
- `modules.projects.view` (lines 475-479)

Remove from permission types (lines 17-28, 72)
Remove from permission definitions array (lines 537-548, 580, 595-596, 605)

#### 5.2 Remove Projects Module Configuration
**File**: `src/lib/constants/modules.ts`
- Remove `PROJECTS` from `MODULE_KEYS` (line 8)
- Remove projects config from `MODULE_CONFIG` (lines 27-32)

#### 5.3 Update Module Server Actions
**File**: `src/server/actions/modules.ts`
- Remove any project-specific module handling

### Phase 6: CLI Commands

#### 6.1 Remove Project CLI
**File**: `src/cli/project-cli.ts`
- DELETE ENTIRE FILE

#### 6.2 Update CLI Index
**File**: `src/cli/index.ts`
- Remove project CLI imports and handlers

#### 6.3 Update Time CLI
**File**: `src/cli/time-cli.ts`
- Remove project-related commands (lines 508-586)
- Update `handleCreate` to not require project

### Phase 7: Search and Filter Components

#### 7.1 Update Search Components
**File**: `src/components/features/search/SearchDialog/SearchDialog.tsx`
- Remove project result type handling

**File**: `src/components/features/search/SearchResultsTable/SearchResultsTable.tsx`
- Remove project result rendering

**File**: `src/components/features/search/SearchFilters/SearchFilters.tsx`
- Remove project filter options

### Phase 8: Database Migration

#### 8.1 Create Migration Script
After removing all code references, create a Prisma migration to:
1. Drop all project-related tables
2. Remove foreign key constraints
3. Remove indexes
4. Remove enum types

**Important**: This will cause data loss. Ensure backups are made.

### Phase 9: Testing Checklist

After removal, verify:
- [ ] Tickets can be created/updated without projects
- [ ] Time entries can be created without projects
- [ ] Search works without project results
- [ ] Navigation doesn't show project links
- [ ] No broken imports or references
- [ ] Database migration completes successfully
- [ ] No TypeScript errors
- [ ] No runtime errors

## Critical Dependencies to Handle

### 1. Tickets → Projects
**Impact**: Tickets have `projectId` field
**Solution**: 
- Remove `projectId` field from Ticket model
- Remove project assignment UI
- Remove project filtering
- Remove project-based permission checks

### 2. Time Entries → Projects
**Impact**: TimeEntry has `projectId` field
**Solution**:
- Remove `projectId` field from TimeEntry model
- Time entries can still be linked to tickets (which don't need projects)

### 3. Todos → Milestones → Projects
**Impact**: Todos can be linked to Milestones, which are project-related
**Solution**:
- Remove Milestone model entirely
- Remove `milestoneId` from Todo model
- Todos remain independent (as per code comments)

### 4. Search → Projects
**Impact**: Search includes project results
**Solution**:
- Remove project search function
- Remove project result types

## Files Summary

### Files to DELETE (Complete Removal)
1. `src/server/actions/projects.ts`
2. `src/server/actions/project-analytics.ts`
3. `src/server/actions/project-risks-issues.ts`
4. `src/server/actions/project-notes.ts`
5. `src/server/actions/milestones.ts`
6. `src/server/actions/budget-categories.ts`
7. `src/cli/project-cli.ts`
8. `src/components/features/projects/` (entire directory)
9. `src/components/features/admin/ProjectManagement/` (entire directory)
10. `src/components/features/tickets/ProjectAssignmentDialog/` (entire directory)
11. `src/app/(dashboard)/dashboard/projects/` (entire directory)
12. `src/app/(dashboard)/dashboard/admin/projects/` (entire directory)
13. `docs/PROJECT_PLAN.md` (optional - documentation)

### Files to MODIFY (Remove Project References)
1. `prisma/schema.prisma` - Remove models, enums, relations
2. `src/server/actions/tickets.ts` - Remove project logic
3. `src/server/actions/time-tracking.ts` - Remove project references
4. `src/server/actions/search.ts` - Remove project search
5. `src/server/actions/todos.ts` - Remove deprecated project function
6. `src/components/layout/DashboardSidebar/DashboardSidebar.tsx` - Remove nav item
7. `src/components/layout/AdminSidebar/AdminSidebar.tsx` - Remove nav item
8. `src/components/features/tickets/TicketAssignmentFields/TicketAssignmentFields.tsx` - Remove project field
9. `src/components/features/tickets/TicketFilterConfig.ts` - Remove project filter
10. `src/app/(dashboard)/dashboard/tickets/[id]/page.tsx` - Remove project logic
11. `src/lib/constants/routes.ts` - Remove project routes
12. `src/lib/constants/permissions.ts` - Remove project permissions
13. `src/lib/constants/modules.ts` - Remove projects module
14. `src/cli/index.ts` - Remove project CLI
15. `src/cli/time-cli.ts` - Remove project commands
16. `src/components/features/search/` - Remove project search results

## Execution Order

1. **First**: Remove UI components and pages (Phase 3) - This will cause build errors but shows what needs fixing
2. **Second**: Remove server actions (Phase 2) - Fixes import errors
3. **Third**: Update dependent modules (Phases 2.2-2.5) - Fixes integration issues
4. **Fourth**: Update navigation and routes (Phase 4) - Removes UI references
5. **Fifth**: Remove permissions and modules (Phase 5) - Cleans up configuration
6. **Sixth**: Remove CLI commands (Phase 6) - Removes CLI references
7. **Seventh**: Update search (Phase 7) - Removes search integration
8. **Eighth**: Database schema changes (Phase 1) - Final cleanup
9. **Ninth**: Create and run migration (Phase 8) - Database cleanup
10. **Tenth**: Testing (Phase 9) - Verify everything works

## Notes

- **Data Loss Warning**: Removing projects will delete all project data, including:
  - Projects
  - Project memberships
  - Project groups
  - Milestones
  - Project risks
  - Project issues
  - Project notes
  - Budget categories
  - Project assignments on tickets (will be set to null)
  - Project assignments on time entries (will be set to null)

- **Backward Compatibility**: If there's existing data, consider:
  - Exporting project data before removal
  - Creating a migration script to preserve important data
  - Setting foreign keys to `SetNull` before dropping tables

- **Milestones and Todos**: The relationship between Todos and Milestones needs careful consideration. If milestones are removed, todos with `milestoneId` will need to be handled (either set to null or migrated).

