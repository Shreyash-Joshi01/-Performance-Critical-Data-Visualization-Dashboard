import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Performance Dashboard",
  description: "Real-time, canvas-rendered data visualization dashboard (10k+ points @ 60fps target)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
