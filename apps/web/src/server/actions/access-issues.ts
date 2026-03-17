"use server";

import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { createTicket } from "@/server/actions/tickets";

/** Context for access-issue tickets. Pass via form hidden field "context". */
export type AccessIssueContext =
  | "todos_overview"
  | "todo_create"
  | "todos_module"
  | "todo_detail"
  | "time_tracking_overview"
  | "time_tracking_module"
  | "time_entry_detail"
  | "tickets_overview"
  | "ticket_detail"
  | "links_overview"
  | "links_collections"
  | "links_archive"
  | "links_module"
  | "link_detail";

const CONTEXT_CONFIG: Record<
  AccessIssueContext,
  { title: string; descriptionIntro: string; expectedBehavior: string[]; permissionNote: string; tags: string[] }
> = {
  todos_overview: {
    title: "Access issue: todos overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the todos overview.",
    expectedBehavior: [
      "I should be able to access the todos overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing todos.",
    tags: ["access-issue", "todos_overview"],
  },
  todo_create: {
    title: "Access issue: create todo",
    descriptionIntro: "encountered an Access Denied error when trying to create a todo.",
    expectedBehavior: [
      "I should be able to create todos, or",
      "I should see clear information about why creating todos is restricted.",
    ],
    permissionNote: "Please review my permissions for creating todos.",
    tags: ["access-issue", "todo_create"],
  },
  todos_module: {
    title: "Access issue: todos module",
    descriptionIntro: "encountered an Access Denied error when trying to access the ToDo module.",
    expectedBehavior: [
      "I should be able to access the ToDo module, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for accessing todos.",
    tags: ["access-issue", "todos_module"],
  },
  todo_detail: {
    title: "Access issue: permission denied for todo",
    descriptionIntro: "encountered an Access Denied error when trying to view a todo.",
    expectedBehavior: [
      "I should be able to access this todo, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this todo's assignments.",
    tags: ["access-issue", "todo_detail"],
  },
  time_tracking_overview: {
    title: "Access issue: time tracking overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the time tracking overview.",
    expectedBehavior: [
      "I should be able to access the time tracking overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing time entries.",
    tags: ["access-issue", "time_tracking_overview"],
  },
  time_tracking_module: {
    title: "Access issue: time tracking module",
    descriptionIntro: "encountered an Access Denied error when trying to access the Time Tracking module.",
    expectedBehavior: [
      "I should be able to access the Time Tracking module, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for the Time Tracking module.",
    tags: ["access-issue", "time_tracking_module"],
  },
  time_entry_detail: {
    title: "Access issue: permission denied for time entry",
    descriptionIntro: "encountered an Access Denied error when trying to view a time entry.",
    expectedBehavior: [
      "I should be able to access this time entry, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this time entry.",
    tags: ["access-issue", "time_entry_detail"],
  },
  tickets_overview: {
    title: "Access issue: tickets overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the tickets overview.",
    expectedBehavior: [
      "I should be able to access the tickets overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing tickets.",
    tags: ["access-issue", "tickets_overview"],
  },
  ticket_detail: {
    title: "Access issue: permission denied",
    descriptionIntro: "encountered an Access Denied error when trying to view a ticket.",
    expectedBehavior: [
      "I should be able to access this ticket, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this ticket's assignments/groups.",
    tags: ["access-issue", "ticket_detail"],
  },
  links_overview: {
    title: "Access issue: links overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the links overview.",
    expectedBehavior: [
      "I should be able to access the links overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing links.",
    tags: ["access-issue", "links_overview"],
  },
  links_collections: {
    title: "Access issue: links collections",
    descriptionIntro: "encountered an Access Denied error when trying to access link collections.",
    expectedBehavior: [
      "I should be able to access link collections, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing collections.",
    tags: ["access-issue", "links_collections"],
  },
  links_archive: {
    title: "Access issue: links archive",
    descriptionIntro: "encountered an Access Denied error when trying to access the links archive.",
    expectedBehavior: [
      "I should be able to access the links archive, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing the archive.",
    tags: ["access-issue", "links_archive"],
  },
  links_module: {
    title: "Access issue: links module",
    descriptionIntro: "encountered an Access Denied error when trying to access the Links module.",
    expectedBehavior: [
      "I should be able to access the Links module, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for the Links module.",
    tags: ["access-issue", "links_module"],
  },
  link_detail: {
    title: "Access issue: permission denied for link",
    descriptionIntro: "encountered an Access Denied error when trying to view a link.",
    expectedBehavior: [
      "I should be able to access this link, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this link's visibility.",
    tags: ["access-issue", "link_detail"],
  },
};

/**
 * Single stable Server Action for creating access-issue support tickets.
 * Context (and optional entityId) must be passed via formData so the action ID stays stable.
 * Use AccessIssueTicketDialog with hiddenFields={{ context: "...", entityId: "..." }}.
 */
export async function createAccessIssueTicket(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const context = (formData.get("context") as string | null) ?? "";
  const entityId = (formData.get("entityId") as string | null) ?? undefined;
  const rawReason = (formData.get("reason") as string | null) ?? "";
  const trimmedReason = rawReason.trim();

  const config = CONTEXT_CONFIG[context as AccessIssueContext];
  if (!config) {
    return;
  }

  const descriptionLines = [
    `User ${user.email} ${config.descriptionIntro}`,
    ...(entityId ? [`Entity ID: ${entityId}`, ""] : []),
    "",
    "Expected behavior:",
    ...config.expectedBehavior.map((line) => `• ${line}`),
    "",
    config.permissionNote,
    "",
    "User-provided details about this request:",
    trimmedReason || "No additional details were provided.",
  ];

  const result = await createTicket({
    title: config.title,
    description: descriptionLines.join("\n"),
    type: "SUPPORT",
    priority: "MEDIUM",
    tags: config.tags,
  });

  if (result.success && result.data) {
    redirect(`/dashboard/tickets/${result.data.id}`);
  }
}
