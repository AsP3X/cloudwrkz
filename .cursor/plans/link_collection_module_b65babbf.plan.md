---
name: Link Collection Module
overview: Create a link (bookmark) collection module where users can store links to websites, files, etc. The overview page will support table, list, and card grid views.
todos:
  - id: schema
    content: Add Link model to Prisma schema with LinkType enum and User relation
    status: pending
  - id: migration
    content: Create and run database migration for links table
    status: pending
  - id: module-config
    content: Add LINKS module key and config to modules.ts
    status: pending
  - id: routes
    content: Add link routes to routes.ts constants
    status: pending
  - id: permissions
    content: Add link permissions to permissions.ts and update role defaults
    status: pending
  - id: server-actions
    content: Create links.ts server actions file with CRUD operations
    status: pending
  - id: collection-schema
    content: Add Collection, LinkCollection, and CollectionMember models to schema
    status: pending
  - id: collection-server-actions
    content: Create collection server actions (CRUD, sharing, member management)
    status: pending
  - id: link-utils
    content: Create links.ts utility file with URL validation and helpers
    status: pending
  - id: link-list-component
    content: Create LinkList component supporting table, list, and card views
    status: pending
  - id: view-toggle
    content: Create LinkViewToggle component for switching between view modes
    status: pending
  - id: view-context
    content: Create LinkViewContext for managing view mode state
    status: pending
  - id: filter-components
    content: Create LinkFilterButton and LinkFilterLoader components
    status: pending
  - id: bulk-actions
    content: Create bulk action components (toolbar, delete dialog, archive dialog)
    status: pending
  - id: add-edit-dialogs
    content: Create AddLinkDialog and EditLinkDialog components
    status: pending
  - id: collection-components
    content: Create collection components (list, card, create/edit dialogs, selector)
    status: pending
  - id: share-collection
    content: Create ShareCollectionDialog and collection member management
    status: pending
  - id: collection-integration
    content: Integrate collections into link forms and filtering
    status: pending
  - id: collection-page
    content: Create collection detail page at /dashboard/links/collections/[id]
    status: pending
  - id: overview-page
    content: Create links overview page at /dashboard/links
    status: pending
  - id: detail-page
    content: Create link detail page at /dashboard/links/[id]
    status: pending
  - id: archive-page
    content: Create links archive page
    status: pending
  - id: navigation
    content: Add Links module to sidebar navigation
    status: pending
isProject: false
---

# Link Collection Module Implementation Plan

## Overview

This plan outlines the implementation of a link collection (bookmark) module that allows users to store and organize links to websites, files, and other resources. The module will support three view modes: table, list, and card grid.

## 1. Database Schema (`prisma/schema.prisma`)

### 1.1 Link Model

Add a new `Link` model to store bookmarks:

```prisma
model Link {
  id          String   @id @default(cuid())
  title       String
  url         String
  description String?
  favicon     String? // URL to favicon or stored favicon path
  linkType    LinkType @default(WEBSITE) // WEBSITE, FILE, DOCUMENT, etc.
  
  // Metadata
  tags        String[] @default([])
  
  // Relations
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  collections LinkCollection[] // Many-to-many with collections
  
  // Archiving
  archivedAt  DateTime? // When set, link is considered archived
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([userId])
  @@index([linkType])
  @@index([archivedAt])
  @@index([createdAt])
  @@map("links")
}

enum LinkType {
  WEBSITE
  FILE
  DOCUMENT
  VIDEO
  IMAGE
  OTHER
}
```

### 1.2 Collection Model

Add a `Collection` model to organize links:

```prisma
model Collection {
  id          String   @id @default(cuid())
  name        String
  description String?
  color       String? // Optional color for UI (hex code)
  
  // Relations
  ownerId     String
  owner       User     @relation("CollectionOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  links       LinkCollection[] // Many-to-many with links
  members     CollectionMember[] // Users with access to this collection
  
  // Archiving
  archivedAt  DateTime?
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([ownerId])
  @@index([archivedAt])
  @@index([createdAt])
  @@map("collections")
}
```

### 1.3 LinkCollection (Join Table)

Many-to-many relationship between Links and Collections:

```prisma
model LinkCollection {
  id           String     @id @default(cuid())
  linkId       String
  link         Link       @relation(fields: [linkId], references: [id], onDelete: Cascade)
  collectionId String
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  createdAt    DateTime   @default(now())
  
  @@unique([linkId, collectionId])
  @@index([linkId])
  @@index([collectionId])
  @@map("link_collections")
}
```

### 1.4 CollectionMember (Sharing)

Model for sharing collections with other users:

