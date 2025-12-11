"use client";

import React from "react";
import { useEditor } from "@tiptap/react";
import { cn } from "@/lib/utils/cn";

interface RichTextEditorToolbarProps {
  editor: ReturnType<typeof useEditor> | null;
  onImageUpload?: () => void;
  onLinkAdd?: () => void;
}

// Predefined color palettes
const TEXT_COLORS = [
  { name: "Default", value: null },
  { name: "Black", value: "#000000" },
  { name: "Gray", value: "#6B7280" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F97316" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Green", value: "#22C55E" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Purple", value: "#A855F7" },
  { name: "Pink", value: "#EC4899" },
];

const HIGHLIGHT_COLORS = [
  { name: "None", value: null },
  { name: "Yellow", value: "#FEF08A" },
  { name: "Green", value: "#BBF7D0" },
  { name: "Blue", value: "#BFDBFE" },
  { name: "Pink", value: "#FCE7F3" },
  { name: "Orange", value: "#FED7AA" },
  { name: "Purple", value: "#E9D5FF" },
  { name: "Red", value: "#FECACA" },
];

export const RichTextEditorToolbar = ({
  editor,
  onImageUpload,
  onLinkAdd,
}: RichTextEditorToolbarProps) => {
  if (!editor) return null;

  const [textColorOpen, setTextColorOpen] = React.useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = React.useState(false);
  const textColorRef = React.useRef<HTMLDivElement>(null);
  const highlightColorRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (textColorRef.current && !textColorRef.current.contains(event.target as Node)) {
        setTextColorOpen(false);
      }
      if (highlightColorRef.current && !highlightColorRef.current.contains(event.target as Node)) {
        setHighlightColorOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get current text color
  const currentTextColor = editor.getAttributes("textStyle").color || null;

  // Get current highlight color
  const currentHighlightColor = editor.getAttributes("highlight").color || null;

  const ToolbarButton = ({
    onClick,
    isActive = false,
    disabled = false,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isActive && "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 rounded-t-lg">
      {/* Text Formatting */}
      <div className="flex items-center gap-1 border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Text Color */}
      <div className="relative border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2" ref={textColorRef}>
        <ToolbarButton
          onClick={() => setTextColorOpen(!textColorOpen)}
          isActive={!!currentTextColor}
          title="Text Color"
        >
          <div className="relative">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            {currentTextColor && (
              <div
                className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white dark:border-neutral-800"
                style={{ backgroundColor: currentTextColor }}
              />
            )}
          </div>
        </ToolbarButton>
        {textColorOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px]">
            <div className="grid grid-cols-4 gap-2">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => {
                    if (color.value) {
                      editor.chain().focus().setColor(color.value).run();
                    } else {
                      editor.chain().focus().unsetColor().run();
                    }
                    setTextColorOpen(false);
                  }}
                  className={cn(
                    "w-8 h-8 rounded border-2 transition-all hover:scale-110",
                    color.value === null
                      ? "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 flex items-center justify-center"
                      : "border-transparent",
                    currentTextColor === color.value && "ring-2 ring-primary-500 ring-offset-1"
                  )}
                  style={color.value ? { backgroundColor: color.value } : undefined}
                  title={color.name}
                >
                  {color.value === null && (
                    <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Highlight Color */}
      <div className="relative border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2" ref={highlightColorRef}>
        <ToolbarButton
          onClick={() => setHighlightColorOpen(!highlightColorOpen)}
          isActive={!!currentHighlightColor}
          title="Highlight Color"
        >
          <div className="relative">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {currentHighlightColor && (
              <div
                className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white dark:border-neutral-800"
                style={{ backgroundColor: currentHighlightColor }}
              />
            )}
          </div>
        </ToolbarButton>
        {highlightColorOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px]">
            <div className="grid grid-cols-4 gap-2">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => {
                    if (color.value) {
                      editor.chain().focus().toggleHighlight({ color: color.value }).run();
                    } else {
                      editor.chain().focus().unsetHighlight().run();
                    }
                    setHighlightColorOpen(false);
                  }}
                  className={cn(
                    "w-8 h-8 rounded border-2 transition-all hover:scale-110",
                    color.value === null
                      ? "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 flex items-center justify-center"
                      : "border-transparent",
                    currentHighlightColor === color.value && "ring-2 ring-primary-500 ring-offset-1"
                  )}
                  style={color.value ? { backgroundColor: color.value } : undefined}
                  title={color.name}
                >
                  {color.value === null && (
                    <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Headings */}
      <div className="flex items-center gap-1 border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <span className="text-sm font-bold">H1</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <span className="text-sm font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <span className="text-sm font-bold">H3</span>
        </ToolbarButton>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1 border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Numbered List"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Block Elements */}
      <div className="flex items-center gap-1 border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="Quote"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Code Block"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Links and Images */}
      <div className="flex items-center gap-1 border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2">
        <ToolbarButton
          onClick={onLinkAdd || (() => {
            const url = window.prompt("Enter URL:");
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          })}
          isActive={editor.isActive("link")}
          title="Add Link"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>
        {onImageUpload && (
          <ToolbarButton
            onClick={onImageUpload}
            title="Upload Image"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </ToolbarButton>
        )}
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </ToolbarButton>
      </div>
    </div>
  );
};
