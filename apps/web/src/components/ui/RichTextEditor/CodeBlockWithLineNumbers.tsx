"use client";

import React from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { cn } from "@/lib/utils/cn";

export const CodeBlockWithLineNumbers: React.FC<ReactNodeViewProps> = ({
  node,
}) => {
  const code = node.textContent || "";
  const lines = code.split("\n");
  const lineCount = Math.max(1, lines.length);

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        "relative my-4 rounded-lg overflow-hidden",
        "bg-[#1e1e1e] border border-[#3e3e3e]",
        "shadow-lg"
      )}
    >
      <div className="flex">
        {/* Line Numbers Column - VS Code style */}
        <div
          className={cn(
            "flex-shrink-0 px-3 py-4",
            "bg-[#252526] text-[#858585]",
            "text-right select-none",
            "font-mono text-xs leading-6",
            "border-r border-[#3e3e3e]",
            "min-w-[3.5rem]"
          )}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={`line-${i}`} className="min-h-[1.5rem]">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code Content - editable area */}
        <div className="flex-1 overflow-x-auto bg-[#1e1e1e]">
          <NodeViewContent
            className={cn(
              "m-0 p-4 block",
              "bg-transparent text-[#d4d4d4]",
              "font-mono text-sm leading-6",
              "whitespace-pre",
              "focus:outline-none",
              "w-full",
              "resize-none"
            )}
            spellCheck={false}
            data-language={node.attrs?.language || ""}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
};
