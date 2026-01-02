/**
 * Module keys and configuration
 * These define the available modules in the system
 */
export const MODULE_KEYS = {
  TICKETS: "tickets",
  TIMETRACKING: "timetracking",
  TODOS: "todos",
} as const;

export type ModuleKey = typeof MODULE_KEYS[keyof typeof MODULE_KEYS];

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
} as const;
