"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AddLinkDialog } from "@/components/features/links/AddLinkDialog";
import { BulkAddLinksDialog } from "@/components/features/links/BulkAddLinksDialog";
import { CollectionList } from "@/components/features/links/CollectionList";
import { CreateCollectionDialog } from "@/components/features/links/CreateCollectionDialog";
import { ImportLinksDialog } from "@/components/features/links/ImportLinksDialog";
import { getLinkFilterConfig } from "@/components/features/links/LinkFilterConfig";
import { Button } from "@/components/ui/Button";
import { FilterDialog } from "@/components/ui/FilterDialog";
import { exportLinks } from "@/server/actions/links";
import { ROUTES } from "@/lib/constants/routes";

// Context for sharing dialog state
const LinksPageContext = React.createContext<{
  openAddLink: () => void;
  openBulkAdd: () => void;
  openImport: () => void;
  openCreateCollection: () => void;
} | null>(null);

export const useLinksPage = () => {
  const context = React.useContext(LinksPageContext);
  if (!context) {
    throw new Error("useLinksPage must be used within LinksPageProvider");
  }
  return context;
};

interface LinksPageProviderProps {
  children: React.ReactNode;
  canCreate: boolean;
  collections?: Array<{ id: string; name: string; color: string | null }>;
}

export function LinksPageProvider({ children, canCreate, collections = [] }: LinksPageProviderProps) {
  const [addLinkOpen, setAddLinkOpen] = React.useState(false);
  const [bulkAddOpen, setBulkAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = React.useState(false);
  const searchParams = useSearchParams();
  const selectedCollectionId = searchParams.get("collection") || undefined;

  const openAddLink = React.useCallback(() => {
    if (canCreate) {
      setAddLinkOpen(true);
    }
  }, [canCreate]);

  const openBulkAdd = React.useCallback(() => {
    if (canCreate) {
      setBulkAddOpen(true);
    }
  }, [canCreate]);

  const openImport = React.useCallback(() => {
    if (canCreate) {
      setImportOpen(true);
    }
  }, [canCreate]);

  const openCreateCollection = React.useCallback(() => {
    if (canCreate) {
      setCreateCollectionOpen(true);
    }
  }, [canCreate]);

  // Find the selected collection name
  const selectedCollection = selectedCollectionId 
    ? collections.find(c => c.id === selectedCollectionId)
    : null;

  return (
    <LinksPageContext.Provider value={{ openAddLink, openBulkAdd, openImport, openCreateCollection }}>
      {children}
      {canCreate && (
        <>
          <AddLinkDialog 
            open={addLinkOpen} 
            onOpenChange={setAddLinkOpen}
            selectedCollectionId={selectedCollectionId}
            selectedCollectionName={selectedCollection?.name}
            selectedCollectionColor={selectedCollection?.color}
          />
          <BulkAddLinksDialog
            open={bulkAddOpen}
            onOpenChange={setBulkAddOpen}
            selectedCollectionId={selectedCollectionId}
            collections={collections}
          />
          <ImportLinksDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            selectedCollectionId={selectedCollectionId}
            collections={collections}
          />
          <CreateCollectionDialog open={createCollectionOpen} onOpenChange={setCreateCollectionOpen} />
        </>
      )}
    </LinksPageContext.Provider>
  );
}

interface CreateButtonProps {
  canCreate: boolean;
}

export function CreateButton({ canCreate }: CreateButtonProps) {
  const { openAddLink, openBulkAdd } = useLinksPage();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  if (!canCreate) return null;

  return (
    <div className="relative inline-flex" ref={dropdownRef}>
      <Button
        variant="primary"
        onClick={openAddLink}
        className="rounded-r-none border-r border-white/20 dark:border-white/20"
      >
        Create
      </Button>
      <button
        type="button"
        onClick={() => setDropdownOpen((o) => !o)}
        aria-label="Create options"
        aria-expanded={dropdownOpen}
        className="inline-flex items-center justify-center h-10 px-2 rounded-r-md bg-primary-700 dark:bg-primary-600 text-white hover:bg-primary-800 dark:hover:bg-primary-700 border-2 border-primary-700 dark:border-primary-600 border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdownOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 py-1 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
          <button
            type="button"
            onClick={() => {
              openBulkAdd();
              setDropdownOpen(false);
            }}
            className="mx-1 w-[calc(100%-8px)] rounded-md px-4 py-2 text-left text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Bulk add
          </button>
        </div>
      )}
    </div>
  );
}

