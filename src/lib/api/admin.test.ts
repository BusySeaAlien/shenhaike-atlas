import { describe, expect, it } from "vitest";
import { DataError } from "../db/errors";
import { adminApiError } from "./admin";

/**
 * Gate for the admin API error contract: a validation DataError must reach the
 * client as a 422 with its field errors intact — the chain the transport-mode
 * rejection relies on (validateVisitInput -> validated() -> adminApiError).
 */

describe("adminApiError", () => {
  it("maps validation errors to 422 with the field errors", async () => {
    const response = adminApiError(
      new DataError("validation", "访问记录无效", { transportMode: "请选择有效的交通方式" }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "访问记录无效",
        fields: { transportMode: "请选择有效的交通方式" },
      },
    });
  });

  it("maps not_found to 404 and conflict to 409", async () => {
    expect(adminApiError(new DataError("not_found", "记录不存在")).status).toBe(404);
    expect(adminApiError(new DataError("conflict", "记录冲突")).status).toBe(409);
  });

  it("maps unknown errors to a 500 that leaks no internal detail", async () => {
    const response = adminApiError(new Error("secret internal sql detail"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
