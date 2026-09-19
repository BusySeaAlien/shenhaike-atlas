import { describe, expect, it } from "vitest";
import type { FlightArchiveAirport, FlightArchiveRoute } from "../types/domain";
import {
  ARC_SEGMENTS,
  ARROW_FRACTION,
  ARROW_MIN_KM,
  LANE_BASE_SPACING_DEG,
  LANE_MAX_SPAN_DEG,
  RIGHT_CURVE_OFFSET_DEG,
  prepareFlightArcs,
} from "./flight-arcs";

function airport(id: string, iataCode: string, lng: number, lat: number): FlightArchiveAirport {
  return {
    id,
    iataCode,
    name: iataCode,
    nameZh: null,
    city: iataCode,
    cityZh: null,
    country: "Testland",
    countryCode: "TST",
    latitude: lat,
    longitude: lng,
  };
}

function flight(
  id: string,
  departure: FlightArchiveAirport,
  arrival: FlightArchiveAirport,
  flightDate: string,
  greatCircleKm = 1000,
): FlightArchiveRoute {
  return {
    id,
    displayNumber: "XX" + id,
    flightDate,
    year: flightDate.slice(0, 4),
    isDomestic: true,
    airlineName: "Test Air",
    airlineNameZh: null,
    aircraftLabel: null,
    departure,
    arrival,
    journeyName: null,
    journeyNameZh: null,
    greatCircleKm,
    routeDistanceKm: greatCircleKm * 1.05,
    estimatedHours: 2,
  };
}

const PEK = airport("1", "PEK", 116.6, 40.1);
const HGH = airport("2", "HGH", 120.2, 30.3);
const SHA = airport("3", "SHA", 121.3, 31.2);

describe("prepareFlightArcs lane assignment", () => {
  it("groups A→B and B→A into the same pair and fans lanes symmetrically", () => {
    const arcs = prepareFlightArcs([
      flight("1", PEK, HGH, "2026-01-03"),
      flight("2", HGH, PEK, "2026-01-02"),
    ]);
    const [outbound, inbound] = arcs;
    expect(outbound.pairKey).toBe(inbound.pairKey);
    expect(outbound.laneCount).toBe(2);
    expect(inbound.laneCount).toBe(2);
    expect(outbound.offsetDegrees + inbound.offsetDegrees).toBeCloseTo(0, 9);
    expect(Math.abs(outbound.offsetDegrees)).toBeGreaterThan(0);
    const outboundMidpoint = outbound.path[ARC_SEGMENTS / 2];
    const inboundMidpoint = inbound.path[ARC_SEGMENTS / 2];
    expect(Math.hypot(
      outboundMidpoint[0] - inboundMidpoint[0],
      outboundMidpoint[1] - inboundMidpoint[1],
    )).toBeGreaterThan(0.1);
  });

  it("orders lanes by date desc, id desc within a pair", () => {
    const arcs = prepareFlightArcs([
      flight("1", PEK, HGH, "2025-01-01"),
      flight("2", PEK, HGH, "2026-01-01"),
    ]);
    const newest = arcs.find((arc) => arc.id === "2")!;
    const oldest = arcs.find((arc) => arc.id === "1")!;
    expect(newest.lane).toBeLessThan(oldest.lane);
  });

  it("is deterministic for shuffled input", () => {
    const list = [flight("1", PEK, HGH, "2025-01-01"), flight("2", PEK, HGH, "2026-01-01")];
    const byId = (arcs: { id: string; offsetDegrees: number }[]) =>
      Object.fromEntries(arcs.map((arc) => [arc.id, arc.offsetDegrees]));
    const a = prepareFlightArcs(list);
    const b = prepareFlightArcs([...list].reverse());
    expect(byId(a)).toEqual(byId(b));
  });

  it("never offsets flights whose endpoints are not the identical pair", () => {
    const arcs = prepareFlightArcs([
      flight("1", PEK, HGH, "2026-01-01"),
      flight("2", PEK, SHA, "2026-01-01"),
    ]);
    for (const arc of arcs) {
      expect(arc.laneCount).toBe(1);
      expect(Math.abs(arc.offsetDegrees)).toBe(RIGHT_CURVE_OFFSET_DEG);
    }
  });

  it("compresses spacing for large groups within the bounded span", () => {
    const arcs = prepareFlightArcs(
      Array.from({ length: 15 }, (_, index) => flight(String(index), PEK, HGH, `2026-01-${String(index + 1).padStart(2, "0")}`)),
    );
    const offsets = arcs.map((arc) => arc.offsetDegrees);
    const span = Math.max(...offsets) - Math.min(...offsets);
    expect(span).toBeLessThanOrEqual(LANE_MAX_SPAN_DEG + 1e-9);
    expect(span).toBeGreaterThan(0);
  });

  it("keeps repeated flights visibly separated within the right-hand fan", () => {
    const arcs = prepareFlightArcs([
      flight("1", PEK, HGH, "2026-01-03"),
      flight("2", PEK, HGH, "2026-01-02"),
      flight("3", PEK, HGH, "2026-01-01"),
    ]).sort((a, b) => a.lane - b.lane);
    expect(arcs[1].offsetDegrees - arcs[0].offsetDegrees).toBeCloseTo(LANE_BASE_SPACING_DEG, 9);
    expect(arcs[2].offsetDegrees - arcs[1].offsetDegrees).toBeCloseTo(LANE_BASE_SPACING_DEG, 9);
    expect(arcs.every((arc) => arc.offsetDegrees < 0)).toBe(true);
  });
});

