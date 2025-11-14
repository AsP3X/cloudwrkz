/**
 * Module keys and configuration
 * These define the available modules in the system
 */
export const MODULE_KEYS = {
  TICKETS: "tickets",
  ACCOUNTING: "accounting",
  TIMETRACKING: "timetracking",
  ERP: "erp",
  ERM: "erm",
} as const;

export type ModuleKey = typeof MODULE_KEYS[keyof typeof MODULE_KEYS];

export const MODULE_CONFIG = {
  [MODULE_KEYS.TICKETS]: {
    key: MODULE_KEYS.TICKETS,
    name: "Tickets",
    description: "Support ticket and issue tracking system",
    defaultEnabled: true,
  },
  [MODULE_KEYS.ACCOUNTING]: {
    key: MODULE_KEYS.ACCOUNTING,
    name: "Accounting",
    description: "Financial management and accounting tools",
    defaultEnabled: false,
  },
  [MODULE_KEYS.TIMETRACKING]: {
    key: MODULE_KEYS.TIMETRACKING,
    name: "Time Tracking",
    description: "Track time spent on projects and tasks",
    defaultEnabled: false,
  },
  [MODULE_KEYS.ERP]: {
    key: MODULE_KEYS.ERP,
    name: "ERP",
    description: "Enterprise Resource Planning",
    defaultEnabled: false,
  },
  [MODULE_KEYS.ERM]: {
    key: MODULE_KEYS.ERM,
    name: "ERM",
    description: "Enterprise Relationship Management",
    defaultEnabled: false,
  },
} as const;
