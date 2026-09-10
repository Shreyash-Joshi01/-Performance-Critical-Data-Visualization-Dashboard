/**
 * Shown automatically by Next.js while the DashboardPage Server Component
 * (and its data generation) is in flight. The generator is fast enough
 * that this mostly flashes on a cold start, but it's what keeps a slow
 * network/CPU from showing a blank white screen instead.
 */
export default function DashboardLoading() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Generating initial dataset…</p>
    </div>
  );
}
