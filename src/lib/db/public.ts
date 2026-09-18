import type {
  FlightArchiveAirport,
  FlightArchiveData,
  FlightArchiveRoute,
  HomeData,
  Journey,
  JourneySummary,
  JourneyVisit,
  MapArchiveData,
  MapPoint,
  MapJourneyRoute,
  PreHomeData,
  Place,
  PlaceVisit,
  TimelineVisit,
  VisitedPlaceSummary,
  WishlistItem,
} from "../../types/domain";
import { inclusiveDayCount } from "../dates";
import { countryCodeForName } from "../countries";
import { getJourneyBySlug } from "./journeys";
import { getPlaceBySlug } from "./places";
import type { JourneyRow, PlaceRow, VisitRow } from "./rows";
import { toJourney, toPlace, toVisit } from "./rows";
import { listWishlistItems } from "./wishlist";

interface VisitedPlaceRow extends PlaceRow {
  last_visited_at: string;
  visit_count: number;
}

interface JourneySummaryRow extends JourneyRow {
  place_count: number;
  visit_count: number;
}

interface PlaceVisitRow extends VisitRow {
  journey_slug: string;
  journey_name: string;
  journey_name_zh: string | null;
}

interface JourneyVisitRow extends VisitRow {
  place_slug: string;
  place_name: string;
  place_name_zh: string | null;
  latitude: number;
  longitude: number;
}

interface TimelineVisitRow extends JourneyVisitRow {
  journey_slug: string;
  journey_name: string;
  journey_name_zh: string | null;
}

interface MapVisitRow extends PlaceRow {
  visited_at: string;
  journey_slug: string;
  journey_name: string;
  journey_name_zh: string | null;
}

interface PreHomeVisitRow {
  visit_id: number;
  visited_at: string;
  sequence: number;
  journey_slug: string;
  journey_name: string;
  journey_name_zh: string | null;
  start_date: string;
  end_date: string;
  place_id: number;
  place_slug: string;
  place_name: string;
  place_name_zh: string | null;
  country: string;
  latitude: number;
  longitude: number;
}

const PLACE_COLUMNS = `
  p.id, p.slug, p.name, p.name_zh, p.country, p.region, p.city,
  p.latitude, p.longitude, p.sovereign_country_code, p.admin1_code,
  p.description, p.cover, p.created_at, p.updated_at
`;

const JOURNEY_COLUMNS = `
  j.id, j.slug, j.name, j.name_zh, j.start_date, j.end_date,
  j.description, j.cover, j.created_at, j.updated_at
`;

function toVisitedPlace(row: VisitedPlaceRow): VisitedPlaceSummary {
  return { ...toPlace(row), lastVisitedAt: row.last_visited_at, visitCount: row.visit_count };
}

function toJourneySummary(row: JourneySummaryRow): JourneySummary {
  const journey = toJourney(row);
  return {
    ...journey,
    placeCount: row.place_count,
    visitCount: row.visit_count,
    dayCount: inclusiveDayCount(journey.startDate, journey.endDate),
  };
}

export async function listVisitedPlaces(db: D1Database): Promise<VisitedPlaceSummary[]> {
  const { results } = await db.prepare(`
    SELECT ${PLACE_COLUMNS}, MAX(v.visited_at) AS last_visited_at, COUNT(v.id) AS visit_count
    FROM atlas_places p
    INNER JOIN atlas_visits v ON v.place_id = p.id
    GROUP BY p.id
    ORDER BY last_visited_at DESC, p.id DESC
  `).all<VisitedPlaceRow>();
  return results.map(toVisitedPlace);
}

export async function listJourneySummaries(db: D1Database): Promise<JourneySummary[]> {
  const { results } = await db.prepare(`
    SELECT ${JOURNEY_COLUMNS},
      COUNT(DISTINCT v.place_id) AS place_count,
      COUNT(v.id) AS visit_count
    FROM atlas_journeys j
    LEFT JOIN atlas_visits v ON v.journey_id = j.id
    GROUP BY j.id
    ORDER BY j.start_date DESC, j.id DESC
  `).all<JourneySummaryRow>();
  return results.map(toJourneySummary);
}

