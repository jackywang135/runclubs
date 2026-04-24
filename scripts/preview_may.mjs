// Cheap local filter: flag posts whose caption mentions a May date.
// Stopgap until Haiku extraction works.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const posts = JSON.parse(readFileSync(resolve(ROOT, "data/posts.json"), "utf8"));

// Patterns that plausibly mean "some day in May": 5/1 .. 5/31, 5月1..31, May 1..31
const MAY_RX = [
  /\b5\s*[\/\-]\s*([1-9]|[12]\d|3[01])\b/,
  /5\s*月\s*([1-9]|[12]\d|3[01])\s*[日號号]?/,
  /\bMay\s+([1-9]|[12]\d|3[01])\b/i,
];

const hits = [];
for (const p of posts) {
  const caption = p.caption || "";
  for (const rx of MAY_RX) {
    const m = caption.match(rx);
    if (m) {
      hits.push({ post: p, match: m[0] });
      break;
    }
  }
}

console.log(`Found ${hits.length} posts mentioning a May date:\n`);
for (const { post, match } of hits) {
  const posted = post.timestamp ? new Date(post.timestamp).toISOString().slice(0, 10) : "?";
  console.log(`──── @${post.ownerUsername}  posted ${posted}  match: "${match}"`);
  console.log(`     ${post.url}`);
  console.log(`     ${(post.caption || "").replace(/\s+/g, " ").slice(0, 400)}\n`);
}
