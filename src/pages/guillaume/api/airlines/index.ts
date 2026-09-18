import type { APIRoute } from "astro";
import type { AirlineInput } from "../../../../types/domain";
import { adminApiError, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createAirline } from "../../../../lib/db/airlines";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    const input: AirlineInput = {
      iataCode: stringValue(body.iataCode),
      icaoCode: optionalStringValue(body.icaoCode),
      name: stringValue(body.name),
      nameZh: optionalStringValue(body.nameZh),
      country: stringValue(body.country),
      callsign: optionalStringValue(body.callsign),
      notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await createAirline(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
