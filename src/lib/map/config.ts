import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    openStreetMap: {
      type: "raster",
      tiles: [TILE_URL],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "open-street-map",
      type: "raster",
      source: "openStreetMap",
      paint: {
        "raster-saturation": -0.82,
        "raster-contrast": -0.12,
        "raster-brightness-max": 0.94,
        "raster-opacity": 0.74,
      },
    },
  ],
};

export const GLOBE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    nasaBlueMarble: {
      type: "raster",
      tiles: [
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
      ],
      tileSize: 256,
      maxzoom: 8,
      attribution: "NASA EOSDIS GIBS",
    },
  },
  layers: [
    {
      id: "space",
      type: "background",
      paint: { "background-color": "#050607" },
    },
    {
      id: "nasa-blue-marble",
      type: "raster",
      source: "nasaBlueMarble",
      paint: {
        "raster-saturation": -0.14,
        "raster-contrast": 0.08,
        "raster-brightness-max": 0.88,
      },
    },
  ],
};

export const MAP_ATTRIBUTION = {
  label: "© OpenStreetMap contributors",
  href: "https://www.openstreetmap.org/copyright",
  libraryLabel: "MapLibre",
  libraryHref: "https://maplibre.org/",
} as const;

export const GLOBE_ATTRIBUTION = {
  label: "Satellite imagery · NASA EOSDIS GIBS",
  href: "https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs",
  libraryLabel: "MapLibre",
  libraryHref: "https://maplibre.org/",
} as const;

export const PLACE_CLUSTER_OPTIONS = {
  cluster: true,
  clusterRadius: 52,
  clusterMaxZoom: 13,
} as const;

export const CLUSTER_RADIUS_EXPRESSION: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["min", 10, ["sqrt", ["get", "point_count"]]],
  1,
  15,
  2,
  18,
  3.2,
  22,
  5,
  27,
  10,
  32,
];
