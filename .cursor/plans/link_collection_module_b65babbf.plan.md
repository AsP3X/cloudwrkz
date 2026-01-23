---
name: Link Collection Module
overview: Create a link (bookmark) collection module where users can store links to websites, files, etc. The overview page will support table, list, and card grid views.
todos:
  - id: schema
    content: Add Link model to Prisma schema with LinkType enum and User relation
    status: in_progress
  - id: migration
    content: Create and run database migration for links table
    status: in_progress
  - id: module-config
    content: Add LINKS module key and config to modules.ts
    status: completed
  - id: routes
    content: Add link routes to routes.ts constants
    status: completed
  - id: permissions
    content: Add link permissions to permissions.ts and update role defaults
    status: completed
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
    status: in_progress
  - id: metadata-extraction
    content: Implement link metadata extraction (title, description, og tags) on save
    status: pending
  - id: favorites-ratings
    content: Add favorites and ratings functionality (UI and server actions)
    status: pending
  - id: link-notes
    content: Add personal notes/annotations field to links
    status: pending
  - id: duplicate-detection
    content: Implement duplicate URL detection when creating/updating links
    status: pending
  - id: import-export
    content: Implement browser bookmark import/export functionality
    status: pending
  - id: link-list-component
    content: Create LinkList component supporting table, list, and card views
    status: completed
  - id: view-toggle
    content: Create LinkViewToggle component for switching between view modes
    status: completed
  - id: view-context
    content: Create LinkViewContext for managing view mode state
    status: completed
  - id: filter-components
    content: Create LinkFilterButton and LinkFilterLoader components
    status: completed
  - id: bulk-actions
    content: Create bulk action components (toolbar, delete dialog, archive dialog)
    status: completed
  - id: add-edit-dialogs
    content: Create AddLinkDialog and EditLinkDialog components
    status: in_progress
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
    status: completed
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
  notes       String? // Personal annotations/notes for the link
  isFavorite  Boolean  @default(false) // Favorite flag
  rating      Int? // Rating 1-5 (optional)
  metadata    Json? // Extracted metadata (og:title, og:description, og:image, etc.)
  metadataExtractedAt DateTime? // When metadata was last fetched
  
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
  @@index([isFavorite])
  @@index([rating])
  @@index([url]) // For duplicate detection
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
  title?: string; // Optional if metadata extraction will populate it
  url: string;
  description?: string;
  favicon?: string;
  linkType?: LinkType;
  tags?: string[];
  notes?: string; // Personal annotations
  isFavorite?: boolean;
  rating?: number; // 1-5
  collectionIds?: string[]; // Collections to add link to
  extractMetadata?: boolean; // Flag to trigger metadata extraction
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
  isFavorite?: boolean; // Filter by favorites
  minRating?: number; // Filter by minimum rating (1-5)
  sortBy?: "createdAt" | "updatedAt" | "title" | "rating";
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
  - Normalize URL for duplicate detection
  - Check for existing links with same normalized URL (same user)
  - If duplicate found, return warning but allow creation (user can choose to proceed)
  - If `extractMetadata` is true or title/description missing, fetch metadata
  - Auto-populate title, description, favicon from metadata if not provided
  - Store extracted metadata in `metadata` JSON field
  - Set `metadataExtractedAt` timestamp
- `updateLink(id: string, input: LinkUpdateInput)` - Update existing bookmark
  - If URL changed, check for duplicates (excluding current link)
  - If metadata refresh requested, re-extract metadata
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
- `toggleFavorite(linkId: string)` - Toggle favorite status
- `updateRating(linkId: string, rating: number | null)` - Update link rating (1-5 or null)
- `extractLinkMetadata(url: string)` - Extract metadata from URL (title, description, og tags)
- `checkDuplicateUrl(url: string, userId: string, excludeLinkId?: string)` - Check for duplicate URLs
- `importBrowserBookmarks(file: File)` - Import browser bookmarks (HTML/JSON)
- `exportLinks(filters?: LinkFilters, format?: "html" | "json")` - Export links as browser bookmarks

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

- Columns: Checkbox, Favorite, Title, URL, Type, Rating, Tags, Notes, Created, Actions
- Sortable columns (including by rating)
- Responsive (hide some columns on mobile)
- Favorite column shows star icon (filled/outline)
- Rating column shows star display
- Notes column shows indicator if notes exist

#### List View

- Compact single-line items with key info
- Similar to table but more condensed
- Icon + title + URL preview + metadata in one line
- Better for mobile/scanning

#### Card Grid View

- Grid layout (responsive: 1 col mobile, 2-3 cols tablet, 3-4 cols desktop)
- Each card shows: favorite star, rating, favicon, title, description, tags, notes indicator, metadata
- Click to open link, hover for actions
- Favorite and rating visible on card

### 4.3 LinkList Component

Similar to `TicketList.tsx`:

