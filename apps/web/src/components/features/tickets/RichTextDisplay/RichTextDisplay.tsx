"use client";

import React from "react";
import { sanitizeHtml } from "@/lib/utils/rich-text";
import { cn } from "@/lib/utils/cn";
import type { RichTextDisplayProps } from "./RichTextDisplay.types";

/**
 * Heuristically detect if the incoming content is plain text (no HTML tags).
 * This lets us preserve line breaks and paragraphs for ticket descriptions
 * that were stored as plain text instead of rich HTML.
 */
const isLikelyPlainText = (content: string): boolean => {
  // If we see any HTML-looking tag structure, treat it as HTML
  return !/<[a-zA-Z!/][^>]*>/.test(content);
};

/**
 * Convert plain text into minimal HTML that preserves formatting:
 * - Escape any HTML-sensitive characters
 * - Treat blank lines as paragraph breaks
 * - Convert single newlines within a paragraph to <br />
 */
const plainTextToHtml = (content: string): string => {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paragraphs = escaped
    .split(/\n{2,}/) // two or more newlines = new paragraph
    .map((block) => {
      const withLineBreaks = block.replace(/\n/g, "<br />");
      return `<p>${withLineBreaks}</p>`;
    })
    .filter((p) => p !== "<p></p>");

  return paragraphs.join("");
};

export const RichTextDisplay = ({ content, className, maxHeight }: RichTextDisplayProps) => {
  if (!content) {
    return (
      <p className="text-neutral-500 dark:text-neutral-500 italic">No content provided.</p>
    );
  }

  const htmlLikeContent = isLikelyPlainText(content) ? plainTextToHtml(content) : content;
  const sanitizedContent = sanitizeHtml(htmlLikeContent);

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words",
        "prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100",
        "prose-p:text-neutral-700 dark:prose-p:text-neutral-300",
        "prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100",
        "prose-code:text-neutral-900 dark:prose-code:text-neutral-100",
        "prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-neutral-900 dark:prose-pre:text-neutral-100",
        "prose-blockquote:border-l-4 prose-blockquote:border-l-primary-500",
        "prose-blockquote:pl-4 prose-blockquote:pr-4 prose-blockquote:py-3",
        "prose-blockquote:my-4 prose-blockquote:bg-neutral-100 dark:prose-blockquote:bg-neutral-800/50",
        "prose-blockquote:text-neutral-700 dark:prose-blockquote:text-neutral-300",
        "prose-blockquote:italic",
        "prose-blockquote:rounded-r",
        "prose-blockquote:border-primary-500",
        // Links: blue text and pointer cursor
        "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline",
        "prose-a:cursor-pointer hover:prose-a:underline",
        "prose-img:rounded-lg prose-img:max-w-full prose-img:h-auto",
        "prose-ul:list-disc prose-ol:list-decimal",
        "prose-li:marker:text-neutral-500 dark:prose-li:marker:text-neutral-400",
        // Ensure text doesn't get truncated
        "prose-p:break-words prose-p:whitespace-normal",
        className
      )}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};
