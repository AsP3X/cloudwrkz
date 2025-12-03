# Time Tracking Module - Implementation Plan

## Overview
This document outlines the complete implementation plan for the Time Tracking module, including database schema, server actions, UI components, and real-time synchronization features.

---

## 1. Database Schema (Prisma)

### 1.1 TimeEntry Model
```prisma
enum TimeEntryStatus {
  RUNNING
  PAUSED
  STOPPED
  COMPLETED
}

model TimeEntry {
  id          String           @id @default(cuid())
  name        String           // Timer name (user-provided or auto-generated)
  description String?          // Optional description
  
  // Status and timing
  status      TimeEntryStatus  @default(RUNNING)
  startedAt   DateTime         @default(now())
  pausedAt    DateTime?        // Last pause time
  stoppedAt   DateTime?        // When timer was stopped
  completedAt DateTime?        // When timer was completed
  
  // Accumulated time (in seconds)
  totalDuration Int            @default(0) // Total accumulated time including paused periods
  lastResumedAt DateTime?      // When timer was last resumed (for calculating running time)
  
  // Relations
  userId      String
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  ticketId    String?          // Future: Link to ticket
  ticket      Ticket?          @relation(fields: [ticketId], references: [id], onDelete: SetNull)
  
  // Tags and metadata
  tags        String[]         @default([])
  billable    Boolean          @default(false) // Future: Billable flag
  
  // Timestamps
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  
  @@index([userId])
  @@index([status])
  @@index([ticketId])
  @@index([createdAt])
  @@map("time_entries")
}
```

### 1.2 Update User Model
Add relation to TimeEntry:
```prisma
model User {
  // ... existing fields
  timeEntries TimeEntry[]
}
```

### 1.3 Update Ticket Model (Future)
Add relation to TimeEntry:
```prisma
model Ticket {
  // ... existing fields
  timeEntries TimeEntry[]
}
```

### 1.4 Migration Strategy
- Create migration file: `prisma/migrations/XXXX_add_time_tracking/migration.sql`
- Run: `pnpm db:migrate`

---

## 2. Server Actions (`src/server/actions/time-tracking.ts`)

### 2.1 Core Actions

#### `createTimeEntry(input: CreateTimeEntryInput)`
- Creates a new time entry with RUNNING status
- Generates random name if none provided
- Returns created entry with calculated running time
- Triggers real-time update event

#### `updateTimeEntry(id: string, input: UpdateTimeEntryInput)`
- Updates time entry fields (name, description, tags, etc.)
- Handles status transitions (RUNNING → PAUSED → RUNNING → STOPPED)
- Calculates and updates totalDuration
- Triggers real-time update event

#### `pauseTimeEntry(id: string)`
- Pauses a running timer
- Calculates elapsed time since lastResumedAt (or startedAt)
- Adds to totalDuration
- Sets status to PAUSED
- Sets pausedAt timestamp
- Triggers real-time update event

#### `resumeTimeEntry(id: string)`
- Resumes a paused timer
- Sets status to RUNNING
- Sets lastResumedAt to now()
- Clears pausedAt
- Triggers real-time update event

#### `stopTimeEntry(id: string)`
- Stops a running/paused timer
- Finalizes totalDuration calculation
- Sets status to STOPPED
- Sets stoppedAt timestamp
- Triggers real-time update event

#### `completeTimeEntry(id: string)`
- Marks entry as COMPLETED
- Finalizes all calculations
- Sets completedAt timestamp
- Triggers real-time update event

#### `deleteTimeEntry(id: string)`
- Soft delete or hard delete (based on requirements)
- Validates user ownership
- Triggers real-time update event

#### `getTimeEntries(filters: TimeEntryFilters)`
- Fetches time entries with filters:
  - userId (required)
  - status (RUNNING, PAUSED, STOPPED, COMPLETED)
  - date range (createdAt, startedAt)
  - tags
  - ticketId (future)
- Supports pagination
- Supports sorting

#### `getActiveTimeEntries(userId: string)`
- Returns all RUNNING and PAUSED entries for a user
- Used by floating timer component
- Optimized for frequent polling/updates

