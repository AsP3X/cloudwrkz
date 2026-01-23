import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLink, deleteLink } from "@/server/actions/links";
import { formatDate } from "@/lib/utils/date";
import { extractDomain } from "@/lib/utils/links";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EditLinkDialog } from "@/components/features/links/EditLinkDialog";
import Link from "next/link";
import React from "react";

// Client component wrapper
function EditLinkButtonWrapper({ link }: { link: any }) {
  return <EditLinkButton link={link} />;
}

// Client component for edit button
function EditLinkButton({ link }: { link: any }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <EditLinkDialog open={open} onOpenChange={setOpen} link={link} />
    </>
  );
}

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
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">The link you&apos;re looking for doesn&apos;t exist.</p>
        <Link href={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={ROUTES.LINKS}>
          <Button variant="outline">← Back to Links</Button>
        </Link>
        <div className="flex items-center gap-2">
          <EditLinkButton link={link} />
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            {link.favicon && (
              <img
                src={link.favicon}
                alt=""
                className="w-12 h-12 flex-shrink-0 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{link.title}</h1>
                {link.isFavorite && (
                  <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                )}
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm"
              >
                {domain} ↗
              </a>
            </div>
          </div>

          {/* Description */}
          {link.description && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Description</h2>
              <p className="text-neutral-600 dark:text-neutral-400">{link.description}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Type</h3>
              <Badge className={getLinkTypeColor(link.linkType)}>{getLinkTypeLabel(link.linkType)}</Badge>
            </div>
            {link.rating && (
              <div>
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Rating</h3>
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
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Created</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{formatDate(link.createdAt)}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Updated</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{formatDate(link.updatedAt)}</p>
            </div>
          </div>

          {/* Tags */}
          {link.tags.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {link.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Collections */}
          {link.collections.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Collections</h2>
              <div className="flex flex-wrap gap-2">
                {link.collections.map((lc) => (
                  <Link
                    key={lc.collection.id}
                    href={`/dashboard/links?collection=${lc.collection.id}`}
                    className="inline-block"
                  >
                    <Badge
                      style={{
                        backgroundColor: lc.collection.color ? `${lc.collection.color}20` : undefined,
                        color: lc.collection.color || undefined,
                      }}
                    >
                      {lc.collection.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {link.notes && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Notes</h2>
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-md p-4">
                <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{link.notes}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="primary" className="w-full">
                Open Link ↗
              </Button>
            </a>
            <EditLinkButton link={link} />
          </div>
        </div>
      </div>
    </div>
  );
}
