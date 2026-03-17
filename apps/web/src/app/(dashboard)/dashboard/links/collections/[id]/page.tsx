import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getCollection } from "@/server/actions/collections";
import { formatDate } from "@/lib/utils/date";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LinkListView } from "@/components/features/links/LinkListView";
import { LinkViewProvider } from "@/components/features/links/LinkViewContext";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { EditCollectionButton, ShareCollectionButton } from "./CollectionButtons";
import Link from "next/link";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

interface CollectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CollectionDetailPage({ params }: CollectionDetailPageProps) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const canViewLinks = await canUserViewModule(user.id, MODULE_KEYS.LINKS);

  if (!canViewLinks) {
    return (
      <AccessDeniedWarning
        message={<>You don&apos;t have permission to access the Links module.</>}
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "links_collections" }}
            dialogDescription="If you believe you should have access to the Links module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.LINKS}
        secondaryLabel="Back to Links"
      />
    );
  }

  const collection = await getCollection(id);

  if (!collection) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Collection Not Found</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">The collection you&apos;re looking for doesn&apos;t exist.</p>
        <Link href={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

  const isOwner = collection.ownerId === user.id;
  const links = collection.links.map((lc) => lc.link);

  return (
    <LinkViewProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href={ROUTES.LINKS}>
            <Button variant="outline">← Back to Links</Button>
          </Link>
          <div className="flex items-center gap-2">
            <EditCollectionButton collection={collection} isOwner={isOwner} />
            {isOwner && <ShareCollectionButton collection={collection} />}
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="space-y-4">
            <div>
              <h1
                className="text-2xl font-bold mb-2"
                style={collection.color ? { color: collection.color } : undefined}
              >
                {collection.name}
              </h1>
              {collection.description && (
                <p className="text-neutral-600 dark:text-neutral-400">{collection.description}</p>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <span>
                {collection._count.links} link{collection._count.links !== 1 ? "s" : ""}
              </span>
              <span>•</span>
              <span>Created {formatDate(collection.createdAt)}</span>
              {collection.owner && (
                <>
                  <span>•</span>
                  <span>Owner: {collection.owner.name || collection.owner.email}</span>
                </>
              )}
            </div>

            {collection.members.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Members</h2>
                <div className="flex flex-wrap gap-2">
                  {collection.members.map((member) => (
                    <Badge key={member.id}>
                      {member.user.name || member.user.email} ({member.role})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Links</h2>
          <LinkViewControls />
        </div>

        {links.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
            <svg
              className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No links in this collection</h3>
            <p className="text-neutral-600 dark:text-neutral-400">Add links to this collection to get started.</p>
          </div>
        ) : (
          <LinkListView links={links as any} />
        )}
      </div>
    </LinkViewProvider>
  );
}
