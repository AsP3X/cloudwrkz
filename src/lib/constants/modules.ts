/**
 * Module keys and configuration
 * These define the available modules in the system
 */
export const MODULE_KEYS = {
  TICKETS: "tickets",
  TIMETRACKING: "timetracking",
  PROJECTS: "projects",
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
    description: "Track time spent on projects and tasks",
    defaultEnabled: false,
  },
  [MODULE_KEYS.PROJECTS]: {
    key: MODULE_KEYS.PROJECTS,
    name: "Projects",
    description: "Project management and organization",
    defaultEnabled: false,
  },
  [MODULE_KEYS.TODOS]: {
    key: MODULE_KEYS.TODOS,
    name: "ToDo",
    description: "Subtasks / todos attached to tickets",
    defaultEnabled: false,
  },
} as const;
