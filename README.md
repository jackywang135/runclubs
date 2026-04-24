# Run Clubs TW

Weekly aggregator for Taipei run-club events. Pulls posts from each club's
Instagram via Apify, extracts structured events with Claude Haiku, and renders
a Markdown digest for the coming week.

## Layout

```
clubs.yml               Seed list of IG handles
scripts/
  scrape.mjs            Apify → data/posts.json
  extract.mjs           Haiku → data/events.json
  render_week.mjs       data/events.json → data/weeks/YYYY-Www.md
  weekly.mjs            Orchestrator (scrape → extract → render)
  preview_may.mjs       Regex-only stopgap for May dates (no LLM)
data/
  posts.json            Raw scraped posts
  events.json           Extracted events (all dates)
  weeks/                Per-week digests, md + json
ops/
  *.plist               macOS launchd schedule
research/               Manual research notes
.env                    APIFY_TOKEN, ANTHROPIC_API_KEY (gitignored)
```

## Manual run

```bash
node scripts/weekly.mjs        # full pipeline
node scripts/render_week.mjs   # only re-render digest from existing events
node scripts/render_week.mjs --from=2026-05-05   # custom week window
```

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
