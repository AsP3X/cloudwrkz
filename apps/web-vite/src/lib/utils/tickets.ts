export type TicketType = "BUG" | "FEATURE" | "QUESTION" | "SUPPORT" | "TASK";

export const TICKET_TYPE_PREFIXES: Record<TicketType, string> = {
  BUG: "INC",
  SUPPORT: "SRC",
  TASK: "TSK",
  FEATURE: "CH",
  QUESTION: "QST",
};

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  BUG: "Incident",
  SUPPORT: "Service Request",
  TASK: "Task",
  FEATURE: "Change",
  QUESTION: "Question",
};

export function getTicketTypePrefix(type: TicketType): string {
  return TICKET_TYPE_PREFIXES[type];
}

export function getTicketTypeLabel(type: TicketType): string {
  return TICKET_TYPE_LABELS[type];
}

export function generateTicketNumber(prefix: string, sequenceNumber: number): string {
  const paddedNumber = sequenceNumber.toString().padStart(6, "0");
  return `#${prefix}-${paddedNumber}`;
}

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
