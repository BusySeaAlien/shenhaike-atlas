import type { APIRoute } from "astro";
import type { JourneyInput } from "../../../../types/domain";
import { adminApiError, idFromParams, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteJourney, updateJourney } from "../../../../lib/db/journeys";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = idFromParams(params.id);
    const body = await readJsonObject(request);
    const input: JourneyInput = {
      slug: stringValue(body.slug), name: stringValue(body.name), nameZh: optionalStringValue(body.nameZh),
      startDate: stringValue(body.startDate), endDate: stringValue(body.endDate),
      description: optionalStringValue(body.description), cover: optionalStringValue(body.cover),
    };
    return json({ ok: true, data: await updateJourney(getDatabase(), id, input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const deletedVisits = await deleteJourney(getDatabase(), idFromParams(params.id));
    return json({ ok: true, data: { deletedVisits } });
  } catch (error) {
    return adminApiError(error);
  }
};
