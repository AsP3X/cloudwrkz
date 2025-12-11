"use client";

import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Blockquote from "@tiptap/extension-blockquote";
import CodeBlock from "@tiptap/extension-code-block";
import Code from "@tiptap/extension-code";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils/cn";
import { extractPlainText } from "@/lib/utils/rich-text";
import { RichTextEditorToolbar } from "./RichTextEditorToolbar";
import type { RichTextEditorProps } from "./RichTextEditor.types";

export const RichTextEditor = React.forwardRef<HTMLDivElement, RichTextEditorProps>(
  (
    {
      value,
      onChange,
      placeholder = "Start typing...",
      error,
      helperText,
      label,
      required,
      disabled = false,
      minHeight = "200px",
      maxHeight,
      showToolbar = true,
      mentionableUsers = [],
      onImageUpload,
      className,
      name,
    },
    ref
  ) => {
    const [isImageUploading, setIsImageUploading] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
        }),
        Image.configure({
          inline: true,
          allowBase64: false,
          HTMLAttributes: {
            class: "max-w-full h-auto rounded-lg",
          },
        }),
        Blockquote,
        CodeBlock,
        Code,
        Highlight,
        Color,
        TextStyle,
        Placeholder.configure({
          placeholder,
          emptyEditorClass: "is-editor-empty",
          showOnlyWhenEditable: true,
          showOnlyCurrent: false,
        }),
      ],
      content: value || null,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        const plainText = extractPlainText(html);
        onChange(html, plainText);
      },
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm max-w-none focus:outline-none",
            "prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100",
            "prose-p:text-neutral-700 dark:prose-p:text-neutral-300",
            "prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100",
            "prose-code:text-neutral-900 dark:prose-code:text-neutral-100",
            "prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800",
            "prose-blockquote:border-l-primary-500",
            "prose-a:text-primary-600 dark:prose-a:text-primary-400",
            "min-h-[100px] p-4"
          ),
          "data-placeholder": placeholder,
        },
      },
    });

    // Update editor content when value prop changes
    React.useEffect(() => {
      if (editor && value !== editor.getHTML()) {
        // Use empty string or null to ensure editor is truly empty
        if (!value || value.trim() === "" || value === "<p></p>") {
          editor.commands.clearContent();
        } else {
          editor.commands.setContent(value);
        }
      }
    }, [value, editor]);

    // Ensure editor only renders on client side
    const [isMounted, setIsMounted] = React.useState(false);
    React.useEffect(() => {
      setIsMounted(true);
    }, []);

    const handleImageUpload = React.useCallback(async () => {
      if (!onImageUpload || !editor) return;

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert("Image size must be less than 5MB");
          return;
        }

        // Validate file type
        if (!file.type.startsWith("image/")) {
          alert("Please select an image file");
          return;
        }

        try {
          setIsImageUploading(true);
          const url = await onImageUpload(file);
          editor.chain().focus().setImage({ src: url }).run();
        } catch (error) {
          console.error("Image upload error:", error);
          alert("Failed to upload image. Please try again.");
        } finally {
          setIsImageUploading(false);
        }
      };
      input.click();
    }, [onImageUpload, editor]);

    const handleLinkAdd = React.useCallback(() => {
      if (!editor) return;

      const url = window.prompt("Enter URL:");
      if (url) {
        editor.chain().focus().setLink({ href: url, target: "_blank" }).run();
      }
    }, [editor]);

    // Use a counter-based ID to avoid hydration mismatches with Math.random()
    const editorIdRef = React.useRef<string | null>(null);
    const editorId = React.useMemo(() => {
      if (name) return `rich-text-editor-${name}`;
      // Generate ID only on client side to avoid hydration mismatch
      if (typeof window === "undefined") {
        return `rich-text-editor-placeholder`;
      }
      if (!editorIdRef.current) {
        // Use a combination of timestamp and a counter to ensure uniqueness
        editorIdRef.current = `rich-text-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      return editorIdRef.current;
    }, [name]);

    return (
      <div ref={ref} className={cn("w-full", className)}>
        {label && (
          <label
            htmlFor={editorId}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            {label}
            {required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <div
          className={cn(
            "rounded-lg border-2 transition-all duration-200",
            "focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900",
            error
              ? "border-error-300 dark:border-error-700 bg-error-50 dark:bg-error-900/20"
              : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{ minHeight, maxHeight }}
        >
          {isMounted && (
            <>
              {showToolbar && (
                <RichTextEditorToolbar
                  editor={editor}
                  onImageUpload={handleImageUpload}
                  onLinkAdd={handleLinkAdd}
                />
              )}
              <EditorContent
                editor={editor}
                className={cn(
                  "overflow-y-auto",
                  !showToolbar && "rounded-lg",
                  showToolbar && "rounded-b-lg"
                )}
                style={{ maxHeight: maxHeight || "400px" }}
              />
            </>
          )}
          {!isMounted && (
            <div
              className={cn(
                "overflow-y-auto p-4 min-h-[100px]",
                !showToolbar && "rounded-lg",
                showToolbar && "rounded-b-lg"
              )}
              style={{ maxHeight: maxHeight || "400px" }}
            >
              <p className="text-neutral-400 dark:text-neutral-500">{placeholder}</p>
            </div>
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-error-600 dark:text-error-400 flex items-center gap-1">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {helperText}
          </p>
        )}
        <input type="hidden" name={name} value={value || ""} />
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
