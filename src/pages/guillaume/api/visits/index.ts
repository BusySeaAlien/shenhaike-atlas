import type { APIRoute } from "astro";
import type { VisitInput } from "../../../../types/domain";
import { adminApiError, numberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createVisit } from "../../../../lib/db/visits";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    const input: VisitInput = {
      placeId: numberValue(body.placeId), journeyId: numberValue(body.journeyId),
      visitedAt: stringValue(body.visitedAt), sequence: numberValue(body.sequence), notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await createVisit(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
