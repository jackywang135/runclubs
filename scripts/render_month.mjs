// Renders a full calendar month view of events → data/months/YYYY-MM.md (+ .json)
// Default target month: the current month in Asia/Taipei.
// Override with --month=YYYY-MM (e.g. --month=2026-05).
//
// Run: node scripts/render_month.mjs
//      node scripts/render_month.mjs --month=2026-05

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const arg = process.argv.find((a) => a.startsWith("--month="));
const todayTw = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
  new Date(),
);
const monthKey = arg ? arg.slice(8) : todayTw.slice(0, 7); // e.g. "2026-05"
const [yy, mm] = monthKey.split("-").map(Number);
const fromStr = `${monthKey}-01`;
const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
const toStr = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

const events = JSON.parse(readFileSync(resolve(ROOT, "data/events.json"), "utf8"));

function inferCity(e) {
  const mp = (e.meeting_point || "") + " " + (e.notes || "");
  if (/台中|Taichung|NYCU|廣天宮/.test(mp)) return "Taichung";
  if (/高雄|Kaohsiung|蓮池潭/.test(mp)) return "Kaohsiung";
  if (/新竹|Hsinchu/.test(mp)) return "Hsinchu";
  if (/台南|Tainan/.test(mp)) return "Tainan";
  return "Taipei";
}

const CLUB_SET = new Set(
  (readFileSync(resolve(ROOT, "clubs.yml"), "utf8").match(/handle:\s*(\S+)/g) || []).map(
    (l) => l.split(":")[1].trim(),
  ),
);

const ONLY_TAIPEI = true;

const inMonth = events.filter((e) => {
  if (!e.start_date) return false;
  if (e.start_date < fromStr || e.start_date > toStr) return false;
  if ((e.confidence ?? 0) < 0.6) return false;
  if (ONLY_TAIPEI && inferCity(e) !== "Taipei") return false;
  return true;
});

// Dedupe: same date+time+rounded-distance = one event, prefer tracked-club poster.
function dedupeKey(e) {
  const d = e.distance_km ? Math.round(e.distance_km) : "x";
  const t = (e.start_time || "").slice(0, 5);
  return `${e.start_date}|${t}|${d}`;
}
const groups = new Map();
for (const e of inMonth) {
  const k = dedupeKey(e);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const deduped = [];
for (const group of groups.values()) {
  group.sort((a, b) => {
    const ai = CLUB_SET.has(a.club_handle) ? 0 : 1;
    const bi = CLUB_SET.has(b.club_handle) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return (b.confidence || 0) - (a.confidence || 0);
  });
  const primary = group[0];
  const extraSources = group
    .slice(1)
    .filter((g) => g.club_handle !== primary.club_handle)
    .map((g) => ({ club_handle: g.club_handle, source_url: g.source_url }));
  deduped.push({ ...primary, also_posted_by: extraSources });
}

deduped.sort((a, b) =>
  (a.start_date + (a.start_time || "99:99")).localeCompare(
    b.start_date + (b.start_time || "99:99"),
  ),
);

// --- Render ---
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${m}/${d}`;
}

const clubCount = new Set(deduped.map((e) => e.club_handle)).size;
const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

let md = `# Taipei Run Clubs — ${MONTHS[mm - 1]} ${yy}\n\n`;
md += `_${deduped.length} events across ${clubCount} clubs. `;
md += `Generated ${generatedAt} UTC._\n\n`;
md += `Window: ${fromStr} → ${toStr}\n\n`;

if (!deduped.length) {
  md += `No events yet for ${MONTHS[mm - 1]} ${yy}.\n\n`;
  md += `Clubs typically post 1–2 weeks ahead. The daily scraper will backfill as they announce.\n`;
} else {
  const byDate = new Map();
  for (const e of deduped) {
    if (!byDate.has(e.start_date)) byDate.set(e.start_date, []);
    byDate.get(e.start_date).push(e);
  }
  const sortedDates = [...byDate.keys()].sort();
  for (const date of sortedDates) {
    md += `## ${fmtDate(date)}\n\n`;
    for (const e of byDate.get(date)) {
      const time = e.start_time ? `**${e.start_time}**` : "_time TBD_";
      const title = e.title || "(untitled run)";
      const dist = e.distance_km ? ` · ${e.distance_km}km` : "";
      const pace = e.pace ? ` · ${e.pace}` : "";
      const mp = e.meeting_point ? ` · 📍 ${e.meeting_point}` : "";
      md += `- ${time} — **${title}**${dist}${pace}${mp}  \n`;
      md += `  by [@${e.club_handle}](https://www.instagram.com/${e.club_handle}/) · [post](${e.source_url})`;
      if (e.also_posted_by?.length) {
        const others = e.also_posted_by
          .map((x) => `[@${x.club_handle}](${x.source_url})`)
          .join(", ");
        md += ` · also posted by ${others}`;
      }
      md += `\n`;
      if (e.notes) md += `  > ${e.notes}\n`;
      md += `\n`;
    }
  }
}

md += `\n---\n\n### Tracked clubs\n\n`;
for (const h of CLUB_SET) md += `- [@${h}](https://www.instagram.com/${h}/)\n`;

mkdirSync(resolve(ROOT, "data/months"), { recursive: true });
const mdPath = resolve(ROOT, `data/months/${monthKey}.md`);
const jsonPath = resolve(ROOT, `data/months/${monthKey}.json`);
writeFileSync(mdPath, md);
writeFileSync(
  jsonPath,
  JSON.stringify({ month: monthKey, from: fromStr, to: toStr, events: deduped }, null, 2),
);

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(`${deduped.length} events in ${monthKey}`);
