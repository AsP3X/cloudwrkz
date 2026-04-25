// Human: Client-side ticket create/update payloads so obvious invalid titles or enums fail before API round-trips.
// Agent: Zod enums for type priority status; TRIMS strings; MAX description 50000; EXPORTS CreateTicketInput UpdateTicketInput.

import { z } from "zod";

export const createTicketSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters")
    .trim(),
  description: z.string().max(50000, "Description is too long").optional().or(z.literal("")),
  type: z.enum(["BUG", "FEATURE", "QUESTION", "SUPPORT", "TASK"]).default("BUG"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assignedToId: z.string().optional().or(z.literal("")),
  assignedToGroupId: z.string().optional().or(z.literal("")),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200).trim(),
  description: z.string().max(50000).optional().or(z.literal("")),
  type: z.enum(["BUG", "FEATURE", "QUESTION", "SUPPORT", "TASK"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  status: z.enum(["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED", "CANCELLED"]),
  assignedToId: z.string().optional().or(z.literal("")),
  assignedToGroupId: z.string().optional().or(z.literal("")),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
