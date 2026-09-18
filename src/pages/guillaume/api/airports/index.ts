import type { APIRoute } from "astro";
import type { AirportInput } from "../../../../types/domain";
import { adminApiError, numberValue, optionalNumberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createAirport } from "../../../../lib/db/airports";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    const input: AirportInput = {
      iataCode: stringValue(body.iataCode),
      icaoCode: optionalStringValue(body.icaoCode),
      name: stringValue(body.name),
      nameZh: optionalStringValue(body.nameZh),
      city: stringValue(body.city),
      cityZh: optionalStringValue(body.cityZh),
      country: stringValue(body.country),
      region: optionalStringValue(body.region),
      latitude: numberValue(body.latitude),
      longitude: numberValue(body.longitude),
      timezone: stringValue(body.timezone),
      elevationFt: optionalNumberValue(body.elevationFt),
      notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await createAirport(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
