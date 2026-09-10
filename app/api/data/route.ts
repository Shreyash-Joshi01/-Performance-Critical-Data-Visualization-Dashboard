import { NextRequest, NextResponse } from "next/server";
import { generateInitialDataset } from "@/lib/dataGenerator";
import { CATEGORIES, Category } from "@/lib/types";

/**
 * Demonstrates the Route Handler half of the architecture: a way to fetch
 * a batch of synthetic data server-side (e.g. for a "load more history"
 * feature, or an external consumer) without shipping the generator's
 * source to the client. Not on the hot 100ms streaming path — that stays
 * client-side, deliberately, since round-tripping to a server every 100ms
 * would put network latency in the critical rendering path for no benefit
 * on a simulated dataset.
 *
 * GET /api/data?count=1000&category=CPU
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = Math.min(50_000, Math.max(1, Number(searchParams.get("count")) || 1000));
  const categoryParam = searchParams.get("category");
  const category = CATEGORIES.includes(categoryParam as Category) ? (categoryParam as Category) : undefined;

  const data = generateInitialDataset(count).filter((p) => !category || p.category === category);

  return NextResponse.json({ count: data.length, data });
}
