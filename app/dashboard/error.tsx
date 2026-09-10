"use client";

import { useEffect } from "react";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundaries in the App Router must be Client Components. */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="loading-screen">
      <p>Something went wrong rendering the dashboard.</p>
      <button className="btn btn-active" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
