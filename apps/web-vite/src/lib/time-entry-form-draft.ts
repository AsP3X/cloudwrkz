import type { TimeEntryBillingState } from "@/components/features/time-tracking/TimeEntryBillingDialog";

// Human: Persists in-progress add/edit time-entry form data in localStorage so accidental closes or reloads do not lose work.
// Agent: KEYS cloudwrkz:time-entry-draft:add|edit:{id}; READS WRITES localStorage JSON; SERIALIZES dates ISO; CLEAR on submit or user decline (add only).

const ADD_DRAFT_KEY = "cloudwrkz:time-entry-draft:add";
const EDIT_DRAFT_KEY_PREFIX = "cloudwrkz:time-entry-draft:edit:";

export type SerializedTimeEntryBreak = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AddTimeEntryFormDraft = {
  savedAt: string;
  name: string;
  description: string;
  location: string;
  startedAt: string | null;
  stoppedAt: string | null;
  tags: string[];
  billing: TimeEntryBillingState;
};

export type EditTimeEntryFormDraft = {
  savedAt: string;
  entryId: string;
  name: string;
  description: string;
  tags: string[];
  billable: boolean;
  location: string;
  timezone: string | null;
  startedAt: string;
  stoppedAt: string | null;
  billing: TimeEntryBillingState;
  breaks: SerializedTimeEntryBreak[];
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode errors.
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function loadAddTimeEntryDraft(): AddTimeEntryFormDraft | null {
  return readJson<AddTimeEntryFormDraft>(ADD_DRAFT_KEY);
}

export function saveAddTimeEntryDraft(draft: Omit<AddTimeEntryFormDraft, "savedAt">): void {
  writeJson(ADD_DRAFT_KEY, { ...draft, savedAt: new Date().toISOString() } satisfies AddTimeEntryFormDraft);
}

export function clearAddTimeEntryDraft(): void {
  removeKey(ADD_DRAFT_KEY);
}

export function loadEditTimeEntryDraft(entryId: string): EditTimeEntryFormDraft | null {
  const draft = readJson<EditTimeEntryFormDraft>(`${EDIT_DRAFT_KEY_PREFIX}${entryId}`);
  if (!draft || draft.entryId !== entryId) return null;
  return draft;
}

export function saveEditTimeEntryDraft(draft: Omit<EditTimeEntryFormDraft, "savedAt">): void {
  writeJson(`${EDIT_DRAFT_KEY_PREFIX}${draft.entryId}`, {
    ...draft,
    savedAt: new Date().toISOString(),
  } satisfies EditTimeEntryFormDraft);
}

export function clearEditTimeEntryDraft(entryId: string): void {
  removeKey(`${EDIT_DRAFT_KEY_PREFIX}${entryId}`);
}

/** Human: Locale-aware label for when a draft was last saved (shown in restore prompt). */
export function formatDraftSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
