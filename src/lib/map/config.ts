export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_OPTIONS = {
  maxZoom: 19,
  crossOrigin: true,
} as const;

export const MAP_ATTRIBUTION = {
  label: "© OpenStreetMap contributors",
  href: "https://www.openstreetmap.org/copyright",
  libraryLabel: "Leaflet",
  libraryHref: "https://leafletjs.com/",
} as const;
