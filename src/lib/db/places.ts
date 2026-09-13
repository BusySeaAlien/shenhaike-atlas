import type { Place, PlaceInput } from "../../types/domain";
import { validatePlaceInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { PlaceRow } from "./rows";
import { toPlace } from "./rows";

const PLACE_COLUMNS = `
  id, slug, name, name_zh, country, region, city, latitude, longitude,
  description, cover, created_at, updated_at
`;

function validated(input: PlaceInput): PlaceInput {
  const result = validatePlaceInput(input);
  if (!result.ok) throw new DataError("validation", "地点信息无效", result.errors);
  return result.value;
}

export async function listPlaces(db: D1Database): Promise<Place[]> {
  const { results } = await db
    .prepare(`SELECT ${PLACE_COLUMNS} FROM places ORDER BY name COLLATE NOCASE, id`)
    .all<PlaceRow>();
  return results.map(toPlace);
}

export async function getPlaceBySlug(db: D1Database, slug: string): Promise<Place | null> {
  const row = await db
    .prepare(`SELECT ${PLACE_COLUMNS} FROM places WHERE slug = ?1`)
    .bind(slug)
    .first<PlaceRow>();
  return row ? toPlace(row) : null;
}

export async function createPlace(db: D1Database, input: PlaceInput): Promise<Place> {
  const value = validated(input);
  try {
    const row = await db
      .prepare(`
        INSERT INTO places (
          slug, name, name_zh, country, region, city, latitude, longitude, description, cover
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        RETURNING ${PLACE_COLUMNS}
      `)
      .bind(
        value.slug,
        value.name,
        value.nameZh,
        value.country,
        value.region,
        value.city,
        value.latitude,
        value.longitude,
        value.description,
        value.cover,
      )
      .first<PlaceRow>();
    if (!row) throw new Error("Insert returned no place.");
    return toPlace(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "地点 slug 已存在", { slug: "该 slug 已被使用" });
    }
    throw error;
  }
}

export async function updatePlace(
  db: D1Database,
  id: number,
  input: PlaceInput,
): Promise<Place> {
  const value = validated(input);
  try {
    const row = await db
      .prepare(`
        UPDATE places SET
          slug = ?1, name = ?2, name_zh = ?3, country = ?4, region = ?5,
          city = ?6, latitude = ?7, longitude = ?8, description = ?9, cover = ?10,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?11
        RETURNING ${PLACE_COLUMNS}
      `)
      .bind(
        value.slug,
        value.name,
        value.nameZh,
        value.country,
        value.region,
        value.city,
        value.latitude,
        value.longitude,
        value.description,
        value.cover,
        id,
      )
      .first<PlaceRow>();
    if (!row) throw new DataError("not_found", "地点不存在");
    return toPlace(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "地点 slug 已存在", { slug: "该 slug 已被使用" });
    }
    throw error;
  }
}

export async function deletePlace(db: D1Database, id: number): Promise<void> {
  const reference = await db
    .prepare("SELECT COUNT(*) AS count FROM visits WHERE place_id = ?1")
    .bind(id)
    .first<{ count: number }>();
  if ((reference?.count ?? 0) > 0) {
    throw new DataError("conflict", `该地点仍关联 ${reference?.count} 条访问记录，不能删除`);
  }

  const result = await db.prepare("DELETE FROM places WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "地点不存在");
}
