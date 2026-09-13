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
  description: string | null;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceInput {
  slug: string;
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
  location: string;
  latitude: number;
  longitude: number;
  href: string;
  lastVisitedAt: string;
  visitCount: number;
  years: string[];
  journeySlugs: string[];
}

export interface MapJourneyOption {
  slug: string;
  name: string;
  nameZh: string | null;
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
  dayCount: number;
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
  };
}
