import { describe, expect, it } from "vitest";
import { sortTimeEntriesForOverview } from "./time-tracking";

function entry(
  id: string,
  status: string,
  timestamps: {
    started_at: string;
    last_resumed_at?: string | null;
    updated_at?: string;
    created_at?: string;
  },
) {
  return {
    id,
    status,
    started_at: timestamps.started_at,
    last_resumed_at: timestamps.last_resumed_at ?? null,
    updated_at: timestamps.updated_at ?? timestamps.started_at,
    created_at: timestamps.created_at ?? timestamps.started_at,
  };
}

describe("sortTimeEntriesForOverview", () => {
  it("places RUNNING and PAUSED before stopped entries", () => {
    const sorted = sortTimeEntriesForOverview([
      entry("stopped", "STOPPED", { started_at: "2026-05-29T12:00:00Z" }),
      entry("paused", "PAUSED", { started_at: "2026-05-28T12:00:00Z" }),
      entry("running", "RUNNING", { started_at: "2026-05-27T12:00:00Z" }),
    ]);

    expect(sorted.map((e) => e.id)).toEqual(["running", "paused", "stopped"]);
  });

  it("orders RUNNING timers by most recent activity first", () => {
    const sorted = sortTimeEntriesForOverview([
      entry("older", "RUNNING", {
        started_at: "2026-05-27T12:00:00Z",
        last_resumed_at: "2026-05-27T12:00:00Z",
      }),
      entry("newer", "RUNNING", {
        started_at: "2026-05-27T10:00:00Z",
        last_resumed_at: "2026-05-29T08:00:00Z",
      }),
    ]);

    expect(sorted.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("orders stopped entries by most recent updated_at first", () => {
    const sorted = sortTimeEntriesForOverview([
      entry("old-stop", "COMPLETED", {
        started_at: "2026-05-20T12:00:00Z",
        updated_at: "2026-05-21T12:00:00Z",
      }),
      entry("new-stop", "COMPLETED", {
        started_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-29T12:00:00Z",
      }),
    ]);

    expect(sorted.map((e) => e.id)).toEqual(["new-stop", "old-stop"]);
  });
});
