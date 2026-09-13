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
  latitude: number;
  longitude: number;
  href: string;
}
