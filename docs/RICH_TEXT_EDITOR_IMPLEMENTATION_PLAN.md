# Rich Text Editor for Tickets - Implementation Plan

## Overview
This document outlines the complete implementation plan for adding a rich text editor to the tickets module, enabling formatted text in ticket descriptions and comments. The editor will support text formatting (bold, italic), font sizes, colored text, text background colors, images, links, quotes, user mentions, and code blocks.

---

## 1. Technology Stack Analysis

### 1.1 Rich Text Editor Library Options

#### Option A: TipTap (Recommended)
**Pros:**
- Built on ProseMirror (robust, extensible)
- Framework-agnostic, works well with React
- Excellent TypeScript support
- Extensible plugin system
- Good documentation
- Active community
- Supports all required features out of the box
- Can output HTML or JSON

**Cons:**
- Larger bundle size (~50KB gzipped)
- Learning curve for advanced customization

**Bundle Size:** ~50KB (gzipped)

#### Option B: Slate.js
**Pros:**
- Very flexible and customizable
- React-first approach
- Good for complex use cases

**Cons:**
- Requires more setup and configuration
- Steeper learning curve
- More boilerplate code needed
- Less opinionated (more work to implement features)

**Bundle Size:** ~40KB (gzipped)

#### Option C: Draft.js
**Pros:**
- Built by Facebook
- Immutable data model
- Good for complex text editing

**Cons:**
- Less actively maintained
- More complex API
- Requires more setup for basic features
- Not as modern as TipTap

**Bundle Size:** ~50KB (gzipped)

#### Option D: React Quill
**Pros:**
- Simple API
- Quick to implement
- Good for basic rich text editing

**Cons:**
- Less flexible
- Harder to customize
- Limited extensibility
- May not support all advanced features easily

**Bundle Size:** ~45KB (gzipped)

### 1.2 Recommendation: TipTap
**Rationale:**
- Best balance of features, ease of use, and extensibility
- Excellent TypeScript support aligns with project
- Active development and community
- All required features can be implemented with plugins
- Can output HTML (easier to store and render) or JSON (more structured)

### 1.3 Required TipTap Packages
```json
{
  "@tiptap/react": "^2.x.x",
  "@tiptap/starter-kit": "^2.x.x",
  "@tiptap/extension-text-style": "^2.x.x",
  "@tiptap/extension-color": "^2.x.x",
  "@tiptap/extension-text-align": "^2.x.x",
  "@tiptap/extension-link": "^2.x.x",
  "@tiptap/extension-image": "^2.x.x",
  "@tiptap/extension-blockquote": "^2.x.x",
  "@tiptap/extension-code-block": "^2.x.x",
  "@tiptap/extension-mention": "^2.x.x",
  "@tiptap/extension-font-family": "^2.x.x",
  "@tiptap/extension-highlight": "^2.x.x"
}
```

---

## 2. Database Schema Changes

### 2.1 Current Schema
```prisma
model Ticket {
  description String? // Currently plain text
  // ...
}

model TicketComment {
  content String // Currently plain text
  // ...
}
```

### 2.2 Proposed Schema Changes

#### Option A: Store HTML (Recommended)
**Pros:**
- Easy to render (just use `dangerouslySetInnerHTML` with sanitization)
- Smaller storage footprint
- Easier to migrate existing plain text
- Can still extract plain text for search

**Cons:**
- Requires HTML sanitization
- Harder to query/manipulate in database

```prisma
model Ticket {
  description      String?  // Rich text HTML (sanitized)
  descriptionPlain String?  // Plain text version for search/indexing
  // ...
}

model TicketComment {
  content     String  // Rich text HTML (sanitized)
  contentPlain String // Plain text version for search/indexing
  // ...
}
```

#### Option B: Store JSON (TipTap Document Format)
**Pros:**
- Structured data
- Easier to query/manipulate
- Version control friendly
- Can transform to different formats