#### `bulkUpdateTimeEntries(ids: string[], updates: BulkUpdateInput)`
- Bulk status changes
- Bulk tag updates
- Bulk delete
- Validates user ownership for all entries

#### `bulkDeleteTimeEntries(ids: string[])`
- Deletes multiple entries
- Validates permissions
- Triggers real-time update events

### 2.2 Utility Functions

#### `calculateElapsedTime(entry: TimeEntry)`
- Calculates current elapsed time for RUNNING entries
- Returns totalDuration + (now() - lastResumedAt) if running
- Returns totalDuration if paused/stopped

#### `generateRandomTimerName()`
- Generates random names like "Timer-ABC123", "Session-XYZ789"
- Ensures uniqueness (optional)

### 2.3 Type Definitions
```typescript
export type CreateTimeEntryInput = {
  name?: string; // Optional, will generate if not provided
  description?: string;
  tags?: string[];
  ticketId?: string; // Future
  billable?: boolean; // Future
};

export type UpdateTimeEntryInput = {
  name?: string;
  description?: string;
  tags?: string[];
  ticketId?: string | null;
  billable?: boolean;
};

export type TimeEntryFilters = {
  status?: TimeEntryStatus[];
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  ticketId?: string;
  sortBy?: "createdAt" | "startedAt" | "totalDuration";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type BulkUpdateInput = {
  status?: TimeEntryStatus;
  tags?: string[];
  ticketId?: string | null;
};
```

---

## 3. Real-Time Synchronization

### 3.1 Approach Options

#### Option A: Server-Sent Events (SSE) - Recommended
- Simpler than WebSockets
- One-way server-to-client push
- Built-in reconnection
- Works with Next.js App Router

#### Option B: WebSockets
- Full bidirectional communication
- More complex setup
- Requires additional server infrastructure

#### Option C: Polling with Optimistic Updates
- Simplest implementation
- Less efficient
- Good fallback option

### 3.2 Implementation (SSE Approach)

#### API Route: `/api/time-tracking/events`
- Establishes SSE connection
- Authenticates user via session
- Subscribes to user-specific events
- Pushes updates when:
  - New time entry created
  - Time entry updated
  - Time entry deleted
  - Timer status changes

#### Event Types
```typescript
type TimeTrackingEvent = 
  | { type: "ENTRY_CREATED"; data: TimeEntry }
  | { type: "ENTRY_UPDATED"; data: TimeEntry }
  | { type: "ENTRY_DELETED"; data: { id: string } }
  | { type: "ENTRY_STATUS_CHANGED"; data: { id: string; status: TimeEntryStatus } };
```

#### Client Hook: `useTimeTrackingEvents()`
- Manages SSE connection
- Handles reconnection
- Updates local state/react-query cache
- Provides event callbacks

### 3.3 Server-Side Event Broadcasting
- Use in-memory event emitter or Redis pub/sub
- When action modifies time entry, emit event
- SSE route listens and pushes to connected clients

---

## 4. UI Components Structure

### 4.1 Page: `/dashboard/time-tracking`
**File**: `src/app/(dashboard)/dashboard/time-tracking/page.tsx`

- Server component that:
  - Checks module enablement
  - Fetches initial time entries
  - Renders TimeTrackingPage client component

### 4.2 Main Page Component
**File**: `src/components/features/time-tracking/TimeTrackingPage/TimeTrackingPage.tsx`

Structure:
```
┌─────────────────────────────────────────┐
│ Header: "Time Tracking"                 │
│ [Start Timer] [Add Time Entry]          │
├─────────────────────────────────────────┤
│ Filters/Search (optional)               │
├─────────────────────────────────────────┤
│ TimeEntryList (table view)              │
│ - Checkboxes for bulk selection         │
│ - Bulk actions toolbar                  │
│ - Columns: Name, Status, Duration, etc. │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ FloatingTimerWidget (bottom-right)      │
│ - Collapsible                           │
│ - Shows active timers                   │
└─────────────────────────────────────────┘
```

### 4.3 Start Timer Dialog
**File**: `src/components/features/time-tracking/StartTimerDialog/StartTimerDialog.tsx`