interface LinksOverviewActionsMenuProps {
  canCreate: boolean;
  collectionId?: string;
  collections?: Array<{ id: string; name: string; color: string | null }>;
}

export function LinksOverviewActionsMenu({ canCreate, collectionId, collections = [] }: LinksOverviewActionsMenuProps) {
  const { openImport } = useLinksPage();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [exportLoading, setExportLoading] = React.useState<"json" | "csv" | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const filterConfig = React.useMemo(() => getLinkFilterConfig({ collections }), [collections]);

  React.useEffect(() => {
    const mql = typeof window !== "undefined" ? window.matchMedia("(min-width: 640px)") : null;
    if (!mql) return;
    const update = () => setIsMobile(!mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleExport = async (format: "json" | "csv") => {
    setExportLoading(format);
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
      setExportLoading(null);
      setMenuOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        onClick={() => setMenuOpen((o) => !o)}
        disabled={exportLoading !== null}
        aria-label="More actions"
        aria-expanded={menuOpen}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </Button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
          {isMobile && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setFilterOpen(true);
                }}
                className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
              </button>
              <Link
                href={ROUTES.LINKS_ARCHIVE}
                onClick={() => setMenuOpen(false)}
                className="block w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Archive
              </Link>
              <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" aria-hidden />
            </>
          )}
          <button
            type="button"
            disabled={exportLoading !== null}
            onClick={() => handleExport("json")}
            className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {exportLoading === "json" ? "Exporting…" : "Export as JSON"}
          </button>
          <button
            type="button"
            disabled={exportLoading !== null}
            onClick={() => handleExport("csv")}
            className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {exportLoading === "csv" ? "Exporting…" : "Export as CSV"}
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                openImport();
                setMenuOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Import
            </button>
          )}
        </div>
      )}
      <FilterDialog open={filterOpen} onOpenChange={setFilterOpen} config={filterConfig} />
    </div>
  );
}

interface ImportButtonProps {
  canCreate: boolean;
}

export function ImportButton({ canCreate }: ImportButtonProps) {
  const { openImport } = useLinksPage();
  if (!canCreate) return null;
  return (
    <Button variant="outline" onClick={openImport}>
      Import
    </Button>
  );
}

interface CollectionsSidebarProps {
  collections: any[];
  collectionId?: string;
  canCreate: boolean;
}

export function CollectionsSidebar({ collections, collectionId, canCreate }: CollectionsSidebarProps) {
  const { openCreateCollection } = useLinksPage();
  
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Collections</h2>
        {canCreate && (
          <Button variant="outline" onClick={openCreateCollection} className="text-xs">
            + New
          </Button>
        )}
      </div>
      {(!collections || collections.length === 0) ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 p-4 text-center">
          <p>No collections yet. Create one to organize your links.</p>
        </div>
      ) : (
        <CollectionList collections={collections} currentCollectionId={collectionId} />
      )}
    </div>
  );
}

// Legacy component for backward compatibility
interface LinksPageClientProps {
  links?: any[];
  collections?: any[];
  collectionId?: string;
  canCreate?: boolean;
  renderCreateButton?: boolean;
  renderCollections?: boolean;
  renderDialogs?: boolean;
}

export function LinksPageClient({ 
  collections = [], 
  collectionId,
  canCreate = false,
  renderCreateButton = false,
  renderCollections = false,
}: LinksPageClientProps) {
  // Render Create button
  if (renderCreateButton) {
    return <CreateButton canCreate={canCreate} />;
  }

  // Render Collections sidebar
  if (renderCollections) {
    return <CollectionsSidebar collections={collections} collectionId={collectionId} canCreate={canCreate} />;
  }

  return null;
}
