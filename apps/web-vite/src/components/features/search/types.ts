// Human: Shared TypeScript shapes for global search UX and result handling, keeping props and API payloads consistent across the `search` UI.
// Agent: SCOPE search; QUERY results preview; DEFINES types only; NO React; NO IO.
export interface SearchResult {
  id: string;
  type: "ticket" | "task" | "user" | "comment" | "timeentry" | "setting" | "link" | "customer" | "employee";
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
  context?: string;
  contextHighlight?: string;
  parentTicketId?: string;
}
