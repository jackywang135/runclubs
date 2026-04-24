# Taiwan Run Clubs — Instagram Research (initial)

Seed list for the aggregator. Handles confirmed via web search; meeting times/
locations should be re-verified by scraping each IG before ingesting.

## Taipei (北部)

| Club | IG handle | Notes |
|---|---|---|
| Wonder Running Club | [@wrc_taipei](https://www.instagram.com/wrc_taipei/) | "WE RUN THE CITY" — community crew, ~4k followers |
| Garmin Run Club Taiwan | [@garmingrctw](https://www.instagram.com/garmingrctw/) | Brand-run, ~19k followers, science-based training sessions |
| HeyRunning Taipei | [@heyrunning_taipei](https://www.instagram.com/heyrunning_taipei/) | Tue/Thu 7:25pm (Taipei Arena / Tianmu Baseball Stadium). Since 2011, intl+local |
| Wave Taipei | [@wave_taipei](https://www.instagram.com/wave_taipei/) | Community run crew |
| Rock 'n' Roll Taipei | [@rnrtaipei](https://www.instagram.com/rnrtaipei/) | Race series (music + run + market) |
| Panasonic 台北城市路跑賽 | [@panasonic_taipei_city_run](https://www.instagram.com/panasonic_taipei_city_run/) | Annual race organiser |
| Edison Running Course 愛迪生跑步訓練班 | [@edrc.taiwan](https://www.instagram.com/edrc.taiwan/) | Training + race planning |
| 麒跑步運動訓練 (Kobe Run Club) | [@kobe_run_club](https://www.instagram.com/kobe_run_club/) | Classes across Taipei/New Taipei/Taoyuan/Zhongli/Hsinchu |
| 森林跑站 RunBase | [@runbasetw](https://www.instagram.com/runbasetw/) | Runner hub — training, gear, classes, ~11k followers |
| 運動筆記 (aggregator/media) | [@running.biji](https://www.instagram.com/running.biji/) | Media account (not a club) — useful for event listings, 92k |
| Brooks Running Taiwan | [@brooksrunningtw](https://www.instagram.com/brooksrunningtw/) | Brand, hosts weekly runs |
| On Running Official Partner TW | [@orp_taiwan](https://www.instagram.com/orp_taiwan/) | Brand, hosts runs / events, ~25k |

### Taipei (FB-primary, IG unknown — verify)
- Taipei Running Community (FB group)
- adidas Runners Taipei (FB group)
- Runivore — Tuesday night LSD from Gonguan MRT waterfront
- Taipei Hash House Harriers (expat)
- TS WOMEN RUN (@WomenRunTPE on FB)
- 大佳路跑團 (Strava club 208126; Tue/Thu 6:50pm night run)
- TAIPEI RUNNING CLUB (Strava club 164926, Wenshan)
- DHRC 夢想高飛跑團 (FB)
- 妹子陪跑團

## Kaohsiung (高雄)
| Club | IG handle | Notes |
|---|---|---|
| Nordic Tigon Run Club Kaohsiung | [@nordictigon.runclub.kaohsiung](https://www.instagram.com/nordictigon.runclub.kaohsiung/) | — |
| 閃耀跑團 Shine Running Club | (FB: SNRC.TW.KHH) — IG TBD | Training + coaching |

## Taichung (台中)
- No IG-first clubs confirmed yet. Next step: search IG directly with hashtags
  `#台中跑團`, `#台中夜跑`, `#taichungrunning`.

## Tainan (台南)
- Not yet surfaced. Same hashtag approach needed.

## Other / Nationwide
- `beiyirunrun` — [@beiyirunrun](https://www.instagram.com/beiyirunrun/) — context TBD

---

## Gaps to fill before building the scraper

1. **Verify each IG is active** (last post < 30 days) and public.
2. **Expand south/central Taiwan** — current list is Taipei-heavy.
3. **Decide data model**: club → events (date, time, location, pace group, meeting
   point, distance, language).
4. **Decide source of truth per club**: IG post caption? IG story? Linked
   Google form / Linktree? Each club posts events differently — this is the
   hard part of the aggregator, not the handle discovery.
5. **Consider complementary sources**: Facebook groups (Taipei Running
   Community, adidas Runners Taipei), Strava club calendars, Meetup
   (HeyRunning), 運動筆記 iRunner (biji.co).
