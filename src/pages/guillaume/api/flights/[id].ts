import type { APIRoute } from "astro";
import type { FlightInput } from "../../../../types/domain";
import { adminApiError, idFromParams, numberValue, optionalNumberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { deleteFlight, updateFlight } from "../../../../lib/db/flights";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = idFromParams(params.id);
    const body = await readJsonObject(request);
    const input: FlightInput = {
      airlineId: numberValue(body.airlineId),
      flightNumber: stringValue(body.flightNumber),
      flightDate: stringValue(body.flightDate),
      departureAirportId: numberValue(body.departureAirportId),
      arrivalAirportId: numberValue(body.arrivalAirportId),
      journeyId: optionalNumberValue(body.journeyId),
      aircraftTypeId: optionalNumberValue(body.aircraftTypeId),
      aircraftRegistration: optionalStringValue(body.aircraftRegistration),
      scheduledDepartureLocal: optionalStringValue(body.scheduledDepartureLocal),
      scheduledArrivalLocal: optionalStringValue(body.scheduledArrivalLocal),
      cabinClass: optionalStringValue(body.cabinClass) as FlightInput["cabinClass"],
      seatNumber: optionalStringValue(body.seatNumber),
      notes: optionalStringValue(body.notes),
    };
    return json({ ok: true, data: await updateFlight(getDatabase(), id, input) });
  } catch (error) {
    return adminApiError(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    await deleteFlight(getDatabase(), idFromParams(params.id));
    return json({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
};
