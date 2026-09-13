import type { APIRoute } from "astro";
import type { JourneyInput } from "../../../../types/domain";
import { adminApiError, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createJourney } from "../../../../lib/db/journeys";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    const input: JourneyInput = {
      slug: stringValue(body.slug), name: stringValue(body.name), nameZh: optionalStringValue(body.nameZh),
      startDate: stringValue(body.startDate), endDate: stringValue(body.endDate),
      description: optionalStringValue(body.description), cover: optionalStringValue(body.cover),
    };
    return json({ ok: true, data: await createJourney(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
