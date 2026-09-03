import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const url = process.argv[2] ?? "http://localhost:3211/";
const runsPerPreset = Number.parseInt(process.argv[3] ?? "3", 10);
const categories = ["performance", "accessibility", "best-practices", "seo"];

const DESKTOP_FLAGS = {
  formFactor: "desktop",
  throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
  screenEmulation: { mobile: false, width: 1350, height: 940 },
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function runOnce(url, preset) {
  const chrome = await launch({
    chromeFlags: ["--headless=new", "--ignore-certificate-errors"],
  });
  try {
    const flags = {
      port: chrome.port,
      output: "json",
      onlyCategories: categories,
      ...(preset === "desktop" ? DESKTOP_FLAGS : {}),
    };
    const runnerResult = await lighthouse(url, flags);
    if (runnerResult === undefined || runnerResult.lhr === undefined) {
      throw new Error(`no lighthouse result for ${url}`);
    }
    return runnerResult.lhr;
  } finally {
    await chrome.kill();
  }
}

let failed = false;
for (const preset of ["mobile", "desktop"]) {
  const scores = Object.fromEntries(categories.map((c) => [c, []]));
  const offenders = new Map();
  for (let i = 0; i < runsPerPreset; i++) {
    const lhr = await runOnce(url, preset);
    for (const category of categories) {
      const raw = lhr.categories[category]?.score;
      if (raw !== null && raw !== undefined) scores[category].push(raw * 100);
    }
    for (const audit of Object.values(lhr.audits ?? {})) {
      if (audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== "informative") {
        const list = offenders.get(audit.id) ?? [];
        list.push(`${audit.title} (score ${Math.round(audit.score * 100)})`);
        offenders.set(audit.id, list);
      }
    }
  }
  console.log(`\n=== ${preset.toUpperCase()} @ ${url} (median of ${runsPerPreset}) ===`);
  for (const category of categories) {
    const value = median(scores[category]);
    const label = value >= 99.5 ? Math.round(value) : value.toFixed(1);
    console.log(`  ${category.padEnd(16)} ${label}`);
    if (value < 100) failed = true;
  }
  if (offenders.size > 0) {
    console.log("  failing audits:");
    for (const [id, hits] of offenders) {
      console.log(`    - ${id}: ${hits[hits.length - 1] ?? ""}`);
    }
  }
}
process.exit(failed ? 1 : 0);
