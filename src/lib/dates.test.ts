import { describe, expect, it } from "vitest";
import { dateBounds, dateRangesOverlap, inclusiveDayCount, isPartialDate, monthFromDate, yearFromDate } from "./dates";

describe("archive date helpers", () => {
  it("counts both first and last calendar day", () => {
    expect(inclusiveDayCount("2026-08-14", "2026-08-24")).toBe(11);
    expect(inclusiveDayCount("2026-08-14", "2026-08-14")).toBe(1);
  });

  it("counts across a year boundary without local timezone drift", () => {
    expect(inclusiveDayCount("2025-12-29", "2026-01-03")).toBe(6);
  });

  it("accepts year, month, and day precision without inventing a duration", () => {
    expect(["1998", "1998-07", "1998-07-12"].every(isPartialDate)).toBe(true);
    expect(["1998-13", "1998-02-30", "98"].some(isPartialDate)).toBe(false);
    expect(dateBounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(inclusiveDayCount("1998-07", "1998-08")).toBeNull();
  });

  it("treats an imprecise visit as valid when its possible range overlaps the journey", () => {
    expect(dateRangesOverlap("1998-07", "1998-07-12", "1998-07-20")).toBe(true);
    expect(dateRangesOverlap("1998-06", "1998-07-12", "1998-07-20")).toBe(false);
  });

  it("derives stable archive groups from ISO dates", () => {
    expect(yearFromDate("2026-01-03")).toBe("2026");
    expect(monthFromDate("2026-01-03")).toBe("2026-01");
  });
});
