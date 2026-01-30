import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getAllTodos } from "@/server/actions/todos";
import { getTickets } from "@/server/actions/tickets";
import { getTimeEntries } from "@/server/actions/time-tracking";
import { getLinks } from "@/server/actions/links";
import { ArchivePageClient, type ArchiveItemType } from "./ArchivePageClient";
import { ArchiveFilterLoader } from "./ArchiveFilterLoader";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ArchivePageProps {
  searchParams: Promise<{
    type?: string;
    q?: string;
    sort?: string;
    archivedFrom?: string;
    archivedTo?: string;
  }>;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const [canViewTickets, canViewTodos, canViewTimeTracking, canViewLinks] = await Promise.all([
    canUserViewModule(user.id, MODULE_KEYS.TICKETS),
    canUserViewModule(user.id, MODULE_KEYS.TODOS),
    canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING),
    canUserViewModule(user.id, MODULE_KEYS.LINKS),
  ]);

  const initialTypeParam = (params.type || "all").toLowerCase();
  const requestedType: ArchiveItemType =
    initialTypeParam === "tickets"
      ? "tickets"
      : initialTypeParam === "todos"
        ? "todos"
        : initialTypeParam === "time" || initialTypeParam === "timeentries" || initialTypeParam === "time_entries"
          ? "time"
          : initialTypeParam === "links"
            ? "links"
            : "all";

  // If a user doesn't have access to the requested type, ignore it (and drop the param to avoid broken filter UI).
  const typeAllowed =
    requestedType === "tickets"
      ? canViewTickets
      : requestedType === "todos"
        ? canViewTodos
        : requestedType === "time"
          ? canViewTimeTracking
          : requestedType === "links"
            ? canViewLinks
            : true;

  if (!typeAllowed && params.type) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.sort) qs.set("sort", params.sort);
    if (params.archivedFrom) qs.set("archivedFrom", params.archivedFrom);
    if (params.archivedTo) qs.set("archivedTo", params.archivedTo);
    redirect(`${ROUTES.ARCHIVE}${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  const initialType: ArchiveItemType = typeAllowed ? requestedType : "all";

  const initialSort = params.sort || "archivedAt-desc";
  const initialArchivedFrom = params.archivedFrom || "";
  const initialArchivedTo = params.archivedTo || "";

  const [archivedTodos, archivedTickets, archivedTimeEntries, archivedLinks] = await Promise.all([
    canViewTodos
      ? getAllTodos({
          kind: "all",
          archive: "archived",
          sort: "createdAt-desc",
        })
      : Promise.resolve([]),
    canViewTickets
      ? getTickets({
          archive: "archived",
          sortBy: "updatedAt",
          sortOrder: "desc",
        })
      : Promise.resolve([]),
    canViewTimeTracking
      ? getTimeEntries({
          archive: "archived",
          page: 1,
          limit: 200,
          sortBy: "createdAt",
          sortOrder: "desc",
        }).then((r) => r.entries)
      : Promise.resolve([]),
    canViewLinks
      ? getLinks({
          archived: true,
          sortBy: "createdAt",
          sortOrder: "desc",
          page: 1,
          limit: 500,
        }).then((r) => r.links)
      : Promise.resolve([]),
  ]);

  const items = [
    ...archivedTickets
      .filter((t: any) => t.archivedAt)
      .map((t: any) => ({
        type: "ticket" as const,
        id: t.id as string,
        title: t.title as string,
        description: (t.descriptionPlain ?? t.description ?? null) as string | null,
        url: `/dashboard/tickets/${t.id}`,
        archivedAt: t.archivedAt as Date,
        subtitle: t.ticketNumber as string,
      })),
    ...archivedTodos
      .filter((td: any) => td.archivedAt)
      .map((td: any) => ({
        type: "todo" as const,
        id: td.id as string,
        title: td.title as string,
        description: (td.descriptionPlain ?? td.description ?? null) as string | null,
        url: `/dashboard/todos/${td.id}`,
        archivedAt: td.archivedAt as Date,
        subtitle: (td.todoNumber ?? "Todo") as string,
      })),
    ...archivedTimeEntries
      .filter((e: any) => e.archivedAt)
      .map((e: any) => ({
        type: "timeEntry" as const,
        id: e.id as string,
        title: e.name as string,
        description: (e.description ?? null) as string | null,
        url: `/dashboard/time-tracking/${e.id}`,
        archivedAt: e.archivedAt as Date,
        subtitle: e.ticket?.ticketNumber ? (e.ticket.ticketNumber as string) : "Time entry",
      })),
    ...archivedLinks
      .filter((l: any) => l.archivedAt)
      .map((l: any) => ({
        type: "link" as const,
        id: l.id as string,
        title: l.title as string,
        description: (l.description ?? null) as string | null,
        url: `/dashboard/links/${l.id}`,
        archivedAt: l.archivedAt as Date,
        subtitle: l.url as string,
      })),
  ].sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());

  return (
    <>
      {/* Auto-load last used archive filters */}
      <ArchiveFilterLoader canView={{ tickets: canViewTickets, todos: canViewTodos, time: canViewTimeTracking, links: canViewLinks }} />
      <ArchivePageClient
        items={items}
        canView={{ tickets: canViewTickets, todos: canViewTodos, time: canViewTimeTracking, links: canViewLinks }}
        initialType={initialType}
        initialQuery={params.q || ""}
        initialSort={initialSort}
        initialArchivedFrom={initialArchivedFrom}
        initialArchivedTo={initialArchivedTo}
        userTimezone={user.timezone ?? "UTC"}
      />
    </>
  );
}

