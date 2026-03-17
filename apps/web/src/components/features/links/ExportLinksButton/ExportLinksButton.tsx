"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { exportLinks } from "@/server/actions/links";

interface ExportLinksButtonProps {
  collectionId?: string;
  collections?: Array<{ id: string; name: string; color: string | null }>;
}

const EMPTY_COLLECTIONS: NonNullable<ExportLinksButtonProps['collections']> = [];

export function ExportLinksButton({ collectionId, collections = EMPTY_COLLECTIONS }: ExportLinksButtonProps) {
  const [loading, setLoading] = React.useState<"json" | "csv" | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleExport = async (format: "json" | "csv") => {
    setLoading(format);
    try {
      const result = await exportLinks({
        format,
        collectionId,
        archived: false,
      });
      if (result.success && result.data) {
        const blob = new Blob([result.data.content], { type: result.data.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setLoading(null);
      setMenuOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        onClick={() => setMenuOpen((o) => !o)}
        disabled={loading !== null}
      >
        {loading ? `Exporting ${loading}…` : "Export"}
      </Button>
      {menuOpen && !loading && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
          <button
            type="button"
            className="block w-full text-left px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            onClick={() => handleExport("json")}
          >
            Export as JSON
          </button>
          <button
            type="button"
            className="block w-full text-left px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            onClick={() => handleExport("csv")}
          >
            Export as CSV
          </button>
        </div>
      )}
    </div>
  );
}
