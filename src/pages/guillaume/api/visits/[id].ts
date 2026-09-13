import type { APIRoute } from "astro";
import type { VisitInput } from "../../../../types/domain";
import { adminApiError, idFromParams, numberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteVisit, updateVisit } from "../../../../lib/db/visits";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const body = await readJsonObject(request);
    const input: VisitInput = {
      placeId: numberValue(body.placeId), journeyId: numberValue(body.journeyId),
      visitedAt: stringValue(body.visitedAt), sequence: numberValue(body.sequence), notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await updateVisit(getDatabase(), idFromParams(params.id), input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    await deleteVisit(getDatabase(), idFromParams(params.id));
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
