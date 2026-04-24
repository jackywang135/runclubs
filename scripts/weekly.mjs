// Weekly orchestrator: scrape → extract → render.
// Run: node scripts/weekly.mjs

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function step(name, script) {
  console.log(`\n════ ${name} ═══════════════════════════════\n`);
  const r = spawnSync("node", [resolve(__dirname, script)], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`${name} failed with exit ${r.status}`);
    process.exit(r.status || 1);
  }
}

step("1/3 scrape", "scrape.mjs");
step("2/3 extract", "extract.mjs");
step("3/3 render", "render_week.mjs");

console.log(`\n✓ Weekly pipeline complete`);
