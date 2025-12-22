"use client";

import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlock from "@tiptap/extension-code-block";
import Code from "@tiptap/extension-code";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils/cn";
import { extractPlainText } from "@/lib/utils/rich-text";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RichTextEditorToolbar } from "./RichTextEditorToolbar";
import { ImageFormatDialog } from "./ImageFormatDialog";
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
    const [isMobile, setIsMobile] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);
    const [viewportHeight, setViewportHeight] = React.useState(0);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
    const [linkDialogMode, setLinkDialogMode] = React.useState<"selection" | "new">("selection");
    const [linkText, setLinkText] = React.useState("");
    const [linkUrl, setLinkUrl] = React.useState("");
    const [isImageFormatDialogOpen, setIsImageFormatDialogOpen] = React.useState(false);
    const [selectedImageFile, setSelectedImageFile] = React.useState<File | null>(null);
    const [isUploadDialogOpen, setIsUploadDialogOpen] = React.useState(false);
    const [uploadProgress, setUploadProgress] = React.useState<number>(0);
    const [uploadStage, setUploadStage] = React.useState<string>("");

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
          blockquote: {},
          bulletList: {},
          orderedList: {},
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Link.configure({
          // Automatically detect and convert URLs in text and on paste
          autolink: true,
          linkOnPaste: true,
          openOnClick: true,
          validate: (href) => {
            if (!href) return false;
            try {
              const url = new URL(
                href,
                href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")
                  ? undefined
                  : "https://dummy-base.local"
              );
              return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
            } catch {
              return false;
            }
          },
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
            // Ensure visible styling and pointer cursor inside the editor while typing
            class: "text-blue-600 dark:text-blue-400 cursor-pointer underline hover:underline",
          },
        }),
        Image.configure({
          inline: true,
          allowBase64: false,
          HTMLAttributes: {
            class: "max-w-full h-auto rounded-lg",
          },
        }),
        CodeBlock,
        Code,
        Highlight.configure({
          multicolor: true,
          HTMLAttributes: {
            class: "highlight",
          },
        }),
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
      parseOptions: {
        preserveWhitespace: "full",
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        const plainText = extractPlainText(html);
        onChange(html, plainText);
        
        // Check if two consecutive spaces were typed while in formatting mode
        // (quote, highlight, bold, italic, or text color)
        const { selection } = editor.state;
        const { $from } = selection;
        const pos = $from.pos;
        
        // Check if we're at a position with any formatting marks
        const marks = $from.marks();
        const schema = editor.state.schema;
        const highlightMark = schema.marks.highlight;
        const boldMark = schema.marks.bold;
        const italicMark = schema.marks.italic;
        const textStyleMark = schema.marks.textStyle;
        const linkMark = schema.marks.link;
        
        const highlightMarkInstance = marks.find(mark => mark.type === highlightMark);
        const isInQuote = highlightMarkInstance && highlightMarkInstance.attrs.color === "#inline-quote";
        const isInRegularHighlight = highlightMarkInstance && highlightMarkInstance.attrs.color !== "#inline-quote";
        const isInBold = marks.some(mark => mark.type === boldMark);
        const isInItalic = marks.some(mark => mark.type === italicMark);
        const isInTextColor = marks.some(mark => mark.type === textStyleMark && mark.attrs.color);
        const isInLink = marks.some(mark => mark.type === linkMark);
        
        // Check if we're in any formatting mode that should exit on two spaces
        const isInFormattingMode = isInQuote || isInRegularHighlight || isInBold || isInItalic || isInTextColor || isInLink;
        
        if (isInFormattingMode && pos >= 2) {
          // Check if the last two characters before cursor are spaces
          const lastTwoChars = editor.state.doc.textBetween(pos - 2, pos);
          if (lastTwoChars === "  ") {
            // Two consecutive spaces - exit formatting mode
            // Delete both spaces, then insert one space outside the formatting
            const beforePos = pos - 2;
            
            // Find where the formatting ends so we can insert space outside it
            // This applies to all formatting types: links, bold, italic, highlight, text color
            let insertPos = beforePos;
            const docSize = editor.state.doc.content.size;
            let currentPos = beforePos;
            
            // Check what formatting marks are active
            const activeMarks: Array<{ type: any; check: (mark: any) => boolean }> = [];
            if (isInLink) {
              activeMarks.push({ type: linkMark, check: (mark) => mark.type === linkMark });
            }
            if (isInBold) {
              activeMarks.push({ type: boldMark, check: (mark) => mark.type === boldMark });
            }
            if (isInItalic) {
              activeMarks.push({ type: italicMark, check: (mark) => mark.type === italicMark });
            }
            if (isInRegularHighlight) {
              activeMarks.push({ 
                type: highlightMark, 
                check: (mark) => mark.type === highlightMark && mark.attrs.color !== "#inline-quote" 
              });
            }
            if (isInTextColor) {
              activeMarks.push({ 
                type: textStyleMark, 
                check: (mark) => mark.type === textStyleMark && mark.attrs.color 
              });
            }
            
            // If we have active formatting, find where it ends
            if (activeMarks.length > 0) {
              while (currentPos < docSize) {
                const $checkPos = editor.state.doc.resolve(currentPos);
                const checkMarks = $checkPos.marks();
                
                // Check if any of the active formatting marks are still present
                const stillHasFormatting = activeMarks.some(({ check }) => 
                  checkMarks.some(check)
                );
                
                if (!stillHasFormatting) {
                  // Found the end of the formatting
                  insertPos = currentPos;
                  break;
                }
                currentPos++;
              }
              
              // If we reached the end, use that position
              if (currentPos >= docSize) {
                insertPos = docSize;
              }
            }
            
            editor
              .chain()
              .focus()
              .setTextSelection({ from: pos - 2, to: pos })
              .deleteSelection()
              .setTextSelection(insertPos)
              .command(({ tr, dispatch }) => {
                if (dispatch) {
                  // Clear stored marks so the space we insert will be outside formatting
                  tr.setStoredMarks([]);
                }
                return true;
              })
              .insertContent(" ")
              .command(({ tr, dispatch }) => {
                if (dispatch) {
                  // Ensure stored marks remain cleared
                  tr.setStoredMarks([]);
                }
                return true;
              })
              .run();
          }
        }
      },
      editorProps: {
        transformPastedHTML(html) {
          // Preserve HTML including custom spans
          return html;
        },
        transformPastedText(text) {
          return text;
        },
        handleDOMEvents: {
          // Allow HTML to be parsed correctly
        },
        attributes: {
          class: cn(
            "prose prose-sm max-w-none focus:outline-none",
            "prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100",
            "prose-p:text-neutral-700 dark:prose-p:text-neutral-300",
            "prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100",
            "prose-code:text-neutral-900 dark:prose-code:text-neutral-100",
            "prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800",
            "prose-blockquote:border-l-4 prose-blockquote:border-l-primary-500",
            "prose-blockquote:pl-4 prose-blockquote:pr-4 prose-blockquote:py-3",
            "prose-blockquote:my-4 prose-blockquote:bg-neutral-100 dark:prose-blockquote:bg-neutral-800/50",
            "prose-blockquote:text-neutral-700 dark:prose-blockquote:text-neutral-300",
            "prose-blockquote:italic",
            "prose-blockquote:rounded-r",
            "prose-blockquote:border-primary-500",
            // Links: blue text and pointer cursor
            "prose-a:text-blue-600 dark:prose-a:text-blue-400",
            "prose-a:cursor-pointer hover:prose-a:underline",
            "prose-ul:list-disc prose-ul:pl-6 prose-ul:my-4",
            "prose-ol:list-decimal prose-ol:pl-6 prose-ol:my-4",
            "prose-li:text-neutral-700 dark:prose-li:text-neutral-300",
            "prose-li:my-1",
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
      setMounted(true);
    }, []);

    // Detect mobile view
    React.useEffect(() => {
      if (typeof window === "undefined") return;

      const checkMobile = () => {
        // Use md breakpoint (768px) for mobile detection
        setIsMobile(window.innerWidth < 768);
      };

      checkMobile();
      window.addEventListener("resize", checkMobile);
      window.addEventListener("orientationchange", checkMobile);

      return () => {
        window.removeEventListener("resize", checkMobile);
        window.removeEventListener("orientationchange", checkMobile);
      };
    }, []);

    // Track keyboard height for mobile devices
    React.useEffect(() => {
      if (typeof window === "undefined" || !isMobile) return;

      const updateKeyboardHeight = () => {
        // Use Visual Viewport API if available (modern browsers - iOS Safari 13+, Chrome 61+)
        if (window.visualViewport) {
          const viewport = window.visualViewport;
          const windowHeight = window.innerHeight;
          const viewportHeight = viewport.height;
          const viewportTop = viewport.offsetTop;
          
          // Calculate keyboard height: difference between window height and visible viewport
          // Also account for viewport offset (scroll position)
          const calculatedKeyboardHeight = windowHeight - (viewportHeight + viewportTop);
          
          // Only consider it a keyboard if the difference is significant (>100px)
          // This prevents false positives from browser UI changes
          if (calculatedKeyboardHeight > 100) {
            setKeyboardHeight(calculatedKeyboardHeight);
            setViewportHeight(viewportHeight);
          } else {
            setKeyboardHeight(0);
            setViewportHeight(window.innerHeight);
          }
        } else {
          // Fallback for older browsers: detect keyboard by window height changes
          // Store initial height on mount
          const storedInitialHeight = sessionStorage.getItem("initialWindowHeight");
          const currentHeight = window.innerHeight;
          
          if (!storedInitialHeight) {
            // Store initial height on first load
            sessionStorage.setItem("initialWindowHeight", currentHeight.toString());
            setKeyboardHeight(0);
            setViewportHeight(currentHeight);
          } else {
            const initialHeight = parseInt(storedInitialHeight, 10);
            const heightDiff = initialHeight - currentHeight;
            
            // If window height decreased significantly, keyboard is likely open
            if (heightDiff > 100 && currentHeight < initialHeight * 0.7) {
              setKeyboardHeight(heightDiff);
              setViewportHeight(currentHeight);
            } else if (heightDiff < 50) {
              // Window height is back to normal, keyboard is closed
              setKeyboardHeight(0);
              setViewportHeight(currentHeight);
            }
          }
        }
      };

      // Initial check
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      } else {
        setViewportHeight(window.innerHeight);
      }
      updateKeyboardHeight();

      // Listen to visual viewport changes (preferred method)
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateKeyboardHeight);
        window.visualViewport.addEventListener("scroll", updateKeyboardHeight);
      }

      // Fallback: listen to window resize and orientation changes
      window.addEventListener("resize", updateKeyboardHeight);
      window.addEventListener("orientationchange", () => {
        // Reset stored height on orientation change
        sessionStorage.removeItem("initialWindowHeight");
        setTimeout(updateKeyboardHeight, 100);
      });

      // Also listen to focus/blur on inputs to help detect keyboard
      const handleInputFocus = () => {
        setTimeout(updateKeyboardHeight, 300); // Delay to allow keyboard animation
      };
      const handleInputBlur = () => {
        setTimeout(updateKeyboardHeight, 300);
      };

      document.addEventListener("focusin", handleInputFocus);
      document.addEventListener("focusout", handleInputBlur);

      return () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", updateKeyboardHeight);
          window.visualViewport.removeEventListener("scroll", updateKeyboardHeight);
        }
        window.removeEventListener("resize", updateKeyboardHeight);
        window.removeEventListener("orientationchange", updateKeyboardHeight);
        document.removeEventListener("focusin", handleInputFocus);
        document.removeEventListener("focusout", handleInputBlur);
      };
    }, [isMobile]);

    // Track editor focus state
    React.useEffect(() => {
      if (!editor || !isMobile) return;

      const handleFocus = () => setIsFocused(true);
      const handleBlur = () => {
        // Delay blur check to allow toolbar button clicks to refocus editor
        setTimeout(() => {
          // Only hide toolbar if editor is still not focused after delay
          if (!editor.isFocused) {
            setIsFocused(false);
          }
        }, 150);
      };

      editor.on("focus", handleFocus);
      editor.on("blur", handleBlur);

      return () => {
        editor.off("focus", handleFocus);
        editor.off("blur", handleBlur);
      };
    }, [editor, isMobile]);

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

        // Show image format dialog
        setSelectedImageFile(file);
        setIsImageFormatDialogOpen(true);
      };
      input.click();
    }, [onImageUpload, editor]);

    const handleImageFormatConfirm = React.useCallback(async (processedImageDataUrl: string) => {
      if (!onImageUpload || !editor || !selectedImageFile) return;

      try {
        setIsImageUploading(true);
        setIsUploadDialogOpen(true);
        setUploadProgress(0);
        setUploadStage("Preparing image...");

        // Progress simulation for image processing
        const progressSteps = [
          { progress: 15, stage: "Processing image..." },
          { progress: 30, stage: "Converting format..." },
          { progress: 45, stage: "Optimizing image..." },
          { progress: 60, stage: "Preparing upload..." },
        ];

        let currentStep = 0;
        const progressInterval = setInterval(() => {
          if (currentStep < progressSteps.length) {
            const step = progressSteps[currentStep];
            setUploadProgress(step.progress);
            setUploadStage(step.stage);
            currentStep++;
          } else {
            clearInterval(progressInterval);
          }
        }, 150);

        // Convert data URL to Blob, then to File
        setUploadProgress(70);
        setUploadStage("Converting to file format...");
        const response = await fetch(processedImageDataUrl);
        const blob = await response.blob();
        const processedFile = new File([blob], selectedImageFile.name, {
          type: selectedImageFile.type || "image/png",
        });

        clearInterval(progressInterval);
        setUploadProgress(80);
        setUploadStage("Uploading image...");

        // Upload the processed image
        const url = await onImageUpload(processedFile);

        setUploadProgress(95);
        setUploadStage("Inserting into editor...");

        // Small delay to show the insertion stage
        await new Promise(resolve => setTimeout(resolve, 200));

        editor.chain().focus().setImage({ src: url }).run();

        setUploadProgress(100);
        setUploadStage("Complete!");

        // Small delay before closing to show completion
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reset state
        setSelectedImageFile(null);
        setIsImageFormatDialogOpen(false);
        setIsUploadDialogOpen(false);
        setUploadProgress(0);
        setUploadStage("");
      } catch (error) {
        console.error("Image upload error:", error);
        setIsUploadDialogOpen(false);
        setUploadProgress(0);
        setUploadStage("");
        alert("Failed to upload image. Please try again.");
      } finally {
        setIsImageUploading(false);
      }
    }, [onImageUpload, editor, selectedImageFile]);

    const handleLinkAdd = React.useCallback(() => {
      if (!editor) return;

      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      if (hasSelection) {
        // Use selected text, just ask for URL
        setLinkDialogMode("selection");
        setLinkText("");
      } else {
        // No selection – ask for both text and URL
        setLinkDialogMode("new");
        setLinkText("");
      }

      setLinkUrl("");
      setIsLinkDialogOpen(true);
    }, [editor]);

    const handleLinkDialogSubmit = React.useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        if (!editor) return;

        const trimmedUrl = linkUrl.trim();
        if (!trimmedUrl) {
          return;
        }

        // Normalise URL (prepend https:// if no scheme/mailto/tel)
        let href = trimmedUrl;
        if (
          !href.startsWith("http://") &&
          !href.startsWith("https://") &&
          !href.startsWith("mailto:") &&
          !href.startsWith("tel:")
        ) {
          href = `https://${href}`;
        }

        if (linkDialogMode === "selection") {
          // Apply link to current selection, then clear stored marks
          editor
            .chain()
            .focus()
            .setLink({ href, target: "_blank" })
            .command(({ tr, dispatch }) => {
              if (dispatch) {
                // Clear stored marks so link doesn't continue for future typing
                tr.setStoredMarks([]);
              }
              return true;
            })
            .run();
        } else {
          // Insert new linked text at cursor
          const text = (linkText || trimmedUrl).trim();
          if (text.length === 0) {
            return;
          }

          const escapeHtml = (value: string) =>
            value
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");

          const safeText = escapeHtml(text);
          const safeHref = escapeHtml(href);

          editor
            .chain()
            .focus()
            .insertContent(
              `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeText}</a>`
            )
            .insertContent(" ")
            .command(({ tr, dispatch }) => {
              if (dispatch) {
                // Delete the space we just added (this moves cursor to position after link)
                const currentPos = tr.selection.from;
                if (currentPos > 0) {
                  tr.delete(currentPos - 1, currentPos);
                }
                
                // Clear stored marks so link doesn't continue for future typing
                tr.setStoredMarks([]);
              }
              return true;
            })
            .run();
        }

        setIsLinkDialogOpen(false);
        setLinkText("");
        setLinkUrl("");
      },
      [editor, linkDialogMode, linkText, linkUrl]
    );

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
              {/* Toolbar - always at top for both desktop and mobile */}
              {showToolbar && (
                <RichTextEditorToolbar
                  editor={editor}
                  onImageUpload={handleImageUpload}
                  onLinkAdd={handleLinkAdd}
                  isMobile={isMobile}
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

        {/* Link Dialog */}
        <Dialog
          open={isLinkDialogOpen}
          onOpenChange={(open) => {
            setIsLinkDialogOpen(open);
            if (!open) {
              setLinkText("");
              setLinkUrl("");
            }
          }}
          title={linkDialogMode === "selection" ? "Add link" : "Create link"}
          description={
            linkDialogMode === "selection"
              ? "Enter the URL to link the selected text."
              : "Enter the link text and URL."
          }
        >
          <form
            onSubmit={handleLinkDialogSubmit}
            className="px-4 sm:px-6 py-4 space-y-4"
          >
            {linkDialogMode === "new" && (
              <Input
                label="Link text"
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Text to display"
              />
            )}
            <Input
              label="URL"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsLinkDialogOpen(false);
                  setLinkText("");
                  setLinkUrl("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Apply link
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Image Format Dialog */}
        <ImageFormatDialog
          open={isImageFormatDialogOpen}
          onOpenChange={(open) => {
            setIsImageFormatDialogOpen(open);
            if (!open) {
              setSelectedImageFile(null);
            }
          }}
          imageFile={selectedImageFile}
          onConfirm={handleImageFormatConfirm}
        />

        {/* Upload Progress Dialog */}
        <Dialog
          open={isUploadDialogOpen}
          onOpenChange={() => {}} // Prevent closing during upload
          title="Uploading Image"
          description="Please wait while your image is being processed and uploaded"
          className="max-w-md"
        >
          <div className="px-4 sm:px-6 py-6 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                  {uploadStage}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400 font-mono">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full h-3 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 dark:bg-primary-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-center pt-2">
              <svg className="animate-spin h-5 w-5 text-primary-600 dark:text-primary-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
        </Dialog>
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
