import type { APIRoute } from "astro";
import type { WishlistItemInput } from "../../../../types/domain";
import { adminApiError, idFromParams, numberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteWishlistItem, updateWishlistItem } from "../../../../lib/db/wishlist";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = idFromParams(params.id);
    const body = await readJsonObject(request);
    const input: WishlistItemInput = {
      name: stringValue(body.name), nameZh: optionalStringValue(body.nameZh),
      country: stringValue(body.country), region: optionalStringValue(body.region), city: optionalStringValue(body.city),
      latitude: numberValue(body.latitude), longitude: numberValue(body.longitude),
      description: optionalStringValue(body.description), cover: optionalStringValue(body.cover),
    };
    return json({ ok: true, data: await updateWishlistItem(getDatabase(), id, input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    await deleteWishlistItem(getDatabase(), idFromParams(params.id));
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
