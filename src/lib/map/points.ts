import type { MapPoint } from "../../types/domain";

export interface MapFilters {
  year?: string;
  journey?: string;
}

export function validMapPoints(points: MapPoint[]): MapPoint[] {
  return points.filter(
    ({ latitude, longitude }) =>
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180,
  );
}

export function mapPointMatches(point: MapPoint, filters: MapFilters): boolean {
  const matchesYear = !filters.year || point.years.includes(filters.year);
  const matchesJourney = !filters.journey || point.journeySlugs.includes(filters.journey);
  return matchesYear && matchesJourney;
}

export function filterMapPoints(points: MapPoint[], filters: MapFilters): MapPoint[] {
  return validMapPoints(points).filter((point) => mapPointMatches(point, filters));
}
