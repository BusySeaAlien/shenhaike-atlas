import type {
  AircraftTypeInput,
  AirlineInput,
  AirportInput,
  CabinClass,
  FlightInput,
  JourneyInput,
  PlaceInput,
  VisitInput,
} from "../../types/domain";
import { isCountryName } from "../countries";
import { dateBounds, isPartialDate } from "../dates";
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

  if (!Number.isInteger(input.placeId) || input.placeId < 1) errors.placeId = "地点不存在";
  if (!Number.isInteger(input.journeyId) || input.journeyId < 1) errors.journeyId = "旅程不存在";
  if (!isPartialDate(input.visitedAt)) errors.visitedAt = "请填写 YYYY、YYYY-MM 或 YYYY-MM-DD";
  if (!Number.isInteger(input.sequence) || input.sequence < 1) errors.sequence = "顺序必须是正整数";
  checkOptionalLength(notes, "notes", 3000, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...input, notes } };
}

// ---------------------------------------------------------------------------
// Flight archive validators (Flight handoff §7)
// ---------------------------------------------------------------------------

const AIRPORT_IATA_PATTERN = /^[A-Z]{3}$/;
const AIRPORT_ICAO_PATTERN = /^[A-Z0-9]{4}$/;
const AIRLINE_IATA_PATTERN = /^[A-Z0-9]{2}$/;
const AIRLINE_ICAO_PATTERN = /^[A-Z0-9]{3}$/;
const AIRCRAFT_ICAO_PATTERN = /^[A-Z0-9]{2,4}$/;
const FLIGHT_NUMBER_PATTERN = /^[0-9]{1,6}$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+./-]+$/;

const CABIN_CLASSES: ReadonlySet<string> = new Set([
  "economy",
  "premium_economy",
  "business",
  "first",
  "other",
]);

function requiredCode(
  value: string | null | undefined,
  field: string,
  pattern: RegExp,
  hint: string,
  errors: Record<string, string>,
): string {
  const normalized = (value?.trim() ?? "").toUpperCase();
  if (!normalized) errors[field] = "必填";
  else if (!pattern.test(normalized)) errors[field] = hint;
  return normalized;
}

function optionalCode(
  value: string | null | undefined,
  field: string,
  pattern: RegExp,
  hint: string,
  errors: Record<string, string>,
): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const normalized = text.toUpperCase();
  if (!pattern.test(normalized)) errors[field] = hint;
  return normalized;
}

/**
 * A `YYYY-MM-DDTHH:mm` local datetime. The calendar day must exist and the
 * hour/minute must be within range; the value is deliberately NOT converted to
 * any timezone (handoff §3.4).
 */
export function isLocalDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return false;
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function optionalInteger(
  value: number | null | undefined,
  field: string,
  minimum: number,
  maximum: number,
  hint: string,
  errors: Record<string, string>,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < minimum || value > maximum) errors[field] = hint;
  return value;
}

export function validateAirportInput(input: AirportInput): ValidationResult<AirportInput> {
  const errors: Record<string, string> = {};
  const iataCode = requiredCode(input.iataCode, "iataCode", AIRPORT_IATA_PATTERN, "必须是三位英文字母", errors);
  const icaoCode = optionalCode(input.icaoCode, "icaoCode", AIRPORT_ICAO_PATTERN, "必须是四位字母或数字", errors);
  const name = requiredText(input.name, "name", 160, errors);
  const city = requiredText(input.city, "city", 120, errors);
  const country = requiredText(input.country, "country", 100, errors);
  const timezone = requiredText(input.timezone, "timezone", 64, errors);
  const nameZh = optionalText(input.nameZh);
  const cityZh = optionalText(input.cityZh);
  const region = optionalText(input.region);
  const notes = optionalText(input.notes);
  const elevationFt = optionalInteger(input.elevationFt, "elevationFt", -2000, 30000, "海拔必须是 -2000 至 30000 之间的整数（英尺）", errors);

  if (country && !isCountryName(country)) errors.country = "请选择列表中的国家";
  if (timezone && !TIMEZONE_PATTERN.test(timezone)) errors.timezone = "请填写 IANA 时区，例如 Asia/Shanghai";
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    errors.latitude = "纬度必须在 -90 至 90 之间";
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    errors.longitude = "经度必须在 -180 至 180 之间";
  }
  checkOptionalLength(nameZh, "nameZh", 160, errors);
  checkOptionalLength(cityZh, "cityZh", 120, errors);
  checkOptionalLength(region, "region", 120, errors);
  checkOptionalLength(notes, "notes", 3000, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      iataCode,
      icaoCode,
      name,
      nameZh,
      city,
      cityZh,
      country,
      region,
      latitude: input.latitude,
      longitude: input.longitude,
      timezone,
      elevationFt,
      notes,
    },
  };
}

