import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Performance Dashboard",
  description: "Real-time, canvas-rendered data visualization dashboard (10k+ points @ 60fps target)",
  // Makes the app installable (Add to Home Screen / desktop PWA install
  // prompt) — see public/manifest.json and public/sw.js for the rest of
  // the P2 "PWA" / "Service Worker" work.
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        suppressHydrationWarning here only tells React "don't warn if THIS
        element's attributes differ between server and client HTML" — it
        does not silence hydration mismatches anywhere else in the tree.
        It's needed because browser extensions (Grammarly, password
        managers, etc.) inject attributes like data-gr-ext-installed
        straight into <body> before React hydrates, so the client's <body>
        never matches what the server sent — through no fault of this
        app's code. Without this, that specific dev-only warning is
        cosmetic noise, not a sign of an actual bug.
      */}
      <body suppressHydrationWarning>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
