import type { APIRoute } from "astro";
import type { AircraftTypeInput } from "../../../../types/domain";
import { adminApiError, idFromParams, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteAircraftType, updateAircraftType } from "../../../../lib/db/aircraft-types";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = idFromParams(params.id);
    const body = await readJsonObject(request);
    const input: AircraftTypeInput = {
      icaoCode: stringValue(body.icaoCode),
      manufacturer: stringValue(body.manufacturer),
      model: stringValue(body.model),
      modelZh: optionalStringValue(body.modelZh),
      notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await updateAircraftType(getDatabase(), id, input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    await deleteAircraftType(getDatabase(), idFromParams(params.id));
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
