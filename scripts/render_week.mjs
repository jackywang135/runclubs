// Renders the next 7 days of events into a Markdown digest.
// Input: data/events.json. Output: data/weeks/YYYY-Www.md + .json
//
// Run: node scripts/render_week.mjs
// Optional: --from=YYYY-MM-DD to override the window start (else today, TW tz)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const arg = process.argv.find((a) => a.startsWith("--from="));
// Today's calendar date in Taipei (YYYY-MM-DD), no DST.
const fromStr = arg
  ? arg.slice(7)
  : new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
const [fy, fm, fd] = fromStr.split("-").map(Number);
const from = new Date(Date.UTC(fy, fm - 1, fd));
const to = new Date(from);
to.setUTCDate(to.getUTCDate() + 7);
const toStr = to.toISOString().slice(0, 10);

// ISO week label e.g. 2026-W18
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
const weekLabel = isoWeek(from);

const events = JSON.parse(readFileSync(resolve(ROOT, "data/events.json"), "utf8"));

// --- Infer city from meeting_point ---
function inferCity(e) {
  const mp = (e.meeting_point || "") + " " + (e.notes || "");
  if (/台中|Taichung|NYCU|廣天宮/.test(mp)) return "Taichung";
  if (/高雄|Kaohsiung|蓮池潭/.test(mp)) return "Kaohsiung";
  if (/新竹|Hsinchu/.test(mp)) return "Hsinchu";
  if (/台南|Tainan/.test(mp)) return "Tainan";
  // default assumption: Taipei for our pilot list
  return "Taipei";
}

// --- Filter + dedupe ---
const CLUB_SET = new Set(
  (readFileSync(resolve(ROOT, "clubs.yml"), "utf8").match(/handle:\s*(\S+)/g) || []).map(
    (l) => l.split(":")[1].trim(),
  ),
);

const ONLY_TAIPEI = true;

const inWindow = events.filter((e) => {
  if (!e.start_date) return false;
  if (e.start_date < fromStr || e.start_date >= toStr) return false;
  if ((e.confidence ?? 0) < 0.6) return false;
  if (ONLY_TAIPEI && inferCity(e) !== "Taipei") return false;
  return true;
});

// Dedupe: same date+time+rounded-distance = merge, prefer tracked-club poster
function dedupeKey(e) {
  const d = e.distance_km ? Math.round(e.distance_km) : "x";
  const t = (e.start_time || "").slice(0, 5);
  return `${e.start_date}|${t}|${d}`;
}
const groups = new Map();
for (const e of inWindow) {
  const k = dedupeKey(e);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const deduped = [];
for (const group of groups.values()) {
  // Prefer the entry whose club_handle is in our tracked list
  group.sort((a, b) => {
    const ai = CLUB_SET.has(a.club_handle) ? 0 : 1;
    const bi = CLUB_SET.has(b.club_handle) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return (b.confidence || 0) - (a.confidence || 0);
  });
  const primary = group[0];
  const extraSources = group.slice(1).map((g) => ({
    club_handle: g.club_handle,
    source_url: g.source_url,
  }));
  deduped.push({ ...primary, also_posted_by: extraSources });
}

deduped.sort((a, b) =>
  (a.start_date + (a.start_time || "99:99")).localeCompare(
    b.start_date + (b.start_time || "99:99"),
  ),
);

// --- Render Markdown ---
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${m}/${d}`;
}

let md = `# Taipei Run Clubs — Week of ${fmtDate(fromStr)} (${weekLabel})\n\n`;
md += `_${deduped.length} events across ${new Set(deduped.map((e) => e.club_handle)).size} clubs. `;
md += `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC._\n\n`;

if (!deduped.length) {
  md += `No events found in the window ${fromStr} → ${toStr}.\n`;
  md += `Check that the scraper ran recently.\n`;
} else {
  // Group by date
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

md += `\n---\n\n`;
md += `### Tracked clubs\n\n`;
for (const h of CLUB_SET) {
  md += `- [@${h}](https://www.instagram.com/${h}/)\n`;
}

// --- Write ---
mkdirSync(resolve(ROOT, "data/weeks"), { recursive: true });
const mdPath = resolve(ROOT, `data/weeks/${weekLabel}.md`);
const jsonPath = resolve(ROOT, `data/weeks/${weekLabel}.json`);
writeFileSync(mdPath, md);
writeFileSync(jsonPath, JSON.stringify({ weekLabel, from: fromStr, to: toStr, events: deduped }, null, 2));

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(`\n${deduped.length} events in ${fromStr} → ${toStr}`);
