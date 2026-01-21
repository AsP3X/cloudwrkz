import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getAllTodos } from "@/server/actions/todos";
import { getTickets } from "@/server/actions/tickets";
import { getTimeEntries } from "@/server/actions/time-tracking";
import { ArchivePageClient, type ArchiveItemType } from "./ArchivePageClient";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ArchivePageProps {
  searchParams: Promise<{
    type?: string;
    q?: string;
  }>;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const [canViewTickets, canViewTodos, canViewTimeTracking] = await Promise.all([
    canUserViewModule(user.id, MODULE_KEYS.TICKETS),
    canUserViewModule(user.id, MODULE_KEYS.TODOS),
    canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING),
  ]);

  const initialTypeParam = (params.type || "all").toLowerCase();
  const initialType: ArchiveItemType =
    initialTypeParam === "tickets"
      ? "tickets"
      : initialTypeParam === "todos"
        ? "todos"
        : initialTypeParam === "time" || initialTypeParam === "timeentries" || initialTypeParam === "time_entries"
          ? "time"
          : "all";

  const [archivedTodos, archivedTickets, archivedTimeEntries] = await Promise.all([
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
  ].sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());

  return (
    <ArchivePageClient
      items={items}
      canView={{ tickets: canViewTickets, todos: canViewTodos, time: canViewTimeTracking }}
      initialType={initialType}
      initialQuery={params.q || ""}
      userTimezone={user.timezone ?? "UTC"}
    />
  );
}

