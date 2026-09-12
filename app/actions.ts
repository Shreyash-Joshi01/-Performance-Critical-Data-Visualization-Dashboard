"use server";

import crypto from "node:crypto";
import { generateInitialDataset } from "@/lib/dataGenerator";
import { CATEGORIES, DataPoint, LoadLevel } from "@/lib/types";

/**
 * P2 "Server Actions" item — a real mutation invoked directly from a Client
 * Component (`useDataStream.ts`'s `randomize()`, wired to the "Randomize"
 * button in `LoadControls.tsx`) with no hand-written `/api/...` route or
 * `fetch()` call on the caller's side; Next.js generates the RPC itself from
 * this exported `"use server"` function, and calling it from the client is
 * exactly like calling a local async function.
 *
 * What it's for, and why server-side specifically (not just "because Server
 * Actions exist"): every other load-level change already regenerates a
 * fresh dataset *client-side* (see `useDataStream.ts`'s load-level effect) —
 * that's fast (~227ms even at 100k, see PERFORMANCE.md) and isn't a
 * performance problem this needs to solve. What genuinely belongs on the
 * server is the source of randomness for "start the whole simulation over
 * from a new, truly unpredictable state": `crypto.randomInt` draws from
 * Node's cryptographic RNG, not V8's `Math.random` (which is fast and fine
 * for jitter/noise *within* an already-running simulation, but is a
 * PRNG that isn't intended to be unpredictable). For a synthetic demo
 * dataset the practical difference is small, but it's the honest reason to
 * reach for a Server Action here rather than adding one just to check a box.
 *
 * Without this function: "Randomize" would have no server-backed source of
 * entropy to draw a new seed from, and would have to fall back to
 * `Math.random()` on the client — fine for this demo, but not the pattern
 * you'd want if the seed were feeding anything security-sensitive.
 */
export async function regenerateDataset(loadLevel: LoadLevel): Promise<DataPoint[]> {
  const perCategoryCount = Math.max(1, Math.floor(loadLevel / CATEGORIES.length));
  const seed = crypto.randomInt(1, 2 ** 31 - 1);
  return generateInitialDataset(perCategoryCount, Date.now(), seed);
}
