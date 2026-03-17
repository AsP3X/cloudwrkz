# Export Links Dialog – Improvement Plan

This plan covers improvements that are **not yet implemented** for the export link dialogs (`ExportLinksDialog` and `BulkExportLinksDialog`). Items are ordered by suggested priority and include scope, dependencies, and implementation notes.

---

## 1. Preset filters / segments (in-dialog)

**Goal:** Let users quickly choose common export scopes without leaving the dialog.

**Scope:**
- Add a “Scope” or “What to export” section in the main Export dialog (page-level export, not bulk).
- Presets (examples):
  - **All in this view** (current behavior; default when a collection is selected or “All links”).
  - **Only active** (exclude archived) – already implied by current filters; could be explicit.
  - **Include archived** – toggle to also load/export archived links in this view.
  - **Last 30 / 90 days** – optional date-range filter (e.g. `createdAt >= now - 30 days`).

**Dependencies:**
- `getLinks` already supports `archived` and date filtering would require extending `LinkFilters` (e.g. `createdAfter`, `createdBefore` or `dateRange`).
- UI: radio group or segmented control for presets; optional date picker for “Last N days”.

**Files to touch:**
- `src/components/features/links/ExportLinksDialog/ExportLinksDialog.tsx`
- `src/server/actions/links.ts` (optional new filter params)
- `src/app/(dashboard)/dashboard/links/LinksPageClient.tsx` (pass any new filter state if needed)

**Notes:**
- Bulk export dialog already has a fixed set (selected links); presets apply only to the main “Export…” dialog that loads links by view/filters.

---

## 2. Column / fields selector

**Goal:** Let users choose which fields (columns) to include in the export (e.g. minimal set vs full data).

**Scope:**
- Define a fixed set of exportable fields: e.g. `title`, `url`, `description`, `linkType`, `tags`, `notes`, `isFavorite`, `rating`, `createdAt`, `updatedAt`, `collectionNames` (and for JSON, `collections` with name/color).
- UI: checkboxes or a “Fields to include” section with presets:
  - **Minimal:** title, url, createdAt (and optionally collection names).
  - **Full:** all fields (current behavior).
  - **Custom:** user toggles individual fields.
- Server: accept an optional list of field keys and only include those in JSON/CSV output.

**Dependencies:**
- Server action signature change: e.g. `exportSelectedLinks(linkIds, format, { includeCollections, fields?: string[] })` and similarly for any filter-based export that returns custom columns.
- CSV header row and JSON object keys must be driven by the selected fields.

**Files to touch:**
- `src/server/actions/links.ts` – `exportSelectedLinks`, and optionally `exportLinks` if we add field selection to the full-export path.
- `src/components/features/links/ExportLinksDialog/ExportLinksDialog.tsx`
- `src/components/features/links/BulkExportLinksDialog/BulkExportLinksDialog.tsx`
- Shared constant or type for allowed export field keys (e.g. `src/lib/constants/links.ts` or a new `export-fields.ts`).

**Notes:**
- Keep backward compatibility: when `fields` is absent, export all current fields (full).

---

## 3. Progress and async / large exports

**Goal:** For large exports, show clear progress and optionally support background processing with a download link (e.g. email or in-app).

**Scope:**
- **Option A (simpler):** In-dialog progress: show a determinate or indeterminate progress indicator and “Preparing export…” while the server builds the file; disable primary button and show a spinner. Already partially there; ensure all code paths show this and that the dialog does not close until the download starts or an error is shown.
- **Option B (advanced):** For exports above a threshold (e.g. > 500 or > 1000 links), offer “Export in background” – job is queued, user gets a success message with “We’ll email you a download link” or “Check Export history below.” Requires:
  - Export job queue (e.g. DB table or Redis + worker).
  - File storage (e.g. S3 or local uploads) and short-lived download URLs.
  - Email or in-app notification with the link.
  - Optional “Export history” UI to list recent exports and re-download.

**Dependencies:**
- Option B: job queue, storage, email/notifications, and possibly auth for download URLs.

**Files to touch (Option A):**
- Both export dialogs: ensure consistent loading/disabled state and aria-live or status text for screen readers.
- Option B: new server actions, queue, storage, and UI for history (see also item 6).

**Notes:**
- Start with Option A; add Option B only if product requires large exports and async delivery.

---

## 4. Error handling and “technical details” toggle

**Goal:** Show a user-friendly message by default, with an optional expandable “Technical details” section for support/debugging.

**Scope:**
- When export fails, display a short, human-readable message (e.g. “Export failed. Please try again or choose fewer links.”).
- Add a control (e.g. “Show technical details”) that expands to show:
  - The raw `result.error` or caught error message.
  - Optional: error code or request id if the server provides one.
