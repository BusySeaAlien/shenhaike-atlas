import { describe, expect, it } from "vitest";
import { hasTrustedOrigin, isSafeMethod } from "./origin";

describe("admin write origin protection", () => {
  it("allows only exact same-origin requests", () => {
    expect(
      hasTrustedOrigin(
        new Request("https://atlas.shenhaike.com/guillaume/api/places", {
          headers: { origin: "https://atlas.shenhaike.com" },
        }),
      ),
    ).toBe(true);
    expect(
      hasTrustedOrigin(
        new Request("https://atlas.shenhaike.com/guillaume/api/places", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects a missing origin", () => {
    expect(hasTrustedOrigin(new Request("https://atlas.shenhaike.com/guillaume/api/places"))).toBe(false);
  });

  it("classifies read-only methods as safe", () => {
    expect(isSafeMethod("GET")).toBe(true);
    expect(isSafeMethod("HEAD")).toBe(true);
    expect(isSafeMethod("POST")).toBe(false);
    expect(isSafeMethod("DELETE")).toBe(false);
  });
});