```prisma
model CollectionMember {
  id           String     @id @default(cuid())
  collectionId String
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  userId       String
  user         User       @relation("CollectionMember", fields: [userId], references: [id], onDelete: Cascade)
  role         CollectionRole @default(VIEWER) // VIEWER, EDITOR
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  
  @@unique([collectionId, userId])
  @@index([collectionId])
  @@index([userId])
  @@map("collection_members")
}

enum CollectionRole {
  VIEWER  // Can view links in collection
  EDITOR  // Can add/remove links and edit collection
}
```

### 1.5 User Relations

Add relations to User model:

```prisma
model User {
  // ... existing fields
  links              Link[]
  ownedCollections   Collection[] @relation("CollectionOwner")
  collectionMemberships CollectionMember[] @relation("CollectionMember")
}
```

### 1.6 Migration

- Create migration file: `prisma/migrations/XXXX_add_links_module/migration.sql`
- Run: `pnpm db:migrate`

## 2. Module Configuration

### 2.1 Module Constants (`src/lib/constants/modules.ts`)

Add link collection module:

```typescript
export const MODULE_KEYS = {
  // ... existing
  LINKS: "links",
} as const;

export const MODULE_CONFIG = {
  // ... existing
  [MODULE_KEYS.LINKS]: {
    key: MODULE_KEYS.LINKS,
    name: "Links",
    description: "Store and organize bookmarks to websites, files, and resources",
    defaultEnabled: false,
  },
} as const;
```

### 2.2 Routes (`src/lib/constants/routes.ts`)

Add link routes:

```typescript
export const ROUTES = {
  // ... existing
  LINKS: "/dashboard/links",
  LINKS_ARCHIVE: "/dashboard/links/archive",
  LINKS_COLLECTION: "/dashboard/links/collections", // Base path for collections
} as const;
```

### 2.3 Permissions (`src/lib/constants/permissions.ts`)

Add link permissions:

```typescript
export type PermissionKey = 
  // ... existing
  | "links.view"
  | "links.create"
  | "links.update"
  | "links.delete"
  | "collections.view"
  | "collections.create"
  | "collections.update"
  | "collections.delete"
  | "collections.share"
  | "modules.links.view";

export const PERMISSIONS: PermissionDefinition[] = [
  // ... existing
  {
    key: "links.view",
    name: "View Links",
    description: "View bookmarks and links",
    category: "links",
    module: "links",
  },
  {
    key: "links.create",
    name: "Create Links",
    description: "Create new bookmarks",
    category: "links",
    module: "links",
  },
  {
    key: "links.update",
    name: "Update Links",
    description: "Update existing bookmarks",
    category: "links",
    module: "links",
  },
  {
    key: "links.delete",
    name: "Delete Links",
    description: "Delete bookmarks",
    category: "links",
    module: "links",
  },
  {
    key: "modules.links.view",
    name: "View Links Module",
    description: "Access to the Links module in navigation and dashboard",
    category: "modules",
    module: "links",
  },
  {
    key: "collections.view",
    name: "View Collections",
    description: "View link collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.create",
    name: "Create Collections",
    description: "Create new link collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.update",
    name: "Update Collections",
    description: "Update existing collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.delete",
    name: "Delete Collections",
    description: "Delete collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.share",
    name: "Share Collections",
    description: "Share collections with other users",
    category: "links",
    module: "links",
  },
];

// Add to ROLE_PERMISSIONS for appropriate roles
```

## 3. Server Actions (`src/server/actions/links.ts`)

### 3.1 Types

```typescript
export type LinkType = "WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER";

export type LinkInput = {
  title: string;
  url: string;
  description?: string;
  favicon?: string;
  linkType?: LinkType;
  tags?: string[];
  collectionIds?: string[]; // Collections to add link to
};

export type LinkUpdateInput = Partial<LinkInput> & {
  collectionIds?: string[]; // Replace all collections
};

export type LinkFilters = {
  userId?: string;
  linkType?: LinkType;
  tags?: string[];
  collectionId?: string; // Filter by collection
  search?: string;
  archived?: boolean;
  sortBy?: "createdAt" | "updatedAt" | "title";
  sortOrder?: "asc" | "desc";
};

export type CollectionRole = "VIEWER" | "EDITOR";

export type CollectionInput = {
  name: string;
  description?: string;
  color?: string;
};

export type CollectionUpdateInput = Partial<CollectionInput>;

export type CollectionShareInput = {
  userId: string;
  role: CollectionRole;
};
```

### 3.2 Link Actions