**Cons:**
- Larger storage footprint
- Requires conversion to HTML for rendering
- More complex migration

```prisma
model Ticket {
  description     String?  // JSON string (TipTap document)
  descriptionPlain String? // Plain text version
  // ...
}

model TicketComment {
  content     String  // JSON string (TipTap document)
  contentPlain String // Plain text version
  // ...
}
```

### 2.3 Recommendation: Option A (HTML with Plain Text)
**Rationale:**
- Simpler implementation
- Easier to render
- Can still support search with plain text field
- HTML sanitization is well-established
- Migration is straightforward (existing text becomes HTML)

### 2.4 Migration Strategy

#### Phase 1: Add New Fields (Non-Breaking)
```prisma
model Ticket {
  description      String?  // Keep existing field
  descriptionHtml  String?  // New rich text field
  descriptionPlain String?  // New plain text field for search
  // ...
}

model TicketComment {
  content     String  // Keep existing field
  contentHtml String? // New rich text field
  contentPlain String? // New plain text field
  // ...
}
```

#### Phase 2: Migrate Existing Data
- Create migration script to convert existing plain text to HTML
- Populate `descriptionPlain` and `contentPlain` from existing fields
- Set `descriptionHtml` and `contentHtml` to escaped HTML versions

#### Phase 3: Update Application Code
- Update forms to use rich text editor
- Update display components to render HTML
- Update search to use plain text fields

#### Phase 4: Remove Old Fields (Breaking)
- After migration is complete and verified
- Remove `description` and `content` fields
- Rename `descriptionHtml` → `description`, `contentHtml` → `content`

### 2.5 Indexing for Search
- Use `descriptionPlain` and `contentPlain` for full-text search
- Keep HTML fields for display only
- Consider adding full-text search indexes on plain text fields

---

## 3. Component Architecture

### 3.1 Component Structure

```
src/
├── components/
│   ├── ui/
│   │   └── RichTextEditor/
│   │       ├── RichTextEditor.tsx
│   │       ├── RichTextEditor.types.ts
│   │       ├── RichTextEditorToolbar.tsx
│   │       ├── RichTextEditorContent.tsx
│   │       ├── RichTextEditorMentionList.tsx
│   │       └── index.ts
│   │
│   └── features/
│       └── tickets/
│           ├── RichTextDisplay/
│           │   ├── RichTextDisplay.tsx
│           │   ├── RichTextDisplay.types.ts
│           │   └── index.ts
│           └── ... (existing ticket components)
│
├── lib/
│   ├── utils/
│   │   ├── rich-text.ts          // Sanitization, conversion utilities
│   │   └── html-sanitizer.ts     // HTML sanitization
│   └── hooks/
│       └── useRichTextEditor.ts  // Editor hook with TipTap setup
│
└── server/
    └── actions/
        └── tickets.ts            // Updated to handle HTML content
```

### 3.2 Core Components

#### 3.2.1 RichTextEditor Component
**File**: `src/components/ui/RichTextEditor/RichTextEditor.tsx`

**Props:**
```typescript
interface RichTextEditorProps {
  value: string; // HTML string
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  minHeight?: string;
  maxHeight?: string;
  showToolbar?: boolean;
  mentionableUsers?: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  onImageUpload?: (file: File) => Promise<string>; // Returns image URL
  allowedFormats?: string[]; // e.g., ['bold', 'italic', 'heading', ...]
}
```

**Features:**
- Wrapper around TipTap editor
- Integrates with React Hook Form
- Handles image uploads
- User mention support
- Toolbar with formatting options
- Error and helper text display
- Accessible (keyboard navigation, ARIA labels)

#### 3.2.2 RichTextEditorToolbar Component
**File**: `src/components/ui/RichTextEditor/RichTextEditorToolbar.tsx`