export async function getMapArchiveData(db: D1Database): Promise<MapArchiveData> {
  const { results } = await db.prepare(`
    SELECT ${PLACE_COLUMNS}, v.visited_at,
      j.slug AS journey_slug, j.name AS journey_name, j.name_zh AS journey_name_zh
    FROM atlas_visits v
    INNER JOIN atlas_places p ON p.id = v.place_id
    INNER JOIN atlas_journeys j ON j.id = v.journey_id
    ORDER BY v.visited_at DESC, v.id DESC
  `).all<MapVisitRow>();

  const pointMap = new Map<number, MapPoint>();
  const journeyMap = new Map<string, MapArchiveData["journeys"][number]>();
  const years = new Set<string>();
  for (const row of results) {
    const place = toPlace(row);
    const year = row.visited_at.slice(0, 4);
    years.add(year);
    journeyMap.set(row.journey_slug, {
      slug: row.journey_slug,
      name: row.journey_name,
      nameZh: row.journey_name_zh,
    });
    const existing = pointMap.get(place.id);
    if (existing) {
      existing.visitCount += 1;
      if (!existing.years.includes(year)) existing.years.push(year);
      if (!existing.journeySlugs.includes(row.journey_slug)) existing.journeySlugs.push(row.journey_slug);
      continue;
    }
    pointMap.set(place.id, {
      id: String(place.id),
      name: place.nameZh || place.name,
      nameEn: place.name,
      country: place.country,
      // Must survive into the payload; Footprint reads only these two.
      sovereignCountryCode: place.sovereignCountryCode,
      admin1Code: place.admin1Code,
      location: [place.city, place.region, place.country].filter(Boolean).join(" · "),
      latitude: place.latitude,
      longitude: place.longitude,
      href: `/places/${place.slug}/`,
      lastVisitedAt: row.visited_at,
      visitCount: 1,
      years: [year],
      journeySlugs: [row.journey_slug],
    });
  }

  return {
    points: [...pointMap.values()],
    years: [...years].sort((a, b) => b.localeCompare(a)),
    journeys: [...journeyMap.values()],
  };
}

export async function listWishlist(db: D1Database): Promise<WishlistItem[]> {
  return listWishlistItems(db);
}

export async function getPreHomeData(db: D1Database): Promise<PreHomeData> {
  const [home, routeRows, wishlistItems] = await Promise.all([
    getHomeData(db),
    db.prepare(`
      SELECT v.id AS visit_id, v.visited_at, v.sequence,
        j.slug AS journey_slug, j.name AS journey_name, j.name_zh AS journey_name_zh,
        j.start_date, j.end_date,
        p.id AS place_id, p.slug AS place_slug, p.name AS place_name,
        p.name_zh AS place_name_zh, p.country, p.latitude, p.longitude
      FROM atlas_visits v
      INNER JOIN atlas_journeys j ON j.id = v.journey_id
      INNER JOIN atlas_places p ON p.id = v.place_id
      ORDER BY j.start_date DESC, j.id DESC, v.sequence, v.id
    `).all<PreHomeVisitRow>(),
    listWishlistItems(db),
  ]);

  const routeMap = new Map<string, MapJourneyRoute>();
  for (const row of routeRows.results) {
    let route = routeMap.get(row.journey_slug);
    if (!route) {
      route = {
        slug: row.journey_slug,
        name: row.journey_name,
        nameZh: row.journey_name_zh,
        startDate: row.start_date,
        endDate: row.end_date,
        stops: [],
      };
      routeMap.set(row.journey_slug, route);
    }
    route.stops.push({
      placeId: String(row.place_id),
      name: row.place_name_zh || row.place_name,
      nameEn: row.place_name,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      href: `/places/${row.place_slug}/`,
      visitedAt: row.visited_at,
      sequence: row.sequence,
    });
  }

  const wishlist: PreHomeData["wishlist"] = wishlistItems.map((item) => ({
    id: String(item.id),
    name: item.nameZh || item.name,
    nameEn: item.name,
    nameZh: item.nameZh,
    country: item.country,
    countryCode: countryCodeForName(item.country),
    location: [item.city, item.region, item.country].filter(Boolean).join(" · "),
    latitude: item.latitude,
    longitude: item.longitude,
  }));

  return { ...home, routes: [...routeMap.values()], wishlist };
}

export async function getHomeData(db: D1Database): Promise<HomeData> {
  const [recentPlaces, journeys, map, wishlistCount] = await Promise.all([
    listVisitedPlaces(db),
    listJourneySummaries(db),
    getMapArchiveData(db),
    db.prepare("SELECT COUNT(*) AS count FROM atlas_wishlist_items").first<{ count: number }>(),
  ]);
  const visitedJourneys = journeys.filter((journey) => journey.visitCount > 0);
  const regions = new Set(
    recentPlaces
      .filter((place) => place.country.trim() && place.region?.trim())
      .map((place) => `${place.country}\u001f${place.region}`),
  );
  return {
    mapPoints: map.points,
    recentPlaces: recentPlaces.slice(0, 6),
    journeys: visitedJourneys,
    stats: {
      places: recentPlaces.length,
      journeys: visitedJourneys.length,
      regions: regions.size,
      wishlist: wishlistCount?.count ?? 0,
    },
  };
}

