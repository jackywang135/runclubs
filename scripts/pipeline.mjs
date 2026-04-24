// Full pipeline: scrape → extract (incremental) → render week → render month.
//
// Run: node scripts/pipeline.mjs

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function step(name, script, args = []) {
  console.log(`\n════ ${name} ═══════════════════════════════\n`);
  const r = spawnSync("node", [resolve(__dirname, script), ...args], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`${name} failed with exit ${r.status}`);
    process.exit(r.status || 1);
  }
}

step("1/4 scrape", "scrape.mjs");
step("2/4 extract (incremental)", "extract.mjs");
step("3/4 render week", "render_week.mjs");
step("4/4 render month", "render_month.mjs");

console.log(`\n✓ Pipeline complete`);