**Features:**
- Formatting buttons (Bold, Italic, Underline)
- Heading dropdown (H1, H2, H3, Normal)
- Font size dropdown
- Text color picker
- Background color picker
- Link button (with URL input dialog)
- Image upload button
- Quote button
- Code block button
- User mention trigger (@)
- Undo/Redo buttons
- Responsive design (collapsible on mobile)

#### 3.2.3 RichTextDisplay Component
**File**: `src/components/features/tickets/RichTextDisplay/RichTextDisplay.tsx`

**Props:**
```typescript
interface RichTextDisplayProps {
  content: string; // HTML string
  className?: string;
  maxHeight?: string; // For expandable content
}
```

**Features:**
- Renders sanitized HTML safely
- Styles for all formatting (headings, colors, code blocks, etc.)
- Link handling (open in new tab, security)
- Image display (with lazy loading, error handling)
- User mention highlighting (with links to user profiles)
- Code block syntax highlighting (optional)
- Quote block styling
- Responsive images
- Dark mode support

#### 3.2.4 RichTextEditorMentionList Component
**File**: `src/components/ui/RichTextEditor/RichTextEditorMentionList.tsx`

**Features:**
- Dropdown list of mentionable users
- Search/filter functionality
- User avatar display
- Keyboard navigation
- Click to select

---

## 4. Feature Implementation Details

### 4.1 Text Formatting

#### Bold, Italic, Underline
- Standard TipTap extensions
- Toolbar buttons with keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U)
- Visual indicators when active

#### Font Sizes
- Extension: Custom font size extension or use heading levels
- Options: Small, Normal, Large, Extra Large
- Dropdown in toolbar
- Stored as inline styles or heading tags

**Implementation:**
```typescript
// Use heading levels for semantic sizes
// H1 = Extra Large, H2 = Large, H3 = Medium, Normal = P
// Or use custom extension with inline styles
```

#### Text Color
- Extension: `@tiptap/extension-color`
- Color picker in toolbar
- Preset colors + custom color picker
- Stored as inline style: `color: #hex`

#### Background Color (Highlight)
- Extension: `@tiptap/extension-highlight`
- Color picker in toolbar
- Preset highlight colors (yellow, green, blue, red, etc.)
- Stored as `<mark>` tag with style

### 4.2 Images

