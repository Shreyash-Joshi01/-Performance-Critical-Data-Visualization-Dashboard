"use client";

interface DashboardHeaderProps {
  running: boolean;
}

export default function DashboardHeader({ running }: DashboardHeaderProps) {
  return (
    <header className="dashboard-header">
      <h1>Performance Dashboard</h1>
      <span className={`live-indicator ${running ? "live" : "paused"}`}>
        <span className="live-dot" />
        {running ? "LIVE" : "PAUSED"}
      </span>
    </header>
  );
}
