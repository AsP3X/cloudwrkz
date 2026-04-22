import React from "react";
import { cn } from "@/lib/utils/cn";
import { sanitizeHtml } from "@/lib/utils/html-sanitizer";

// Human: React UI for `RichTextDisplay` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS RichTextDisplay; REACT component; READS props hooks; MAY CALL api client.
export interface RichTextDisplayProps {
  content: string;
  className?: string;
  maxHeight?: string | number;
}

/**
 * Heuristically detect if the incoming content is plain text (no HTML tags).
 * Preserves line breaks and paragraphs for plain text; otherwise treats as HTML.
 */
function isLikelyPlainText(content: string): boolean {
  return !/<[a-zA-Z!/][^>]*>/.test(content);
}

/**
 * Convert plain text into minimal HTML that preserves formatting:
 * - Escape HTML-sensitive characters
 * - Treat blank lines as paragraph breaks
 * - Convert single newlines within a paragraph to <br />
 */
function plainTextToHtml(content: string): string {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => {
      const withLineBreaks = block.trim().replace(/\n/g, "<br />");
      return withLineBreaks ? `<p>${withLineBreaks}</p>` : "";
    })
    .filter(Boolean);

  return paragraphs.length ? paragraphs.join("") : "<p></p>";
}

/**
 * Renders ticket description with proper formatting:
 * - Plain text: escaped, paragraphs (double newline), line breaks (single newline), then sanitized
 * - HTML: sanitized and rendered with prose styles (headings, lists, links, blockquote, code, etc.)
 */
export function RichTextDisplay({ content, className, maxHeight }: RichTextDisplayProps) {
  if (!content) {
    return (
      <p className="text-neutral-500 dark:text-neutral-500 italic">No content provided.</p>
    );
  }

  const htmlContent = isLikelyPlainText(content) ? plainTextToHtml(content) : content;
  const sanitized = sanitizeHtml(htmlContent);

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words",
        "prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100",
        "prose-p:text-neutral-700 dark:prose-p:text-neutral-300 prose-p:my-2",
        "prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100",
        "prose-code:text-neutral-900 dark:prose-code:text-neutral-100 prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800 prose-code:px-1 prose-code:rounded",
        "prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-neutral-900 dark:prose-pre:text-neutral-100 prose-pre:p-4 prose-pre:rounded-lg",
        "prose-blockquote:border-l-4 prose-blockquote:border-l-primary-500",
        "prose-blockquote:pl-4 prose-blockquote:pr-4 prose-blockquote:py-3",
        "prose-blockquote:my-4 prose-blockquote:bg-neutral-100 dark:prose-blockquote:bg-neutral-800/50",
        "prose-blockquote:text-neutral-700 dark:prose-blockquote:text-neutral-300",
        "prose-blockquote:italic prose-blockquote:rounded-r",
        "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline hover:prose-a:underline",
        "prose-ul:list-disc prose-ol:list-decimal prose-li:my-0.5",
        "prose-li:marker:text-neutral-500 dark:prose-li:marker:text-neutral-400",
        "prose-p:break-words prose-p:whitespace-normal",
        className
      )}
      style={maxHeight ? { maxHeight, overflowY: "auto" } as React.CSSProperties : undefined}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
