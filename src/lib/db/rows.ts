import type {
  AircraftType,
  Airline,
  Airport,
  Flight,
  Journey,
  Place,
  Visit,
  WishlistItem,
} from "../../types/domain";

export interface PlaceRow {
  id: number;
  slug: string;
  name: string;
  name_zh: string | null;
  country: string;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  sovereign_country_code: string | null;
  admin1_code: string | null;
  description: string | null;
  cover: string | null;
  created_at: string;
  updated_at: string;
}

export interface JourneyRow {
  id: number;
  slug: string;
  name: string;
  name_zh: string | null;
  start_date: string;
  end_date: string;
  description: string | null;
  cover: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitRow {
  id: number;
  place_id: number;
  journey_id: number;
  visited_at: string;
  sequence: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WishlistItemRow {
  id: number;
  name: string;
  name_zh: string | null;
  country: string;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  cover: string | null;
  created_at: string;
  updated_at: string;
}

export function toPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameZh: row.name_zh,
    country: row.country,
    region: row.region,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    sovereignCountryCode: row.sovereign_country_code,
    admin1Code: row.admin1_code,
    description: row.description,
    cover: row.cover,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toJourney(row: JourneyRow): Journey {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameZh: row.name_zh,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    cover: row.cover,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toVisit(row: VisitRow): Visit {
  return {
    id: row.id,
    placeId: row.place_id,
    journeyId: row.journey_id,
    visitedAt: row.visited_at,
    sequence: row.sequence,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWishlistItem(row: WishlistItemRow): WishlistItem {
  return {
    id: row.id,
    name: row.name,
    nameZh: row.name_zh,
    country: row.country,
    region: row.region,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    description: row.description,
    cover: row.cover,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface AirportRow {
  id: number;
  iata_code: string;
  icao_code: string | null;
  name: string;
  name_zh: string | null;
  city: string;
  city_zh: string | null;
  country: string;
  country_code: string;
  region: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation_ft: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AirlineRow {
  id: number;
  iata_code: string;
  icao_code: string | null;
  name: string;
  name_zh: string | null;
  country: string;
  country_code: string;
  callsign: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AircraftTypeRow {
  id: number;
  icao_code: string;
  manufacturer: string;
  model: string;
  model_zh: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlightRow {
  id: number;
  airline_id: number;
  flight_number: string;
  flight_date: string;
  departure_airport_id: number;
  arrival_airport_id: number;
  journey_id: number | null;
  aircraft_type_id: number | null;
  aircraft_registration: string | null;
  scheduled_departure_local: string | null;
  scheduled_arrival_local: string | null;
  cabin_class: string | null;
  seat_number: string | null;
  notes: string | null;
  great_circle_km: number;
  route_factor: number;
  route_distance_km: number;
  estimated_hours: number;
  formula_version: number;
  is_domestic: number;
  created_at: string;
  updated_at: string;
}

export function toAirport(row: AirportRow): Airport {
  return {
    id: row.id,
    iataCode: row.iata_code,
    icaoCode: row.icao_code,
    name: row.name,
    nameZh: row.name_zh,
    city: row.city,
    cityZh: row.city_zh,
    country: row.country,
    countryCode: row.country_code,
    region: row.region,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    elevationFt: row.elevation_ft,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAirline(row: AirlineRow): Airline {
  return {
    id: row.id,
    iataCode: row.iata_code,
    icaoCode: row.icao_code,
    name: row.name,
    nameZh: row.name_zh,
    country: row.country,
    countryCode: row.country_code,
    callsign: row.callsign,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAircraftType(row: AircraftTypeRow): AircraftType {
  return {
    id: row.id,
    icaoCode: row.icao_code,
    manufacturer: row.manufacturer,
    model: row.model,
    modelZh: row.model_zh,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toFlight(row: FlightRow): Flight {
  return {
    id: row.id,
    airlineId: row.airline_id,
    flightNumber: row.flight_number,
    flightDate: row.flight_date,
    departureAirportId: row.departure_airport_id,
    arrivalAirportId: row.arrival_airport_id,
    journeyId: row.journey_id,
    aircraftTypeId: row.aircraft_type_id,
    aircraftRegistration: row.aircraft_registration,
    scheduledDepartureLocal: row.scheduled_departure_local,
    scheduledArrivalLocal: row.scheduled_arrival_local,
    cabinClass: (row.cabin_class ?? null) as Flight["cabinClass"],
    seatNumber: row.seat_number,
    notes: row.notes,
    greatCircleKm: row.great_circle_km,
    routeFactor: row.route_factor,
    routeDistanceKm: row.route_distance_km,
    estimatedHours: row.estimated_hours,
    formulaVersion: row.formula_version,
    isDomestic: row.is_domestic === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
