export interface DatabaseHealth {
  status: "ready";
  checkedAt: string;
}

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  href: string;
}
