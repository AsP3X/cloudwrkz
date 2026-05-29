import { describe, expect, it } from "vitest";
import { mergeTimeEntryTags } from "./mergeTimeEntryTags";

describe("mergeTimeEntryTags", () => {
  it("appends new tags without duplicates (case-insensitive)", () => {
    expect(mergeTimeEntryTags(["Work"], ["work", "Home"])).toEqual(["Work", "Home"]);
  });

  it("skips empty strings", () => {
    expect(mergeTimeEntryTags([], ["  ", "Valid"])).toEqual(["Valid"]);
  });
});
