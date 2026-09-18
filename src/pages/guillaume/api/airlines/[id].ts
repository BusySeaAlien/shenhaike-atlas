import type { APIRoute } from "astro";
import type { AirlineInput } from "../../../../types/domain";
import { adminApiError, idFromParams, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteAirline, updateAirline } from "../../../../lib/db/airlines";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = idFromParams(params.id);
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
    return json({ ok: true, data: await updateAirline(getDatabase(), id, input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    await deleteAirline(getDatabase(), idFromParams(params.id));
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
