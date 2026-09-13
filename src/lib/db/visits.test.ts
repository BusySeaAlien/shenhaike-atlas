import { describe, expect, it, vi } from "vitest";
import { DataError } from "./errors";
import { reorderVisits } from "./visits";

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
