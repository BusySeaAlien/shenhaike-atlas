import type { MapPoint } from "../../types/domain";

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
