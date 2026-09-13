import type { APIRoute } from "astro";
import type { PlaceInput } from "../../../../types/domain";
import { adminApiError, numberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createPlace } from "../../../../lib/db/places";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    const input: PlaceInput = {
      slug: stringValue(body.slug), name: stringValue(body.name), nameZh: optionalStringValue(body.nameZh),
      country: stringValue(body.country), region: optionalStringValue(body.region), city: optionalStringValue(body.city),
      latitude: numberValue(body.latitude), longitude: numberValue(body.longitude),
      description: optionalStringValue(body.description), cover: optionalStringValue(body.cover),
    };
    return json({ ok: true, data: await createPlace(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
