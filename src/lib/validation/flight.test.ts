import { describe, expect, it } from "vitest";
import type { CabinClass } from "../../types/domain";
import {
  isLocalDateTime,
  validateAircraftTypeInput,
  validateAirlineInput,
  validateAirportInput,
  validateFlightInput,
} from "./domain";

describe("airport validation", () => {
  const validAirport = {
    iataCode: "pvg",
    icaoCode: "zspd",
    name: "Shanghai Pudong International Airport",
    city: "Shanghai",
    country: "China",
    latitude: 31.1443,
    longitude: 121.8083,
    timezone: "Asia/Shanghai",
  };

  it("normalizes IATA and ICAO codes to uppercase", () => {
    const result = validateAirportInput(validAirport);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.iataCode).toBe("PVG");
      expect(result.value.icaoCode).toBe("ZSPD");
    }
  });

  it.each(["pv", "pvg1", "123"])("rejects invalid airport IATA %s", (iataCode) => {
    const result = validateAirportInput({ ...validAirport, iataCode });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.iataCode).toBeDefined();
  });

  it.each(["zsp", "zspd1", "zsp"])("rejects invalid airport ICAO %s", (icaoCode) => {
    const result = validateAirportInput({ ...validAirport, icaoCode });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.icaoCode).toBeDefined();
  });

  it("rejects an unknown country name", () => {
    const result = validateAirportInput({ ...validAirport, country: "Atlantis" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.country).toBeDefined();
  });

  it("rejects out-of-range coordinates and elevation", () => {
    const latitude = validateAirportInput({ ...validAirport, latitude: 91 });
    const longitude = validateAirportInput({ ...validAirport, longitude: 181 });
    const elevation = validateAirportInput({ ...validAirport, elevationFt: 30001 });
    const nonIntegerElevation = validateAirportInput({ ...validAirport, elevationFt: 12.5 });
    expect(latitude.ok).toBe(false);
    expect(longitude.ok).toBe(false);
    expect(elevation.ok).toBe(false);
    expect(nonIntegerElevation.ok).toBe(false);
  });

  it("normalizes empty optional fields to null", () => {
    const result = validateAirportInput({ ...validAirport, icaoCode: "  ", nameZh: " ", region: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.icaoCode).toBeNull();
      expect(result.value.nameZh).toBeNull();
      expect(result.value.region).toBeNull();
    }
  });
});

describe("airline validation", () => {
  const validAirline = {
    iataCode: "mu",
    icaoCode: "ces",
    name: "China Eastern Airlines",
    country: "China",
  };

  it("normalizes codes to uppercase", () => {
    const result = validateAirlineInput(validAirline);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.iataCode).toBe("MU");
      expect(result.value.icaoCode).toBe("CES");
    }
  });

  it("accepts numeric airline IATA codes like 3U", () => {
    const result = validateAirlineInput({ ...validAirline, iataCode: "3u" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.iataCode).toBe("3U");
  });

  it("rejects a three-character airline IATA code", () => {
    const result = validateAirlineInput({ ...validAirline, iataCode: "mux" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.iataCode).toBeDefined();
  });
});

describe("aircraft type validation", () => {
  it("normalizes the type designator to uppercase", () => {
    const result = validateAircraftTypeInput({
      icaoCode: "a320",
      manufacturer: "Airbus",
      model: "A320-200",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.icaoCode).toBe("A320");
  });

  it("rejects a one-character designator", () => {
    const result = validateAircraftTypeInput({ icaoCode: "A", manufacturer: "Airbus", model: "A" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.icaoCode).toBeDefined();
  });
});

describe("flight validation", () => {
  const validFlight = {
    airlineId: 1,
    flightNumber: "05123",
    flightDate: "2026-08-14",
    departureAirportId: 1,
    arrivalAirportId: 2,
  };

  it("preserves leading zeros in the flight number", () => {
    const result = validateFlightInput(validFlight);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.flightNumber).toBe("05123");
  });

  it("rejects a flight number containing letters", () => {
    const result = validateFlightInput({ ...validFlight, flightNumber: "MU5123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.flightNumber).toBeDefined();
  });

  it("rejects a flight number longer than six digits", () => {
    const result = validateFlightInput({ ...validFlight, flightNumber: "1234567" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.flightNumber).toBeDefined();
  });

  it("rejects a non-calendar flight date", () => {
    const result = validateFlightInput({ ...validFlight, flightDate: "2026-02-30" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.flightDate).toBeDefined();
  });

  it("rejects identical departure and arrival airports", () => {
    const result = validateFlightInput({ ...validFlight, arrivalAirportId: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.arrivalAirportId).toBeDefined();
  });

  it("rejects missing foreign keys", () => {
    const result = validateFlightInput({ ...validFlight, airlineId: 0, arrivalAirportId: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.airlineId).toBeDefined();
      expect(result.errors.arrivalAirportId).toBeDefined();
    }
  });

  it("uppercases the aircraft registration", () => {
    const result = validateFlightInput({ ...validFlight, aircraftRegistration: "b-1234" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.aircraftRegistration).toBe("B-1234");
  });

  it("rejects an invalid local datetime", () => {
    const result = validateFlightInput({ ...validFlight, scheduledDepartureLocal: "2026-08-14T25:00" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.scheduledDepartureLocal).toBeDefined();
  });

  it("rejects an invalid cabin class", () => {
    const result = validateFlightInput({ ...validFlight, cabinClass: "royal" as CabinClass });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.cabinClass).toBeDefined();
  });
});

describe("isLocalDateTime", () => {
  it.each(["2026-08-14T08:00", "2024-02-29T23:59", "2026-12-31T00:00"])("accepts %s", (value) => {
    expect(isLocalDateTime(value)).toBe(true);
  });

  it.each(["2026-08-14T8:00", "2026-02-30T08:00", "2026-08-14T24:00", "2026-08-14T08:60", "not-a-time"])(
    "rejects %s",
    (value) => {
      expect(isLocalDateTime(value)).toBe(false);
    },
  );
});
