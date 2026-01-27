"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LinkEditForm } from "@/components/features/links/LinkEditForm";
import { LinkDetailHeader } from "./LinkDetailHeader";
import { LinkDetailLayout } from "./LinkDetailLayout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { extractDomain, isYouTubeUrl, extractYouTubeVideoId } from "@/lib/utils/links";
import { LinkMetadataDisplay } from "@/components/features/links/LinkMetadataDisplay";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { Dialog } from "@/components/ui/Dialog";

// Memoized YouTube embed component to prevent reloading when parent re-renders
const YouTubeEmbed = React.memo(({ url }: { url: string }) => {
  if (!isYouTubeUrl(url)) return null;
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  
  return (
    <div 
      className="relative w-full rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg"
      style={{ paddingBottom: "56.25%" }}
    >
      <iframe
        className="absolute top-0 left-0 w-full h-full rounded-xl"
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the URL actually changes
  return prevProps.url === nextProps.url;
});

YouTubeEmbed.displayName = "YouTubeEmbed";

interface LinkDetailContentProps {
  link: {
    id: string;
    title: string;
    url: string;
    description: string | null;
    notes: string | null;
    linkType: string;
    tags: string[];
    isFavorite: boolean;
    rating: number | null;
    createdAt: Date;
    updatedAt: Date | null;
    archivedAt: Date | null;
    metadataExtractedAt: Date | null;
    metadata: any;
    collections: Array<{
      collection: {
        id: string;
        name: string;
        color: string | null;
      };
    }>;
    favicon: string | null;
  };
  collections: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  canEdit: boolean;
  canDelete: boolean;
  userTimezone: string;
}

export const LinkDetailContent = ({
  link,
  collections,
  canEdit,
  canDelete,
  userTimezone,
}: LinkDetailContentProps) => {
  const router = useRouter();
  const [isEditMode, setIsEditMode] = React.useState(false);
  const ratingInputRef = React.useRef<((props: { watch: any; setValue: any }) => React.ReactNode) | null>(null);
  const [formMethods, setFormMethods] = React.useState<{ watch: any; setValue: any } | null>(null);
  const [isRatingInputReady, setIsRatingInputReady] = React.useState(false);
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [showMetadataDialog, setShowMetadataDialog] = React.useState(false);

  const domain = extractDomain(link.url);

  const getLinkTypeColor = (type: string) => {
    switch (type) {
      case "WEBSITE":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "FILE":
        return "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300";
      case "DOCUMENT":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "VIDEO":
        return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
      case "IMAGE":
        return "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300";
      default:
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    }
  };

  const getLinkTypeLabel = (type: string) => {
    switch (type) {
      case "WEBSITE":
        return "Website";
      case "FILE":
        return "File";
      case "DOCUMENT":
        return "Document";
      case "VIDEO":
        return "Video";
      case "IMAGE":
        return "Image";
      default:
        return "Other";
    }
  };

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setIsRatingInputReady(false);
  };

  const handleSaveSuccess = () => {
    setIsEditMode(false);
    setIsRatingInputReady(false);
    router.refresh();
  };


  if (isEditMode) {
    return (
      <div className="space-y-6">
        <LinkDetailHeader
          linkId={link.id}
          linkTitle={link.title}
          linkUrl={link.url}
          createdAt={link.createdAt}
          canEdit={canEdit}
          canDelete={canDelete}
          description={link.description}
          favicon={link.favicon}
          isFavorite={isEditMode && formMethods ? formMethods.watch("isFavorite") : link.isFavorite}
          linkType={link.linkType}
          tags={link.tags}
          notes={link.notes}
          rating={link.rating}
          collections={link.collections}
          metadataExtractedAt={link.metadataExtractedAt}
          userTimezone={userTimezone}
          onEditClick={handleEditClick}
          isEditMode={isEditMode}
          archivedAt={link.archivedAt}
          onFavoriteToggle={formMethods ? () => {
            const currentValue = formMethods.watch("isFavorite");
            formMethods.setValue("isFavorite", !currentValue, { shouldValidate: true });
            forceUpdate(); // Force re-render to update the star
          } : undefined}
          renderRatingInput={isRatingInputReady && formMethods ? () => {
            if (!ratingInputRef.current || typeof ratingInputRef.current !== 'function') {
              return null;
            }
            try {
              return ratingInputRef.current(formMethods);
            } catch (error) {
              console.error('Error rendering rating input:', error);
              return null;
            }
          } : undefined}
        />
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
          <LinkEditForm
            link={{
              id: link.id,
              url: link.url,
              title: link.title,
              description: link.description,
              favicon: link.favicon,
              linkType: link.linkType,
              tags: link.tags,
              notes: link.notes,
              isFavorite: link.isFavorite,
              rating: link.rating,
              collections: link.collections,
            }}
            collections={collections}
            onCancel={handleCancelEdit}
            onSaveSuccess={handleSaveSuccess}
            onRatingInputReady={(renderFn) => {
              if (typeof renderFn === 'function') {
                ratingInputRef.current = renderFn;
                setIsRatingInputReady(true);
                forceUpdate();
              } else {
                console.error('onRatingInputReady received non-function:', renderFn);
                setIsRatingInputReady(false);
              }
            }}
            onFormMethodsReady={(methods) => {
              setFormMethods(methods);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LinkDetailHeader
        linkId={link.id}
        linkTitle={link.title}
        linkUrl={link.url}
        createdAt={link.createdAt}
        canEdit={canEdit}
        canDelete={canDelete}
        description={link.description}
        favicon={link.favicon}
        isFavorite={link.isFavorite}
        linkType={link.linkType}
        tags={link.tags}
        notes={link.notes}
        rating={link.rating}
        collections={link.collections}
        metadataExtractedAt={link.metadataExtractedAt}
        userTimezone={userTimezone}
        onEditClick={handleEditClick}
        isEditMode={isEditMode}
        archivedAt={link.archivedAt}
      />

      <LinkDetailLayout
        sidebar={
          <div className="space-y-4">
            {/* Link Information Section */}
            <div>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mb-3">
                Link Information
              </h3>
              
              {/* Link Type */}
              <div className="mb-4">
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Type
                </label>
                <Badge className={cn(getLinkTypeColor(link.linkType), "text-sm")}>
                  {getLinkTypeLabel(link.linkType)}
                </Badge>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-4"></div>

              {/* Metadata Button */}
              {link.metadata && typeof link.metadata === 'object' && Object.keys(link.metadata).length > 0 && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMetadataDialog(true)}
                    className="w-full justify-start"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    View Metadata
                  </Button>
                </div>
              )}
            </div>

            {/* URL */}
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                URL
              </label>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 break-all"
              >
                {link.url}
              </a>
            </div>

            {/* Domain */}
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                Domain
              </label>
              <p className="text-sm text-neutral-900 dark:text-neutral-100">{domain}</p>
            </div>

            {/* Collections */}
            {link.collections.length > 0 && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2 block">
                    Collections ({link.collections.length})
                  </label>
                  <div className="space-y-2">
                    {link.collections.map((lc) => (
                      <Link
                        key={lc.collection.id}
                        href={`/dashboard/links?collection=${lc.collection.id}`}
                        className="block"
                      >
                        <Badge
                          className="text-xs w-full justify-start"
                          style={{
                            backgroundColor: lc.collection.color ? `${lc.collection.color}20` : undefined,
                            color: lc.collection.color || undefined,
                            borderColor: lc.collection.color || undefined,
                          }}
                        >
                          {lc.collection.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Tags */}
            {link.tags.length > 0 && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2 block">
                    Tags ({link.tags.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {link.tags.map((tag) => (
                      <Badge key={tag} className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

            {/* Timestamps */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Created
                </label>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatDateTimeInTimezone(link.createdAt, userTimezone)}
                </p>
              </div>
              {link.updatedAt && link.updatedAt.getTime() !== link.createdAt.getTime() && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Last Updated
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(link.updatedAt, userTimezone)}
                  </p>
                </div>
              )}
              {link.metadataExtractedAt && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Metadata Extracted
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(link.metadataExtractedAt, userTimezone)}
                  </p>
                </div>
              )}
            </div>

            {/* Archive Status */}
            {link.archivedAt && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Status
                  </label>
                  <Badge className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-sm">
                    Archived
                  </Badge>
                </div>
              </>
            )}
          </div>
        }
      >
        {/* Main Content */}
        <div className="space-y-6">
          {/* Description */}
          {link.description && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
              <div className="w-full break-words">
                <RichTextDisplay content={link.description} />
              </div>
            </div>
          )}

          {/* YouTube Video Embed */}
          <YouTubeEmbed url={link.url} />

          {/* Notes - only show if notes exist and are not empty */}
          {link.notes && (() => {
            // Remove HTML tags and check if there's actual content
            const textContent = link.notes.replace(/<[^>]*>/g, '').trim();
            return textContent.length > 0;
          })() && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Personal Notes</h2>
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-md p-4">
                <RichTextDisplay content={link.notes} />
              </div>
            </div>
          )}

        </div>
      </LinkDetailLayout>

      {/* Metadata Dialog */}
      {link.metadata && typeof link.metadata === 'object' && Object.keys(link.metadata).length > 0 && (
        <Dialog
          open={showMetadataDialog}
          onOpenChange={setShowMetadataDialog}
          title="Extracted Metadata"
          description="Metadata automatically extracted from the link"
          className="sm:max-w-4xl"
        >
          <div className="p-6">
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-6">
              <LinkMetadataDisplay metadata={link.metadata as any} />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
