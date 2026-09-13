import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AdminIdentity {
  email: string;
  subject: string;
  local: boolean;
}

interface AccessConfig {
  teamDomain: string;
  audience: string;
  adminEmail: string;
}

export class AuthConfigurationError extends Error {
  constructor() {
    super("Atlas admin authentication is not configured.");
    this.name = "AuthConfigurationError";
  }
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function readAccessToken(request: Request): string | null {
  const assertion = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (assertion) return assertion;

  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "CF_Authorization") return decodeURIComponent(value.join("="));
  }
  return null;
}

export function accessConfig(environment: Cloudflare.Env): AccessConfig {
  const teamDomain = environment.ACCESS_TEAM_DOMAIN?.trim().replace(/\/$/, "");
  const audience = environment.ACCESS_AUD?.trim();
  const adminEmail = environment.ADMIN_EMAIL?.trim().toLowerCase();
  if (!teamDomain || !audience || !adminEmail) throw new AuthConfigurationError();

  const url = new URL(teamDomain);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".cloudflareaccess.com") || url.pathname !== "/") {
    throw new AuthConfigurationError();
  }
  return { teamDomain: url.origin, audience, adminEmail };
}

export async function verifyAdminRequest(
  request: Request,
  environment: Cloudflare.Env,
): Promise<AdminIdentity | null> {
  const config = accessConfig(environment);
  const token = readAccessToken(request);
  if (!token) return null;

  try {
    const certsUrl = `${config.teamDomain}/cdn-cgi/access/certs`;
    let keySet = keySets.get(certsUrl);
    if (!keySet) {
      keySet = createRemoteJWKSet(new URL(certsUrl));
      keySets.set(certsUrl, keySet);
    }
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ["RS256"],
      issuer: config.teamDomain,
      audience: config.audience,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || email !== config.adminEmail || typeof payload.sub !== "string") return null;
    return { email, subject: payload.sub, local: false };
  } catch {
    return null;
  }
}

export function localAdmin(environment: Cloudflare.Env): AdminIdentity {
  return {
    email: environment.LOCAL_ADMIN_EMAIL?.trim().toLowerCase() || "local@atlas.invalid",
    subject: "local-development",
    local: true,
  };
}
