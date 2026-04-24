# Run Clubs TW — End-to-End Plan

## Goal
Aggregate Taipei run-club events (sourced from each club's Instagram), surface
them on a simple web app, push a weekly newsletter, and auto-generate social
posts to drive discovery.

## Stack (opinionated, optimise for solo dev speed)
- **Web + API**: Next.js 15 (App Router) on Vercel
- **DB**: Postgres on Neon (free tier)
- **ORM**: Drizzle (TS-first, lightweight)
- **Scraper**: Apify `apify/instagram-scraper` actor via REST API
- **LLM extractor**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) via Anthropic SDK,
  with prompt caching on the system prompt
- **Scheduling**: Vercel Cron (daily scrape, weekly newsletter)
- **Email**: Resend + React Email templates
- **Auth (admin only, later)**: Clerk or a shared password env var for v1

## Data model

```
clubs
  handle (pk)          e.g. "wrc_taipei"
  name
  city                 default "Taipei"
  ig_url
  active               bool
  last_scraped_at
  bio                  filled from IG on first scrape

posts
  id (pk)              IG shortcode
  club_handle (fk)
  caption
  posted_at
  permalink
  media_urls           jsonb
  raw                  jsonb (full Apify payload)
  processed_at         null = pending extraction

events
  id (pk)              uuid
  club_handle (fk)
  source_post_id (fk)
  title
  starts_at            timestamptz (TW time)
  ends_at              nullable
  meeting_point        text
  meeting_point_geo    nullable (lat/lng) — geocode later
  distance_km          nullable
  pace                 e.g. "5:30/km" or "easy"
  language             zh | en | both
  description
  confidence           0-1 from extractor
  status               pending_review | published | rejected
  created_at

subscribers
  email (pk)
  confirmed_at
  unsubscribed_at
  city_filter          default "Taipei"
```

## Pipeline

### Daily — `/api/cron/scrape` (1x per day)
1. For each `clubs.active`, call Apify actor → last 10 posts.
2. Upsert into `posts` (idempotent on IG shortcode).
3. For each post where `processed_at IS NULL`:
   - Haiku prompt: `caption → {is_event: bool, events: [...]}` JSON.
   - Insert into `events` with `status=pending_review` if confidence < 0.8,
     else `published`.
4. Dedupe: same `club_handle` + `starts_at` within 1h → merge.
5. Set `processed_at`.

### Weekly — `/api/cron/newsletter` (Sunday 8pm TW)
1. Select `events where starts_at between now and now+7d AND status=published`.
2. Group by day, render React Email template.
3. Send via Resend to all `confirmed_at IS NOT NULL`.

### On-demand — social content
- Same weekly query → template a Threads/IG carousel caption → push to
  clipboard / Buffer / Threads API (Threads has a public API; IG posting
  needs a business account).

## Web surfaces

```
/                      This week's events (default) + filters: day, club, distance
/events/[id]           Event detail + link back to source IG post
/clubs                 The 8 clubs, avatars, next event
/clubs/[handle]        Club page: upcoming + past events
/subscribe             Email capture → confirmation email
/admin                 Review pending_review events, toggle clubs (password gate)
```

## Build phases

### Phase 1 — Scraper + extractor (no UI yet)
- Next.js scaffold, Drizzle + Neon
- `clubs.yml` → `clubs` table (seed script)
- `scripts/scrape.ts`: Apify fetch → `posts`
- `scripts/extract.ts`: Haiku pass over unprocessed posts → `events`
- Run manually, inspect DB with Drizzle Studio.
**Done when:** after one run, `events` has real upcoming events from 3+ clubs.

### Phase 2 — Web app
- `/` homepage: this week's events
- `/clubs/[handle]` pages
- Deploy to Vercel, wire Vercel Cron for daily scrape.
**Done when:** a stranger opens the URL and sees a usable event list.

### Phase 3 — Newsletter
- `/subscribe` page + double opt-in
- Weekly cron + Resend
**Done when:** test email arrives with the week's events rendered nicely.

### Phase 4 — Admin + social
- Password-gated `/admin` to review low-confidence extractions
- Threads API auto-post on Sunday
- (Later) IG carousel auto-post

## Open questions / things to decide before Phase 1
1. **Apify budget** — at ~$0.30/1k posts, 8 clubs × 10 posts × daily ≈ pennies.
   Acceptable.
2. **Extractor prompt** — needs a few real captions to tune. Sample 10 posts
   from current clubs, hand-label, iterate.
3. **Timezone** — store UTC, render Asia/Taipei. All IG timestamps are UTC.
4. **Event deduplication across clubs** — two clubs co-hosting one run. Defer
   to Phase 4.
5. **Domain** — needed before newsletter (Resend needs a verified sender).

## What I need from you to start Phase 1
- Apify API token (free tier gives $5 credit — enough for weeks)
- Anthropic API key
- Neon project (I can walk you through signup, ~2 min)
- Confirm Next.js + Drizzle + Postgres is ok, or you have a preferred stack
