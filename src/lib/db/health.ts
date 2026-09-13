import type { DatabaseHealth } from "../../types/domain";
import { getDatabase } from "./client";

interface SchemaStatusRow {
  value: string;
}

export async function readDatabaseHealth(): Promise<DatabaseHealth> {
  const row = await getDatabase()
    .prepare("SELECT value FROM atlas_meta WHERE key = ?1")
    .bind("schema_status")
    .first<SchemaStatusRow>();

  if (row?.value !== "ready") {
    throw new Error("Atlas local schema has not been initialized.");
  }

  return {
    status: "ready",
    checkedAt: new Date().toISOString(),
  };
}
