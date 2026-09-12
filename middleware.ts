import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * P2 "Middleware" item. Runs at the edge, in front of every request that
 * matches `config.matcher` below, before any Route Handler or page even
 * starts rendering — this is deliberately the *only* thing it does.
 *
 * What it's for: a few response headers that belong on every response and
 * have nothing to do with any individual route's logic. Putting them here
 * means they can't be forgotten on a future route (a new API endpoint, a new
 * page) the way copy-pasting them into every handler risks.
 *
 * What it's NOT for: this dashboard's actual performance path (data
 * generation, streaming ingest, canvas rendering) is 100% client-side by
 * design (see PERFORMANCE.md's "Scaling strategy" section) specifically so
 * nothing sits between a 100ms tick and the screen. Middleware runs on the
 * server for every matched request, so putting anything heavier here (auth
 * checks that hit a database, request rewriting, A/B bucketing) would add
 * server latency to routes that don't need it. A static header injection
 * costs microseconds and doesn't touch that hot path at all, since the hot
 * path (the 100ms ingest loop) never leaves the browser tab in the first
 * place.
 *
 * Without this file: every response (the dashboard page, /api/data) would
 * go out with only Next.js's own defaults — no X-Frame-Options, no
 * X-Content-Type-Options — leaving embedding/MIME-sniffing protections to
 * whatever the eventual hosting platform happens to set, rather than the
 * app guaranteeing them itself.
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // Prevents this app from being embedded in an <iframe> on another origin
  // (clickjacking protection) — there's no legitimate reason for someone
  // else's site to frame a data dashboard that streams live-looking data.
  response.headers.set("X-Frame-Options", "DENY");

  // Stops browsers from guessing ("sniffing") a response's content type from
  // its bytes instead of trusting the Content-Type header — relevant here
  // because /api/data returns JSON and the static worker script returns JS;
  // sniffing either as something else would be a script-injection vector.
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Limits how much of *this* site's URL is sent as the Referer header when
  // a link on this dashboard is followed to another origin.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  // Runs on every request except static assets and image optimization files,
  // which don't need security headers re-applied (Next.js already serves
  // those with long-lived cache headers and they're not HTML/JSON that a
  // browser would try to interpret ambiguously).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
