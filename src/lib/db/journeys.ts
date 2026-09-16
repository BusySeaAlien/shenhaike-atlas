import type { Journey, JourneyInput } from "../../types/domain";
import { dateRangesOverlap } from "../dates";
import { validateJourneyInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { JourneyRow } from "./rows";
import { toJourney } from "./rows";

const JOURNEY_COLUMNS = `
  id, slug, name, name_zh, start_date, end_date, description, cover, created_at, updated_at
`;

function validated(input: JourneyInput): JourneyInput {
  const result = validateJourneyInput(input);
  if (!result.ok) throw new DataError("validation", "旅程信息无效", result.errors);
  return result.value;
}

export async function listJourneys(db: D1Database): Promise<Journey[]> {
  const { results } = await db
    .prepare(`SELECT ${JOURNEY_COLUMNS} FROM atlas_journeys ORDER BY start_date DESC, id DESC`)
    .all<JourneyRow>();
  return results.map(toJourney);
}

export async function getJourneyBySlug(db: D1Database, slug: string): Promise<Journey | null> {
  const row = await db
    .prepare(`SELECT ${JOURNEY_COLUMNS} FROM atlas_journeys WHERE slug = ?1`)
    .bind(slug)
    .first<JourneyRow>();
  return row ? toJourney(row) : null;
}

export async function getJourneyById(db: D1Database, id: number): Promise<Journey | null> {
  const row = await db
    .prepare(`SELECT ${JOURNEY_COLUMNS} FROM atlas_journeys WHERE id = ?1`)
    .bind(id)
    .first<JourneyRow>();
  return row ? toJourney(row) : null;
}

export async function createJourney(db: D1Database, input: JourneyInput): Promise<Journey> {
  const value = validated(input);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_journeys (slug, name, name_zh, start_date, end_date, description, cover)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        RETURNING ${JOURNEY_COLUMNS}
      `)
      .bind(
        value.slug,
        value.name,
        value.nameZh,
        value.startDate,
        value.endDate,
        value.description,
        value.cover,
      )
      .first<JourneyRow>();
    if (!row) throw new Error("Insert returned no journey.");
    return toJourney(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "旅程 slug 已存在", { slug: "该 slug 已被使用" });
    }
    throw error;
  }
}

export async function updateJourney(
  db: D1Database,
  id: number,
  input: JourneyInput,
): Promise<Journey> {
  const value = validated(input);
  const existingVisits = await db
    .prepare("SELECT visited_at FROM atlas_visits WHERE journey_id = ?1")
    .bind(id)
    .all<{ visited_at: string }>();
  if (existingVisits.results.some(({ visited_at }) => !dateRangesOverlap(visited_at, value.startDate, value.endDate))) {
    throw new DataError("conflict", "新的旅程日期范围不包含已有访问记录", {
      startDate: "请包含所有已有访问日期",
      endDate: "请包含所有已有访问日期",
    });
  }

  try {
    const row = await db
      .prepare(`
        UPDATE atlas_journeys SET
          slug = ?1, name = ?2, name_zh = ?3, start_date = ?4, end_date = ?5,
          description = ?6, cover = ?7,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?8
        RETURNING ${JOURNEY_COLUMNS}
      `)
      .bind(
        value.slug,
        value.name,
        value.nameZh,
        value.startDate,
        value.endDate,
        value.description,
        value.cover,
        id,
      )
      .first<JourneyRow>();
    if (!row) throw new DataError("not_found", "旅程不存在");
    return toJourney(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "旅程 slug 已存在", { slug: "该 slug 已被使用" });
    }
    throw error;
  }
}

export async function deleteJourney(db: D1Database, id: number): Promise<number> {
  const visits = await db
    .prepare("SELECT COUNT(*) AS count FROM atlas_visits WHERE journey_id = ?1")
    .bind(id)
    .first<{ count: number }>();
  const result = await db.prepare("DELETE FROM atlas_journeys WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "旅程不存在");
  return visits?.count ?? 0;
}
