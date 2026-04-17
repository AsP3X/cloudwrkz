# Link detail page headlines (title display)

Saved links sometimes store a **title** string that mixes the site title with a description (for example GitHub’s HTML `<title>`: `GitHub - owner/repo: …long description…`). The **link detail** screens use a shared helper so the main heading shows a **short, readable title** instead of that combined string.

## Where it lives

| App | Helper | Used on |
| --- | --- | --- |
| **Vite** (`apps/web-vite`) | `getLinkDetailHeadlineTitle` in `src/lib/utils/links.ts` | `LinkDetailPage` → `LinkDetailPageHeader` |
| **Next.js** (`apps/web`) | Same function name in `src/lib/utils/links.ts` | `LinkDetailContent` (view mode only; edit mode keeps the raw stored title to match the form) |

## Rules (summary)

1. **GitHub repo URLs**: If the stored title matches `GitHub - owner/repo: …` (flexible dash, case-insensitive prefix) for the same `owner/repo` as the link URL, the headline is **`owner/repo`** only.
2. **Metadata split**: If `metadata.title` and `metadata.description` exist and the stored title equals them joined with common separators (newlines, ` — `, ` | `, etc.), the headline uses **`metadata.title`** only.
3. **Description suffix**: If the stored title ends with the plain-text form of the saved description (length ≥ 24 characters), that suffix is stripped for the headline.

Custom titles that do not match these patterns are shown as stored.

## API

The API still returns `links.title` unchanged; normalization is **display-only** on the clients above.
