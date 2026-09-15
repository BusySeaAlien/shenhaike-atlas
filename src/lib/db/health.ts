import type { DatabaseHealth } from "../../types/domain";
import { getDatabase } from "./client";

interface SchemaStatusRow {
  value: string;
}

interface CountRow {
  places: number;
  journeys: number;
  visits: number;
}

export async function readDatabaseHealth(): Promise<DatabaseHealth> {
  const db = getDatabase();
  const row = await db
    .prepare("SELECT value FROM atlas_meta WHERE key = ?1")
    .bind("schema_status")
    .first<SchemaStatusRow>();

  if (row?.value !== "ready") {
    throw new Error("Atlas local schema has not been initialized.");
  }

  const counts = await db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM atlas_places) AS places,
        (SELECT COUNT(*) FROM atlas_journeys) AS journeys,
        (SELECT COUNT(*) FROM atlas_visits) AS visits
    `)
    .first<CountRow>();
  if (!counts) throw new Error("Atlas core schema has not been initialized.");

  return {
    status: "ready",
    checkedAt: new Date().toISOString(),
    ...counts,
  };
}
