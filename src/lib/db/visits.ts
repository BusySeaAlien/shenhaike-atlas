import type { Visit, VisitInput } from "../../types/domain";
import { validateVisitInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { VisitRow } from "./rows";
import { toVisit } from "./rows";

const VISIT_COLUMNS = `
  id, place_id, journey_id, visited_at, sequence, notes, created_at, updated_at
`;

function validated(input: VisitInput): VisitInput {
  const result = validateVisitInput(input);
  if (!result.ok) throw new DataError("validation", "访问记录无效", result.errors);
  return result.value;
}

async function assertRelationsAndDate(db: D1Database, value: VisitInput): Promise<void> {
  const place = await db
    .prepare("SELECT id FROM places WHERE id = ?1")
    .bind(value.placeId)
    .first<{ id: number }>();
  if (!place) throw new DataError("validation", "地点不存在", { placeId: "请选择有效地点" });

  const journey = await db
    .prepare("SELECT start_date, end_date FROM journeys WHERE id = ?1")
    .bind(value.journeyId)
    .first<{ start_date: string; end_date: string }>();
  if (!journey) throw new DataError("validation", "旅程不存在", { journeyId: "请选择有效旅程" });
  if (value.visitedAt < journey.start_date || value.visitedAt > journey.end_date) {
    throw new DataError("validation", "访问日期不在旅程范围内", {
      visitedAt: `日期须在 ${journey.start_date} 至 ${journey.end_date} 之间`,
    });
  }
}

function normalizeWriteError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new DataError("conflict", "该旅程中的访问顺序已被占用", {
      sequence: "请选择未使用的顺序",
    });
  }
  throw error;
}

export async function listJourneyVisits(db: D1Database, journeyId: number): Promise<Visit[]> {
  const { results } = await db
    .prepare(`
      SELECT ${VISIT_COLUMNS} FROM visits
      WHERE journey_id = ?1 ORDER BY sequence, id
    `)
    .bind(journeyId)
    .all<VisitRow>();
  return results.map(toVisit);
}

export async function listTimelineVisits(db: D1Database): Promise<Visit[]> {
  const { results } = await db
    .prepare(`SELECT ${VISIT_COLUMNS} FROM visits ORDER BY visited_at DESC, id DESC`)
    .all<VisitRow>();
  return results.map(toVisit);
}

export async function createVisit(db: D1Database, input: VisitInput): Promise<Visit> {
  const value = validated(input);
  await assertRelationsAndDate(db, value);
  try {
    const row = await db
      .prepare(`
        INSERT INTO visits (place_id, journey_id, visited_at, sequence, notes)
        VALUES (?1, ?2, ?3, ?4, ?5)
        RETURNING ${VISIT_COLUMNS}
      `)
      .bind(value.placeId, value.journeyId, value.visitedAt, value.sequence, value.notes)
      .first<VisitRow>();
    if (!row) throw new Error("Insert returned no visit.");
    return toVisit(row);
  } catch (error) {
    return normalizeWriteError(error);
  }
}

export async function updateVisit(
  db: D1Database,
  id: number,
  input: VisitInput,
): Promise<Visit> {
  const value = validated(input);
  await assertRelationsAndDate(db, value);
  try {
    const row = await db
      .prepare(`
        UPDATE visits SET
          place_id = ?1, journey_id = ?2, visited_at = ?3, sequence = ?4, notes = ?5,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?6
        RETURNING ${VISIT_COLUMNS}
      `)
      .bind(value.placeId, value.journeyId, value.visitedAt, value.sequence, value.notes, id)
      .first<VisitRow>();
    if (!row) throw new DataError("not_found", "访问记录不存在");
    return toVisit(row);
  } catch (error) {
    return normalizeWriteError(error);
  }
}

export async function deleteVisit(db: D1Database, id: number): Promise<void> {
  const result = await db.prepare("DELETE FROM visits WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "访问记录不存在");
}

export async function reorderVisits(
  db: D1Database,
  journeyId: number,
  visitIds: number[],
): Promise<void> {
  if (!Number.isInteger(journeyId) || journeyId < 1) {
    throw new DataError("validation", "旅程不存在", { journeyId: "请选择有效旅程" });
  }
  if (visitIds.some((id) => !Number.isInteger(id) || id < 1) || new Set(visitIds).size !== visitIds.length) {
    throw new DataError("validation", "访问顺序无效", { visitIds: "记录必须有效且不能重复" });
  }

  const { results: existing } = await db
    .prepare("SELECT id FROM visits WHERE journey_id = ?1 ORDER BY sequence, id")
    .bind(journeyId)
    .all<{ id: number }>();
  const expected = existing.map(({ id }) => id).sort((a, b) => a - b);
  const received = [...visitIds].sort((a, b) => a - b);
  if (expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
    throw new DataError("conflict", "排序必须包含该旅程的全部访问记录", {
      visitIds: "列表与当前访问记录不一致，请刷新后重试",
    });
  }
  if (visitIds.length === 0) return;

  const maximum = await db
    .prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM visits WHERE journey_id = ?1")
    .bind(journeyId)
    .first<{ value: number }>();
  const offset = (maximum?.value ?? 0) + visitIds.length + 1;
  const statements = [
    db.prepare("UPDATE visits SET sequence = sequence + ?1 WHERE journey_id = ?2").bind(offset, journeyId),
    ...visitIds.map((id, index) =>
      db
        .prepare(`
          UPDATE visits SET sequence = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?2 AND journey_id = ?3
        `)
        .bind(index + 1, id, journeyId),
    ),
  ];

  await db.batch(statements);
}
