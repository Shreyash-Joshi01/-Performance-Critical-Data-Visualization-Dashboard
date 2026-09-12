/**
 * Plain JS, not TypeScript, and lives in /public rather than /workers — this
 * is a deliberate, load-bearing choice, not an oversight.
 *
 * The original plan was `new Worker(new URL("../workers/dataProcessor.worker.ts", import.meta.url))`,
 * letting webpack bundle a TS worker file the same way it bundles everything
 * else. That's standard webpack 5 behavior in a vanilla setup — but Next.js's
 * webpack config (as of 15.5.x, with no custom webpack() override in
 * next.config.js) does not wire up that module-worker detection, so the
 * build silently produced *no worker chunk at all*: `new Worker(new URL(...))`
 * would have resolved to a broken URL at runtime. Because useProcessedSeries.ts
 * wraps worker construction in a try/catch specifically so a Worker failure
 * can never break the dashboard, that failure was completely silent — the
 * app kept working perfectly via the synchronous fallback, which is exactly
 * the "never destabilize the MVP" safety net working as designed, but it
 * also meant the offload was quietly never happening.
 *
 * Fix: a worker script under /public is served as a plain static file, no
 * bundler involvement at all — `new Worker("/workers/dataProcessor.worker.js")`
 * is just a browser fetching a URL, which is unambiguous and well-supported
 * in every Next.js version regardless of webpack config. The cost is that
 * this file can't `import` lib/numericProcessing.ts (no bundling = no path
 * aliases, no TS), so the bucketing math below is a hand-mirrored plain-JS
 * copy of lodFromArrays/aggregateFromArrays in that file, which remains the
 * canonical, type-checked version used by the main-thread synchronous
 * fallback. Keep the two in sync if the bucketing logic ever changes.
 */

function lodFromArrays(timestamps, values, count, targetBuckets) {
  if (count === 0) return { x: new Float64Array(0), min: new Float64Array(0), max: new Float64Array(0), avg: new Float64Array(0) };
  if (count <= targetBuckets) {
    return { x: timestamps.slice(0, count), min: values.slice(0, count), max: values.slice(0, count), avg: values.slice(0, count) };
  }

  var first = timestamps[0];
  var last = timestamps[count - 1];
  var span = last - first || 1;
  var bucketSize = span / targetBuckets;

  var sum = new Float64Array(targetBuckets);
  var min = new Float64Array(targetBuckets).fill(Infinity);
  var max = new Float64Array(targetBuckets).fill(-Infinity);
  var bucketCount = new Int32Array(targetBuckets);

  for (var i = 0; i < count; i++) {
    var idx = Math.floor((timestamps[i] - first) / bucketSize);
    if (idx >= targetBuckets) idx = targetBuckets - 1;
    if (idx < 0) idx = 0;
    var v = values[i];
    sum[idx] += v;
    if (v < min[idx]) min[idx] = v;
    if (v > max[idx]) max[idx] = v;
    bucketCount[idx] += 1;
  }

  var used = 0;
  for (var b = 0; b < targetBuckets; b++) if (bucketCount[b] > 0) used++;

  var x = new Float64Array(used);
  var outMin = new Float64Array(used);
  var outMax = new Float64Array(used);
  var outAvg = new Float64Array(used);
  var w = 0;
  for (var k = 0; k < targetBuckets; k++) {
    var c = bucketCount[k];
    if (c === 0) continue;
    x[w] = first + k * bucketSize;
    outMin[w] = min[k];
    outMax[w] = max[k];
    outAvg[w] = sum[k] / c;
    w++;
  }

  return { x: x, min: outMin, max: outMax, avg: outAvg };
}

function aggregateFromArrays(timestamps, values, count, bucketSizeMs) {
  if (count === 0 || bucketSizeMs <= 0) {
    var ones = new Float64Array(count).fill(1);
    return { bucketStart: timestamps.slice(0, count), min: values.slice(0, count), max: values.slice(0, count), avg: values.slice(0, count), count: ones };
  }

  var buckets = new Map();
  for (var i = 0; i < count; i++) {
    var bucketStart = Math.floor(timestamps[i] / bucketSizeMs) * bucketSizeMs;
    var v = values[i];
    var bkt = buckets.get(bucketStart);
    if (!bkt) {
      bkt = { sum: 0, min: v, max: v, count: 0 };
      buckets.set(bucketStart, bkt);
    }
    bkt.sum += v;
    if (v < bkt.min) bkt.min = v;
    if (v > bkt.max) bkt.max = v;
    bkt.count += 1;
  }

  var keys = Array.from(buckets.keys()).sort(function (a, b) {
    return a - b;
  });
  var outStart = new Float64Array(keys.length);
  var outMin = new Float64Array(keys.length);
  var outMax = new Float64Array(keys.length);
  var outAvg = new Float64Array(keys.length);
  var outCount = new Float64Array(keys.length);
  keys.forEach(function (k, idx) {
    var bkt = buckets.get(k);
    outStart[idx] = k;
    outMin[idx] = bkt.min;
    outMax[idx] = bkt.max;
    outAvg[idx] = bkt.sum / bkt.count;
    outCount[idx] = bkt.count;
  });

  return { bucketStart: outStart, min: outMin, max: outMax, avg: outAvg, count: outCount };
}

self.onmessage = function (event) {
  var id = event.data.id;
  var mode = event.data.mode;
  var jobs = event.data.jobs;
  var results = [];
  var transfer = [];

  for (var j = 0; j < jobs.length; j++) {
    var job = jobs[j];
    if (mode.kind === "lod") {
      var r = lodFromArrays(job.timestamps, job.values, job.count, mode.targetBuckets);
      var empty = new Float64Array(0);
      results.push({ category: job.category, x: r.x, min: r.min, max: r.max, avg: r.avg, count: empty });
      transfer.push(r.x.buffer, r.min.buffer, r.max.buffer, r.avg.buffer, empty.buffer);
    } else {
      var ra = aggregateFromArrays(job.timestamps, job.values, job.count, mode.bucketSizeMs);
      results.push({ category: job.category, x: ra.bucketStart, min: ra.min, max: ra.max, avg: ra.avg, count: ra.count });
      transfer.push(ra.bucketStart.buffer, ra.min.buffer, ra.max.buffer, ra.avg.buffer, ra.count.buffer);
    }
  }

  self.postMessage({ id: id, results: results }, transfer);
};