describe("offset arc geometry", () => {
  it("keeps both endpoints exactly at the airports", () => {
    const [arc] = prepareFlightArcs([flight("1", PEK, HGH, "2026-01-01")]);
    expect(arc.path[0]).toEqual([PEK.longitude, PEK.latitude]);
    expect(arc.path[ARC_SEGMENTS]).toEqual([HGH.longitude, HGH.latitude]);
  });

  it("lifts the middle of the route above the globe to avoid depth fighting", () => {
    const [arc] = prepareFlightArcs([flight("1", PEK, HGH, "2026-01-01")]);
    expect(arc.path[ARC_SEGMENTS / 2][2]).toBeGreaterThan(0);
    expect(arc.path[0][2]).toBeUndefined();
    expect(arc.path[ARC_SEGMENTS][2]).toBeUndefined();
  });

  it("bends each direction toward its own right-hand side", () => {
    const west = airport("10", "WST", 0, 0);
    const east = airport("11", "EST", 30, 0);
    const [eastbound, westbound] = prepareFlightArcs([
      flight("1", west, east, "2026-01-01"),
      flight("2", east, west, "2026-01-02"),
    ]);
    // Heading east, right is south; heading west, right is north.
    expect(eastbound.path[ARC_SEGMENTS / 2][1]).toBeLessThan(0);
    expect(westbound.path[ARC_SEGMENTS / 2][1]).toBeGreaterThan(0);
  });

  it("curves a single route to the right instead of leaving it unoffset", () => {
    const west = airport("10", "WST", 0, 0);
    const east = airport("11", "EST", 30, 0);
    const [arc] = prepareFlightArcs([flight("1", west, east, "2026-01-01")]);
    expect(arc.offsetDegrees).toBe(-RIGHT_CURVE_OFFSET_DEG);
    expect(arc.path[ARC_SEGMENTS / 2][1]).toBeLessThan(0);
  });

  it("stays finite for antipodal airports", () => {
    const antipode = airport("20", "ANT", -63.4, -40.1);
    const arcs = prepareFlightArcs([
      flight("1", PEK, antipode, "2026-01-01"),
      flight("2", antipode, PEK, "2026-01-02"),
    ]);
    for (const arc of arcs) {
      for (const [lng, lat] of arc.path) {
        expect(Number.isFinite(lng)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
      }
    }
  });

  it("keeps date-line crossings continuous instead of drawing around the world", () => {
    const chicago = airport("30", "ORD", -87.9073, 41.9742);
    const [arc] = prepareFlightArcs([flight("1", PEK, chicago, "2026-01-01", 10500)]);
    for (let index = 1; index < arc.path.length; index++) {
      expect(Math.abs(arc.path[index][0] - arc.path[index - 1][0])).toBeLessThan(180);
    }
    const finalLongitude = arc.path[ARC_SEGMENTS][0];
    expect(((finalLongitude - chicago.longitude) % 360 + 360) % 360).toBeCloseTo(0, 9);
  });
});

describe("arrow anchors", () => {
  it("places the arrow past the midpoint along the offset path", () => {
    const arcs = prepareFlightArcs([flight("1", PEK, HGH, "2026-01-01")]);
    const arrow = arcs[0].arrow!;
    // The un-offset great circle from PEK to HGH heads south-east: the arrow
    // point must sit south of the departure airport.
    expect(arrow.position[1]).toBeLessThan(PEK.latitude);
    expect(arrow.position[0]).toBeGreaterThan(PEK.longitude);
  });

  it("points the two directions of a return pair away from each other", () => {
    const arcs = prepareFlightArcs([
      flight("1", PEK, HGH, "2026-01-03"),
      flight("2", HGH, PEK, "2026-01-02"),
    ]);
    const [outbound, inbound] = arcs;
    const outboundDelta = outbound.arrow!.ahead[0] - outbound.arrow!.position[0];
    const inboundDelta = inbound.arrow!.ahead[0] - inbound.arrow!.position[0];
    expect(Math.sign(outboundDelta)).toBe(Math.sign(-inboundDelta));
  });

  it("omits the arrow for very short arcs", () => {
    const arcs = prepareFlightArcs([flight("1", PEK, HGH, "2026-01-01", ARROW_MIN_KM - 1)]);
    expect(arcs[0].arrow).toBeNull();
  });

  it("never places the arrow before the midpoint", () => {
    const arcs = prepareFlightArcs([flight("1", PEK, HGH, "2026-01-01")]);
    expect(ARROW_FRACTION).toBeGreaterThan(0.5);
    expect(arcs[0].arrow).not.toBeNull();
  });
});
