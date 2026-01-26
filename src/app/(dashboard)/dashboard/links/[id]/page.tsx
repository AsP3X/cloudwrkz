import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLink } from "@/server/actions/links";
import { getCollections } from "@/server/actions/collections";
import { hasPermission } from "@/lib/utils/permissions";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { LinkDetailWrapper } from "./LinkDetailWrapper";
import { LinkDetailContent } from "./LinkDetailContent";

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
  
  // Fetch collections for the edit form
  const collections = await getCollections({ archived: false });

  return (
    <LinkDetailWrapper defaultSidebarOpen={true}>
      <LinkDetailContent
        link={link}
        collections={collections.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        }))}
        canEdit={canEdit}
        canDelete={canDelete}
        userTimezone={userTimezone}
      />
    </LinkDetailWrapper>
  );
}
