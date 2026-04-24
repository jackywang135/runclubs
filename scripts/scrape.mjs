// Phase 1 scraper: pulls last N posts from each club in clubs.yml
// via Apify's instagram-scraper actor, saves raw output to data/posts.json.
//
// Run: node scripts/scrape.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Load .env ---
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const APIFY_TOKEN = env.APIFY_TOKEN;
if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN missing from .env");

// --- Minimal clubs.yml parser (flat list, known format) ---
function parseClubsYml(text) {
  const clubs = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (/^\s*-\s+handle:/.test(line)) {
      if (cur) clubs.push(cur);
      cur = { handle: line.split("handle:")[1].trim() };
    } else if (cur && /^\s+\w+:/.test(line)) {
      const [k, ...rest] = line.trim().split(":");
      cur[k.trim()] = rest.join(":").trim();
    }
  }
  if (cur) clubs.push(cur);
  return clubs.filter((c) => c.handle);
}

const clubs = parseClubsYml(readFileSync(resolve(ROOT, "clubs.yml"), "utf8"));
console.log(`Loaded ${clubs.length} clubs from clubs.yml`);

// --- Call Apify actor ---
const RESULTS_PER_CLUB = 12;
const directUrls = clubs.map((c) => c.url || `https://www.instagram.com/${c.handle}/`);

const input = {
  directUrls,
  resultsType: "posts",
  resultsLimit: RESULTS_PER_CLUB,
  searchType: "user",
  searchLimit: 1,
  addParentData: false,
};

console.log(`Calling Apify instagram-scraper for ${directUrls.length} profiles...`);
const started = Date.now();

const res = await fetch(
  `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  },
);

if (!res.ok) {
  const body = await res.text();
  throw new Error(`Apify error ${res.status}: ${body}`);
}

const items = await res.json();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(`Got ${items.length} items in ${elapsed}s`);

// --- Save raw ---
mkdirSync(resolve(ROOT, "data"), { recursive: true });
const outPath = resolve(ROOT, "data/posts.json");
writeFileSync(outPath, JSON.stringify(items, null, 2));
console.log(`Saved raw to ${outPath}`);

// --- Summary per club ---
const byOwner = new Map();
for (const it of items) {
  const k = it.ownerUsername || "unknown";
  byOwner.set(k, (byOwner.get(k) || 0) + 1);
}
console.log("\nPost counts per club:");
for (const c of clubs) {
  const n = byOwner.get(c.handle) || 0;
  console.log(`  ${n.toString().padStart(3)}  @${c.handle}`);
}

// --- Preview captions ---
console.log("\nRecent captions (first 200 chars):");
for (const it of items.slice(0, 10)) {
  const date = it.timestamp ? new Date(it.timestamp).toISOString().slice(0, 10) : "?";
  const caption = (it.caption || "").replace(/\s+/g, " ").slice(0, 200);
  console.log(`\n[${date}] @${it.ownerUsername}`);
  console.log(`  ${caption}`);
}
