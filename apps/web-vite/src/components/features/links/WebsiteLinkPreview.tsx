import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { WebsitePreviewFields } from "@/lib/utils/linkMetadata";

// Human: Rich card on the link detail page showing scraped Open Graph / Twitter / page fields from the target site.
// Agent: PRESENTATIONAL; READS WebsitePreviewFields; RENDERS image headline meta grid; external links open new tab.

interface WebsiteLinkPreviewProps {
  preview: WebsitePreviewFields;
  pageUrl: string;
  className?: string;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <div className="text-sm text-neutral-800 dark:text-neutral-200 min-w-0">{children}</div>
    </div>
  );
}

export function WebsiteLinkPreview({ preview, pageUrl, className }: WebsiteLinkPreviewProps) {
  const headline = preview.headline ?? pageUrl;

  return (
    <section
      className={cn(
        "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden",
        className,
      )}
      aria-labelledby="website-preview-heading"
    >
      <div className="px-6 sm:px-8 py-5 border-b border-neutral-200 dark:border-neutral-800">
        <h2
          id="website-preview-heading"
          className="text-xl font-bold text-neutral-900 dark:text-neutral-100"
        >
          From the website
        </h2>
        {preview.siteName && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{preview.siteName}</p>
        )}
      </div>

      <div className="p-6 sm:p-8">
        {preview.screenshotUrl && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              Page preview
            </p>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* Human: Show the full capture at its aspect ratio; object-cover + max-height cropped most of the PNG. */}
              {/* Agent: w-full h-auto; NO object-cover; SCALES to card width; SHOWS entire screenshot file. */}
              <img
                src={preview.screenshotUrl}
                alt="Screenshot of the linked website"
                className="w-full h-auto max-w-full rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </a>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {preview.imageUrl && !preview.screenshotUrl && (
            <a
              href={preview.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 block lg:w-72"
            >
              <img
                src={preview.imageUrl}
                alt=""
                className="w-full max-h-56 lg:max-h-72 object-cover rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </a>
          )}
          {preview.imageUrl && preview.screenshotUrl && (
            <a
              href={preview.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 block lg:w-40"
            >
              <img
                src={preview.imageUrl}
                alt="Social preview image"
                className="w-full max-h-32 object-cover rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </a>
          )}

          <div className="flex-1 min-w-0 space-y-3">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 break-words">
              {headline}
            </h3>
            {preview.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                {preview.description}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {preview.ogType && (
                <Badge className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200">
                  {preview.ogType}
                </Badge>
              )}
              {preview.twitterCard && (
                <Badge className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                  Twitter: {preview.twitterCard}
                </Badge>
              )}
              {preview.language && (
                <Badge className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                  {preview.language}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-4 py-2">
          <MetaRow label="Page URL">
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:underline break-all"
            >
              {pageUrl}
            </a>
          </MetaRow>
          {preview.canonicalUrl && preview.canonicalUrl !== pageUrl && (
            <MetaRow label="Canonical">
              <a
                href={preview.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline break-all"
              >
                {preview.canonicalUrl}
              </a>
            </MetaRow>
          )}
          {preview.author && <MetaRow label="Author">{preview.author}</MetaRow>}
          {preview.keywords && (
            <MetaRow label="Keywords">
              <div className="flex flex-wrap gap-1.5">
                {preview.keywords.split(",").map((k) => k.trim()).filter(Boolean).map((kw) => (
                  <Badge key={kw} className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
            </MetaRow>
          )}
          {preview.themeColor && (
            <MetaRow label="Theme">
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded border border-neutral-300 dark:border-neutral-600"
                  style={{ backgroundColor: preview.themeColor }}
                  aria-hidden
                />
                <span className="font-mono text-xs">{preview.themeColor}</span>
              </span>
            </MetaRow>
          )}
        </div>
      </div>
    </section>
  );
}
