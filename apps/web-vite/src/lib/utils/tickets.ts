// Human: Ticket type labels, stable prefixes, and helpers for formatting and parsing `#TSK-000123` style ticket numbers.
// Agent: READS TicketType union; generateTicketNumber parseTicketNumber STRING ops; CONST maps TICKET_TYPE_LABELS PREFIXES.

/** Entity identifier prefixes (always 3 letters): TSK=tickets, TDO=todos, TMR=timers, LNK=links. */
export type TicketType = "BUG" | "FEATURE" | "QUESTION" | "SUPPORT" | "TASK";

/** All tickets use the 3-letter prefix TSK. */
export const TICKET_TYPE_PREFIXES: Record<TicketType, string> = {
  BUG: "TSK",
  SUPPORT: "TSK",
  TASK: "TSK",
  FEATURE: "TSK",
  QUESTION: "TSK",
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