#### Upload Flow
1. User clicks image button in toolbar
2. File picker opens (accept: image/*)
3. File is uploaded to server (new API endpoint)
4. Server stores image, returns URL
5. Image is inserted into editor at cursor position

#### Image Storage Options

**Option A: Store in Database (Base64)**
- Pros: Simple, no file system needed
- Cons: Large database, slower queries, not scalable

**Option B: Store in File System**
- Pros: Fast, scalable
- Cons: Requires file system access, backup complexity

**Option C: Store in Cloud Storage (S3, Cloudinary, etc.)**
- Pros: Scalable, CDN support, optimized delivery
- Cons: Additional service, costs

**Recommendation: Option C (Cloud Storage) or Option B (File System)**
- For MVP: Use file system with `/public/uploads/tickets/` directory
- For production: Consider cloud storage

#### Image API Endpoint
**File**: `src/app/api/tickets/upload-image/route.ts`

```typescript
// POST /api/tickets/upload-image
// - Accepts multipart/form-data
// - Validates file type (images only)
// - Validates file size (max 5MB)
// - Generates unique filename
// - Saves to storage
// - Returns image URL
```

#### Image Display
- Lazy loading
- Responsive sizing (max-width: 100%)
- Error handling (broken image placeholder)
- Click to view full size (optional modal)

### 4.3 Links

#### Link Insertion
- Toolbar button opens dialog
- User enters URL and optional text
- Validates URL format
- Inserts as `<a href="...">text</a>`

#### Link Display
- Opens in new tab (`target="_blank"`)
- Security: `rel="noopener noreferrer"`
- Visual indicator (underline, color)
- Hover tooltip showing URL

#### Link Editing
- Click existing link to edit
- Dialog opens with current URL and text
- Can update or remove link

### 4.4 Quotes

#### Quote Blocks
- Extension: `@tiptap/extension-blockquote`
- Toolbar button or keyboard shortcut
- Styled as blockquote with left border
- Can nest quotes

#### Styling
```css
blockquote {
  border-left: 4px solid theme('colors.primary.500');
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  color: theme('colors.neutral.600');
}
```

### 4.5 User Mentions

#### Mention System
- Extension: `@tiptap/extension-mention`
- Trigger: Type `@` to open mention list
- Searchable list of users
- Displays user name and avatar
- Inserts as: `<span data-type="mention" data-id="userId">@username</span>`

#### User Data
- Fetch mentionable users on editor mount
- Filter by permissions (only show users user can mention)
- Cache user list for performance

#### Mention Display
- Highlighted with special styling
- Clickable (links to user profile)
- Shows user avatar inline (optional)
- Tooltip with user info on hover

#### Notification System (Future)
- When user is mentioned, send notification
- Track mentions in database
- Show "mentioned" badge in notifications

### 4.6 Code Blocks

#### Code Block Support
- Extension: `@tiptap/extension-code-block`
- Toolbar button or keyboard shortcut
- Language selection (optional, for syntax highlighting)
- Monospace font, background color
- Copy to clipboard button (optional)

#### Syntax Highlighting (Optional)
- Use Prism.js or highlight.js
- Client-side highlighting
- Language detection
- Styled code blocks

#### Inline Code
- Extension: `@tiptap/extension-code`
- Keyboard shortcut: `` `code` ``
- Inline styling with background

---

## 5. Security Considerations

### 5.1 HTML Sanitization

#### Library: DOMPurify
- Industry standard for HTML sanitization
- Removes dangerous scripts, events, etc.
- Preserves safe formatting

**Implementation:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
      'span', 'div', 'mark'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title', 'class',
      'style', 'data-type', 'data-id'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
```

### 5.2 Image Upload Security
- Validate file type (MIME type, not just extension)
- Validate file size (max 5MB)
- Scan for malicious content (optional)
- Generate unique filenames (prevent overwrites)
- Store outside web root or use signed URLs
- Rate limiting on upload endpoint

### 5.3 Link Security
- Validate URL format
- Check for dangerous protocols (javascript:, data:, etc.)
- Always add `rel="noopener noreferrer"` to external links
- Consider URL validation service (optional)

### 5.4 User Mention Security
- Validate mentioned user IDs exist
- Check permissions (can user mention this user?)
- Prevent self-mention spam (optional rate limiting)
- Sanitize user names in mentions

### 5.5 Content Length Limits
- Max HTML length: 50,000 characters
- Max plain text length: 10,000 characters
- Max images per content: 10
- Max image size: 5MB each

---

## 6. Integration with Existing Forms

### 6.1 TicketForm Component
**File**: `src/components/features/tickets/TicketForm/TicketForm.tsx`

**Changes:**
- Replace `Textarea` for description with `RichTextEditor`
- Update form validation schema
- Handle HTML and plain text extraction
- Update server action to save both fields

**Example:**
```typescript
<RichTextEditor
  label="Description"
  placeholder="Provide detailed information..."
  error={errors.description?.message}
  helperText="Include any relevant details..."
  mentionableUsers={users}
  onImageUpload={handleImageUpload}
  {...register("description")}
/>
```

### 6.2 TicketEditForm Component
**File**: `src/components/features/tickets/TicketEditForm/TicketEditForm.tsx`

**Changes:**
- Replace `Textarea` with `RichTextEditor`
- Load existing HTML content
- Handle updates

### 6.3 TicketCommentForm Component
**File**: `src/components/features/tickets/TicketCommentForm/TicketCommentForm.tsx`

**Changes:**
- Replace `Textarea` with `RichTextEditor`
- Smaller editor (compact mode)
- User mention support (mention agents/admins)
- Image upload support

### 6.4 Display Components

#### Ticket Detail Page
**File**: `src/app/(dashboard)/dashboard/tickets/[id]/page.tsx`

**Changes:**
- Replace plain text display with `RichTextDisplay`
- Render `descriptionHtml` instead of `description`

#### Ticket Comments
**File**: `src/components/features/tickets/TicketCommentsAndActivity/TicketCommentsAndActivity.tsx`

**Changes:**
- Replace `whitespace-pre-wrap` with `RichTextDisplay`
- Render `contentHtml` instead of `content`

---

## 7. Validation Schema Updates

### 7.1 Ticket Validation
**File**: `src/lib/validations/tickets.ts`

```typescript
import { z } from 'zod';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

export const createTicketSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string()
    .max(50000, "Description is too long")
    .transform((html) => sanitizeHtml(html))
    .optional(),
  // ... other fields
});

// Extract plain text for search
export function extractPlainText(html: string): string {
  // Remove HTML tags, decode entities
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}
```

### 7.2 Comment Validation
```typescript
export const commentSchema = z.object({
  content: z.string()
    .min(1, "Comment cannot be empty")
    .max(50000, "Comment is too long")
    .transform((html) => sanitizeHtml(html)),
  isAgentOnly: z.boolean().default(false),
});
```

---

## 8. Server Actions Updates

### 8.1 Create Ticket Action
**File**: `src/server/actions/tickets.ts`

**Changes:**
```typescript
export async function createTicket(input: CreateTicketInput) {
  // ...
  const descriptionHtml = input.description 
    ? sanitizeHtml(input.description) 
    : null;
  const descriptionPlain = descriptionHtml 
    ? extractPlainText(descriptionHtml) 
    : null;
  
  const ticket = await db.ticket.create({
    data: {
      // ...
      descriptionHtml,
      descriptionPlain,
    },
  });
  // ...
}
```

### 8.2 Update Ticket Action
- Similar changes to handle HTML content
- Extract plain text for search

### 8.3 Add Comment Action
```typescript
export async function addTicketComment(
  ticketId: string,
  content: string,
  isAgentOnly: boolean
) {
  const contentHtml = sanitizeHtml(content);
  const contentPlain = extractPlainText(contentHtml);
  
  const comment = await db.ticketComment.create({
    data: {
      ticketId,
      contentHtml,
      contentPlain,
      isAgentOnly,
      // ...
    },
  });
  // ...
}
```

### 8.4 Image Upload Action
**New File**: `src/server/actions/tickets.ts` (add function)

```typescript
export async function uploadTicketImage(
  file: File,
  userId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  // Validate file
  // Save to storage
  // Return URL
}
```

---

## 9. API Routes

### 9.1 Image Upload Endpoint
**File**: `src/app/api/tickets/upload-image/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/utils/auth-server';
import { uploadTicketImage } from '@/server/actions/tickets';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type and size
  // Upload file
  // Return URL

  const result = await uploadTicketImage(file, user.id);
  
  if (result.success) {
    return NextResponse.json({ url: result.url });
  } else {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
}
```

### 9.2 User Mentions Endpoint (Optional)
**File**: `src/app/api/tickets/mentionable-users/route.ts`

```typescript
// GET /api/tickets/mentionable-users
// Returns list of users that can be mentioned
// Filtered by permissions
```

---

## 10. Styling and Theming

### 10.1 Editor Styles
- Match existing design system (Tailwind)
- Dark mode support
- Responsive toolbar
- Smooth transitions

### 10.2 Content Styles
- Typography matches existing prose styles
- Code block styling (monospace, background)
- Quote block styling (left border, italic)
- Link styling (primary color, underline)
- Image styling (responsive, rounded corners)
- User mention styling (highlighted, clickable)

### 10.3 Tailwind Configuration
```typescript
// tailwind.config.ts
// Add prose plugin for rich text content
// Configure code block colors
// Configure quote block styles
```

---

## 11. Accessibility

### 11.1 Keyboard Navigation
- All toolbar buttons keyboard accessible
- Tab navigation through editor
- Keyboard shortcuts for formatting
- Escape to close dialogs

### 11.2 Screen Reader Support
- ARIA labels on all buttons
- Announce format changes
- Describe editor state
- Label toolbar sections

### 11.3 Focus Management
- Focus editor on mount
- Focus management in dialogs
- Visible focus indicators
- Skip links for toolbar

---

## 12. Performance Considerations

### 12.1 Bundle Size
- Lazy load editor component
- Code split TipTap extensions
- Tree shake unused features

### 12.2 Rendering Performance
- Virtualize long content (if needed)
- Lazy load images
- Debounce auto-save (if implemented)
- Memoize editor component

### 12.3 Database Performance
- Index plain text fields for search
- Consider full-text search indexes
- Paginate comments (if many)

---

## 13. Migration Plan

### 13.1 Phase 1: Preparation (Week 1)
1. Install TipTap and dependencies
2. Create database migration (add new fields)
3. Create basic RichTextEditor component
4. Create RichTextDisplay component
5. Set up HTML sanitization

### 13.2 Phase 2: Core Features (Week 2)
1. Implement basic formatting (bold, italic, headings)
2. Implement text colors and highlights
3. Implement links
4. Implement quotes
5. Implement code blocks

### 13.3 Phase 3: Advanced Features (Week 3)
1. Implement image upload
2. Implement user mentions
3. Create image upload API endpoint
4. Test image handling

### 13.4 Phase 4: Integration (Week 4)
1. Integrate with TicketForm
2. Integrate with TicketEditForm
3. Integrate with TicketCommentForm
4. Update display components
5. Update server actions

### 13.5 Phase 5: Migration (Week 5)
1. Create migration script
2. Migrate existing data
3. Test migrated content
4. Update search to use plain text fields

### 13.6 Phase 6: Testing & Polish (Week 6)
1. Comprehensive testing
2. Accessibility audit
3. Performance optimization
4. Documentation
5. User training (if needed)

---

## 14. Testing Strategy

### 14.1 Unit Tests
- HTML sanitization function
- Plain text extraction
- Validation schemas
- Utility functions

### 14.2 Component Tests
- RichTextEditor component
- RichTextDisplay component
- Toolbar interactions
- User mention functionality

### 14.3 Integration Tests
- Form submission with rich text
- Image upload flow
- User mention insertion
- Content rendering

### 14.4 E2E Tests
- Create ticket with rich text
- Edit ticket with rich text
- Add comment with rich text
- View formatted content

---

## 15. Rollback Plan

### 15.1 If Issues Arise
1. Feature flag to disable rich text editor
2. Fallback to plain text editor
3. Display HTML as plain text (strip tags)
4. Database rollback script (if needed)

### 15.2 Feature Flag
```typescript
// Feature flag in environment or database
const RICH_TEXT_EDITOR_ENABLED = process.env.RICH_TEXT_EDITOR_ENABLED === 'true';

// Conditional rendering
{RICH_TEXT_EDITOR_ENABLED ? (
  <RichTextEditor {...props} />
) : (
  <Textarea {...props} />
)}
```

---

## 16. Future Enhancements

### 16.1 Advanced Features
- Tables
- Lists (ordered, unordered)
- Text alignment (left, center, right, justify)
- Undo/redo history
- Collaborative editing (real-time)
- Version history
- Export to PDF
- Import from Word/Google Docs

### 16.2 User Experience
- Auto-save drafts
- Keyboard shortcuts cheatsheet
- Formatting toolbar customization
- Mobile-optimized toolbar
- Drag-and-drop image upload
- Paste image from clipboard

### 16.3 Integration
- Link previews (Open Graph)
- Embed videos (YouTube, Vimeo)
- Embed code snippets (GitHub Gist)
- Math equations (LaTeX)
- Diagrams (Mermaid)

---

## 17. Dependencies

### 17.1 New Dependencies
```json
{
  "@tiptap/react": "^2.1.0",
  "@tiptap/starter-kit": "^2.1.0",
  "@tiptap/extension-text-style": "^2.1.0",
  "@tiptap/extension-color": "^2.1.0",
  "@tiptap/extension-text-align": "^2.1.0",
  "@tiptap/extension-link": "^2.1.0",
  "@tiptap/extension-image": "^2.1.0",
  "@tiptap/extension-blockquote": "^2.1.0",
  "@tiptap/extension-code-block": "^2.1.0",
  "@tiptap/extension-code": "^2.1.0",
  "@tiptap/extension-mention": "^2.1.0",
  "@tiptap/extension-highlight": "^2.1.0",
  "isomorphic-dompurify": "^2.9.0"
}
```

### 17.2 Optional Dependencies
```json
{
  "prismjs": "^1.29.0", // Syntax highlighting
  "@types/prismjs": "^1.26.0"
}
```

---

## 18. File Structure Summary

```
src/
├── app/
│   └── api/
│       └── tickets/
│           └── upload-image/
│               └── route.ts
│
├── components/
│   ├── ui/
│   │   └── RichTextEditor/
│   │       ├── RichTextEditor.tsx
│   │       ├── RichTextEditor.types.ts
│   │       ├── RichTextEditorToolbar.tsx
│   │       ├── RichTextEditorContent.tsx
│   │       ├── RichTextEditorMentionList.tsx
│   │       └── index.ts
│   │
│   └── features/
│       └── tickets/
│           ├── RichTextDisplay/
│           │   ├── RichTextDisplay.tsx
│           │   ├── RichTextDisplay.types.ts
│           │   └── index.ts
│           ├── TicketForm/ (updated)
│           ├── TicketEditForm/ (updated)
│           └── TicketCommentForm/ (updated)
│
├── lib/
│   ├── utils/
│   │   ├── rich-text.ts
│   │   └── html-sanitizer.ts
│   └── hooks/
│       └── useRichTextEditor.ts
│
└── server/
    └── actions/
        └── tickets.ts (updated)
```

---

## 19. Key Design Decisions

### 19.1 HTML vs JSON Storage
- **Decision**: Store HTML with plain text for search
- **Rationale**: Easier to render, simpler migration, sufficient for needs

### 19.2 TipTap vs Other Libraries
- **Decision**: TipTap
- **Rationale**: Best balance of features, TypeScript support, and community

### 19.3 Image Storage
- **Decision**: File system for MVP, cloud storage for production
- **Rationale**: Simpler for initial implementation, scalable for production

### 19.4 Sanitization Library
- **Decision**: DOMPurify (isomorphic-dompurify)
- **Rationale**: Industry standard, works server-side and client-side

### 19.5 Migration Strategy
- **Decision**: Additive migration (add fields, migrate, then remove old)
- **Rationale**: Non-breaking, allows gradual rollout, easy rollback

---

## 20. Success Criteria

### 20.1 Functional Requirements
- ✅ All formatting options work (bold, italic, colors, etc.)
- ✅ Images can be uploaded and displayed
- ✅ Links work correctly
- ✅ User mentions function properly
- ✅ Code blocks render correctly
- ✅ Quotes display with proper styling

### 20.2 Non-Functional Requirements
- ✅ Content is sanitized and secure
- ✅ Editor is accessible (keyboard, screen readers)
- ✅ Performance is acceptable (< 3s load time)
- ✅ Mobile responsive
- ✅ Dark mode support
- ✅ Existing content migrates correctly

### 20.3 User Experience
- ✅ Editor is intuitive to use
- ✅ Toolbar is clear and organized
- ✅ Formatting is visually consistent
- ✅ Content displays correctly on all pages

---

This plan provides a comprehensive roadmap for implementing the rich text editor feature. Each phase builds upon the previous one, allowing for incremental development and testing.
