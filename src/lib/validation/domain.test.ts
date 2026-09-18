import { describe, expect, it } from "vitest";
import { isCalendarDate, validateJourneyInput, validatePlaceInput, validateVisitInput } from "./domain";

describe("calendar date validation", () => {
  it.each(["2024-02-29", "2026-09-13", "2000-01-01"])("accepts %s", (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each(["2025-02-29", "2026-02-30", "2026-13-01", "2026-9-1", "not-a-date"])(
    "rejects %s",
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
});

describe("place validation", () => {
  const validPlace = {
    name: "Sayram Lake",
    country: "China",
    latitude: 44.609,
    longitude: 81.174,
  };

  it("normalizes whitespace and empty optional values", () => {
    const result = validatePlaceInput({ ...validPlace, name: "  Sayram Lake  ", city: "  " });
    expect(result).toEqual({
      ok: true,
      value: {
        ...validPlace,
        name: "Sayram Lake",
        nameZh: null,
        region: null,
        city: null,
        description: null,
        cover: null,
      },
    });
  });

  it.each([
    [91, 81.174, "latitude"],
    [-91, 81.174, "latitude"],
    [44.609, 181, "longitude"],
    [44.609, -181, "longitude"],
  ] as const)("rejects coordinates %s, %s", (latitude, longitude, field) => {
    const result = validatePlaceInput({ ...validPlace, latitude, longitude });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeDefined();
  });

});

describe("journey validation", () => {
  it("accepts a journey spanning calendar years", () => {
    expect(
      validateJourneyInput({
        slug: "year-crossing-2025",
        name: "Year Crossing",
        startDate: "2025-12-29",
        endDate: "2026-01-03",
      }).ok,
    ).toBe(true);
  });

  it("accepts journey bounds with year or month precision", () => {
    expect(validateJourneyInput({ slug: "old-trip", name: "Old trip", startDate: "1998", endDate: "1998-07" }).ok).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = validateJourneyInput({
      slug: "reverse",
      name: "Reverse",
      startDate: "2026-08-24",
      endDate: "2026-08-14",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endDate).toBeDefined();
  });
});

describe("visit validation", () => {
  it("accepts repeated place identifiers because a visit is an event", () => {
    const input = { placeId: 1, journeyId: 1, visitedAt: "2026-08-14", sequence: 1 };
    expect(validateVisitInput(input).ok).toBe(true);
    expect(validateVisitInput({ ...input, sequence: 2 }).ok).toBe(true);
  });

  it("accepts year and month precision for visits", () => {
    const input = { placeId: 1, journeyId: 1, sequence: 1 };
    expect(validateVisitInput({ ...input, visitedAt: "1998" }).ok).toBe(true);
    expect(validateVisitInput({ ...input, visitedAt: "1998-07" }).ok).toBe(true);
  });

  it("rejects invalid foreign-key inputs, dates, and sequence", () => {
    const result = validateVisitInput({
      placeId: 0,
      journeyId: -1,
      visitedAt: "2026-02-30",
      sequence: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["placeId", "journeyId", "visitedAt", "sequence"]);
  });
});
