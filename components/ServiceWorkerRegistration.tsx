"use client";

import { useEffect } from "react";

/**
 * Registers /public/sw.js (see that file for what it does and why). This is
 * its own tiny Client Component, mounted once from the root layout, rather
 * than inline script in the layout itself — Server Components can't call
 * browser-only APIs like `navigator.serviceWorker`, and isolating the
 * registration call here means a failure here can't affect anything else
 * server-rendered.
 *
 * Renders nothing: registration is a side effect, not UI.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort: a browser without service worker support, or a
      // registration failure (e.g. served over plain HTTP in some
      // environments — service workers require a secure context), just
      // means the app runs exactly as it did before this existed.
    });
  }, []);

  return null;
}
