import type { APIRoute } from "astro";
import { adminApiError, idFromParams, readJsonObject } from "../../../../../lib/api/admin";
import { json } from "../../../../../lib/api/responses";
import { getDatabase } from "../../../../../lib/db/client";
import { reorderVisits } from "../../../../../lib/db/visits";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const body = await readJsonObject(request);
    const visitIds = Array.isArray(body.visitIds) ? body.visitIds.filter((id): id is number => typeof id === "number") : [];
    await reorderVisits(getDatabase(), idFromParams(params.id), visitIds);
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
