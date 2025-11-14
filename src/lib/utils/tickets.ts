/**
 * Ticket type utilities and mappings
 */

export type TicketType = "BUG" | "FEATURE" | "QUESTION" | "SUPPORT" | "TASK";

/**
 * Map ticket type to prefix for ticket number generation
 */
export const TICKET_TYPE_PREFIXES: Record<TicketType, string> = {
  BUG: "INC",      // Incident
  SUPPORT: "SRC",  // Service Request
  TASK: "TSK",     // Task
  FEATURE: "CH",   // Change
  QUESTION: "QST", // Question
};

/**
 * Map ticket type enum to display name
 */
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  BUG: "Incident",
  SUPPORT: "Service Request",
  TASK: "Task",
  FEATURE: "Change",
  QUESTION: "Question",
};

/**
 * Get the prefix for a ticket type
 */
export function getTicketTypePrefix(type: TicketType): string {
  return TICKET_TYPE_PREFIXES[type];
}

/**
 * Get the display label for a ticket type
 */
export function getTicketTypeLabel(type: TicketType): string {
  return TICKET_TYPE_LABELS[type];
}

/**
 * Generate a ticket number in the format #PREFIX-000001
 */
export function generateTicketNumber(prefix: string, sequenceNumber: number): string {
  const paddedNumber = sequenceNumber.toString().padStart(6, "0");
  return `#${prefix}-${paddedNumber}`;
}

/**
 * Parse ticket number to extract prefix and sequence
 */
export function parseTicketNumber(ticketNumber: string): { prefix: string; sequence: number } | null {
  const match = ticketNumber.match(/^#([A-Z]+)-(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1],
    sequence: parseInt(match[2], 10),
  };
}
