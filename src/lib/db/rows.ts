import type { Journey, Place, Visit, WishlistItem } from "../../types/domain";

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
  transport_mode: string | null;
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
    // `?? null` so a query that forgets the column degrades to "unrecorded"
    // instead of smuggling `undefined` into display (handoff §9).
    transportMode: (row.transport_mode as Visit["transportMode"]) ?? null,
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
