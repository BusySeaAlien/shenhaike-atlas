import type { Place, WishlistItem, WishlistItemInput } from "../../types/domain";
import { validatePlaceInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import { getPlaceBySlug, preparePlaceInsert, resolvePlaceLocation } from "./places";
import type { WishlistItemRow } from "./rows";
import { toWishlistItem } from "./rows";

const WISHLIST_COLUMNS = `
  id, name, name_zh, country, region, city, latitude, longitude,
  description, cover, created_at, updated_at
`;

/**
 * Wishlist items are field-identical to places, so the place validator applies
 * verbatim; only the user-facing error message differs (Wishlist handoff §9).
 */
function validated(input: WishlistItemInput): WishlistItemInput {
  const result = validatePlaceInput(input);
  if (!result.ok) throw new DataError("validation", "愿望清单项无效", result.errors);
  return result.value;
}

export async function listWishlistItems(db: D1Database): Promise<WishlistItem[]> {
  const { results } = await db
    .prepare(`SELECT ${WISHLIST_COLUMNS} FROM atlas_wishlist_items ORDER BY created_at DESC, id DESC`)
    .all<WishlistItemRow>();
  return results.map(toWishlistItem);
}

export async function getWishlistItemById(db: D1Database, id: number): Promise<WishlistItem | null> {
  const row = await db
    .prepare(`SELECT ${WISHLIST_COLUMNS} FROM atlas_wishlist_items WHERE id = ?1`)
    .bind(id)
    .first<WishlistItemRow>();
  return row ? toWishlistItem(row) : null;
}

export async function createWishlistItem(
  db: D1Database,
  input: WishlistItemInput,
): Promise<WishlistItem> {
  const value = validated(input);
  // Resolved for typo catching only; wishlist never feeds Footprint, so the
  // codes are checked against the selected country and then discarded.
  resolvePlaceLocation(value);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_wishlist_items (
          name, name_zh, country, region, city, latitude, longitude, description, cover
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        RETURNING ${WISHLIST_COLUMNS}
      `)
      .bind(
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
      .first<WishlistItemRow>();
    if (!row) throw new Error("Insert returned no wishlist item.");
    return toWishlistItem(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DataError("conflict", "愿望清单项冲突，请重试");
    throw error;
  }
}

export async function updateWishlistItem(
  db: D1Database,
  id: number,
  input: WishlistItemInput,
): Promise<WishlistItem> {
  const value = validated(input);
  resolvePlaceLocation(value);
  try {
    const row = await db
      .prepare(`
        UPDATE atlas_wishlist_items SET
          name = ?1, name_zh = ?2, country = ?3, region = ?4,
          city = ?5, latitude = ?6, longitude = ?7,
          description = ?8, cover = ?9,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?10
        RETURNING ${WISHLIST_COLUMNS}
      `)
      .bind(
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
      .first<WishlistItemRow>();
    if (!row) throw new DataError("not_found", "愿望清单项不存在");
    return toWishlistItem(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DataError("conflict", "愿望清单项冲突");
    throw error;
  }
}

export async function deleteWishlistItem(db: D1Database, id: number): Promise<void> {
  const result = await db.prepare("DELETE FROM atlas_wishlist_items WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "愿望清单项不存在");
}

/**
 * One-click promote: the item becomes a real Place through the same
 * validation, slug generation and administrative-resolution path as manual
 * creation, and the item is removed in the same atomic batch. No window exists
 * where the place exists and the item remains — a failed batch rolls both
 * back, so a retry can never duplicate the place (Wishlist handoff §4).
 */
export async function promoteWishlistItem(db: D1Database, id: number): Promise<Place> {
  const item = await getWishlistItemById(db, id);
  if (!item) throw new DataError("not_found", "愿望清单项不存在");
  const { value, slug, location } = await preparePlaceInsert(db, {
    name: item.name,
    nameZh: item.nameZh,
    country: item.country,
    region: item.region,
    city: item.city,
    latitude: item.latitude,
    longitude: item.longitude,
    description: item.description,
    cover: item.cover,
  });
  await db.batch([
    db.prepare(`
      INSERT INTO atlas_places (
        slug, name, name_zh, country, region, city, latitude, longitude,
        sovereign_country_code, admin1_code, description, cover
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    `).bind(
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
    ),
    db.prepare("DELETE FROM atlas_wishlist_items WHERE id = ?1").bind(item.id),
  ]);
  // batch() returns no rows, so re-read by slug (two cheap reads total).
  const place = await getPlaceBySlug(db, slug);
  if (!place) throw new Error("Promoted place not found.");
  return place;
}
