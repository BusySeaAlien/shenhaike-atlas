import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";

/**
 * Footprint styling.
 *
 * Visited and unvisited share one hue and differ only in opacity, so the map
 * never turns into a travel-app choropleth (handoff §35). The tone is the same
 * `#d5ddd8` the journey routes and the China Authority Boundary already use.
 *
 * Geometry carries none of this; it all lives here (§46).
 */

export const FOOTPRINT_FILL_COLOR = "#d5ddd8";

/** Visited: clearly readable, still translucent (§36). */
export const VISITED_FILL_OPACITY = 0.42;

/** Unvisited: enough to read the outline, not enough to fight the imagery (§37). */
export const UNVISITED_FILL_OPACITY = 0.04;

/**
 * One expression for both states, so "visited" can never drift between the fill
 * and any future legend or hover style.
 */
export const VISITED_FILL_OPACITY_EXPRESSION: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "visited"], false],
  VISITED_FILL_OPACITY,
  UNVISITED_FILL_OPACITY,
];

export const ADMIN_FILL_COLOR = "#d5ddd8";

/** Country outlines in World Footprint. */
export const WORLD_BORDER_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  0.5,
  3.5,
  0.7,
  5,
  0.9,
];

/**
 * Province outlines sit below the China Authority Boundary in weight (§51):
 * the national border runs 0.9-1.3 px, so these stay under it.
 */
export const CHINA_INTERNAL_BORDER_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  0.4,
  3.5,
  0.55,
  5,
  0.7,
];

export const BORDER_COLOR = "#d5ddd8";
export const BORDER_OPACITY = 0.55;

/**
 * Fill layer driven purely by `feature-state`, never by the GeoJSON (§45/§46).
 *
 * Deliberately no `fill-opacity-transition`. It would animate *opacity* changes,
 * but Footprint toggles layer **visibility** to appear and disappear, and the
 * visited set does not change during a session — so the transition would never
 * fire. §61 permits a fade but does not require one, and a non-firing
 * transition is worse than none.
 */
export function footprintFillLayer(id: string, source: string): LayerSpecification {
  return {
    id,
    type: "fill",
    source,
    layout: { visibility: "none" },
    paint: {
      "fill-color": FOOTPRINT_FILL_COLOR,
      "fill-opacity": VISITED_FILL_OPACITY_EXPRESSION,
      "fill-antialias": false,
    },
  };
}

export function footprintLineLayer(
  id: string,
  source: string,
  width: ExpressionSpecification,
): LayerSpecification {
  return {
    id,
    type: "line",
    source,
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": BORDER_COLOR,
      "line-opacity": BORDER_OPACITY,
      "line-width": width,
    },
  };
}
