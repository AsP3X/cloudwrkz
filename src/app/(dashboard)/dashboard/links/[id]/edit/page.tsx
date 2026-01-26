import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLink } from "@/server/actions/links";
import { hasPermission } from "@/lib/utils/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LinkEditForm } from "@/components/features/links/LinkEditForm";
import { getUserCollections } from "@/server/actions/collections";
import { notFound } from "next/navigation";

interface LinkEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function LinkEditPage({ params }: LinkEditPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const canViewLinks = await canUserViewModule(user.id, MODULE_KEYS.LINKS);

  if (!canViewLinks) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Links module.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const link = await getLink(id);

  if (!link) {
    notFound();
  }

  // Check if user can edit this link
  const canEdit = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    (link.userId === user.id) ||
    await hasPermission(user.id, "links.update");

  if (!canEdit) {
    redirect(`/dashboard/links/${id}`);
  }

  // Get collections for the form
  const collections = await getUserCollections("");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/links/${id}`}>
            <Button variant="outline" size="sm">
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Link
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Edit Link</h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Update link information, description, and metadata
            </p>
          </div>
        </div>
      </div>

      {/* Edit Form Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <LinkEditForm
          link={{
            id: link.id,
            url: link.url,
            title: link.title,
            description: link.description,
            linkType: link.linkType,
            tags: link.tags,
            notes: link.notes,
            isFavorite: link.isFavorite,
            rating: link.rating,
            collections: link.collections,
          }}
          collections={collections.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
        />
      </div>
    </div>
  );
}
