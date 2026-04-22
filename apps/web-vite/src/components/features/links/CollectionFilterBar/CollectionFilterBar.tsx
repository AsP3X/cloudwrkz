import React, { Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { EditCollectionDialog } from "@/components/features/links/EditCollectionDialog/EditCollectionDialog";

// Human: React UI for `CollectionFilterBar` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS CollectionFilterBar; REACT component; READS props hooks; MAY CALL api client.
const SHARED_WITH_ME_COLLECTION_ID = "__shared_with_me__";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  link_count: number;
  owner?: { id: string; name: string | null; email: string };
}

interface CollectionFilterBarProps {
  collections: Collection[];
  canCreate: boolean;
  currentUserId: string;
  onCreateCollection?: () => void;
  onCollectionsUpdated?: () => void;
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function RemoveShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

export function CollectionFilterBar(props: CollectionFilterBarProps) {
  return (
    <Suspense fallback={null}>
      <CollectionFilterBarInner {...props} />
    </Suspense>
  );
}

const chipBase =
  "inline-flex items-center gap-1.5 max-w-full rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900";

function CollectionFilterBarInner({
  collections,
  canCreate,
  currentUserId,
  onCreateCollection,
  onCollectionsUpdated,
}: CollectionFilterBarProps) {
  const [searchParams] = useSearchParams();
  const currentCollectionId = searchParams.get("collection") || undefined;
  const [editingCollection, setEditingCollection] = React.useState<Collection | null>(null);
  const isOwnerOf = (c: Collection) => c.owner != null && c.owner.id === currentUserId;
  const showEditPencil = (c: Collection) => c.id !== SHARED_WITH_ME_COLLECTION_ID;

  const getAllLinksUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("collection");
    const query = params.toString();
    return query ? `/dashboard/links?${query}` : "/dashboard/links";
  };

  const hexOk = (c: string | null) => Boolean(c && /^#[0-9A-Fa-f]{6}$/.test(c));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 pt-0.5 sm:w-28 sm:shrink-0">
        Collections
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <Link
          to={getAllLinksUrl()}
          className={cn(
            chipBase,
            !currentCollectionId
              ? "border-primary-600 bg-primary-600 text-white shadow-sm"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800/80"
          )}
        >
          <span className="truncate">All links</span>
        </Link>

        {collections.map((collection) => {
          const isActive = currentCollectionId === collection.id;
          const hasColor = hexOk(collection.color);
          const colorValue = hasColor ? collection.color! : null;

          const dot = hasColor && colorValue && (
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", isActive && "ring-2 ring-white/40")}
              style={{ backgroundColor: colorValue }}
              aria-hidden
            />
          );

          if (isActive) {
            return (
              <div
                key={collection.id}
                className="inline-flex max-w-full min-w-0 items-stretch rounded-lg border border-primary-600 bg-primary-600 shadow-sm"
              >
                <Link
                  to={`/dashboard/links?collection=${collection.id}`}
                  className="inline-flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white"
                >
                  {dot}
                  <span className="truncate">{collection.name}</span>
                  <span className="tabular-nums text-xs text-white/85">{collection.link_count}</span>
                </Link>
                {showEditPencil(collection) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingCollection(collection);
                    }}
                    className="flex shrink-0 items-center border-l border-white/20 px-2 text-white/90 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label={isOwnerOf(collection) ? `Edit collection ${collection.name}` : `Remove ${collection.name} from my list`}
                  >
                    {isOwnerOf(collection) ? (
                      <PencilIcon className="h-3.5 w-3.5" />
                    ) : (
                      <RemoveShareIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          }

          return (
            <Link
              key={collection.id}
              to={`/dashboard/links?collection=${collection.id}`}
              className={cn(
                chipBase,
                "min-w-0 border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-800/80"
              )}
            >
              {dot}
              <span className="truncate">{collection.name}</span>
              <span className="tabular-nums text-xs text-neutral-500 dark:text-neutral-400">{collection.link_count}</span>
            </Link>
          );
        })}

        {canCreate && onCreateCollection && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCreateCollection}
            className="h-9 gap-1.5 rounded-lg border-dashed border-neutral-300 px-2.5 text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/80"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>

      {editingCollection && (
        <EditCollectionDialog
          open={!!editingCollection}
          onOpenChange={(open) => !open && setEditingCollection(null)}
          collection={{
            id: editingCollection.id,
            name: editingCollection.name,
            description: editingCollection.description,
            color: editingCollection.color,
          }}
          isOwner={isOwnerOf(editingCollection)}
          onUpdated={onCollectionsUpdated}
        />
      )}
    </div>
  );
}
