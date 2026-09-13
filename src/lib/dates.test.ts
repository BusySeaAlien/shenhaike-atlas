import { describe, expect, it } from "vitest";
import { inclusiveDayCount, monthFromDate, yearFromDate } from "./dates";

describe("archive date helpers", () => {
  it("counts both first and last calendar day", () => {
    expect(inclusiveDayCount("2026-08-14", "2026-08-24")).toBe(11);
    expect(inclusiveDayCount("2026-08-14", "2026-08-14")).toBe(1);
  });

  it("counts across a year boundary without local timezone drift", () => {
    expect(inclusiveDayCount("2025-12-29", "2026-01-03")).toBe(6);
  });

  it("derives stable archive groups from ISO dates", () => {
    expect(yearFromDate("2026-01-03")).toBe("2026");
    expect(monthFromDate("2026-01-03")).toBe("2026-01");
  });
});