- `createLink(input: LinkInput)` - Create new bookmark
- `updateLink(id: string, input: LinkUpdateInput)` - Update existing bookmark
- `deleteLink(id: string)` - Delete bookmark
- `archiveLink(id: string)` - Archive bookmark
- `unarchiveLink(id: string)` - Unarchive bookmark
- `getLinks(filters: LinkFilters)` - Fetch links with filtering
- `getLink(id: string)` - Get single link by ID
- `bulkUpdateLinks(ids: string[], updates: LinkUpdateInput)` - Bulk update
- `bulkDeleteLinks(ids: string[])` - Bulk delete
- `bulkArchiveLinks(ids: string[])` - Bulk archive
- `addLinkToCollection(linkId: string, collectionId: string)` - Add link to collection
- `removeLinkFromCollection(linkId: string, collectionId: string)` - Remove link from collection

### 3.3 Collection Actions

- `createCollection(input: CollectionInput)` - Create new collection
- `updateCollection(id: string, input: CollectionUpdateInput)` - Update collection
- `deleteCollection(id: string)` - Delete collection
- `archiveCollection(id: string)` - Archive collection
- `unarchiveCollection(id: string)` - Unarchive collection
- `getCollections(filters?: { userId?: string; archived?: boolean })` - Fetch collections
- `getCollection(id: string)` - Get single collection with links and members
- `shareCollection(collectionId: string, input: CollectionShareInput)` - Share collection with user
- `updateCollectionMember(collectionId: string, userId: string, role: CollectionRole)` - Update member role
- `removeCollectionMember(collectionId: string, userId: string)` - Remove user from collection
- `getCollectionMembers(collectionId: string)` - Get all members of a collection
- `getUserCollections(userId: string)` - Get all collections user has access to (owned + shared)

### 3.4 Implementation Pattern

Follow the pattern from `tickets.ts` and `todos.ts`:

- Check module enabled status
- Check user permissions
- Validate input (URL format, required fields)
- Perform database operations
- Revalidate paths
- Return `ActionResult<T>`

## 4. Components Structure

### 4.1 Component Organization

```
src/components/features/links/
├── LinkList/
│   ├── LinkList.tsx          # Main list component (handles all 3 views)
│   └── index.ts
├── LinkViewToggle/
│   ├── LinkViewToggle.tsx     # View mode toggle (table/list/card)
│   └── index.ts
├── LinkViewContext/
│   ├── LinkViewContext.tsx    # Context for view mode state
│   └── index.ts
├── LinkListView/
│   ├── LinkListView.tsx       # Wrapper with view context
│   └── index.ts
├── LinkViewControls/
│   ├── LinkViewControls.tsx  # Header controls (view toggle, filters, create)
│   └── index.ts
├── LinkFilterButton/
│   ├── LinkFilterButton.tsx   # Filter dialog trigger
│   └── index.ts
├── LinkFilterLoader/
│   ├── LinkFilterLoader.tsx  # Auto-load filter presets
│   └── index.ts
├── LinkBulkActionsToolbar/
│   ├── LinkBulkActionsToolbar.tsx
│   └── index.ts
├── LinkBulkDeleteDialog/
│   ├── LinkBulkDeleteDialog.tsx
│   └── index.ts
├── LinkBulkArchiveDialog/
│   ├── LinkBulkArchiveDialog.tsx
│   └── index.ts
├── AddLinkDialog/
│   ├── AddLinkDialog.tsx      # Create new link dialog
│   └── index.ts
├── EditLinkDialog/
│   ├── EditLinkDialog.tsx     # Edit link dialog
│   └── index.ts
├── LinkCard/
│   ├── LinkCard.tsx           # Individual link card component
│   └── index.ts
├── CollectionList/
│   ├── CollectionList.tsx      # List of collections (sidebar or dropdown)
│   └── index.ts
├── CollectionCard/
│   ├── CollectionCard.tsx      # Individual collection card
│   └── index.ts
├── CreateCollectionDialog/
│   ├── CreateCollectionDialog.tsx
│   └── index.ts
├── EditCollectionDialog/
│   ├── EditCollectionDialog.tsx
│   └── index.ts
├── ShareCollectionDialog/
│   ├── ShareCollectionDialog.tsx # Share collection with users
│   └── index.ts
└── CollectionSelector/
    ├── CollectionSelector.tsx  # Multi-select for collections in link forms
    └── index.ts
```

### 4.2 View Modes Implementation

#### Table View

- Columns: Checkbox, Title, URL, Type, Tags, Created, Actions
- Sortable columns
- Responsive (hide some columns on mobile)

#### List View

- Compact single-line items with key info
- Similar to table but more condensed
- Icon + title + URL preview + metadata in one line
- Better for mobile/scanning

#### Card Grid View

