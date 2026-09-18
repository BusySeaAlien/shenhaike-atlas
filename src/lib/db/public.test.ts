import { describe, expect, it, vi } from "vitest";
import { getJourneyDetail, getPreHomeData, listJourneySummaries } from "./public";

/**
 * Gate for the Wishlist feature (Wishlist handoff §7.5): wishlist points must
 * ride in their own `PreHomeData.wishlist` array, never into `mapPoints`, and
 * the stats counter comes from its own query.
 *
 * The mileage describe below is the Gate for the mileage feature (Wishlist &
 * mileage handoff §5.2): the summary assembler must sort each journey's rows
 * by (sequence, id) before measuring, so a shuffled query result still yields
 * the correct legs.
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
        nameEn: "Faroe Islands",
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
        nameEn: "Guilin",
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

const SUMMARY_ROW = {
  id: 7,
  slug: "equator-hop",
  name: "Equator Hop",
  name_zh: null,
  start_date: "2026-01-01",
  end_date: "2026-01-03",
  description: null,
  cover: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  place_count: 3,
  visit_count: 3,
};

// Three equator stops; deliberately shuffled so the assembler's defensive
// (sequence, id) sort is what restores the correct leg order.
const SHUFFLED_LEG_ROWS = [
  { journey_id: 7, id: 103, sequence: 3, transport_mode: "car", latitude: 0, longitude: 3 },
  { journey_id: 7, id: 101, sequence: 1, transport_mode: null, latitude: 0, longitude: 0 },
  { journey_id: 7, id: 102, sequence: 2, transport_mode: "car", latitude: 0, longitude: 1 },
];

function summaryFakeDatabase(legRows = SHUFFLED_LEG_ROWS) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async all() {
        return { results: sql.includes("transport_mode") ? legRows : [SUMMARY_ROW] };
      },
      async first() {
        return null;
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, statements };
}

describe("listJourneySummaries mileage", () => {
  it("sorts shuffled leg rows by sequence before measuring", async () => {
    const { db } = summaryFakeDatabase();
    const [summary] = await listJourneySummaries(db);

    // Equator legs of 1° + 2° of longitude.
    expect(summary?.totalKm).toBeCloseTo(333.6, 0);
  });

  it("leaves totalKm null for journeys without enough stops", async () => {
    const [summary] = await listJourneySummaries(summaryFakeDatabase([]).db);
    expect(summary?.totalKm).toBeNull();
  });
});

const JOURNEY_ROW = {
  id: 7,
  slug: "equator-hop",
  name: "Equator Hop",
  name_zh: null,
  start_date: "2026-01-01",
  end_date: "2026-01-03",
  description: null,
  cover: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const JOURNEY_VISIT_ROWS = [
  { id: 101, place_id: 1, journey_id: 7, visited_at: "2026-01-01", sequence: 1, transport_mode: "plane", notes: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", place_slug: "a", place_name: "A", place_name_zh: null, latitude: 0, longitude: 0 },
  { id: 102, place_id: 2, journey_id: 7, visited_at: "2026-01-02", sequence: 2, transport_mode: "car", notes: null, created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", place_slug: "b", place_name: "B", place_name_zh: null, latitude: 0, longitude: 1 },
  { id: 103, place_id: 3, journey_id: 7, visited_at: "2026-01-03", sequence: 3, transport_mode: "car", notes: null, created_at: "2026-01-03T00:00:00.000Z", updated_at: "2026-01-03T00:00:00.000Z", place_slug: "c", place_name: "C", place_name_zh: null, latitude: 0, longitude: 3 },
];

function journeyDetailFakeDatabase(visitRows = JOURNEY_VISIT_ROWS) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async all() {
        return { results: sql.includes("atlas_visits") ? visitRows : [] };
      },
      async first() {
        return sql.includes("atlas_journeys") ? JOURNEY_ROW : null;
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, statements };
}

describe("getJourneyDetail mileage", () => {
  it("returns per-leg mileage and ignores the first stop's mode", async () => {
    const { db, statements } = journeyDetailFakeDatabase();
    const detail = await getJourneyDetail(db, "equator-hop");

    const visitsSql = statements.find((statement) => statement.sql.includes("atlas_visits"))?.sql;
    expect(visitsSql).toContain("v.transport_mode");
    // The query ordering is load-bearing for the route list; pin it so a
    // regression is not masked by the defensive sort below.
    expect(visitsSql).toContain("ORDER BY v.sequence, v.id");

    expect(detail?.mileage?.totalKm).toBeCloseTo(333.6, 0);
    expect(detail?.mileage?.legs.map((leg) => leg.mode)).toEqual(["car", "car"]);
    expect(detail?.visits[0]?.transportMode).toBe("plane");
  });

  it("sorts shuffled visit rows defensively before measuring", async () => {
    const shuffled = [JOURNEY_VISIT_ROWS[2], JOURNEY_VISIT_ROWS[0], JOURNEY_VISIT_ROWS[1]];
    const detail = await getJourneyDetail(journeyDetailFakeDatabase(shuffled).db, "equator-hop");

    expect(detail?.visits.map((visit) => visit.sequence)).toEqual([1, 2, 3]);
    expect(detail?.mileage?.legs[0].mode).toBe("car");
    expect(detail?.mileage?.totalKm).toBeCloseTo(333.6, 0);
  });

  it("returns null mileage when the journey has fewer than two stops", async () => {
    const detail = await getJourneyDetail(journeyDetailFakeDatabase([JOURNEY_VISIT_ROWS[0]]).db, "equator-hop");
    expect(detail?.mileage).toBeNull();
  });
});
