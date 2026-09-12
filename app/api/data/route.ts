import { NextRequest } from "next/server";
import { generateInitialDataset } from "@/lib/dataGenerator";
import { CATEGORIES, Category } from "@/lib/types";

// Route Handlers are statically analyzable by default; force-dynamic makes
// explicit that this one must run per-request (it depends on Date.now() via
// generateInitialDataset's default endTime, and a static/cached response
// would freeze that at build time).
export const dynamic = "force-dynamic";

// How many points go out per streamed chunk. Small enough that the first
// chunk reaches a consumer almost immediately (no waiting on the last
// point to be generated); large enough that at 100k points this is ~50
// chunks, not 100,000 one-line writes.
const BATCH_SIZE = 2000;

/**
 * Demonstrates the Route Handler half of the architecture: a way to fetch a
 * batch of synthetic data server-side (e.g. a "load more history" feature,
 * or an external consumer) without shipping the generator's source to the
 * client. Not on the hot 100ms streaming path — that stays client-side,
 * deliberately, since round-tripping to a server every 100ms would put
 * network latency in the critical rendering path for no benefit on a
 * simulated dataset.
 *
 * P2 "advanced streaming": the response body is NDJSON (newline-delimited
 * JSON) written incrementally to a `ReadableStream`, not a single
 * `NextResponse.json(...)` blob. Concretely, for `count=100000`:
 *   {"meta":{"count":100000}}\n
 *   [ ...2,000 DataPoint objects... ]\n
 *   [ ...next 2,000... ]\n
 *   ... (50 batches total)
 *
 * Why this matters and what breaks without it: `NextResponse.json(data)`
 * has to (1) fully generate `data`, (2) run the *entire* array through one
 * `JSON.stringify`, producing one multi-megabyte string in memory, then
 * (3) hand that whole string to the response — a consumer's `fetch()`
 * doesn't resolve `.json()` until every last byte has arrived, so a 100k-row
 * request is all-or-nothing: the same wait whether you needed the first row
 * or the last. Streaming batches means a consumer reading the body with
 * `response.body.getReader()` and splitting on "\n" can start processing
 * (e.g. rendering the first rows, or piping them into IndexedDB) after the
 * first ~2,000 rows arrive, while the rest are still being generated and
 * sent — the same trade-off that makes chunked LOD/aggregation on the Web
 * Worker useful (see "Web Worker offload" in PERFORMANCE.md): work becomes
 * incremental instead of one big block-until-done step.
 *
 * GET /api/data?count=1000&category=AAPL
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Cap matches the dashboard's max load level (LoadLevel in lib/types.ts).
  const count = Math.min(100_000, Math.max(1, Number(searchParams.get("count")) || 1000));
  const categoryParam = searchParams.get("category");
  const category = CATEGORIES.includes(categoryParam as Category) ? (categoryParam as Category) : undefined;

  const data = generateInitialDataset(count).filter((p) => !category || p.category === category);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ meta: { count: data.length } }) + "\n"));

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        controller.enqueue(encoder.encode(JSON.stringify(batch) + "\n"));
        // Yield a turn of the event loop between batches. Without this, the
        // for-loop would run to completion synchronously and every chunk
        // would still leave for the network back-to-back in one scheduler
        // turn — technically still "a stream," but indistinguishable from
        // the single-blob response from a consumer's point of view.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
