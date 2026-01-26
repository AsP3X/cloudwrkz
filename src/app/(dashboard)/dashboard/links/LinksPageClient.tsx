"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { AddLinkDialog } from "@/components/features/links/AddLinkDialog";
import { CollectionList } from "@/components/features/links/CollectionList";
import { CreateCollectionDialog } from "@/components/features/links/CreateCollectionDialog";
import { Button } from "@/components/ui/Button";

// Context for sharing dialog state
const LinksPageContext = React.createContext<{
  openAddLink: () => void;
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
  const [createCollectionOpen, setCreateCollectionOpen] = React.useState(false);
  const searchParams = useSearchParams();
  const selectedCollectionId = searchParams.get("collection") || undefined;

  const openAddLink = React.useCallback(() => {
    if (canCreate) {
      setAddLinkOpen(true);
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
    <LinksPageContext.Provider value={{ openAddLink, openCreateCollection }}>
      {children}
      {canCreate && (
        <>
          <AddLinkDialog 
            open={addLinkOpen} 
            onOpenChange={setAddLinkOpen}
            selectedCollectionId={selectedCollectionId}
            selectedCollectionName={selectedCollection?.name}
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
  const { openAddLink } = useLinksPage();
  if (!canCreate) return null;
  return (
    <Button variant="primary" onClick={openAddLink}>
      Create
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
