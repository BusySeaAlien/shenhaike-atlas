import { describe, expect, it, vi } from "vitest";
import type { PlaceInput } from "../../types/domain";
import { createPlace, updatePlace } from "./places";

/**
 * Gate for Phase 2 (handoff §107): the administrative codes must be derived
 * from the coordinates on both create and edit, and must survive the trip from
 * D1 back into a Place.
 */

const SHANGHAI = { longitude: 121.4737, latitude: 31.2304 };
const XINJIANG = { longitude: 87.6168, latitude: 43.8256 };
const PARIS = { longitude: 2.3522, latitude: 48.8566 };

function input(overrides: Partial<PlaceInput> = {}): PlaceInput {
  return {
    slug: "sample-place",
    name: "Sample Place",
    nameZh: null,
    country: "China",
    region: "Shanghai",
    city: "Shanghai",
    latitude: SHANGHAI.latitude,
    longitude: SHANGHAI.longitude,
    description: null,
    cover: null,
    ...overrides,
  };
}

/** Captures the SQL and bound values so the written codes can be asserted. */
function fakeDatabase(row: Record<string, unknown>) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async first() {
        return row;
      },
      async all() {
        return { results: [] };
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, statements };
}

function rowFor(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "sample-place",
    name: "Sample Place",
    name_zh: null,
    country: "China",
    region: "Shanghai",
    city: "Shanghai",
    latitude: SHANGHAI.latitude,
    longitude: SHANGHAI.longitude,
    sovereign_country_code: "CHN",
    admin1_code: "310000",
    description: null,
    cover: null,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("createPlace administrative codes", () => {
  it("writes codes resolved from the coordinates, not from the request body", async () => {
    const { db, statements } = fakeDatabase(rowFor());
    await createPlace(db, input());

    const [insert] = statements;
    expect(insert.sql).toContain("sovereign_country_code");
    expect(insert.sql).toContain("admin1_code");
    expect(insert.values).toContain("CHN");
    expect(insert.values).toContain("310000");
  });

  it("ignores a forged code supplied by the client", async () => {
    const { db, statements } = fakeDatabase(rowFor());
    // The API layer never forwards these, but a hand-rolled request could.
    await createPlace(db, { ...input(), sovereignCountryCode: "TWN", admin1Code: "999999" } as PlaceInput);

    const [insert] = statements;
    expect(insert.values).toContain("CHN");
    expect(insert.values).not.toContain("TWN");
    expect(insert.values).not.toContain("999999");
  });

  it("returns the codes on the created place", async () => {
    const { db } = fakeDatabase(rowFor());
    const place = await createPlace(db, input());
    expect(place.sovereignCountryCode).toBe("CHN");
    expect(place.admin1Code).toBe("310000");
  });

  it("leaves admin1_code null outside China", async () => {
    const { db, statements } = fakeDatabase(rowFor({ sovereign_country_code: "FRA", admin1_code: null }));
    await createPlace(db, input({ country: "France", region: null, ...PARIS }));

    const [insert] = statements;
    expect(insert.values).toContain("FRA");
    expect(insert.values).not.toContain("310000");
  });
});

describe("updatePlace administrative codes", () => {
  it("recomputes the codes when a place moves province", async () => {
    const { db, statements } = fakeDatabase(rowFor());
    await updatePlace(db, 1, input({ ...XINJIANG }));

    const [update] = statements;
    expect(update.sql).toContain("sovereign_country_code = ?9");
    expect(update.sql).toContain("admin1_code = ?10");
    expect(update.values).toContain("650000");
    expect(update.values).not.toContain("310000");
  });

  it("recomputes the country when a place leaves China", async () => {
    const { db, statements } = fakeDatabase(rowFor());
    await updatePlace(db, 1, input({ country: "France", region: null, ...PARIS }));

    const [update] = statements;
    expect(update.values).toContain("FRA");
    expect(update.values).not.toContain("CHN");
  });

  it("keeps the id as the final bound value", async () => {
    const { db, statements } = fakeDatabase(rowFor());
    await updatePlace(db, 42, input());
    expect(statements[0].values.at(-1)).toBe(42);
  });
});
