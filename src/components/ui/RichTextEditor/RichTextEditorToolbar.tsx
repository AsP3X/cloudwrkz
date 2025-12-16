"use client";

import React from "react";
import { useEditor } from "@tiptap/react";
import { cn } from "@/lib/utils/cn";
import { FloatingTooltip } from "@/components/ui/FloatingTooltip";

interface RichTextEditorToolbarProps {
  editor: ReturnType<typeof useEditor> | null;
  onImageUpload?: () => void;
  onLinkAdd?: () => void;
  isMobile?: boolean;
}

interface ToolbarButtonProps {
  editor: ReturnType<typeof useEditor> | null;
  isMobile: boolean;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  preservedSelectionRef: React.MutableRefObject<{ from: number; to: number } | null>;
  handledInMouseDownRef: React.MutableRefObject<boolean>;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  editor,
  isMobile,
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
  preservedSelectionRef,
  handledInMouseDownRef,
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    // Always prevent default to prevent the button from taking focus away from the editor
    e.preventDefault();
    
    if (!editor || editor.isDestroyed) return;
    
    // Mark that we're handling it in mousedown to prevent double execution
    handledInMouseDownRef.current = true;
    
    // Preserve the current selection before the button click
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    
    if (hasSelection) {
      // Store the selection to restore it
      preservedSelectionRef.current = { from, to };
    } else {
      preservedSelectionRef.current = null;
    }
    
    // Ensure editor is focused
    if (!editor.isFocused) {
      editor.commands.focus();
    }
    
