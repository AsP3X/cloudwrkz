"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EditCollectionDialog } from "@/components/features/links/EditCollectionDialog";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: {
    links: number;
  };
}

interface CollectionFilterBarProps {
  collections: Collection[];
  canCreate: boolean;
  onCreateCollection?: () => void;
}

// Pencil/pen icon (Heroicons outline style)
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

export function CollectionFilterBar({ collections, canCreate, onCreateCollection }: CollectionFilterBarProps) {
  const searchParams = useSearchParams();
  const currentCollectionId = searchParams.get("collection") || undefined;
  const [editingCollection, setEditingCollection] = React.useState<Collection | null>(null);

  // Build URL without collection param (for "All" link)
  const getAllLinksUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("collection");
    const query = params.toString();
    return query ? `/dashboard/links?${query}` : "/dashboard/links";
  };

  const pillBaseClass = "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All Links */}
      <Link
        href={getAllLinksUrl()}
        className={`${pillBaseClass} ${
          !currentCollectionId
            ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }`}
      >
        All Links
      </Link>

      {/* Collections */}
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
                  href={`/dashboard/links?collection=${collection.id}`}
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
                    {collection._count.links}
                  </Badge>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingCollection(collection);
                  }}
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 shrink-0"
                  style={colorValue ? { color: colorValue } : undefined}
                  aria-label={`Edit collection ${collection.name}`}
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href={`/dashboard/links?collection=${collection.id}`}
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
                  {collection._count.links}
                </Badge>
              </Link>
            )}
          </React.Fragment>
        );
      })}

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
        />
      )}

      {/* Create Collection Button */}
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