- Grid layout (responsive: 1 col mobile, 2-3 cols tablet, 3-4 cols desktop)
- Each card shows: favicon, title, description, tags, metadata
- Click to open link, hover for actions

### 4.3 LinkList Component

Similar to `TicketList.tsx`:

- Handle all three view modes
- Selection state management
- Bulk actions support
- Responsive design
- Empty states
- Show collection badges/tags on links

### 4.4 Collection Components

- **CollectionList**: Sidebar or dropdown showing user's collections
- **CollectionCard**: Display collection with link count, color, description
- **CollectionSelector**: Multi-select component for adding links to collections
- **ShareCollectionDialog**: Manage collection members and permissions

## 5. Pages

### 5.1 Overview Page (`src/app/(dashboard)/dashboard/links/page.tsx`)

- Server component that fetches links
- Check module access
- Render `LinkViewProvider` with `LinkListView`
- Include `LinkViewControls` and `LinkFilterButton`
- Handle search params for filters
- Show collection filter/sidebar
- Collection selection in URL params (e.g., `?collection=id`)

### 5.2 Detail Page (`src/app/(dashboard)/dashboard/links/[id]/page.tsx`)

- Show link details
- Edit/delete actions
- Related links (optional)
- Show collections link belongs to

### 5.3 Archive Page (`src/app/(dashboard)/dashboard/links/archive/page.tsx`)

- Similar to tickets archive
- Show archived links only
- Unarchive functionality

### 5.4 Collection Page (`src/app/(dashboard)/dashboard/links/collections/[id]/page.tsx`)

- Show collection details
- List all links in collection
- Manage collection members
- Edit collection settings
- Share collection

## 6. Utilities

### 6.1 Link Utilities (`src/lib/utils/links.ts`)

- `validateUrl(url: string)` - URL validation
- `extractDomain(url: string)` - Extract domain from URL
- `getFaviconUrl(url: string)` - Generate favicon URL (e.g., Google's favicon service)
- `getLinkTypeFromUrl(url: string)` - Auto-detect link type from URL
- `formatLinkUrl(url: string)` - Normalize URL format

## 7. Features

### 7.1 Core Features

- Create, read, update, delete links
- Tag support
- Link type categorization
- Archiving
- Search and filtering
- Bulk operations
- View mode preferences (stored in localStorage)
- **Collections**: Organize links into named collections
- **Collection Sharing**: Share collections with other users (VIEWER or EDITOR role)
- **Collection Filtering**: Filter links by collection
- **Multi-collection Links**: Links can belong to multiple collections

### 7.2 Advanced Features (Future)

- Link preview/metadata fetching
- Import/export (browser bookmarks, CSV)
- Link validation/health checks
- Collection templates
- Collection nesting (sub-collections)
- Public collection links (shareable URLs)

## 8. Navigation Integration

### 8.1 Sidebar Navigation

Add links module to navigation (similar to tickets/todos):

- Check module enabled and user permissions
- Show "Links" menu item
- Icon: bookmark/link icon

## 9. Implementation Order

1. Database schema and migration (Links + Collections)
2. Module configuration and permissions
3. Server actions for links (CRUD operations)
4. Server actions for collections (CRUD + sharing)
5. Basic components (LinkList with one view mode)
6. Collection components (list, create, edit)
7. View toggle and multiple view modes
8. Collection integration (selector in link forms, filtering)
9. Collection sharing functionality
10. Filtering and search (including collection filter)
11. Bulk operations
12. Archive functionality
13. Navigation integration
14. Polish and testing

## 10. Collection Access Control

### 10.1 Access Rules

- **Owner**: Full control (create, update, delete, share, manage members)
- **EDITOR**: Can add/remove links, edit collection details (if allowed), cannot delete collection or manage members
- **VIEWER**: Can only view links in collection, cannot modify collection or links

### 10.2 Permission Checks

When accessing collections or links:

- Check if user is owner, member with EDITOR role, or member with VIEWER role
- For link operations within a collection, respect collection member roles
- Users can always see their own links, even if removed from a collection
- Collection owners can always access their collections

### 10.3 Sharing Implementation

- Share dialog allows searching/selecting users
- Can set role (VIEWER or EDITOR) when sharing
- Can update member roles later
- Can remove members (except owner)
- Members receive access to all links in the collection
- When link is removed from collection, it's still accessible to original owner

## 11. Testing Considerations

- URL validation
- Permission checks
- Module enabled checks
- View mode persistence
- Responsive design
- Empty states
- Error handling
- Bulk operations
- Collection access control (owner, editor, viewer)
- Collection sharing and member management
- Multi-collection link assignment
- Collection filtering