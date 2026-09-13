import { DataError } from "../db/errors";
import { json } from "./responses";

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new DataError("validation", "请求必须使用 JSON");
  }
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataError("validation", "请求内容无效");
  }
  return value as Record<string, unknown>;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function optionalStringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

export function idFromParams(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new DataError("not_found", "记录不存在");
  return id;
}

export function adminApiError(error: unknown): Response {
  if (error instanceof DataError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 422;
    return json({ ok: false, error: { code: error.code, message: error.message, fields: error.fields } }, { status });
  }
  return json(
    { ok: false, error: { code: "internal", message: "保存失败，请稍后重试。" } },
    { status: 500 },
  );
}