export function validateAirlineInput(input: AirlineInput): ValidationResult<AirlineInput> {
  const errors: Record<string, string> = {};
  const iataCode = requiredCode(input.iataCode, "iataCode", AIRLINE_IATA_PATTERN, "必须是两位字母或数字", errors);
  const icaoCode = optionalCode(input.icaoCode, "icaoCode", AIRLINE_ICAO_PATTERN, "必须是三位字母或数字", errors);
  const name = requiredText(input.name, "name", 160, errors);
  const country = requiredText(input.country, "country", 100, errors);
  const nameZh = optionalText(input.nameZh);
  const callsign = optionalText(input.callsign);
  const notes = optionalText(input.notes);

  if (country && !isCountryName(country)) errors.country = "请选择列表中的国家";
  checkOptionalLength(nameZh, "nameZh", 160, errors);
  checkOptionalLength(callsign, "callsign", 80, errors);
  checkOptionalLength(notes, "notes", 3000, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { iataCode, icaoCode, name, nameZh, country, callsign, notes } };
}

export function validateAircraftTypeInput(
  input: AircraftTypeInput,
): ValidationResult<AircraftTypeInput> {
  const errors: Record<string, string> = {};
  const icaoCode = requiredCode(input.icaoCode, "icaoCode", AIRCRAFT_ICAO_PATTERN, "必须是 2–4 位字母或数字", errors);
  const manufacturer = requiredText(input.manufacturer, "manufacturer", 100, errors);
  const model = requiredText(input.model, "model", 160, errors);
  const modelZh = optionalText(input.modelZh);
  const notes = optionalText(input.notes);

  checkOptionalLength(modelZh, "modelZh", 160, errors);
  checkOptionalLength(notes, "notes", 3000, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { icaoCode, manufacturer, model, modelZh, notes } };
}

export function validateFlightInput(input: FlightInput): ValidationResult<FlightInput> {
  const errors: Record<string, string> = {};
  const flightNumber = requiredText(input.flightNumber, "flightNumber", 6, errors);
  const flightDate = requiredText(input.flightDate, "flightDate", 10, errors);
  const aircraftRegistration = optionalText(input.aircraftRegistration)?.toUpperCase() ?? null;
  const scheduledDepartureLocal = optionalText(input.scheduledDepartureLocal);
  const scheduledArrivalLocal = optionalText(input.scheduledArrivalLocal);
  const seatNumber = optionalText(input.seatNumber);
  const notes = optionalText(input.notes);

  if (!Number.isInteger(input.airlineId) || input.airlineId < 1) errors.airlineId = "航司不存在";
  if (!Number.isInteger(input.departureAirportId) || input.departureAirportId < 1) {
    errors.departureAirportId = "出发机场不存在";
  }
  if (!Number.isInteger(input.arrivalAirportId) || input.arrivalAirportId < 1) {
    errors.arrivalAirportId = "到达机场不存在";
  }
  if (
    !errors.departureAirportId
    && !errors.arrivalAirportId
    && input.departureAirportId === input.arrivalAirportId
  ) {
    errors.arrivalAirportId = "到达机场不能与出发机场相同";
  }
  if (input.journeyId !== null && input.journeyId !== undefined && (!Number.isInteger(input.journeyId) || input.journeyId < 1)) {
    errors.journeyId = "旅程不存在";
  }
  if (input.aircraftTypeId !== null && input.aircraftTypeId !== undefined && (!Number.isInteger(input.aircraftTypeId) || input.aircraftTypeId < 1)) {
    errors.aircraftTypeId = "机型不存在";
  }

  if (flightNumber && !FLIGHT_NUMBER_PATTERN.test(flightNumber)) errors.flightNumber = "航班号必须是 1–6 位纯数字";
  if (flightDate && !isCalendarDate(flightDate)) errors.flightDate = "请填写真实日历日期 YYYY-MM-DD";
  if (scheduledDepartureLocal && !isLocalDateTime(scheduledDepartureLocal)) {
    errors.scheduledDepartureLocal = "请填写 YYYY-MM-DDTHH:mm";
  }
  if (scheduledArrivalLocal && !isLocalDateTime(scheduledArrivalLocal)) {
    errors.scheduledArrivalLocal = "请填写 YYYY-MM-DDTHH:mm";
  }
  const cabinClass = optionalText(input.cabinClass) as CabinClass | null;
  if (cabinClass && !CABIN_CLASSES.has(cabinClass)) {
    errors.cabinClass = "舱位无效";
  }
  checkOptionalLength(aircraftRegistration, "aircraftRegistration", 20, errors);
  checkOptionalLength(seatNumber, "seatNumber", 10, errors);
  checkOptionalLength(notes, "notes", 3000, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      airlineId: input.airlineId,
      flightNumber,
      flightDate,
      departureAirportId: input.departureAirportId,
      arrivalAirportId: input.arrivalAirportId,
      journeyId: input.journeyId ?? null,
      aircraftTypeId: input.aircraftTypeId ?? null,
      aircraftRegistration,
      scheduledDepartureLocal,
      scheduledArrivalLocal,
      cabinClass,
      seatNumber,
      notes,
    },
  };
}