- Handle all three view modes
- Selection state management
- Bulk actions support
- Responsive design
- Empty states
- Show collection badges/tags on links
- Display favorite stars and ratings
- Show notes indicator if link has notes

### 4.4 Collection Components

- **CollectionList**: Sidebar or dropdown showing user's collections
- **CollectionCard**: Display collection with link count, color, description
- **CollectionSelector**: Multi-select component for adding links to collections
- **ShareCollectionDialog**: Manage collection members and permissions

### 4.5 Link Enhancement Components

- **LinkFavoriteButton**: Toggle favorite status (star icon)
- **LinkRating**: Star rating component (1-5 stars, optional)
- **LinkNotes**: Text area for personal annotations/notes
- **ImportBookmarksDialog**: Dialog for importing browser bookmarks (file upload, preview, mapping)
- **ExportBookmarksButton**: Button to export links as browser bookmarks (HTML/JSON format)

### 4.6 AddLinkDialog and EditLinkDialog Details

**AddLinkDialog**:

- URL input (required) - triggers metadata extraction on blur/change
- Title input (auto-populated from metadata, editable)
- Description textarea (auto-populated from metadata, editable)
- Link type selector (auto-detected from URL, editable)
- Tags input (multi-select or comma-separated)
- Notes textarea (personal annotations)
- Favorite toggle (star button)
- Rating selector (1-5 stars, optional)
- Collection selector (multi-select)
- "Extract metadata" button (manual trigger)
- Duplicate warning (if URL already exists)
- Loading state during metadata extraction

**EditLinkDialog**:

- Same fields as AddLinkDialog
- Pre-populated with existing link data
- "Refresh metadata" button to re-extract metadata
- Show when metadata was last extracted
- Duplicate warning (if URL changed to existing URL)

**Metadata Extraction UI Flow**:

1. User enters URL
2. On blur or after delay, show "Extracting metadata..." indicator
3. Server extracts metadata (title, description, favicon, og tags)
4. Auto-populate form fields (user can still edit)
5. Show extracted metadata preview (optional)
6. If extraction fails, show warning but allow manual entry

## 5. Pages

### 5.1 Overview Page (`src/app/(dashboard)/dashboard/links/page.tsx`)

- Server component that fetches links
- Check module access
- Render `LinkViewProvider` with `LinkListView`
- Include `LinkViewControls` and `LinkFilterButton`
- Handle search params for filters
- Show collection filter/sidebar
- Collection selection in URL params (e.g., `?collection=id`)
- Include import/export buttons in header
- Filter by favorites and ratings

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
- `normalizeUrl(url: string)` - Normalize URL for duplicate detection (remove trailing slashes, www, etc.)
- `areUrlsDuplicate(url1: string, url2: string)` - Check if two URLs are duplicates

### 6.2 Metadata Extraction (`src/lib/utils/link-metadata.ts`)

- `extractLinkMetadata(url: string)` - Fetch and extract metadata from URL
  - Uses server-side fetch to get HTML
  - Extracts: `<title>`, `<meta name="description">`, Open Graph tags (`og:title`, `og:description`, `og:image`), Twitter Card tags
  - Returns structured metadata object
  - Handles errors gracefully (returns partial data if fetch fails)
- `extractFaviconFromUrl(url: string)` - Extract favicon URL from page
- `sanitizeMetadata(metadata: any)` - Sanitize extracted metadata (remove HTML, limit length)

### 6.3 Import/Export Utilities (`src/lib/utils/link-import-export.ts`)

- `parseBrowserBookmarksHtml(html: string)` - Parse browser bookmarks HTML export
  - Supports Chrome, Firefox, Safari bookmark formats
  - Extracts title, URL, description, folders (as collections)
- `parseBrowserBookmarksJson(json: string)` - Parse browser bookmarks JSON export
  - Supports Chrome JSON export format
- `generateBrowserBookmarksHtml(links: Link[])` - Generate HTML bookmarks file
- `generateBrowserBookmarksJson(links: Link[])` - Generate JSON bookmarks file

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
- **Link Metadata Extraction**: Auto-populate title, description, favicon, and Open Graph metadata on save
- **Favorites**: Mark links as favorites with boolean flag
- **Ratings**: Rate links 1-5 stars (optional)
- **Link Notes**: Personal annotations/notes for each link
- **Duplicate Detection**: Warn when creating links with duplicate URLs (normalized comparison)
- **Import/Export**: Import browser bookmarks (HTML/JSON) and export links as browser bookmarks

### 7.2 Advanced Features (Future)

- Link validation/health checks (check if URLs are still accessible)
- Collection templates
- Collection nesting (sub-collections)
- Public collection links (shareable URLs)
- CSV import/export
- Link preview cards with rich metadata display

## 8. Navigation Integration

### 8.1 Sidebar Navigation

Add links module to navigation (similar to tickets/todos):

