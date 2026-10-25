import { NextResponse, type NextRequest } from "next/server";
import { log, REQUEST_ID_HEADER, resolveRequestId } from "@/lib/log";

const isDev = process.env.NODE_ENV === "development";

/**
 * Security headers for every response, plus a request id that follows the
 * request into handlers (`x-request-id` on the request) and back to the
 * client (same header on the response) so a support ticket can be matched
 * to one log line. Authorization happens in the server layer (session +
 * membership checks), not here; this is the edge fence.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "img-src 'self' blob: data: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(self)");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // One structured line per request. Prefetches and the signed-asset reads are
  // high volume and carry no user intent, so they are skipped to keep the drain
  // cheap. Development keeps Next's own request lines instead: app output is
  // mirrored into the dist dir's log file, which a custom distDir under the
  // project root makes the file watcher see as a change (a reload loop).
  const path = request.nextUrl.pathname;
  const isAsset = path.startsWith("/api/storage/") || path.startsWith("/_next/");
  const isPrefetch = request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch";
  if (!isDev && !isAsset && !isPrefetch) {
    log.info("request", {
      requestId,
      method: request.method,
      path,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip") ?? undefined,
      ua: request.headers.get("user-agent")?.slice(0, 120) ?? undefined,
    });
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|base-models/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
