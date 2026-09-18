import { describe, expect, it, vi } from "vitest";
import type { VisitInput } from "../../types/domain";
import { DataError } from "./errors";
import { createVisit, reorderVisits, updateVisit } from "./visits";

interface FakeStatement {
  sql: string;
  values: unknown[];
  bind: (...values: unknown[]) => FakeStatement;
  all: () => Promise<{ results: Array<{ id: number }> }>;
  first: () => Promise<{ value: number }>;
}

function fakeDatabase(ids = [11, 12, 13]) {
  const statements: FakeStatement[] = [];
  const batch = vi.fn(async (_statements: unknown[]) => []);
  const prepare = vi.fn((sql: string): FakeStatement => {
    const statement: FakeStatement = {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async all() {
        return { results: ids.map((id) => ({ id })) };
      },
      async first() {
        return { value: ids.length };
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare, batch } as unknown as D1Database, statements, batch };
}

describe("visit reordering", () => {
  it("submits the temporary shift and complete order in one atomic batch", async () => {
    const { db, batch } = fakeDatabase();
    await reorderVisits(db, 7, [13, 11, 12]);

    expect(batch).toHaveBeenCalledOnce();
    const batched = batch.mock.calls[0][0] as FakeStatement[];
    expect(batched).toHaveLength(4);
    expect(batched[0].sql).toContain("sequence = sequence +");
    expect(batched.slice(1).map(({ values }) => values.slice(0, 2))).toEqual([
      [1, 13],
      [2, 11],
      [3, 12],
    ]);
  });

  it("does not issue writes when the submitted set is incomplete", async () => {
    const { db, batch } = fakeDatabase();
    await expect(reorderVisits(db, 7, [11, 12])).rejects.toBeInstanceOf(DataError);
    expect(batch).not.toHaveBeenCalled();
  });

  it("surfaces a batch failure without retrying partial statements", async () => {
    const { db, batch } = fakeDatabase();
    batch.mockRejectedValueOnce(new Error("constraint failed"));
    await expect(reorderVisits(db, 7, [13, 12, 11])).rejects.toThrow("constraint failed");
    expect(batch).toHaveBeenCalledOnce();
  });
});

const VISIT_ROW = {
  id: 1,
  place_id: 1,
  journey_id: 1,
  visited_at: "2026-08-14",
  sequence: 2,
  transport_mode: "plane",
  notes: null,
  created_at: "2026-08-14T00:00:00.000Z",
  updated_at: "2026-08-14T00:00:00.000Z",
};

function visitWriteFakeDatabase() {
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
        return { results: [] };
      },
      async first() {
        if (sql.includes("FROM atlas_places")) return { id: 1 };
        if (sql.includes("FROM atlas_journeys")) {
          return { start_date: "2026-08-01", end_date: "2026-08-31" };
        }
        return VISIT_ROW;
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, statements };
}

function visitInput(overrides: Partial<VisitInput> = {}): VisitInput {
  return {
    placeId: 1,
    journeyId: 1,
    visitedAt: "2026-08-14",
    sequence: 2,
    transportMode: "plane",
    notes: null,
    ...overrides,
  };
}

describe("visit transport mode writes", () => {
  it("writes the transport column on create", async () => {
    const { db, statements } = visitWriteFakeDatabase();
    await createVisit(db, visitInput());

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO"))!;
    expect(insert.sql).toContain("transport_mode");
    // Bind order: placeId, journeyId, visitedAt, sequence, transportMode, notes.
    expect(insert.values[4]).toBe("plane");
  });

  it("forces null for a journey's first stop on create", async () => {
    const { db, statements } = visitWriteFakeDatabase();
    await createVisit(db, visitInput({ sequence: 1, transportMode: "plane" }));

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO"))!;
    expect(insert.values[4]).toBeNull();
  });

  it("forces null for a journey's first stop on update and keeps the id last", async () => {
    const { db, statements } = visitWriteFakeDatabase();
    await updateVisit(db, 42, visitInput({ sequence: 1, transportMode: "train", notes: "kept" }));

    const update = statements.find((statement) => statement.sql.includes("UPDATE atlas_visits"))!;
    expect(update.sql).toContain("transport_mode");
    // Bind order: placeId, journeyId, visitedAt, sequence, transportMode, notes, id.
    // A non-null notes value makes position 4 unambiguous: the nulled mode
    // cannot be confused with notes, or with the column not being written at all.
    expect(update.values[4]).toBeNull();
    expect(update.values[5]).toBe("kept");
    expect(update.values.at(-1)).toBe(42);
  });

  it("rejects an invalid transport mode as a validation error before any write", async () => {
    const { db, statements } = visitWriteFakeDatabase();
    await expect(
      createVisit(db, { ...visitInput(), transportMode: "rocket" } as unknown as VisitInput),
    ).rejects.toBeInstanceOf(DataError);
    expect(statements).toHaveLength(0);
  });
});
