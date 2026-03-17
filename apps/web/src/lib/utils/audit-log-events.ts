import { EventEmitter } from "@/lib/utils/event-emitter";

// Singleton emitter for audit log events, used to push new entries over SSE.
export const auditLogEvents = new EventEmitter();

