"use client";

import React from "react";
import { sanitizeHtml } from "@/lib/utils/rich-text";
import { cn } from "@/lib/utils/cn";
import type { RichTextDisplayProps } from "./RichTextDisplay.types";

export const RichTextDisplay = ({ content, className, maxHeight }: RichTextDisplayProps) => {
  if (!content) {
    return (
      <p className="text-neutral-500 dark:text-neutral-500 italic">No content provided.</p>
    );
  }

  const sanitizedContent = sanitizeHtml(content);

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
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
        "prose-a:text-primary-600 dark:prose-a:text-primary-400 prose-a:underline",
        "prose-img:rounded-lg prose-img:max-w-full prose-img:h-auto",
        "prose-ul:list-disc prose-ol:list-decimal",
        "prose-li:marker:text-neutral-500 dark:prose-li:marker:text-neutral-400",
        className
      )}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};
