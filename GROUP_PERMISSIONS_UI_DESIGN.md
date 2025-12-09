# Group-Based Permission System - UI/UX Design

## Overview

This document outlines the UI/UX design for the group-based permission management system. The design focuses on making permission management intuitive, comprehensive, and efficient for administrators.

## Page Structure

### 1. Group Overview Page (`/dashboard/admin/groups`)

#### Current State
- Lists all groups
- Shows member count and ticket count
- Basic create/edit/delete functionality

#### Enhancements

**Header Section:**
```
┌─────────────────────────────────────────────────────────┐
│ Group Management                    [+ Create Group]    │
│ Manage permission groups (12 total)                     │
└─────────────────────────────────────────────────────────┘
```

**Table Enhancements:**
- Add "Permissions" column showing count and badges
- Add filter by permission category
- Add sort by permission count

**New Table Columns:**
| Group | Description | Members | Tickets | Permissions | Actions |
|-------|-------------|---------|---------|-------------|---------|
| Support Team | ... | 5 | 23 | 8 permissions | View Delete |
| Developers | ... | 12 | 45 | 12 permissions | View Delete |

**Permission Column Display:**
- Show count: "8 permissions"
- On hover: Show permission categories (e.g., "Tickets: 4, Projects: 2, Admin: 2")
- Color-coded badges for permission categories

**Search/Filter Enhancements:**
- Filter by permission category
- Filter by permission count range
- Search by permission name

### 2. Group Detail Page (`/dashboard/admin/groups/[id]`)

#### Current State
- Shows group info, stats, and members
- Edit group and add/remove members

#### New Structure with Tabs

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Groups                                        │
│ Support Team                                            │
│ Customer support team for handling tickets              │
│                                                         │
│ [Edit Group] [Add Agent]                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ [Overview] [Members] [Permissions] [Projects]          │
└─────────────────────────────────────────────────────────┘
```

#### Tab 1: Overview (Existing)
- Group stats (members, tickets, created date)
- Group description
- Quick actions

#### Tab 2: Members (Existing)
- List of members
- Add/remove members
- Member roles and details

#### Tab 3: Permissions (NEW - Main Feature)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Permissions                                             │
│ Manage what this group can access                       │
│                                                         │
│ [Search permissions...]  [Select All] [Deselect All]   │
│                                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ ▼ Tickets (4/7 selected)                         │ │
│ │   ☑ View Tickets                                 │ │
│ │   ☑ View All Tickets                             │ │
│ │   ☑ Create Tickets                               │ │
│ │   ☑ Update Tickets                               │ │
│ │   ☐ Delete Tickets                               │ │
│ │   ☑ Assign Tickets                               │ │
│ │   ☑ Comment on Tickets                           │ │
│ │                                                   │ │
│ │ ▼ Projects (2/7 selected)                        │ │
│ │   ☑ View Projects                                │ │
│ │   ☐ View All Projects                            │ │
│ │   ☐ Create Projects                              │ │
│ │   ☐ Update Projects                              │ │
│ │   ☐ Delete Projects                              │ │
│ │   ☑ Manage Project Members                       │ │
│ │   ☐ Manage Project Groups                        │ │
│ │                                                   │ │
│ │ ▶ Time Tracking (0/5 selected)                   │ │
│ │                                                   │ │
│ │ ▶ Tasks (0/4 selected)                           │ │
│ │                                                   │ │
│ │ ▶ Admin (0/11 selected)                          │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ [Cancel] [Save Changes]                                │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- **Collapsible Categories**: Expand/collapse permission categories
- **Checkbox Interface**: Easy selection of permissions
- **Search**: Filter permissions by name or description
- **Bulk Actions**: Select all/deselect all per category
- **Visual Indicators**:
  - Checked = permission granted
  - Unchecked = permission not granted
  - Count shows "X/Y selected" per category
- **Permission Descriptions**: Tooltip or inline description on hover
- **Save/Cancel**: Only save when explicitly clicked

**Permission Item Display:**
```
┌─────────────────────────────────────────────────────┐
│ ☑ View Tickets                                      │
│   Allows users to view tickets assigned to them     │
│   or their groups                                   │
└─────────────────────────────────────────────────────┘
```

**Category Header:**
- Shows category name
- Shows count: "4/7 selected"
- Expand/collapse icon
- Select all checkbox for category

#### Tab 4: Projects (NEW)
- List projects this group is assigned to
- Add/remove group from projects
- Quick links to project details

### 3. Permission Management Component

#### Component: `GroupPermissionsManager`

**Props:**
```typescript
interface GroupPermissionsManagerProps {
  groupId: string;
  initialPermissions: string[]; // Array of permission IDs
  onSave: (permissionIds: string[]) => Promise<void>;
  onCancel?: () => void;
}
```

**State:**
- Selected permissions (Set of permission IDs)
- Search query
- Expanded categories
- Loading state

**Features:**
1. **Category Organization**
   - Group permissions by category
   - Collapsible sections
   - Category-level select all/none

2. **Search Functionality**
   - Real-time search across all permissions
   - Highlight matching text
   - Filter categories based on search

3. **Visual Feedback**
   - Show unsaved changes indicator
   - Disable save if no changes
   - Loading state during save
   - Success/error messages

4. **Accessibility**
   - Keyboard navigation
   - Screen reader support
   - Focus management
   - ARIA labels

**Component Structure:**
```tsx
<GroupPermissionsManager>
  <SearchBar />
  <BulkActions />
  <PermissionCategories>
    <Category>
      <CategoryHeader />
      <PermissionList>
        <PermissionItem />
      </PermissionList>
    </Category>
  </PermissionCategories>
  <Actions>
    <CancelButton />
    <SaveButton />
  </Actions>
