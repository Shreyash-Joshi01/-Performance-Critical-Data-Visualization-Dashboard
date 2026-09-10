import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.goto("http://localhost:3100/dashboard", { waitUntil: "networkidle" });
await page.waitForSelector(".perf-monitor");

async function readStat(label) {
  return page.evaluate((label) => {
    const stats = Array.from(document.querySelectorAll(".perf-stat"));
    const stat = stats.find((s) => s.querySelector(".perf-label")?.textContent === label);
    return stat ? stat.querySelector(".perf-value").textContent.trim() : null;
  }, label);
}

await page.click("button:has-text('50k')");
await page.click("button:has-text('Stress Test')");

console.log("time_s,points,fps,memory_mb");
for (let i = 0; i <= 60; i += 10) {
  if (i > 0) await page.waitForTimeout(10000);
  const [points, fps, memory] = await Promise.all([readStat("Points"), readStat("FPS"), readStat("Memory")]);
  console.log(`${i},${points},${fps},${memory}`);
}

await browser.close();
