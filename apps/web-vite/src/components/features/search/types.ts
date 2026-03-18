export interface SearchResult {
  id: string;
  type: "ticket" | "task" | "user" | "comment" | "timeentry" | "setting" | "link";
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
  context?: string;
  contextHighlight?: string;
  parentTicketId?: string;
}