- Ensure the error region has `role="alert"` and is announced to screen readers.

**Dependencies:**
- None beyond current server action error return shape.

**Files to touch:**
- `src/components/features/links/ExportLinksDialog/ExportLinksDialog.tsx`
- `src/components/features/links/BulkExportLinksDialog/BulkExportLinksDialog.tsx`

**Notes:**
- Reuse the same pattern for any other dialogs that show server errors (e.g. import dialog).

---

## 5. Data privacy / PII hint and sensitive-field options

**Goal:** Remind users that exported data may contain personal information and, optionally, allow excluding sensitive fields.

**Scope:**
- Add a short, subtle note in the export dialog (e.g. below the summary or in the footer): “Exported data may contain personal information. Share and store files responsibly.”
- Optional: a “Sensitive fields” subsection that lists fields that might contain PII (e.g. `notes`, `description`) and lets the user exclude them from this export (could be implemented as part of the column selector in item 2, with a “Exclude sensitive fields” preset that unchecks notes/description).

**Dependencies:**
- If implemented only as copy, no backend change. If tied to column selector, same as item 2.

**Files to touch:**
- Both export dialog components.
- If excluding sensitive fields: same as item 2 (server + shared field config).

---

## 6. Export history and re-download

**Goal:** Allow users to see recent exports and re-download files (e.g. last 5 or 10).

**Scope:**
- **Backend:** Store a minimal “export record” when an export is generated (e.g. userId, timestamp, format, filters or link count, file storage key or blob reference). Optional: short-lived download URL or re-generate on demand.
- **UI:** “Export history” section in the dialog or a separate page/section: list of recent exports (date, format, scope/count) with a “Download again” action. If files are not stored, “Download again” could re-run the same export (same filters/selection) if that’s feasible.

**Dependencies:**
- Storage for export metadata (and optionally for file blobs); retention policy (e.g. delete after 7 days). Auth and permission checks for download.

**Files to touch:**
- New or existing API/actions for creating and listing export records and serving download.
- Export dialogs or a dedicated “Export history” component/page.

**Notes:**
- Can be deferred until async/large export (item 3 Option B) is in place, since that’s when server-side file storage is introduced.

---

## 7. Keyboard and accessibility (beyond current Dialog)

**Goal:** Ensure full keyboard navigation and clear semantics for the export flow.

**Scope:**
- Confirm Dialog component already provides: focus trap, Escape to close, and Enter submitting the primary action (or document why not).
- Ensure “Export” is the visible primary action and “Cancel” is secondary (already the case).
- Add or verify: `aria-describedby` pointing to the dialog description; `aria-labelledby` for the title; `aria-busy` on the content area when loading or exporting (partially done for loading).
- Ensure format toggle (JSON/CSV) and any new controls (presets, column selector) are keyboard-focusable and operable (Enter/Space), and that the selected format has `aria-pressed` or equivalent.

**Dependencies:**
- Review existing `Dialog` and form components; no new backend.

**Files to touch:**
- `src/components/ui/Dialog.tsx` (if shared)
- `src/components/features/links/ExportLinksDialog/ExportLinksDialog.tsx`
- `src/components/features/links/BulkExportLinksDialog/BulkExportLinksDialog.tsx`

---

## Implementation order (suggested)

| Order | Item | Rationale |
|-------|------|-----------|
| 1 | **4. Error details toggle** | Small, no backend; improves support and trust. |
| 2 | **7. Keyboard / accessibility** | Quick audit and small tweaks; better for everyone. |
| 3 | **5. Data privacy hint** | Copy-only first; optional tie-in to fields later. |
| 4 | **2. Column / fields selector** | High value; needs API and shared field list. |
| 5 | **1. Preset filters** | Improves main export dialog; may need small filter API extension. |
| 6 | **3. Progress (Option A)** | Polish; then Option B only if product needs it. |
| 7 | **6. Export history** | Best after async/large export (3B) if that’s implemented. |

---

## Summary table

| # | Improvement | Implemented | Priority |
|---|-------------|-------------|----------|
| 1 | Preset filters / segments | No | Medium |
| 2 | Column / fields selector | No | High |
| 3 | Progress and async / large exports | No (Option A partial) | Medium (A) / Later (B) |
| 4 | Error “technical details” toggle | No | High |
| 5 | Data privacy / PII hint | No | Medium |
| 6 | Export history and re-download | No | Low (after 3B) |
| 7 | Keyboard and accessibility | Partially | High |

This plan is the single source of truth for “not yet implemented” export dialog improvements. Update the table and sections as items are completed or deprioritized.