</GroupPermissionsManager>
```

### 4. User Detail Page Enhancements

#### New Section: "Group Memberships & Permissions"

```
┌─────────────────────────────────────────────────────────┐
│ Group Memberships                                       │
│                                                         │
│ This user is a member of:                              │
│ • Support Team (8 permissions)                         │
│ • Project Team A (5 permissions)                       │
│                                                         │
│ [+ Add to Group]                                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Effective Permissions                                   │
│                                                         │
│ Permissions from Role (AGENT):                         │
│ • tickets.view, tickets.create, tickets.update         │
│                                                         │
│ Permissions from Groups:                               │
│ • tickets.view_all (Support Team)                      │
│ • tickets.delete (Support Team)                        │
│ • projects.view (Project Team A)                       │
│                                                         │
│ [View All Permissions]                                 │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- List all groups user belongs to
- Show permissions from each group
- Show effective permissions (combined)
- Add/remove user from groups
- Visual distinction between role and group permissions

### 5. Permission Indicators Throughout UI

#### Button States
- Disabled buttons for actions user cannot perform
- Tooltip explaining why action is disabled
- Visual indicator (lock icon) for restricted actions

#### Navigation
- Hide menu items user cannot access
- Show badge/count for accessible items
- Gray out inaccessible sections

#### Data Tables
- Show/hide columns based on permissions
- Disable row actions based on permissions
- Filter data based on permissions

## UI Components

### 1. Permission Checkbox Component

```tsx
<PermissionCheckbox
  permission={permission}
  checked={isSelected}
  onChange={handleToggle}
  disabled={isLoading}
/>
```

**Visual Design:**
- Standard checkbox
- Permission name (bold)
- Permission description (smaller, gray text)
- Hover effect
- Focus state

### 2. Category Header Component

```tsx
<CategoryHeader
  category={category}
  selectedCount={selectedCount}
  totalCount={totalCount}
  expanded={isExpanded}
  onToggle={handleToggle}
  onSelectAll={handleSelectAll}
/>
```

**Visual Design:**
- Category name with icon
- Count badge: "4/7 selected"
- Expand/collapse icon
- Select all checkbox
- Hover effect

