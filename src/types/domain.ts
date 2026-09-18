export interface DatabaseHealth {
  status: "ready";
  checkedAt: string;
  places: number;
  journeys: number;
  visits: number;
}

export interface Place {
  id: number;
  slug: string;
  name: string;
  nameZh: string | null;
  country: string;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  /**
   * Machine-readable administrative identity, derived from the coordinates by
   * `resolveAdministrativeLocation()`. Never typed by hand and never read from
   * the client (handoff §14-§18). `null` means the point fell outside every
   * polygon at this scale, which a human has to fix.
   */
  sovereignCountryCode: string | null;
  admin1Code: string | null;
  description: string | null;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceInput {
  name: string;
  nameZh?: string | null;
  country: string;
  region?: string | null;
  city?: string | null;
  latitude: number;
  longitude: number;
  description?: string | null;
  cover?: string | null;
}

/**
 * A place the owner wants to visit but has not yet. Deliberately its own
 * entity, not a Place: visited-ness defines `places`, and a wishlist item has
 * no visits by definition (Wishlist handoff §2.1). Field-shaped like Place so
 * promote can hand the values straight to `createPlace`.
 */
export interface WishlistItem {
  id: number;
  name: string;
  nameZh: string | null;
  country: string;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItemInput {
  name: string;
  nameZh?: string | null;
  country: string;
  region?: string | null;
  city?: string | null;
  latitude: number;
  longitude: number;
  description?: string | null;
  cover?: string | null;
}

export interface Journey {
  id: number;
  slug: string;
  name: string;
  nameZh: string | null;
  startDate: string;
  endDate: string;
  description: string | null;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyInput {
  slug: string;
  name: string;
  nameZh?: string | null;
  startDate: string;
  endDate: string;
  description?: string | null;
  cover?: string | null;
}

export interface Visit {
  id: number;
  placeId: number;
  journeyId: number;
  visitedAt: string;
  sequence: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitInput {
  placeId: number;
  journeyId: number;
  visitedAt: string;
  sequence: number;
  notes?: string | null;
}

export interface MapPoint {
  id: string;
  name: string;
  nameEn: string;
  country: string;
  /**
   * Carried through to the globe so Footprint can colour without re-querying.
   * Dropping these anywhere in the D1 -> public.ts -> payload chain silently
   * empties the Footprint view, so the chain is covered by tests.
   */
  sovereignCountryCode: string | null;
  admin1Code: string | null;
  location: string;
  latitude: number;
  longitude: number;
  href: string;
  lastVisitedAt: string;
  visitCount: number;
  years: string[];
  journeySlugs: string[];
}

export interface MapJourneyStop {
  placeId: string;
  name: string;
  nameEn: string;
  country: string;
  latitude: number;
  longitude: number;
  href: string;
  visitedAt: string;
  sequence: number;
}

export interface MapJourneyRoute {
  slug: string;
  name: string;
  nameZh: string | null;
  startDate: string;
  endDate: string;
  stops: MapJourneyStop[];
}

export interface MapJourneyOption {
  slug: string;
  name: string;
  nameZh: string | null;
}

/**
 * Globe payload for wishlist items. Deliberately not a `MapPoint`: no href, no
 * admin codes, no visit aggregation — mixing it into `MapPoint[]` would
 * silently inflate the Footprint fill (Wishlist handoff §7.5).
 */
export interface WishlistPoint {
  id: string;
  name: string;
  nameEn: string;
  nameZh: string | null;
  country: string;
  countryCode: string | null;
  location: string;
  latitude: number;
  longitude: number;
}

export interface MapArchiveData {
  points: MapPoint[];
  years: string[];
  journeys: MapJourneyOption[];
}

export interface VisitedPlaceSummary extends Place {
  lastVisitedAt: string;
  visitCount: number;
}

export interface JourneySummary extends Journey {
  placeCount: number;
  visitCount: number;
  dayCount: number | null;
}

export interface PlaceVisit extends Visit {
  journeySlug: string;
  journeyName: string;
  journeyNameZh: string | null;
}

export interface JourneyVisit extends Visit {
  placeSlug: string;
  placeName: string;
  placeNameZh: string | null;
  latitude: number;
  longitude: number;
}

export interface TimelineVisit extends JourneyVisit {
  journeySlug: string;
  journeyName: string;
  journeyNameZh: string | null;
}

export interface HomeData {
  mapPoints: MapPoint[];
  recentPlaces: VisitedPlaceSummary[];
  journeys: JourneySummary[];
  stats: {
    places: number;
    journeys: number;
    regions: number;
    wishlist: number;
  };
}

export interface PreHomeData extends HomeData {
  routes: MapJourneyRoute[];
  wishlist: WishlistPoint[];
}

// ---------------------------------------------------------------------------
// Flight archive (Flight handoff §5)
// ---------------------------------------------------------------------------

export interface Airport {
  id: number;
  iataCode: string;
  icaoCode: string | null;
  name: string;
  nameZh: string | null;
  city: string;
  cityZh: string | null;
  country: string;
  countryCode: string;
  region: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevationFt: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AirportInput {
  iataCode: string;
  icaoCode?: string | null;
  name: string;
  nameZh?: string | null;
  city: string;
  cityZh?: string | null;
  country: string;
  region?: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevationFt?: number | null;
  notes?: string | null;
}

export interface Airline {
  id: number;
  iataCode: string;
  icaoCode: string | null;
  name: string;
  nameZh: string | null;
  country: string;
  countryCode: string;
  callsign: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AirlineInput {
  iataCode: string;
  icaoCode?: string | null;
  name: string;
  nameZh?: string | null;
  country: string;
  callsign?: string | null;
  notes?: string | null;
}

export interface AircraftType {
  id: number;
  icaoCode: string;
  manufacturer: string;
  model: string;
  modelZh: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AircraftTypeInput {
  icaoCode: string;
  manufacturer: string;
  model: string;
  modelZh?: string | null;
  notes?: string | null;
}

export type CabinClass =
  | "economy"
  | "premium_economy"
  | "business"
  | "first"
  | "other";

export interface Flight {
  id: number;
  airlineId: number;
  flightNumber: string;
  flightDate: string;
  departureAirportId: number;
  arrivalAirportId: number;
  journeyId: number | null;
  aircraftTypeId: number | null;
  aircraftRegistration: string | null;
  scheduledDepartureLocal: string | null;
  scheduledArrivalLocal: string | null;
  cabinClass: CabinClass | null;
  seatNumber: string | null;
  notes: string | null;
  greatCircleKm: number;
  routeFactor: number;
  routeDistanceKm: number;
  estimatedHours: number;
  formulaVersion: number;
  isDomestic: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Flight inputs carry no derived fields: the server computes d/k/D/T, the
 * domestic flag and the formula version from the two airports (handoff §4.5).
 */
export interface FlightInput {
  airlineId: number;
  flightNumber: string;
  flightDate: string;
  departureAirportId: number;
  arrivalAirportId: number;
  journeyId?: number | null;
  aircraftTypeId?: number | null;
  aircraftRegistration?: string | null;
  scheduledDepartureLocal?: string | null;
  scheduledArrivalLocal?: string | null;
  cabinClass?: CabinClass | null;
  seatNumber?: string | null;
  notes?: string | null;
}

// Public `/flight/` payload (handoff §5).

export interface FlightArchiveAirport {
  id: string;
  iataCode: string;
  name: string;
  nameZh: string | null;
  city: string;
  cityZh: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface FlightArchiveRoute {
  id: string;
  displayNumber: string;
  flightDate: string;
  year: string;
  isDomestic: boolean;
  airlineName: string;
  airlineNameZh: string | null;
  aircraftLabel: string | null;
  departure: FlightArchiveAirport;
  arrival: FlightArchiveAirport;
  journeyName: string | null;
  journeyNameZh: string | null;
  greatCircleKm: number;
  routeDistanceKm: number;
  estimatedHours: number;
}

export interface FlightArchiveData {
  airports: FlightArchiveAirport[];
  flights: FlightArchiveRoute[];
  years: string[];
}
