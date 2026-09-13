import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthConfigurationError, accessConfig, readAccessToken, verifyAdminRequest } from "./access";

const environment = {
  ACCESS_TEAM_DOMAIN: "https://atlas-test.cloudflareaccess.com",
  ACCESS_AUD: "atlas-audience",
  ADMIN_EMAIL: "admin@example.com",
} as Cloudflare.Env;

let privateKey: CryptoKey;

async function token(options: { email?: string; audience?: string; issuer?: string; expires?: string } = {}) {
  return new SignJWT({ email: options.email ?? "admin@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "atlas-test-key" })
    .setIssuer(options.issuer ?? environment.ACCESS_TEAM_DOMAIN!)
    .setAudience(options.audience ?? environment.ACCESS_AUD!)
    .setSubject("admin-subject")
    .setIssuedAt()
    .setExpirationTime(options.expires ?? "5m")
    .sign(privateKey);
}

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  privateKey = keys.privateKey;
  const jwk = await exportJWK(keys.publicKey);
  Object.assign(jwk, { kid: "atlas-test-key", alg: "RS256", use: "sig" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
});

afterAll(() => vi.unstubAllGlobals());

describe("Cloudflare Access configuration", () => {
  it("requires all production values and a Cloudflare team domain", () => {
    expect(() => accessConfig({} as Cloudflare.Env)).toThrow(AuthConfigurationError);
    expect(() => accessConfig({ ...environment, ACCESS_TEAM_DOMAIN: "https://example.com" })).toThrow(
      AuthConfigurationError,
    );
  });
});

describe("Access token extraction", () => {
  it("prefers the Access assertion header", () => {
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { "cf-access-jwt-assertion": "header-token", cookie: "CF_Authorization=cookie-token" },
    });
    expect(readAccessToken(request)).toBe("header-token");
  });

  it("falls back to the browser cookie", () => {
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { cookie: "other=1; CF_Authorization=cookie-token" },
    });
    expect(readAccessToken(request)).toBe("cookie-token");
  });
});

describe("Access JWT verification", () => {
  it("rejects a missing token", async () => {
    await expect(
      verifyAdminRequest(new Request("https://atlas.example/guillaume/"), environment),
    ).resolves.toBeNull();
  });

  it("accepts a signed token for the configured issuer, audience, and admin", async () => {
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { "cf-access-jwt-assertion": await token() },
    });
    await expect(verifyAdminRequest(request, environment)).resolves.toEqual({
      email: "admin@example.com",
      subject: "admin-subject",
      local: false,
    });
  });

  it("rejects the wrong administrator", async () => {
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { "cf-access-jwt-assertion": await token({ email: "intruder@example.com" }) },
    });
    await expect(verifyAdminRequest(request, environment)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { "cf-access-jwt-assertion": await token({ expires: "-1m" }) },
    });
    await expect(verifyAdminRequest(request, environment)).resolves.toBeNull();
  });

  it("rejects the wrong audience", async () => {
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { "cf-access-jwt-assertion": await token({ audience: "wrong-audience" }) },
    });
    await expect(verifyAdminRequest(request, environment)).resolves.toBeNull();
  });

  it("rejects a token with a forged signature", async () => {
    const signed = await token();
    const forged = `${signed.slice(0, -2)}aa`;
    const request = new Request("https://atlas.example/guillaume/", {
      headers: { "cf-access-jwt-assertion": forged },
    });
    await expect(verifyAdminRequest(request, environment)).resolves.toBeNull();
  });
});
