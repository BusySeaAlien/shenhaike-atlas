import type {
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
} from "../../types/domain";
import { inclusiveDayCount } from "../dates";
import { getJourneyBySlug } from "./journeys";
import { getPlaceBySlug } from "./places";
import type { JourneyRow, PlaceRow, VisitRow } from "./rows";
import { toJourney, toPlace, toVisit } from "./rows";

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
    FROM places p
    INNER JOIN visits v ON v.place_id = p.id
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
    FROM journeys j
    LEFT JOIN visits v ON v.journey_id = j.id
    GROUP BY j.id
    ORDER BY j.start_date DESC, j.id DESC
  `).all<JourneySummaryRow>();
  return results.map(toJourneySummary);
}

export async function getMapArchiveData(db: D1Database): Promise<MapArchiveData> {
  const { results } = await db.prepare(`
    SELECT ${PLACE_COLUMNS}, v.visited_at,
      j.slug AS journey_slug, j.name AS journey_name, j.name_zh AS journey_name_zh
    FROM visits v
    INNER JOIN places p ON p.id = v.place_id
    INNER JOIN journeys j ON j.id = v.journey_id
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

export async function getPreHomeData(db: D1Database): Promise<PreHomeData> {
  const [home, routeRows] = await Promise.all([
    getHomeData(db),
    db.prepare(`
      SELECT v.id AS visit_id, v.visited_at, v.sequence,
        j.slug AS journey_slug, j.name AS journey_name, j.name_zh AS journey_name_zh,
        j.start_date, j.end_date,
        p.id AS place_id, p.slug AS place_slug, p.name AS place_name,
        p.name_zh AS place_name_zh, p.country, p.latitude, p.longitude
      FROM visits v
      INNER JOIN journeys j ON j.id = v.journey_id
      INNER JOIN places p ON p.id = v.place_id
      ORDER BY j.start_date DESC, j.id DESC, v.sequence, v.id
    `).all<PreHomeVisitRow>(),
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

  return { ...home, routes: [...routeMap.values()] };
}

export async function getHomeData(db: D1Database): Promise<HomeData> {
  const recentPlaces = await listVisitedPlaces(db);
  const journeys = await listJourneySummaries(db);
  const map = await getMapArchiveData(db);
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
    FROM visits v
    INNER JOIN journeys j ON j.id = v.journey_id
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
    FROM visits v
    INNER JOIN places p ON p.id = v.place_id
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
    FROM visits v
    INNER JOIN places p ON p.id = v.place_id
    INNER JOIN journeys j ON j.id = v.journey_id
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
