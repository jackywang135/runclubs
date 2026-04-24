// Extractor: takes data/posts.json → Claude Haiku → data/events.json.
//
// By default runs INCREMENTAL: posts already processed (in data/seen_posts.json)
// are skipped, and their prior extractions in events.json are preserved. New
// posts are added, and events from posts that no longer exist in posts.json are
// dropped (so you don't keep stale events once a post falls out of the window).
//
// Pass --full to force a re-extract of every post in posts.json.
//
// Run: node scripts/extract.mjs
//      node scripts/extract.mjs --full

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const FULL = process.argv.includes("--full");

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error("ANTHROPIC_API_KEY missing from .env");

const posts = JSON.parse(readFileSync(resolve(ROOT, "data/posts.json"), "utf8"));
const currentPostIds = new Set(posts.map((p) => p.shortCode));

// Load prior state (if present)
const eventsPath = resolve(ROOT, "data/events.json");
const seenPath = resolve(ROOT, "data/seen_posts.json");
const priorEvents = existsSync(eventsPath) && !FULL
  ? JSON.parse(readFileSync(eventsPath, "utf8"))
  : [];
const priorSeen = existsSync(seenPath) && !FULL
  ? new Set(JSON.parse(readFileSync(seenPath, "utf8")))
  : new Set();

// What to process this run
const toProcess = FULL ? posts : posts.filter((p) => !priorSeen.has(p.shortCode));

console.log(
  FULL
    ? `FULL mode: processing all ${posts.length} posts`
    : `Incremental: ${toProcess.length} new / ${posts.length - toProcess.length} already seen`,
);

const TODAY = new Date().toISOString().slice(0, 10);

const SYSTEM = `You are an event extractor for Taiwan run-club Instagram posts.

Given a post caption (Chinese / English / mixed / emoji-heavy), decide whether
it announces one or more SPECIFIC upcoming run events (a run on a particular
date at a particular time/place). Ignore generic recap posts, merch drops, or
vague "join us" posts without a date.

Output STRICT JSON only, no prose, matching this schema:

{
  "is_event": boolean,
  "events": [
    {
      "title": string,                 // short, e.g. "Rise & Run Coffee Run"
      "start_date": "YYYY-MM-DD",      // local Taipei date
      "start_time": "HH:MM" | null,    // 24h local
      "meeting_point": string | null,  // human-readable, verbatim from post if given
      "distance_km": number | null,
      "pace": string | null,           // e.g. "easy", "5:30/km"
      "language": "zh" | "en" | "both" | null,
      "confidence": number,            // 0-1 how sure you are this is a real event
      "notes": string | null           // anything else important, short
    }
  ]
}

Rules:
- Today is ${TODAY}. Use the post's timestamp and caption to infer the year of
  a date like "5/3" — assume the nearest future occurrence (unless a year is
  stated).
- If caption is a recap of a PAST event, set is_event=false.
- If it's a weekly recurring template ("every Friday 7am"), extract it ONCE
  as an event on the NEXT matching date after today.
- Do not hallucinate a meeting point. If not stated, null.
- Keep title under 60 chars.
- Output ONLY the JSON object, nothing else.`;

async function extract(post) {
  const caption = post.caption || "";
  if (!caption.trim()) return { is_event: false, events: [] };

  const userMsg = `Post owner: @${post.ownerUsername}
Post timestamp: ${post.timestamp}
Post URL: ${post.url}

Caption:
"""
${caption}
"""`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() || "";
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn(`  JSON parse fail for ${post.shortCode}: ${text.slice(0, 120)}`);
    return { is_event: false, events: [], _raw: text };
  }
}

const BATCH = 5;
const BATCH_PAUSE_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractWithRetry(p, attempt = 0) {
  try {
    return await extract(p);
  } catch (e) {
    if (attempt < 3 && /429|rate_limit/i.test(e.message)) {
      const wait = 2000 * (attempt + 1);
      await sleep(wait);
      return extractWithRetry(p, attempt + 1);
    }
    throw e;
  }
}

const newResults = [];
for (let i = 0; i < toProcess.length; i += BATCH) {
  const slice = toProcess.slice(i, i + BATCH);
  const out = await Promise.all(
    slice.map(async (p) => {
      try {
        const r = await extractWithRetry(p);
        return { post: p, result: r };
      } catch (e) {
        console.warn(`  extract failed for ${p.shortCode}: ${e.message}`);
        return { post: p, result: { is_event: false, events: [], _error: e.message } };
      }
    }),
  );
  newResults.push(...out);
  console.log(`  ${Math.min(i + BATCH, toProcess.length)}/${toProcess.length}`);
  if (i + BATCH < toProcess.length) await sleep(BATCH_PAUSE_MS);
}

// Flatten new events from this run.
const newEvents = [];
for (const { post, result } of newResults) {
  if (!result.is_event) continue;
  for (const e of result.events || []) {
    newEvents.push({
      ...e,
      club_handle: post.ownerUsername,
      source_post_id: post.shortCode,
      source_url: post.url,
      source_posted_at: post.timestamp,
    });
  }
}

// Merge: keep prior events whose source post still exists in the current scrape.
// Drop prior events whose source post has aged out (so stale events fade away).
const preserved = FULL
  ? []
  : priorEvents.filter((e) => currentPostIds.has(e.source_post_id));

const merged = [...preserved, ...newEvents];
merged.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

// Update seen set: everything we've now processed + prior seen (trimmed to posts
// still in view, so re-appearing posts will be re-evaluated).
const nextSeen = new Set();
for (const p of posts) nextSeen.add(p.shortCode);
// (Prior seen posts no longer in view are dropped; fine, we won't waste calls.)

writeFileSync(eventsPath, JSON.stringify(merged, null, 2));
writeFileSync(seenPath, JSON.stringify([...nextSeen], null, 2));

console.log(
  `\nEvents: ${preserved.length} preserved + ${newEvents.length} new = ${merged.length} total → data/events.json`,
);

// Summary for the month we're interested in (current month in Taipei)
const monthKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" })
  .format(new Date())
  .slice(0, 7);
const thisMonth = merged.filter((e) => (e.start_date || "").startsWith(monthKey));
console.log(`\n${thisMonth.length} events with start_date in ${monthKey}:`);
for (const e of thisMonth.slice(0, 20)) {
  const t = e.start_time ? ` ${e.start_time}` : "";
  const d = e.distance_km ? ` · ${e.distance_km}km` : "";
  const mp = e.meeting_point ? ` · ${e.meeting_point}` : "";
  console.log(`  ${e.start_date}${t}  @${e.club_handle}  ${e.title}${d}${mp}`);
}
