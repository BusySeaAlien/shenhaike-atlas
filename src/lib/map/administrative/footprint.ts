/**
 * Visited sets driving the Footprint view.
 *
 * These read the standard codes only. `country` / `region` free text is never
 * consulted here (handoff §9, §20): the map and the statistics must agree, and
 * both must survive a place being relabelled.
 *
 * @see docs/Atlas-PreHome-Footprint-Mode-Handoff.md §25-§27
 */

/** The minimum a MapPoint must carry to take part in Footprint. */
export interface FootprintPoint {
  sovereignCountryCode: string | null;
  admin1Code: string | null;
}

const CHINA = "CHN";

/** Distinct sovereign countries visited. Taiwan/Hong Kong/Macau all count as CHN. */
export function getVisitedCountries(points: FootprintPoint[]): Set<string> {
  const visited = new Set<string>();
  for (const point of points) {
    if (point.sovereignCountryCode) visited.add(point.sovereignCountryCode);
  }
  return visited;
}

/**
 * Distinct Chinese province-level regions visited.
 *
 * Only places resolved to China take part, and only when they also carry a
 * province code — a Chinese place whose coordinates fell outside every province
 * polygon stays out of the statistics rather than being attributed to a guess.
 */
export function getVisitedChinaRegions(points: FootprintPoint[]): Set<string> {
  const visited = new Set<string>();
  for (const point of points) {
    if (point.sovereignCountryCode !== CHINA) continue;
    if (point.admin1Code) visited.add(point.admin1Code);
  }
  return visited;
}

/**
 * Place counts per code, for a future hover readout (§80/§81).
 *
 * The Footprint fill only needs the visited boolean today, but the count is the
 * same pass over the data and gives hover something to grow into.
 */
export function countByCode(
  points: FootprintPoint[],
  pick: (point: FootprintPoint) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const point of points) {
    const code = pick(point);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}
