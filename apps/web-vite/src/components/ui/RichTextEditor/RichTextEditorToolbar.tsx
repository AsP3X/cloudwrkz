// Human: TipTap formatting controls; toolbar buttons use `mousedown` prevention so clicking a control does not steal focus from the editor before commands run.
// Agent: READS editor instance; CALLS editor.chain commands; STATE highlightColorOpen with outside-click close.
import React from "react";
import { useEditor } from "@tiptap/react";
import { cn } from "@/lib/utils/cn";

interface RichTextEditorToolbarProps {
  editor: ReturnType<typeof useEditor> | null;
  onImageUpload?: () => void;
  onLinkAdd?: () => void;
}

function ToolbarButton({
  editor,
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
}: {
  editor: ReturnType<typeof useEditor> | null;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  // Human: Preventing default on mouse down keeps the editor focused; otherwise the button click would blur TipTap before `onClick` runs.
  // Agent: PREVENTDEFAULT on mousedown; CALLS editor.commands.focus when not destroyed.
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!editor?.isDestroyed) editor?.commands.focus();
  };
  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.preventDefault();
        if (!editor?.isDestroyed) {
          editor?.commands.focus();
          onClick();
        }
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-lg p-2 transition-colors flex-shrink-0",
        "hover:bg-neutral-100 dark:hover:bg-neutral-700",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isActive && "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
      )}
    >
      {children}
    </button>
  );
}

const HIGHLIGHT_COLORS = [
  { name: "None", value: null as string | null },
  { name: "Yellow", value: "#FEF08A" },
  { name: "Green", value: "#BBF7D0" },
  { name: "Blue", value: "#BFDBFE" },
  { name: "Pink", value: "#FCE7F3" },
  { name: "Orange", value: "#FED7AA" },
  { name: "Purple", value: "#E9D5FF" },
  { name: "Red", value: "#FECACA" },
];

export function RichTextEditorToolbar({
  editor,
  onImageUpload,
  onLinkAdd,
}: RichTextEditorToolbarProps) {
  if (!editor) return null;

  const [highlightColorOpen, setHighlightColorOpen] = React.useState(false);
  const highlightColorRef = React.useRef<HTMLDivElement | null>(null);

  // Close highlight palette when clicking outside
  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        highlightColorRef.current &&
        !highlightColorRef.current.contains(event.target as Node)
      ) {
        setHighlightColorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isHighlightActive = editor.isActive("highlight");
  const highlightAttrs = editor.getAttributes("highlight");
  const currentHighlightColor =
    isHighlightActive && highlightAttrs?.color ? (highlightAttrs.color as string) : null;

  const sep = () => (
    <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-600 flex-shrink-0" aria-hidden />
  );

  return (
    <div
      className={cn(
        "flex items-center flex-wrap gap-1 p-2 border-b border-neutral-200 dark:border-neutral-700 rounded-t-lg",
        "bg-neutral-50 dark:bg-neutral-800/50"
      )}
    >
      {/* Bold, Italic, Highlight (color picker) */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 5h7M7 19h7M14 5l-4 14" />
          </svg>
        </ToolbarButton>
        <div className="relative" ref={highlightColorRef}>
          <ToolbarButton
            editor={editor}
            onClick={() => setHighlightColorOpen((open) => !open)}
            isActive={!!currentHighlightColor}
            title="Highlight color"
          >
            <div className="relative">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
              {currentHighlightColor && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-neutral-800"
                  style={{ backgroundColor: currentHighlightColor }}
                />
              )}
            </div>
          </ToolbarButton>
          {highlightColorOpen && (
            <div
              className={cn(
                "absolute bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px] z-50 top-full left-0 mt-1"
              )}
            >
              <div className="grid grid-cols-4 gap-2">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => {
                      const { from, to } = editor.state.selection;
                      const hasSelection = from !== to;

                      if (!hasSelection) {
                        setHighlightColorOpen(false);
                        return;
                      }

                      const chain = editor.chain().focus().setTextSelection({ from, to });

                      if (color.value) {
                        chain
                          .setHighlight({ color: color.value })
                          .command(({ tr, dispatch }) => {
                            if (dispatch) {
                              tr.setStoredMarks([]);
                            }
                            return true;
                          })
                          .run();
                      } else {
                        chain
                          .unsetHighlight()
                          .command(({ tr, dispatch }) => {
                            if (dispatch) {
                              tr.setStoredMarks([]);
                            }
                            return true;
                          })
                          .run();
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
                      <svg
                        className="w-4 h-4 text-neutral-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {sep()}
      {/* Lists */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bulleted list"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m5 0l3-3m0 0l3 3m-3-3v6" />
          </svg>
        </ToolbarButton>
      </div>
      {sep()}
      {/* Quote, Code */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="Quote"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Code block"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </ToolbarButton>
      </div>
      {sep()}
      {/* Link, Image */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          editor={editor}
          onClick={
            onLinkAdd ||
            (() => {
              const url = window.prompt("Enter URL:");
              if (url) editor.chain().focus().setLink({ href: url }).run();
            })
          }
          isActive={editor.isActive("link")}
          title="Insert link"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>
        {onImageUpload && (
          <ToolbarButton editor={editor} onClick={onImageUpload} title="Insert image">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </ToolbarButton>
        )}
      </div>
      {sep()}
      {/* Undo, Redo */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </ToolbarButton>
      </div>
    </div>
  );
}