    // Execute the formatting command immediately
    // Use requestAnimationFrame to ensure the editor state is ready
    requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) {
        handledInMouseDownRef.current = false;
        return;
      }
      
      // Restore selection if we had one
      if (preservedSelectionRef.current) {
        const { from, to } = preservedSelectionRef.current;
        editor.commands.setTextSelection({ from, to });
      }
      
      // Ensure focus is maintained
      if (!editor.isFocused) {
        editor.commands.focus();
      }
      
      // Apply the formatting
      onClick();
      
      // Clear preserved selection
      preservedSelectionRef.current = null;
      
      // Reset flag after a short delay to allow click handler to see it was handled
      setTimeout(() => {
        handledInMouseDownRef.current = false;
      }, 100);
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Prevent default to avoid any default button behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle click if it wasn't already handled in mousedown
    if (handledInMouseDownRef.current) {
      return;
    }
    
    if (!editor || editor.isDestroyed) return;
    
    // Ensure editor is focused before applying formatting
    if (!editor.isFocused) {
      editor.commands.focus();
    }
    
    // Apply the formatting
    onClick();
    
    // Refocus editor after clicking button to maintain focus
    if (editor && !editor.isDestroyed) {
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed && !editor.isFocused) {
          editor.commands.focus();
        }
      });
    }
  };

  // If editor is not ready yet, don't render the toolbar UI
  if (!editor) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-lg transition-all flex-shrink-0",
        isMobile ? "p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center" : "p-2",
        "hover:bg-neutral-100 dark:hover:bg-neutral-700",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "active:scale-95",
        isMobile
          ? isActive
            ? "bg-primary-500 text-white shadow-md"
            : "bg-transparent"
          : isActive
          ? "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
          : ""
      )}
    >
      {children}
    </button>
  );
};

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
  isMobile = false,
}: RichTextEditorToolbarProps) => {
  const [textColorOpen, setTextColorOpen] = React.useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = React.useState(false);
  const [selectionUpdate, setSelectionUpdate] = React.useState(0);
  const textColorRef = React.useRef<HTMLDivElement>(null);
  const highlightColorRef = React.useRef<HTMLDivElement>(null);
  const preservedSelectionRef = React.useRef<{ from: number; to: number } | null>(null);
  const handledInMouseDownRef = React.useRef<boolean>(false);

  // Listen to selection changes to update active states
  React.useEffect(() => {
    if (!editor) return;

    const updateSelection = () => {
      setSelectionUpdate((prev) => prev + 1);
    };

    editor.on("selectionUpdate", updateSelection);
    editor.on("transaction", updateSelection);

    return () => {
      editor.off("selectionUpdate", updateSelection);
      editor.off("transaction", updateSelection);
    };
  }, [editor]);

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

    if (typeof window === "undefined" || typeof document === "undefined") return;

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", handleClickOutside);
      }
    };
  }, []);

  // Get current formatting states - re-evaluated when selection changes
  // All checks are guarded so they are safe when editor is null
  const isTextStyleActive = !!editor && selectionUpdate >= 0 && editor.isActive("textStyle");
  const textStyleAttrs = editor ? editor.getAttributes("textStyle") : {};
  const currentTextColor =
    isTextStyleActive && textStyleAttrs.color && textStyleAttrs.color !== "#inline-quote"
      ? textStyleAttrs.color
      : null;

  // Check if highlight is actually active on the current selection
  const isHighlightActive = !!editor && selectionUpdate >= 0 && editor.isActive("highlight");
  const highlightAttrs = editor ? editor.getAttributes("highlight") : {};
  const currentHighlightColor =
    isHighlightActive && highlightAttrs.color && highlightAttrs.color !== "#inline-quote"
      ? highlightAttrs.color
      : null;
  
  // Check if inline quote is active (highlight with inline-quote color)
  const isInlineQuoteActive = isHighlightActive && highlightAttrs.color === "#inline-quote";
  
  // Check other formatting states
  const isBoldActive = !!editor && selectionUpdate >= 0 && editor.isActive("bold");
  const isItalicActive = !!editor && selectionUpdate >= 0 && editor.isActive("italic");
  const isBlockquoteActive = !!editor && selectionUpdate >= 0 && editor.isActive("blockquote");
  const isCodeBlockActive = !!editor && selectionUpdate >= 0 && editor.isActive("codeBlock");
  const isLinkActive = !!editor && selectionUpdate >= 0 && editor.isActive("link");
  const isBulletListActive = !!editor && selectionUpdate >= 0 && editor.isActive("bulletList");
  const isOrderedListActive = !!editor && selectionUpdate >= 0 && editor.isActive("orderedList");

  if (isMobile) {
    // On mobile, don't render the toolbar until the editor is ready
    if (!editor) {
      return null;
    }

    // Mobile layout: Simplified toolbar with only Bold, List, Link, and Color
    return (
      <>
        <div
          className={cn(
            "flex items-center bg-neutral-50 dark:bg-neutral-800/50 gap-1 p-2 border-b border-neutral-200 dark:border-neutral-700 rounded-t-lg"
          )}
        >
          <ToolbarButton
            editor={editor}
            isMobile={true}
            preservedSelectionRef={preservedSelectionRef}
            handledInMouseDownRef={handledInMouseDownRef}
            onClick={() => {
              const selection = preservedSelectionRef.current || editor.state.selection;
              const { from, to } = selection;
              const hasSelection = from !== to;
              
              if (hasSelection) {
                // Apply bold only to selected text (not stored marks for future typing)
                editor
                  .chain()
                  .focus()
                  .setTextSelection({ from, to })
                  .toggleBold()
                  .command(({ tr, dispatch }) => {
                    if (dispatch) {
                      // Clear stored marks so bold doesn't continue for future typing
                      tr.setStoredMarks([]);
                    }
                    return true;
                  })
                  .run();
              } else {
                // No selection - don't apply bold (bold only works on selected text)
              }
            }}
            isActive={isBoldActive}
            title="Bold text"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
            </svg>
          </ToolbarButton>

          {/* List (Bullet List) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              preservedSelectionRef.current = null;
              if (editor && !editor.isDestroyed) {
                editor.chain().focus().toggleBulletList().run();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={!editor}
            title="Bulleted list"
            className={cn(
              "rounded transition-colors flex-shrink-0 p-2",
              "hover:bg-neutral-100 dark:hover:bg-neutral-700",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "active:bg-neutral-200 dark:active:bg-neutral-600",
              isBulletListActive && "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </button>

          {/* Link */}
          <ToolbarButton
            editor={editor}
            isMobile={true}
            preservedSelectionRef={preservedSelectionRef}
            handledInMouseDownRef={handledInMouseDownRef}
            onClick={onLinkAdd || (() => {
              const url = window.prompt("Enter URL:");
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            })}
            isActive={isLinkActive}
            title="Insert link"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </ToolbarButton>

          {/* Text Color */}
          <div
            className="relative"
            ref={textColorRef}
          >
            <ToolbarButton
              editor={editor}
              isMobile={true}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => setTextColorOpen(!textColorOpen)}
              isActive={!!currentTextColor}
              title="Text color"
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
              <div
                className={cn(
                  "absolute bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px] z-50 top-full left-0 mt-1"
                )}
              >
                <div className="grid grid-cols-4 gap-2">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => {
                        const { from, to } = editor.state.selection;
                        const hasSelection = from !== to;
                        
                        if (color.value) {
                          if (hasSelection) {
                            // Apply text color only to selected text (not stored marks for future typing)
                            editor
                              .chain()
                              .focus()
                              .setTextSelection({ from, to })
                              .setColor(color.value)
                              .command(({ tr, dispatch }) => {
                                if (dispatch) {
                                  // Clear stored marks so text color doesn't continue for future typing
                                  tr.setStoredMarks([]);
                                }
                                return true;
                              })
                              .run();
                          } else {
                            // No selection - don't apply text color (text color only works on selected text)
                          }
                        } else {
                          // Remove text color from selection
                          if (hasSelection) {
                            editor.chain().focus().setTextSelection({ from, to }).unsetColor().run();
                          } else {
                            editor.chain().focus().unsetColor().run();
                          }
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
        </div>
      </>
    );
  }

  // Desktop layout: Original single-row design
  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center bg-neutral-50 dark:bg-neutral-800/50 flex-wrap gap-1 p-2 border-b border-neutral-200 dark:border-neutral-700 rounded-t-lg"
      )}
    >
      {/* Text Formatting */}
      <div
        className={cn(
          "flex items-center border-r border-neutral-300 dark:border-neutral-600 gap-1 pr-2 mr-2"
        )}
      >
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => {
                const selection = preservedSelectionRef.current || editor.state.selection;
                const { from, to } = selection;
                const hasSelection = from !== to;
                
                if (hasSelection) {
                  // Apply bold only to selected text (not stored marks for future typing)
                  editor
                    .chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .toggleBold()
                    .command(({ tr, dispatch }) => {
                      if (dispatch) {
                        // Clear stored marks so bold doesn't continue for future typing
                        tr.setStoredMarks([]);
                      }
                      return true;
                    })
                    .run();
                } else {
                  // No selection - don't apply bold (bold only works on selected text)
                }
              }}
              isActive={isBoldActive}
              title="Bold text (Ctrl+B)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Bold text (Ctrl+B)
          </div>
        </FloatingTooltip>
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => {
                const selection = preservedSelectionRef.current || editor.state.selection;
                const { from, to } = selection;
                const hasSelection = from !== to;
                
                if (hasSelection) {
                  // Apply italic only to selected text (not stored marks for future typing)
                  editor
                    .chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .toggleItalic()
                    .command(({ tr, dispatch }) => {
                      if (dispatch) {
                        // Clear stored marks so italic doesn't continue for future typing
                        tr.setStoredMarks([]);
                      }
                      return true;
                    })
                    .run();
                } else {
                  // No selection - don't apply italic (italic only works on selected text)
                }
              }}
              isActive={isItalicActive}
              title="Italic text (Ctrl+I)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 5h7M7 19h7M14 5l-4 14"
                />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Italic text (Ctrl+I)
          </div>
        </FloatingTooltip>
      </div>

      {/* Text Color */}
      <div
        className={cn(
          "relative border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2"
        )}
        ref={textColorRef}
      >
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => setTextColorOpen(!textColorOpen)}
              isActive={!!currentTextColor}
              title="Text color"
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
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Text color
          </div>
        </FloatingTooltip>
        {textColorOpen && (
          <div
            className={cn(
              "absolute bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px] z-50 top-full left-0 mt-1"
            )}
          >
            <div className="grid grid-cols-4 gap-2">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => {
                    const { from, to } = editor.state.selection;
                    const hasSelection = from !== to;
                    
                    if (color.value) {
                      if (hasSelection) {
                        // Apply text color only to selected text (not stored marks for future typing)
                        editor
                          .chain()
                          .focus()
                          .setTextSelection({ from, to })
                          .setColor(color.value)
                          .command(({ tr, dispatch }) => {
                            if (dispatch) {
                              // Clear stored marks so text color doesn't continue for future typing
                              tr.setStoredMarks([]);
                            }
                            return true;
                          })
                          .run();
                      } else {
                        // No selection - don't apply text color (text color only works on selected text)
                      }
                    } else {
                      // Remove text color from selection
                      if (hasSelection) {
                        editor.chain().focus().setTextSelection({ from, to }).unsetColor().run();
                      } else {
                        editor.chain().focus().unsetColor().run();
                      }
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
      <div
        className={cn(
          "relative border-r border-neutral-300 dark:border-neutral-600 pr-2 mr-2"
        )}
        ref={highlightColorRef}
      >
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => setHighlightColorOpen(!highlightColorOpen)}
              isActive={!!currentHighlightColor && !isInlineQuoteActive}
              title="Highlight color"
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
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Highlight color
          </div>
        </FloatingTooltip>
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
                    
                    if (color.value) {
                      if (hasSelection) {
                        // Apply highlight only to selected text (not stored marks for future typing)
                        editor
                          .chain()
                          .focus()
                          .setTextSelection({ from, to })
                          .setHighlight({ color: color.value })
                          .command(({ tr, dispatch }) => {
                            if (dispatch) {
                              // Clear stored marks so highlight doesn't continue for future typing
                              tr.setStoredMarks([]);
                            }
                            return true;
                          })
                          .run();
                      } else {
                        // No selection - don't apply highlight (highlights only work on selected text)
                        // Optionally, we could show a message, but for now just do nothing
                      }
                    } else {
                      // Remove highlight from selection
                      if (hasSelection) {
                        editor.chain().focus().setTextSelection({ from, to }).unsetHighlight().run();
                      } else {
                        editor.chain().focus().unsetHighlight().run();
                      }
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

      {/* Lists */}
      <div
        className={cn(
          "flex items-center border-r border-neutral-300 dark:border-neutral-600 gap-1 pr-2 mr-2"
        )}
      >
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                preservedSelectionRef.current = null;
                if (editor && !editor.isDestroyed) {
                  editor.chain().focus().toggleBulletList().run();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!editor}
              title="Bulleted list"
              className={cn(
                "rounded transition-colors flex-shrink-0 p-2",
                "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "active:bg-neutral-200 dark:active:bg-neutral-600",
                isBulletListActive && "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Bulleted list
          </div>
        </FloatingTooltip>
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                preservedSelectionRef.current = null;
                if (editor && !editor.isDestroyed) {
                  editor.chain().focus().toggleOrderedList().run();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!editor}
              title="Numbered list"
              className={cn(
                "rounded transition-colors flex-shrink-0 p-2",
                "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "active:bg-neutral-200 dark:active:bg-neutral-600",
                isOrderedListActive && "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </button>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Numbered list
          </div>
        </FloatingTooltip>
      </div>

      {/* Block Elements */}
      <div
        className={cn(
          "flex items-center border-r border-neutral-300 dark:border-neutral-600 gap-1 pr-2 mr-2"
        )}
      >
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => {
                const { from, to } = editor.state.selection;
                const hasSelection = from !== to;
                
                // Check if we're currently in a quote (either active or stored marks)
                const { $from } = editor.state.selection;
                const marks = $from.marks();
                const highlightMark = editor.state.schema.marks.highlight;
                const isCurrentlyInQuote = marks.some(mark => 
                  mark.type === highlightMark && mark.attrs.color === "#inline-quote"
                ) || isInlineQuoteActive;
                
                if (isInlineQuoteActive && hasSelection) {
                  // Remove inline quote highlight from selection
                  editor.chain().focus().unsetHighlight().run();
                } else if (hasSelection) {
                  // Apply inline quote highlight to selected text
                  editor.chain().focus().setHighlight({ color: "#inline-quote" }).run();
                } else {
                  // No selection - insert an empty visible quote block
                  const insertPos = from;
                  
                  if (isCurrentlyInQuote) {
                    // We're in a quote - exit it first, then insert new quote
                    editor
                      .chain()
                      .focus()
                      .command(({ tr, dispatch }) => {
                        if (dispatch) {
                          // Clear stored marks to exit quote mode
                          tr.setStoredMarks([]);
                        }
                        return true;
                      })
                      .insertContent(' ') // Insert a space without quote to break out
                      .command(({ tr, dispatch, state }) => {
                        if (dispatch) {
                          const { schema } = state;
                          const newHighlightMark = schema.marks.highlight.create({ color: "#inline-quote" });
                          const currentPos = tr.selection.from;
                          
                          // Create text node with highlight mark for the new quote
                          const textNode = schema.text(' ', [newHighlightMark]);
                          
                          // Insert the new quote text node at current position
                          tr.insert(currentPos, textNode);
                          
                          // Set stored marks for future typing in the new quote
                          tr.setStoredMarks([newHighlightMark]);
                          
                        }
                        return true;
                      })
                      .run();
                  } else {
                    // Not in a quote - just insert new quote
                    editor
                      .chain()
                      .focus()
                      .command(({ tr, dispatch, state }) => {
                        if (dispatch) {
                          const { schema } = state;
                          const highlightMark = schema.marks.highlight.create({ color: "#inline-quote" });
                          
                          // Create text node with highlight mark
                          const textNode = schema.text(' ', [highlightMark]);
                          
                          // Insert the text node
                          tr.insert(insertPos, textNode);
                          
                          // Set stored marks for future typing
                          tr.setStoredMarks([highlightMark]);
                          
                        }
                        return true;
                      })
                      .run();
                  }
                }
              }}
              isActive={isInlineQuoteActive}
              title="Inline quote"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Quote / callout
          </div>
        </FloatingTooltip>
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              isActive={isCodeBlockActive}
              title="Code block"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Code block
          </div>
        </FloatingTooltip>
      </div>

      {/* Links and Images */}
      <div
        className={cn(
          "flex items-center border-r border-neutral-300 dark:border-neutral-600 gap-1 pr-2 mr-2"
        )}
      >
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={onLinkAdd || (() => {
                const url = window.prompt("Enter URL:");
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              })}
              isActive={isLinkActive}
              title="Insert link"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Insert link
          </div>
        </FloatingTooltip>
        {onImageUpload && (
          <FloatingTooltip
            trigger={
              <ToolbarButton
                editor={editor}
                isMobile={false}
                preservedSelectionRef={preservedSelectionRef}
                handledInMouseDownRef={handledInMouseDownRef}
                onClick={onImageUpload}
                title="Insert image"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </ToolbarButton>
            }
          >
            <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
              Insert image
            </div>
          </FloatingTooltip>
        )}
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo last change (Ctrl+Z)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Undo last change (Ctrl+Z)
          </div>
        </FloatingTooltip>
        <FloatingTooltip
          triggerMode="hover"
          position="top"
          trigger={
            <ToolbarButton
              editor={editor}
              isMobile={false}
              preservedSelectionRef={preservedSelectionRef}
              handledInMouseDownRef={handledInMouseDownRef}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo last change (Ctrl+Y)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
              </svg>
            </ToolbarButton>
          }
        >
          <div className="px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100">
            Redo last change (Ctrl+Y)
          </div>
        </FloatingTooltip>
      </div>
    </div>
  );
};