export async function getPlaceDetail(
  db: D1Database,
  slug: string,
): Promise<{ place: Place; visits: PlaceVisit[] } | null> {
  const place = await getPlaceBySlug(db, slug);
  if (!place) return null;
  const { results } = await db.prepare(`
    SELECT v.id, v.place_id, v.journey_id, v.visited_at, v.sequence, v.notes,
      v.created_at, v.updated_at,
      j.slug AS journey_slug, j.name AS journey_name, j.name_zh AS journey_name_zh
    FROM atlas_visits v
    INNER JOIN atlas_journeys j ON j.id = v.journey_id
    WHERE v.place_id = ?1
    ORDER BY v.visited_at DESC, v.id DESC
  `).bind(place.id).all<PlaceVisitRow>();
  return {
    place,
    visits: results.map((row) => ({
      ...toVisit(row),
      journeySlug: row.journey_slug,
      journeyName: row.journey_name,
      journeyNameZh: row.journey_name_zh,
    })),
  };
}

export async function getJourneyDetail(
  db: D1Database,
  slug: string,
): Promise<{ journey: Journey; visits: JourneyVisit[] } | null> {
  const journey = await getJourneyBySlug(db, slug);
  if (!journey) return null;
  const { results } = await db.prepare(`
    SELECT v.id, v.place_id, v.journey_id, v.visited_at, v.sequence, v.notes,
      v.created_at, v.updated_at,
      p.slug AS place_slug, p.name AS place_name, p.name_zh AS place_name_zh,
      p.latitude, p.longitude
    FROM atlas_visits v
    INNER JOIN atlas_places p ON p.id = v.place_id
    WHERE v.journey_id = ?1
    ORDER BY v.sequence, v.id
  `).bind(journey.id).all<JourneyVisitRow>();
  return {
    journey,
    visits: results.map((row) => ({
      ...toVisit(row),
      placeSlug: row.place_slug,
      placeName: row.place_name,
      placeNameZh: row.place_name_zh,
      latitude: row.latitude,
      longitude: row.longitude,
    })),
  };
}

export async function listTimeline(db: D1Database): Promise<TimelineVisit[]> {
  const { results } = await db.prepare(`
    SELECT v.id, v.place_id, v.journey_id, v.visited_at, v.sequence, v.notes,
      v.created_at, v.updated_at,
      p.slug AS place_slug, p.name AS place_name, p.name_zh AS place_name_zh,
      p.latitude, p.longitude,
      j.slug AS journey_slug, j.name AS journey_name, j.name_zh AS journey_name_zh
    FROM atlas_visits v
    INNER JOIN atlas_places p ON p.id = v.place_id
    INNER JOIN atlas_journeys j ON j.id = v.journey_id
    ORDER BY v.visited_at DESC, v.id DESC
  `).all<TimelineVisitRow>();
  return results.map((row) => ({
    ...toVisit(row),
    placeSlug: row.place_slug,
    placeName: row.place_name,
    placeNameZh: row.place_name_zh,
    latitude: row.latitude,
    longitude: row.longitude,
    journeySlug: row.journey_slug,
    journeyName: row.journey_name,
    journeyNameZh: row.journey_name_zh,
  }));
}

interface FlightArchiveRow {
  id: number;
  flight_number: string;
  flight_date: string;
  is_domestic: number;
  great_circle_km: number;
  route_distance_km: number;
  estimated_hours: number;
  airline_iata: string;
  airline_name: string;
  airline_name_zh: string | null;
  aircraft_icao: string | null;
  aircraft_manufacturer: string | null;
  aircraft_model: string | null;
  dep_id: number;
  dep_iata: string;
  dep_name: string;
  dep_name_zh: string | null;
  dep_city: string;
  dep_city_zh: string | null;
  dep_country: string;
  dep_country_code: string;
  dep_latitude: number;
  dep_longitude: number;
  arr_id: number;
  arr_iata: string;
  arr_name: string;
  arr_name_zh: string | null;
  arr_city: string;
  arr_city_zh: string | null;
  arr_country: string;
  arr_country_code: string;
  arr_latitude: number;
  arr_longitude: number;
  journey_name: string | null;
  journey_name_zh: string | null;
}

