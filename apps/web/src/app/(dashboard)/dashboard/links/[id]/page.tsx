import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLink, linkExists } from "@/server/actions/links";
import { getCollections } from "@/server/actions/collections";
import { hasPermission } from "@/lib/utils/permissions";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { LinkDetailWrapper } from "./LinkDetailWrapper";
import { LinkDetailContent } from "./LinkDetailContent";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

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
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Links module. Please contact an
            administrator. If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "links_module" }}
            dialogDescription="If you believe you should have access to the Links module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  const link = await getLink(id);

  if (!link) {
    const exists = await linkExists(id);

    if (exists) {
      // Link exists but current user has no access
      return (
        <AccessDeniedWarning
          message={
            <>
              You don&apos;t have permission to view this link. The permission may have been removed
              or you may not have been granted access. If you believe this is a mistake, you can
              create a support ticket so an administrator can review your access.
            </>
          }
          primaryLabel="Create Ticket"
          customPrimary={
            <AccessIssueTicketDialog
              primaryLabel="Create Ticket"
              action={createAccessIssueTicket}
            hiddenFields={{ context: "link_detail", entityId: id }}
              dialogDescription="If you believe you should have access to this link, please describe why. Your explanation will be included in the support ticket."
            />
          }
          secondaryHref={ROUTES.LINKS}
          secondaryLabel="Back to Links"
        />
      );
    }

    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-200 shrink-0">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path
                d="M12 3.25c-.3 0-.6.07-.88.2l-5 2.38A1.75 1.75 0 0 0 5 7.42v4.78c0 1.9.93 3.68 2.48 4.77l3.75 2.59c.46.32 1.08.32 1.54 0l3.75-2.59A5.83 5.83 0 0 0 19 12.2V7.42c0-.69-.4-1.32-1.12-1.59l-5-2.38c-.28-.13-.58-.2-.88-.2Z"
                className="fill-current"
              />
              <path
                d="M12 9.25c-.69 0-1.25.56-1.25 1.25v3c0 .69.56 1.25 1.25 1.25s1.25-.56 1.25-1.25v-3c0-.69-.56-1.25-1.25-1.25Zm0 7.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                className="fill-amber-900 dark:fill-amber-100"
              />
            </svg>
          </div>
          <div className="flex-1 space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              Link not found
            </h2>
            <p className="text-sm sm:text-base text-neutral-700 dark:text-neutral-300">
              The link you&apos;re looking for doesn&apos;t exist or may have been removed.
            </p>
          </div>
          <div className="shrink-0">
            <Link href={ROUTES.LINKS}>
              <Button variant="primary" size="sm">
                Back to Links
              </Button>
            </Link>
          </div>
        </div>
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

  const isOwner = link.userId === user.id;
  // Collection owner can always edit/delete links in their collection
  const isCollectionOwner = link.collections.some(
    (lc) => lc.collection.ownerId === user.id
  );
  const canEditThisLink = canEdit && (isOwner || isCollectionOwner);
  const canDeleteThisLink = canDelete && (isOwner || isCollectionOwner);

  return (
    <LinkDetailWrapper defaultSidebarOpen={true}>
      <LinkDetailContent
        link={link}
        collections={collections.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        }))}
        canEdit={canEditThisLink}
        canDelete={canDeleteThisLink}
        userTimezone={userTimezone}
        currentUserId={user.id}
        isOwner={isOwner}
      />
    </LinkDetailWrapper>
  );
}
