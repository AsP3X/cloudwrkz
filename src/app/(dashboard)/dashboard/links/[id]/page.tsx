import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLink } from "@/server/actions/links";
import { hasPermission } from "@/lib/utils/permissions";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { extractDomain } from "@/lib/utils/links";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { LinkDetailWrapper } from "./LinkDetailWrapper";
import { LinkDetailHeader } from "./LinkDetailHeader";
import { LinkDetailLayout } from "./LinkDetailLayout";
import { cn } from "@/lib/utils/cn";
import { handleArchiveLink, handleUnarchiveLink } from "./actions";
import { LinkMetadataDisplay } from "@/components/features/links/LinkMetadataDisplay";

interface LinkDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LinkDetailPage({ params }: LinkDetailPageProps) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const canViewLinks = await canUserViewModule(user.id, MODULE_KEYS.LINKS);

  if (!canViewLinks) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          You don&apos;t have permission to access the Links module.
        </p>
      </div>
    );
  }

  const link = await getLink(id);

  if (!link) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Link Not Found</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          The link you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
        </p>
        <Link href={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

  const canEdit = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "links.update");
  
  const canDelete = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "links.delete");

  const userTimezone = user.timezone ?? "UTC";
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

  return (
    <LinkDetailWrapper defaultSidebarOpen={true}>
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
        />

        <LinkDetailLayout
          sidebar={
            <div className="space-y-4">
              {/* Link Type */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Type
                </label>
                <Badge className={cn(getLinkTypeColor(link.linkType), "text-sm")}>
                  {getLinkTypeLabel(link.linkType)}
                </Badge>
              </div>

              {/* Rating */}
              {link.rating && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Rating
                  </label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${
                          star <= link.rating!
                            ? "text-yellow-500 fill-current"
                            : "text-neutral-300 dark:text-neutral-600"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
              )}

              {/* Favorite */}
              {link.isFavorite && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Favorite
                  </label>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sm text-neutral-900 dark:text-neutral-100">Yes</span>
                  </div>
                </div>
              )}

              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

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
                <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{link.description}</p>
              </div>
            )}

            {/* Notes */}
            {link.notes && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Personal Notes</h2>
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-md p-4">
                  <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{link.notes}</p>
                </div>
              </div>
            )}

            {/* Metadata */}
            {link.metadata && typeof link.metadata === 'object' && Object.keys(link.metadata).length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Extracted Metadata</h2>
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-6">
                  <LinkMetadataDisplay metadata={link.metadata as any} />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Actions</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="primary" className="w-full">
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
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    Open Link in New Tab
                  </Button>
                </a>
                {link.archivedAt ? (
                  <form action={handleUnarchiveLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <Button type="submit" variant="outline" className="w-full sm:w-auto">
                      Unarchive
                    </Button>
                  </form>
                ) : (
                  <form action={handleArchiveLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <Button type="submit" variant="outline" className="w-full sm:w-auto">
                      Archive
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </LinkDetailLayout>
      </div>
    </LinkDetailWrapper>
  );
}
