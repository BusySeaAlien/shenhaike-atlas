import type { APIRoute } from "astro";
import type { FlightInput } from "../../../../types/domain";
import { adminApiError, numberValue, optionalNumberValue, optionalStringValue, readJsonObject, stringValue } from "../../../../lib/api/admin";
import { json } from "../../../../lib/api/responses";
import { getDatabase } from "../../../../lib/db/client";
import { createFlight } from "../../../../lib/db/flights";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
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
    return json({ ok: true, data: await createFlight(getDatabase(), input) }, { status: 201 });
  } catch (error) {
    return adminApiError(error);
  }
};
