// Human: Declares feature module identifiers and display copy used when admins enable modules for organizations.
// Agent: EXPORTS MODULE_KEYS MODULE_CONFIG; TYPES ModuleKey; READ by admin module toggles and navigation gates.

export const MODULE_KEYS = {
  TICKETS: "tickets",
  TIMETRACKING: "timetracking",
  TODOS: "todos",
  LINKS: "links",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

export const MODULE_CONFIG = {
  [MODULE_KEYS.TICKETS]: {
    key: MODULE_KEYS.TICKETS,
    name: "Tickets",
    description: "Support ticket and issue tracking system",
    defaultEnabled: false,
  },
  [MODULE_KEYS.TIMETRACKING]: {
    key: MODULE_KEYS.TIMETRACKING,
    name: "Time Tracking",
    description: "Track time spent on tasks",
    defaultEnabled: false,
  },
  [MODULE_KEYS.TODOS]: {
    key: MODULE_KEYS.TODOS,
    name: "ToDo",
    description: "Subtasks / todos attached to tickets",
    defaultEnabled: false,
  },
  [MODULE_KEYS.LINKS]: {
    key: MODULE_KEYS.LINKS,
    name: "Links",
    description: "Store and organize bookmarks to websites, files, and resources",
    defaultEnabled: false,
  },
} as const;
