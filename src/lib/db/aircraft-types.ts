import type { AircraftType, AircraftTypeInput } from "../../types/domain";
import { validateAircraftTypeInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { AircraftTypeRow } from "./rows";
import { toAircraftType } from "./rows";

const AIRCRAFT_TYPE_COLUMNS = `
  id, icao_code, manufacturer, model, model_zh, notes, created_at, updated_at
`;

function validated(input: AircraftTypeInput): AircraftTypeInput {
  const result = validateAircraftTypeInput(input);
  if (!result.ok) throw new DataError("validation", "机型信息无效", result.errors);
  return result.value;
}

export async function listAircraftTypes(db: D1Database): Promise<AircraftType[]> {
  const { results } = await db
    .prepare(`SELECT ${AIRCRAFT_TYPE_COLUMNS} FROM atlas_aircraft_types ORDER BY icao_code, id`)
    .all<AircraftTypeRow>();
  return results.map(toAircraftType);
}

export async function getAircraftTypeById(db: D1Database, id: number): Promise<AircraftType | null> {
  const row = await db
    .prepare(`SELECT ${AIRCRAFT_TYPE_COLUMNS} FROM atlas_aircraft_types WHERE id = ?1`)
    .bind(id)
    .first<AircraftTypeRow>();
  return row ? toAircraftType(row) : null;
}

export async function createAircraftType(
  db: D1Database,
  input: AircraftTypeInput,
): Promise<AircraftType> {
  const value = validated(input);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_aircraft_types (icao_code, manufacturer, model, model_zh, notes)
        VALUES (?1, ?2, ?3, ?4, ?5)
        RETURNING ${AIRCRAFT_TYPE_COLUMNS}
      `)
      .bind(value.icaoCode, value.manufacturer, value.model, value.modelZh, value.notes)
      .first<AircraftTypeRow>();
    if (!row) throw new Error("Insert returned no aircraft type.");
    return toAircraftType(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "机型 ICAO 代码已存在", {
        icaoCode: "该 ICAO 代码已被使用",
      });
    }
    throw error;
  }
}

export async function updateAircraftType(
  db: D1Database,
  id: number,
  input: AircraftTypeInput,
): Promise<AircraftType> {
  const value = validated(input);
  try {
    const row = await db
      .prepare(`
        UPDATE atlas_aircraft_types SET
          icao_code = ?1, manufacturer = ?2, model = ?3, model_zh = ?4, notes = ?5,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?6
        RETURNING ${AIRCRAFT_TYPE_COLUMNS}
      `)
      .bind(value.icaoCode, value.manufacturer, value.model, value.modelZh, value.notes, id)
      .first<AircraftTypeRow>();
    if (!row) throw new DataError("not_found", "机型不存在");
    return toAircraftType(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "机型 ICAO 代码已存在", {
        icaoCode: "该 ICAO 代码已被使用",
      });
    }
    throw error;
  }
}

export async function deleteAircraftType(db: D1Database, id: number): Promise<void> {
  const reference = await db
    .prepare("SELECT COUNT(*) AS count FROM atlas_flights WHERE aircraft_type_id = ?1")
    .bind(id)
    .first<{ count: number }>();
  if ((reference?.count ?? 0) > 0) {
    throw new DataError("conflict", `该机型仍关联 ${reference?.count} 条航班记录，不能删除`);
  }

  const result = await db.prepare("DELETE FROM atlas_aircraft_types WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "机型不存在");
}
