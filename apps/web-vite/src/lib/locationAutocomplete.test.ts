import { describe, expect, it } from "vitest";
import {
  buildSuggestionLabel,
  mergeAndRankLocationSuggestions,
  parseLocationHistoryResponse,
  type LocationSuggestion,
} from "./locationAutocomplete";

describe("parseLocationHistoryResponse", () => {
  it("reads Rust envelope locations", () => {
    expect(parseLocationHistoryResponse({ locations: ["Office", "Home"] })).toEqual([
      "Office",
      "Home",
    ]);
  });

  it("reads legacy array of suggestion-shaped rows", () => {
    const legacy = [
      {
        place_id: 1,
        display_name: "Berlin, Germany",
        address: { city: "Berlin", country: "Germany" },
      },
    ];
    expect(parseLocationHistoryResponse(legacy)).toEqual(["Berlin, Germany"]);
  });

  it("returns empty for unknown shapes", () => {
    expect(parseLocationHistoryResponse(null)).toEqual([]);
    expect(parseLocationHistoryResponse({})).toEqual([]);
  });
});

describe("mergeAndRankLocationSuggestions", () => {
  const mapHit: LocationSuggestion = {
    place_id: 99,
    display_name: "Berlin, Germany",
    address: { city: "Berlin", country: "Germany" },
  };

  it("keeps history above map and dedupes duplicate labels case-insensitively", () => {
    const merged = mergeAndRankLocationSuggestions(
      ["Berlin Office", "berlin office"],
      [mapHit],
      "ber",
    );
    expect(merged.map((s) => s.label)).toEqual(["Berlin Office", "Berlin, Germany"]);
    expect(merged[0]?.source).toBe("history");
    expect(merged[1]?.source).toBe("map");
  });

  it("ranks prefix matches ahead of substring-only matches within history", () => {
    const merged = mergeAndRankLocationSuggestions(
      ["Remote — EU", "Remote"],
      [],
      "Remote",
    );
    expect(merged.map((s) => s.label)).toEqual(["Remote", "Remote — EU"]);
  });
});

describe("buildSuggestionLabel", () => {
  it("joins structured address parts", () => {
    expect(
      buildSuggestionLabel({
        display_name: "fallback",
        address: { road: "Main St", house_number: "1", city: "Town" },
      }),
    ).toBe("Main St 1, Town");
  });
});
