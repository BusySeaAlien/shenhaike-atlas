import { env } from "cloudflare:workers";
import { defineMiddleware } from "astro:middleware";
import { AuthConfigurationError, localAdmin, verifyAdminRequest } from "./lib/auth/access";
import { hasTrustedOrigin, isSafeMethod } from "./lib/auth/origin";

function denied(message: string, status: number, api: boolean): Response {
  const headers = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (api) {
    return Response.json(
      { ok: false, error: { code: status === 503 ? "unavailable" : "forbidden", message } },
      { status, headers },
    );
  }
  return new Response(message, {
    status,
    headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  if (pathname !== "/guillaume" && !pathname.startsWith("/guillaume/")) {
    const response = await next();
    const dynamicArchiveRoute =
      pathname === "/" ||
      pathname === "/map" ||
      pathname === "/map/" ||
      pathname === "/journeys" ||
      pathname.startsWith("/journeys/") ||
      pathname === "/timeline" ||
      pathname === "/timeline/" ||
      pathname.startsWith("/places/");
    if (dynamicArchiveRoute) response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const api = pathname.startsWith("/guillaume/api/");
  try {
    const identity = import.meta.env.DEV
      ? localAdmin(env)
      : await verifyAdminRequest(context.request, env);
    context.locals.admin = identity ?? undefined;
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return denied("Admin authentication is unavailable.", 503, api);
    }
    return denied("Admin authentication failed.", 403, api);
  }

  if (!context.locals.admin) return denied("Admin access is forbidden.", 403, api);
  if (api && !isSafeMethod(context.request.method) && !hasTrustedOrigin(context.request)) {
    return denied("The request origin is not trusted.", 403, true);
  }

  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});
