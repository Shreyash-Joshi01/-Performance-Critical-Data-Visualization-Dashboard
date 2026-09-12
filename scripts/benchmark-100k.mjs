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

async function readStat(label) {
  return page.evaluate((label) => {
    const stats = Array.from(document.querySelectorAll(".perf-stat"));
    const stat = stats.find((s) => s.querySelector(".perf-label")?.textContent === label);
    return stat ? stat.querySelector(".perf-value").textContent.trim() : null;
  }, label);
}

async function measureRealFps(durationMs) {
  return page.evaluate((durationMs) => {
    return new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function loop(now) {
        frames++;
        if (now - start < durationMs) {
          requestAnimationFrame(loop);
        } else {
          resolve(Math.round((frames * 1000) / (now - start)));
        }
      }
      requestAnimationFrame(loop);
    });
  }, durationMs);
}

console.log("Navigating...");
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".perf-monitor");

console.log("Clicking 100k and timing the main-thread block it causes...");
const t0 = Date.now();
await page.click("button:has-text('100k')");
// Wait for the Points stat to actually reflect ~100000 (regeneration is synchronous
// on click per useDataStream.ts, but the click handler + state update + redraw still
// need an event-loop turn to show up in the DOM).
await page.waitForFunction(
  () => {
    const stats = Array.from(document.querySelectorAll(".perf-stat"));
    const stat = stats.find((s) => s.querySelector(".perf-label")?.textContent === "Points");
    const v = stat ? parseInt(stat.querySelector(".perf-value").textContent.replace(/[^\d]/g, ""), 10) : 0;
    return v >= 99000;
  },
  { timeout: 20000 },
);
const regenMs = Date.now() - t0;

await page.waitForTimeout(3000);
results.load_100k = {
  points: await readStat("Points"),
  appReportedFps: await readStat("FPS"),
  measuredFps_5s: await measureRealFps(5000),
  renderMs: await readStat("Render"),
  processingMs: await readStat("Processing"),
  memoryMB: await readStat("Memory"),
  droppedFrames: await readStat("Dropped"),
  regenerationAndFirstDrawMs: regenMs,
};

console.log("Testing zoom/pan interaction at 100k...");
const chartCanvas = page.locator(".chart-canvas-wrap canvas").first();
const box = await chartCanvas.boundingBox();
const interactionStart = Date.now();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(50);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 10 });
await page.mouse.up();
results.interaction_100k = { wheelAndDragRoundTripMs: Date.now() - interactionStart };

console.log("Enabling stress test (20ms ingest) at 100k...");
await page.click("button:has-text('Stress Test')");
await page.waitForTimeout(4000);
results.stress_100k = {
  points: await readStat("Points"),
  measuredFps_3s: await measureRealFps(3000),
  memoryMB: await readStat("Memory"),
  droppedFrames: await readStat("Dropped"),
};
await page.click("button:has-text('Stress: ON')");

console.log("Testing DataTable sort at 100k...");
const sortStart = Date.now();
const priceHeader = page.locator("text=Price").first();
if (await priceHeader.count()) {
  await priceHeader.click();
}
results.tableSortMs = Date.now() - sortStart;

results.activeDedicatedWorkers = page.workers().map((w) => w.url());
results.consoleErrors = consoleErrors;
results.pageErrors = pageErrors;

fs.writeFileSync("/home/claude/perf-dashboard/scripts/benchmark-100k-results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
