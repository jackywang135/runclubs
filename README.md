# Run Clubs TW

Weekly aggregator for Taipei run-club events. Pulls posts from each club's
Instagram via Apify, extracts structured events with Claude Haiku, and renders
a Markdown digest for the coming week.

## Layout

```
clubs.yml               Seed list of IG handles
scripts/
  scrape.mjs            Apify → data/posts.json
  extract.mjs           Haiku → data/events.json (incremental; --full to force)
  render_week.mjs       data/events.json → data/weeks/YYYY-Www.md
  render_month.mjs      data/events.json → data/months/YYYY-MM.md
  pipeline.mjs          Orchestrator (scrape → extract → render week & month)
  preview_may.mjs       Regex-only stopgap (no LLM)
data/
  posts.json            Raw scraped posts (gitignored)
  events.json           Extracted events (gitignored)
  seen_posts.json       Which post IDs we've LLM-processed (committed)
  weeks/                Per-week digests (committed)
  months/               Per-month digests (committed)
ops/
  *.plist               macOS launchd schedule
research/               Manual research notes
.env                    APIFY_TOKEN, ANTHROPIC_API_KEY (gitignored)
```

## Manual run

```bash
node scripts/pipeline.mjs                        # full pipeline (scrape → extract → render)
node scripts/extract.mjs --full                  # force re-extract every post
node scripts/render_week.mjs                     # re-render this week's digest
node scripts/render_week.mjs --from=2026-05-05   # custom week window
node scripts/render_month.mjs --month=2026-05    # specific month digest
```

## Schedule

The GitHub Actions workflow `.github/workflows/daily.yml` runs every day at
12:00 UTC (20:00 Asia/Taipei), scrapes incrementally, and commits any new
digests back to `main`.

## Schedule weekly

```bash
# Install the LaunchAgent (runs Sunday 20:00 local time)
cp ops/com.jacky.runclubs.weekly.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jacky.runclubs.weekly.plist

# Verify it's scheduled
launchctl list | grep runclubs

# Remove
launchctl unload ~/Library/LaunchAgents/com.jacky.runclubs.weekly.plist
```

Caveat: launchd only fires when the Mac is awake. If reliability matters, move
to GitHub Actions (`.github/workflows/weekly.yml`) or Vercel Cron.
