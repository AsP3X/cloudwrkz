/**
 * Access-issue ticket context config (mirrors Next.js server/actions/access-issues.ts).
 * Used when creating a ticket from the "Access Denied" dialog.
 */
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

interface ContextConfig {
  title: string;
  descriptionIntro: string;
  expectedBehavior: string[];
  permissionNote: string;
}

const CONTEXT_CONFIG: Record<AccessIssueContext, ContextConfig> = {
  todos_overview: {
    title: "Access issue: todos overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the todos overview.",
    expectedBehavior: [
      "I should be able to access the todos overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing todos.",
  },
  todo_create: {
    title: "Access issue: create todo",
    descriptionIntro: "encountered an Access Denied error when trying to create a todo.",
    expectedBehavior: [
      "I should be able to create todos, or",
      "I should see clear information about why creating todos is restricted.",
    ],
    permissionNote: "Please review my permissions for creating todos.",
  },
  todos_module: {
    title: "Access issue: todos module",
    descriptionIntro: "encountered an Access Denied error when trying to access the ToDo module.",
    expectedBehavior: [
      "I should be able to access the ToDo module, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for accessing todos.",
  },
  todo_detail: {
    title: "Access issue: permission denied for todo",
    descriptionIntro: "encountered an Access Denied error when trying to view a todo.",
    expectedBehavior: [
      "I should be able to access this todo, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this todo's assignments.",
  },
  time_tracking_overview: {
    title: "Access issue: time tracking overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the time tracking overview.",
    expectedBehavior: [
      "I should be able to access the time tracking overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing time entries.",
  },
  time_tracking_module: {
    title: "Access issue: time tracking module",
    descriptionIntro: "encountered an Access Denied error when trying to access the Time Tracking module.",
    expectedBehavior: [
      "I should be able to access the Time Tracking module, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for the Time Tracking module.",
  },
  time_entry_detail: {
    title: "Access issue: permission denied for time entry",
    descriptionIntro: "encountered an Access Denied error when trying to view a time entry.",
    expectedBehavior: [
      "I should be able to access this time entry, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this time entry.",
  },
  tickets_overview: {
    title: "Access issue: tickets overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the tickets overview.",
    expectedBehavior: [
      "I should be able to access the tickets overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing tickets.",
  },
  ticket_detail: {
    title: "Access issue: permission denied",
    descriptionIntro: "encountered an Access Denied error when trying to view a ticket.",
    expectedBehavior: [
      "I should be able to access this ticket, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this ticket's assignments/groups.",
  },
  links_overview: {
    title: "Access issue: links overview",
    descriptionIntro: "encountered an Access Denied error when trying to access the links overview.",
    expectedBehavior: [
      "I should be able to access the links overview, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing links.",
  },
  links_collections: {
    title: "Access issue: links collections",
    descriptionIntro: "encountered an Access Denied error when trying to access link collections.",
    expectedBehavior: [
      "I should be able to access link collections, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for viewing collections.",
  },
  links_archive: {
    title: "Access issue: links archive",
    descriptionIntro: "encountered an Access Denied error when trying to access the links archive.",
    expectedBehavior: [
      "I should be able to access the links archive, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for the archive.",
  },
  links_module: {
    title: "Access issue: links module",
    descriptionIntro: "encountered an Access Denied error when trying to access the Links module.",
    expectedBehavior: [
      "I should be able to access the Links module, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions for the Links module.",
  },
  link_detail: {
    title: "Access issue: permission denied for link",
    descriptionIntro: "encountered an Access Denied error when trying to view a link.",
    expectedBehavior: [
      "I should be able to access this link, or",
      "I should see clear information about why access is restricted.",
    ],
    permissionNote: "Please review my permissions and this link's visibility.",
  },
};

export function getAccessIssueConfig(context: string): ContextConfig | null {
  return (CONTEXT_CONFIG as Record<string, ContextConfig>)[context] ?? null;
}

export function buildAccessIssueDescription(
  context: string,
  userEmail: string,
  reason: string,
  entityId?: string
): { title: string; description: string } | null {
  const config = getAccessIssueConfig(context);
  if (!config) return null;

  const descriptionLines = [
    `User ${userEmail} ${config.descriptionIntro}`,
    ...(entityId ? [`Entity ID: ${entityId}`, ""] : []),
    "",
    "Expected behavior:",
    ...config.expectedBehavior.map((line) => `• ${line}`),
    "",
    config.permissionNote,
    "",
    "User-provided details about this request:",
    (reason || "").trim() || "No additional details were provided.",
  ];

  return {
    title: config.title,
    description: descriptionLines.join("\n"),
  };
}
