import { describe, expect, it, vi } from "vitest";
import { getPreHomeData } from "./public";

/**
 * Gate for the Wishlist feature (Wishlist handoff §7.5): wishlist points must
 * ride in their own `PreHomeData.wishlist` array, never into `mapPoints`, and
 * the stats counter comes from its own query.
 */

const WISHLIST_ROWS = [
  {
    id: 1,
    name: "Faroe Islands",
    name_zh: "法罗群岛",
    country: "Faroe Islands",
    region: null,
    city: null,
    latitude: 62.0079,
    longitude: -6.7901,
    description: null,
    cover: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Guilin",
    name_zh: "桂林",
    country: "China",
    region: "Guangxi",
    city: "Guilin",
    latitude: 25.2736,
    longitude: 110.29,
    description: null,
    cover: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  },
];

function fakeDatabase() {
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async all() {
        return { results: sql.includes("atlas_wishlist_items") ? WISHLIST_ROWS : [] };
      },
      async first() {
        return sql.includes("COUNT(*)") ? { count: 2 } : null;
      },
    };
    return statement;
  });
  return { db: { prepare } as unknown as D1Database };
}

describe("getPreHomeData wishlist isolation", () => {
  it("assembles wishlist points without touching mapPoints or visited stats", async () => {
    const data = await getPreHomeData(fakeDatabase().db);

    expect(data.wishlist).toEqual([
      {
        id: "1",
        name: "法罗群岛",
        nameZh: "法罗群岛",
        country: "Faroe Islands",
        countryCode: "FRO",
        location: "Faroe Islands",
        latitude: 62.0079,
        longitude: -6.7901,
      },
      {
        id: "2",
        name: "桂林",
        nameZh: "桂林",
        country: "China",
        countryCode: "CHN",
        location: "Guilin · Guangxi · China",
        latitude: 25.2736,
        longitude: 110.29,
      },
    ]);
    // The visited-points pipeline sees no visits in this fixture, so any
    // wishlist bleed into MapPoint[] or the stats would show up here.
    expect(data.mapPoints).toEqual([]);
    expect(data.stats).toEqual({ places: 0, journeys: 0, regions: 0, wishlist: 2 });
  });
});