Form Fields:
- **Name** (optional text input)
  - Placeholder: "Enter timer name (optional)"
  - If empty, generate random name on submit
- **Description** (optional textarea)
- **Tags** (multi-select or tag input)
  - Allow creating new tags
  - Show existing tags as suggestions
- **Ticket** (select dropdown) - Future
  - Disabled for now, placeholder text
- **Billable** (checkbox) - Future
  - Disabled for now

Actions:
- "Start Timer" button
- "Cancel" button

### 4.4 Add Time Entry Dialog
**File**: `src/components/features/time-tracking/AddTimeEntryDialog/AddTimeEntryDialog.tsx`

Similar to Start Timer Dialog, but includes:
- **Duration** (time input: hours, minutes, seconds)
- **Start Time** (datetime picker)
- **End Time** (datetime picker, optional)
- Creates entry with STOPPED status

### 4.5 Time Entry List Component
**File**: `src/components/features/time-tracking/TimeEntryList/TimeEntryList.tsx`

Features:
- Table view similar to TicketList
- Columns:
  - Checkbox (for bulk selection)
  - Name
  - Status (badge with color coding)
  - Duration (live updating for RUNNING entries)
  - Tags (chip display)
  - Started At
  - Actions (Play/Pause/Stop/Edit/Delete)

View Modes:
- Normal (default)
- Compact
- Detailed

Bulk Actions:
- Change status (Stop, Complete)
- Add/Remove tags
- Delete
- Export (future)

### 4.6 Bulk Actions Toolbar
**File**: `src/components/features/time-tracking/TimeEntryBulkActionsToolbar/TimeEntryBulkActionsToolbar.tsx`

Similar to TicketBulkActionsToolbar:
- Status dropdown (Stop, Complete)
- Tag management
- Delete button
- Clear selection

### 4.7 Bulk Action Dialogs
- `TimeEntryBulkDeleteDialog`
- `TimeEntryBulkTagDialog` (for tag management)

### 4.8 Floating Timer Widget
**File**: `src/components/features/time-tracking/FloatingTimerWidget/FloatingTimerWidget.tsx`

Features:
- Fixed position: bottom-right corner
- Shows all RUNNING and PAUSED timers
- Each timer shows:
  - Name (truncated)
  - Live duration counter
  - Status indicator
  - Quick actions (Pause/Resume/Stop)
- Collapsible:
  - Collapsed: Shows count badge + icon
  - Expanded: Shows list of active timers
- Smooth animations
- Z-index: 100 (above page content, below modals)

Layout:
```
┌─────────────────────┐
│ ⏱️ Active Timers (2)│ ← Collapsed state
└─────────────────────┘

┌─────────────────────────────┐
│ Active Timers          [−]  │ ← Expanded header
├─────────────────────────────┤
│ Timer Name 1                │
│ 02:34:15 [⏸] [⏹]          │
├─────────────────────────────┤
│ Timer Name 2                │
│ 01:12:45 [▶] [⏹]          │
└─────────────────────────────┘
```

### 4.9 Time Entry Row Component
**File**: `src/components/features/time-tracking/TimeEntryRow/TimeEntryRow.tsx`

- Individual row in the table
- Handles selection
- Displays formatted duration
- Action buttons

### 4.10 Duration Display Component
**File**: `src/components/features/time-tracking/DurationDisplay/DurationDisplay.tsx`

- Formats seconds to HH:MM:SS or MM:SS
- Auto-updates for RUNNING entries
- Uses `useInterval` hook

---

## 5. Utilities and Helpers

### 5.1 Time Formatting
**File**: `src/lib/utils/time-tracking.ts`

```typescript
export function formatDuration(seconds: number): string;
export function parseDuration(input: string): number;
export function calculateElapsedTime(entry: TimeEntry): number;
```

### 5.2 Status Helpers
```typescript
export function getStatusColor(status: TimeEntryStatus): string;
export function getStatusLabel(status: TimeEntryStatus): string;
export function canPause(status: TimeEntryStatus): boolean;
export function canResume(status: TimeEntryStatus): boolean;
export function canStop(status: TimeEntryStatus): boolean;
```

