import { describe, expect, it, vi } from "vitest";
import type { WishlistItemInput } from "../../types/domain";
import { countryCodeForName } from "../countries";
import { resolveAdministrativeLocation } from "../map/administrative/location";
import { DataError } from "./errors";
import { createWishlistItem, promoteWishlistItem, updateWishlistItem } from "./wishlist";

/**
 * Gate for the Wishlist feature (Wishlist handoff §4/§11.1): promote must
 * commit the place INSERT and the wishlist DELETE in one atomic batch, and
 * every seed wishlist item must pass the country-consistency check so it can
 * actually be promoted.
 */

const FAROE = { longitude: -6.7901, latitude: 62.0079 };
const PARIS = { longitude: 2.3522, latitude: 48.8566 };

function input(overrides: Partial<WishlistItemInput> = {}): WishlistItemInput {
  return {
    name: "Faroe Islands",
    nameZh: "法罗群岛",
    country: "Faroe Islands",
    region: null,
    city: null,
    latitude: FAROE.latitude,
    longitude: FAROE.longitude,
    description: null,
    cover: null,
    ...overrides,
  };
}

function wishlistRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Faroe Islands",
    name_zh: "法罗群岛",
    country: "Faroe Islands",
    region: null,
    city: null,
    latitude: FAROE.latitude,
    longitude: FAROE.longitude,
    description: null,
    cover: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

function placeRow() {
  return {
    id: 1,
    slug: "faroe-islands",
    name: "Faroe Islands",
    name_zh: "法罗群岛",
    country: "Faroe Islands",
    region: null,
    city: null,
    latitude: FAROE.latitude,
    longitude: FAROE.longitude,
    sovereign_country_code: "FRO",
    admin1_code: null,
    description: null,
    cover: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  };
}

function fakeDatabase(item: Record<string, unknown> | null = wishlistRow()) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const batch = vi.fn(async (_statements: unknown[]) => []);
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async all() {
        return { results: [] };
      },
      async first() {
        return sql.includes("atlas_wishlist_items") ? item : placeRow();
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare, batch } as unknown as D1Database, statements, batch };
}

describe("wishlist CRUD", () => {
  it("inserts content fields without administrative codes", async () => {
    const { db, statements } = fakeDatabase();
    await createWishlistItem(db, input());

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO"))!;
    expect(insert.sql).toContain("atlas_wishlist_items");
    expect(insert.sql).not.toContain("sovereign_country_code");
    expect(insert.values).toContain("Faroe Islands");
    expect(insert.values).toContain("法罗群岛");
  });

  it("rejects a country that does not match the coordinates before any write", async () => {
    const { db, statements } = fakeDatabase();
    await expect(
      createWishlistItem(db, input({ country: "China", ...PARIS })),
    ).rejects.toBeInstanceOf(DataError);
    expect(statements).toHaveLength(0);
  });

  it("keeps the id as the final bound value on update", async () => {
    const { db, statements } = fakeDatabase();
    await updateWishlistItem(db, 42, input());
    expect(statements[0].values.at(-1)).toBe(42);
  });
});

describe("promoteWishlistItem", () => {
  it("commits the place insert and the item delete in one atomic batch", async () => {
    const { db, batch } = fakeDatabase();
    await promoteWishlistItem(db, 1);

    expect(batch).toHaveBeenCalledOnce();
    const batched = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batched).toHaveLength(2);
    expect(batched[0].sql).toContain("INSERT INTO atlas_places");
    expect(batched[0].sql).toContain("sovereign_country_code");
    expect(batched[0].values).toContain("FRO");
    expect(batched[1].sql).toContain("DELETE FROM atlas_wishlist_items");
    expect(batched[1].values).toEqual([1]);
  });

  it("rejects a missing item without issuing a batch", async () => {
    const { db, batch } = fakeDatabase(null);
    await expect(promoteWishlistItem(db, 1)).rejects.toBeInstanceOf(DataError);
    expect(batch).not.toHaveBeenCalled();
  });
});

describe("seed Promote consistency Gate", () => {
  // Keep these values in sync with the wishlist block in seed.sql: a seed row
  // whose country does not match its resolved code would be writable by the
  // seed (raw SQL) but could never be promoted.
  const SEED_WISHLIST = [
    { country: "Faroe Islands", longitude: -6.7901, latitude: 62.0079 },
    { country: "China", longitude: 110.29, latitude: 25.2736 },
    { country: "Portugal", longitude: -9.1393, latitude: 38.7223 },
  ] as const;

  it.each(SEED_WISHLIST)(
    "resolves $country at ($latitude, $longitude) to the selected country's code",
    ({ country, longitude, latitude }) => {
      const resolved = resolveAdministrativeLocation(longitude, latitude).sovereignCountryCode;
      expect(resolved).toBe(countryCodeForName(country));
    },
  );
});
