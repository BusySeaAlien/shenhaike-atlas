import type { TransportMode } from "../types/domain";

export interface TransportModeOption {
  value: TransportMode;
  labelEn: string;
  labelZh: string;
}

export const TRANSPORT_MODES: TransportMode[] = [
  "plane",
  "train",
  "ship",
  "car",
  "bus",
  "walk",
  "other",
];

/** Single source of truth for the mode enum labels: the admin form dropdown and
 * the public mileage display both read from here (handoff §9). */
export const TRANSPORT_MODE_OPTIONS: TransportModeOption[] = [
  { value: "plane", labelEn: "plane", labelZh: "飞机" },
  { value: "train", labelEn: "train", labelZh: "火车" },
  { value: "ship", labelEn: "ship", labelZh: "轮船" },
  { value: "car", labelEn: "car", labelZh: "汽车" },
  { value: "bus", labelEn: "bus", labelZh: "大巴" },
  { value: "walk", labelEn: "walk", labelZh: "步行" },
  { value: "other", labelEn: "other", labelZh: "其他" },
];

const LABELS = new Map(TRANSPORT_MODE_OPTIONS.map((option) => [option.value, option]));

export function isTransportMode(value: unknown): value is TransportMode {
  return typeof value === "string" && LABELS.has(value as TransportMode);
}

/** English label for public display; `null` (no recorded leg) reads "unrecorded". */
export function transportModeLabel(mode: TransportMode | null): string {
  return mode ? (LABELS.get(mode)?.labelEn ?? mode) : "unrecorded";
}