### 5.3 Random Name Generator
```typescript
export function generateRandomTimerName(): string;
```

---

## 6. Hooks

### 6.1 `useTimeTracking()`
- Main hook for time tracking operations
- Wraps server actions
- Handles optimistic updates
- Manages local state

### 6.2 `useActiveTimers()`
- Fetches active (RUNNING/PAUSED) timers
- Polls or uses SSE for updates
- Returns formatted timer data

### 6.3 `useTimerDuration(entry: TimeEntry)`
- Calculates and updates duration for RUNNING entries
- Uses interval to update every second
- Returns formatted duration string

### 6.4 `useTimeTrackingEvents()`
- Manages SSE connection
- Handles real-time updates
- Updates React Query cache

---

## 7. Routes and Navigation

### 7.1 Add Route Constant
**File**: `src/lib/constants/routes.ts`
```typescript
export const ROUTES = {
  // ... existing
  TIME_TRACKING: "/dashboard/time-tracking",
};
```

### 7.2 Update Sidebar
**File**: `src/components/layout/DashboardSidebar/DashboardSidebar.tsx`
- Add Time Tracking menu item
- Check module enablement
- Show only if enabled

---

## 8. State Management

### 8.1 React Query Setup
- Use React Query for server state
- Cache time entries
- Invalidate on mutations
- Optimistic updates

### 8.2 Query Keys
```typescript
export const timeTrackingKeys = {
  all: ['time-tracking'] as const,
  lists: () => [...timeTrackingKeys.all, 'list'] as const,
  list: (filters: TimeEntryFilters) => [...timeTrackingKeys.lists(), filters] as const,
  details: () => [...timeTrackingKeys.all, 'detail'] as const,
  detail: (id: string) => [...timeTrackingKeys.details(), id] as const,
  active: (userId: string) => [...timeTrackingKeys.all, 'active', userId] as const,
};
```

---

## 9. Implementation Phases

### Phase 1: Database & Server Actions
1. ✅ Update Prisma schema
2. ✅ Create migration
3. ✅ Implement server actions
4. ✅ Add type definitions
5. ✅ Test server actions

### Phase 2: Basic UI
1. ✅ Create page route
2. ✅ Create TimeTrackingPage component
3. ✅ Create StartTimerDialog
4. ✅ Create AddTimeEntryDialog
5. ✅ Create basic TimeEntryList
6. ✅ Test basic CRUD operations

### Phase 3: Table & Bulk Actions
1. ✅ Enhance TimeEntryList with table view
2. ✅ Add selection functionality
3. ✅ Create BulkActionsToolbar
4. ✅ Implement bulk operations
5. ✅ Add bulk action dialogs

### Phase 4: Floating Widget
1. ✅ Create FloatingTimerWidget component
2. ✅ Implement collapse/expand
3. ✅ Add quick actions
4. ✅ Style and position

### Phase 5: Real-Time Sync
1. ✅ Implement SSE API route
2. ✅ Create useTimeTrackingEvents hook
3. ✅ Integrate with server actions
4. ✅ Test multi-device sync

### Phase 6: Polish & Optimization
1. ✅ Add loading states
2. ✅ Add error handling
3. ✅ Optimize performance
4. ✅ Add animations
5. ✅ Test edge cases

---

## 10. Testing Considerations

### 10.1 Unit Tests
- Server action functions
- Utility functions
- Duration calculations

### 10.2 Integration Tests
- Timer start/pause/resume/stop flow
- Bulk operations
- Real-time updates

### 10.3 E2E Tests
- Complete timer workflow
- Multi-device synchronization
- Bulk actions

---

## 11. Future Enhancements

### 11.1 Ticket Integration
- Link timers to tickets
- Show time entries on ticket detail page
- Aggregate time per ticket

### 11.2 Billable Hours
- Mark entries as billable
- Calculate billable totals
- Export for invoicing

### 11.3 Reporting
- Time reports by date range
- Time by project/ticket
- Export to CSV/PDF

### 11.4 Advanced Features
- Timer templates
- Recurring timers
- Time estimates vs actual
- Time approval workflow

