import type { APIRoute } from "astro";
import { adminApiError, idFromParams } from "../../../../../lib/api/admin";
import { json } from "../../../../../lib/api/responses";
import { getDatabase } from "../../../../../lib/db/client";
import { promoteWishlistItem } from "../../../../../lib/db/wishlist";

export const prerender = false;

/**
 * Returns the created place so the admin UI can deep-link to its edit page.
 * The wishlist item is removed in the same atomic batch (Wishlist handoff §4).
 */
export const POST: APIRoute = async ({ params }) => {
  try {
    const place = await promoteWishlistItem(getDatabase(), idFromParams(params.id));
    return json({ ok: true, data: place }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
