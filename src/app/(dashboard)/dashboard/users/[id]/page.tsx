import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatUserName, formatUserInitial } from "@/lib/utils/users";
import { formatDateTime } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTickets } from "@/server/actions/tickets";
import { getUserById } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TicketFilterButton } from "@/components/features/tickets/TicketFilterButton";
import { TicketListView } from "@/components/features/tickets/TicketListView";
import { TicketViewProvider } from "@/components/features/tickets/TicketViewContext";
import { TicketViewControls } from "@/components/features/tickets/TicketViewControls";

interface UserDetailPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    status?: string;
    priority?: string;
    type?: string;
    assignedToGroup?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sort?: string;
  }>;
}

export default async function UserDetailPage({ params, searchParams }: UserDetailPageProps) {
  const currentUser = await getCurrentUser();
  const { id } = await params;
  const urlParams = await searchParams;

  // Only agents, admins, and moderators can view user details
  if (!currentUser || (currentUser.role !== "AGENT" && currentUser.role !== "ADMIN" && currentUser.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  // Validate user ID
  if (!id || typeof id !== "string") {
    redirect("/dashboard/tickets");
  }

  // Get user details
  let user;
  try {
    user = await getUserById(id);
    if (!user) {
      // User not found - redirect to tickets page
      redirect("/dashboard/tickets");
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    // Redirect to tickets page on error
    redirect("/dashboard/tickets");
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);

  // Parse sort parameter
  const sortParam = urlParams.sort || "createdAt-desc";
  const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "updatedAt", "asc" | "desc"];

  // Build filters - always filter by tickets created by this user
  const filters: any = {
    createdById: id,
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc",
  };

  if (urlParams.status) {
    filters.status = urlParams.status;
  }
  if (urlParams.priority) {
    filters.priority = urlParams.priority;
  }
  if (urlParams.type) {
    filters.type = urlParams.type;
  }
  if (urlParams.assignedToGroup) {
    filters.assignedToGroupId = urlParams.assignedToGroup;
  }
  if (urlParams.createdFrom) {
    filters.createdFrom = urlParams.createdFrom;
  }
  if (urlParams.createdTo) {
    filters.createdTo = urlParams.createdTo;
  }
  if (urlParams.updatedFrom) {
    filters.updatedFrom = urlParams.updatedFrom;
  }
  if (urlParams.updatedTo) {
    filters.updatedTo = urlParams.updatedTo;
  }

  // Get tickets created by this user
  const tickets = ticketsEnabled ? await getTickets(filters) : [];

  // Get groups for filter dropdown
  const groups = await getGroups();


  const getRoleBadge = (role: string) => {
    switch (role) {
      case "AGENT":
        return {
          label: "Agent",
          className: "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800",
        };
      case "ADMIN":
        return {
          label: "Admin",
          className: "bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
        };
      case "MODERATOR":
        return {
          label: "Moderator",
          className: "bg-secondary-100 dark:bg-secondary-900 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-800",
        };
      default:
        return {
          label: "User",
          className: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return {
          label: "Active",
          className: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
        };
      case "PENDING":
        return {
          label: "Pending",
          className: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
        };
      case "SUSPENDED":
        return {
          label: "Suspended",
          className: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
        };
      default:
        return {
          label: status,
          className: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
        };
    }
  };

  const roleBadge = getRoleBadge(user.role);
  const statusBadge = getStatusBadge(user.status);

  return (
    <TicketViewProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-semibold text-primary-700 dark:text-primary-300">
                {formatUserInitial(user)}
              </span>
            </div>

            {/* User Info */}
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                  {formatUserName(user)}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${roleBadge.className}`}
                >
                  {roleBadge.label}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400 mt-1">{user.email}</p>
              {user.bio && (
                <p className="text-neutral-600 dark:text-neutral-400 mt-2 max-w-2xl">{user.bio}</p>
              )}
            </div>
          </div>
        </div>

        {/* User Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Created Tickets</p>
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {user._count.createdTickets}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary-600 dark:text-primary-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Assigned Tickets</p>
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {user._count.assignedTickets}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Member Since</p>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-1">
                  {formatDate(user.createdAt)}
                </p>
              </div>
              <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-neutral-600 dark:text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tickets Section */}
        {ticketsEnabled ? (
          <>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  Tickets Created by {formatUserName(user)}
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                  View and filter all tickets created by this user
                </p>
              </div>
              <div className="flex items-center gap-3">
                <TicketViewControls />
                <TicketFilterButton users={[]} groups={groups} isAgent={true} />
              </div>
            </div>

            {/* Results Count */}
            {tickets.length > 0 && (
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                Showing {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
              </div>
            )}

            {/* Tickets List */}
            {tickets.length === 0 ? (
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No tickets found
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {formatUserName(user)} hasn&apos;t created any tickets yet.
                </p>
              </div>
            ) : (
              <TicketListView tickets={tickets} />
            )}
          </>
        ) : (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              Tickets Module Disabled
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              The tickets module is not currently enabled. Please contact an administrator.
            </p>
          </div>
        )}
      </div>
    </TicketViewProvider>
  );
}
