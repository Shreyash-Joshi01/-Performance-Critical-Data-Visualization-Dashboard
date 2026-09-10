import DashboardClient from "./DashboardClient";
import { generateInitialDataset } from "@/lib/dataGenerator";
import { LoadLevel } from "@/lib/types";

const INITIAL_LOAD_LEVEL: LoadLevel = 10_000;

// Without this, Next.js would treat this Server Component as static (it has
// no request-dependent input) and generate its "initial dataset ending now"
// exactly once at build time — every visitor would get a dataset frozen at
// the build timestamp instead of one anchored to when they actually loaded
// the page. Forcing dynamic rendering makes generateInitialDataset() run
// fresh on every request.
export const dynamic = "force-dynamic";

/**
 * Server Component. Runs on the server, generates the initial dataset
 * (lib/dataGenerator.ts, seeded so the result is reproducible) and passes
 * it to the Client Component as a plain serializable prop. This is the
 * "Server Components for initial data" half of the architecture: by the
 * time DashboardClient hydrates in the browser, 10,000 points already
 * exist — there's no client-side "generate 10k points" pass blocking
 * first paint, and no loading spinner for data that could have been ready
 * before the JS bundle even finished downloading.
 */
export default async function DashboardPage() {
  const perCategory = INITIAL_LOAD_LEVEL / 4;
  const initialData = generateInitialDataset(perCategory);

  return <DashboardClient initialData={initialData} initialLoadLevel={INITIAL_LOAD_LEVEL} />;
}
