/**
 * Scope x View state for the pre-home globe.
 *
 * Scope and View are two independent axes, not one list of four modes
 * (handoff §2). Keeping them separate is what lets `Photos` or `Heatmap` be
 * added later without turning the state into a matrix of combinations, and it
 * is what makes "switch scope, keep view" fall out for free.
 *
 * This module is pure: it decides *what should be visible* for a given pair,
 * so the rules can be tested without a map or a browser.
 */

export type ScopeMode = "world" | "china";
export type ViewMode = "journey" | "footprint";

export const DEFAULT_SCOPE: ScopeMode = "world";

/**
 * Footprint opens first, ahead of Journey.
 *
 * Note this is the one documented default the project chose to invert: the
 * handoff opened on Journey so the first visit matched the previous homepage.
 * The trade-off is that World Footprint requests `world-admin0` on first load,
 * where Journey requested nothing (see §46/§103).
 */
export const DEFAULT_VIEW: ViewMode = "footprint";

/** What `applyMapState` has to show for the current pair. */
export interface GlobeVisibilityPlan {
  /** `journey-route` and `journey-stops`. */
  journeyLayers: boolean;
  /** The journey dropdown in the toolbar. */
  journeySelector: boolean;
  /** `world-admin-fill`. */
  worldAdmin: boolean;
  /** `china-admin-fill` and `china-admin-border`. */
  chinaAdmin: boolean;
  /** The China Authority Boundary lines: national border, islands, maritime. */
  chinaAuthority: boolean;
}

/**
 * The state matrix from handoff §72.
 *
 * Two rules carry the weight:
 *
 * - Journey layers and the journey selector follow **View only**, never Scope
 *   (§7). That is why Footprint hides them in both scopes.
 * - The China Authority Boundary follows **Scope only**, never View. World
 *   Footprint already draws China through the admin0 override, so an extra set
 *   of boundary lines there would reintroduce the double-line problem §42-§44
 *   exists to avoid.
 */
export function visibilityPlan(scope: ScopeMode, view: ViewMode): GlobeVisibilityPlan {
  const journey = view === "journey";
  const footprint = view === "footprint";
  return {
    journeyLayers: journey,
    journeySelector: journey,
    worldAdmin: footprint && scope === "world",
    chinaAdmin: footprint && scope === "china",
    chinaAuthority: scope === "china",
  };
}

/** Caption under the toolbar; distinguishes the two ways of reading the data. */
export function captionFor(view: ViewMode): string {
  return view === "journey" ? "Visit sequence · not a tracked route" : "Administrative footprint · from resolved place codes";
}
