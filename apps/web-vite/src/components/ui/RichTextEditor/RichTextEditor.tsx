// Human: TipTap-based rich text control with toolbar, image upload hook, HTML/plain output on change, and guarded external `value` syncing to avoid cursor jumps.
// Agent: useEditor with StarterKit, Link, Image, CodeBlock, Highlight, Placeholder; onUpdate CALLS onChange(html, plain); EFFECT setContent when controlled value diverges.
import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlock from "@tiptap/extension-code-block";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils/cn";
import { extractPlainText } from "@/lib/utils/html-sanitizer";
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
      showToolbar = true,
      onImageUpload,
      className,
      name,
    },
    ref
  ) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: false,
        }),
        Link.configure({
          openOnClick: true,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
            class: "text-primary-600 dark:text-primary-400 underline",
          },
        }),
        Image.configure({
          inline: true,
          HTMLAttributes: { class: "max-w-full h-auto rounded-lg" },
        }),
        CodeBlock,
        Highlight.configure({
          multicolor: false,
          HTMLAttributes: { class: "bg-yellow-200 dark:bg-yellow-900/50 rounded px-0.5" },
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass: "is-editor-empty",
          showOnlyWhenEditable: true,
        }),
      ],
      content: value || null,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChange(html, extractPlainText(html));
      },
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm max-w-none focus:outline-none dark:prose-invert",
            "min-h-[100px] p-4 rounded-b-lg",
            "text-neutral-900 dark:text-neutral-100"
          ),
          "data-placeholder": placeholder,
        },
      },
    });

    // Human: External `value` updates (for example after save or reset) should replace editor content, but we skip redundant sets when both sides normalize to empty or equivalent HTML.
    // Agent: READS value, editor; CALLS clearContent or setContent only on normalized mismatch.
    React.useEffect(() => {
      if (!editor) return;
      const current = editor.getHTML();
      const normalized = !value || value.trim() === "" || value === "<p></p>" ? "" : value;
      const currentNorm = !current || current.trim() === "" || current === "<p></p>" ? "" : current;
      if (normalized !== currentNorm) {
        if (!normalized) editor.commands.clearContent();
        else editor.commands.setContent(value);
      }
    }, [value, editor]);

    const handleImageUploadClick = React.useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const handleImageFile = React.useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !onImageUpload || !editor) return;
        try {
          const url = await onImageUpload(file);
          editor.chain().focus().setImage({ src: url }).run();
        } catch {
          // Caller may show error
        }
      },
      [onImageUpload, editor]
    );

    return (
      <div ref={ref} className={cn("space-y-1", className)}>
        {label && (
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {label}
            {required && <span className="text-error-500 ml-0.5">*</span>}
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
          style={{ minHeight }}
        >
          {showToolbar && (
            <RichTextEditorToolbar
              editor={editor}
              onImageUpload={onImageUpload ? handleImageUploadClick : undefined}
            />
          )}
          <EditorContent
            editor={editor}
            className={cn(
              "overflow-y-auto",
              !showToolbar && "rounded-lg",
              showToolbar && "rounded-b-lg"
            )}
          />
        </div>
        {onImageUpload && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden
            onChange={handleImageFile}
          />
        )}
        {error && (
          <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{helperText}</p>
        )}
        {name && value && <input type="hidden" name={name} value={value} />}
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
