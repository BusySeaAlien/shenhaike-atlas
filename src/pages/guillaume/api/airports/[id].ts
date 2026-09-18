import type { APIRoute } from "astro";
import type { AirportInput } from "../../../../types/domain";
import { adminApiError, idFromParams, numberValue, optionalNumberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteAirport, updateAirport } from "../../../../lib/db/airports";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = idFromParams(params.id);
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
    return json({ ok: true, data: await updateAirport(getDatabase(), id, input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    await deleteAirport(getDatabase(), idFromParams(params.id));
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
