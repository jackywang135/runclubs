// Phase 1 extractor: takes data/posts.json → Claude Haiku → data/events.json.
//
// Run: node scripts/extract.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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
console.log(`Loaded ${posts.length} posts`);

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
  // strip markdown fences if any
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn(`  JSON parse fail for ${post.shortCode}: ${text.slice(0, 120)}`);
    return { is_event: false, events: [], _raw: text };
  }
}

// Rate limit is 50 RPM on Haiku. Batch 5 in parallel, pause 6s between batches.
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

const results = [];
for (let i = 0; i < posts.length; i += BATCH) {
  const slice = posts.slice(i, i + BATCH);
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
  results.push(...out);
  console.log(`  ${Math.min(i + BATCH, posts.length)}/${posts.length}`);
  if (i + BATCH < posts.length) await sleep(BATCH_PAUSE_MS);
}

// Flatten: one record per event
const events = [];
for (const { post, result } of results) {
  if (!result.is_event) continue;
  for (const e of result.events || []) {
    events.push({
      ...e,
      club_handle: post.ownerUsername,
      source_post_id: post.shortCode,
      source_url: post.url,
      source_posted_at: post.timestamp,
    });
  }
}

events.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

writeFileSync(resolve(ROOT, "data/events.json"), JSON.stringify(events, null, 2));
console.log(`\nExtracted ${events.length} events → data/events.json`);

// May 2026 summary
const may = events.filter((e) => (e.start_date || "").startsWith("2026-05"));
console.log(`\n${may.length} events in May 2026:`);
for (const e of may) {
  const t = e.start_time ? ` ${e.start_time}` : "";
  const d = e.distance_km ? ` · ${e.distance_km}km` : "";
  const mp = e.meeting_point ? ` · ${e.meeting_point}` : "";
  console.log(`  ${e.start_date}${t}  @${e.club_handle}  ${e.title}${d}${mp}`);
}