function toArchiveAirport(
  id: number,
  iataCode: string,
  name: string,
  nameZh: string | null,
  city: string,
  cityZh: string | null,
  country: string,
  countryCode: string,
  latitude: number,
  longitude: number,
): FlightArchiveAirport {
  return {
    id: String(id),
    iataCode,
    name,
    nameZh,
    city,
    cityZh,
    country,
    countryCode,
    latitude,
    longitude,
  };
}

/**
 * The public `/flight/` payload (handoff §6/§10). One JOIN pulls every Flight
 * with its airline, both airports, optional aircraft type and optional journey;
 * no per-flight follow-up queries. Airport payload is de-duplicated by id from
 * the flights that are present, and years are the flight dates' first four
 * digits in descending order.
 */
export async function getFlightArchiveData(db: D1Database): Promise<FlightArchiveData> {
  const { results } = await db.prepare(`
    SELECT f.id, f.flight_number, f.flight_date, f.is_domestic,
      f.great_circle_km, f.route_distance_km, f.estimated_hours,
      al.iata_code AS airline_iata, al.name AS airline_name, al.name_zh AS airline_name_zh,
      ac.icao_code AS aircraft_icao, ac.manufacturer AS aircraft_manufacturer, ac.model AS aircraft_model,
      dep.id AS dep_id, dep.iata_code AS dep_iata, dep.name AS dep_name, dep.name_zh AS dep_name_zh,
      dep.city AS dep_city, dep.city_zh AS dep_city_zh, dep.country AS dep_country, dep.country_code AS dep_country_code,
      dep.latitude AS dep_latitude, dep.longitude AS dep_longitude,
      arr.id AS arr_id, arr.iata_code AS arr_iata, arr.name AS arr_name, arr.name_zh AS arr_name_zh,
      arr.city AS arr_city, arr.city_zh AS arr_city_zh, arr.country AS arr_country, arr.country_code AS arr_country_code,
      arr.latitude AS arr_latitude, arr.longitude AS arr_longitude,
      j.name AS journey_name, j.name_zh AS journey_name_zh
    FROM atlas_flights f
    INNER JOIN atlas_airlines al ON al.id = f.airline_id
    INNER JOIN atlas_airports dep ON dep.id = f.departure_airport_id
    INNER JOIN atlas_airports arr ON arr.id = f.arrival_airport_id
    LEFT JOIN atlas_aircraft_types ac ON ac.id = f.aircraft_type_id
    LEFT JOIN atlas_journeys j ON j.id = f.journey_id
    ORDER BY f.flight_date DESC, f.id DESC
  `).all<FlightArchiveRow>();

  const airportMap = new Map<number, FlightArchiveAirport>();
  const years = new Set<string>();
  const flights: FlightArchiveRoute[] = results.map((row) => {
    years.add(row.flight_date.slice(0, 4));

    const departure = airportMap.get(row.dep_id) ?? toArchiveAirport(
      row.dep_id,
      row.dep_iata,
      row.dep_name,
      row.dep_name_zh,
      row.dep_city,
      row.dep_city_zh,
      row.dep_country,
      row.dep_country_code,
      row.dep_latitude,
      row.dep_longitude,
    );
    airportMap.set(row.dep_id, departure);

    const arrival = airportMap.get(row.arr_id) ?? toArchiveAirport(
      row.arr_id,
      row.arr_iata,
      row.arr_name,
      row.arr_name_zh,
      row.arr_city,
      row.arr_city_zh,
      row.arr_country,
      row.arr_country_code,
      row.arr_latitude,
      row.arr_longitude,
    );
    airportMap.set(row.arr_id, arrival);

    const aircraftLabel = row.aircraft_icao
      ? `${row.aircraft_icao} · ${[row.aircraft_manufacturer, row.aircraft_model].filter(Boolean).join(" ")}`
      : null;

    return {
      id: String(row.id),
      displayNumber: `${row.airline_iata}${row.flight_number}`,
      flightDate: row.flight_date,
      year: row.flight_date.slice(0, 4),
      isDomestic: row.is_domestic === 1,
      airlineName: row.airline_name,
      airlineNameZh: row.airline_name_zh,
      aircraftLabel,
      departure,
      arrival,
      journeyName: row.journey_name,
      journeyNameZh: row.journey_name_zh,
      greatCircleKm: row.great_circle_km,
      routeDistanceKm: row.route_distance_km,
      estimatedHours: row.estimated_hours,
    };
  });

  return {
    airports: [...airportMap.values()],
    flights,
    years: [...years].sort((a, b) => b.localeCompare(a)),
  };
}
