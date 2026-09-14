import type { ExpressionSpecification } from "maplibre-gl";

/**
 * China boundary styling.
 *
 * Geometry lives in `./data`; the GeoJSON carries no colour, width or opacity.
 * Values are starting points — final tuning happens against the real page.
 *
 * @see Atlas 中国国境线数据落地与实施文档.md §15-§17
 */

export const CHINA_BOUNDARY_COLOR = "#d5ddd8";

export const CHINA_BOUNDARY_OPACITY = 0.82;

export const CHINA_NATIONAL_BORDER_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  0.9,
  3.5,
  1.1,
  5,
  1.3,
];

export const CHINA_MARITIME_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  0.8,
  3.5,
  1,
  5,
  1.2,
];

export const CHINA_ISLANDS_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  0.7,
  3.5,
  0.85,
  5,
  1,
];
