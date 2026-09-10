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

console.log("Letting the stream run for 4s at default 10k load...");
await page.waitForTimeout(4000);
results.load_10k = {
  points: await readStat("Points"),
  appReportedFps: await readStat("FPS"),
  measuredFps_3s: await measureRealFps(3000),
  renderMs: await readStat("Render"),
  processingMs: await readStat("Processing"),
  memoryMB: await readStat("Memory"),
};

console.log("Switching to 25k load...");
await page.click("button:has-text('25k')");
await page.waitForTimeout(3000);
results.load_25k = {
  points: await readStat("Points"),
  measuredFps_3s: await measureRealFps(3000),
  memoryMB: await readStat("Memory"),
};

console.log("Switching to 50k load...");
await page.click("button:has-text('50k')");
await page.waitForTimeout(3000);
results.load_50k = {
  points: await readStat("Points"),
  measuredFps_3s: await measureRealFps(3000),
  memoryMB: await readStat("Memory"),
};

console.log("Enabling stress test (20ms ingest) at 50k...");
await page.click("button:has-text('Stress Test')");
await page.waitForTimeout(4000);
results.stress_50k = {
  points: await readStat("Points"),
  measuredFps_3s: await measureRealFps(3000),
  memoryMB: await readStat("Memory"),
};
await page.click("button:has-text('Stress: ON')"); // turn back off

console.log("Testing interactions: zoom (wheel) + pan (drag) on main chart...");
const chartCanvas = page.locator(".chart-canvas-wrap canvas").first();
const box = await chartCanvas.boundingBox();

const interactionStart = Date.now();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -300); // zoom in
await page.waitForTimeout(50);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 10 });
await page.mouse.up();
const interactionLatencyMs = Date.now() - interactionStart;
results.interaction = { wheelAndDragRoundTripMs: interactionLatencyMs };

console.log("Testing chart type switches (line/bar/scatter/heatmap)...");
for (const type of ["Bar", "Scatter", "Heatmap", "Line"]) {
  await page.click(`.control-group:has-text("Main Chart") button:has-text("${type}")`);
  await page.waitForTimeout(600);
}
results.chartSwitchOk = true;

console.log("Testing category filter toggle...");
await page.click('label:has-text("CPU") input');
await page.waitForTimeout(300);
await page.click('label:has-text("CPU") input');
results.filterToggleOk = true;

console.log("Testing aggregation control...");
await page.click('.control-group:has-text("Aggregation") button:has-text("5 min")');
await page.waitForTimeout(400);
results.aggregationOk = true;

console.log("Testing pause/start...");
await page.click('button:has-text("Pause")');
const pointsAfterPause1 = await readStat("Points");
await page.waitForTimeout(1500);
const pointsAfterPause2 = await readStat("Points");
results.pauseHoldsPointCount = pointsAfterPause1 === pointsAfterPause2;
await page.click('button:has-text("Start")');

results.consoleErrors = consoleErrors;
results.pageErrors = pageErrors;

fs.writeFileSync("/home/claude/perf-dashboard/scripts/benchmark-results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
