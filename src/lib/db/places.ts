import type { Place, PlaceInput } from "../../types/domain";
import { resolveAdministrativeLocation } from "../map/administrative/location";
import { validatePlaceInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { PlaceRow } from "./rows";
import { toPlace } from "./rows";

const PLACE_COLUMNS = `
  id, slug, name, name_zh, country, region, city, latitude, longitude,
  sovereign_country_code, admin1_code,
  description, cover, created_at, updated_at
`;

function validated(input: PlaceInput): PlaceInput {
  const result = validatePlaceInput(input);
  if (!result.ok) throw new DataError("validation", "地点信息无效", result.errors);
  return result.value;
}

export function placeSlugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88)
    .replace(/-+$/g, "");
  return slug || "place";
}

async function uniquePlaceSlug(db: D1Database, name: string): Promise<string> {
  const base = placeSlugBase(name);
  const { results } = await db
    .prepare("SELECT slug FROM atlas_places WHERE slug = ?1 OR slug GLOB ?2")
    .bind(base, `${base}-[0-9]*`)
    .all<{ slug: string }>();
  const used = new Set(results.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new DataError("conflict", "无法生成唯一的网址标识");
}

export async function listPlaces(db: D1Database): Promise<Place[]> {
  const { results } = await db
    .prepare(`SELECT ${PLACE_COLUMNS} FROM atlas_places ORDER BY name COLLATE NOCASE, id`)
    .all<PlaceRow>();
  return results.map(toPlace);
}

export async function getPlaceBySlug(db: D1Database, slug: string): Promise<Place | null> {
  const row = await db
    .prepare(`SELECT ${PLACE_COLUMNS} FROM atlas_places WHERE slug = ?1`)
    .bind(slug)
    .first<PlaceRow>();
  return row ? toPlace(row) : null;
}

export async function getPlaceById(db: D1Database, id: number): Promise<Place | null> {
  const row = await db
    .prepare(`SELECT ${PLACE_COLUMNS} FROM atlas_places WHERE id = ?1`)
    .bind(id)
    .first<PlaceRow>();
  return row ? toPlace(row) : null;
}

export async function createPlace(db: D1Database, input: PlaceInput): Promise<Place> {
  const value = validated(input);
  const slug = await uniquePlaceSlug(db, value.name);
  // Derived from the coordinates, never taken from the request body (§14-§19).
  const location = resolveAdministrativeLocation(value.longitude, value.latitude);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_places (
          slug, name, name_zh, country, region, city, latitude, longitude,
          sovereign_country_code, admin1_code, description, cover
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        RETURNING ${PLACE_COLUMNS}
      `)
      .bind(
        slug,
        value.name,
        value.nameZh,
        value.country,
        value.region,
        value.city,
        value.latitude,
        value.longitude,
        location.sovereignCountryCode,
        location.admin1Code,
        value.description,
        value.cover,
      )
      .first<PlaceRow>();
    if (!row) throw new Error("Insert returned no place.");
    return toPlace(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DataError("conflict", "地点网址标识冲突，请重试");
    throw error;
  }
}

export async function updatePlace(
  db: D1Database,
  id: number,
  input: PlaceInput,
): Promise<Place> {
  const value = validated(input);
  // Recomputed on every edit rather than only when the coordinates differ: the
  // polygon data can change under a place too, and a redundant resolve is cheap
  // (§59).
  const location = resolveAdministrativeLocation(value.longitude, value.latitude);
  try {
    const row = await db
      .prepare(`
        UPDATE atlas_places SET
          name = ?1, name_zh = ?2, country = ?3, region = ?4,
          city = ?5, latitude = ?6, longitude = ?7,
          sovereign_country_code = ?8, admin1_code = ?9,
          description = ?10, cover = ?11,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?12
        RETURNING ${PLACE_COLUMNS}
      `)
      .bind(
        value.name,
        value.nameZh,
        value.country,
        value.region,
        value.city,
        value.latitude,
        value.longitude,
        location.sovereignCountryCode,
        location.admin1Code,
        value.description,
        value.cover,
        id,
      )
      .first<PlaceRow>();
    if (!row) throw new DataError("not_found", "地点不存在");
    return toPlace(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DataError("conflict", "地点信息冲突");
    throw error;
  }
}

export async function deletePlace(db: D1Database, id: number): Promise<void> {
  const reference = await db
    .prepare("SELECT COUNT(*) AS count FROM atlas_visits WHERE place_id = ?1")
    .bind(id)
    .first<{ count: number }>();
  if ((reference?.count ?? 0) > 0) {
    throw new DataError("conflict", `该地点仍关联 ${reference?.count} 条访问记录，不能删除`);
  }

  const result = await db.prepare("DELETE FROM atlas_places WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "地点不存在");
}