- Check module enabled and user permissions
- Show "Links" menu item
- Icon: bookmark/link icon

## 9. Implementation Order

1. Database schema and migration (Links + Collections + new fields)
2. Module configuration and permissions
3. Link utilities (validation, normalization, duplicate detection helpers)
4. Metadata extraction utilities (server-side fetch and parsing)
5. Server actions for links (CRUD operations with metadata extraction and duplicate detection)
6. Server actions for collections (CRUD + sharing)
7. Favorites and ratings server actions
8. Import/export utilities and server actions
9. Basic components (LinkList with one view mode)
10. Collection components (list, create, edit)
11. Link enhancement components (favorites, ratings, notes)
12. View toggle and multiple view modes
13. Collection integration (selector in link forms, filtering)
14. Collection sharing functionality
15. Filtering and search (including collection, favorites, ratings filters)
16. Bulk operations
17. Archive functionality
18. Import/export UI components
19. Navigation integration
20. Polish and testing

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

## 11. Metadata Extraction Implementation

### 11.1 Extraction Process

When creating or updating a link with `extractMetadata: true` or when title/description is missing:

1. Server-side fetch of the URL (with timeout, e.g., 5 seconds)
2. Parse HTML to extract:

   - `<title>` tag
   - `<meta name="description">` tag
   - Open Graph tags: `og:title`, `og:description`, `og:image`, `og:type`
   - Twitter Card tags: `twitter:title`, `twitter:description`, `twitter:image`
   - Favicon: `<link rel="icon">` or `/favicon.ico`

3. Priority order: Open Graph > Twitter Card > Meta tags > Title tag
4. Store extracted data in `metadata` JSON field
5. Auto-populate `title`, `description`, `favicon` fields if not provided
6. Set `metadataExtractedAt` timestamp

### 11.2 Error Handling

- If fetch fails (timeout, network error, 404), use URL as title fallback
- If parsing fails, store partial metadata
- Don't block link creation if metadata extraction fails
- Allow manual refresh of metadata later

### 11.3 Performance

- Cache metadata extraction results (optional, by URL hash)
- Use background job for bulk metadata extraction (future enhancement)
- Limit metadata extraction to avoid rate limiting

## 12. Duplicate Detection Implementation

### 12.1 Normalization

Before comparing URLs for duplicates:

1. Remove protocol (http/https)
2. Remove `www.` prefix
3. Remove trailing slashes
4. Remove query parameters and fragments (optional, configurable)
5. Convert to lowercase
6. Remove default ports (80, 443)

Example: `https://www.example.com/path/` → `example.com/path`

### 12.2 Detection Flow

When creating a link:

1. Normalize the new URL
2. Query existing links for user with normalized URL match
3. If duplicates found:

   - Return warning in `ActionResult` with duplicate link IDs
   - Show dialog in UI: "This URL already exists. Do you want to proceed?"
   - Allow user to proceed or cancel

4. Store normalized URL in database (optional, for faster future lookups)

### 12.3 UI Feedback

- Show duplicate warning dialog before creating
- Option to view existing duplicate link
- Option to merge/update existing link instead of creating new one

## 13. Import/Export Implementation

### 13.1 Import Formats

**Browser Bookmarks HTML** (Netscape format):

- Parse `<DT><A HREF="...">` tags
- Extract title, URL, description, add date
- Support nested folders (create collections)

**Chrome JSON**:

- Parse `bookmarks.json` structure
- Extract bookmarks bar, other bookmarks, mobile bookmarks
- Map folders to collections

### 13.2 Import Process

1. User uploads bookmarks file
2. Parse file format (detect HTML vs JSON)
3. Extract links and folder structure
4. Show preview dialog:

   - List of links to import
   - Folder → Collection mapping
   - Duplicate detection (show which links already exist)

5. User confirms import
6. Create collections for folders
7. Create links (with metadata extraction)
8. Show import summary (X links imported, Y duplicates skipped)

### 13.3 Export Formats

**HTML (Netscape format)**:

- Generate standard browser bookmarks HTML
- Include collections as folders
- Include metadata (title, description, add date)

**JSON (Chrome format)**:

- Generate Chrome-compatible JSON structure
- Include collections as folders

### 13.4 Export Process

1. User clicks export button
2. Apply current filters (export filtered links only)
3. Choose format (HTML or JSON)
4. Generate file
5. Download file

## 14. Testing Considerations

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
- **Metadata extraction**: Test with various websites, handle failures gracefully
- **Duplicate detection**: Test URL normalization, edge cases (www, trailing slashes, protocols)
- **Favorites and ratings**: Test filtering, sorting by rating
- **Notes**: Test text input, display in different view modes
- **Import/export**: Test with Chrome, Firefox, Safari bookmarks, handle malformed files
- **Performance**: Test metadata extraction with slow/timeout URLs, bulk import performance