### 3. Permission Search Component

```tsx
<PermissionSearch
  value={searchQuery}
  onChange={handleSearch}
  placeholder="Search permissions..."
/>
```

**Visual Design:**
- Search input with icon
- Clear button when text entered
- Real-time filtering
- Highlight matching text in results

### 4. Permission Badge Component

```tsx
<PermissionBadge
  category={category}
  count={count}
/>
```

**Visual Design:**
- Small badge with category color
- Shows count
- Tooltip on hover with category name

## Color Scheme

### Permission Categories
- **Tickets**: Blue (#3B82F6)
- **Projects**: Green (#10B981)
- **Time Tracking**: Purple (#8B5CF6)
- **Tasks**: Orange (#F59E0B)
- **Risks/Issues**: Red (#EF4444)
- **Notes**: Gray (#6B7280)
- **Admin**: Dark Red (#DC2626)

### States
- **Selected**: Primary color
- **Unselected**: Gray
- **Disabled**: Light gray
- **Hover**: Lighter shade of category color
- **Active**: Darker shade of category color

## Responsive Design

### Desktop (> 1024px)
- Full table layout
- Side-by-side categories
- Expanded permission lists
- Full search and filter options

### Tablet (768px - 1024px)
- Collapsible table columns
- Stacked categories
- Simplified search
- Touch-friendly checkboxes

### Mobile (< 768px)
- Card-based layout
- Single column
- Collapsible everything
- Large touch targets
- Simplified actions

## User Flows

### Flow 1: Create Group and Assign Permissions

1. Admin clicks "Create Group"
2. Fills in name and description
3. Group is created
4. Redirected to group detail page
5. Clicks "Permissions" tab
6. Selects permissions by category
7. Clicks "Save Changes"
8. Permissions are assigned
9. Success message shown

### Flow 2: Add User to Group

1. Admin goes to user detail page
2. Scrolls to "Group Memberships" section
3. Clicks "Add to Group"
4. Selects group from dropdown
5. User is added to group
6. Effective permissions updated
7. Success message shown

### Flow 3: Bulk Permission Update

1. Admin goes to group detail page
2. Clicks "Permissions" tab
3. Expands "Tickets" category
4. Clicks "Select All" for category
5. All ticket permissions selected
6. Clicks "Save Changes"
7. All permissions saved
8. Success message shown

## Error Handling

### Validation Errors
- Show inline error messages
- Highlight invalid fields
- Prevent save if errors exist
- Clear, actionable error messages

### Permission Errors
- Show toast notification
- Explain what permission is missing
- Suggest which group to add user to
- Link to group management page

### Network Errors
- Retry mechanism
- Clear error messages
- Preserve form state
- Allow manual retry

## Accessibility

### Keyboard Navigation
- Tab through all interactive elements
- Enter/Space to toggle checkboxes
- Arrow keys to navigate categories
- Escape to close dialogs

### Screen Readers
- ARIA labels on all interactive elements
- ARIA descriptions for permissions
- ARIA live regions for updates
- Proper heading hierarchy

### Visual Accessibility
- High contrast mode support
- Focus indicators
- Color not the only indicator
- Text alternatives for icons

## Performance Considerations

### Lazy Loading
- Load permissions on tab click
- Load category permissions on expand
- Virtual scrolling for large lists

### Caching
- Cache permission lists
- Cache user permissions
- Invalidate on changes

### Optimization
- Debounce search input
- Batch permission updates
- Optimistic UI updates
- Show loading states

## Future Enhancements

1. **Permission Templates**: Pre-defined permission sets
2. **Permission Inheritance**: Groups inherit from other groups
3. **Permission Presets**: Quick select common permission sets
4. **Permission Comparison**: Compare permissions between groups
5. **Permission History**: Track permission changes over time
6. **Bulk Group Operations**: Apply permissions to multiple groups
7. **Permission Analytics**: Show which permissions are used most
8. **Permission Suggestions**: Suggest permissions based on group name/description
