import type { APIRoute } from "astro";
import type { AircraftTypeInput } from "../../../../types/domain";
import { adminApiError, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createAircraftType } from "../../../../lib/db/aircraft-types";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    const input: AircraftTypeInput = {
      icaoCode: stringValue(body.icaoCode),
      manufacturer: stringValue(body.manufacturer),
      model: stringValue(body.model),
      modelZh: optionalStringValue(body.modelZh),
      notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await createAircraftType(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