---

## 12. File Structure

```
src/
├── app/
│   └── (dashboard)/
│       └── dashboard/
│           └── time-tracking/
│               └── page.tsx
│
├── components/
│   └── features/
│       └── time-tracking/
│           ├── TimeTrackingPage/
│           │   ├── TimeTrackingPage.tsx
│           │   └── TimeTrackingPage.types.ts
│           ├── StartTimerDialog/
│           │   ├── StartTimerDialog.tsx
│           │   └── StartTimerDialog.types.ts
│           ├── AddTimeEntryDialog/
│           │   ├── AddTimeEntryDialog.tsx
│           │   └── AddTimeEntryDialog.types.ts
│           ├── TimeEntryList/
│           │   ├── TimeEntryList.tsx
│           │   └── TimeEntryList.types.ts
│           ├── TimeEntryRow/
│           │   ├── TimeEntryRow.tsx
│           │   └── TimeEntryRow.types.ts
│           ├── TimeEntryBulkActionsToolbar/
│           │   ├── TimeEntryBulkActionsToolbar.tsx
│           │   └── TimeEntryBulkActionsToolbar.types.ts
│           ├── TimeEntryBulkDeleteDialog/
│           │   ├── TimeEntryBulkDeleteDialog.tsx
│           │   └── TimeEntryBulkDeleteDialog.types.ts
│           ├── TimeEntryBulkTagDialog/
│           │   ├── TimeEntryBulkTagDialog.tsx
│           │   └── TimeEntryBulkTagDialog.types.ts
│           ├── FloatingTimerWidget/
│           │   ├── FloatingTimerWidget.tsx
│           │   └── FloatingTimerWidget.types.ts
│           └── DurationDisplay/
│               ├── DurationDisplay.tsx
│               └── DurationDisplay.types.ts
│
├── server/
│   └── actions/
│       └── time-tracking.ts
│
├── lib/
│   ├── hooks/
│   │   ├── useTimeTracking.ts
│   │   ├── useActiveTimers.ts
│   │   ├── useTimerDuration.ts
│   │   └── useTimeTrackingEvents.ts
│   └── utils/
│       └── time-tracking.ts
│
└── api/
    └── time-tracking/
        └── events/
            └── route.ts (SSE endpoint)
```

---

## 13. Key Design Decisions

### 13.1 Timer State Management
- **Decision**: Store totalDuration as accumulated seconds, calculate live duration client-side
- **Rationale**: More accurate, handles server restarts, easier to query

### 13.2 Real-Time Approach
- **Decision**: Server-Sent Events (SSE)
- **Rationale**: Simpler than WebSockets, sufficient for one-way updates, works well with Next.js

### 13.3 Duration Display
- **Decision**: Update every second for RUNNING timers
- **Rationale**: Good balance between accuracy and performance

### 13.4 Bulk Actions
- **Decision**: Similar pattern to tickets module
- **Rationale**: Consistency with existing codebase, familiar UX

### 13.5 Floating Widget
- **Decision**: Always visible on time tracking page
- **Rationale**: Quick access to active timers, doesn't interfere with main content

---

## 14. Dependencies

### 14.1 New Dependencies (if needed)
- None required initially (using existing stack)
- Consider `date-fns` for date formatting (if not already used)
- Consider `react-query` or `@tanstack/react-query` for state management

### 14.2 Existing Dependencies Used
- `react-hook-form` - Form handling
- `zod` - Validation
- `next` - Framework
- `prisma` - Database ORM
- `tailwindcss` - Styling

---

## 15. Accessibility Considerations

- Keyboard navigation for all actions
- ARIA labels for timer controls
- Screen reader announcements for timer status changes
- Focus management in dialogs
- Color contrast for status indicators

---

## 16. Performance Considerations

- Debounce rapid timer updates
- Virtual scrolling for large entry lists
- Lazy load floating widget
- Optimize SSE connection management
- Cache time entries with React Query

---

This plan provides a comprehensive roadmap for implementing the time tracking module. Each phase builds upon the previous one, allowing for incremental development and testing.
