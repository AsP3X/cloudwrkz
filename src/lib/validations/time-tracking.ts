import { z } from "zod";

export const createTimeEntrySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ticketId: z.string().optional(),
  billable: z.boolean().optional(),
  location: z.string().optional(),
});

export const addTimeEntrySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ticketId: z.string().optional(),
  billable: z.boolean().optional(),
  location: z.string().optional(),
  duration: z.object({
    hours: z.number().min(0).max(23),
    minutes: z.number().min(0).max(59),
    seconds: z.number().min(0).max(59),
  }),
  startedAt: z.date(),
  stoppedAt: z.date().optional(),
});

export const updateTimeEntrySchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ticketId: z.string().nullable().optional(),
  billable: z.boolean().optional(),
  location: z.string().nullable().optional(),
  startedAt: z.date().optional(),
  stoppedAt: z.date().optional(),
});

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type AddTimeEntryInput = z.infer<typeof addTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
