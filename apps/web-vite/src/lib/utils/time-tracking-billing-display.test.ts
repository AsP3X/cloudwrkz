import { describe, expect, it } from "vitest";
import {
  calculateEarnedAmount,
  shouldShowTimeEntryBillingAmount,
} from "./time-tracking";

describe("shouldShowTimeEntryBillingAmount", () => {
  it("is false when not billable", () => {
    expect(
      shouldShowTimeEntryBillingAmount({ billable: false, hourly_rate: 85 }),
    ).toBe(false);
  });

  it("is false when rate is zero or missing", () => {
    expect(shouldShowTimeEntryBillingAmount({ billable: true, hourly_rate: 0 })).toBe(
      false,
    );
    expect(shouldShowTimeEntryBillingAmount({ billable: true, hourly_rate: null })).toBe(
      false,
    );
  });

  it("is true when billable with positive rate", () => {
    expect(shouldShowTimeEntryBillingAmount({ billable: true, hourly_rate: 50 })).toBe(
      true,
    );
  });
});

describe("calculateEarnedAmount", () => {
  const base = {
    billable: true,
    status: "STOPPED",
    total_duration: 3600,
    last_resumed_at: null,
    started_at: "2026-01-01T10:00:00Z",
    hourly_rate: 100,
  };

  it("returns null when billing should not display", () => {
    expect(
      calculateEarnedAmount({ ...base, billable: false }),
    ).toBeNull();
    expect(calculateEarnedAmount({ ...base, hourly_rate: 0 })).toBeNull();
  });

  it("returns null when worked time yields zero", () => {
    expect(
      calculateEarnedAmount({ ...base, total_duration: 0 }),
    ).toBeNull();
  });
});
