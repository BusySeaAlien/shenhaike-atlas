import type { Airline, AirlineInput } from "../../types/domain";
import { countryCodeForName } from "../countries";
import { validateAirlineInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { AirlineRow } from "./rows";
import { toAirline } from "./rows";

const AIRLINE_COLUMNS = `
  id, iata_code, icao_code, name, name_zh, country, country_code,
  callsign, notes, created_at, updated_at
`;

function validated(input: AirlineInput): AirlineInput {
  const result = validateAirlineInput(input);
  if (!result.ok) throw new DataError("validation", "航司信息无效", result.errors);
  return result.value;
}

function resolveCountryCode(country: string): string {
  const code = countryCodeForName(country);
  if (!code) throw new DataError("validation", "国家信息无效", { country: "请选择列表中的国家" });
  return code;
}

export async function listAirlines(db: D1Database): Promise<Airline[]> {
  const { results } = await db
    .prepare(`SELECT ${AIRLINE_COLUMNS} FROM atlas_airlines ORDER BY iata_code, id`)
    .all<AirlineRow>();
  return results.map(toAirline);
}

export async function getAirlineById(db: D1Database, id: number): Promise<Airline | null> {
  const row = await db
    .prepare(`SELECT ${AIRLINE_COLUMNS} FROM atlas_airlines WHERE id = ?1`)
    .bind(id)
    .first<AirlineRow>();
  return row ? toAirline(row) : null;
}

export async function createAirline(db: D1Database, input: AirlineInput): Promise<Airline> {
  const value = validated(input);
  const countryCode = resolveCountryCode(value.country);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_airlines (
          iata_code, icao_code, name, name_zh, country, country_code, callsign, notes
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING ${AIRLINE_COLUMNS}
      `)
      .bind(
        value.iataCode,
        value.icaoCode,
        value.name,
        value.nameZh,
        value.country,
        countryCode,
        value.callsign,
        value.notes,
      )
      .first<AirlineRow>();
    if (!row) throw new Error("Insert returned no airline.");
    return toAirline(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "航司 IATA 或 ICAO 代码已存在", {
        iataCode: "该 IATA 代码已被使用",
      });
    }
    throw error;
  }
}

export async function updateAirline(
  db: D1Database,
  id: number,
  input: AirlineInput,
): Promise<Airline> {
  const value = validated(input);
  const countryCode = resolveCountryCode(value.country);
  try {
    const row = await db
      .prepare(`
        UPDATE atlas_airlines SET
          iata_code = ?1, icao_code = ?2, name = ?3, name_zh = ?4,
          country = ?5, country_code = ?6, callsign = ?7, notes = ?8,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?9
        RETURNING ${AIRLINE_COLUMNS}
      `)
      .bind(
        value.iataCode,
        value.icaoCode,
        value.name,
        value.nameZh,
        value.country,
        countryCode,
        value.callsign,
        value.notes,
        id,
      )
      .first<AirlineRow>();
    if (!row) throw new DataError("not_found", "航司不存在");
    return toAirline(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "航司 IATA 或 ICAO 代码已存在", {
        iataCode: "该 IATA 代码已被使用",
      });
    }
    throw error;
  }
}

export async function deleteAirline(db: D1Database, id: number): Promise<void> {
  const reference = await db
    .prepare("SELECT COUNT(*) AS count FROM atlas_flights WHERE airline_id = ?1")
    .bind(id)
    .first<{ count: number }>();
  if ((reference?.count ?? 0) > 0) {
    throw new DataError("conflict", `该航司仍关联 ${reference?.count} 条航班记录，不能删除`);
  }

  const result = await db.prepare("DELETE FROM atlas_airlines WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "航司不存在");
}
