import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

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

/**
 * Wishlist markers draw as hollow rings in this violet. Chosen against the
 * globe palette: amber collides with the night-lights glow, green vanishes
 * into Blue Marble vegetation and the `#d5ddd8` line family, blue into the
 * ocean raster (Wishlist handoff §7.3).
 */
export const WISHLIST_POINT_COLOR = "#b9aef0";

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
