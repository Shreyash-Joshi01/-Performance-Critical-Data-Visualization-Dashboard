import { chromium } from "playwright";
import fs from "node:fs";

const URL = "http://localhost:3100/dashboard";
const results = {};
const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(String(err)));

console.log("Navigating...");
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".perf-monitor");

// --- Service Worker ---
console.log("Checking service worker registration...");
await page.waitForTimeout(1500); // registration is fire-and-forget in a useEffect
results.serviceWorker = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    supported: true,
    registered: !!reg,
    scope: reg?.scope ?? null,
    active: !!reg?.active,
  };
});

// --- Manifest ---
results.manifestReachable = (await page.evaluate(() => fetch("/manifest.json").then((r) => r.status))) === 200;
results.manifestLinkPresent = (await page.locator('link[rel="manifest"]').count()) > 0;

// --- Streaming /api/data (NDJSON) ---
console.log("Checking streaming /api/data response shape...");
results.streamingApi = await page.evaluate(async () => {
  const res = await fetch("/api/data?count=5000&category=AAPL");
  const contentType = res.headers.get("content-type");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let lines = 0;
  let firstLineAt = null;
  const start = performance.now();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) {
        lines++;
        if (firstLineAt === null) firstLineAt = performance.now() - start;
      }
    }
  }
  const totalMs = performance.now() - start;
  return { contentType, lineCount: lines, firstLineMs: firstLineAt, totalMs };
});

// --- Server Action: Randomize ---
console.log("Testing Randomize (Server Action) button...");
const pointsBefore = await page.evaluate(() => {
  const stats = Array.from(document.querySelectorAll(".perf-stat"));
  const stat = stats.find((s) => s.querySelector(".perf-label")?.textContent === "Points");
  return stat?.querySelector(".perf-value").textContent.trim();
});
const randomizeBtn = page.locator('button:has-text("Randomize")');
results.randomizeButtonPresent = (await randomizeBtn.count()) > 0;
if (results.randomizeButtonPresent) {
  const t0 = Date.now();
  await randomizeBtn.click();
  // Button shows "Randomizing…" while the Server Action round-trip is in flight.
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Randomizing")),
    { timeout: 15000 },
  );
  const roundTripMs = Date.now() - t0;
  const pointsAfter = await page.evaluate(() => {
    const stats = Array.from(document.querySelectorAll(".perf-stat"));
    const stat = stats.find((s) => s.querySelector(".perf-label")?.textContent === "Points");
    return stat?.querySelector(".perf-value").textContent.trim();
  });
  results.randomize = { pointsBefore, pointsAfter, roundTripMs };
}

// --- DataTable flash animation (class applied, not just present in CSS) ---
console.log("Checking DataTable flash-up/flash-down classes appear over time...");
await page.waitForTimeout(2000);
results.flashClassSeen = await page.evaluate(() => {
  return new Promise((resolve) => {
    let seen = false;
    const check = () => {
      if (document.querySelector(".flash-up, .flash-down")) seen = true;
    };
    const interval = setInterval(check, 100);
    setTimeout(() => {
      clearInterval(interval);
      resolve(seen);
    }, 2500);
  });
});

// --- Middleware headers ---
console.log("Checking middleware security headers...");
const headerRes = await page.evaluate(async () => {
  const res = await fetch("/dashboard");
  return {
    xFrameOptions: res.headers.get("x-frame-options"),
    xContentTypeOptions: res.headers.get("x-content-type-options"),
    referrerPolicy: res.headers.get("referrer-policy"),
  };
});
results.middlewareHeaders = headerRes;

results.consoleErrors = consoleErrors;
results.pageErrors = pageErrors;

fs.writeFileSync("/home/claude/perf-dashboard/scripts/benchmark-p2-results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
