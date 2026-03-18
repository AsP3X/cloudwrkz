import React, { Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

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
  onEditCollection?: (collection: Collection) => void;
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

export function CollectionFilterBar(props: CollectionFilterBarProps) {
  return (
    <Suspense fallback={null}>
      <CollectionFilterBarInner {...props} />
    </Suspense>
  );
}

function CollectionFilterBarInner({ collections, canCreate, currentUserId, onCreateCollection, onEditCollection }: CollectionFilterBarProps) {
  const [searchParams] = useSearchParams();
  const currentCollectionId = searchParams.get("collection") || undefined;
  const isOwnerOf = (c: Collection) => c.owner != null && c.owner.id === currentUserId;
  const showEditPencil = (c: Collection) => c.id !== SHARED_WITH_ME_COLLECTION_ID;

  const getAllLinksUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("collection");
    const query = params.toString();
    return query ? `/dashboard/links?${query}` : "/dashboard/links";
  };

  const pillBaseClass = "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link
        to={getAllLinksUrl()}
        className={`${pillBaseClass} ${
          !currentCollectionId
            ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }`}
      >
        All Links
      </Link>

      {collections.map((collection) => {
        const isActive = currentCollectionId === collection.id;
        const hasColor = collection.color && /^#[0-9A-Fa-f]{6}$/.test(collection.color);
        const colorValue = hasColor ? collection.color : null;
        const pillStyle =
          hasColor && colorValue
            ? {
                backgroundColor: isActive ? `${colorValue}20` : `${colorValue}15`,
                borderColor: colorValue,
                color: colorValue,
              }
            : undefined;
        const pillClass = `${pillBaseClass} ${
          isActive
            ? hasColor
              ? "border-2"
              : "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
            : hasColor
              ? "border hover:opacity-80"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }`;

        return (
          <React.Fragment key={collection.id}>
            {isActive ? (
              <div
                className={`${pillClass} gap-1 pr-1`}
                style={pillStyle}
              >
                <Link
                  to={`/dashboard/links?collection=${collection.id}`}
                  className="inline-flex items-center gap-2 min-w-0 flex-1 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                >
                  <span>{collection.name}</span>
                  <Badge
                    className="text-xs"
                    style={
                      hasColor && colorValue
                        ? {
                            backgroundColor: isActive ? `${colorValue}30` : `${colorValue}25`,
                            color: colorValue,
                          }
                        : undefined
                    }
                  >
                    {collection.link_count}
                  </Badge>
                </Link>
                {showEditPencil(collection) && onEditCollection && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEditCollection(collection);
                    }}
                    className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 shrink-0"
                    style={colorValue ? { color: colorValue } : undefined}
                    aria-label={isOwnerOf(collection) ? `Edit collection ${collection.name}` : `Remove ${collection.name} from my list`}
                  >
                    {isOwnerOf(collection) ? (
                      <PencilIcon className="w-3.5 h-3.5" />
                    ) : (
                      <RemoveShareIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              <Link
                to={`/dashboard/links?collection=${collection.id}`}
                className={pillClass}
                style={pillStyle}
              >
                <span>{collection.name}</span>
                <Badge
                  className="text-xs"
                  style={
                    hasColor && colorValue
                      ? {
                          backgroundColor: isActive ? `${colorValue}30` : `${colorValue}25`,
                          color: colorValue,
                        }
                      : undefined
                  }
                >
                  {collection.link_count}
                </Badge>
              </Link>
            )}
          </React.Fragment>
        );
      })}

      {canCreate && onCreateCollection && (
        <Button
          variant="outline"
          onClick={onCreateCollection}
          className="text-xs h-7 px-2"
        >
          + New Collection
        </Button>
      )}
    </div>
  );
}
