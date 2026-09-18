import type { JourneyInput, PlaceInput, TransportMode, VisitInput } from "../../types/domain";
import { isCountryName } from "../countries";
import { dateBounds, isPartialDate } from "../dates";
import { isTransportMode } from "../transport";
import type { ValidationResult } from "./result";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function requiredText(
  value: string,
  field: string,
  maximum: number,
  errors: Record<string, string>,
): string {
  const normalized = value.trim();
  if (!normalized) errors[field] = "必填";
  else if (normalized.length > maximum) errors[field] = `不能超过 ${maximum} 个字符`;
  return normalized;
}

function checkOptionalLength(
  value: string | null,
  field: string,
  maximum: number,
  errors: Record<string, string>,
): void {
  if (value && value.length > maximum) errors[field] = `不能超过 ${maximum} 个字符`;
}

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function validatePlaceInput(input: PlaceInput): ValidationResult<PlaceInput> {
  const errors: Record<string, string> = {};
  const name = requiredText(input.name, "name", 160, errors);
  const country = requiredText(input.country, "country", 100, errors);
  const nameZh = optionalText(input.nameZh);
  const region = optionalText(input.region);
  const city = optionalText(input.city);
  const description = optionalText(input.description);
  const cover = optionalText(input.cover);

  if (country && !isCountryName(country)) errors.country = "请选择列表中的国家";
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    errors.latitude = "纬度必须在 -90 至 90 之间";
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    errors.longitude = "经度必须在 -180 至 180 之间";
  }
  checkOptionalLength(nameZh, "nameZh", 160, errors);
  checkOptionalLength(region, "region", 120, errors);
  checkOptionalLength(city, "city", 120, errors);
  checkOptionalLength(description, "description", 5000, errors);
  checkOptionalLength(cover, "cover", 2048, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      nameZh,
      country,
      region,
      city,
      latitude: input.latitude,
      longitude: input.longitude,
      description,
      cover,
    },
  };
}

export function validateJourneyInput(input: JourneyInput): ValidationResult<JourneyInput> {
  const errors: Record<string, string> = {};
  const slug = requiredText(input.slug, "slug", 100, errors);
  const name = requiredText(input.name, "name", 160, errors);
  const nameZh = optionalText(input.nameZh);
  const description = optionalText(input.description);
  const cover = optionalText(input.cover);

  if (slug && !SLUG_PATTERN.test(slug)) {
    errors.slug = "仅可使用小写字母、数字和单个连字符";
  }
  if (!isPartialDate(input.startDate)) errors.startDate = "请填写 YYYY、YYYY-MM 或 YYYY-MM-DD";
  if (!isPartialDate(input.endDate)) errors.endDate = "请填写 YYYY、YYYY-MM 或 YYYY-MM-DD";
  if (!errors.startDate && !errors.endDate && dateBounds(input.startDate).start > dateBounds(input.endDate).end) {
    errors.endDate = "结束日期不能早于开始日期";
  }
  checkOptionalLength(nameZh, "nameZh", 160, errors);
  checkOptionalLength(description, "description", 5000, errors);
  checkOptionalLength(cover, "cover", 2048, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { slug, name, nameZh, startDate: input.startDate, endDate: input.endDate, description, cover },
  };
}

export function validateVisitInput(input: VisitInput): ValidationResult<VisitInput> {
  const errors: Record<string, string> = {};
  const notes = optionalText(input.notes);
  // The API passes the raw value through for validation; `""`/null/undefined
  // all mean "no recorded leg" (handoff §9).
  const raw = input.transportMode as TransportMode | "" | null | undefined;
  const transportMode = raw == null || raw === "" ? null : raw;

  if (!Number.isInteger(input.placeId) || input.placeId < 1) errors.placeId = "地点不存在";
  if (!Number.isInteger(input.journeyId) || input.journeyId < 1) errors.journeyId = "旅程不存在";
  if (!isPartialDate(input.visitedAt)) errors.visitedAt = "请填写 YYYY、YYYY-MM 或 YYYY-MM-DD";
  if (!Number.isInteger(input.sequence) || input.sequence < 1) errors.sequence = "顺序必须是正整数";
  if (transportMode !== null && !isTransportMode(transportMode)) errors.transportMode = "请选择有效的交通方式";
  checkOptionalLength(notes, "notes", 3000, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...input, notes, transportMode } };
}
